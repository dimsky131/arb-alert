import 'dotenv/config'

function intEnv(name, fallback) {
  const raw = process.env[name]
  const parsed = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function floatEnv(name, fallback) {
  const raw = process.env[name]
  const parsed = Number.parseFloat(raw ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

const MIN_POLL_MS = 5000
const MAX_POLL_MS = 10000

const rawPollMs = intEnv('POLL_INTERVAL_MS', 7000)

export const config = {
  port: intEnv('PORT', 3000),
  pollIntervalMs: Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, rawPollMs)),
  defaultThreshold: floatEnv('SPREAD_THRESHOLD', 0.5),
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  // Pairs known to the system. Toggled on/off at runtime via settings.
  supportedPairs: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'],
  defaultCooldownMinutes: 5,
  maxAlertHistory: 200,
  dataDir: new URL('../data/', import.meta.url).pathname,
}
