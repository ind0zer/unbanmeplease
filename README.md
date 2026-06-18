# UnbanMePlease

Telegram bot and WebApp for paid unban requests in Twitch and Telegram communities.

The project includes a Telegram bot, an Express API, a Telegram WebApp, SQLite storage, payment integrations, Twitch verification, promo codes, admin tools, and a production-ready systemd setup.

## Features

- Users can find a creator/channel and submit an unban request.
- Creators can connect Twitch and Telegram channels, set prices, manage the queue, and request withdrawals.
- Telegram WebApp login and bot deep links are supported.
- Admin tools include stats, broadcasts, creator verification, promo code management, and withdrawal handling.
- Payments are supported through NicePay, CryptoBot, and NOWPayments.
- Data is stored locally in SQLite.

## Tech Stack

- Node.js 18+
- Express 5
- Telegraf
- better-sqlite3
- SQLite in WAL mode
- Telegram WebApp in `public/webapp`
- systemd for production process management

## Project Structure

```text
.
├── index.js              # bot, API, webhooks, payments
├── database.js           # SQLite schema and data access helpers
├── public/               # landing page, WebApp, and static assets
├── deploy.sh             # systemd deployment helper
├── setup.sh              # first-run server setup helper
├── update-nodejs.sh      # Node.js updater for Ubuntu/Debian
├── unban-bot.service     # example systemd unit
├── .env.example          # environment variable template
├── package.json
└── package-lock.json
```

Local runtime files such as `.env`, `database.db`, logs, archives, and OS metadata are intentionally ignored.

## Quick Start

```bash
git clone https://github.com/your-username/unbanmeplease.git
cd unbanmeplease
npm ci
cp .env.example .env
```

Fill `.env` with real credentials, then start the app:

```bash
npm start
```

The server listens on `0.0.0.0:3000`.

- Landing page: `http://localhost:3000/`
- WebApp: `http://localhost:3000/app`

For frontend/API development without Telegram polling:

```bash
npm run dev
```

`npm run dev` sets `SKIP_BOT=true`, but `TELEGRAM_TOKEN` is still required because the app uses it to verify Telegram WebApp/Login data.

## Environment Variables

Create `.env` from the template:

```bash
cp .env.example .env
```

Core variables:

```env
TELEGRAM_TOKEN=
ADMIN_IDS=
BOT_NAME=
WEBAPP_URL=
AUTH_TOKEN_SECRET=
```

Twitch:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
TWITCH_CHAT_TOKEN=
TWITCH_BOT_LOGIN=
```

Payments:

```env
NICEPAY_MERCHANT_ID=
NICEPAY_SECRET_KEY=
CRYPTOBOT_TOKEN=
NOWPAY_API_KEY=
NOWPAY_IPN_SECRET=
NOWPAY_IPN_URL=
```

Optional defaults:

```env
USDT_RATE=100
NOWPAY_API_URL=https://api.nowpayments.io/v1
NOWPAY_PAY_CURRENCY=usdttrc20
NOWPAY_PRICE_CURRENCY=rub
NOWPAY_MIN_AMOUNT_RUB=250
AUTH_TOKEN_TTL_SEC=604800
TELEGRAM_LOGIN_TTL_SEC=86400
TELEGRAM_WEBAPP_TTL_SEC=604800
```

`ADMIN_IDS` accepts a comma-separated list of Telegram user IDs:

```env
ADMIN_IDS=123456789,987654321
```

## Telegram Setup

1. Create a bot with BotFather.
2. Put the bot token into `TELEGRAM_TOKEN`.
3. Set `BOT_NAME` to the bot username without `@`.
4. Host the app on an HTTPS domain.
5. Set `WEBAPP_URL` to the public WebApp URL:

```env
WEBAPP_URL=https://example.com/app
```

Telegram WebApp features require HTTPS in production.

## Twitch Setup

The bot can verify Twitch channel ownership and perform unban actions through the Twitch API/chat.

Core Twitch values:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
```

For chat-based verification, also set:

```env
TWITCH_CHAT_TOKEN=
TWITCH_BOT_LOGIN=
```

After the first launch, some Twitch settings may be persisted in the SQLite `config` table.

## Webhooks

These routes must be available on your public domain:

```text
POST /webhook
POST /webhook/cryptobot
POST /webhook/nowpay
```

Set the matching HTTPS callback URLs in your payment provider dashboards.

For NOWPayments:

```env
NOWPAY_IPN_URL=https://example.com/webhook/nowpay
NOWPAY_IPN_SECRET=
```

## Server Deployment

`unban-bot.service` expects the project to live in `/root/unban` by default.

Clean installation example:

```bash
sudo mkdir -p /root/unban
cd /root/unban
sudo git clone https://github.com/your-username/unbanmeplease.git .
sudo cp .env.example .env
sudo nano .env
sudo chmod +x setup.sh deploy.sh
sudo ./setup.sh
```

If you deploy to a different path, update `WorkingDirectory`, `EnvironmentFile`, `ExecStart`, and log paths in `unban-bot.service`.

Service commands:

```bash
sudo systemctl status unban-bot
sudo systemctl restart unban-bot
sudo systemctl stop unban-bot
sudo journalctl -u unban-bot -f
tail -f logs/bot.log
tail -f logs/error.log
```

## Database

The app creates `database.db` automatically on first start.

Create a backup:

```bash
cp database.db "database.db.backup_$(date +%Y%m%d_%H%M%S)"
```

Restore a backup:

```bash
cp database.db.backup_YYYYMMDD_HHMMSS database.db
```

Do not commit the database. It can contain users, tokens, payment records, and private configuration.

## Before Publishing

- Do not commit `.env`.
- Rotate any token that has ever been committed, shared, or included in an archive.
- Do not publish `database.db`, `database.db-shm`, `database.db-wal`, logs, archives, or server IPs.
- Use HTTPS for the WebApp and payment callback URLs.
- Use a long random `AUTH_TOKEN_SECRET`.
- Back up `database.db` regularly.

## NPM Scripts

```bash
npm start       # start the bot and API
npm run dev     # start API/WebApp with SKIP_BOT=true
npm run deploy  # run ./deploy.sh
npm run status  # show systemd service status
npm run restart # restart the systemd service
npm run logs    # follow systemd service logs
```
