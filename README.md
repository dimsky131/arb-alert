# Arb Alert

Crypto arbitrage alert system. Polls **Binance**, **Bybit**, and **OKX** spot prices every ~7 seconds, computes cross-exchange spreads for BTC/USDT, ETH/USDT, SOL/USDT, XRP/USDT, sends **Telegram alerts** when a spread exceeds a configurable threshold, and serves a live dashboard.

## Features

- 3 exchanges polled in parallel (1 batched HTTP request per exchange per tick)
- Spread formula: `(max - min) / min * 100`
- Configurable threshold, per-pair toggles, alert cooldown (all editable live via dashboard, persisted to `data/settings.json`)
- Alert history (last 200) persisted to `data/alerts.json`
- Retry with exponential backoff; degraded exchanges are excluded from spread calc (min 2 healthy required)
- Graceful shutdown (SIGTERM/SIGINT), `/healthz` endpoint

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | for alerts | — | Bot token from [@BotFather](https://t.me/BotFather) |
| `TELEGRAM_CHAT_ID` | for alerts | — | Target chat/channel ID |
| `PORT` | no | `3000` | HTTP server port |
| `POLL_INTERVAL_MS` | no | `7000` | Poll interval (clamped 5000–10000) |
| `SPREAD_THRESHOLD` | no | `0.5` | Initial alert threshold (%) |

## Run locally

```bash
cd arb-alert
cp .env.example .env   # fill in your Telegram credentials
npm install
npm start
# Dashboard: http://localhost:3000
```

## API

- `GET /api/state` — live spreads, exchange health, settings, last 50 alerts
- `GET /api/alerts` — full alert history
- `PUT /api/settings` — body: `{ "threshold": 1.0, "cooldownMinutes": 5, "pairs": { "BTC/USDT": true } }`
- `GET /healthz` — health check

## Deployment

### Option A: Ubuntu server (bare metal, systemd)

```bash
# 1. Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Deploy the app
sudo mkdir -p /opt/arb-alert
sudo cp -r . /opt/arb-alert
cd /opt/arb-alert
npm install --omit=dev
cp .env.example .env && nano .env   # set your Telegram credentials
```

Create `/etc/systemd/system/arb-alert.service`:

```ini
[Unit]
Description=Arb Alert - crypto arbitrage alert daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/arb-alert
EnvironmentFile=/opt/arb-alert/.env
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data:www-data /opt/arb-alert
sudo systemctl daemon-reload
sudo systemctl enable --now arb-alert
sudo systemctl status arb-alert     # check it's running
journalctl -u arb-alert -f          # follow logs
```

### Option B: Ubuntu server (Docker)

```bash
cd arb-alert
cp .env.example .env && nano .env   # set your Telegram credentials
docker compose up -d --build
docker compose logs -f
```

Alert history and settings persist in `./data` via the volume mount.

### Option C: Render

1. Push this repo to GitHub and create a new **Web Service** on [Render](https://render.com).
2. Settings:
   - **Root Directory**: `arb-alert`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Health Check Path**: `/healthz`
3. Add environment variables: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
4. Deploy. Render sets `PORT` automatically.

> Note: Render's free tier has an ephemeral filesystem — settings/alert history reset on redeploy. Use a paid instance with a [persistent disk](https://render.com/docs/disks) mounted at `/opt/render/project/src/arb-alert/data` to persist them.

## Alert message format

```
Arbitrage opportunity detected:
BTC/USDT
Buy: Binance 43000
Sell: Bybit 43250
Spread: 0.58%
```

A per-pair cooldown (default 5 minutes) prevents alert spam while a spread persists.
