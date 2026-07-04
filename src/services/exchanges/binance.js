import { fetchJson } from '../../utils/http.js'

export const name = 'Binance'

// "BTC/USDT" -> "BTCUSDT"
function toSymbol(pair) {
  return pair.replace('/', '')
}

// data-api.binance.vision is Binance's official public market-data mirror,
// used as a fallback when api.binance.com is unavailable (e.g. HTTP 451 geo-blocks).
const HOSTS = ['https://api.binance.com', 'https://data-api.binance.vision']

/**
 * Fetch spot prices for the given pairs in a single batched request.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const symbols = pairs.map(toSymbol)
  const query = `symbols=${encodeURIComponent(JSON.stringify(symbols))}`

  let data
  let lastError
  for (const host of HOSTS) {
    try {
      data = await fetchJson(`${host}/api/v3/ticker/price?${query}`, { label: 'binance', retries: 1 })
      break
    } catch (err) {
      lastError = err
    }
  }
  if (!data) throw lastError

  const bySymbol = new Map(data.map((t) => [t.symbol, Number.parseFloat(t.price)]))
  const result = new Map()
  const ts = Date.now()
  for (const pair of pairs) {
    const price = bySymbol.get(toSymbol(pair))
    if (Number.isFinite(price) && price > 0) {
      result.set(pair, { exchange: name, pair, price, ts })
    }
  }
  return result
}
