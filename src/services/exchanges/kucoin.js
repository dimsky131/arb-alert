import { fetchJson } from '../../utils/http.js'

export const name = 'KuCoin'

// "BTC/USDT" -> "BTC-USDT"
function toSymbol(pair) {
  return pair.replace('/', '-')
}

/**
 * Fetch all spot tickers in one request and pick out the requested pairs.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const url = 'https://api.kucoin.com/api/v1/market/allTickers'
  const data = await fetchJson(url, { label: 'kucoin', timeoutMs: 8000 })

  if (data.code !== '200000' || !data.data?.ticker) {
    throw new Error(`kucoin: unexpected response (code=${data.code})`)
  }

  const bySymbol = new Map(data.data.ticker.map((t) => [t.symbol, Number.parseFloat(t.last)]))
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
