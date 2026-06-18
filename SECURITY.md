# Security Policy

UnbanMePlease handles bot tokens, payment webhook secrets, Twitch credentials, Telegram WebApp auth data, and SQLite runtime data. Treat all deployment-specific values as secrets.

## Supported Versions

The `main` branch is the active development branch.

## Reporting a Vulnerability

Please do not open public issues that include live tokens, private user data, payment records, or working exploit details.

If you find a vulnerability:

1. Create a minimal description of the affected area.
2. Include reproduction steps without real credentials.
3. Include the expected impact.
4. Contact the maintainer privately through GitHub.

## Secret Handling

- Never commit `.env`.
- Never commit `database.db`, `database.db-shm`, or `database.db-wal`.
- Rotate any token that was committed, shared, logged, or stored in an archive.
- Use separate secrets for Telegram, auth tokens, payment webhooks, and Twitch credentials.
- Use HTTPS for Telegram WebApp URLs and payment callback URLs.

## Deployment Notes

The included systemd service is a starting point. Production deployments should also use a reverse proxy, TLS certificates, server firewall rules, regular database backups, and restricted SSH access.
