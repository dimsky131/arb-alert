/* Arb Alert dashboard: polls /api/state every 5s and renders. Vanilla JS, no build step. */

const els = {
  telegramStatus: document.getElementById('telegram-status'),
  lastTick: document.getElementById('last-tick'),
  exchangeHealth: document.getElementById('exchange-health'),
  spreadRows: document.getElementById('spread-rows'),
  pairCount: document.getElementById('pair-count'),
  pairSearch: document.getElementById('pair-search'),
  sortBtn: document.getElementById('sort-spread'),
  sortArrow: document.getElementById('sort-arrow'),
  settingsForm: document.getElementById('settings-form'),
  threshold: document.getElementById('threshold'),
  cooldown: document.getElementById('cooldown'),
  feeInputs: document.getElementById('fee-inputs'),
  toggleSearch: document.getElementById('toggle-search'),
  pairToggles: document.getElementById('pair-toggles'),
  settingsMsg: document.getElementById('settings-msg'),
  alertList: document.getElementById('alert-list'),
}

let settingsInitialized = false
let latestState = null
let sortDir = 'desc' // 'desc' = biggest net spread on top

function fmtPrice(p) {
  if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (p >= 1) return p.toLocaleString('en-US', { maximumFractionDigits: 4 })
  return p.toPrecision(4)
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

function renderSpreads() {
  if (!latestState) return
  const { spreads, settings } = latestState
  const query = els.pairSearch.value.trim().toUpperCase()

  let rows = spreads
  if (query) rows = rows.filter((s) => s.pair.includes(query))

  rows = [...rows].sort((a, b) => (sortDir === 'desc' ? b.netPct - a.netPct : a.netPct - b.netPct))

  els.pairCount.textContent = `(${spreads.length})`

  if (!rows.length) {
    els.spreadRows.innerHTML = `<tr><td colspan="6" class="empty">${spreads.length ? 'No pairs match your search.' : 'No spread data yet.'}</td></tr>`
    return
  }

  els.spreadRows.innerHTML = rows
    .map((s) => {
      const hot = s.netPct >= settings.threshold && s.buy.exchange !== s.sell.exchange ? ' class="hot"' : ''
      const netCls = s.netPct > 0 ? 'pos' : 'neg'
      return `<tr${hot}>
        <td>${s.pair}</td>
        <td>${fmtPrice(s.buy.price)} <span class="exchange-name">${s.buy.exchange}</span></td>
        <td>${fmtPrice(s.sell.price)} <span class="exchange-name">${s.sell.exchange}</span></td>
        <td class="num">${s.grossPct.toFixed(3)}%</td>
        <td class="num muted">-${s.feePct.toFixed(2)}%</td>
        <td class="num ${netCls}">${s.netPct.toFixed(3)}%</td>
      </tr>`
    })
    .join('')
}

function renderHealth(exchanges) {
  els.exchangeHealth.innerHTML = Object.entries(exchanges)
    .map(([name, h]) => {
      const cls = h.status === 'ok' ? 'ok' : h.status === 'degraded' ? 'warn' : ''
      return `<span class="pill ${cls}">${name}: ${h.status}</span>`
    })
    .join('')
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    els.alertList.innerHTML = '<li class="empty">No alerts yet.</li>'
    return
  }
  els.alertList.innerHTML = alerts
    .map((a) => {
      const net = a.netPct ?? a.spreadPct ?? 0
      const gross = a.grossPct !== undefined ? ` <span class="a-detail">(gross ${a.grossPct.toFixed(2)}%, fees ${a.feePct.toFixed(2)}%)</span>` : ''
      return `<li>
        <span class="a-pair">${a.pair}</span>
        <span class="a-spread">net ${net.toFixed(2)}%</span>${gross}
        <span class="a-detail">Buy ${a.buy.exchange} ${fmtPrice(a.buy.price)} &rarr; Sell ${a.sell.exchange} ${fmtPrice(a.sell.price)}</span>
        ${a.delivered ? '' : '<span class="a-undelivered">not delivered</span>'}
        <span class="a-time">${new Date(a.ts).toLocaleString('en-US', { hour12: false })}</span>
      </li>`
    })
    .join('')
}

function renderSettingsForm(state) {
  // Only populate inputs once (or after save) so we don't clobber in-progress edits.
  if (settingsInitialized) return
  const { settings, universe } = state
  els.threshold.value = settings.threshold
  els.cooldown.value = settings.cooldownMinutes

  els.feeInputs.innerHTML = Object.entries(settings.fees)
    .map(
      ([ex, fee]) => `<label class="fee-field">
        <span>${ex}</span>
        <input type="number" data-fee="${ex}" value="${fee}" step="0.01" min="0" max="5" />
      </label>`,
    )
    .join('')

  const disabled = new Set(settings.disabledPairs)
  els.pairToggles.innerHTML = universe.pairs
    .map(
      (pair) => `<label class="toggle" data-toggle-pair="${pair}">
        <input type="checkbox" data-pair="${pair}" ${disabled.has(pair) ? '' : 'checked'} />
        <span>${pair}</span>
      </label>`,
    )
    .join('')
  settingsInitialized = true
}

async function refresh() {
  try {
    const res = await fetch('/api/state')
    if (!res.ok) return
    const state = await res.json()
    latestState = state

    els.telegramStatus.textContent = `Telegram: ${state.telegramConfigured ? 'connected' : 'not configured'}`
    els.telegramStatus.className = `pill ${state.telegramConfigured ? 'ok' : 'warn'}`
    els.lastTick.textContent = `Last tick: ${state.lastTickAt ? fmtTime(state.lastTickAt) : '—'}`

    renderHealth(state.exchanges)
    renderSpreads()
    renderAlerts(state.alerts)
    renderSettingsForm(state)
  } catch {
    // network hiccup; next poll will recover
  }
}

// Sort arrow: toggles biggest-spread-first / smallest-first.
els.sortBtn.addEventListener('click', () => {
  sortDir = sortDir === 'desc' ? 'asc' : 'desc'
  els.sortArrow.innerHTML = sortDir === 'desc' ? '&#9660;' : '&#9650;'
  renderSpreads()
})

els.pairSearch.addEventListener('input', renderSpreads)

els.toggleSearch.addEventListener('input', () => {
  const q = els.toggleSearch.value.trim().toUpperCase()
  els.pairToggles.querySelectorAll('[data-toggle-pair]').forEach((label) => {
    label.hidden = q !== '' && !label.dataset.togglePair.includes(q)
  })
})

els.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const disabledPairs = []
  els.pairToggles.querySelectorAll('input[data-pair]').forEach((input) => {
    if (!input.checked) disabledPairs.push(input.dataset.pair)
  })
  const fees = {}
  els.feeInputs.querySelectorAll('input[data-fee]').forEach((input) => {
    fees[input.dataset.fee] = Number.parseFloat(input.value)
  })
  const body = {
    threshold: Number.parseFloat(els.threshold.value),
    cooldownMinutes: Number.parseFloat(els.cooldown.value),
    fees,
    disabledPairs,
  }
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'save failed')
    els.settingsMsg.textContent = 'Saved.'
    els.settingsMsg.className = 'msg'
    settingsInitialized = false
    if (latestState) {
      latestState.settings = data
      renderSettingsForm(latestState)
    }
  } catch (err) {
    els.settingsMsg.textContent = String(err.message || err)
    els.settingsMsg.className = 'msg error'
  }
  setTimeout(() => {
    els.settingsMsg.textContent = ''
  }, 3000)
})

refresh()
setInterval(refresh, 5000)
