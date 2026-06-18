# Demo Guide

This guide helps reviewers understand the project quickly without live production credentials.

## Local Demo

```bash
npm ci
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:3000/
http://localhost:3000/app
```

The landing page is available without Telegram. Full WebApp authentication, bot deep links, payments, and Twitch verification require real provider credentials.

## Review Flow

1. Inspect the landing page at `/`.
2. Inspect the WebApp shell at `/app`.
3. Review `.env.example` to see required integrations.
4. Review `docs/ARCHITECTURE.md` for API routes and system design.
5. Review `database.js` for schema and migration behavior.
6. Review webhook handlers in `index.js` for provider integration points.

## Suggested Screenshots

When preparing a public release page, add screenshots for:

- Landing page.
- WebApp unban search flow.
- Creator dashboard.
- Connected channels screen.
- Admin panel.

Recommended paths:

```text
docs/screenshots/landing.png
docs/screenshots/webapp-search.png
docs/screenshots/creator-dashboard.png
docs/screenshots/admin-panel.png
```

Do not include screenshots with real user IDs, payment IDs, tokens, channel secrets, or private chat data.
