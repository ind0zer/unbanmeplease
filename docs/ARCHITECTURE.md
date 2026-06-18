# Architecture

UnbanMePlease is a single-process Node.js application with three main surfaces:

- Telegram bot handlers.
- Express API and webhook routes.
- Static landing page and Telegram WebApp assets.

## Runtime Diagram

```text
Telegram users
     |
     v
Telegram Bot API
     |
     v
Telegraf handlers in index.js
     |
     +------------------------+
                              |
WebApp users                  |
     |                        |
     v                        |
Express server on port 3000 --+--> SQLite database
     |                        |
     +--> static WebApp       +--> Twitch API / IRC
     +--> REST API            +--> NicePay
     +--> payment webhooks    +--> CryptoBot
                              +--> NOWPayments
```

## Main Components

| Component | File | Responsibility |
| --- | --- | --- |
| Bot and API server | `index.js` | Telegram handlers, Express routes, payment flows, Twitch verification |
| Database layer | `database.js` | SQLite schema, migrations, queries, config storage |
| Landing page | `public/index.html` | Public entry page |
| WebApp shell | `public/webapp/index.html` | Telegram WebApp HTML entry |
| WebApp logic | `public/webapp/app.js` | Client-side WebApp flows |
| WebApp styles | `public/webapp/styles.css` | Mobile-first UI styling |
| systemd unit | `unban-bot.service` | Production process setup |

## API Surface

Core WebApp and auth routes:

```text
GET  /
GET  /app
GET  /api/config
POST /api/auth/start
GET  /api/auth/status/:code
GET  /api/auth/telegram
GET  /api/auth/me
```

User and creator routes:

```text
GET  /api/user/:userId
POST /api/user/:userId/create
POST /api/user/:userId/slug
GET  /api/user/:userId/slug/random
GET  /api/user/:userId/link
GET  /api/user/:userId/stats
GET  /api/user/:userId/queue
POST /api/queue/:id/done
POST /api/withdraw
```

Discovery and unban routes:

```text
GET  /api/bloggers/search
GET  /api/blogger/:bloggerId
POST /api/unban/create
GET  /api/unban/check/:pendingId
```

Twitch and Telegram channel routes:

```text
POST /api/twitch/link
POST /api/twitch/verify/start
GET  /api/twitch/verify/:requestId
GET  /api/twitch/profile
POST /api/channel/link
GET  /api/channel/:channelId/photo
```

Promo and payment routes:

```text
POST /api/promo/activate
POST /api/promo/deactivate
POST /webhook
POST /webhook/cryptobot
POST /webhook/nowpay
```

## Database

SQLite is initialized automatically by `database.js`. The app uses WAL mode and creates tables for:

- users
- channels
- pending actions
- purchases
- withdrawals
- unban queue
- config
- promo codes
- Twitch verification requests

Runtime database files are intentionally ignored by git.

## Deployment Model

The default production model is:

1. Clone repository to `/root/unban`.
2. Create `.env` from `.env.example`.
3. Install dependencies with `npm ci --omit=dev`.
4. Install `unban-bot.service`.
5. Run behind HTTPS reverse proxy for Telegram WebApp and payment callbacks.
