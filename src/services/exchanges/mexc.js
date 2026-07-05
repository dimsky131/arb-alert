import { fetchJson } from '../../utils/http.js'

export const name = 'MEXC'

// "BTC/USDT" -> "BTCUSDT"
function toSymbol(pair) {
  return pair.replace('/', '')
}

/**
 * Fetch all spot tickers in one request and pick out the requested pairs.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const url = 'https://api.mexc.com/api/v3/ticker/price'
  const data = await fetchJson(url, { label: 'mexc', timeoutMs: 8000 })

  if (!Array.isArray(data)) {
    throw new Error('mexc: unexpected response')
  }

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
