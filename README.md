# UnbanMePlease

Telegram-бот и WebApp для платных заявок на разбан в Twitch и Telegram-сообществах.

Проект включает Telegram-бота, Express API, Telegram WebApp, SQLite-базу, платежные интеграции, Twitch-верификацию, промокоды, админ-панель и готовый пример деплоя через systemd.

## Возможности

- Пользователь находит медиа/канал и оформляет заявку на разбан.
- Медиа подключает Twitch и Telegram-каналы, задает цены, смотрит очередь и создает заявки на вывод.
- Поддерживается вход через Telegram WebApp и deep link из бота.
- Админ может смотреть статистику, делать рассылки, подтверждать медиа, управлять промокодами и выводами.
- Есть оплаты через NicePay, CryptoBot и NOWPayments.
- Данные хранятся локально в SQLite.

## Стек

- Node.js 18+
- Express 5
- Telegraf
- better-sqlite3
- SQLite в WAL-режиме
- Telegram WebApp в `public/webapp`
- systemd для production-запуска

## Структура

```text
.
├── index.js              # бот, API, webhooks, платежи
├── database.js           # схема SQLite и методы работы с данными
├── public/               # лендинг, WebApp и статические ассеты
├── deploy.sh             # деплой через systemd
├── setup.sh              # первичная настройка на сервере
├── update-nodejs.sh      # обновление Node.js на Ubuntu/Debian
├── unban-bot.service     # пример systemd unit
├── .env.example          # шаблон переменных окружения
├── package.json
└── package-lock.json
```

Локальные файлы `.env`, `database.db`, логи, архивы и системный мусор специально добавлены в `.gitignore`.

## Быстрый старт

```bash
git clone https://github.com/your-username/unbanmeplease.git
cd unbanmeplease
npm ci
cp .env.example .env
```

Заполните `.env` реальными значениями и запустите проект:

```bash
npm start
```

Сервер слушает `0.0.0.0:3000`.

- Лендинг: `http://localhost:3000/`
- WebApp: `http://localhost:3000/app`

Для разработки фронта/API без запуска Telegram polling:

```bash
npm run dev
```

`npm run dev` ставит `SKIP_BOT=true`, но `TELEGRAM_TOKEN` все равно нужен: приложение использует его для проверки Telegram WebApp/Login данных.

## Переменные окружения

Создайте `.env` из шаблона:

```bash
cp .env.example .env
```

Базовые переменные:

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

Платежи:

```env
NICEPAY_MERCHANT_ID=
NICEPAY_SECRET_KEY=
CRYPTOBOT_TOKEN=
NOWPAY_API_KEY=
NOWPAY_IPN_SECRET=
NOWPAY_IPN_URL=
```

Опциональные значения по умолчанию:

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

`ADMIN_IDS` принимает несколько Telegram ID через запятую:

```env
ADMIN_IDS=123456789,987654321
```

## Настройка Telegram

1. Создайте бота через BotFather.
2. Вставьте токен в `TELEGRAM_TOKEN`.
3. В `BOT_NAME` укажите username бота без `@`.
4. Разместите приложение на HTTPS-домене.
5. В `WEBAPP_URL` укажите публичную ссылку на WebApp:

```env
WEBAPP_URL=https://example.com/app
```

Для Telegram WebApp в продакшене нужен HTTPS.

## Настройка Twitch

Бот умеет подтверждать владение Twitch-каналом и выполнять unban-действия через Twitch API/чат.

Основные значения:

```env
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=
TWITCH_ACCESS_TOKEN=
TWITCH_REFRESH_TOKEN=
```

Для верификации через чат дополнительно нужны:

```env
TWITCH_CHAT_TOKEN=
TWITCH_BOT_LOGIN=
```

После первого запуска часть Twitch-настроек может сохраняться в SQLite-таблицу `config`.

## Webhooks

На публичном домене должны быть доступны:

```text
POST /webhook
POST /webhook/cryptobot
POST /webhook/nowpay
```

В кабинетах платежных провайдеров укажите соответствующие HTTPS callback URL.

Для NOWPayments:

```env
NOWPAY_IPN_URL=https://example.com/webhook/nowpay
NOWPAY_IPN_SECRET=
```

## Деплой на сервер

`unban-bot.service` по умолчанию ожидает проект в `/root/unban`.

Пример чистой установки:

```bash
sudo mkdir -p /root/unban
cd /root/unban
sudo git clone https://github.com/your-username/unbanmeplease.git .
sudo cp .env.example .env
sudo nano .env
sudo chmod +x setup.sh deploy.sh
sudo ./setup.sh
```

Если проект лежит в другой папке, измените в `unban-bot.service` значения `WorkingDirectory`, `EnvironmentFile`, `ExecStart` и пути логов.

Команды управления:

```bash
sudo systemctl status unban-bot
sudo systemctl restart unban-bot
sudo systemctl stop unban-bot
sudo journalctl -u unban-bot -f
tail -f logs/bot.log
tail -f logs/error.log
```

## База данных

При первом запуске приложение само создаст `database.db`.

Бэкап:

```bash
cp database.db "database.db.backup_$(date +%Y%m%d_%H%M%S)"
```

Восстановление:

```bash
cp database.db.backup_YYYYMMDD_HHMMSS database.db
```

Не коммитьте базу данных. В ней могут быть пользователи, токены, платежные записи и приватные настройки.

## Перед публикацией на GitHub

- Не добавляйте `.env` в git.
- Если какой-то токен уже попадал в коммит, переписку или архив, перевыпустите его.
- Не публикуйте `database.db`, `database.db-shm`, `database.db-wal`, логи, архивы и IP серверов.
- Используйте HTTPS для WebApp и платежных callback URL.
- Поставьте длинный случайный `AUTH_TOKEN_SECRET`.
- Регулярно делайте бэкапы `database.db`.

## NPM scripts

```bash
npm start       # запустить бота и API
npm run dev     # запустить API/WebApp с SKIP_BOT=true
npm run deploy  # выполнить ./deploy.sh
npm run status  # статус systemd-сервиса
npm run restart # перезапуск systemd-сервиса
npm run logs    # live-логи systemd-сервиса
```
