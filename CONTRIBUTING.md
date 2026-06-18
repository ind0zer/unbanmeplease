# Contributing

Thanks for your interest in contributing to UnbanMePlease.

This project is a Telegram bot and WebApp that touches payments, Telegram auth, Twitch integrations, and local data storage. Changes should be small, reviewable, and careful around security-sensitive code paths.

## Good First Contributions

- Improve setup and deployment documentation.
- Add tests for webhook signature validation.
- Add typed provider adapters for payment integrations.
- Improve error handling and logging.
- Improve WebApp accessibility and responsive states.
- Add Docker Compose or reverse proxy examples.

## Development Setup

```bash
npm ci
cp .env.example .env
npm run dev
```

`npm run dev` starts the API/WebApp with `SKIP_BOT=true`. Telegram auth still requires `TELEGRAM_TOKEN` because WebApp/Login data is verified with the bot token.

## Pull Request Guidelines

- Keep pull requests focused on one behavior or documentation area.
- Do not commit `.env`, databases, logs, archives, or generated runtime files.
- Include clear reproduction steps for bug fixes.
- Add tests when touching payment webhooks, auth, token handling, or database migrations.
- Update README or docs when changing setup, deployment, environment variables, or public API behavior.

## Security-Sensitive Changes

Open a regular pull request for hardening work, but do not publish real secrets, exploit payloads against live services, or private user data.

For vulnerability reports, follow [SECURITY.md](SECURITY.md).
