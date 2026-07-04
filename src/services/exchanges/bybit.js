import { fetchJson } from '../../utils/http.js'

export const name = 'Bybit'

// "BTC/USDT" -> "BTCUSDT"
function toSymbol(pair) {
  return pair.replace('/', '')
}

/**
 * Fetch all spot tickers in one request and pick out the requested pairs.
 * Returns Map<pair, { exchange, pair, price, ts }>
 */
export async function fetchPrices(pairs) {
  const url = 'https://api.bybit.com/v5/market/tickers?category=spot'
  const data = await fetchJson(url, { label: 'bybit' })

  if (data.retCode !== 0 || !data.result?.list) {
    throw new Error(`bybit: unexpected response (retCode=${data.retCode})`)
  }

  const bySymbol = new Map(data.result.list.map((t) => [t.symbol, Number.parseFloat(t.lastPrice)]))
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
