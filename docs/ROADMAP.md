# Roadmap

This roadmap is focused on making UnbanMePlease easier to audit, run, and extend as an open-source project.

## Short Term

- Add automated tests for auth token signing and verification.
- Add automated tests for CryptoBot and NOWPayments webhook signature checks.
- Document reverse proxy examples for Nginx and Caddy.
- Add sample `.env` comments for each provider.
- Add screenshots with sanitized demo data.

## Medium Term

- Split payment providers into adapter modules.
- Split Telegram bot handlers by domain.
- Add Docker Compose for local and production-like deployments.
- Add structured logging with request IDs.
- Add health check endpoint for uptime monitoring.

## Long Term

- Add optional admin WebApp dashboard.
- Add provider-agnostic payment reconciliation.
- Add migration runner for database schema changes.
- Add multi-language WebApp support.
- Add contributor-friendly test fixtures for Telegram and Twitch flows.

## Non-Goals

- Storing production secrets in the repository.
- Publishing private user, channel, or payment data.
- Replacing provider dashboards for compliance-sensitive payment operations.
