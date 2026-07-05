/**
 * Compute cross-exchange spreads, both gross and net of taker fees.
 *
 * For each pair we consider every buy-exchange/sell-exchange combination and
 * keep the one with the best NET spread:
 *
 *   grossPct = (sellPrice - buyPrice) / buyPrice * 100
 *   netPct   = grossPct - buyFeePct - sellFeePct
 *
 * This matters because the cheapest exchange is not always the best buy side
 * once fees are included (e.g. a slightly pricier exchange with a lower fee).
 *
 * @param {Array<Map<pair, {exchange, pair, price, ts}>>} exchangeResults
 *   One Map per healthy exchange.
 * @param {string[]} pairs Enabled pairs.
 * @param {Record<string, number>} fees Taker fee (%) per exchange name.
 * @returns {Array<{pair, buy, sell, grossPct, feePct, netPct, exchangeCount, ts}>}
 */
export function computeSpreads(exchangeResults, pairs, fees = {}) {
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

    let best = null
    for (const buy of quotes) {
      for (const sell of quotes) {
        if (buy === sell || sell.price <= buy.price) continue
        const grossPct = ((sell.price - buy.price) / buy.price) * 100
        const feePct = (fees[buy.exchange] ?? 0) + (fees[sell.exchange] ?? 0)
        const netPct = grossPct - feePct
        if (!best || netPct > best.netPct) {
          best = { buy, sell, grossPct, feePct, netPct }
        }
      }
    }

    // All prices identical or every combination loses to fees with no gross
    // edge at all — fall back to a flat entry so the pair still shows up.
    if (!best) {
      const q = quotes[0]
      const feePct = (fees[q.exchange] ?? 0) * 2
      best = { buy: q, sell: q, grossPct: 0, feePct, netPct: -feePct }
    }

    spreads.push({
      pair,
      buy: { exchange: best.buy.exchange, price: best.buy.price },
      sell: { exchange: best.sell.exchange, price: best.sell.price },
      grossPct: best.grossPct,
      feePct: best.feePct,
      netPct: best.netPct,
      exchangeCount: quotes.length,
      ts,
    })
  }

  return spreads
}
