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
 * SAFETY: real cross-exchange arbitrage spreads for liquid pairs are almost
 * always under a few percent. A "spread" far beyond that is not a real
 * opportunity — it's a sign of a ticker collision (the same symbol referring
 * to different assets on different exchanges), a stale/broken price feed, or
 * a wrong decimal somewhere upstream. We treat anything above
 * MAX_PLAUSIBLE_GROSS_PCT as bad data and drop it rather than alert on it.
 *
 * @param {Array<Map<pair, {exchange, pair, price, ts}>>} exchangeResults
 *   One Map per healthy exchange.
 * @param {string[]} pairs Enabled pairs.
 * @param {Record<string, number>} fees Taker fee (%) per exchange name.
 * @returns {Array<{pair, buy, sell, grossPct, feePct, netPct, exchangeCount, ts}>}
 */
const MAX_PLAUSIBLE_GROSS_PCT = 15

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

        // Discard implausible spreads (likely ticker collision or bad data
        // from a thin/mismatched market on one of the exchanges).
        if (grossPct > MAX_PLAUSIBLE_GROSS_PCT) continue

        const feePct = (fees[buy.exchange] ?? 0) + (fees[sell.exchange] ?? 0)
        const netPct = grossPct - feePct
        if (!best || netPct > best.netPct) {
          best = { buy, sell, grossPct, feePct, netPct }
        }
      }
    }

    // All prices identical, every combination was implausible, or every
    // combination loses to fees with no gross edge at all — fall back to a
    // flat entry so the pair still shows up in the dashboard.
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
