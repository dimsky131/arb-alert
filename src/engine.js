import { config } from './config.js'
import * as binance from './services/exchanges/binance.js'
import * as bybit from './services/exchanges/bybit.js'
import * as okx from './services/exchanges/okx.js'
import * as kucoin from './services/exchanges/kucoin.js'
import * as gate from './services/exchanges/gate.js'
import * as mexc from './services/exchanges/mexc.js'
import { computeSpreads } from './services/spread.js'
import { store } from './services/store.js'
import * as telegram from './services/telegram.js'
import { startUniverseRefresh, stopUniverseRefresh } from './services/universe.js'
import { createLogger } from './utils/logger.js'

const log = createLogger('engine')

const exchanges = [binance, bybit, okx, kucoin, gate, mexc]

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

  const spreads = computeSpreads(healthyResults, pairs, settings.fees)
  state.spreads = spreads
  state.lastTickAt = Date.now()
  state.tickCount++

  // Alerting — threshold applies to the NET spread (after taker fees on both legs).
  for (const spread of spreads) {
    if (spread.netPct < settings.threshold) continue
    if (spread.buy.exchange === spread.sell.exchange) continue
    if (telegram.isOnCooldown(spread.pair, settings.cooldownMinutes)) continue

    const message = telegram.formatAlertMessage(spread)
    const delivered = await telegram.sendAlert(message)
    telegram.markAlerted(spread.pair)

    await store.addAlert({
      id: `${spread.pair}-${spread.ts}`,
      pair: spread.pair,
      buy: spread.buy,
      sell: spread.sell,
      grossPct: Number(spread.grossPct.toFixed(4)),
      feePct: Number(spread.feePct.toFixed(4)),
      netPct: Number(spread.netPct.toFixed(4)),
      threshold: settings.threshold,
      delivered,
      ts: spread.ts,
    })

    log.info('alert', { pair: spread.pair, netPct: spread.netPct.toFixed(2), delivered })
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
    pairs: store.enabledPairs().length,
    threshold: store.getSettings().threshold,
    telegramConfigured: telegram.isConfigured(),
  })
  startUniverseRefresh()
  loop()
}

export function stopEngine() {
  stopped = true
  if (timer) clearTimeout(timer)
  stopUniverseRefresh()
  log.info('stopped')
}
