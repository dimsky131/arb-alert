import { fetchJson } from '../../utils/http.js'

export const name = 'OKX'

// "BTC/USDT" -> "BTC-USDT"
function toInstId(pair) {
  return pair.replace('/', '-')
}

/**
 * Fetch all spot tickers in one request and pick out the requested pairs.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const url = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT'
  const data = await fetchJson(url, { label: 'okx' })

  if (data.code !== '0' || !Array.isArray(data.data)) {
    throw new Error(`okx: unexpected response (code=${data.code})`)
  }

  const byInstId = new Map(data.data.map((t) => [t.instId, Number.parseFloat(t.last)]))
  const result = new Map()
  const ts = Date.now()
  for (const pair of pairs) {
    const price = byInstId.get(toInstId(pair))
    if (Number.isFinite(price) && price > 0) {
      result.set(pair, { exchange: name, pair, price, ts })
    }
  }
  return result
}
