import { config } from '../config.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('telegram')

// Per-pair timestamp of the last alert sent, for cooldown.
const lastAlertAt = new Map()

export function isConfigured() {
  return Boolean(config.telegram.botToken && config.telegram.chatId)
}

export function formatAlertMessage(spread) {
  return [
    'Arbitrage opportunity detected:',
    spread.pair,
    `Buy: ${spread.buy.exchange} ${spread.buy.price}`,
    `Sell: ${spread.sell.exchange} ${spread.sell.price}`,
    `Spread: ${spread.spreadPct.toFixed(2)}%`,
  ].join('\n')
}

export function isOnCooldown(pair, cooldownMinutes) {
  const last = lastAlertAt.get(pair)
  if (!last) return false
  return Date.now() - last < cooldownMinutes * 60 * 1000
}

export function markAlerted(pair) {
  lastAlertAt.set(pair, Date.now())
}

/**
 * Send an alert message via the Telegram Bot API.
 * Returns true if delivered, false otherwise (never throws).
 */
export async function sendAlert(text) {
  if (!isConfigured()) {
    log.warn('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not set; alert not delivered')
    return false
  }

  const url = `https://api.telegram.org/bot${config.telegram.botToken}/sendMessage`
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: config.telegram.chatId, text }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const body = await res.json().catch(() => ({}))
    if (!res.ok || body.ok !== true) {
      log.error('sendMessage failed', { status: res.status, description: body.description })
      return false
    }
    return true
  } catch (err) {
    log.error('sendMessage error', String(err?.message || err))
    return false
  }
}
