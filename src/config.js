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
  // Number of top pairs (by 24h quote volume) to monitor.
  topPairsCount: intEnv('TOP_PAIRS', 100),
  // How often to refresh the top-pairs universe.
  universeRefreshMs: intEnv('UNIVERSE_REFRESH_MS', 6 * 60 * 60 * 1000),
  // Fallback universe used if the dynamic top-pairs fetch fails on first boot.
  fallbackPairs: [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'BNB/USDT', 'DOGE/USDT',
    'ADA/USDT', 'TRX/USDT', 'AVAX/USDT', 'LINK/USDT', 'DOT/USDT', 'LTC/USDT',
    'BCH/USDT', 'NEAR/USDT', 'APT/USDT', 'ARB/USDT', 'OP/USDT', 'ATOM/USDT',
    'FIL/USDT', 'UNI/USDT', 'ETC/USDT', 'XLM/USDT', 'ICP/USDT', 'HBAR/USDT',
    'SUI/USDT', 'TON/USDT', 'PEPE/USDT', 'SHIB/USDT', 'WIF/USDT', 'INJ/USDT',
  ],
  // Default spot taker fee (%) per exchange, editable at runtime via settings.
  defaultFees: {
    Binance: 0.1,
    Bybit: 0.1,
    OKX: 0.1,
    KuCoin: 0.1,
    'Gate.io': 0.2,
    MEXC: 0.05,
  },
  defaultCooldownMinutes: 5,
  maxAlertHistory: 200,
  dataDir: new URL('../data/', import.meta.url).pathname,
}
