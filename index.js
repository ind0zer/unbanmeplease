import 'dotenv/config';
import path from 'path';
import axios from 'axios';
import crypto from 'crypto';
import express from 'express';
import { fileURLToPath } from 'url';
import tls from 'tls';
import { Telegraf, Markup } from 'telegraf';
import DB from './database.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/index.html'));
});

app.get('/app', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(__dirname, 'public/webapp/index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));
const webappStatic = express.static(path.join(__dirname, 'public/webapp'), {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store');
  }
});
app.use('/app', webappStatic);
app.use('/webapp', webappStatic);
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));



const TOKEN = process.env.TELEGRAM_TOKEN;
const TWITCH_ENV_CLIENT_ID = (process.env.TWITCH_CLIENT_ID || '').trim();
const TWITCH_ENV_CLIENT_SECRET = (process.env.TWITCH_CLIENT_SECRET || '').trim();
const TWITCH_ENV_ACCESS_TOKEN = (process.env.TWITCH_ACCESS_TOKEN || '').trim().replace(/^oauth:/i, '');
const TWITCH_ENV_REFRESH_TOKEN = (process.env.TWITCH_REFRESH_TOKEN || '').trim();
const TWITCH_ENV_CHAT_TOKEN = (process.env.TWITCH_CHAT_TOKEN || '').trim().replace(/^oauth:/i, '');
let TWITCH_BOT_LOGIN = (process.env.TWITCH_BOT_LOGIN || '').trim().toLowerCase();
const TWITCH_VERIFY_TTL_MS = 5 * 60 * 1000;
const MIN_UNBAN_PRICE = 100;
const NICEPAY_MIN_AMOUNT_RUB = 250;

const TWITCH_CONFIG_KEYS = {
  clientId: 'twitch_client_id',
  clientSecret: 'twitch_client_secret',
  accessToken: 'twitch_access_token',
  refreshToken: 'twitch_refresh_token',
  chatToken: 'twitch_chat_token',
  botLogin: 'twitch_bot_login',
  expiresAt: 'twitch_token_expires_at'
};

let twitchConfig = {
  clientId: '',
  clientSecret: '',
  accessToken: '',
  refreshToken: '',
  chatToken: '',
  botLogin: '',
  expiresAt: 0
};

const readDbConfig = (key) => DB.getConfig(key);
const writeDbConfig = (key, value) => {
  if (value === undefined || value === null || value === '') return;
  DB.setConfig(key, value);
};

const loadTwitchConfig = () => {
  const dbClientId = readDbConfig(TWITCH_CONFIG_KEYS.clientId);
  const dbClientSecret = readDbConfig(TWITCH_CONFIG_KEYS.clientSecret);
  const dbAccessToken = readDbConfig(TWITCH_CONFIG_KEYS.accessToken);
  const dbRefreshToken = readDbConfig(TWITCH_CONFIG_KEYS.refreshToken);
  const dbChatToken = readDbConfig(TWITCH_CONFIG_KEYS.chatToken);
  const dbBotLogin = readDbConfig(TWITCH_CONFIG_KEYS.botLogin);
  const dbExpiresAt = readDbConfig(TWITCH_CONFIG_KEYS.expiresAt);

  twitchConfig = {
    clientId: dbClientId || TWITCH_ENV_CLIENT_ID,
    clientSecret: dbClientSecret || TWITCH_ENV_CLIENT_SECRET,
    accessToken: dbAccessToken || TWITCH_ENV_ACCESS_TOKEN,
    refreshToken: dbRefreshToken || TWITCH_ENV_REFRESH_TOKEN,
    chatToken: dbChatToken || TWITCH_ENV_CHAT_TOKEN,
    botLogin: dbBotLogin || TWITCH_BOT_LOGIN,
    expiresAt: dbExpiresAt ? Number(dbExpiresAt) : 0
  };

  if (!dbClientId && TWITCH_ENV_CLIENT_ID) writeDbConfig(TWITCH_CONFIG_KEYS.clientId, TWITCH_ENV_CLIENT_ID);
  if (!dbClientSecret && TWITCH_ENV_CLIENT_SECRET) writeDbConfig(TWITCH_CONFIG_KEYS.clientSecret, TWITCH_ENV_CLIENT_SECRET);
  if (!dbAccessToken && TWITCH_ENV_ACCESS_TOKEN) writeDbConfig(TWITCH_CONFIG_KEYS.accessToken, TWITCH_ENV_ACCESS_TOKEN);
  if (!dbRefreshToken && TWITCH_ENV_REFRESH_TOKEN) writeDbConfig(TWITCH_CONFIG_KEYS.refreshToken, TWITCH_ENV_REFRESH_TOKEN);
  if (!dbChatToken && TWITCH_ENV_CHAT_TOKEN) writeDbConfig(TWITCH_CONFIG_KEYS.chatToken, TWITCH_ENV_CHAT_TOKEN);
  if (!dbBotLogin && TWITCH_BOT_LOGIN) writeDbConfig(TWITCH_CONFIG_KEYS.botLogin, TWITCH_BOT_LOGIN);

  TWITCH_BOT_LOGIN = (twitchConfig.botLogin || TWITCH_BOT_LOGIN || '').trim().toLowerCase();
};

const setTwitchConfig = (updates = {}, persist = true) => {
  twitchConfig = { ...twitchConfig, ...updates };
  if (!persist) return;
  if (updates.clientId !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.clientId, updates.clientId);
  if (updates.clientSecret !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.clientSecret, updates.clientSecret);
  if (updates.accessToken !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.accessToken, updates.accessToken);
  if (updates.refreshToken !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.refreshToken, updates.refreshToken);
  if (updates.chatToken !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.chatToken, updates.chatToken);
  if (updates.botLogin !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.botLogin, updates.botLogin);
  if (updates.expiresAt !== undefined) writeDbConfig(TWITCH_CONFIG_KEYS.expiresAt, String(updates.expiresAt || 0));
};

const getTwitchClientId = () => (twitchConfig.clientId || '').trim();
const getTwitchClientSecret = () => (twitchConfig.clientSecret || '').trim();
const getTwitchAccessToken = () => (twitchConfig.accessToken || '').trim();
const getTwitchRefreshToken = () => (twitchConfig.refreshToken || '').trim();
const getTwitchChatToken = () => (twitchConfig.chatToken || '').trim();

loadTwitchConfig();

const NICEPAY_MERCHANT_ID = process.env.NICEPAY_MERCHANT_ID;
const NICEPAY_SECRET_KEY = process.env.NICEPAY_SECRET_KEY;
const CRYPTOBOT_TOKEN = process.env.CRYPTOBOT_TOKEN;
const AUTH_TOKEN_SECRET = (process.env.AUTH_TOKEN_SECRET || TOKEN || '').trim();
const AUTH_TOKEN_TTL_SEC = Number(process.env.AUTH_TOKEN_TTL_SEC) || 7 * 24 * 60 * 60;
const TELEGRAM_LOGIN_TTL_SEC = Number(process.env.TELEGRAM_LOGIN_TTL_SEC) || 24 * 60 * 60;
const TELEGRAM_WEBAPP_TTL_SEC = Number(process.env.TELEGRAM_WEBAPP_TTL_SEC);
const NOWPAY_API_KEY = (process.env.NOWPAY_API_KEY || '').trim();
const NOWPAY_IPN_SECRET = (process.env.NOWPAY_IPN_SECRET || '').trim();
const NOWPAY_API_URL = (process.env.NOWPAY_API_URL || 'https://api.nowpayments.io/v1').trim();
const NOWPAY_PAY_CURRENCY = (process.env.NOWPAY_PAY_CURRENCY || 'usdttrc20').trim().toLowerCase();
const NOWPAY_PRICE_CURRENCY = (process.env.NOWPAY_PRICE_CURRENCY || 'rub').trim().toLowerCase();
const NOWPAY_IPN_URL = (process.env.NOWPAY_IPN_URL || '').trim();
const NOWPAY_MIN_AMOUNT_RUB = Number(process.env.NOWPAY_MIN_AMOUNT_RUB) || 250;
const ADMIN_IDS = process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [];
const BOT_USERNAME = (process.env.BOT_NAME || '').trim().replace(/^@/, '');
const WEBAPP_URL = (process.env.WEBAPP_URL || '').trim();

if (!TOKEN) {
  console.error('TELEGRAM_TOKEN is missing.');
  process.exit(1);
}

const bot = new Telegraf(TOKEN, { handlerTimeout: 10_000 });

const normalizeUserId = (value) => {
  if (value === null || value === undefined) return value;
  const str = String(value).trim();
  return str.endsWith('.0') ? str.slice(0, -2) : str;
};

const clampMinPrice = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return MIN_UNBAN_PRICE;
  if (num < MIN_UNBAN_PRICE) return MIN_UNBAN_PRICE;
  return Math.round(num);
};

const normalizeChannelLabel = (channel) => {
  if (!channel) return null;
  const title = channel.title ? String(channel.title).trim() : '';
  if (title) return title;
  const username = channel.username ? String(channel.username).trim() : '';
  if (username) return username.replace(/^@/, '');
  return null;
};

const pickChannelLabel = (channels) => {
  if (!Array.isArray(channels) || channels.length === 0) return null;
  const primary = pickPrimaryChannel(channels);
  return normalizeChannelLabel(primary);
};

const pickPrimaryChannel = (channels) => {
  if (!Array.isArray(channels) || channels.length === 0) return null;
  let fallback = channels[0];
  for (const channel of channels) {
    if (normalizeChannelLabel(channel)) return channel;
  }
  return fallback;
};

const formatPlatformLabel = (platform, channel) => {
  if (platform === 'twitch') return 'Twitch';
  if (platform !== 'telegram') return platform;
  const label = normalizeChannelLabel(channel);
  if (!label) return 'Telegram';
  return `Telegram • ${label}`;
};

const channelAdminCache = new Map();
const CHANNEL_ADMIN_CACHE_TTL_MS = 2 * 60 * 1000;

const resolveBotId = async () => {
  if (bot.botInfo?.id) return bot.botInfo.id;
  const me = await bot.telegram.getMe();
  return me.id;
};

const isBotAdminInChannel = async (channelId) => {
  if (!channelId) return null;
  const key = String(channelId);
  const cached = channelAdminCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  try {
    const botId = await resolveBotId();
    const admins = await bot.telegram.getChatAdministrators(channelId);
    const isAdmin = admins.some(a => a.user.id === botId);
    channelAdminCache.set(key, { value: isAdmin, expiresAt: Date.now() + CHANNEL_ADMIN_CACHE_TTL_MS });
    return isAdmin;
  } catch (e) {
    const code = e?.response?.error_code;
    if (code === 400 || code === 403) {
      channelAdminCache.set(key, { value: false, expiresAt: Date.now() + CHANNEL_ADMIN_CACHE_TTL_MS });
      return false;
    }
    console.error(`[TG] admin check failed for ${key}:`, e.message);
    return null;
  }
};

const revokeUserVerification = (userId) => {
  if (!userId) return false;
  const user = DB.getUser(userId);
  if (user?.is_verified) {
    DB.setUserVerified(userId, false);
    return true;
  }
  return false;
};

const warnVerifiedAction = async (ctx, userId) => {
  const user = DB.getUser(userId);
  if (user?.is_verified) {
    try {
      await ctx.answerCbQuery('⚠️ При изменении соцсетей галочка будет снята.', { show_alert: true });
    } catch (e) { }
    return true;
  }
  try {
    await ctx.answerCbQuery();
  } catch (e) { }
  return false;
};

const notifyChannelUnlinked = async (ownerId, channel, verificationRevoked = false) => {
  if (!ownerId || !channel) return;
  const label = normalizeChannelLabel(channel) || channel.username || channel.id;
  const extra = verificationRevoked ? '\n⭐ Верификация снята (изменились соцсети).' : '';
  const message = `⚠️ Канал <b>${label}</b> отвязан.\nБот больше не администратор.${extra}`;
  try {
    await bot.telegram.sendMessage(ownerId, message, { parse_mode: 'HTML' });
  } catch (e) { }
};

const filterChannelsByAdmin = async (channels, ownerId) => {
  if (!Array.isArray(channels) || channels.length === 0) return { channels: [], removed: [] };
  const kept = [];
  const removed = [];

  let revoked = false;
  for (const channel of channels) {
    const status = await isBotAdminInChannel(channel.id);
    if (status === false) {
      DB.removeChannel(channel.id);
      channelAdminCache.delete(String(channel.id));
      removed.push(channel);
      if (!revoked) revoked = revokeUserVerification(ownerId);
      await notifyChannelUnlinked(ownerId, channel, revoked);
      continue;
    }
    kept.push(channel);
  }

  return { channels: kept, removed };
};

const attachPlatformLabels = (items, channels) => {
  const map = new Map((channels || []).map(ch => [String(ch.id), ch]));
  return (items || []).map(item => {
    const channel = item?.channel_id ? map.get(String(item.channel_id)) : null;
    return {
      ...item,
      channel_label: channel ? normalizeChannelLabel(channel) : null,
      platform_label: formatPlatformLabel(item.platform, channel)
    };
  });
};

const channelPhotoCache = new Map();
const CHANNEL_PHOTO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

const getTelegramFileUrl = async (fileId) => {
  if (!fileId) return null;
  try {
    const cached = channelPhotoCache.get(fileId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    const file = await bot.telegram.getFile(fileId);
    if (!file?.file_path) return null;
    const url = `https://api.telegram.org/file/bot${TOKEN}/${file.file_path}`;
    channelPhotoCache.set(fileId, { url, expiresAt: Date.now() + CHANNEL_PHOTO_CACHE_TTL_MS });
    return url;
  } catch (e) {
    return null;
  }
};

const maskPromoCode = (code) => {
  if (!code) return '';
  const raw = String(code);
  if (raw.length <= 1) return raw;
  return `${raw[0]}${'*'.repeat(raw.length - 1)}`;
};

const hasLinkedSocials = (userId) => {
  const user = DB.getUser(userId) || {};
  const channels = DB.getUserChannels(userId);
  return Boolean(user.twitch_channel) || (channels && channels.length > 0);
};

const editOrReply = async (ctx, text, extra) => {
  try {
    return await ctx.editMessageText(text, extra);
  } catch (e) {
    const desc = e?.response?.description || '';
    if (desc.includes('message is not modified')) return null;
    try {
      return await ctx.reply(text, extra);
    } catch (err) {
      return null;
    }
  }
};

const base64UrlEncode = (value) => (
  Buffer.from(value).toString('base64').replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_')
);

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + '='.repeat(padLength);
  return Buffer.from(padded, 'base64').toString('utf8');
};

const signAuthToken = (payload, expiresInSec = AUTH_TOKEN_TTL_SEC) => {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: now, exp: now + expiresInSec }));
  const signature = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(`${header}.${body}`).digest('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${header}.${body}.${signature}`;
};

const verifyAuthToken = (token) => {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = crypto.createHmac('sha256', AUTH_TOKEN_SECRET).update(`${header}.${body}`).digest('base64')
    .replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(base64UrlDecode(body));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
};

const parseCookies = (cookieHeader) => {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {});
};

const getAuthToken = (req) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  const cookies = parseCookies(req.headers.cookie);
  if (cookies.tg_session) return cookies.tg_session;
  if (req.query?.token) return req.query.token;
  return null;
};

const pickTelegramAuthData = (query) => {
  const allowed = ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date'];
  const data = {};
  allowed.forEach((key) => {
    if (query[key] !== undefined) data[key] = query[key];
  });
  return data;
};

const verifyTelegramAuth = (data, hash) => {
  if (!hash) return false;
  const secret = crypto.createHash('sha256').update(TOKEN).digest();
  const dataCheckString = Object.keys(data).sort().map((key) => `${key}=${data[key]}`).join('\n');
  const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (hmac.length !== hash.length) return false;
  return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(hash));
};

const getTelegramInitData = (req) => {
  const header = req.headers['x-telegram-init-data'];
  const query = req.query?.init_data || req.query?.initData;
  const body = req.body?.init_data || req.body?.initData;
  const raw = header || query || body;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0];
  return String(raw);
};

const verifyWebAppInitData = (initData) => {
  if (!initData || typeof initData !== 'string') return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;

  params.delete('hash');
  params.delete('signature');

  const dataCheckString = Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(TOKEN).digest();
  const signature = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (signature.length !== hash.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash))) return null;

  const authDate = Number(params.get('auth_date'));
  if (Number.isFinite(authDate)) {
    const ageSec = Math.floor(Date.now() / 1000) - authDate;
    const webappTtl = Number.isFinite(TELEGRAM_WEBAPP_TTL_SEC) ? TELEGRAM_WEBAPP_TTL_SEC : 7 * 24 * 60 * 60;
    if (webappTtl > 0 && ageSec > webappTtl) return null;
  }

  const rawUser = params.get('user');
  if (!rawUser) return null;
  try {
    const user = JSON.parse(rawUser);
    if (!user?.id) return null;
    return { user, auth_date: authDate };
  } catch (e) {
    return null;
  }
};

const getAuthUserId = (req) => {
  const token = getAuthToken(req);
  const payload = verifyAuthToken(token);
  if (payload?.sub) return payload.sub;

  const initData = getTelegramInitData(req);
  const verified = verifyWebAppInitData(initData);
  if (verified?.user?.id) return normalizeUserId(verified.user.id);
  return null;
};

const buildAuthCookie = (token, req) => {
  const isSecure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const parts = [
    `tg_session=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${AUTH_TOKEN_TTL_SEC}`,
    'HttpOnly',
    'SameSite=Lax'
  ];
  if (isSecure) parts.push('Secure');
  return parts.join('; ');
};

const TWITCH_VERIFY_PREFIX = 'VERIFY-';
const TWITCH_VERIFY_CODE_LEN = 6;
const LOGIN_CODE_LEN = 6;
const LOGIN_PREFIX = 'login_';
const LOGIN_CODE_TTL_MS = 5 * 60 * 1000;

const generateVerificationCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(TWITCH_VERIFY_CODE_LEN);
  let out = '';
  for (let i = 0; i < TWITCH_VERIFY_CODE_LEN; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return `${TWITCH_VERIFY_PREFIX}${out}`;
};

const generateLoginCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(LOGIN_CODE_LEN);
  let out = '';
  for (let i = 0; i < LOGIN_CODE_LEN; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
};

const buildLoginKey = (code) => (code.startsWith(LOGIN_PREFIX) ? code : `${LOGIN_PREFIX}${code}`);

const TWITCH_TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;

const getTwitchHeaders = async () => ({
  'Client-Id': getTwitchClientId(),
  'Authorization': `Bearer ${await ensureTwitchAccessToken()}`
});

const validateTwitchToken = async (token) => {
  if (!token) return null;
  try {
    const res = await axios.get('https://id.twitch.tv/oauth2/validate', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.data || null;
  } catch (e) {
    return null;
  }
};

const refreshTwitchAccessToken = async (reason = 'auto') => {
  const clientId = getTwitchClientId();
  const clientSecret = getTwitchClientSecret();
  const refreshToken = getTwitchRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Twitch refresh config missing');
  }

  const res = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret
    }
  });

  const data = res.data || {};
  const accessToken = String(data.access_token || '').trim();
  const newRefresh = String(data.refresh_token || refreshToken).trim();
  const expiresAt = data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : 0;

  setTwitchConfig({
    accessToken,
    refreshToken: newRefresh,
    expiresAt
  });

  console.log(`[Twitch] Token refreshed (${reason}). Expires in ${data.expires_in || 'unknown'}s`);
  return accessToken;
};

const ensureTwitchAccessToken = async () => {
  const token = getTwitchAccessToken();
  if (!token) throw new Error('TWITCH_ACCESS_TOKEN missing');

  const expiresAt = Number(twitchConfig.expiresAt || 0);
  if (expiresAt && expiresAt - Date.now() > TWITCH_TOKEN_REFRESH_MARGIN_MS) {
    return token;
  }

  if (expiresAt && expiresAt - Date.now() <= TWITCH_TOKEN_REFRESH_MARGIN_MS) {
    return await refreshTwitchAccessToken('expiring');
  }

  const validation = await validateTwitchToken(token);
  if (validation?.expires_in) {
    const newExpiresAt = Date.now() + Number(validation.expires_in) * 1000;
    setTwitchConfig({ expiresAt: newExpiresAt }, true);
    if (validation.expires_in <= Math.ceil(TWITCH_TOKEN_REFRESH_MARGIN_MS / 1000)) {
      return await refreshTwitchAccessToken('expiring');
    }
  } else if (getTwitchRefreshToken()) {
    return await refreshTwitchAccessToken('validate_failed');
  }

  return token;
};

const twitchRequest = async (requestFn) => {
  try {
    return await requestFn(await getTwitchHeaders());
  } catch (e) {
    if (e.response?.status === 401 || e.response?.status === 403) {
      if (getTwitchRefreshToken()) {
        await refreshTwitchAccessToken(`http_${e.response.status}`);
        return await requestFn(await getTwitchHeaders());
      }
    }
    throw e;
  }
};

const twitchProfileCache = new Map();
const TWITCH_PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;

const ensureTwitchBotLogin = async () => {
  if (TWITCH_BOT_LOGIN) return TWITCH_BOT_LOGIN;
  const accessToken = await ensureTwitchAccessToken();
  const res = await axios.get('https://id.twitch.tv/oauth2/validate', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  TWITCH_BOT_LOGIN = (res.data?.login || '').toLowerCase();
  if (!TWITCH_BOT_LOGIN) throw new Error('Could not resolve Twitch bot login');
  setTwitchConfig({ botLogin: TWITCH_BOT_LOGIN });
  return TWITCH_BOT_LOGIN;
};

const fetchTwitchUserByLogin = async (login) => {
  const cleanLogin = login.trim().replace(/^@/, '').toLowerCase();
  if (!cleanLogin) return null;
  const res = await twitchRequest((headers) => axios.get(`https://api.twitch.tv/helix/users`, {
    headers,
    params: { login: cleanLogin }
  }));
  return res?.data?.data?.[0] || null;
};

const getCachedTwitchProfile = async (login) => {
  const cleanLogin = String(login || '').trim().replace(/^@/, '').toLowerCase();
  if (!cleanLogin) return null;
  const cached = twitchProfileCache.get(cleanLogin);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const data = await fetchTwitchUserByLogin(cleanLogin);
  if (!data) return null;
  twitchProfileCache.set(cleanLogin, { data, expiresAt: Date.now() + TWITCH_PROFILE_CACHE_TTL_MS });
  return data;
};

const twitchIrcState = {
  socket: null,
  connected: false,
  connecting: false,
  buffer: '',
  desired: new Set(),
  joined: new Set(),
  reconnectTimer: null
};

const sendTwitchIrc = (msg) => {
  if (twitchIrcState.socket && twitchIrcState.connected) {
    twitchIrcState.socket.write(`${msg}\r\n`);
  }
};

const parseIrcTags = (raw) => {
  const tags = {};
  raw.split(';').forEach(part => {
    if (!part) return;
    const idx = part.indexOf('=');
    if (idx === -1) {
      tags[part] = '';
      return;
    }
    tags[part.slice(0, idx)] = part.slice(idx + 1);
  });
  return tags;
};

const parseIrcLine = (line) => {
  let rest = line;
  let tags = {};
  if (rest.startsWith('@')) {
    const spaceIdx = rest.indexOf(' ');
    const rawTags = rest.slice(1, spaceIdx);
    tags = parseIrcTags(rawTags);
    rest = rest.slice(spaceIdx + 1);
  }

  if (rest.startsWith('PING')) {
    return { command: 'PING', trailing: rest.slice(5) };
  }

  let prefix = '';
  if (rest.startsWith(':')) {
    const spaceIdx = rest.indexOf(' ');
    prefix = rest.slice(1, spaceIdx);
    rest = rest.slice(spaceIdx + 1);
  }

  let trailing = '';
  const trailingIdx = rest.indexOf(' :');
  if (trailingIdx !== -1) {
    trailing = rest.slice(trailingIdx + 2);
    rest = rest.slice(0, trailingIdx);
  }

  const parts = rest.split(' ').filter(Boolean);
  const command = parts.shift() || '';
  return { tags, prefix, command, params: parts, trailing };
};

const handleTwitchPrivmsg = async (parsed) => {
  const channel = (parsed.params?.[0] || '').replace('#', '').toLowerCase();
  const message = (parsed.trailing || '').trim();
  if (!channel || !message) return;
  if (!message.toLowerCase().startsWith('!verify')) return;

  const code = message.split(' ')[1]?.trim()?.toUpperCase();
  if (!code) return;

  const pending = DB.getPendingTwitchVerificationByChannel(channel);
  if (!pending) return;

  const now = Date.now();
  if (pending.expires_at <= now) {
    DB.setTwitchVerificationStatus(pending.id, 'expired');
    return;
  }

  if (pending.code !== code) return;

  const tags = parsed.tags || {};
  const badges = tags['badges'] || '';
  const userId = tags['user-id'] || '';
  const isBroadcaster = badges.split(',').includes('broadcaster/1') || (userId && pending.channel_id && userId === pending.channel_id);

  if (!isBroadcaster) return;

  DB.setTwitchVerificationStatus(pending.id, 'verified', now);
  DB.createUser(pending.user_id);
  DB.updateTwitch(pending.user_id, pending.channel_login, 500, pending.channel_id);
  revokeUserVerification(pending.user_id);

  try {
    await bot.telegram.sendMessage(
      pending.user_id,
      `✅ <b>Twitch-канал ${pending.channel_login} подтвержден и привязан.</b>\n\n` +
      `Теперь добавьте бота модератором: <code>/mod ${TWITCH_BOT_LOGIN || 'unbanmepls_lol'}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (e) { }

  if (!DB.getPendingTwitchVerificationByChannel(channel)) {
    twitchUnwatchChannel(channel);
  }
};

const handleTwitchIrcLine = (line) => {
  const parsed = parseIrcLine(line);
  if (parsed.command === 'PING') {
    sendTwitchIrc(`PONG ${parsed.trailing ? `:${parsed.trailing}` : ':tmi.twitch.tv'}`);
    return;
  }
  if (parsed.command === 'PRIVMSG') {
    handleTwitchPrivmsg(parsed).catch((e) => {
      console.error('[Twitch Verify] IRC handler error:', e.message);
    });
  }
};

const connectTwitchIrc = () => {
  if (twitchIrcState.connected || twitchIrcState.connecting) return;
  twitchIrcState.connecting = true;

  const socket = tls.connect(6697, 'irc.chat.twitch.tv', { servername: 'irc.chat.twitch.tv' });
  twitchIrcState.socket = socket;
  socket.setEncoding('utf8');

  socket.on('secureConnect', async () => {
    twitchIrcState.connected = true;
    twitchIrcState.connecting = false;
    try {
      await ensureTwitchBotLogin();
      const chatToken = getTwitchChatToken();
      const tokenToUse = chatToken || await ensureTwitchAccessToken();
      const pass = `oauth:${tokenToUse}`;
      sendTwitchIrc(`PASS ${pass}`);
      sendTwitchIrc(`NICK ${TWITCH_BOT_LOGIN}`);
      sendTwitchIrc('CAP REQ :twitch.tv/tags twitch.tv/commands');
      twitchIrcState.desired.forEach((channel) => {
        sendTwitchIrc(`JOIN #${channel}`);
        twitchIrcState.joined.add(channel);
      });
    } catch (e) {
      console.error('[Twitch Verify] IRC connect failed:', e.message);
      socket.end();
    }
  });

  socket.on('data', (data) => {
    twitchIrcState.buffer += data;
    const lines = twitchIrcState.buffer.split('\r\n');
    twitchIrcState.buffer = lines.pop() || '';
    lines.forEach(handleTwitchIrcLine);
  });

  socket.on('error', (err) => {
    console.error('[Twitch Verify] IRC error:', err.message);
  });

  socket.on('close', () => {
    twitchIrcState.connected = false;
    twitchIrcState.connecting = false;
    twitchIrcState.joined.clear();
    if (twitchIrcState.desired.size > 0) {
      if (!twitchIrcState.reconnectTimer) {
        twitchIrcState.reconnectTimer = setTimeout(() => {
          twitchIrcState.reconnectTimer = null;
          connectTwitchIrc();
        }, 3000);
      }
    }
  });
};

const ensureTwitchIrc = async () => {
  if (!getTwitchClientId() || !getTwitchAccessToken()) {
    throw new Error('Twitch API keys missing');
  }
  if (!getTwitchChatToken() && !getTwitchAccessToken()) {
    throw new Error('TWITCH_CHAT_TOKEN missing');
  }
  await ensureTwitchBotLogin();
  connectTwitchIrc();
};

const twitchWatchChannel = async (channel) => {
  const clean = channel.toLowerCase();
  twitchIrcState.desired.add(clean);
  await ensureTwitchIrc();
  if (twitchIrcState.connected && !twitchIrcState.joined.has(clean)) {
    sendTwitchIrc(`JOIN #${clean}`);
    twitchIrcState.joined.add(clean);
  }
};

const twitchUnwatchChannel = (channel) => {
  const clean = channel.toLowerCase();
  twitchIrcState.desired.delete(clean);
  if (twitchIrcState.connected && twitchIrcState.joined.has(clean)) {
    sendTwitchIrc(`PART #${clean}`);
    twitchIrcState.joined.delete(clean);
  }
};

const initTwitchVerificationWatchers = () => {
  const channels = DB.getActiveTwitchVerificationChannels();
  channels.forEach((ch) => twitchIrcState.desired.add(ch.toLowerCase()));
  if (channels.length > 0) {
    ensureTwitchIrc().catch((e) => {
      console.error('[Twitch Verify] IRC init failed:', e.message);
    });
  }
};

const startTwitchVerification = async (userId, channelNameRaw) => {
  const channelLogin = channelNameRaw.trim().replace(/^@/, '').toLowerCase();
  if (!channelLogin) {
    return { success: false, error: 'Введите название канала.' };
  }

  if (!/^[a-z0-9_]{3,25}$/.test(channelLogin)) {
    return { success: false, error: 'Некорректный логин канала.' };
  }

  DB.createUser(userId);

  const user = DB.getUser(userId);
  if (user?.twitch_channel && user.twitch_channel.toLowerCase() !== channelLogin) {
    return { success: false, error: 'Сначала отвяжите текущий Twitch-канал.' };
  }

  let channelInfo;
  try {
    channelInfo = await fetchTwitchUserByLogin(channelLogin);
  } catch (e) {
    return { success: false, error: 'Не удалось получить данные Twitch-канала.' };
  }

  if (!channelInfo?.id) {
    return { success: false, error: 'Канал не найден на Twitch.' };
  }

  if (DB.checkTwitchLinked(channelLogin, userId, channelInfo.id)) {
    return { success: false, error: 'Этот канал уже привязан к другому аккаунту.' };
  }

  const now = Date.now();
  const pendingByUser = DB.getPendingTwitchVerificationByUser(userId);
  if (pendingByUser && pendingByUser.expires_at <= now) {
    DB.setTwitchVerificationStatus(pendingByUser.id, 'expired');
  }
  if (pendingByUser && pendingByUser.channel_login === channelLogin && pendingByUser.expires_at > now) {
    return {
      success: true,
      requestId: pendingByUser.id,
      channelLogin: pendingByUser.channel_login,
      channelId: pendingByUser.channel_id,
      code: pendingByUser.code,
      expiresAt: pendingByUser.expires_at,
      botLogin: TWITCH_BOT_LOGIN || null
    };
  }
  if (pendingByUser) {
    DB.setTwitchVerificationStatus(pendingByUser.id, 'expired');
  }

  const pendingByChannel = DB.getPendingTwitchVerificationByChannel(channelLogin);
  if (pendingByChannel && pendingByChannel.expires_at <= now) {
    DB.setTwitchVerificationStatus(pendingByChannel.id, 'expired');
  }
  if (pendingByChannel && pendingByChannel.user_id !== userId && pendingByChannel.expires_at > now) {
    return { success: false, error: 'Канал уже в процессе верификации другим пользователем.' };
  }

  try {
    await twitchWatchChannel(channelLogin);
  } catch (e) {
    return { success: false, error: 'Не удалось подключиться к Twitch-чату.' };
  }
  const code = generateVerificationCode();
  const requestId = crypto.randomUUID();

  DB.createTwitchVerification({
    id: requestId,
    user_id: userId,
    channel_login: channelLogin,
    channel_id: channelInfo.id,
    code,
    status: 'pending',
    created_at: now,
    expires_at: now + TWITCH_VERIFY_TTL_MS,
    verified_at: null
  });

  return {
    success: true,
    requestId,
    channelLogin,
    channelId: channelInfo.id,
    code,
    expiresAt: now + TWITCH_VERIFY_TTL_MS,
    botLogin: TWITCH_BOT_LOGIN || null
  };
};

const buildTwitchVerifyMessage = (channelLogin, code, expiresAt) => {
  const minutesLeft = Math.max(1, Math.ceil((expiresAt - Date.now()) / 60000));
  const verifyCommand = `!verify ${code}`;
  return (
    `🔒 <b>Подтверждение владения Twitch каналом</b>\n\n` +
    `Канал: <b>${channelLogin}</b>\n` +
    `Код: <code>${verifyCommand}</code> (кликабельно)\n` +
    `Срок действия кода: ${minutesLeft} мин\n\n` +
    `1. Откройте чат своего Twitch-канала\n` +
    `2. Напишите сообщение: <code>${verifyCommand}</code> (кликабельно)\n` +
    `3. Канал автоматически привяжется\n` +
    `(если не привязался, вернитесь сюда и нажмите кнопку «Проверить»)\n\n` +
    `После подтверждения бот попросит выдать себе модератора на вашем Twitch канале`
  );
};


function clearUserState(userId) {
  const prefixes = [
    'setname_',
    'twitch_',
    'setprice_',
    'search_',
    'linktg_',
    'twitchprice_',
    'unban_',
    'broadcast_',
    'withdraw_',
    'slug_',
    'promo_create_',
    'promo_activate_',
    'commission_',
    'admin_slug_',
    'admin_verify_'
  ];
  prefixes.forEach(p => {
    DB.deletePending(`${p}${userId}`);
  });
}

const resolveBotUsername = async (ctx) => {
  if (ctx.botInfo?.username) return ctx.botInfo.username;
  if (BOT_USERNAME) return BOT_USERNAME;
  const me = await ctx.telegram.getMe();
  return me.username;
};

const normalizeSearchQuery = (input) => {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const linkMatch = raw.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^/?#]+)/i);
  let out = linkMatch ? linkMatch[1] : raw;
  out = out.replace(/^@/, '');
  return out.toLowerCase();
};

const normalizeLogin = (value) => String(value || '').trim().replace(/^@/, '').toLowerCase();
const normalizeChannelTitle = (value) => String(value || '').trim().toLowerCase();

const scoreSearchMatch = (query, value) => {
  if (!query || !value) return 0;
  if (value === query) return 3;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 1;
  return 0;
};

const pickSearchMatch = (rawQuery, user, channels) => {
  const normalized = normalizeSearchQuery(rawQuery);
  const cleaned = normalizeLogin(rawQuery);
  const twitchLogin = normalizeLogin(user?.twitch_channel);

  const twitchScore = Math.max(
    scoreSearchMatch(normalized, twitchLogin),
    scoreSearchMatch(cleaned, twitchLogin)
  );

  let bestTg = { score: 0, channel: null, label: null };
  if (Array.isArray(channels)) {
    channels.forEach((channel) => {
      const uname = normalizeLogin(channel?.username);
      const title = normalizeChannelTitle(channel?.title);
      const unameScore = Math.max(scoreSearchMatch(cleaned, uname), scoreSearchMatch(normalized, uname));
      const titleScore = scoreSearchMatch(normalized, title);
      const score = Math.max(unameScore, titleScore);
      if (score > bestTg.score) {
        const label = unameScore >= titleScore
          ? (channel?.username ? String(channel.username).trim().replace(/^@/, '') : null)
          : (channel?.title ? String(channel.title).trim() : null);
        bestTg = { score, channel, label };
      }
    });
  }

  let platform = null;
  if (twitchScore > 0 || bestTg.score > 0) {
    if (twitchScore > bestTg.score) {
      platform = 'twitch';
    } else if (bestTg.score > twitchScore) {
      platform = 'telegram';
    } else {
      platform = null;
    }
  }

  if (platform === 'twitch' && twitchLogin) {
    return { platform, label: user?.twitch_channel || twitchLogin, channelId: null };
  }
  if (platform === 'telegram' && bestTg.channel) {
    return {
      platform,
      label: bestTg.label || normalizeChannelLabel(bestTg.channel),
      channelId: bestTg.channel.id
    };
  }
  return { platform: null, label: null, channelId: null };
};

const findMatchingTgChannel = (channels, twitchLogin) => {
  const twitch = normalizeLogin(twitchLogin);
  if (!twitch || !Array.isArray(channels)) return null;
  return channels.find(ch => {
    const uname = normalizeLogin(ch?.username);
    const title = normalizeChannelTitle(ch?.title);
    return (uname && uname === twitch) || (title && title === twitch);
  }) || null;
};

const buildPersonalLinkText = (botUsername, userId, slug) => {
  const payload = slug ? slug : `b_${userId}`;
  const link = `https://t.me/${botUsername}?start=${payload}`;
  const slugInfo = slug ? `<code>${slug}</code>` : 'по умолчанию (ID)';

  return (
    `🔗 <b>Ваша персональная ссылка</b>\n\n` +
    `Персональная ссылка - это ссылка для ваших подписчиков\n` +
    `При переходе по персональной ссылке, ваши подписчики сразу же будут попадать на страницу с вашими каналами, и им не прийдется использовать поиск ваших каналов внутри приложения вручную\n\n` +
    `${link} (кликабельно)\n\n` +
    `Ваша персональная ссылка: ${slugInfo}`
  );
};

const buildPersonalLinkKeyboard = (hasSlug) => {
  const buttons = [
    [Markup.button.callback('✏️ Изменить адрес', 'blogger:slug_set')],
    [Markup.button.callback('🎲 Random', 'blogger:slug_random')]
  ];
  if (hasSlug) {
    buttons.push([Markup.button.callback('♻️ Сбросить', 'blogger:slug_reset')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'blogger:setup')]);
  return Markup.inlineKeyboard(buttons);
};

const renderPersonalLink = async (ctx, options = {}) => {
  const userId = String(ctx.from.id);
  DB.createUser(userId);
  const user = DB.getUser(userId);
  const botUsername = await resolveBotUsername(ctx);
  const slug = user?.link_slug || null;
  const text = buildPersonalLinkText(botUsername, userId, slug);
  const keyboard = buildPersonalLinkKeyboard(!!slug);
  const chatId = ctx.chat?.id || ctx.callbackQuery?.message?.chat?.id;

  if (options.messageId && chatId) {
    try {
      await ctx.telegram.editMessageText(chatId, options.messageId, null, text, { parse_mode: 'HTML', disable_web_page_preview: true, ...keyboard });
      return;
    } catch (e) { }
  }

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', disable_web_page_preview: true, ...keyboard });
  }
};


async function createNicePayInvoice(amount, orderId, customer, description, successUrl, failUrl) {
  try {
    if (Number(amount) < NICEPAY_MIN_AMOUNT_RUB) {
      return { success: false, error: `Минимальная сумма для оплаты картой: ${NICEPAY_MIN_AMOUNT_RUB} ₽` };
    }
    const amountCents = Math.round(amount * 100);
    const payload = {
      merchant_id: NICEPAY_MERCHANT_ID,
      secret: NICEPAY_SECRET_KEY,
      order_id: orderId,
      customer: customer,
      amount: amountCents,
      currency: 'RUB',
      description: description,
      success_url: successUrl,
      fail_url: failUrl
    };

    const response = await axios.post('https://nicepay.io/public/api/payment', payload, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.data.status === 'success') {
      return {
        success: true,
        invoiceId: response.data.data.payment_id,
        paymentUrl: response.data.data.link,
        amount: response.data.data.amount
      };
    }
    return { success: false, error: response.data.data.message || 'Payment creation failed' };
  } catch (error) {
    console.error('NicePay Error:', error.response?.data || error.message);
    return { success: false, error: 'Payment creation error' };
  }
}

async function unbanTwitchUserGlobal(broadcasterNameRaw, targetUsername) {
  if (!getTwitchClientId() || !getTwitchAccessToken()) throw new Error('Twitch not configured');

  const broadcasterName = broadcasterNameRaw.trim().replace(/^@/, '');

  const meRes = await twitchRequest((h) => axios.get(`https://api.twitch.tv/helix/users`, { headers: h }));
  const botTwitchId = meRes?.data?.data?.[0]?.id;
  if (!botTwitchId) throw new Error("Could not fetch Bot Twitch ID");

  const bRes = await twitchRequest((h) => axios.get(`https://api.twitch.tv/helix/users?login=${broadcasterName}`, { headers: h }));
  const broadcasterId = bRes?.data?.data?.[0]?.id;
  if (!broadcasterId) throw new Error("Broadcaster not found");

  const uRes = await twitchRequest((h) => axios.get(`https://api.twitch.tv/helix/users?login=${targetUsername}`, { headers: h }));
  const userId = uRes?.data?.data?.[0]?.id;

  if (!userId) throw new Error("Target user not found on Twitch");

  await twitchRequest((h) => axios.delete(
    `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${botTwitchId}&user_id=${userId}`,
    { headers: h }
  ));
}


app.post('/api/user/:userId/slug', async (req, res) => {
  const { userId } = req.params;
  const { slug } = req.body;
  const authUserId = getAuthUserId(req);

  if (!authUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (String(authUserId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

  if (!slug || slug.length < 3 || slug.length > 32) {
    return res.status(400).json({ error: 'Slug must be between 3 and 32 characters' });
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    return res.status(400).json({ error: 'Slug contains invalid characters. Use letters, numbers, underscores, and dashes.' });
  }

  const existing = DB.checkSlugExists(slug, userId);
  if (existing) {
    return res.status(409).json({ error: 'Slug already taken' });
  }

  DB.updateUserSlug(userId, slug);
  res.json({ success: true, slug });
});

app.delete('/api/user/:userId/slug', async (req, res) => {
  const { userId } = req.params;
  const authUserId = getAuthUserId(req);

  if (!authUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (String(authUserId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

  DB.updateUserSlug(userId, null);
  res.json({ success: true });
});

app.get('/api/user/:userId/slug/random', async (req, res) => {
  const { userId } = req.params;
  const authUserId = getAuthUserId(req);

  if (!authUserId) return res.status(401).json({ error: 'Unauthorized' });
  if (String(authUserId) !== String(userId)) return res.status(403).json({ error: 'Forbidden' });

  let slug;
  let attempts = 0;
  do {
    slug = crypto.randomBytes(4).toString('hex');
    attempts++;
  } while (DB.checkSlugExists(slug, userId) && attempts < 10);

  if (attempts >= 10) return res.status(500).json({ error: 'Could not generate unique slug' });

  res.json({ success: true, slug });
});

app.get('/api/user/:userId/link', async (req, res) => {
  const user = DB.getUser(req.params.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ slug: user.link_slug, id: user.id });
});



const isAdmin = (id) => ADMIN_IDS.includes(String(id));

const buildAdminVerifyText = (user) => {
  const displayName = user?.display_name || user?.twitch_channel || `ID: ${user?.id ?? ''}`;
  const status = user?.is_verified ? '⭐ Подтвержден' : '❌ Не подтвержден';
  return `⭐ <b>Верификация соцсетей</b>\n\n` +
    `Пользователь: <b>${displayName}</b>\n` +
    `ID: <code>${user?.id ?? ''}</code>\n` +
    `Статус: ${status}`;
};

const buildAdminVerifyKeyboard = (targetId, isVerified) => Markup.inlineKeyboard([
  [Markup.button.callback(isVerified ? '❌ Снять подтверждение' : '⭐ Подтвердить', `admin:verify_set:${targetId}:${isVerified ? 0 : 1}`)],
  [Markup.button.callback('« Назад', 'admin:back')]
]);

bot.command('admin', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Глобальная статистика', 'admin:stats')],
    [Markup.button.callback('🎁 Промокоды', 'admin:promos')],
    [Markup.button.callback('🔗 Назначить персональную ссылку', 'admin:slug_assign')],
    [Markup.button.callback('⭐ Верификация', 'admin:verify_social')],
    [Markup.button.callback('📢 Рассылка всем', 'admin:broadcast')],
    [Markup.button.callback('🗑 Закрыть', 'delete_msg')]
  ]);

  await ctx.reply('🔒 <b>Админ-панель</b>', { parse_mode: 'HTML', ...keyboard });
});

bot.action('admin:stats', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();

  const stats = DB.getGlobalStats();
  const commission = Number(DB.getConfig('commission')) || 25;
  const botEarnings = Math.round(stats.income * (commission / 100));

  const text = `📊 <b>Статистика Бота</b>\n\n` +
    `👥 Пользователей: <b>${stats.users}</b>\n` +
    `📢 Каналов: <b>${stats.channels}</b>\n` +
    `💰 Оборот: <b>${stats.income} ₽</b>\n` +
    `🛒 Покупок: <b>${stats.purchases}</b>\n` +
    `💸 Комиссия бота: <b>${commission}%</b>\n` +
    `🤑 Заработано ботом: <b>${botEarnings} ₽</b>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('⚙️ Изменить комиссию', 'admin:edit_commission')],
    [Markup.button.callback('« Назад', 'admin:back')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
});

bot.action('admin:back', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📊 Глобальная статистика', 'admin:stats')],
    [Markup.button.callback('🎁 Промокоды', 'admin:promos')],
    [Markup.button.callback('🔗 Назначить персональную ссылку', 'admin:slug_assign')],
    [Markup.button.callback('⭐ Верификация', 'admin:verify_social')],
    [Markup.button.callback('📢 Рассылка всем', 'admin:broadcast')],
    [Markup.button.callback('🗑 Закрыть', 'delete_msg')]
  ]);
  await ctx.editMessageText('🔒 <b>Админ-панель</b>', { parse_mode: 'HTML', ...keyboard });
});

bot.action('admin:broadcast', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();

  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.setPending(`broadcast_${userId}`, { stage: 'awaiting_broadcast_text', userId, promptId: ctx.callbackQuery.message.message_id });

  await ctx.editMessageText(
    '📢 <b>Рассылка</b>\n\nОтправьте сообщение (текст или фото с описанием).\nСообщение получат ВСЕ пользователи бота.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:back')]]) }
  );
});

bot.action('admin:edit_commission', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  const current = DB.getConfig('commission') || '25';
  DB.setPending(`commission_${userId}`, { stage: 'awaiting_commission_change', userId, promptId: ctx.callbackQuery.message.message_id });

  await ctx.editMessageText(
    `⚙️ <b>Изменение комиссии</b>\n\nТекущая комиссия: <b>${current}%</b>\n\nВведите новое значение (от 0 до 100):`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:back')]]) }
  );
});

bot.action('admin:slug_assign', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const adminId = String(ctx.from.id);
  clearUserState(adminId);

  DB.setPending(`admin_slug_${adminId}`, {
    stage: 'awaiting_target',
    adminId,
    promptId: ctx.callbackQuery.message.message_id
  });

  await ctx.editMessageText(
    '🔗 <b>Назначить персональную ссылку</b>\n\nВведите ID пользователя или @username:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]]) }
  );
});

bot.action('admin:verify_social', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const adminId = String(ctx.from.id);
  clearUserState(adminId);

  DB.setPending(`admin_verify_${adminId}`, {
    stage: 'awaiting_target',
    adminId,
    promptId: ctx.callbackQuery.message.message_id
  });

  await ctx.editMessageText(
    '⭐ <b>Верификация соцсетей</b>\n\nВведите ID пользователя или @username:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]]) }
  );
});

bot.action(/admin:verify_set:(.+):([01])/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();

  const targetId = String(ctx.match[1] || '');
  const value = ctx.match[2] === '1';

  if (!targetId) return;
  DB.createUser(targetId);
  DB.setUserVerified(targetId, value);
  const target = DB.getUser(targetId);
  const text = buildAdminVerifyText(target);
  const keyboard = buildAdminVerifyKeyboard(targetId, !!target?.is_verified);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
});


bot.start(async (ctx) => {
  if (ctx.from && ctx.from.username) {
    DB.saveUsername(ctx.from.username, String(ctx.from.id));
  }
  clearUserState(ctx.from.id);

  const payload = ctx.message.text.split(' ')[1];


  if (payload && payload.startsWith(LOGIN_PREFIX)) {
    const loginKey = payload;
    const pendingLogin = DB.getPending(loginKey);
    if (!pendingLogin) {
      return ctx.reply('❌ Ссылка устарела. Вернитесь на сайт и получите новый код.');
    }

    if (pendingLogin.expiresAt && pendingLogin.expiresAt <= Date.now()) {
      DB.deletePending(loginKey);
      return ctx.reply('❌ Код истек. Вернитесь на сайт и получите новый.');
    }

    const userId = String(ctx.from.id);
    if (pendingLogin.userId && String(pendingLogin.userId) !== userId) {
      return ctx.reply('❌ Этот код уже использован другим пользователем.');
    }

    DB.createUser(userId);
    if (ctx.from.username) {
      DB.saveUsername(ctx.from.username, userId);
    }

    const token = signAuthToken({ sub: userId, username: ctx.from.username || null });
    DB.setPending(loginKey, {
      ...pendingLogin,
      status: 'verified',
      userId,
      token,
      verifiedAt: Date.now()
    });

    return ctx.reply('✅ Вход подтвержден. Вернитесь на сайт и обновите страницу.');
  }

  if (payload && payload.startsWith('b_')) {
    const rawTarget = payload.slice(2).trim();

    let blogger = DB.getUser(rawTarget);

    if (!blogger) {
      blogger = DB.getUserBySlug(rawTarget);
    }

    if (blogger) {
      ctx.match = [null, blogger.id];
      return showBloggerProfile(ctx, blogger.id);
    }
  }

  if (payload && !payload.startsWith(LOGIN_PREFIX) && payload !== 'app' && payload !== 'webapp') {
    const cleanPayload = payload.trim();

    const bloggerBySlug = DB.getUserBySlug(cleanPayload);

    if (bloggerBySlug) {
      ctx.match = [null, bloggerBySlug.id];
      return showBloggerProfile(ctx, bloggerBySlug.id);
    }
  }

  if (payload && (payload === 'app' || payload === 'webapp')) {
    if (!WEBAPP_URL) {
      return ctx.reply('Ссылка на WebApp не настроена. Напишите администратору.');
    }
    return ctx.reply(
      'Откройте мини‑приложение кнопкой ниже:',
      Markup.inlineKeyboard([[Markup.button.webApp('🚀 Открыть WebApp', WEBAPP_URL)]])
    );
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔓 Разбаниться', 'unban:start')],
    [Markup.button.callback('🎬 Панель медиа', 'blogger:setup')]
  ]);
  await ctx.reply(`Я бот для покупки разбанов\n\nВыберите действие:`, keyboard);
});



bot.action('blogger:setup', async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) { }
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.createUser(userId);

  const blogger = DB.getUser(userId);
  const channels = DB.getUserChannels(userId);
  const balance = calculateBalance(userId);

  const twitchChannel = blogger.twitch_channel ? `✅ ${blogger.twitch_channel}` : '❌ Нет';
  const tgChannels = channels.length > 0 ? `✅ ${channels.length} шт` : '❌ Нет';

  const text = `🎬 <b>Панель медиа</b>\n\n` +
    `👾 Twitch: ${twitchChannel}\n` +
    `💬 Telegram: ${tgChannels}`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('📢 Каналы', 'blogger:channels_menu')],
    [Markup.button.callback('💰 Финансы', 'blogger:finance_menu')],
    [Markup.button.callback('🔗 Персональная ссылка', 'blogger:get_deeplink')],
    [Markup.button.callback('« Главное меню', 'back:main')]
  ]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
});

bot.action('blogger:getlink', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = ctx.from.id;
  const botUsername = ctx.botInfo.username;
  const link = `https://t.me/${botUsername}?start=b_${userId}`;

  await ctx.reply(
    `🔗 <b>Ваша ссылка для подписчиков:</b>\n\n${link}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('🗑 Скрыть', 'delete_msg')]])
    }
  );
});

bot.action('delete_msg', async (ctx) => { await ctx.deleteMessage(); });

function calculateBalance(userId) {
  const purchases = DB.getPurchases(userId);
  const withdrawals = DB.getWithdrawals(userId);

  const totalEarned = purchases.reduce((sum, p) => sum + (p.net_amount || p.price || 0), 0);
  const totalWithdrawn = withdrawals
    .filter(w => w.status !== 'rejected')
    .reduce((sum, w) => sum + (w.amount || 0), 0);

  return totalEarned - totalWithdrawn;
}



bot.action('blogger:linktwitch', async (ctx) => {
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.setPending(`twitch_${userId}`, { stage: 'awaiting_twitch_channel', userId, promptId: ctx.callbackQuery.message.message_id });
  const user = DB.getUser(userId);
  await warnVerifiedAction(ctx, userId);
  const verifyWarn = user?.is_verified ? '\n\n⚠️ <b>Внимание:</b> при изменении соцсетей верификация будет снята.' : '';

  await ctx.editMessageText(
    `🔗 <b>Привязка Twitch</b>\n\n` +
    `Введите название или юзернейм вашего Twitch канала:\n` +
    `Например: <code>ninja</code>${verifyWarn}`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:setup')]])
    }
  );
});

bot.action('blogger:manage_twitch', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const blogger = DB.getUser(userId);

  if (!blogger?.twitch_channel) return ctx.reply('Twitch не подключен.');

  const price = clampMinPrice(blogger.twitch_price ?? 500);

  const text = `👾 <b>Настройки Twitch</b>\n\n` +
    `Канал: <b>${blogger.twitch_channel}</b>\n` +
    `Цена разбана: <b>${price} ₽</b>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Изменить цену', 'blogger:twitch_price')],
    [Markup.button.callback('❌ Отвязать', 'blogger:unlink_twitch')],
    [Markup.button.callback('« Назад', 'blogger:setup')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
});

bot.action('blogger:twitch_price', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.setPending(`twitchprice_${userId}`, { stage: 'awaiting_twitch_price', userId, promptId: ctx.callbackQuery.message.message_id });

  await ctx.editMessageText(
    `💰 <b>Цена разбана Twitch</b>\n\n` +
    `Введите новую цену разблокировки на вашем Twitch канале (минимум ${MIN_UNBAN_PRICE} ₽)\n\n` +
    `❗Оплата картой будет доступна если цена больше ${NICEPAY_MIN_AMOUNT_RUB}₽`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:manage_twitch')]]) }
  );
});

bot.action('blogger:unlink_twitch', async (ctx) => {
  await ctx.answerCbQuery();
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('✅ Да, отвязать', 'blogger:unlink_twitch_confirm')],
    [Markup.button.callback('« Отмена', 'blogger:manage_twitch')]
  ]);
  await ctx.editMessageText('Вы уверены, что хотите отвязать Twitch канал?', { parse_mode: 'HTML', ...keyboard });
});

bot.action('blogger:unlink_twitch_confirm', async (ctx) => {
  const userId = String(ctx.from.id);

  await warnVerifiedAction(ctx, userId);
  DB.updateTwitch(userId, null, 500, null);
  revokeUserVerification(userId);

  await ctx.editMessageText('✅ Twitch канал отвязан', Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]]));
});

bot.action('blogger:setname', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.setPending(`setname_${userId}`, { stage: 'awaiting_name', userId, promptId: ctx.callbackQuery.message.message_id });

  await ctx.editMessageText('Введите новое публичное имя (оно должно быть уникальным):', Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:setup')]]));
});


bot.action('blogger:check_twitch_claim', async (ctx) => {
  await ctx.answerCbQuery('Проверяем статус...');
  const userId = String(ctx.from.id);
  const pending = DB.getPending(`twitch_${userId}`);

  if (!pending || !pending.channelName) {
    return editOrReply(ctx, '❌ Ошибка сессии. Попробуйте заново.', Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:setup')]]));
  }

  const channelName = pending.channelName;

  if (!pending.verifyId) {
    const start = await startTwitchVerification(userId, channelName);
    if (!start.success) {
      return editOrReply(ctx, `❌ ${start.error || 'Ошибка верификации'}`, Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]]));
    }
    pending.verifyId = start.requestId;
    pending.stage = 'awaiting_twitch_verify';
    DB.setPending(`twitch_${userId}`, pending);
  }

  const record = DB.getTwitchVerification(pending.verifyId);
  if (!record) {
    pending.verifyId = null;
    pending.stage = 'awaiting_twitch_channel';
    DB.setPending(`twitch_${userId}`, pending);
    return ctx.editMessageText('❌ Код верификации не найден. Начните заново.', Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]]));
  }

  if (record.status === 'verified') {
    DB.deletePending(`twitch_${userId}`);
    DB.createUser(userId);
    DB.updateTwitch(userId, record.channel_login, 500, record.channel_id);
    revokeUserVerification(userId);

    return editOrReply(ctx,
      `✅ <b>Успешно!</b>\nКанал <b>${record.channel_login}</b> подтвержден и привязан.\n\n` +
      `Теперь добавьте бота модератором: <code>/mod ${TWITCH_BOT_LOGIN || 'unbanmepls_lol'}</code>`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('💰 Настроить цену', 'blogger:twitch_price')], [Markup.button.callback('✅ В меню', 'blogger:setup')]]) }
    );
  }

  if (record.status === 'expired') {
    const restart = await startTwitchVerification(userId, channelName);
    if (!restart.success) {
      return editOrReply(ctx, `❌ ${restart.error || 'Ошибка верификации'}`, Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]]));
    }
    pending.verifyId = restart.requestId;
    pending.stage = 'awaiting_twitch_verify';
    DB.setPending(`twitch_${userId}`, pending);

    return editOrReply(ctx, buildTwitchVerifyMessage(restart.channelLogin, restart.code, restart.expiresAt), {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([[Markup.button.callback('✅ Проверить', 'blogger:check_twitch_claim')], [Markup.button.callback('« Отмена', 'blogger:setup')]])
    });
  }

  return editOrReply(ctx, buildTwitchVerifyMessage(record.channel_login, record.code, record.expires_at), {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('✅ Проверить', 'blogger:check_twitch_claim')], [Markup.button.callback('« Отмена', 'blogger:setup')]])
  });
});

bot.action('blogger:channels', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.createUser(userId);

  let channels = DB.getUserChannels(userId);
  const filtered = await filterChannelsByAdmin(channels, userId);
  channels = filtered.channels;

  let message = '📢 <b>Ваши каналы</b>\n\n';
  const buttons = [];

  if (channels.length === 0) {
    message += 'Нет привязанных каналов.\n\n<b>Как добавить?</b>\nНажмите кнопку "➕ Привязать канал" ниже.';
  } else {
    message += 'Нажмите на канал для управления:';
    channels.forEach((ch) => {
      const title = ch.title || ch.id;
      const price = clampMinPrice(ch.price ?? MIN_UNBAN_PRICE);
      buttons.push([Markup.button.callback(`${title} (${price}₽)`, `manage_channel:${ch.id}`)]);
    });
  }

  buttons.push([Markup.button.callback('➕ Привязать канал', 'blogger:link_manual_tg')]);
  buttons.push([Markup.button.callback('« Назад', 'blogger:setup')]);

  try {
    await ctx.editMessageText(message, { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  } catch (e) {
    await ctx.reply(message, { parse_mode: 'HTML', reply_markup: Markup.inlineKeyboard(buttons).reply_markup });
  }
});


bot.action('blogger:link_manual_tg', async (ctx) => {
  const userId = String(ctx.from.id);
  clearUserState(userId);
  DB.setPending(`linktg_${userId}`, { stage: 'awaiting_tg_link', userId, promptId: ctx.callbackQuery.message.message_id });
  const user = DB.getUser(userId);
  await warnVerifiedAction(ctx, userId);
  const verifyWarn = user?.is_verified ? '\n\n⚠️ <b>Внимание:</b> при изменении соцсетей верификация будет снята.' : '';

  await ctx.editMessageText(
    `🔗 <b>Привязка Telegram канала или чата</b>\n\n` +
    `▫️Добавьте бота в администраторы канала или чата с правом на блокировку/разблокировку пользователей\n` +
    `▫️Напишите сюда юзернейм канала (с @ или без)\n\n` +
    `Например: <code>@mychannel</code>${verifyWarn}`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:channels')]]) }
  );
});


bot.action('blogger:get_deeplink', async (ctx) => {
  await ctx.answerCbQuery();
  clearUserState(String(ctx.from.id));
  const userId = String(ctx.from.id);
  if (!hasLinkedSocials(userId)) {
    return ctx.reply('Сначала привяжите хотя бы один канал', { parse_mode: 'HTML' });
  }
  await renderPersonalLink(ctx, { messageId: ctx.callbackQuery?.message?.message_id });
});

bot.action('blogger:slug_set', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  DB.setPending(`slug_${userId}`, {
    stage: 'awaiting_slug',
    userId,
    promptId: ctx.callbackQuery?.message?.message_id
  });

  const text = `✏️ <b>Новая персональная ссылка</b>\n\n` +
    `Введите слово длиной 3-32 символа:`;
  const keyboard = Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:get_deeplink')]]);

  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
});

bot.action('blogger:slug_random', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  DB.createUser(userId);

  let slug = null;
  let attempts = 0;
  do {
    slug = crypto.randomBytes(4).toString('hex');
    attempts++;
  } while (DB.checkSlugExists(slug, userId) && attempts < 10);

  if (attempts >= 10) {
    return ctx.answerCbQuery('Не удалось сгенерировать ссылку. Попробуйте ещё раз.', { show_alert: true });
  }

  DB.updateUserSlug(userId, slug);
  await renderPersonalLink(ctx, { messageId: ctx.callbackQuery?.message?.message_id });
});

bot.action('blogger:slug_reset', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  DB.updateUserSlug(userId, null);
  await renderPersonalLink(ctx, { messageId: ctx.callbackQuery?.message?.message_id });
});

bot.action(/manage_channel:(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const ch = DB.getChannel(channelId);
  if (!ch) return ctx.editMessageText('Канал не найден.', Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:channels')]]));

  const text = `📢 <b>${ch.title}</b>\n` +
    `Цена разбана: ${clampMinPrice(ch.price ?? MIN_UNBAN_PRICE)}₽`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💰 Изменить цену', `edit_price:${channelId}`)],
    [Markup.button.callback('❌ Отвязать', `unlink_channel:${channelId}`)],
    [Markup.button.callback('« Назад', 'blogger:channels')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
});

bot.action(/edit_price:(.+)/, async (ctx) => {
  await ctx.answerCbQuery();
  const channelId = ctx.match[1];
  const userId = String(ctx.from.id);

  clearUserState(userId);
  DB.setPending(`setprice_${userId}`, { stage: 'awaiting_channel_price', userId, channelId, promptId: ctx.callbackQuery.message.message_id });

  await ctx.editMessageText(
    `Введите новую цену разблокировки в вашем ТГ канале (минимум ${MIN_UNBAN_PRICE} ₽)\n\n` +
    `❗Оплата картой будет доступна если цена больше ${NICEPAY_MIN_AMOUNT_RUB}₽`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', `manage_channel:${channelId}`)]]) }
  );
});

bot.action(/unlink_channel:(.+)/, async (ctx) => {
  const channelId = ctx.match[1];

  const ch = DB.getChannel(channelId);
  if (ch?.owner_id) {
    await warnVerifiedAction(ctx, String(ch.owner_id));
  } else {
    try { await ctx.answerCbQuery(); } catch (e) { }
  }
  DB.removeChannel(channelId);
  if (ch?.owner_id) {
    revokeUserVerification(String(ch.owner_id));
  }

  await ctx.editMessageText(
    `Канал ${ch?.title || channelId} отвязан.`,
    Markup.inlineKeyboard([[Markup.button.callback('« К списку', 'blogger:channels')]])
  );
});




bot.action('unban:start', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  try {
    await ctx.editMessageText(
      '🔍 <b>Поиск канала</b>\n\nВведите юзернейм или название канала:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'back:main')]])
      }
    );
    DB.setPending(`search_${userId}`, { stage: 'awaiting_search_query', userId, promptId: ctx.callbackQuery.message.message_id });
  } catch (e) {
    const msg = await ctx.reply(
      '🔍 <b>Поиск канала</b>\n\nВведите юзернейм или название канала:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'back:main')]])
      }
    );
    DB.setPending(`search_${userId}`, { stage: 'awaiting_search_query', userId, promptId: msg.message_id });
  }
});

bot.action('unban:search', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  try {
    await ctx.editMessageText(
      '🔍 <b>Поиск канала</b>\n\nВведите юзернейм или название канала:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'back:main')]])
      }
    );
    DB.setPending(`search_${userId}`, { stage: 'awaiting_search_query', userId, promptId: ctx.callbackQuery.message.message_id });
  } catch (e) {
    const msg = await ctx.reply(
      '🔍 <b>Поиск канала</b>\n\nВведите юзернейм или название канала:',
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'back:main')]])
      }
    );
    DB.setPending(`search_${userId}`, { stage: 'awaiting_search_query', userId, promptId: msg.message_id });
  }
});

bot.action(/select_blogger:(.+)/, async (ctx) => {
  const bloggerId = ctx.match[1];
  await ctx.answerCbQuery();
  await showBloggerProfile(ctx, bloggerId);
});

async function showBloggerProfile(ctx, bloggerId) {
  const blogger = DB.getUser(bloggerId);
  let channels = DB.getUserChannels(bloggerId);
  const filtered = await filterChannelsByAdmin(channels, bloggerId);
  channels = filtered.channels;

  if (!blogger) {
    const msg = 'Медиа не найден.';
    if (ctx.callbackQuery) return ctx.editMessageText(msg, Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'unban:start')]]));
    else return ctx.reply(msg);
  }

  const userId = String(ctx.from.id);
  const searchContext = DB.getPending(`search_context_${userId}`);
  const match = searchContext?.query
    ? pickSearchMatch(searchContext.query, blogger, channels)
    : { platform: null, label: null, channelId: null };

  let orderedChannels = [...channels];
  if (match.platform === 'telegram' && orderedChannels.length > 1) {
    let targetId = match.channelId ? String(match.channelId) : null;
    const targetLabel = match.label ? normalizeSearchQuery(match.label) : '';
    if (!targetId && targetLabel) {
      const matched = orderedChannels.find((ch) => {
        const uname = normalizeLogin(ch?.username);
        const title = normalizeChannelTitle(ch?.title);
        return (uname && uname === targetLabel) || (title && title === targetLabel);
      });
      if (matched) targetId = String(matched.id);
    }
    if (targetId) {
      const idx = orderedChannels.findIndex(ch => String(ch.id) === targetId);
      if (idx > 0) {
        const [selected] = orderedChannels.splice(idx, 1);
        orderedChannels.unshift(selected);
      }
    }
  }

  const socials = [];
  const twitchLine = blogger.twitch_channel
    ? `🟣 Twitch: <a href="https://twitch.tv/${blogger.twitch_channel}">${blogger.twitch_channel}</a>`
    : null;
  let tgText = null;
  if (orderedChannels.length > 0) {
    tgText = `🔵 Telegram:\n`;
    orderedChannels.forEach(ch => {
      const name = ch.title || 'Канал';
      const link = ch.username ? `https://t.me/${ch.username.replace('@', '')}` : null;
      if (link) tgText += `• <a href="${link}">${name}</a>\n`;
      else tgText += `• ${name} (Закрытый)\n`;
    });
    tgText = tgText.trim();
  }

  if (match.platform === 'telegram') {
    if (tgText) socials.push(tgText);
    if (twitchLine) socials.push(twitchLine);
  } else if (match.platform === 'twitch') {
    if (twitchLine) socials.push(twitchLine);
    if (tgText) socials.push(tgText);
  } else {
    if (twitchLine) socials.push(twitchLine);
    if (tgText) socials.push(tgText);
  }

  const socialsText = socials.filter(Boolean).join('\n');
  const info = [socialsText, 'Выберите где вы хотите купить разблокировку ⬇️']
    .filter(Boolean)
    .join('\n\n');

  const tgButtons = [];
  if (orderedChannels.length > 0) {
    orderedChannels.forEach((channel) => {
      const label = normalizeChannelLabel(channel) || 'Telegram';
      const name = orderedChannels.length > 1 ? `Telegram • ${label}` : 'Telegram';
      tgButtons.push([Markup.button.callback(name, `buy:${bloggerId}:telegram:${channel.id}`)]);
    });
  }
  const twitchButtons = blogger.twitch_channel
    ? [[Markup.button.callback('Twitch', `buy:${bloggerId}:twitch`)]]
    : [];

  const buttons = [];
  if (match.platform === 'twitch') {
    buttons.push(...twitchButtons, ...tgButtons);
  } else {
    buttons.push(...tgButtons, ...twitchButtons);
  }

  buttons.push([Markup.button.callback('« К поиску', 'unban:search')]);

  if (ctx.updateType === 'callback_query') {
    await ctx.editMessageText(info, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons) });
  } else {
    await ctx.reply(info, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard(buttons) });
  }
}

bot.action(/buy:(.+?):(telegram|twitch)(?::(.+))?/, async (ctx) => {
  const [, bloggerId, platform, channelIdRaw] = ctx.match;
  await ctx.answerCbQuery();

  let price = MIN_UNBAN_PRICE;
  const blogger = DB.getUser(bloggerId);
  const channelId = channelIdRaw ? String(channelIdRaw) : null;
  let selectedChannel = null;

  if (platform === 'telegram') {
    const channels = DB.getUserChannels(bloggerId);
    if (channelId) {
      selectedChannel = channels.find(ch => String(ch.id) === channelId) || null;
      if (!selectedChannel) {
        return ctx.reply('❌ Канал Telegram не найден. Попробуйте выбрать снова.', Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'unban:search')]]));
      }
      price = clampMinPrice(selectedChannel.price ?? MIN_UNBAN_PRICE);
    } else {
      const validPrices = channels
        .map(c => c.price)
        .filter(p => p !== null && p !== undefined && Number.isFinite(Number(p)));
      const rawPrice = validPrices.length ? Math.min(...validPrices.map(p => Number(p))) : 250;
      price = clampMinPrice(rawPrice);
    }

  } else if (platform === 'twitch') {
    const rawPrice = blogger.twitch_price !== null && blogger.twitch_price !== undefined ? blogger.twitch_price : 500;
    price = clampMinPrice(rawPrice);
  }

  const pendingId = `unban_${ctx.from.id}`;
  clearUserState(ctx.from.id);

  DB.setPending(pendingId, {
    pendingId,
    buyerId: ctx.from.id,
    bloggerId,
    platform,
    price,
    channelId: selectedChannel?.id || channelId || null,
    stage: 'awaiting_nick',
    promptId: ctx.callbackQuery.message.message_id
  });

  const platformLabel = formatPlatformLabel(platform, selectedChannel);
  const locationLabel = platform === 'twitch' ? 'на Twitch' : `в ${platformLabel}`;
  await ctx.reply(
    `📝 Укажите ник который нужно разблокировать ${locationLabel}\n` +
    `💰 Стоимость разблокировки: ${price} ₽`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', `cancel:${pendingId}`)]]) }
  );
});

bot.action(/cancel:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  DB.deletePending(id);
  await ctx.answerCbQuery('Отменено');

  clearUserState(ctx.from.id);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔓 Разбаниться', 'unban:start')],
    [Markup.button.callback('🎬 Панель медиа', 'blogger:setup')]
  ]);

  try {
    await ctx.editMessageText(`Я бот для покупки разбанов\n\nВыберите действие:`, keyboard);
  } catch (e) {
    await ctx.reply(`Я бот для покупки разбанов\n\nВыберите действие:`, keyboard);
  }
});

bot.action('back:main', async (ctx) => {
  try { await ctx.answerCbQuery(); } catch (e) { }
  clearUserState(ctx.from.id);
  try { await ctx.deleteMessage(); } catch (e) { }
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🔓 Разбаниться', 'unban:start')],
    [Markup.button.callback('🎬 Панель медиа', 'blogger:setup')]
  ]);
  await ctx.reply(`Я бот для покупки разбанов\n\nВыберите действие:`, keyboard);
});



bot.on('message', async (ctx) => {
  if (ctx.from && ctx.from.username) {
    DB.saveUsername(ctx.from.username, String(ctx.from.id));
  }

  if (ctx.chat.type !== 'private') return;

  const userId = String(ctx.from.id);
  const broadcastPending = DB.getPending(`broadcast_${userId}`);
  const isBroadcast = broadcastPending?.stage === 'awaiting_broadcast_text';

  if (!isBroadcast && !ctx.message.text) return;
  if (isBroadcast && !ctx.message.text && !ctx.message.photo) return;

  let text = ctx.message.text || ctx.message.caption || '';


  if (isBroadcast) {
    try { await ctx.deleteMessage(); } catch (e) { }
    if (broadcastPending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, broadcastPending.promptId); } catch (e) { }
    DB.deletePending(`broadcast_${userId}`);

    const users = DB.getAllUserIds();
    let sent = 0;
    let blocked = 0;

    const statusMsg = await ctx.reply(`⏳ Начинаю рассылку на ${users.length} пользователей...`);

    const photoId = ctx.message.photo ? ctx.message.photo[ctx.message.photo.length - 1].file_id : null;


    for (const uid of users) {
      await new Promise(r => setTimeout(r, 50));
      try {
        if (photoId) {
          await ctx.telegram.sendPhoto(uid, photoId, { caption: text });
        } else {
          if (!text) continue;
          await ctx.telegram.sendMessage(uid, text);
        }
        sent++;
      } catch (e) {
        blocked++;
      }
    }

    await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null,
      `✅ <b>Рассылка завершена!</b>\n\nОтправлено: ${sent}\nЗаблокировали бота: ${blocked}`,
      { parse_mode: 'HTML' }
    );
    return;
  }

  const commissionPending = DB.getPending(`commission_${userId}`);
  if (commissionPending?.stage === 'awaiting_commission_change') {
    try { await ctx.deleteMessage(); } catch (e) { }

    const value = parseFloat(text);
    if (isNaN(value) || value < 0 || value > 100) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, commissionPending.promptId, null,
          `❌ Введите число от 0 до 100.\n\nТекущая комиссия: <b>${DB.getConfig('commission')}%</b>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:back')]]) }
        );
      } catch (e) { }
      return;
    }

    DB.setConfig('commission', value);
    DB.deletePending(`commission_${userId}`);

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, commissionPending.promptId, null,
        `✅ <b>Комиссия обновлена!</b>\n\nНовое значение: <b>${value}%</b>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]]) }
      );
    } catch (e) { }
    return;
  }

  const adminSlugPending = DB.getPending(`admin_slug_${userId}`);
  if (adminSlugPending) {
    if (!isAdmin(userId)) {
      DB.deletePending(`admin_slug_${userId}`);
      return;
    }

    try { await ctx.deleteMessage(); } catch (e) { }
    const promptId = adminSlugPending.promptId;
    const replyOrEdit = async (msgText, extra) => {
      try {
        if (promptId) {
          await ctx.telegram.editMessageText(ctx.chat.id, promptId, null, msgText, extra);
          return;
        }
      } catch (e) { }
      await ctx.reply(msgText, extra);
    };

    if (adminSlugPending.stage === 'awaiting_target') {
      const input = text.trim();
      if (!input) {
        await replyOrEdit('❌ Введите ID пользователя или @username:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      let targetId = null;
      if (/^\d+$/.test(input)) {
        targetId = input;
      } else {
        const username = input.replace(/^@/, '');
        targetId = DB.getUserIdByUsername(username);
      }

      if (!targetId) {
        await replyOrEdit('❌ Пользователь не найден. Введите ID или @username:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      DB.createUser(String(targetId));
      adminSlugPending.stage = 'awaiting_slug';
      adminSlugPending.targetUserId = String(targetId);
      DB.setPending(`admin_slug_${userId}`, adminSlugPending);

      const target = DB.getUser(String(targetId));
      const currentSlug = target?.link_slug ? `<code>${target.link_slug}</code>` : '<b>по умолчанию</b>';

      await replyOrEdit(
        `✅ Пользователь найден: <code>${targetId}</code>\n` +
        `Текущий адрес: ${currentSlug}\n\n` +
        `Введите новый адрес (slug) 3-32 символа.\n` +
        `Разрешены буквы, цифры, _ и -.\n` +
        `Пример: <code>ninja</code>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]]) }
      );
      return;
    }

    if (adminSlugPending.stage === 'awaiting_slug') {
      const targetUserId = String(adminSlugPending.targetUserId || '');
      const slug = text.trim();

      if (!targetUserId) {
        DB.deletePending(`admin_slug_${userId}`);
        await replyOrEdit('❌ Не удалось определить пользователя. Начните заново.', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      if (!slug || slug.length < 3 || slug.length > 32) {
        await replyOrEdit('❌ Адрес должен быть от 3 до 32 символов.\n\nВведите новый адрес:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
        await replyOrEdit('❌ Используйте только буквы, цифры, _ и -.\n\nВведите новый адрес:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      DB.createUser(targetUserId);
      const existing = DB.getUserBySlug(slug);
      let releasedId = null;
      if (existing && String(existing.id) !== targetUserId) {
        DB.updateUserSlug(existing.id, null);
        releasedId = existing.id;
      }

      DB.updateUserSlug(targetUserId, slug);
      DB.deletePending(`admin_slug_${userId}`);

      const releasedText = releasedId ? `\n♻️ Адрес освобожден у пользователя <code>${releasedId}</code>.` : '';
      await replyOrEdit(
        `✅ Адрес назначен пользователю <code>${targetUserId}</code>.\n` +
        `Новый адрес: <code>${slug}</code>${releasedText}`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]]) }
      );
      return;
    }
  }

  const adminVerifyPending = DB.getPending(`admin_verify_${userId}`);
  if (adminVerifyPending) {
    if (!isAdmin(userId)) {
      DB.deletePending(`admin_verify_${userId}`);
      return;
    }

    try { await ctx.deleteMessage(); } catch (e) { }
    const promptId = adminVerifyPending.promptId;
    const replyOrEdit = async (msgText, extra) => {
      try {
        if (promptId) {
          await ctx.telegram.editMessageText(ctx.chat.id, promptId, null, msgText, extra);
          return;
        }
      } catch (e) { }
      await ctx.reply(msgText, extra);
    };

    if (adminVerifyPending.stage === 'awaiting_target') {
      const input = text.trim();
      if (!input) {
        await replyOrEdit('❌ Введите ID пользователя или @username:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      let targetId = null;
      if (/^\d+$/.test(input)) {
        targetId = input;
      } else {
        const username = input.replace(/^@/, '');
        targetId = DB.getUserIdByUsername(username);
      }

      if (!targetId) {
        await replyOrEdit('❌ Пользователь не найден. Введите ID или @username:', {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:back')]])
        });
        return;
      }

      DB.createUser(String(targetId));
      DB.deletePending(`admin_verify_${userId}`);

      const target = DB.getUser(String(targetId));
      const msgText = buildAdminVerifyText(target);
      const keyboard = buildAdminVerifyKeyboard(String(targetId), !!target?.is_verified);
      await replyOrEdit(msgText, { parse_mode: 'HTML', ...keyboard });
      return;
    }
  }


  const promoCreatePending = DB.getPending(`promo_create_${userId}`);
  if (promoCreatePending) {
    try { await ctx.deleteMessage(); } catch (e) { }

    if (promoCreatePending.stage === 'awaiting_promo_code') {
      const code = text.toUpperCase().trim();
      if (!code || code.length < 3) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
            `❌ Код должен быть минимум 3 символа.\n\n🎁 <b>Создание промокода</b>\n\nВведите код:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
          );
        } catch (e) { }
        return;
      }

      promoCreatePending.code = code;
      promoCreatePending.stage = 'awaiting_promo_discount';
      DB.setPending(`promo_create_${userId}`, promoCreatePending);

      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
          `🎁 <b>Создание промокода: ${code}</b>\n\nВведите процент комиссии (от 0 до 100):`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
        );
      } catch (e) { }
      return;
    }

    if (promoCreatePending.stage === 'awaiting_promo_discount') {
      const discount = parseFloat(text);
      if (isNaN(discount) || discount < 0 || discount > 100) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
            `❌ Введите число от 0 до 100.\n\n🎁 <b>Создание промокода: ${promoCreatePending.code}</b>\n\nВведите процент комиссии:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
          );
        } catch (e) { }
        return;
      }

      promoCreatePending.discount = discount;
      promoCreatePending.stage = 'awaiting_promo_days';
      DB.setPending(`promo_create_${userId}`, promoCreatePending);

      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
          `🎁 <b>Создание промокода: ${promoCreatePending.code}</b>\n\nКомиссия: ${discount}%\n\nВведите срок действия (дней):`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
        );
      } catch (e) { }
      return;
    }

    if (promoCreatePending.stage === 'awaiting_promo_days') {
      const days = parseInt(text);
      if (isNaN(days) || days <= 0) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
            `❌ Введите положительное число.\n\n🎁 <b>Создание промокода: ${promoCreatePending.code}</b>\n\nВведите срок действия (дней):`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
          );
        } catch (e) { }
        return;
      }

      promoCreatePending.days = days;
      promoCreatePending.stage = 'awaiting_promo_limit';
      DB.setPending(`promo_create_${userId}`, promoCreatePending);

      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
          `🎁 <b>Создание промокода: ${promoCreatePending.code}</b>\n\n` +
          `Срок: ${days} дней\n\n` +
          `Введите лимит использований (1-999) или -1 для бесконечности:`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
        );
      } catch (e) { }
      return;
    }

    if (promoCreatePending.stage === 'awaiting_promo_limit') {
      const limit = parseInt(text);
      const isUnlimited = limit === -1;
      if (!isUnlimited && (isNaN(limit) || limit < 1 || limit > 999)) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
            `❌ Введите число от 1 до 999 или -1 для бесконечности.\n\n` +
            `🎁 <b>Создание промокода: ${promoCreatePending.code}</b>\n\nВведите лимит использований:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
          );
        } catch (e) { }
        return;
      }

      const maxUses = isUnlimited ? -1 : limit;
      DB.createPromo(promoCreatePending.code, promoCreatePending.discount, promoCreatePending.days, maxUses);
      DB.deletePending(`promo_create_${userId}`);

      const limitText = maxUses === -1 ? 'без лимита' : `${maxUses}`;
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoCreatePending.promptId, null,
          `✅ <b>Промокод создан!</b>\n\n` +
          `Код: <code>${promoCreatePending.code}</code>\n` +
          `Комиссия: ${promoCreatePending.discount}%\n` +
          `Срок: ${promoCreatePending.days} дней\n` +
          `Лимит: ${limitText}`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'admin:promos')]]) }
        );
      } catch (e) { }
      return;
    }
  }

  const promoActivatePending = DB.getPending(`promo_activate_${userId}`);
  if (promoActivatePending?.stage === 'awaiting_promo_activation') {
    try { await ctx.deleteMessage(); } catch (e) { }

    const code = text.toUpperCase().trim();
    const promo = DB.getPromo(code);

    if (!promo) {
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoActivatePending.promptId, null,
          `❌ Промокод не найден.\n\n🎁 <b>Активация промокода</b>\n\nВведите код:`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:promo_menu')]]) }
        );
      } catch (e) { }
      return;
    }

    const currentPromo = DB.getUserPromo(userId);
    if (currentPromo?.code === promo.code) {
      DB.deletePending(`promo_activate_${userId}`);
      try {
        await ctx.telegram.editMessageText(ctx.chat.id, promoActivatePending.promptId, null,
          `✅ Этот промокод уже активен.\n\nКомиссия: <b>${promo.discount_percent}%</b>\nДействует: <b>${promo.valid_days} дней</b>`,
          { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:promo_menu')]]) }
        );
      } catch (e) { }
      return;
    }

    if (promo.max_uses !== null && promo.max_uses !== undefined && promo.max_uses !== -1) {
      const activeUses = DB.getPromoActiveUses(promo.code);
      if (activeUses >= promo.max_uses) {
        try {
          await ctx.telegram.editMessageText(ctx.chat.id, promoActivatePending.promptId, null,
            `❌ Лимит использований исчерпан.\n\n🎁 <b>Активация промокода</b>\n\nВведите другой код:`,
            { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:promo_menu')]]) }
          );
        } catch (e) { }
        return;
      }
    }

    DB.activatePromo(userId, code);
    DB.deletePending(`promo_activate_${userId}`);

    try {
      await ctx.telegram.editMessageText(ctx.chat.id, promoActivatePending.promptId, null,
        `✅ <b>Промокод активирован!</b>\n\nКод: <code>${maskPromoCode(code)}</code>\nТеперь ваша комиссия: <b>${promo.discount_percent}%</b>\nДействует: <b>${promo.valid_days} дней</b>`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:promo_menu')]]) }
      );
    } catch (e) { }
    return;
  }
  const searchPending = DB.getPending(`search_${userId}`);
  if (searchPending?.stage === 'awaiting_search_query') {


    try { await ctx.deleteMessage(); } catch (e) { }
    if (searchPending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, searchPending.promptId); } catch (e) { }

    DB.deletePending(`search_${userId}`);
    const normalizedQuery = normalizeSearchQuery(text);
    let results = DB.searchUsers(normalizedQuery);
    const rawQuery = text.trim().toLowerCase();
    if (!results.length && rawQuery && rawQuery !== normalizedQuery) {
      results = DB.searchUsers(rawQuery);
    }

    if (!results.length) {
      return ctx.reply('🔍 Мы не нашли канал с таким именем.\nПопробуйте ввести точное название канала или Twitch логин.',
        Markup.inlineKeyboard([[Markup.button.callback('🔍 Искать снова', 'unban:search'), Markup.button.callback('« В меню', 'back:main')]])
      );
    }

    DB.setPending(`search_context_${userId}`, { query: text, normalizedQuery });

    const buttons = results.map(b => {
      const channels = DB.getUserChannels(b.id);
      const match = pickSearchMatch(text, b, channels);

      let label = b.display_name;
      if (match.platform === 'twitch') {
        const twitchLabel = match.label || b.twitch_channel;
        if (twitchLabel) label = `Twitch: ${twitchLabel}`;
      } else if (match.platform === 'telegram') {
        const tgLabel = match.label || pickChannelLabel(channels);
        if (tgLabel) label = `TG: ${tgLabel}`;
      }
      if (!label && b.twitch_channel) label = `Twitch: ${b.twitch_channel}`;
      if (!label) {
        const channelLabel = pickChannelLabel(channels);
        if (channelLabel) label = `TG: ${channelLabel}`;
      }
      if (!label) label = 'Профиль';
      if (b.is_verified) label = `${label} ⭐️`;
      return [Markup.button.callback(label, `select_blogger:${b.id}`)];
    });

    buttons.push([Markup.button.callback('« Назад', 'unban:search')]);

    return ctx.reply(`🔎 Найдено каналов: ${results.length}\nВыберите канал, который вы искали:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }


  const setNamePending = DB.getPending(`setname_${userId}`);
  if (setNamePending?.stage === 'awaiting_name') {
    try { await ctx.deleteMessage(); } catch (e) { }
    if (setNamePending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, setNamePending.promptId); } catch (e) { }

    if (DB.checkDisplayNameExists(text, userId)) {
      return ctx.reply('❌ <b>Это имя уже занято.</b>\nПопробуйте другое.', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:setup')]])
      });
    }

    DB.deletePending(`setname_${userId}`);
    DB.createUser(userId);
    DB.updateUserDisplay(userId, text);
    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('« К настройкам', 'blogger:setup')]]);
    return ctx.reply(`✅ Имя установлено: ${text}`, keyboard);
  }

  const slugPending = DB.getPending(`slug_${userId}`);
  if (slugPending?.stage === 'awaiting_slug') {
    try { await ctx.deleteMessage(); } catch (e) { }

    const promptId = slugPending.promptId;
    const replyOrEdit = async (msgText) => {
      const keyboard = Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:get_deeplink')]]);
      try {
        if (promptId) {
          await ctx.telegram.editMessageText(ctx.chat.id, promptId, null, msgText, { parse_mode: 'HTML', ...keyboard });
          return;
        }
      } catch (e) { }
      await ctx.reply(msgText, { parse_mode: 'HTML', ...keyboard });
    };

    const slug = text.trim();
    if (!slug || slug.length < 3 || slug.length > 32) {
      await replyOrEdit('❌ Адрес должен быть от 3 до 32 символов.\n\nВведите новый адрес:');
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
      await replyOrEdit('❌ Используйте только буквы, цифры, _ и -.\n\nВведите новый адрес:');
      return;
    }

    if (DB.checkSlugExists(slug, userId)) {
      await replyOrEdit('❌ Этот адрес уже занят.\n\nВведите другой адрес:');
      return;
    }

    DB.updateUserSlug(userId, slug);
    DB.deletePending(`slug_${userId}`);
    await renderPersonalLink(ctx, { messageId: promptId });
    return;
  }


  const twitchPricePending = DB.getPending(`twitchprice_${userId}`);
  if (twitchPricePending?.stage === 'awaiting_twitch_price') {
    try { await ctx.deleteMessage(); } catch (e) { }
    if (twitchPricePending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, twitchPricePending.promptId); } catch (e) { }

    DB.deletePending(`twitchprice_${userId}`);
    const price = Number(text);
    if (!Number.isFinite(price)) return ctx.reply('❌ Введите корректное число.');
    if (price < MIN_UNBAN_PRICE) return ctx.reply(`❌ Минимальная цена: ${MIN_UNBAN_PRICE} ₽`);
    const finalPrice = Math.round(price);

    const blogger = DB.getUser(userId);
    if (blogger && blogger.twitch_channel) {
      DB.updateTwitch(userId, blogger.twitch_channel, finalPrice);
    }
    return ctx.reply(`✅ Цена Twitch обновлена: ${finalPrice}₽`, Markup.inlineKeyboard([[Markup.button.callback('« К настройкам Twitch', 'blogger:manage_twitch')]]));
  }


  const linkTgPending = DB.getPending(`linktg_${userId}`);
  if (linkTgPending?.stage === 'awaiting_tg_link') {
    try { await ctx.deleteMessage(); } catch (e) { }
    if (linkTgPending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, linkTgPending.promptId); } catch (e) { }

    const channelName = text.startsWith('@') ? text : '@' + text;
    try {
      const chat = await ctx.telegram.getChat(channelName);

      if (DB.checkChannelLinked(String(chat.id), userId)) {
        return ctx.reply(`❌ <b>Канал ${chat.title} занят.</b>\nОн уже привязан к другому аккаунту.`, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:channels')]])
        });
      }

      const admins = await ctx.telegram.getChatAdministrators(chat.id);
      const isMeAdmin = admins.some(a => a.user.id === ctx.botInfo.id);

      if (!isMeAdmin) {
        return ctx.reply(`❌ <b>Бот не админ.</b>\nДобавьте бота в администраторы ${channelName} и попробуйте снова.`, {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:channels')]])
        });
      }

      DB.deletePending(`linktg_${userId}`);

      DB.createUser(userId);

      DB.addChannel({
        id: String(chat.id),
        title: chat.title,
        price: MIN_UNBAN_PRICE,
        owner_id: userId,
        username: chat.username ? `@${chat.username}` : null,
        photo_file_id: chat.photo?.big_file_id || chat.photo?.small_file_id || null
      });
      revokeUserVerification(userId);

      return ctx.reply(
        `✅ <b>Канал успешно привязан!</b>\n\n` +
        `Название: <b>${chat.title}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('💰 Настроить цену', `manage_channel:${chat.id}`)],
            [Markup.button.callback('« К списку', 'blogger:channels')]
          ])
        }
      );

    } catch (e) {
      console.error(e);
      return ctx.reply(`❌ Не удалось найти канал ${channelName} или нет доступа.`, Markup.inlineKeyboard([[Markup.button.callback('Попробовать снова', 'blogger:link_manual_tg')]]));
    }
  }


  const setPricePending = DB.getPending(`setprice_${userId}`);
  if (setPricePending?.stage === 'awaiting_channel_price') {
    const { channelId, promptId } = setPricePending;
    try { await ctx.deleteMessage(); } catch (e) { }
    if (promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, promptId); } catch (e) { }

    DB.deletePending(`setprice_${userId}`);

    const price = Number(text);
    if (!Number.isFinite(price)) return ctx.reply('❌ Введите корректное число.');
    if (price < MIN_UNBAN_PRICE) return ctx.reply(`❌ Минимальная цена: ${MIN_UNBAN_PRICE} ₽`);
    const finalPrice = Math.round(price);


    DB.updateChannelPrice(channelId, finalPrice);

    const keyboard = Markup.inlineKeyboard([[Markup.button.callback('« К списку каналов', 'blogger:channels')]]);
    return ctx.reply(`✅ Цена обновлена: ${finalPrice}₽`, keyboard);
  }


  const twitchPending = DB.getPending(`twitch_${userId}`);
  if (twitchPending?.stage === 'awaiting_twitch_channel') {
    try { await ctx.deleteMessage(); } catch (e) { }
    if (twitchPending.promptId) try { await ctx.telegram.deleteMessage(ctx.chat.id, twitchPending.promptId); } catch (e) { }

    const result = await startTwitchVerification(userId, text);
    if (!result.success) {
      return ctx.reply(`❌ ${result.error || 'Ошибка верификации'}`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:setup')]])
      });
    }

    twitchPending.channelName = result.channelLogin;
    twitchPending.verifyId = result.requestId;
    twitchPending.stage = 'awaiting_twitch_verify';
    DB.setPending(`twitch_${userId}`, twitchPending);

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('✅ Проверить', 'blogger:check_twitch_claim')],
      [Markup.button.callback('« Отмена', 'blogger:setup')]
    ]);

    return ctx.reply(buildTwitchVerifyMessage(result.channelLogin, result.code, result.expiresAt), {
      parse_mode: 'HTML',
      ...keyboard
    });

  }

  const withdrawPending = DB.getPending(`withdraw_${userId}`);
  if (withdrawPending) {
    try { await ctx.deleteMessage(); } catch (e) { }

    if (withdrawPending.stage === 'awaiting_withdraw_amount') {
      const amount = parseInt(text);
      const balance = calculateBalance(userId);
      const promptId = withdrawPending.promptId;

      const replyOrEdit = async (msgText, extra) => {
        try {
          if (promptId) await ctx.telegram.editMessageText(ctx.chat.id, promptId, null, msgText, extra);
          else throw new Error('No promptId');
        } catch (e) {
          const m = await ctx.reply(msgText, extra);
          withdrawPending.promptId = m.message_id;
          DB.setPending(`withdraw_${userId}`, withdrawPending);
        }
      };

      if (isNaN(amount) || amount <= 0) return replyOrEdit('❌ Введите корректное число.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
      if (amount > balance) return replyOrEdit(`❌ Недостаточно средств.\nДоступно: ${balance} ₽`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
      if (amount < 1000) return replyOrEdit('❌ Минимальная сумма: 1000 ₽', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });

      withdrawPending.amount = amount;
      withdrawPending.stage = 'awaiting_withdraw_wallet';
      DB.setPending(`withdraw_${userId}`, withdrawPending);

      await replyOrEdit(`💰 Сумма: ${amount} ₽\n\nТеперь введите ваш <b>USDT TRC20</b> кошелек:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
      return;
    }

    if (withdrawPending.stage === 'awaiting_withdraw_wallet') {
      const promptId = withdrawPending.promptId;
      const replyOrEdit = async (msgText, extra) => {
        try {
          if (promptId) await ctx.telegram.editMessageText(ctx.chat.id, promptId, null, msgText, extra);
          else throw new Error('No promptId');
        } catch (e) {
          const m = await ctx.reply(msgText, extra);
        }
      };

      if (!text.startsWith('T') || text.length < 30) {
        return replyOrEdit('❌ Похоже, это некорректный TRC20 адрес. Он должен начинаться с T.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
      }

      withdrawPending.wallet = text;
      DB.setPending(`withdraw_${userId}`, withdrawPending);

      const rate = await getUsdtRubRate();
      const usdAmount = (withdrawPending.amount / rate).toFixed(2);

      const confirmText = `📝 <b>Подтверждение вывода</b>\n\n` +
        `Сумма вывода: <b>${withdrawPending.amount} RUB</b> (~${usdAmount} USDT)\n` +
        `Кошелек: <code>${text}</code>\n\n` +
        `Все верно?`;

      await replyOrEdit(confirmText, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Подтвердить', 'do_withdraw')],
          [Markup.button.callback('❌ Отмена', 'blogger:setup')]
        ])
      });
      return;
    }
  }

  if (ctx.message.text && ctx.message.text.length > 64) {
    return ctx.reply('❌ Слишком длинное сообщение. Максимум 64 символа.');
  }

  const pending = DB.getPending(`unban_${ctx.from.id}`);

  if (pending && pending.stage === 'awaiting_nick') {
    if (pending.platform === 'telegram') {
      const isId = /^\d+$/.test(text);
      if (!isId) {
        let foundId = null;
        const cleanInput = text.replace('@', '').toLowerCase();

        if (ctx.from.username && ctx.from.username.toLowerCase() === cleanInput) {
          foundId = ctx.from.id;
        }
        else {
          foundId = DB.getUserIdByUsername(cleanInput);
        }

        if (foundId) {
          text = String(foundId);
        } else {
          if (!text.startsWith('@')) {
            if (isNaN(text)) text = '@' + text;
          }

          let targetId = null;
          try {
            const chat = await ctx.telegram.getChat(text);
            if (chat.id) targetId = String(chat.id);
          } catch (e) {
          }

          pending.targetId = targetId;
        }
      }
    }

    pending.targetNick = text;
    pending.stage = 'awaiting_payment';
    DB.setPending(pending.pendingId, pending);

    const isFree = pending.price === 0;
    const buttons = [];

    if (isFree) {
      buttons.push([Markup.button.callback('✅ Разбанить бесплатно', `confirm_free:${pending.pendingId}`)]);
    } else {
      buttons.push([Markup.button.callback('💳 Выбрать способ оплаты', `select_payment:${pending.pendingId}`)]);
    }
    buttons.push([Markup.button.callback('❌ Отменить', `cancel:${pending.pendingId}`)]);

    const priceText = isFree ? 'Бесплатно' : `${pending.price}₽`;
    const channel = pending.channelId ? DB.getChannel(pending.channelId) : null;
    const platformLabel = formatPlatformLabel(pending.platform, channel);
    return ctx.reply(`Ваш заказ: Разбан ${text}\nГде разблокировать: ${platformLabel}\nСтоимость: ${priceText}`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }
});

bot.action(/confirm_free:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  if (pending.price !== 0) {
    return ctx.editMessageText('❌ Ошибка: заказ не является бесплатным.');
  }

  await ctx.answerCbQuery('Выполняем...');
  await processUnban(pending);
  DB.deletePending(id);
});

bot.action(/select_payment:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  const showNicePay = Number(pending.price) >= NICEPAY_MIN_AMOUNT_RUB;

  await ctx.editMessageText(`<b>Выберите способ оплаты:</b>\nК оплате: <b>${pending.price}₽</b>`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      ...(showNicePay ? [[Markup.button.callback('💳 Банковская карта', `pay_nicepay:${id}`)]] : []),
      [Markup.button.callback('💎 CryptoBot', `pay_cryptobot:${id}`)],
      [Markup.button.callback('« Назад', `cancel:${id}`)]
    ])
  });
});

bot.action(/pay_nicepay:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');
  if (Number(pending.price) < NICEPAY_MIN_AMOUNT_RUB) {
    return ctx.reply(`Оплата картой доступна от ${NICEPAY_MIN_AMOUNT_RUB} ₽. Выберите другой способ оплаты.`);
  }

  const orderId = `order_${pending.pendingId}_${Date.now()}`;
  const channel = pending.channelId ? DB.getChannel(pending.channelId) : null;
  const invoice = await createNicePayInvoice(
    pending.price,
    orderId,
    ctx.from.username || 'user',
    `Unban: ${pending.targetNick} (${formatPlatformLabel(pending.platform, channel)})`,
    `https://t.me/${bot.botInfo.username}`,
    `https://t.me/${bot.botInfo.username}`
  );

  if (!invoice.success) return ctx.reply(`Ошибка создания платежа: ${invoice.error}`);

  pending.invoiceId = invoice.invoiceId;
  pending.orderId = orderId;
  pending.stage = 'payment_pending';
  DB.setPending(id, pending);

  await ctx.editMessageText(`Ссылка на оплату:`, Markup.inlineKeyboard([
    [Markup.button.url('Оплатить', invoice.paymentUrl)],
    [Markup.button.callback('🔄 Проверить оплату', `check_nicepay:${id}`)],
    [Markup.button.callback('❌ Отмена', `cancel:${pending.pendingId}`)]
  ]));
});

bot.action(/check_nicepay:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  const isPaid = await verifyNicePayOrder(pending.orderId);

  if (isPaid) {
    await ctx.deleteMessage();
    await ctx.reply('✅ Оплата прошла! Разбаниваем...');
    await processUnban(pending);
    DB.deletePending(id);
  } else {
    await ctx.answerCbQuery('Оплата еще не поступила.', { show_alert: true });
  }
});

async function verifyNicePayOrder(orderId) {
  try {
    const payload = {
      merchant_id: NICEPAY_MERCHANT_ID,
      secret: NICEPAY_SECRET_KEY,
      order_id: orderId
    };
    const res = await axios.post('https://nicepay.io/public/api/payment/info', payload);
    if (res.data.status === 'success' && res.data.data.status === 'success' && res.data.data.amount > 0) {
      return true;
    }
  } catch (e) {
    console.error('Verify error:', e.message);
  }
  return false;
}

const handleNowPayPayment = async (ctx, id) => {
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');
  if (Number(pending.price) < NOWPAY_MIN_AMOUNT_RUB) {
    return ctx.reply(`Оплата через NOWpayments доступна от ${NOWPAY_MIN_AMOUNT_RUB} ₽. Выберите другой способ оплаты.`);
  }

  const orderId = pending.pendingId || id;
  const channel = pending.channelId ? DB.getChannel(pending.channelId) : null;
  const description = `Unban: ${pending.targetNick} (${formatPlatformLabel(pending.platform, channel)})`;
  const payment = await createNowPayPayment(pending.price, orderId, description);

  if (!payment.success) {
    return ctx.reply(`Ошибка NOWpayments: ${payment.error || 'Не удалось создать платеж.'}`);
  }
  if (!payment.payAddress) {
    return ctx.reply('Ошибка NOWpayments: не удалось получить адрес для оплаты.');
  }

  const updatedPending = {
    ...pending,
    stage: 'payment_pending',
    paymentMethod: 'nowpay',
    provider: 'nowpay',
    orderId,
    nowpayPaymentId: payment.paymentId,
    nowpayAddress: payment.payAddress,
    nowpayAmount: payment.payAmount,
    nowpayCurrency: payment.payCurrency
  };
  DB.setPending(id, updatedPending);

  const amountText = payment.payAmount
    ? `${payment.payAmount} ${payment.payCurrency?.toUpperCase() || ''}`.trim()
    : `${pending.price} ${NOWPAY_PRICE_CURRENCY.toUpperCase()}`;
  await ctx.editMessageText(
    `💸 <b>Оплата USDT (NOWpayments)</b>\n\n` +
    `Кошелек: <code>${payment.payAddress}</code>\n` +
    `(Нажмите на кошелек, чтобы скопировать)\n\n` +
    `Сумма: <b>${amountText}</b>\n\n` +
    `После оплаты нажмите «🔄 Проверить».`,
    {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        ...(payment.paymentUrl ? [[Markup.button.url('🔗 Открыть оплату', payment.paymentUrl)]] : []),
        [Markup.button.callback('🔄 Проверить', `check_nowpay:${id}`)],
        [Markup.button.callback('« Назад', `select_payment:${id}`)]
      ])
    }
  );
};

bot.action(/pay_nowpay:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  await handleNowPayPayment(ctx, id);
});

bot.action(/check_nowpay:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  if (!pending.nowpayPaymentId) {
    return ctx.answerCbQuery('Платеж не найден');
  }

  await ctx.answerCbQuery('Проверка...', { show_alert: false });
  const statusInfo = await getNowPayPaymentStatus(pending.nowpayPaymentId);
  const status = statusInfo?.payment_status || statusInfo?.status;

  if (isNowPayPaidStatus(status)) {
    await ctx.reply('✅ Оплата получена! Выполняем разбан...');
    await processUnban(pending);
    DB.deletePending(id);
    try { await ctx.deleteMessage(); } catch (e) { }
    return;
  }

  await ctx.reply(`Статус: ${status || 'ожидание оплаты'}.`, {
    reply_to_message_id: ctx.callbackQuery?.message?.message_id
  });
});

bot.action(/c_appr:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);

  if (!pending) {
    return ctx.reply('⚠️ Заказ не найден (возможно, уже обработан).');
  }

  try { await ctx.deleteMessage(); } catch (e) { }

  await processUnban(pending);
  DB.setPending(id, { ...pending, stage: 'completed' });
  setTimeout(() => DB.deletePending(id), 30000);

  await ctx.reply(`✅ Заказ ${id} одобрен и выполнен.`);
  try {
    await bot.telegram.sendMessage(pending.userId, `✅ <b>Ваш Crypto платеж подтвержден!</b>\nВы разбанены.`, { parse_mode: 'HTML' });
  } catch (e) { }
});

bot.action(/c_rej:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (pending) {
    try {
      await bot.telegram.sendMessage(pending.userId, `❌ <b>Ваш Crypto платеж отклонен.</b>\nЕсли произошла ошибка, свяжитесь с поддержкой.`, { parse_mode: 'HTML' });
    } catch (e) { }
    DB.setPending(id, { ...pending, stage: 'rejected' });
    setTimeout(() => DB.deletePending(id), 30000);
  }
  try { await ctx.deleteMessage(); } catch (e) { }
  await ctx.reply(`❌ Заказ ${id} отклонен.`);
});




async function processUnban(pending) {
  const { bloggerId, platform, targetNick, price, channelId } = pending;
  const blogger = DB.getUser(bloggerId);

  const baseCommission = Number(DB.getConfig('commission')) || 25;
  const userPromo = DB.getUserPromo(bloggerId);
  const finalCommission = userPromo ? userPromo.discount_percent : baseCommission;

  const netAmount = Math.round(price * (1 - finalCommission / 100));

  DB.addPurchase({
    bloggerId,
    platform,
    targetNick,
    price,
    net_amount: netAmount,
    channelId: channelId || null
  });

  let success = false;
  let errorReason = null;
  let selectedChannel = null;
  let platformLabel = formatPlatformLabel(platform, null);

  if (platform === 'telegram') {
    const rawTarget = String(targetNick || '').trim();
    let targetId = null;
    let channels = DB.getUserChannels(bloggerId);

    if (/^\d+$/.test(rawTarget)) {
      targetId = parseInt(rawTarget, 10);
    } else if (rawTarget) {
      const cleanInput = rawTarget.replace(/^@/, '').toLowerCase();
      const cachedId = DB.getUserIdByUsername(cleanInput);
      if (cachedId) targetId = parseInt(String(cachedId), 10);
    }

    if (!targetId && rawTarget) {
      const handle = rawTarget.startsWith('@') ? rawTarget : `@${rawTarget}`;
      try {
        const chat = await bot.telegram.getChat(handle);
        if (chat?.id) targetId = chat.id;
      } catch (e) {
        console.error('[Unban] Username resolve failed:', e.message);
      }
    }

    if (!targetId) {
      errorReason = 'Нужен числовой Telegram ID. Можно @username, если пользователь писал боту.';
      console.error('[Unban] Invalid Target ID for TG');
    } else if (channels.length === 0) {
      errorReason = 'Нет привязанных Telegram каналов.';
      console.error('[Unban] No linked Telegram channels');
    } else {
      if (channelId) {
        selectedChannel = channels.find(ch => String(ch.id) === String(channelId)) || null;
        if (!selectedChannel) {
          errorReason = 'Выбранный Telegram канал не найден или отвязан.';
        } else {
          channels = [selectedChannel];
        }
      }

      if (!errorReason) {
        const allowedChannels = [];
        for (const ch of channels) {
          const adminStatus = await isBotAdminInChannel(ch.id);
          if (adminStatus === false) {
            DB.removeChannel(ch.id);
            channelAdminCache.delete(String(ch.id));
            await notifyChannelUnlinked(bloggerId, ch);
            continue;
          }
          allowedChannels.push(ch);
        }

        if (allowedChannels.length === 0) {
          errorReason = channelId
            ? 'Бот не администратор выбранного канала.'
            : 'Нет доступных Telegram каналов.';
        } else {
          channels = allowedChannels;
        }
      }
    }

    platformLabel = formatPlatformLabel(platform, selectedChannel);

    if (!errorReason) {
      for (const ch of channels) {
        const chId = ch.id;
        try {
          await bot.telegram.unbanChatMember(chId, targetId);
          console.log(`[Unban] Success in ${chId} for ${targetId}`);
          success = true;

          try {
            const chatInfo = await bot.telegram.getChat(chId);
            if (chatInfo.linked_chat_id) {
              await bot.telegram.unbanChatMember(chatInfo.linked_chat_id, targetId);
              console.log(`[Unban] Also unbanned in linked chat ${chatInfo.linked_chat_id}`);
            }
          } catch (e) { }

        } catch (e) {
          console.error(`[Unban] Failed in ${chId}:`, e.message);
        }
      }
    }
  } else if (platform === 'twitch') {
    if (blogger && blogger.twitch_channel) {
      try {
        await unbanTwitchUserGlobal(blogger.twitch_channel, targetNick);
        success = true;
      } catch (e) {
        let msg = e.message;
        if (e.response && e.response.data && e.response.data.message) {
          msg = e.response.data.message;
        }

        if (e.response?.status === 401 || e.response?.status === 403) {
          errorReason = `Twitch Auth Error (${e.response.status}): Бот не имеет прав модератора или токен устарел. Переподключите Twitch с нужными правами.`;
          console.error(`[Twitch] Auth error: ${e.response.status} - ${msg}`);
        } else if (msg === 'Target user not found on Twitch' || msg.includes('is not banned')) {
          success = true;
          console.log(`[Twitch] Treated error as success: ${msg}`);
        } else {
          console.error(e);
          errorReason = msg;
        }
      }
    }
  }

  if (!success) {
    DB.addToQueue({ bloggerId, targetNick, platform, price, channelId: channelId || null });

    let userMsg = `⚠️ <b>Автоматический разбан не удался.</b>\n\n` +
      `Заявка отправлена администратору канала (блогеру).\n` +
      `Вас разбанят вручную в ближайшее время.`;

    if (platform === 'twitch' && errorReason) {
      if (errorReason === 'Target user not found on Twitch' || errorReason.includes('is not banned')) {
        userMsg = `❌ <b>Ошибка:</b>\n\nНик <b>${targetNick}</b> не найден в списке забаненных этого канала (или пользователя не существует).\n\nЗаявка передана стримеру для проверки.`;
      }
    } else if (platform === 'telegram' && errorReason) {
      userMsg += `\n\n<b>Причина:</b> ${errorReason}`;
    }

    try {
      await bot.telegram.sendMessage(pending.buyerId || pending.userId, userMsg, { parse_mode: 'HTML' });
    } catch (e) { }

    try {
      await bot.telegram.sendMessage(bloggerId,
        `⚠️ <b>Ошибка авто-разбана!</b>\n\n` +
        `Пользователь оплатил разбан, но бот не смог найти его или разбанить.\n` +
        `Ник: <b>${targetNick}</b>\n` +
        `Платформа: ${platformLabel}\n` +
        `Причина: ${errorReason || 'Unknown'}\n\n` +
        `Заявка добавлена в вашу очередь.`,
        { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('📂 Открыть очередь', 'blogger:queue')]]) }
      );
    } catch (e) { }
  } else {
    try {
      await bot.telegram.sendMessage(pending.buyerId || pending.userId,
        `✅ <b>Вы успешно разбанены!</b>\n\n` +
        `Проверьте доступ к каналу/чату.`,
        { parse_mode: 'HTML' }
      );
    } catch (e) { }
  }

  if (price > 0 && success) {
    try {
      await bot.telegram.sendMessage(bloggerId, `💰 <b>Продажа разбана (${platformLabel})</b>\nНик: ${targetNick}\nСумма: ${price}₽`, { parse_mode: 'HTML' });
    } catch (e) { }
  }
}

app.use((req, res, next) => {
  if (req.params?.userId !== undefined) req.params.userId = normalizeUserId(req.params.userId);
  if (req.body?.userId !== undefined) req.body.userId = normalizeUserId(req.body.userId);
  if (req.body?.bloggerId !== undefined) req.body.bloggerId = normalizeUserId(req.body.bloggerId);
  next();
});

initTwitchVerificationWatchers();
setInterval(() => {
  DB.expireTwitchVerifications(Date.now());
  const active = new Set(DB.getActiveTwitchVerificationChannels());
  twitchIrcState.desired.forEach((channel) => {
    if (!active.has(channel)) {
      twitchUnwatchChannel(channel);
    }
  });
}, 30000);

app.get('/api/config', (req, res) => {
  const botUsername = BOT_USERNAME || bot.botInfo?.username || '';
  res.json({
    botUsername,
    webAppUrl: WEBAPP_URL || '',
    nicepayMinAmountRub: NICEPAY_MIN_AMOUNT_RUB,
    nowpayMinAmountRub: NOWPAY_MIN_AMOUNT_RUB
  });
});

app.post('/api/auth/start', (req, res) => {
  const redirect = req.body?.redirect;
  const botUsername = BOT_USERNAME || bot.botInfo?.username || '';
  if (!botUsername) {
    return res.status(500).json({ error: 'Bot username missing' });
  }

  const now = Date.now();
  const code = generateLoginCode();
  const loginKey = buildLoginKey(code);
  const expiresAt = now + LOGIN_CODE_TTL_MS;
  const safeRedirect = redirect && String(redirect).startsWith('/') ? String(redirect) : '/app';

  DB.setPending(loginKey, {
    status: 'pending',
    code,
    key: loginKey,
    redirect: safeRedirect,
    createdAt: now,
    expiresAt
  });

  const link = `https://t.me/${botUsername}?start=${loginKey}`;
  return res.json({
    code,
    key: loginKey,
    link,
    expiresAt,
    botUsername
  });
});

app.get('/api/auth/status/:code', (req, res) => {
  const rawCode = String(req.params.code || '');
  const loginKey = buildLoginKey(rawCode);
  const pending = DB.getPending(loginKey);
  if (!pending) {
    return res.json({ status: 'missing' });
  }

  if (pending.expiresAt && pending.expiresAt <= Date.now()) {
    DB.deletePending(loginKey);
    return res.json({ status: 'expired' });
  }

  if (pending.status === 'verified' && pending.token && pending.userId) {
    DB.deletePending(loginKey);
    return res.json({
      status: 'verified',
      token: pending.token,
      userId: pending.userId
    });
  }

  return res.json({
    status: 'pending',
    expiresAt: pending.expiresAt || null
  });
});

app.get('/api/auth/telegram', (req, res) => {
  const hash = req.query.hash;
  const redirect = req.query.redirect;
  const data = pickTelegramAuthData(req.query);

  if (!hash || !data.id || !data.auth_date) {
    return res.status(400).send('Missing auth data');
  }

  if (!verifyTelegramAuth(data, hash)) {
    return res.status(401).send('Invalid auth');
  }

  const authDate = Number(data.auth_date);
  if (!Number.isFinite(authDate)) {
    return res.status(400).send('Invalid auth date');
  }

  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec > TELEGRAM_LOGIN_TTL_SEC) {
    return res.status(401).send('Auth expired');
  }

  const userId = normalizeUserId(data.id);
  DB.createUser(userId);
  if (data.username) {
    DB.saveUsername(data.username, userId);
  }

  const token = signAuthToken({ sub: userId, username: data.username || null });
  res.setHeader('Set-Cookie', buildAuthCookie(token, req));

  const safeRedirect = redirect && String(redirect).startsWith('/') ? String(redirect) : '/app';
  const join = safeRedirect.includes('?') ? '&' : '?';
  return res.redirect(`${safeRedirect}${join}auth=1`);
});

app.get('/api/auth/me', (req, res) => {
  const token = getAuthToken(req);
  const payload = verifyAuthToken(token);
  if (!payload?.sub) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  return res.json({
    userId: payload.sub,
    username: payload.username || null
  });
});


app.get('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    DB.createUser(userId);
    const user = DB.getUser(userId);
    let channels = DB.getUserChannels(userId);
    const filtered = await filterChannelsByAdmin(channels, userId);
    channels = filtered.channels;
    const purchases = DB.getPurchases(userId);
    const queue = DB.getQueue(userId);
    const userPromo = DB.getUserPromo(userId);

    const safeTwitchPrice = user?.twitch_price !== null && user?.twitch_price !== undefined
      ? clampMinPrice(user.twitch_price)
      : MIN_UNBAN_PRICE;
    const safeChannels = channels.map(ch => ({
      ...ch,
      price: clampMinPrice(ch.price ?? MIN_UNBAN_PRICE)
    }));

    const totalEarned = purchases.reduce((sum, p) => sum + (p.net_amount || p.price || 0), 0);
    const withdrawals = DB.getWithdrawals(userId);
    const totalWithdrawn = withdrawals
      .filter(w => w.status !== 'rejected')
      .reduce((sum, w) => sum + (w.amount || 0), 0);

    res.json({
      user: {
        ...user,
        twitch_price: safeTwitchPrice,
        channels: safeChannels,
        channels_count: channels.length,
        balance: totalEarned - totalWithdrawn,
        purchases_count: purchases.length,
        queue_count: queue.length,
      },
      hasChannels: channels.length > 0 || !!user?.twitch_channel,
      userPromo,
    });
  } catch (e) {
    console.error('API Error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/user/:userId/create', (req, res) => {
  const { userId } = req.params;
  DB.createUser(userId);
  res.json({ success: true });
});

app.post('/api/promo/activate', (req, res) => {
  const { userId, code } = req.body || {};
  if (!userId || !code) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  const promo = DB.getPromo(code.trim());
  if (!promo) {
    return res.status(404).json({ error: 'Promo not found' });
  }

  try {
    DB.createUser(userId);
    const currentPromo = DB.getUserPromo(userId);
    if (currentPromo?.code === promo.code) {
      return res.json({ success: true, userPromo: currentPromo });
    }

    if (promo.max_uses !== null && promo.max_uses !== undefined && promo.max_uses !== -1) {
      const activeUses = DB.getPromoActiveUses(promo.code);
      if (activeUses >= promo.max_uses) {
        return res.status(409).json({ error: 'Лимит использований исчерпан' });
      }
    }
    DB.activatePromo(userId, promo.code);
    const userPromo = DB.getUserPromo(userId);
    return res.json({ success: true, userPromo });
  } catch (e) {
    console.error('Promo activate error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/promo/deactivate', (req, res) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    DB.deactivatePromo(userId);
    return res.json({ success: true });
  } catch (e) {
    console.error('Promo deactivate error:', e);
    return res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/bloggers/search', (req, res) => {
  const rawQuery = (req.query.q || '').trim();
  if (!rawQuery) {
    return res.json({ results: [] });
  }

  try {
    const normalizedQuery = normalizeSearchQuery(rawQuery);
    let found = DB.searchUsers(normalizedQuery);
    const rawLower = rawQuery.toLowerCase();
    if (!found.length && rawLower && rawLower !== normalizedQuery) {
      found = DB.searchUsers(rawLower);
    }

    const unique = new Map();
    found.forEach(b => {
      if (!unique.has(b.id)) unique.set(b.id, b);
    });

    const results = Array.from(unique.values()).map(b => {
      const channels = DB.getUserChannels(b.id);
      const match = pickSearchMatch(rawQuery, b, channels);
      const matchChannel = findMatchingTgChannel(channels, b.twitch_channel);
      const primaryChannel = matchChannel || pickPrimaryChannel(channels);
      const channelTitle = normalizeChannelLabel(primaryChannel);
      const channelId = primaryChannel?.id || null;
      const channelUsername = primaryChannel?.username ? String(primaryChannel.username).trim().replace(/^@/, '') : null;
      const tgUsernames = channels
        .map(ch => normalizeLogin(ch?.username))
        .filter(Boolean);
      const tgTitles = channels
        .map(ch => normalizeChannelTitle(ch?.title))
        .filter(Boolean);
      const tgChannels = channels.map(ch => ({
        id: ch.id,
        title: ch.title || null,
        username: ch.username ? String(ch.username).trim().replace(/^@/, '') : null
      }));
      return {
        id: b.id,
        display_name: b.display_name,
        twitch_channel: b.twitch_channel,
        is_verified: !!b.is_verified,
        tg_twitch_match: !!matchChannel,
        channels_count: channels.length,
        channel_title: channelTitle,
        channel_id: channelId,
        channel_username: channelUsername,
        tg_usernames: tgUsernames,
        tg_titles: tgTitles,
        tg_channels: tgChannels,
        match_platform: match.platform,
        match_label: match.label,
        match_channel_id: match.channelId
      };
    });

    res.json({ results });
  } catch (e) {
    console.error('Search error:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});


app.get('/api/blogger/:bloggerId', async (req, res) => {
  const { bloggerId } = req.params;

  try {
    const blogger = DB.getUser(bloggerId);
    if (!blogger) {
      return res.status(404).json({ error: 'Not found' });
    }

    let channels = DB.getUserChannels(bloggerId);
    const filtered = await filterChannelsByAdmin(channels, bloggerId);
    channels = filtered.channels;
    const safeChannels = channels.map(ch => ({
      ...ch,
      price: clampMinPrice(ch.price ?? MIN_UNBAN_PRICE)
    }));
    const minTgPrice = safeChannels.length > 0
      ? Math.min(...safeChannels.map(c => c.price))
      : 0;
    const safeTwitchPrice = blogger.twitch_price !== null && blogger.twitch_price !== undefined
      ? clampMinPrice(blogger.twitch_price)
      : MIN_UNBAN_PRICE;
    const matchChannel = findMatchingTgChannel(safeChannels, blogger.twitch_channel);
    const primaryChannel = matchChannel || pickPrimaryChannel(safeChannels);
    const channelTitle = normalizeChannelLabel(primaryChannel);
    const channelId = primaryChannel?.id || null;
    const tgUsernames = safeChannels
      .map(ch => normalizeLogin(ch?.username))
      .filter(Boolean);
    const tgTitles = safeChannels
      .map(ch => normalizeChannelTitle(ch?.title))
      .filter(Boolean);

    res.json({
      id: blogger.id,
      display_name: blogger.display_name,
      twitch_channel: blogger.twitch_channel,
      is_verified: !!blogger.is_verified,
      tg_twitch_match: !!matchChannel,
      twitch_price: safeTwitchPrice,
      channel_title: channelTitle,
      channel_id: channelId,
      channel_username: primaryChannel?.username ? String(primaryChannel.username).trim().replace(/^@/, '') : null,
      tg_usernames: tgUsernames,
      tg_titles: tgTitles,
      channels: safeChannels.map(c => ({ id: c.id, title: c.title, username: c.username, price: c.price })),
      min_tg_price: minTgPrice,
    });
  } catch (e) {
    console.error('Blogger fetch error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/unban/create', async (req, res) => {
  const { userId, bloggerId, platform, targetNick, paymentMethod, channelId: rawChannelId } = req.body;

  if (!userId || !bloggerId || !platform || !targetNick) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const blogger = DB.getUser(bloggerId);
    if (!blogger) {
      return res.status(404).json({ error: 'Blogger not found' });
    }

    const channelId = rawChannelId ? String(rawChannelId) : null;
    let selectedChannel = null;

    let price = MIN_UNBAN_PRICE;
    if (platform === 'twitch') {
      price = blogger.twitch_price || MIN_UNBAN_PRICE;
    } else if (platform === 'telegram') {
      const channels = DB.getUserChannels(bloggerId);
      if (channelId) {
        selectedChannel = channels.find(ch => String(ch.id) === channelId) || null;
        if (!selectedChannel) {
          return res.status(400).json({ error: 'Channel not found' });
        }
        const adminStatus = await isBotAdminInChannel(selectedChannel.id);
        if (adminStatus === false) {
          await notifyChannelUnlinked(bloggerId, selectedChannel);
          DB.removeChannel(selectedChannel.id);
          channelAdminCache.delete(String(selectedChannel.id));
          return res.status(400).json({ error: 'Bot is not admin' });
        }
        price = selectedChannel.price ?? MIN_UNBAN_PRICE;
      } else {
        const prices = channels.map(c => c.price).filter(p => p !== null && p !== undefined);
        price = prices.length ? Math.min(...prices) : MIN_UNBAN_PRICE;
      }
    }
    price = clampMinPrice(price);

    const pendingId = `unban_${userId}_${Date.now()}`;
    const platformLabel = formatPlatformLabel(platform, selectedChannel);
    const pending = {
      pendingId,
      buyerId: userId,
      bloggerId,
      platform,
      targetNick,
      price,
      channelId,
      stage: 'payment_pending',
      paymentMethod: paymentMethod || null,
      source: 'webapp',
      createdAt: Date.now(),
    };


    if (price === 0) {
      await processUnban(pending);
      return res.json({ success: true, free: true });
    }


    if (paymentMethod === 'nicepay') {
      if (Number(price) < NICEPAY_MIN_AMOUNT_RUB) {
        return res.status(400).json({ error: `Минимальная сумма для оплаты картой: ${NICEPAY_MIN_AMOUNT_RUB} ₽` });
      }
      const orderId = `order_${pendingId}`;
      const invoice = await createNicePayInvoice(
        price, orderId, 'webapp_user',
        `Unban: ${targetNick} (${platformLabel})`,
        'https://t.me/unbanmepleasebot',
        'https://t.me/unbanmepleasebot'
      );

      if (invoice.success) {
        pending.invoiceId = invoice.invoiceId;
        pending.orderId = orderId;
        DB.setPending(pendingId, pending);
        return res.json({ success: true, paymentUrl: invoice.paymentUrl, pendingId });
      }
      return res.status(500).json({ error: 'Payment creation failed' });
    }

    if (paymentMethod === 'cryptobot') {
      const invoice = await createCryptoBotInvoice(price, pendingId);
      if (invoice.success) {
        pending.invoiceId = invoice.id;
        pending.provider = 'cryptobot';
        DB.setPending(pendingId, pending);
        return res.json({ success: true, paymentUrl: invoice.url, pendingId });
      }
      return res.status(500).json({ error: 'CryptoBot invoice failed' });
    }

    if (paymentMethod === 'nowpay' || paymentMethod === 'crypto') {
      if (Number(price) < NOWPAY_MIN_AMOUNT_RUB) {
        return res.status(400).json({ error: `Минимальная сумма для NOWpayments: ${NOWPAY_MIN_AMOUNT_RUB} ₽` });
      }
      const orderId = pendingId;
      const description = `Unban: ${targetNick} (${platformLabel})`;
      const payment = await createNowPayPayment(price, orderId, description);
      if (!payment.success) {
        return res.status(500).json({ error: payment.error || 'NOWpayments payment failed' });
      }
      if (!payment.payAddress) {
        return res.status(500).json({ error: 'NOWpayments: не удалось получить адрес оплаты' });
      }

      const updatedPending = {
        ...pending,
        stage: 'payment_pending',
        paymentMethod: 'nowpay',
        provider: 'nowpay',
        orderId,
        nowpayPaymentId: payment.paymentId,
        nowpayAddress: payment.payAddress,
        nowpayAmount: payment.payAmount,
        nowpayCurrency: payment.payCurrency
      };
      DB.setPending(pendingId, updatedPending);

      return res.json({
        success: true,
        nowpay: true,
        pendingId,
        paymentId: payment.paymentId,
        payAddress: payment.payAddress,
        payAmount: payment.payAmount,
        payCurrency: payment.payCurrency,
        priceCurrency: NOWPAY_PRICE_CURRENCY,
        paymentUrl: payment.paymentUrl
      });
    }

    res.status(400).json({ error: 'Invalid payment method' });
  } catch (error) {
    console.error('Unban create error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/unban/check/:pendingId', async (req, res) => {
  const { pendingId } = req.params;
  let pending = DB.getPending(pendingId);

  if (!pending) {
    return res.json({ status: 'expired' });
  }

  if (pending.stage === 'payment_pending') {
    if (pending.paymentMethod === 'nicepay' && pending.orderId) {
      const isPaid = await verifyNicePayOrder(pending.orderId);
      if (isPaid) {
        DB.setPending(pendingId, { ...pending, stage: 'processing' });
        await processUnban(pending);
        DB.setPending(pendingId, { ...pending, stage: 'completed' });
        setTimeout(() => DB.deletePending(pendingId), 30000);
      }
    }

    if (pending.paymentMethod === 'cryptobot' && pending.invoiceId) {
      const status = await getCryptoBotInvoiceStatus(pending.invoiceId);
      if (status === 'paid') {
        DB.setPending(pendingId, { ...pending, stage: 'processing' });
        await processUnban(pending);
        DB.setPending(pendingId, { ...pending, stage: 'completed' });
        setTimeout(() => DB.deletePending(pendingId), 30000);
      }
    }

    if (pending.paymentMethod === 'nowpay' && pending.nowpayPaymentId) {
      const statusInfo = await getNowPayPaymentStatus(pending.nowpayPaymentId);
      const status = statusInfo?.payment_status || statusInfo?.status;
      if (isNowPayPaidStatus(status)) {
        DB.setPending(pendingId, { ...pending, stage: 'processing' });
        await processUnban(pending);
        DB.setPending(pendingId, { ...pending, stage: 'completed' });
        setTimeout(() => DB.deletePending(pendingId), 30000);
      }
      if (['failed', 'expired', 'refunded', 'partially_paid'].includes(String(status || '').toLowerCase())) {
        DB.setPending(pendingId, { ...pending, stage: 'rejected' });
        setTimeout(() => DB.deletePending(pendingId), 30000);
      }
    }
  }

  pending = DB.getPending(pendingId) || pending;

  if (
    pending.source === 'webapp' &&
    pending.stage === 'payment_pending' &&
    Number.isFinite(pending.createdAt)
  ) {
    const maxAgeMs = pending.paymentMethod === 'nowpay' || pending.paymentMethod === 'crypto'
      ? 30 * 60 * 1000
      : 60 * 60 * 1000;
    if (Date.now() - pending.createdAt > maxAgeMs) {
      DB.deletePending(pendingId);
      return res.json({ status: 'expired' });
    }
  }

  if (pending.stage === 'completed') {
    return res.json({ status: 'completed' });
  }

  if (pending.stage === 'rejected') {
    return res.json({ status: 'rejected' });
  }

  res.json({ status: 'pending' });
});


app.post('/api/twitch/link', async (req, res) => {
  const { userId, channelName } = req.body;

  if (!userId || !channelName) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const result = await startTwitchVerification(userId, channelName);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Verification failed' });
    }
    return res.json({
      success: true,
      requestId: result.requestId,
      channelLogin: result.channelLogin,
      channelId: result.channelId,
      code: result.code,
      expiresAt: result.expiresAt
    });
  } catch (e) {
    console.error('Twitch link error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/twitch/verify/start', async (req, res) => {
  const { userId, channelName } = req.body;
  if (!userId || !channelName) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const result = await startTwitchVerification(userId, channelName);
    if (!result.success) {
      return res.status(400).json({ error: result.error || 'Verification failed' });
    }
    return res.json({
      success: true,
      requestId: result.requestId,
      channelLogin: result.channelLogin,
      channelId: result.channelId,
      code: result.code,
      expiresAt: result.expiresAt
    });
  } catch (e) {
    console.error('Twitch verify start error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/twitch/verify/:requestId', (req, res) => {
  const { requestId } = req.params;
  if (!requestId) {
    return res.status(400).json({ error: 'Missing requestId' });
  }

  try {
    const record = DB.getTwitchVerification(requestId);
    if (!record) {
      return res.status(404).json({ status: 'missing' });
    }

    if (record.status === 'pending' && record.expires_at <= Date.now()) {
      DB.setTwitchVerificationStatus(record.id, 'expired');
      record.status = 'expired';
    }

    return res.json({
      status: record.status,
      channelLogin: record.channel_login,
      code: record.code,
      expiresAt: record.expires_at,
      verifiedAt: record.verified_at
    });
  } catch (e) {
    console.error('Twitch verify status error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/twitch/profile', async (req, res) => {
  const rawLogin = String(req.query.login || '').trim();
  const login = rawLogin.replace(/^@/, '').toLowerCase();
  if (!login) return res.status(400).json({ error: 'Missing login' });
  if (!getTwitchClientId() || !getTwitchAccessToken()) {
    return res.status(500).json({ error: 'Twitch not configured' });
  }

  try {
    const profile = await getCachedTwitchProfile(login);
    if (!profile) return res.status(404).json({ error: 'Not found' });
    return res.json({
      login: profile.login,
      display_name: profile.display_name,
      profile_image_url: profile.profile_image_url
    });
  } catch (e) {
    console.error('Twitch profile error:', e.message);
    return res.status(500).json({ error: 'Twitch profile error' });
  }
});


app.patch('/api/twitch/price', (req, res) => {
  const { userId, price } = req.body;

  if (!userId || price === undefined) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < MIN_UNBAN_PRICE) {
      return res.status(400).json({ error: `Минимальная цена: ${MIN_UNBAN_PRICE} ₽` });
    }
    const finalPrice = Math.round(parsedPrice);
    const user = DB.getUser(userId);
    if (user?.twitch_channel) {
      DB.updateTwitch(userId, user.twitch_channel, finalPrice);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.delete('/api/twitch', (req, res) => {
  const { userId } = req.body;

  try {
    DB.updateTwitch(userId, null, 500, null);
    revokeUserVerification(userId);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/channel/link', async (req, res) => {
  const { userId, username } = req.body;

  if (!userId || !username) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const rawName = String(username || '').trim();
    const linkMatch = rawName.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^/?#]+)/i);
    const cleaned = linkMatch ? linkMatch[1] : rawName;
    const channelName = cleaned.startsWith('@') ? cleaned : '@' + cleaned;

    const chat = await bot.telegram.getChat(channelName);

    if (DB.checkChannelLinked(String(chat.id), userId)) {
      return res.status(400).json({ error: 'Channel already linked' });
    }

    const admins = await bot.telegram.getChatAdministrators(chat.id);
    const botId = await resolveBotId();
    const isBotAdmin = admins.some(a => a.user.id === botId);

    if (!isBotAdmin) {
      return res.status(400).json({ error: 'Bot is not admin' });
    }

    DB.createUser(userId);
    DB.addChannel({
      id: String(chat.id),
      title: chat.title,
      price: MIN_UNBAN_PRICE,
      owner_id: userId,
      username: chat.username ? `@${chat.username}` : null,
      photo_file_id: chat.photo?.big_file_id || chat.photo?.small_file_id || null,
    });
    revokeUserVerification(userId);

    res.json({ success: true, channel: { id: chat.id, title: chat.title } });
  } catch (e) {
    console.error('Channel link error:', e);
    res.status(400).json({ error: 'Channel not found or no access' });
  }
});

app.get('/api/channel/:channelId/photo', async (req, res) => {
  const channelId = String(req.params.channelId);
  try {
    let channel = DB.getChannel(channelId);
    if (!channel) return res.status(404).end();

    const queryUsername = String(req.query.u || '').trim();
    const normalizedQueryUsername = queryUsername ? queryUsername.replace(/^@/, '') : '';

    let fileId = channel.photo_file_id || null;
    const fetchChatPhoto = async () => {
      const chat = await bot.telegram.getChat(channelId);
      const newFileId = chat?.photo?.big_file_id || chat?.photo?.small_file_id || null;
      if (newFileId) {
        try {
          DB.updateChannelPhoto(channelId, newFileId);
        } catch (e) { }
      }
      return newFileId;
    };

    if (!fileId) {
      try {
        fileId = await fetchChatPhoto();
      } catch (e) {
        return res.status(404).end();
      }
    }

    let url = await getTelegramFileUrl(fileId);
    if (!url) {
      try {
        const refreshed = await fetchChatPhoto();
        if (refreshed) {
          url = await getTelegramFileUrl(refreshed);
        }
      } catch (e) {
        url = null;
      }
    }
    if (!url && (channel.username || normalizedQueryUsername)) {
      const username = normalizedQueryUsername || String(channel.username || '').replace(/^@/, '').trim();
      if (username) {
        return res.redirect(`https://t.me/i/userpic/320/${encodeURIComponent(username)}.jpg`);
      }
    }
    if (!url) return res.status(404).end();
    res.redirect(url);
  } catch (e) {
    res.status(500).end();
  }
});


app.patch('/api/channel/:channelId/price', (req, res) => {
  const { channelId } = req.params;
  const { price } = req.body;

  try {
    const parsedPrice = Number(price);
    if (!Number.isFinite(parsedPrice) || parsedPrice < MIN_UNBAN_PRICE) {
      return res.status(400).json({ error: `Минимальная цена: ${MIN_UNBAN_PRICE} ₽` });
    }
    DB.updateChannelPrice(channelId, Math.round(parsedPrice));
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.delete('/api/channel/:channelId', (req, res) => {
  const { channelId } = req.params;

  try {
    const channel = DB.getChannel(channelId);
    DB.removeChannel(channelId);
    if (channel?.owner_id) {
      revokeUserVerification(String(channel.owner_id));
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/user/:userId/stats', (req, res) => {
  const { userId } = req.params;

  try {
    const purchases = DB.getPurchases(userId);
    const channels = DB.getUserChannels(userId);
    const purchasesWithLabels = attachPlatformLabels(purchases, channels);
    const withdrawals = DB.getWithdrawals(userId);

    const totalIncome = purchases.reduce((sum, p) => sum + (p.net_amount || p.price || 0), 0);
    const totalWithdrawn = withdrawals
      .filter(w => w.status === 'approved')
      .reduce((sum, w) => sum + (w.amount || 0), 0);

    res.json({
      totalIncome,
      totalWithdrawn,
      purchases: purchasesWithLabels.slice(0, 10),
      withdrawals: withdrawals.slice(0, 5),
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.get('/api/user/:userId/queue', (req, res) => {
  const { userId } = req.params;

  try {
    const queue = DB.getQueue(userId);
    const channels = DB.getUserChannels(userId);
    const queueWithLabels = attachPlatformLabels(queue, channels);
    res.json({ queue: queueWithLabels });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/queue/:id/done', (req, res) => {
  const { id } = req.params;

  try {
    DB.deleteQueueItem(id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/api/withdraw', async (req, res) => {
  const { userId, amount, wallet } = req.body;

  if (!userId || !amount || !wallet) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  try {
    const purchases = DB.getPurchases(userId);
    const withdrawals = DB.getWithdrawals(userId);

    const totalEarned = purchases.reduce((sum, p) => sum + (p.net_amount || p.price || 0), 0);
    const totalWithdrawn = withdrawals
      .filter(w => w.status !== 'rejected')
      .reduce((sum, w) => sum + (w.amount || 0), 0);

    const balance = totalEarned - totalWithdrawn;

    if (amount < 1000) {
      return res.status(400).json({ error: 'Minimum 1000 RUB' });
    }
    if (amount > balance) {
      return res.status(400).json({ error: 'Insufficient funds' });
    }

    const result = DB.addWithdrawal({
      userId,
      amount,
      wallet,
      status: 'pending',
    });

    const withdrawalId = result.lastInsertRowid;


    const rate = await getUsdtRubRate();
    const usdAmount = (amount / rate).toFixed(2);

    for (const adminId of ADMIN_IDS) {
      try {
        await bot.telegram.sendMessage(adminId,
          `💸 <b>Заявка на вывод (WebApp)</b>\n\n` +
          `User ID: ${userId}\n` +
          `Сумма: <b>${amount} RUB</b> (~${usdAmount} USDT)\n` +
          `Кошелек: <code>${wallet}</code>\n` +
          `Баланс после: ${balance - amount} RUB`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
              [Markup.button.callback('✅ Одобрить', `admin_w:approve:${withdrawalId}`)],
              [Markup.button.callback('❌ Отклонить', `admin_w:reject:${withdrawalId}`)]
            ])
          }
        );
      } catch (e) { }
    }

    res.json({ success: true });
  } catch (e) {
    console.error('Withdraw error:', e);
    res.status(500).json({ error: 'Server error' });
  }
});



app.post('/webhook', async (req, res) => {
  const { order_id, status } = req.body;
  if (status === 'success') {
    const all = DB.getAllPending();
    const pending = Object.values(all).find(p => p.orderId === order_id);

    if (pending) {
      await processUnban(pending);
      DB.deletePending(pending.pendingId);
    }
  }
  res.sendStatus(200);
});


let cachedUsdtRate = null;
let lastRateFetch = 0;

async function getUsdtRubRate() {
  const now = Date.now();
  if (cachedUsdtRate && (now - lastRateFetch < 10 * 60 * 1000)) {
    return cachedUsdtRate;
  }

  try {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/price?symbol=USDTRUB');
    if (res.data && res.data.price) {
      cachedUsdtRate = parseFloat(res.data.price);
      lastRateFetch = now;
      console.log(`Updated USDT Rate: ${cachedUsdtRate}`);
      return cachedUsdtRate;
    }
  } catch (e) {
    console.error('Failed to fetch USDT rate:', e.message);
  }

  return Number(process.env.USDT_RATE) || 100;
}

const nowPayHeaders = () => ({
  'x-api-key': NOWPAY_API_KEY
});

const isNowPayPaidStatus = (status) => {
  const normalized = String(status || '').toLowerCase();
  return ['finished', 'confirmed', 'sending', 'paid'].includes(normalized);
};

const sortObjectKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortObjectKeys);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = sortObjectKeys(value[key]);
      return acc;
    }, {});
  }
  return value;
};

const buildNowPaySignaturePayload = (body) => {
  if (!body) return '';
  if (Buffer.isBuffer(body)) {
    const text = body.toString('utf8');
    try {
      return JSON.stringify(sortObjectKeys(JSON.parse(text)));
    } catch {
      return text;
    }
  }
  if (typeof body === 'string') {
    try {
      return JSON.stringify(sortObjectKeys(JSON.parse(body)));
    } catch {
      return body;
    }
  }
  return JSON.stringify(sortObjectKeys(body));
};

const verifyNowPaySignature = (body, signature) => {
  if (!NOWPAY_IPN_SECRET || !body || !signature) return false;
  const payload = buildNowPaySignaturePayload(body);
  const expected = crypto.createHmac('sha512', NOWPAY_IPN_SECRET).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

async function createNowPayPayment(priceAmount, orderId, description) {
  if (!NOWPAY_API_KEY) return { success: false, error: 'NOWpayments not configured' };
  try {
    const payload = {
      price_amount: Number(priceAmount),
      price_currency: NOWPAY_PRICE_CURRENCY,
      pay_currency: NOWPAY_PAY_CURRENCY,
      order_id: orderId,
      order_description: description
    };
    if (NOWPAY_IPN_URL) payload.ipn_callback_url = NOWPAY_IPN_URL;

    const res = await axios.post(`${NOWPAY_API_URL}/payment`, payload, { headers: nowPayHeaders() });
    const data = res.data || {};
    if (!data.payment_id) {
      return { success: false, error: data.message || 'NOWpayments API error' };
    }
    return {
      success: true,
      paymentId: data.payment_id,
      payAddress: data.pay_address,
      payAmount: data.pay_amount,
      payCurrency: data.pay_currency,
      paymentStatus: data.payment_status,
      paymentUrl: data.invoice_url || data.payment_url || null
    };
  } catch (e) {
    console.error('NOWpayments Create Error:', e.response?.data || e.message);
    return { success: false, error: e.response?.data?.message || e.message };
  }
}

async function getNowPayPaymentStatus(paymentId) {
  if (!NOWPAY_API_KEY || !paymentId) return null;
  try {
    const res = await axios.get(`${NOWPAY_API_URL}/payment/${paymentId}`, { headers: nowPayHeaders() });
    return res.data || null;
  } catch (e) {
    console.error('NOWpayments Status Error:', e.response?.data || e.message);
    return null;
  }
}


async function createCryptoBotInvoice(amount, pendingId) {
  if (!CRYPTOBOT_TOKEN) return { success: false, error: 'CryptoBot not configured' };
  try {
    const rate = await getUsdtRubRate();
    const usdtAmount = (Number(amount) / rate).toFixed(2);
    const res = await axios.post('https://pay.crypt.bot/api/createInvoice', {
      asset: 'USDT',
      amount: usdtAmount,
      description: `Unban order ${pendingId}`,
      payload: pendingId,
      allow_comments: false,
      allow_anonymous: false
    }, {
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN }
    });

    if (res.data.ok) {
      return { success: true, url: res.data.result.bot_invoice_url, id: res.data.result.invoice_id };
    } else {
      console.error('CryptoBot API Error:', res.data);
      return { success: false, error: 'Api Error' };
    }
  } catch (e) {
    console.error('CryptoBot Req Error:', e.response?.data || e.message);
    return { success: false, error: e.message };
  }
}

async function getCryptoBotInvoiceStatus(invoiceId) {
  if (!CRYPTOBOT_TOKEN) return null;
  try {
    const res = await axios.get('https://pay.crypt.bot/api/getInvoices', {
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
      params: { invoice_ids: invoiceId }
    });

    if (res.data.ok && res.data.result.items.length > 0) {
      return res.data.result.items[0].status;
    }
  } catch (e) {
    console.error('CryptoBot Status Error:', e.response?.data || e.message);
  }
  return null;
}

const buildCryptoBotSignaturePayload = (body) => {
  if (!body) return '';
  if (Buffer.isBuffer(body)) return body.toString('utf8');
  if (typeof body === 'string') return body;
  return JSON.stringify(body);
};

const verifyCryptoBotSignature = (body, signature) => {
  if (!signature) return true;
  if (!CRYPTOBOT_TOKEN) return false;
  const secret = crypto.createHash('sha256').update(CRYPTOBOT_TOKEN).digest();
  const payload = buildCryptoBotSignaturePayload(body);
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

bot.action(/pay_cryptobot:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  const result = await createCryptoBotInvoice(pending.price, id);

  if (result.success) {
    DB.setPending(id, { ...pending, invoiceId: result.id, provider: 'cryptobot' });

    await ctx.editMessageText(`<b>Оплата через CryptoBot</b>\nСумма: ${pending.price} RUB`, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('🔗 Оплатить', result.url)],
        [Markup.button.callback('🔄 Проверить', `check_cryptobot:${id}`)],
        [Markup.button.callback('« Назад', `select_payment:${id}`)]
      ])
    });
  } else {
    await ctx.reply('Ошибка создания счета CryptoBot.');
  }
});

bot.action(/check_cryptobot:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  const pending = DB.getPending(id);
  if (!pending) return ctx.answerCbQuery('Заказ не найден');

  if (!pending.invoiceId) return ctx.answerCbQuery('Инвойс не найден');

  await ctx.answerCbQuery('Проверка...', { show_alert: false });

  try {
    const res = await axios.get('https://pay.crypt.bot/api/getInvoices', {
      headers: { 'Crypto-Pay-API-Token': CRYPTOBOT_TOKEN },
      params: { invoice_ids: pending.invoiceId }
    });

    if (res.data.ok && res.data.result.items.length > 0) {
      const invoice = res.data.result.items[0];
      if (invoice.status === 'paid') {
        await ctx.reply('✅ Оплата получена! Выполняем разбан...');
        await processUnban(pending);
        DB.deletePending(id);
        try { await ctx.deleteMessage(); } catch (e) { }
      } else {
        await ctx.reply(`Статус: ${invoice.status}. Ожидание оплаты...`, {
          reply_to_message_id: ctx.callbackQuery.message.message_id
        });
      }
    } else {
      await ctx.reply('Ошибка проверки статуса.');
    }
  } catch (e) {
    console.error('CryptoCheck Error:', e.response?.data || e.message);
    await ctx.reply('Ошибка подключения к CryptoBot.');
  }
});

app.post('/webhook/cryptobot', async (req, res) => {
  const signature = req.header('crypto-pay-api-signature') || '';
  const rawPayload = req.rawBody || req.body;
  if (!verifyCryptoBotSignature(rawPayload, signature)) {
    console.error('CryptoBot signature mismatch');
    return res.status(401).send('Invalid signature');
  }

  const update = req.body;
  console.log('CryptoBot Webhook:', JSON.stringify(update));

  const updateType = update.update_type || update.type || '';
  const invoice = update.payload || null;
  const isPaidUpdate = updateType === 'invoice_paid' || invoice?.status === 'paid' || update?.status === 'paid';

  if (invoice && isPaidUpdate) {
    const pendingId = invoice.payload || invoice.order_id || invoice.orderId || null;
    if (pendingId) {
      const pending = DB.getPending(pendingId);
      if (pending) {
        await processUnban(pending);
        DB.setPending(pendingId, { ...pending, stage: 'completed' });
        setTimeout(() => DB.deletePending(pendingId), 30000);
      }
    }
  }
  res.sendStatus(200);
});

app.post('/webhook/nowpay', async (req, res) => {
  if (!NOWPAY_IPN_SECRET) {
    console.error('NOWpayments IPN secret missing');
    return res.status(500).send('NOWpayments IPN not configured');
  }

  const signature = req.header('x-nowpayments-sig') || '';
  if (!verifyNowPaySignature(req.body || req.rawBody, signature)) {
    console.error('NOWpayments IPN signature mismatch');
    return res.status(401).send('Invalid signature');
  }

  const payload = req.body || {};
  const orderId = payload.order_id || payload.orderId;
  const paymentId = payload.payment_id || payload.paymentId;
  const status = payload.payment_status || payload.status;

  if (!orderId) return res.sendStatus(200);

  const pending = DB.getPending(orderId);
  if (!pending) return res.sendStatus(200);

  if (pending.stage === 'completed' || pending.stage === 'processing') {
    return res.sendStatus(200);
  }

  if (isNowPayPaidStatus(status)) {
    try {
      DB.setPending(orderId, { ...pending, stage: 'processing' });
      await processUnban(pending);
      DB.setPending(orderId, { ...pending, stage: 'completed' });
      setTimeout(() => DB.deletePending(orderId), 30000);
    } catch (e) {
      console.error('NOWpayments IPN process error:', e.message);
    }
    return res.sendStatus(200);
  }

  if (['failed', 'expired', 'refunded', 'partially_paid'].includes(String(status || '').toLowerCase())) {
    DB.setPending(orderId, { ...pending, stage: 'rejected', nowpayPaymentId: paymentId || pending.nowpayPaymentId });
    setTimeout(() => DB.deletePending(orderId), 30000);
  }

  res.sendStatus(200);
});



bot.action('blogger:stats', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const purchases = DB.getPurchases(userId);
  const queue = DB.getQueue(userId);
  const channels = DB.getUserChannels(userId);
  const purchasesWithLabels = attachPlatformLabels(purchases, channels);
  const queueWithLabels = attachPlatformLabels(queue, channels);
  const withdrawals = DB.getWithdrawals(userId);

  const totalIncome = purchases.reduce((sum, p) => sum + (p.net_amount || p.price || 0), 0);
  const totalPaid = withdrawals
    .filter(w => w.status === 'approved')
    .reduce((sum, w) => sum + (w.amount || 0), 0);

  let message = `📊 <b>Статистика</b>\n\n` +
    `💰 Всего заработано: <b>${totalIncome} ₽</b>\n` +
    `💸 Выведено: <b>${totalPaid} ₽</b>\n` +
    `🛒 Всего продаж: <b>${purchases.length}</b>\n\n`;

  if (withdrawals.length > 0) {
    message += `<b>История выводов:</b>\n`;
    withdrawals.slice(0, 5).forEach(w => {
      const date = new Date(w.created_at).toLocaleDateString();
      let icon = '⏳';
      if (w.status === 'approved') icon = '✅';
      if (w.status === 'rejected') icon = '❌';
      message += `${icon} ${w.amount}₽ (${date})\n`;
    });
    message += '\n';
  }

  message += `<b>Последние 10 покупок:</b>\n`;

  if (purchases.length === 0) {
    message += 'Пока ничего нет.';
  } else {
    purchasesWithLabels.slice(0, 10).forEach(p => {
      const date = new Date(p.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
      message += `• ${date} | <b>${p.price}₽</b> | ${p.platform_label || p.platform} (${p.target_nick})\n`;
    });
  }

  const buttons = [];
  if (queueWithLabels.length > 0) {
    buttons.push([Markup.button.callback(`⚠️ Очередь на разбан (${queueWithLabels.length})`, 'blogger:queue')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'blogger:finance_menu')]);

  try {
    await ctx.editMessageText(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  } catch (e) {
    await ctx.reply(message, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
  }

});

bot.action('blogger:queue', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const queue = DB.getQueue(userId);
  const channels = DB.getUserChannels(userId);
  const queueWithLabels = attachPlatformLabels(queue, channels);

  if (queueWithLabels.length === 0) {
    return ctx.editMessageText('✅ Очередь пуста. Всех разбанили.', Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:stats')]]));
  }



  const buttons = queueWithLabels.map(item => {
    return [Markup.button.callback(`✅ Разбанил: ${item.target_nick} (${item.platform_label || item.platform})`, `q_done:${item.id}`)];
  });
  buttons.push([Markup.button.callback('« Назад', 'blogger:stats')]);

  await ctx.editMessageText(
    `⚠️ <b>Ручные разбаны (${queueWithLabels.length})</b>\n\n` +
    `Этим пользователям не прошел авто-разбан (ошибка API или не найден ник).\n` +
    `Разбаньте их вручную и нажмите кнопку.`,
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

bot.action(/q_done:(.+)/, async (ctx) => {
  const id = ctx.match[1];
  await ctx.answerCbQuery('Отмечено');
  DB.deleteQueueItem(id);


  const userId = String(ctx.from.id);
  const queue = DB.getQueue(userId);
  const channels = DB.getUserChannels(userId);
  const queueWithLabels = attachPlatformLabels(queue, channels);

  if (queueWithLabels.length === 0) {
    await ctx.editMessageText('✅ Очередь очищена! Все разбанены.', Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:stats')]]));
  } else {
    const buttons = queueWithLabels.map(item => [Markup.button.callback(`✅ Разбанил: ${item.target_nick} (${item.platform_label || item.platform})`, `q_done:${item.id}`)]);
    buttons.push([Markup.button.callback('« Назад', 'blogger:stats')]);

    await ctx.editMessageText(
      `⚠️ <b>Ручные разбаны (${queueWithLabels.length})</b>\n\n` +
      `Осталось еще ${queueWithLabels.length}. Разбаньте вручную.`,
      { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
    );
  }
});


bot.action('blogger:withdraw', async (ctx) => {
  const userId = String(ctx.from.id);
  const balance = calculateBalance(userId);
  const minRub = 1000;

  if (balance < minRub) {
    return ctx.answerCbQuery(`❌ Недостаточно средств.\nМинимум: ${minRub} ₽\nБаланс: ${balance} ₽`, { show_alert: true });
  }

  await ctx.answerCbQuery();

  clearUserState(userId);
  DB.setPending(`withdraw_${userId}`, { stage: 'awaiting_withdraw_amount', userId, balance, promptId: ctx.callbackQuery.message.message_id });

  try {
    await ctx.editMessageText(`💸 <b>Вывод средств</b>\n\nДоступно: ${balance} ₽\nВведите сумму вывода (в рублях):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
  } catch (e) {
    const msg = await ctx.reply(`💸 <b>Вывод средств</b>\n\nДоступно: ${balance} ₽\nВведите сумму вывода (в рублях):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ Отмена', 'blogger:setup')]]) });
    DB.setPending(`withdraw_${userId}`, { stage: 'awaiting_withdraw_amount', userId, balance, promptId: msg.message_id });
  }
});

bot.action(/admin_w:(.+):(.+)/, async (ctx) => {
  const [, decision, id] = ctx.match;
  const w = DB.getWithdrawal(id);
  if (!w || w.status !== 'pending') return ctx.answerCbQuery('Заявка не актуальна');

  if (decision === 'approve') {
    DB.updateWithdrawalStatus(id, 'approved');
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n✅ <b>ОДОБРЕНО</b>`, { parse_mode: 'HTML' });
    try {
      await bot.telegram.sendMessage(w.user_id, `✅ <b>Ваша заявка на вывод одобрена!</b>\nСумма: ${w.amount} ₽\nПроверьте кошелек.`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]])
      });
    } catch (e) { }
  } else {
    DB.updateWithdrawalStatus(id, 'rejected');
    await ctx.editMessageText(`${ctx.callbackQuery.message.text}\n\n❌ <b>ОТКЛОНЕНО</b>`, { parse_mode: 'HTML' });
    try {
      await bot.telegram.sendMessage(w.user_id, `❌ <b>Заявка на вывод отклонена.</b>\nСредства возвращены на баланс.`, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('« В меню', 'blogger:setup')]])
      });
    } catch (e) { }
  }
});

bot.action('do_withdraw', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const pending = DB.getPending(`withdraw_${userId}`);

  if (!pending || !pending.amount || !pending.wallet) return ctx.reply('Ошибка. Начните заново.');

  const balance = calculateBalance(userId);
  if (balance < pending.amount) return ctx.reply('❌ Баланс изменился. Недостаточно средств.');

  const result = DB.addWithdrawal({
    userId,
    amount: pending.amount,
    wallet: pending.wallet,
    status: 'pending'
  });

  const withdrawalId = result.lastInsertRowid;

  DB.deletePending(`withdraw_${userId}`);
  await ctx.editMessageText('✅ <b>Заявка отправлена!</b>\nОжидайте подтверждения.', {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:setup')]])
  });

  const adminMsg = `💸 <b>Заявка на вывод</b>\n\n` +
    `Пользователь: ID ${userId}\n` +
    `Сумма: <b>${pending.amount} RUB</b>\n` +
    `Кошелек (TRC20): <code>${pending.wallet}</code>\n` +
    `Баланс после вывода: ${balance - pending.amount} RUB`;

  for (const adminId of ADMIN_IDS) {
    try {
      await bot.telegram.sendMessage(adminId, adminMsg, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Одобрить', `admin_w:approve:${withdrawalId}`)],
          [Markup.button.callback('❌ Отклонить', `admin_w:reject:${withdrawalId}`)]
        ])
      });
    } catch (e) { }
  }
});

app.listen(3000, '0.0.0.0', () => console.log('Server running on 0.0.0.0:3000'));

if (process.env.SKIP_BOT !== 'true') {
  bot.launch().then(() => console.log('Bot started')).catch(err => console.error('Bot launch error:', err));
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
} else {
  console.log('Skipping bot launch (SKIP_BOT=true)');
}


bot.action('blogger:channels_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const blogger = DB.getUser(userId);

  const twitchBtn = blogger.twitch_channel
    ? Markup.button.callback('⚙️ Настроить Twitch', 'blogger:manage_twitch')
    : Markup.button.callback('🔗 Привязать Twitch', 'blogger:linktwitch');

  const channels = DB.getUserChannels(userId);
  const tgBtn = channels.length > 0
    ? Markup.button.callback('⚙️ Настроить Telegram', 'blogger:channels')
    : Markup.button.callback('🔗 Привязать Telegram', 'blogger:channels');

  const keyboard = Markup.inlineKeyboard([
    [twitchBtn],
    [tgBtn],
    [Markup.button.callback('« Назад', 'blogger:setup')]
  ]);

  const text = `📢 <b>Ваши каналы</b>\n\nВы можете управлять подключенными каналами:`;
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
});

bot.action('blogger:finance_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  if (!hasLinkedSocials(userId)) {
    return ctx.reply('Сначала привяжите хотя бы один канал', { parse_mode: 'HTML' });
  }

  const balance = calculateBalance(userId);
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💸 Вывести средства', 'blogger:withdraw')],
    [Markup.button.callback('📊 Статистика', 'blogger:stats')],
    [Markup.button.callback('🎁 Промокоды', 'blogger:promo_menu')],
    [Markup.button.callback('« Назад', 'blogger:setup')]
  ]);

  const text = `💰 <b>Финансы</b>\n\nБаланс: <b>${balance} ₽</b>`;
  try {
    await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  } catch (e) {
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  }
});

bot.action('blogger:promo_menu', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  const userPromo = DB.getUserPromo(userId);

  let text = '🎁 <b>Промокод</b>\n\n';

  if (userPromo) {
    const expiresDate = new Date(userPromo.expires_at);
    const daysLeft = Math.ceil((expiresDate - new Date()) / (1000 * 60 * 60 * 24));
    text += `Промокод: <b>Активен</b>\n`;
    text += `Комиссия: <b>${userPromo.discount_percent}%</b> (вместо стандартной)\n`;
    text += `Осталось дней: <b>${daysLeft}</b>`;
  } else {
    text += 'У вас нет активного промокода';
  }

  const buttons = [];
  if (!userPromo) {
    buttons.push([Markup.button.callback('➕ Активировать промокод', 'blogger:activate_promo')]);
  } else {
    buttons.push([Markup.button.callback('❌ Деактивировать', 'blogger:deactivate_promo')]);
  }
  buttons.push([Markup.button.callback('« Назад', 'blogger:finance_menu')]);

  await ctx.editMessageText(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard(buttons)
  });
});

bot.action('blogger:activate_promo', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  DB.setPending(`promo_activate_${userId}`, {
    stage: 'awaiting_promo_activation',
    userId,
    promptId: ctx.callbackQuery.message.message_id
  });

  await ctx.editMessageText(
    '🎁 <b>Активация промокода</b>\n\nВведите код:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'blogger:promo_menu')]]) }
  );
});

bot.action('blogger:deactivate_promo', async (ctx) => {
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);

  DB.deactivatePromo(userId);

  await ctx.editMessageText(
    '✅ Промокод деактивирован.',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'blogger:promo_menu')]]) }
  );
});


bot.action('admin:promos', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();

  const promos = DB.getAllPromos();
  let text = '🎁 <b>Промокоды</b>\n\n';

  if (promos.length === 0) {
    text += 'Промокодов нет.\n\nСоздайте первый промокод!';
  } else {
    text += promos.map(p =>
      `<code>${p.code}</code> - комиссия ${p.discount_percent}% (${p.valid_days} дней), лимит: ${p.max_uses === -1 || p.max_uses === null || p.max_uses === undefined ? 'без лимита' : p.max_uses}`
    ).join('\n');
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Создать промокод', 'admin:create_promo')],
    ...(promos.length > 0 ? [[Markup.button.callback('🗑 Удалить промокод', 'admin:delete_promo')]] : []),
    [Markup.button.callback('« Назад', 'admin:back')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
});

bot.action('admin:create_promo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();
  const userId = String(ctx.from.id);
  clearUserState(userId);

  DB.setPending(`promo_create_${userId}`, {
    stage: 'awaiting_promo_code',
    userId,
    promptId: ctx.callbackQuery.message.message_id
  });

  await ctx.editMessageText(
    '🎁 <b>Создание промокода</b>\n\nВведите код (например: SALE10):',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('« Отмена', 'admin:promos')]]) }
  );
});

bot.action('admin:delete_promo', async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  await ctx.answerCbQuery();

  const promos = DB.getAllPromos();
  const buttons = promos.map(p => [Markup.button.callback(`❌ ${p.code}`, `admin:del_promo:${p.code}`)]);
  buttons.push([Markup.button.callback('« Назад', 'admin:promos')]);

  await ctx.editMessageText(
    '🗑 <b>Удалить промокод</b>\n\nВыберите код:',
    { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }
  );
});

bot.action(/admin:del_promo:(.+)/, async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;
  const code = ctx.match[1];

  DB.deletePromo(code);
  await ctx.answerCbQuery('Удалено!');

  const promos = DB.getAllPromos();
  let text = '🎁 <b>Промокоды</b>\n\n';

  if (promos.length === 0) {
    text += 'Промокодов нет.';
  } else {
    text += promos.map(p =>
      `<code>${p.code}</code> - комиссия ${p.discount_percent}% (${p.valid_days} дней), лимит: ${p.max_uses === -1 || p.max_uses === null || p.max_uses === undefined ? 'без лимита' : p.max_uses}`
    ).join('\n');
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➕ Создать промокод', 'admin:create_promo')],
    ...(promos.length > 0 ? [[Markup.button.callback('🗑 Удалить промокод', 'admin:delete_promo')]] : []),
    [Markup.button.callback('« Назад', 'admin:back')]
  ]);

  await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
});
