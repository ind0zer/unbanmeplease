<p align="center">
  <img src="public/webapp/unbanmelogo.png" alt="UnbanMePlease" width="360">
</p>

<h1 align="center">UnbanMePlease</h1>

<p align="center">
  Telegram Unban Bot and Twitch/Telegram WebApp for paid community unban requests.
</p>

<p align="center">
  <a href="https://nodejs.org/">
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white">
  </a>
  <a href="https://expressjs.com/">
    <img alt="Express" src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express&logoColor=white">
  </a>
  <a href="https://telegraf.js.org/">
    <img alt="Telegraf" src="https://img.shields.io/badge/Telegraf-4-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white">
  </a>
  <a href="https://www.sqlite.org/">
    <img alt="SQLite" src="https://img.shields.io/badge/SQLite-WAL-003B57?style=for-the-badge&logo=sqlite&logoColor=white">
  </a>
</p>

<p align="center">
  <img alt="Telegram WebApp" src="https://img.shields.io/badge/Telegram-WebApp-26A5E4?style=flat-square&logo=telegram&logoColor=white">
  <img alt="Twitch API" src="https://img.shields.io/badge/Twitch-API-9146FF?style=flat-square&logo=twitch&logoColor=white">
  <img alt="Payments" src="https://img.shields.io/badge/Payments-NicePay%20%7C%20CryptoBot%20%7C%20NOWPayments-111827?style=flat-square">
  <img alt="Process manager" src="https://img.shields.io/badge/Deploy-systemd-4B5563?style=flat-square">
</p>

## Overview

UnbanMePlease is a production-oriented Telegram bot and Telegram WebApp for creators, streamers, and community admins who want to sell and manage unban requests for Twitch and Telegram communities.

The app combines a Telegram bot, a mobile-first WebApp, an Express API, SQLite persistence, payment webhooks, Twitch verification, admin tools, promo codes, and a systemd deployment setup.

## Keywords

`telegram bot`, `telegram webapp`, `twitch unban bot`, `telegram unban`, `creator monetization`, `community tools`, `telegraf`, `express`, `sqlite`, `cryptobot`, `nowpayments`, `nicepay`

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Demo and Screenshots](#demo-and-screenshots)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Telegram Setup](#telegram-setup)
- [Twitch Setup](#twitch-setup)
- [Payment Webhooks](#payment-webhooks)
- [Server Deployment](#server-deployment)
- [Database](#database)
- [Documentation](#documentation)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Security Checklist](#security-checklist)
- [NPM Scripts](#npm-scripts)
- [License](#license)

## Features

### For Users

- Search for a creator or community.
- Submit Twitch or Telegram unban requests.
- Pay through supported payment providers.
- Continue the flow from Telegram deep links or the WebApp.

### For Creators

- Connect Twitch and Telegram channels.
- Set custom unban prices.
- Verify Twitch ownership through chat-based verification.
- Manage incoming unban queue items.
- Track stats and request withdrawals.
- Use creator profile links and custom slugs.

### For Admins

- View global platform stats.
- Verify creator profiles.
- Manage promo codes.
- Review withdrawals.
- Send broadcasts.
- Control platform-level commission settings.

### Payments and Integrations

- NicePay payment creation and status checks.
- CryptoBot invoices and webhook verification.
- NOWPayments payment creation, status checks, and IPN verification.
- Telegram WebApp auth validation.
- Twitch API and IRC-based channel verification.

## How It Works

```text
Telegram Bot / WebApp
        |
        v
Express API on port 3000
        |
        +--> SQLite database
        +--> Telegram Bot API
        +--> Twitch API / IRC
        +--> NicePay / CryptoBot / NOWPayments
```

The Telegram bot handles onboarding, deep links, creator flows, admin actions, and bot-side confirmations. The WebApp provides the user-facing purchase flow and creator dashboard. Express serves the WebApp, API routes, and payment webhooks. SQLite stores users, connected channels, pending actions, payments, promos, config values, and unban queue items.

## Tech Stack

| Area | Technology |
| --- | --- |
| Runtime | Node.js 18+ |
| Bot framework | Telegraf |
| API server | Express 5 |
| Database | SQLite with better-sqlite3 |
| Frontend | Telegram WebApp, HTML, CSS, JavaScript |
| Payments | NicePay, CryptoBot, NOWPayments |
| Deployment | systemd |

## Project Structure

```text
.
|-- index.js              # bot, API, webhooks, payments
|-- database.js           # SQLite schema and data access helpers
|-- docs/                 # architecture, demo notes, and roadmap
|-- .github/              # issue templates
|-- public/               # landing page, WebApp, and static assets
|-- deploy.sh             # systemd deployment helper
|-- setup.sh              # first-run server setup helper
|-- update-nodejs.sh      # Node.js updater for Ubuntu/Debian
|-- unban-bot.service     # example systemd unit
|-- .env.example          # environment variable template
|-- package.json
`-- package-lock.json
```

Local runtime files such as `.env`, `database.db`, logs, archives, and OS metadata are intentionally ignored.

## Demo and Screenshots

The app exposes two user-facing surfaces:

| Surface | Local URL | Description |
| --- | --- | --- |
| Landing page | `http://localhost:3000/` | Public entry page for the product |
| Telegram WebApp | `http://localhost:3000/app` | Mobile-first purchase flow and creator dashboard |

For a reviewer, the fastest local demo path is:

```bash
npm ci
cp .env.example .env
npm run dev
```

Then open `http://localhost:3000/` for the landing page and `http://localhost:3000/app` for the WebApp shell. Telegram-specific flows require a real bot token and an HTTPS WebApp URL.

See [docs/DEMO.md](docs/DEMO.md) for a suggested demo script and review checklist.

## Quick Start

```bash
git clone https://github.com/ind0zer/unbanmeplease.git
cd unbanmeplease
npm ci
cp .env.example .env
```

Fill `.env` with real credentials, then start the app:

```bash
npm start
```

The server listens on `0.0.0.0:3000`.

| Route | Purpose |
| --- | --- |
| `http://localhost:3000/` | Public landing page |
| `http://localhost:3000/app` | Telegram WebApp |

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
5. Set `WEBAPP_URL` to the public WebApp URL.

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

## Payment Webhooks

These routes must be available on your public HTTPS domain:

```text
POST /webhook
POST /webhook/cryptobot
POST /webhook/nowpay
```

Set the matching callback URLs in your payment provider dashboards.

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
sudo git clone https://github.com/ind0zer/unbanmeplease.git .
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

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Demo guide](docs/DEMO.md)
- [Roadmap](docs/ROADMAP.md)
- [Security policy](SECURITY.md)
- [Contributing guide](CONTRIBUTING.md)

## Roadmap

The public roadmap focuses on making the project easier to audit, deploy, and extend:

- Provider adapters for payment integrations.
- Automated test coverage for webhook signature validation.
- Docker Compose deployment option.
- Structured logging and operational health checks.
- Optional admin WebApp dashboard.

See the full roadmap in [docs/ROADMAP.md](docs/ROADMAP.md).

## Contributing

Contributions are welcome through issues and pull requests. Good first areas include documentation, deployment hardening, tests for payment webhooks, and provider abstraction.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security Checklist

- Do not commit `.env`.
- Rotate any token that has ever been committed, shared, or included in an archive.
- Do not publish `database.db`, `database.db-shm`, `database.db-wal`, logs, archives, or server IPs.
- Use HTTPS for the WebApp and payment callback URLs.
- Use a long random `AUTH_TOKEN_SECRET`.
- Back up `database.db` regularly.
- Keep payment webhook secrets separate from bot and auth secrets.

## NPM Scripts

```bash
npm start       # start the bot and API
npm run dev     # start API/WebApp with SKIP_BOT=true
npm run deploy  # run ./deploy.sh
npm run status  # show systemd service status
npm run restart # restart the systemd service
npm run logs    # follow systemd service logs
```

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
