import { config } from './config.js'
import * as binance from './services/exchanges/binance.js'
import * as bybit from './services/exchanges/bybit.js'
import * as okx from './services/exchanges/okx.js'
import { computeSpreads } from './services/spread.js'
import { store } from './services/store.js'
import * as telegram from './services/telegram.js'
import { createLogger } from './utils/logger.js'

const log = createLogger('engine')

const exchanges = [binance, bybit, okx]

// Live state exposed to the API layer.
export const state = {
  startedAt: Date.now(),
  lastTickAt: null,
  tickCount: 0,
  spreads: [],
  exchanges: Object.fromEntries(
    exchanges.map((ex) => [ex.name, { status: 'unknown', lastOkAt: null, lastError: null }]),
  ),
}

let stopped = false
let timer = null

async function tick() {
  const pairs = store.enabledPairs()
  const settings = store.getSettings()

  if (pairs.length === 0) {
    state.spreads = []
    state.lastTickAt = Date.now()
    return
  }

  // Fetch all exchanges in parallel; a failing exchange degrades rather than kills the tick.
  const results = await Promise.allSettled(exchanges.map((ex) => ex.fetchPrices(pairs)))

  const healthyResults = []
  results.forEach((result, i) => {
    const exName = exchanges[i].name
    const health = state.exchanges[exName]
    if (result.status === 'fulfilled') {
      health.status = 'ok'
      health.lastOkAt = Date.now()
      health.lastError = null
      healthyResults.push(result.value)
    } else {
      health.status = 'degraded'
      health.lastError = String(result.reason?.message || result.reason)
      log.warn(`${exName} degraded`, health.lastError)
    }
  })

  const spreads = computeSpreads(healthyResults, pairs)
  state.spreads = spreads
  state.lastTickAt = Date.now()
  state.tickCount++

  // Alerting
  for (const spread of spreads) {
    if (spread.spreadPct < settings.threshold) continue
    if (telegram.isOnCooldown(spread.pair, settings.cooldownMinutes)) continue

    const message = telegram.formatAlertMessage(spread)
    const delivered = await telegram.sendAlert(message)
    telegram.markAlerted(spread.pair)

    await store.addAlert({
      id: `${spread.pair}-${spread.ts}`,
      pair: spread.pair,
      buy: spread.buy,
      sell: spread.sell,
      spreadPct: Number(spread.spreadPct.toFixed(4)),
      threshold: settings.threshold,
      delivered,
      ts: spread.ts,
    })

    log.info('alert', { pair: spread.pair, spreadPct: spread.spreadPct.toFixed(2), delivered })
  }
}

async function loop() {
  if (stopped) return
  try {
    await tick()
  } catch (err) {
    log.error('tick failed', String(err?.message || err))
  }
  if (!stopped) {
    timer = setTimeout(loop, config.pollIntervalMs)
  }
}

export function startEngine() {
  log.info('starting', {
    pollIntervalMs: config.pollIntervalMs,
    pairs: store.enabledPairs(),
    threshold: store.getSettings().threshold,
    telegramConfigured: telegram.isConfigured(),
  })
  loop()
}

export function stopEngine() {
  stopped = true
  if (timer) clearTimeout(timer)
  log.info('stopped')
}
