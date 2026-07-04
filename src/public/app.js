/* Arb Alert dashboard: polls /api/state every 5s and renders. Vanilla JS, no build step. */

const els = {
  telegramStatus: document.getElementById('telegram-status'),
  lastTick: document.getElementById('last-tick'),
  exchangeHealth: document.getElementById('exchange-health'),
  spreadRows: document.getElementById('spread-rows'),
  settingsForm: document.getElementById('settings-form'),
  threshold: document.getElementById('threshold'),
  cooldown: document.getElementById('cooldown'),
  pairToggles: document.getElementById('pair-toggles'),
  settingsMsg: document.getElementById('settings-msg'),
  alertList: document.getElementById('alert-list'),
}

let settingsInitialized = false
let latestSettings = null

function fmtPrice(p) {
  return p >= 1000 ? p.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(p)
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false })
}

function renderSpreads(spreads, threshold) {
  if (!spreads.length) {
    els.spreadRows.innerHTML = '<tr><td colspan="4" class="empty">No spread data yet.</td></tr>'
    return
  }
  els.spreadRows.innerHTML = spreads
    .map((s) => {
      const hot = s.spreadPct >= threshold ? ' class="hot"' : ''
      return `<tr${hot}>
        <td>${s.pair}</td>
        <td>${fmtPrice(s.buy.price)} <span class="exchange-name">${s.buy.exchange}</span></td>
        <td>${fmtPrice(s.sell.price)} <span class="exchange-name">${s.sell.exchange}</span></td>
        <td class="num">${s.spreadPct.toFixed(3)}%</td>
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
    .map(
      (a) => `<li>
        <span class="a-pair">${a.pair}</span>
        <span class="a-spread">${a.spreadPct.toFixed(2)}%</span>
        <span class="a-detail">Buy ${a.buy.exchange} ${fmtPrice(a.buy.price)} &rarr; Sell ${a.sell.exchange} ${fmtPrice(a.sell.price)}</span>
        ${a.delivered ? '' : '<span class="a-undelivered">not delivered</span>'}
        <span class="a-time">${new Date(a.ts).toLocaleString('en-US', { hour12: false })}</span>
      </li>`,
    )
    .join('')
}

function renderSettingsForm(settings) {
  // Only populate inputs once (or after save) so we don't clobber in-progress edits.
  if (settingsInitialized) return
  els.threshold.value = settings.threshold
  els.cooldown.value = settings.cooldownMinutes
  els.pairToggles.innerHTML = Object.entries(settings.pairs)
    .map(
      ([pair, enabled]) => `<label class="toggle">
        <input type="checkbox" data-pair="${pair}" ${enabled ? 'checked' : ''} />
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
    latestSettings = state.settings

    els.telegramStatus.textContent = `Telegram: ${state.telegramConfigured ? 'connected' : 'not configured'}`
    els.telegramStatus.className = `pill ${state.telegramConfigured ? 'ok' : 'warn'}`
    els.lastTick.textContent = `Last tick: ${state.lastTickAt ? fmtTime(state.lastTickAt) : '—'}`

    renderHealth(state.exchanges)
    renderSpreads(state.spreads, state.settings.threshold)
    renderAlerts(state.alerts)
    renderSettingsForm(state.settings)
  } catch {
    // network hiccup; next poll will recover
  }
}

els.settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const pairs = {}
  els.pairToggles.querySelectorAll('input[data-pair]').forEach((input) => {
    pairs[input.dataset.pair] = input.checked
  })
  const body = {
    threshold: Number.parseFloat(els.threshold.value),
    cooldownMinutes: Number.parseFloat(els.cooldown.value),
    pairs,
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
    renderSettingsForm(data)
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
