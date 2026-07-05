import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { getPairs } from './universe.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('store')

const SETTINGS_FILE = path.join(config.dataDir, 'settings.json')
const ALERTS_FILE = path.join(config.dataDir, 'alerts.json')

function defaultSettings() {
  return {
    threshold: config.defaultThreshold,
    cooldownMinutes: config.defaultCooldownMinutes,
    // Taker fee (%) per exchange, applied to net-spread calculation.
    fees: { ...config.defaultFees },
    // The universe is dynamic (top pairs by volume), so we persist an
    // exclusion list instead of a fixed pair map.
    disabledPairs: [],
  }
}

function readJsonSync(file) {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    log.warn(`failed to read ${file}, using defaults`, String(err?.message || err))
    return null
  }
}

async function writeJsonAtomic(file, data) {
  try {
    await fsp.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
    await fsp.rename(tmp, file)
  } catch (err) {
    log.error(`failed to write ${file}`, String(err?.message || err))
  }
}

class Store {
  constructor() {
    this.settings = defaultSettings()
    this.alerts = []
    this.load()
  }

  load() {
    const savedSettings = readJsonSync(SETTINGS_FILE)
    if (savedSettings) {
      const defaults = defaultSettings()
      this.settings = {
        threshold: Number.isFinite(savedSettings.threshold) ? savedSettings.threshold : defaults.threshold,
        cooldownMinutes: Number.isFinite(savedSettings.cooldownMinutes)
          ? savedSettings.cooldownMinutes
          : defaults.cooldownMinutes,
        fees: { ...defaults.fees },
        disabledPairs: Array.isArray(savedSettings.disabledPairs)
          ? savedSettings.disabledPairs.filter((p) => typeof p === 'string')
          : [],
      }
      // Merge saved fee overrides for known exchanges only.
      if (savedSettings.fees && typeof savedSettings.fees === 'object') {
        for (const ex of Object.keys(defaults.fees)) {
          const v = Number.parseFloat(savedSettings.fees[ex])
          if (Number.isFinite(v) && v >= 0 && v <= 5) this.settings.fees[ex] = v
        }
      }
    }

    const savedAlerts = readJsonSync(ALERTS_FILE)
    if (Array.isArray(savedAlerts)) {
      this.alerts = savedAlerts.slice(0, config.maxAlertHistory)
    }
    log.info('store loaded', { threshold: this.settings.threshold, alerts: this.alerts.length })
  }

  getSettings() {
    return this.settings
  }

  enabledPairs() {
    const disabled = new Set(this.settings.disabledPairs)
    return getPairs().filter((pair) => !disabled.has(pair))
  }

  async updateSettings(patch) {
    const next = { ...this.settings, fees: { ...this.settings.fees } }

    if (patch.threshold !== undefined) {
      const t = Number.parseFloat(patch.threshold)
      if (!Number.isFinite(t) || t <= -10 || t > 100) {
        throw new Error('threshold must be a number between -10 and 100')
      }
      next.threshold = t
    }

    if (patch.cooldownMinutes !== undefined) {
      const c = Number.parseFloat(patch.cooldownMinutes)
      if (!Number.isFinite(c) || c < 0 || c > 1440) {
        throw new Error('cooldownMinutes must be a number between 0 and 1440')
      }
      next.cooldownMinutes = c
    }

    if (patch.fees !== undefined) {
      if (typeof patch.fees !== 'object' || patch.fees === null) {
        throw new Error('fees must be an object of { "Exchange": feePct }')
      }
      for (const [ex, raw] of Object.entries(patch.fees)) {
        if (!(ex in config.defaultFees)) continue
        const v = Number.parseFloat(raw)
        if (!Number.isFinite(v) || v < 0 || v > 5) {
          throw new Error(`fee for ${ex} must be a number between 0 and 5`)
        }
        next.fees[ex] = v
      }
    }

    if (patch.disabledPairs !== undefined) {
      if (!Array.isArray(patch.disabledPairs)) {
        throw new Error('disabledPairs must be an array of pair strings')
      }
      next.disabledPairs = patch.disabledPairs
        .filter((p) => typeof p === 'string' && /^[A-Z0-9]{1,15}\/USDT$/.test(p))
        .slice(0, 500)
    }

    this.settings = next
    await writeJsonAtomic(SETTINGS_FILE, this.settings)
    return this.settings
  }

  async addAlert(alert) {
    this.alerts.unshift(alert)
    if (this.alerts.length > config.maxAlertHistory) {
      this.alerts.length = config.maxAlertHistory
    }
    await writeJsonAtomic(ALERTS_FILE, this.alerts)
  }

  getAlerts(limit) {
    return limit ? this.alerts.slice(0, limit) : this.alerts
  }

  async flush() {
    await writeJsonAtomic(SETTINGS_FILE, this.settings)
    await writeJsonAtomic(ALERTS_FILE, this.alerts)
  }
}

export const store = new Store()
