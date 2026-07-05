import { config } from '../config.js'
import { fetchJson } from '../utils/http.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('universe')

// Stablecoins and wrapped assets excluded from the arbitrage universe —
// their "spreads" are noise, not opportunity.
const EXCLUDED_BASES = new Set([
  'USDC', 'TUSD', 'FDUSD', 'BUSD', 'DAI', 'USDP', 'USDE', 'USD1', 'XUSD',
  'EUR', 'EURI', 'GBP', 'TRY', 'AEUR', 'PYUSD', 'WBTC', 'WBETH', 'WETH',
])

const BINANCE_HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision']

let pairs = [...config.fallbackPairs]
let updatedAt = null
let source = 'fallback'
let timer = null

function isLeveragedToken(base) {
  return /(?:UP|DOWN|BULL|BEAR|[23-5][LS])$/.test(base) && base.length > 4
}

/**
 * Fetch the top-N USDT spot pairs by 24h quote volume from Binance.
 * Binance is used as the reference universe because it has the deepest
 * liquidity; other exchanges simply won't quote pairs they don't list.
 */
async function fetchTopPairs() {
  let data
  let lastError
  for (const host of BINANCE_HOSTS) {
    try {
      data = await fetchJson(`${host}/api/v3/ticker/24hr`, { label: 'universe', timeoutMs: 15000, retries: 1 })
      break
    } catch (err) {
      lastError = err
    }
  }
  if (!data) throw lastError

  return data
    .filter((t) => t.symbol.endsWith('USDT'))
    .map((t) => ({ base: t.symbol.slice(0, -4), quoteVolume: Number.parseFloat(t.quoteVolume) }))
    .filter(
      (t) =>
        t.base.length > 0 &&
        Number.isFinite(t.quoteVolume) &&
        t.quoteVolume > 0 &&
        !EXCLUDED_BASES.has(t.base) &&
        !isLeveragedToken(t.base),
    )
    .sort((a, b) => b.quoteVolume - a.quoteVolume)
    .slice(0, config.topPairsCount)
    .map((t) => `${t.base}/USDT`)
}

export async function refreshUniverse() {
  try {
    const top = await fetchTopPairs()
    if (top.length >= 10) {
      pairs = top
      updatedAt = Date.now()
      source = 'binance-24h-volume'
      log.info('universe refreshed', { pairs: pairs.length })
    } else {
      log.warn('universe refresh returned too few pairs, keeping current', { got: top.length })
    }
  } catch (err) {
    log.warn('universe refresh failed, keeping current universe', String(err?.message || err))
  }
}

export function getUniverse() {
  return { pairs, updatedAt, source, count: pairs.length }
}

export function getPairs() {
  return pairs
}

export function startUniverseRefresh() {
  // Refresh immediately on boot, then periodically.
  refreshUniverse()
  timer = setInterval(refreshUniverse, config.universeRefreshMs)
  timer.unref?.()
}

export function stopUniverseRefresh() {
  if (timer) clearInterval(timer)
}
