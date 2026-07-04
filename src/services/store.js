import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('store')

const SETTINGS_FILE = path.join(config.dataDir, 'settings.json')
const ALERTS_FILE = path.join(config.dataDir, 'alerts.json')

function defaultSettings() {
  const pairs = {}
  for (const pair of config.supportedPairs) pairs[pair] = true
  return {
    threshold: config.defaultThreshold,
    cooldownMinutes: config.defaultCooldownMinutes,
    pairs,
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
        pairs: { ...defaults.pairs, ...(savedSettings.pairs || {}) },
      }
      // Drop unknown pairs.
      for (const pair of Object.keys(this.settings.pairs)) {
        if (!config.supportedPairs.includes(pair)) delete this.settings.pairs[pair]
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
    return Object.entries(this.settings.pairs)
      .filter(([, enabled]) => enabled)
      .map(([pair]) => pair)
  }

  async updateSettings(patch) {
    const next = { ...this.settings }

    if (patch.threshold !== undefined) {
      const t = Number.parseFloat(patch.threshold)
      if (!Number.isFinite(t) || t <= 0 || t > 100) {
        throw new Error('threshold must be a number between 0 and 100')
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

    if (patch.pairs !== undefined) {
      if (typeof patch.pairs !== 'object' || patch.pairs === null) {
        throw new Error('pairs must be an object of { "PAIR": boolean }')
      }
      const pairs = { ...next.pairs }
      for (const [pair, enabled] of Object.entries(patch.pairs)) {
        if (config.supportedPairs.includes(pair)) {
          pairs[pair] = Boolean(enabled)
        }
      }
      next.pairs = pairs
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
