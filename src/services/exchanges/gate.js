import { fetchJson } from '../../utils/http.js'

export const name = 'Gate.io'

// "BTC/USDT" -> "BTC_USDT"
function toSymbol(pair) {
  return pair.replace('/', '_')
}

/**
 * Fetch all spot tickers in one request and pick out the requested pairs.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const url = 'https://api.gateio.ws/api/v4/spot/tickers'
  const data = await fetchJson(url, { label: 'gate', timeoutMs: 8000 })

  if (!Array.isArray(data)) {
    throw new Error('gate: unexpected response')
  }

  const bySymbol = new Map(data.map((t) => [t.currency_pair, Number.parseFloat(t.last)]))
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
