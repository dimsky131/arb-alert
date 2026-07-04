/**
 * Compute cross-exchange spreads.
 *
 * @param {Array<Map<pair, {exchange, pair, price, ts}>>} exchangeResults
 *   One Map per healthy exchange.
 * @param {string[]} pairs Enabled pairs.
 * @returns {Array<{pair, buy: {exchange, price}, sell: {exchange, price}, spreadPct, exchangeCount, ts}>}
 */
export function computeSpreads(exchangeResults, pairs) {
  const spreads = []
  const ts = Date.now()

  for (const pair of pairs) {
    const quotes = []
    for (const result of exchangeResults) {
      const quote = result.get(pair)
      if (quote) quotes.push(quote)
    }
    // Need at least 2 exchanges to compute a spread.
    if (quotes.length < 2) continue

    let min = quotes[0]
    let max = quotes[0]
    for (const q of quotes) {
      if (q.price < min.price) min = q
      if (q.price > max.price) max = q
    }

    const spreadPct = ((max.price - min.price) / min.price) * 100
    spreads.push({
      pair,
      buy: { exchange: min.exchange, price: min.price },
      sell: { exchange: max.exchange, price: max.price },
      spreadPct,
      exchangeCount: quotes.length,
      ts,
    })
  }

  return spreads
}
