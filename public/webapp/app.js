const tg = window.Telegram?.WebApp;

const API_BASE = '/api';
const MIN_UNBAN_PRICE = 100;
const NICEPAY_MIN_AMOUNT_RUB = 250;
const NOWPAY_MIN_AMOUNT_RUB = 250;
const DEFAULT_BOT_USERNAME = 'unbanmeplease_bot';
const TELEGRAM_START_PAYLOAD = 'app';
let PHOTO_CACHE_BUST = '4';
const LOGO_ASSET_BUST = '4';
const TWITCH_LOGO_URL = `/webapp/twitch-logo.svg?v=${LOGO_ASSET_BUST}`;
const TELEGRAM_LOGO_URL = `/webapp/telegram-logo.png?v=${LOGO_ASSET_BUST}`;

const state = {
  userId: null,
  user: null,
  userPromo: null,
  mode: 'unban',
  isNewUser: true,
  isTelegram: false,
  allowBrowser: false,
  webappConfig: null,
  loginRequest: null,
  loginPollTimer: null,
  uiReady: false,
  searchResults: [],
  searchQuery: '',
  selectedBlogger: null,
  selectedPlatform: null,
  selectedChannelId: null,
  selectedChannelLabel: null,
  selectedMatchLabel: null,
  selectedMatchPlatform: null,
  selectedMatchChannelId: null,
  twitchVerify: null,
  twitchVerifyTimer: null,
};



const PENDING_KEY = 'unban_pending';
const PENDING_TTL_MS = 60 * 60 * 1000;

function normalizePrice(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < MIN_UNBAN_PRICE) return MIN_UNBAN_PRICE;
  return Math.round(num);
}

function getNicepayMinAmountRub() {
  const value = Number(state.webappConfig?.nicepayMinAmountRub);
  return Number.isFinite(value) && value > 0 ? value : NICEPAY_MIN_AMOUNT_RUB;
}

function getNowpayMinAmountRub() {
  const value = Number(state.webappConfig?.nowpayMinAmountRub);
  return Number.isFinite(value) && value > 0 ? value : NOWPAY_MIN_AMOUNT_RUB;
}

function buildAvatarStyle() {
  return '';
}

function getAvatarInitial(label, fallback) {
  const text = String(label || '').trim();
  if (text) return text.charAt(0).toUpperCase();
  return fallback || '👤';
}

function normalizeAvatarLabel(value) {
  return String(value || '').trim().toLowerCase();
}

function maskPromoCode(code) {
  if (!code) return '';
  const raw = String(code);
  if (raw.length <= 1) return raw;
  return `${raw[0]}${'*'.repeat(raw.length - 1)}`;
}

function getChannelLabelFromBlogger(blogger) {
  if (!blogger) return null;
  if (blogger.channel_title) return blogger.channel_title;
  if (Array.isArray(blogger.channels)) {
    const channel = blogger.channels.find(c => (c?.title && String(c.title).trim()) || (c?.username && String(c.username).trim()));
    if (channel?.title && String(channel.title).trim()) return String(channel.title).trim();
    if (channel?.username && String(channel.username).trim()) return String(channel.username).trim().replace(/^@/, '');
  }
  return null;
}

function getChannelPhotoUrl(blogger, overrideId, overrideUsername) {
  if (!blogger) return null;
  const channelId = overrideId || blogger.channel_id || (Array.isArray(blogger.channels) ? blogger.channels[0]?.id : null);
  if (!channelId) return null;
  const rawUsername = overrideUsername || blogger.channel_username || '';
  const cleanUsername = String(rawUsername || '').replace(/^@/, '').trim();
  const usernameParam = cleanUsername ? `&u=${encodeURIComponent(cleanUsername)}` : '';
  return `/api/channel/${channelId}/photo?v=${PHOTO_CACHE_BUST}${usernameParam}`;
}

function getPrimaryTelegramUsername(blogger) {
  if (!blogger) return null;
  if (blogger.channel_username) return String(blogger.channel_username).trim().replace(/^@/, '');
  if (Array.isArray(blogger.channels)) {
    const channel = blogger.channels.find(c => c?.username) || null;
    if (channel?.username) return String(channel.username).trim().replace(/^@/, '');
  }
  return null;
}

function getBloggerDisplayName(blogger) {
  const channelLabel = getChannelLabelFromBlogger(blogger);
  return blogger?.display_name || channelLabel || blogger?.twitch_channel || 'Пользователь';
}

function renderVerifiedBadge(isVerified) {
  return isVerified
    ? '<span class="verified-badge" data-tooltip="Подтверждено"><img src="/webapp/IMG_9317.png" alt="Подтверждено" loading="lazy"></span>'
    : '';
}

function hasTgTwitchMatch(blogger) {
  if (!blogger) return false;
  if (typeof blogger.tg_twitch_match === 'boolean') return blogger.tg_twitch_match;
  const twitchLogin = String(blogger?.twitch_channel || '').trim().replace(/^@/, '').toLowerCase();
  if (!twitchLogin) return false;
  if (Array.isArray(blogger.tg_usernames) && blogger.tg_usernames.length > 0) {
    return blogger.tg_usernames.map(u => String(u || '').trim().replace(/^@/, '').toLowerCase()).includes(twitchLogin);
  }
  if (Array.isArray(blogger.tg_titles) && blogger.tg_titles.length > 0) {
    return blogger.tg_titles.map(t => String(t || '').trim().toLowerCase()).includes(twitchLogin);
  }
  const usernames = new Set();
  const primary = getPrimaryTelegramUsername(blogger);
  if (primary) usernames.add(String(primary).toLowerCase());
  if (Array.isArray(blogger.channels)) {
    blogger.channels.forEach((ch) => {
      if (ch?.username) usernames.add(String(ch.username).trim().replace(/^@/, '').toLowerCase());
    });
  }
  return usernames.has(twitchLogin);
}

const twitchAvatarCache = new Map();
const twitchAvatarPending = new Map();
const searchBloggerCache = new Map();
const searchBloggerPending = new Map();

window.__avatarImgLoad = (img) => {
  try {
    if (img && (img.naturalWidth <= 1 || img.naturalHeight <= 1)) {
      const parent = img?.closest?.('.avatar-bubble, .search-result-avatar, .platform-btn-avatar');
      if (parent) parent.classList.remove('with-photo');
      if (img && img.remove) img.remove();
      return;
    }
    const parent = img?.closest?.('.avatar-bubble, .search-result-avatar, .platform-btn-avatar');
    if (parent) parent.classList.add('with-photo');
    img.style.opacity = '1';
  } catch { }
};

window.__avatarImgError = (img) => {
  try {
    const parent = img?.closest?.('.avatar-bubble, .search-result-avatar, .platform-btn-avatar');
    if (parent) parent.classList.remove('with-photo');
    if (img && img.remove) img.remove();
  } catch { }
};


async function getTwitchAvatarUrl(login) {
  const cleanLogin = String(login || '').trim().replace(/^@/, '').toLowerCase();
  if (!cleanLogin) return null;
  if (twitchAvatarCache.has(cleanLogin)) return twitchAvatarCache.get(cleanLogin);
  if (twitchAvatarPending.has(cleanLogin)) return await twitchAvatarPending.get(cleanLogin);

  const fetchPromise = (async () => {
    try {
      const data = await api(`/twitch/profile?login=${encodeURIComponent(cleanLogin)}`);
      const url = data?.profile_image_url || null;
      if (url) twitchAvatarCache.set(cleanLogin, url);
      return url;
    } catch (e) {
      return null;
    } finally {
      twitchAvatarPending.delete(cleanLogin);
    }
  })();

  twitchAvatarPending.set(cleanLogin, fetchPromise);
  return await fetchPromise;
}

function hydrateTwitchAvatars(container) {
  if (!container) return;
  const imgs = Array.from(container.querySelectorAll('img[data-twitch-login], image[data-twitch-login]'));
  const logins = [...new Set(imgs.map(img => img.dataset.twitchLogin).filter(Boolean))];
  if (!logins.length) return;

  logins.forEach(async (login) => {
    const url = await getTwitchAvatarUrl(login);
    if (!url) return;
    container.querySelectorAll(`img[data-twitch-login="${login}"], image[data-twitch-login="${login}"]`).forEach((img) => {
      if (img.tagName.toLowerCase() === 'image') {
        if (!img.getAttribute('href')) img.setAttribute('href', url);
      } else if (!img.src) {
        img.src = url;
      }
    });
  });
}

const DEBUG_AVATARS = (() => {
  try {
    return new URLSearchParams(window.location.search).get('debug_avatars') === '1';
  } catch {
    return false;
  }
})();

function renderAvatarHTML({ primary, secondary, size = 'sm' }) {
  const entries = [];
  if (primary) entries.push({ ...primary, isPrimary: true });
  if (secondary) entries.push({ ...secondary, isSecondary: true });

  const hasEntries = entries.length > 0;
  if (!hasEntries) {
  }
  return renderAvatarStackHTML({ entries, size });
}

function renderAvatarStackHTML({ entries, size = 'sm' }) {
  const hasEntries = Array.isArray(entries) && entries.length > 0;
  const safeEntries = hasEntries ? entries : [{ fallback: '👤', platform: 'telegram' }];
  const display = safeEntries.length > 4 ? safeEntries.slice(0, 4) : safeEntries;
  const bubble = size === 'lg' ? 42 : 36;
  const overlap = 0.3;
  const step = Math.round(bubble * (1 - overlap));
  const width = bubble + Math.max(0, display.length - 1) * step;
  const height = bubble;
  const items = display.map((entry, idx) => {
    const baseZ = 100 - idx * 10;
    const fallback = entry.fallback || '👤';
    const debug = DEBUG_AVATARS && entry.isPrimary ? ' P' : '';
    const left = idx * step;
    const baseStyle = `left:${left}px;top:0;width:${bubble}px;height:${bubble}px;`;
    const fallbackSpan = `<span class="avatar-fallback" style="${baseStyle}z-index:${baseZ};">${fallback}${debug}</span>`;
    const imgTag = entry.photoUrl
      ? `<img src="${entry.photoUrl}" alt="" loading="lazy" style="${baseStyle}z-index:${baseZ + 1};" onerror="this.remove()">`
      : (entry.twitchLogin
        ? `<img class="twitch-avatar-img" data-twitch-login="${entry.twitchLogin}" alt="" loading="lazy" style="${baseStyle}z-index:${baseZ + 1};" onerror="this.remove()">`
        : '');
    return `${fallbackSpan}${imgTag}`;
  }).join('');

  return `<div class="avatar-stack" style="width:${width}px;height:${height}px;">${items}</div>`;
}

function buildAvatarMarkup(blogger, displayName, options = {}) {
  const size = options.size === 'lg'
    ? { bubble: 42, container: 56, offset: 24 }
    : { bubble: 36, container: 48, offset: 20 };

  const matchPlatform = blogger?.match_platform || null;
  const matchChannelId = blogger?.match_channel_id ? String(blogger.match_channel_id) : null;
  const matchChannelUsername = blogger?.match_channel_username
    ? normalizeSearchInput(blogger.match_channel_username)
    : '';
  const matchQuery = blogger?.match_query ? normalizeSearchInput(blogger.match_query) : '';
  const matchLabel = blogger?.match_label ? normalizeSearchInput(blogger.match_label) : '';

  const entries = [];
  const tgEntries = [];

  const channels = Array.isArray(blogger?.tg_channels)
    ? blogger.tg_channels
    : (Array.isArray(blogger?.channels) ? blogger.channels : []);

  channels.forEach((ch, index) => {
    const rawUsername = ch?.username ? String(ch.username).trim().replace(/^@/, '') : '';
    const username = normalizeSearchInput(rawUsername);
    const title = ch?.title ? String(ch.title).trim() : '';
    const id = ch?.id ? String(ch.id) : null;
    const label = title || rawUsername || 'Telegram';

    tgEntries.push({
      key: `tg:${id || username || title || index}`,
      platform: 'telegram',
      id,
      username,
      title,
      label
    });
  });

  entries.push(...tgEntries);

  const twitchLogin = String(blogger?.twitch_channel || '').trim().replace(/^@/, '');
  const twitchEntry = twitchLogin
    ? {
      key: 'twitch',
      platform: 'twitch',
      login: twitchLogin,
      id: null,
      username: normalizeSearchInput(twitchLogin),
      title: twitchLogin,
      label: twitchLogin
    }
    : null;
  if (twitchEntry) entries.push(twitchEntry);

  const pickBest = (list, query) => {
    if (!query) return null;
    let best = null;
    let bestScore = 0;
    list.forEach((entry) => {
      const unameScore = scoreSearchMatch(query, entry.username || '');
      const titleScore = scoreSearchMatch(query, normalizeSearchTitle(entry.title || ''));
      const score = Math.max(unameScore, titleScore);
      if (score > bestScore) {
        bestScore = score;
        best = entry;
      }
    });
    return bestScore > 0 ? best : null;
  };

  const matchTarget = matchQuery || matchLabel || '';
  const hasNicknameMatch = (entry) => {
    if (!matchTarget) return false;
    const uname = normalizeSearchInput(entry.username || '');
    if (uname) return uname === matchTarget;
    const title = normalizeSearchInput(entry.title || '');
    return title ? title === matchTarget : false;
  };

  let orderedEntries = [];

  const realTgByQuery = matchQuery
    ? (tgEntries.find(e => e.username === matchQuery) || null)
    : null;
  const realTgById = !realTgByQuery && matchChannelId
    ? (tgEntries.find(e => e.id === matchChannelId) || null)
    : null;
  const realTgByUsername = !realTgByQuery && !realTgById && matchChannelUsername
    ? (tgEntries.find(e => e.username === matchChannelUsername) || null)
    : null;
  const realTgByLabel = (!realTgByQuery && !realTgById && !realTgByUsername && matchTarget)
    ? (tgEntries.find(e => hasNicknameMatch(e)) || null)
    : null;
  const realTgMatch = realTgByQuery || realTgById || realTgByUsername || realTgByLabel;

  const realTwitchMatch = (twitchEntry && matchTarget && hasNicknameMatch(twitchEntry))
    ? twitchEntry
    : null;

  if (realTgMatch && realTwitchMatch) {
    if (matchPlatform === 'twitch') {
      orderedEntries.push(realTwitchMatch, realTgMatch);
    } else if (matchPlatform === 'telegram') {
      orderedEntries.push(realTgMatch, realTwitchMatch);
    } else {
      orderedEntries.push(realTwitchMatch, realTgMatch);
    }
  } else if (realTwitchMatch) {
    orderedEntries.push(realTwitchMatch);
  } else if (realTgMatch) {
    orderedEntries.push(realTgMatch);
  }

  if (!orderedEntries.length && matchTarget) {
    const fallback = pickBest(entries, matchTarget);
    if (fallback) orderedEntries.push(fallback);
  }

  if (!orderedEntries.length && entries.length > 0) {
    orderedEntries.push(entries[0]);
  }

  if (matchPlatform === 'twitch' && twitchEntry && !orderedEntries.includes(twitchEntry)) {
    orderedEntries.unshift(twitchEntry);
  }

  orderedEntries = orderedEntries
    .concat(entries.filter(e => !orderedEntries.includes(e)))
    .filter((entry, index, arr) => arr.findIndex(e => e.key === entry.key) === index);

  if (orderedEntries.length === 0) {
    const avatarChar = getAvatarInitial(displayName, '👤');
    return renderAvatarHTML({
      primary: { fallback: avatarChar },
      secondary: null,
      size: options.size === 'lg' ? 'lg' : 'sm'
    });
  }

  if (orderedEntries.length === 1) {
    const entry = orderedEntries[0];
    const avatarChar = getAvatarInitial(entry.label, entry.platform === 'twitch' ? '🟣' : 'T');
    const photoUrl = entry.id
      ? `/api/channel/${entry.id}/photo?v=${PHOTO_CACHE_BUST}${entry.username ? `&u=${encodeURIComponent(entry.username)}` : ''}`
      : '';
    return renderAvatarHTML({
      primary: {
        platform: entry.platform,
        fallback: avatarChar,
        photoUrl: entry.platform === 'telegram' ? photoUrl : '',
        twitchLogin: entry.platform === 'twitch' ? entry.login : ''
      },
      secondary: null,
      size: options.size === 'lg' ? 'lg' : 'sm'
    });
  }

  const primaryEntry = orderedEntries[0] || null;
  const avatarEntries = orderedEntries.map((entry, idx) => ({
    platform: entry.platform,
    fallback: getAvatarInitial(entry.label, entry.platform === 'twitch' ? '🟣' : 'T'),
    photoUrl: entry.platform === 'telegram' && entry.id
      ? `/api/channel/${entry.id}/photo?v=${PHOTO_CACHE_BUST}${entry.username ? `&u=${encodeURIComponent(entry.username)}` : ''}`
      : '',
    twitchLogin: entry.platform === 'twitch' ? entry.login : '',
    isPrimary: idx === 0,
    isSecondary: idx === 1
  }));

  return `
    <div class="search-result-avatar search-result-avatar--stack">
      ${renderAvatarStackHTML({ entries: avatarEntries, size: options.size === 'lg' ? 'lg' : 'sm' })}
    </div>
  `;
}

function normalizeSearchInput(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const linkMatch = raw.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([^/?#]+)/i);
  let out = linkMatch ? linkMatch[1] : raw;
  out = out.replace(/^@/, '').toLowerCase();
  return out;
}

function normalizeSearchLoose(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/[01]/g, (m) => (m === '0' ? 'o' : 'i'))
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z0-9а-яё]/gi, '');
}

function normalizeSearchLogin(value) {
  return String(value || '').trim().replace(/^@/, '').toLowerCase();
}

function normalizeSearchTitle(value) {
  return String(value || '').trim().toLowerCase();
}

function scoreSearchMatch(query, value) {
  if (!query || !value) return 0;
  if (value === query) return 3;
  if (value.startsWith(query)) return 2;
  if (value.includes(query)) return 1;
  return 0;
}

function resolveSearchMatchClient(blogger, rawQuery) {
  const normalized = normalizeSearchInput(rawQuery);
  if (!normalized) return { platform: null, label: null, channelId: null };

  const twitchLogin = normalizeSearchLogin(blogger?.twitch_channel);
  if (twitchLogin && normalized === twitchLogin) {
    return { platform: 'twitch', label: blogger?.twitch_channel || twitchLogin, channelId: null };
  }
  const twitchScore = Math.max(
    scoreSearchMatch(normalized, twitchLogin)
  );

  let bestTg = { score: 0, label: null, channelId: null };
  const channels = Array.isArray(blogger.tg_channels) ? blogger.tg_channels : [];
  if (channels.length > 0) {
    const exactUsername = channels.find((channel) => {
      const uname = normalizeSearchLogin(channel?.username);
      return uname && uname === normalized;
    });
    if (exactUsername) {
      const label = exactUsername?.username
        ? String(exactUsername.username).trim().replace(/^@/, '')
        : null;
      return { platform: 'telegram', label, channelId: exactUsername?.id || null };
    }

    channels.forEach((channel) => {
      const uname = normalizeSearchLogin(channel?.username);
      const title = normalizeSearchTitle(channel?.title);
      const unameScore = scoreSearchMatch(normalized, uname);
      const titleScore = scoreSearchMatch(normalized, title);
      const score = Math.max(unameScore, titleScore);
      if (score > bestTg.score) {
        const label = unameScore >= titleScore
          ? (channel?.username ? String(channel.username).trim().replace(/^@/, '') : null)
          : (channel?.title ? String(channel.title).trim() : null);
        bestTg = { score, label, channelId: channel?.id || null };
      }
    });
  } else {
    const usernames = Array.isArray(blogger.tg_usernames) ? blogger.tg_usernames : [];
    const titles = Array.isArray(blogger.tg_titles) ? blogger.tg_titles : [];
    usernames.forEach((uname) => {
      const score = scoreSearchMatch(normalized, normalizeSearchLogin(uname));
      if (score > bestTg.score) {
        bestTg = { score, label: uname, channelId: null };
      }
    });
    titles.forEach((title) => {
      const score = scoreSearchMatch(normalized, normalizeSearchTitle(title));
      if (score > bestTg.score) {
        bestTg = { score, label: title, channelId: null };
      }
    });
  }

  if (twitchScore > bestTg.score && twitchScore > 0) {
    return { platform: 'twitch', label: blogger?.twitch_channel || twitchLogin, channelId: null };
  }
  if (bestTg.score > twitchScore && bestTg.score > 0) {
    return { platform: 'telegram', label: bestTg.label, channelId: bestTg.channelId };
  }
  return { platform: null, label: null, channelId: null };
}

function resolveChannelIdByLabel(blogger, label) {
  const target = normalizeSearchInput(label || '');
  if (!target) return null;
  const channels = Array.isArray(blogger?.tg_channels) ? blogger.tg_channels : [];
  const matched = channels.find((ch) => {
    const uname = normalizeSearchInput(ch?.username);
    const title = normalizeSearchInput(ch?.title);
    return (uname && uname === target) || (title && title === target);
  });
  return matched ? matched.id : null;
}

function getMatchedChannelDisplayLabel(blogger, channelId, fallbackLabel) {
  if (!channelId) return fallbackLabel || null;
  const channels = Array.isArray(blogger?.tg_channels) ? blogger.tg_channels : [];
  const matched = channels.find((ch) => String(ch.id) === String(channelId));
  if (!matched) return fallbackLabel || null;
  if (matched.title && String(matched.title).trim()) return String(matched.title).trim();
  if (matched.username && String(matched.username).trim()) return String(matched.username).trim().replace(/^@/, '');
  return fallbackLabel || null;
}

async function fetchBloggerDetails(bloggerId) {
  const key = String(bloggerId);
  if (searchBloggerCache.has(key)) return searchBloggerCache.get(key);
  if (searchBloggerPending.has(key)) return await searchBloggerPending.get(key);
  const promise = (async () => {
    try {
      const data = await api(`/blogger/${encodeURIComponent(key)}`);
      if (data) searchBloggerCache.set(key, data);
      return data;
    } catch (e) {
      return null;
    } finally {
      searchBloggerPending.delete(key);
    }
  })();
  searchBloggerPending.set(key, promise);
  return await promise;
}

async function hydrateSearchResultAvatar(item) {
  if (!item) return;
  const platform = item.dataset.matchPlatform || '';
  if (platform !== 'telegram') return;
  const currentId = item.dataset.matchChannelId || '';
  if (currentId) return;
  const displayLabel = item.dataset.displayLabel ? decodeURIComponent(item.dataset.displayLabel) : '';
  const bloggerId = item.dataset.id;
  if (!bloggerId || !displayLabel) return;

  const data = await fetchBloggerDetails(bloggerId);
  if (!data || !Array.isArray(data.channels)) return;
  const target = normalizeSearchInput(displayLabel);
  const matched = data.channels.find((ch) => {
    const uname = normalizeSearchInput(ch?.username);
    const title = normalizeSearchInput(ch?.title);
    return (uname && uname === target) || (title && title === target);
  });
  if (!matched) return;

  item.dataset.matchChannelId = matched.id;
  item.dataset.matchLabel = encodeURIComponent(matched.title || (matched.username ? String(matched.username).replace(/^@/, '') : displayLabel));
  item.dataset.matchPlatform = 'telegram';

  const avatar = item.querySelector('.search-result-avatar');
  if (!avatar) return;
  if (avatar.classList.contains('multi-avatar') || avatar.classList.contains('dual-avatar')) return;
  const rawUsername = matched.username ? String(matched.username).replace(/^@/, '').trim() : '';
  const imgSrc = matched.id
    ? `/api/channel/${matched.id}/photo?v=${PHOTO_CACHE_BUST}${rawUsername ? `&u=${encodeURIComponent(rawUsername)}` : ''}`
    : '';
  if (!imgSrc) return;

  let img = avatar.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.style.opacity = '0';
    img.onload = () => window.__avatarImgLoad && window.__avatarImgLoad(img);
    avatar.appendChild(img);
  }
  img.style.opacity = '0';
  img.onload = () => window.__avatarImgLoad && window.__avatarImgLoad(img);
  img.onerror = () => {
    window.__avatarImgError && window.__avatarImgError(img);
  };
  img.src = imgSrc;
}

function getSelectedPlatformLabel() {
  if (state.selectedPlatform === 'telegram') {
    return state.selectedChannelLabel ? `Telegram • ${state.selectedChannelLabel}` : 'Telegram';
  }
  if (state.selectedPlatform === 'twitch') return 'Twitch';
  return state.selectedPlatform || '';
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap();

  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('sensitive')) {
      e.target.classList.toggle('revealed');
    }
  });
});

async function bootstrap() {
  initTelegram();
  await fetchWebappConfig();
  if (!state.isTelegram) {
    await initBrowserAuth();
  }
  if (!state.isTelegram && !state.allowBrowser) {
    renderTelegramGate();
    return;
  }
  ensureUiReady();
  loadUser().finally(restorePendingCheck);
}

function ensureUiReady() {
  if (state.uiReady) return;
  initSwitcher();
  initModal();
  state.uiReady = true;
}

function savePending(pending) {
  if (!pending?.id) return;
  const data = { ...pending, savedAt: Date.now() };
  localStorage.setItem(PENDING_KEY, JSON.stringify(data));
}

function loadPending() {
  const raw = localStorage.getItem(PENDING_KEY) || localStorage.getItem('unban_pending_id');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.id) {
      if (isPendingExpired(parsed)) {
        clearPending();
        return null;
      }
      return parsed;
    }
    const fallback = { id: String(parsed), savedAt: Date.now() };
    if (isPendingExpired(fallback)) {
      clearPending();
      return null;
    }
    return fallback;
  } catch (e) {
    const fallback = { id: raw, savedAt: Date.now() };
    if (isPendingExpired(fallback)) {
      clearPending();
      return null;
    }
    return fallback;
  }
}

function clearPending() {
  localStorage.removeItem(PENDING_KEY);
  localStorage.removeItem('unban_pending_id');
}

function restorePendingCheck() {
  const pending = loadPending();
  if (pending?.id) {
    showWaitingScreen(pending);
  }
}

function initTelegram() {
  const params = new URLSearchParams(window.location.search);
  state.allowBrowser = params.get('debug') === '1' || params.get('dev') === '1';

  if (tg) {
    tg.ready();
    tg.expand();
    tg.setHeaderColor('#0a0a0f');
    tg.setBackgroundColor('#0a0a0f');


    if (tg.initDataUnsafe?.user) {
      state.isTelegram = true;
      state.userId = String(tg.initDataUnsafe.user.id);
    }
  }


  if (!state.userId && state.allowBrowser) {
    state.userId = new URLSearchParams(window.location.search).get('user_id') || 'test_user';
  }
}

async function initBrowserAuth() {
  if (state.isTelegram) return;

  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    localStorage.setItem('tg_session', token);
    params.delete('token');
    const clean = params.toString();
    const newUrl = `${window.location.pathname}${clean ? `?${clean}` : ''}`;
    window.history.replaceState({}, '', newUrl);
  }

  if (state.userId) {
    state.allowBrowser = true;
    return;
  }

  const storedToken = localStorage.getItem('tg_session');
  try {
    const data = await api('/auth/me', {
      headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {}
    });
    if (data?.userId) {
      state.userId = String(data.userId);
      state.allowBrowser = true;
    }
  } catch (e) {
  }
}

function stopLoginPolling() {
  if (state.loginPollTimer) {
    clearTimeout(state.loginPollTimer);
    state.loginPollTimer = null;
  }
}

async function requestLoginStart() {
  try {
    const data = await api('/auth/start', {
      method: 'POST',
      body: JSON.stringify({ redirect: '/app' })
    });
    return data;
  } catch (e) {
    return null;
  }
}

function scheduleLoginPoll(code) {
  stopLoginPolling();
  if (!code) return;

  const poll = async () => {
    try {
      const data = await api(`/auth/status/${encodeURIComponent(code)}`);
      if (data.status === 'verified' && data.token && data.userId) {
        localStorage.setItem('tg_session', data.token);
        state.userId = String(data.userId);
        state.allowBrowser = true;
        state.loginRequest = null;
        stopLoginPolling();
        ensureUiReady();
        loadUser().finally(restorePendingCheck);
        return;
      }
      if (data.status === 'expired' || data.status === 'missing') {
        state.loginRequest = null;
        stopLoginPolling();
        renderTelegramGate();
        return;
      }
    } catch (e) {
    }
    state.loginPollTimer = setTimeout(poll, 2500);
  };

  state.loginPollTimer = setTimeout(poll, 2000);
}

async function fetchWebappConfig() {
  if (state.webappConfig) return state.webappConfig;
  try {
    const res = await fetch(`${API_BASE}/config`, { cache: 'no-store' });
    if (!res.ok) throw new Error('config');
    const data = await res.json();
    state.webappConfig = data;
    return data;
  } catch (e) {
    return null;
  }
}

function buildTelegramStartLink(botUsername) {
  const cleanBot = (botUsername || '').replace('@', '').trim();
  const safeBot = cleanBot || DEFAULT_BOT_USERNAME;
  return `https://t.me/${safeBot}?start=${TELEGRAM_START_PAYLOAD}`;
}

async function renderTelegramGate() {
  const header = document.querySelector('.header');
  if (header) header.classList.add('hidden');

  const container = document.getElementById('app-content');
  container.classList.add('gate-full');

  const loginData = await requestLoginStart();
  state.loginRequest = loginData;
  const loginKey = loginData?.key;
  const commandText = loginKey ? `/start ${loginKey}` : '';
  const loginLink = loginData?.link || buildTelegramStartLink(DEFAULT_BOT_USERNAME);
  const minutesLeft = loginData?.expiresAt ? Math.max(1, Math.ceil((loginData.expiresAt - Date.now()) / 60000)) : null;

  container.innerHTML = `
    <div class="fade-in gate">
      <div class="gate-content_full">
        <div class="gate-copy">
          <div style="display: flex; justify-content: center;">
            <img src="/app/unbanmelogo.png?v=2" alt="UnbanMePlease" style="width: 140px; height: 100px; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.1));">
          </div>
          
          <div class="badge gate-badge">Telegram Only</div>
          <div class="gate-title">Войти через Telegram</div>
          <div class="gate-actions">
            <button type="_blank" class="btn btn-primary btn-block" id="open-telegram-btn">
              🚀 Открыть в Telegram
            </button>
            ${commandText ? `
              <div class="gate-code">
                <div class="gate-code-label">Команда для бота</div>
                <div class="gate-code-value sensitive" id="login-code" title="Нажмите, чтобы показать">${commandText}</div>
                <button class="btn btn-secondary btn-block" id="copy-login-btn">📋 Скопировать команду</button>
                ${minutesLeft ? `<div class="gate-code-hint">Код действует ${minutesLeft} мин.</div>` : ''}
              </div>
            ` : ''}
            <div class="gate-help">Откройте бота и напишите предоставленную выше команду, чтобы залогиниться.</div>
          </div>
        </div>

        <div class="gate-panel glass-card">
          <div class="gate-panel-title">Как войти</div>
          <div class="gate-steps">
            <div class="gate-step">
              <div class="gate-step-icon">1</div>
              <div>
                <div class="gate-step-title">Скопируйте команду</div>
                <div class="gate-step-text">Нажмите кнопку «Скопировать команду» выше.</div>
              </div>
            </div>
            <div class="gate-step">
              <div class="gate-step-icon">2</div>
              <div>
                <div class="gate-step-title">Откройте бота</div>
                <div class="gate-step-text">Нажмите кнопку «Открыть в Telegram».</div>
              </div>
            </div>
            <div class="gate-step">
              <div class="gate-step-icon">3</div>
              <div>
                <div class="gate-step-title">Отправьте сообщение</div>
                <div class="gate-step-text">Вставьте и отправьте команду боту для входа.</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById('open-telegram-btn');
  if (btn) {
    btn.onclick = () => {
      window.location.href = loginLink;
    };
  }

  const copyBtn = document.getElementById('copy-login-btn');
  if (copyBtn && commandText) {
    copyBtn.onclick = () => {
      navigator.clipboard.writeText(commandText).then(() => {
        showToast('Команда скопирована');
      }).catch(() => {
        showToast('Не удалось скопировать', true);
      });
    };
  }

  if (loginKey) {
    scheduleLoginPoll(loginKey);
  }
}

function initSwitcher() {
  const btns = document.querySelectorAll('.switcher-btn');
  const indicator = document.querySelector('.switcher-indicator');

  btns.forEach((btn, index) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (state.mode === mode) return;

      btns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      indicator.classList.toggle('right', index === 1);

      state.mode = mode;
      renderContent();
    });
  });
}

function initModal() {
  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') hideModal();
  });
}

function openPaymentLink(url) {
  if (!url) return;
  if (tg) {
    tg.openLink(url);
    return;
  }
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    window.location.href = url;
  }
}


async function api(endpoint, options = {}) {
  let res;
  try {
    const baseHeaders = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': tg?.initData || '',
    };

    const token = localStorage.getItem('tg_session');
    if (token) {
      baseHeaders['Authorization'] = `Bearer ${token}`;
    }
    const mergedHeaders = { ...baseHeaders, ...(options.headers || {}) };

    res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: mergedHeaders,
      credentials: 'include',
    });
  } catch (error) {
    showToast('Ошибка соединения', true);
    throw error;
  }

  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }

  if (!res.ok) {
    const message = data?.error || `HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

function withInitData(endpoint) {
  if (!tg?.initData) return endpoint;
  if (endpoint.includes('init_data=')) return endpoint;
  const join = endpoint.includes('?') ? '&' : '?';
  return `${endpoint}${join}init_data=${encodeURIComponent(tg.initData)}`;
}

async function apiWithInitData(endpoint, options = {}) {
  return await api(withInitData(endpoint), options);
}

async function apiWithInitDataFallback(endpoint, options = {}) {
  try {
    return await api(endpoint, options);
  } catch (e) {
    if ((e.status === 401 || e.status === 403) && tg?.initData) {
      return await api(withInitData(endpoint), options);
    }
    throw e;
  }
}


async function loadUser() {
  showLoading();

  try {
    const data = await api(`/user/${state.userId}`);
    state.user = data.user;
    state.isNewUser = !data.hasChannels;
    state.userPromo = data.userPromo || null;
    renderContent();
  } catch (e) {

    state.isNewUser = true;
    renderContent();
  }
}


function renderContent() {
  const content = document.getElementById('app-content');
  content.classList.remove('gate-full');
  const header = document.querySelector('.header');
  if (header) header.classList.remove('hidden');

  if (state.mode === 'unban') {
    renderUnbanMode(content);
  } else {
    renderMediaMode(content);
  }
}

function showLoading() {
  document.getElementById('app-content').innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
    </div>
  `;
}


function renderUnbanMode(container) {
  container.innerHTML = `
    <div class="fade-in">
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">🔍</div>
          <div>
            <div class="card-title">Найти медиа</div>
            <div class="card-subtitle">Введите имя канала или стримера</div>
          </div>
        </div>
        
        <div class="input-group">
          <input 
            type="text" 
            class="input" 
            id="search-input" 
            placeholder="Например: ninja или @channelname"
            autocomplete="off"
          >
        </div>
        
        <button class="btn btn-primary btn-block" id="search-btn">
          🔍 Искать
        </button>
      </div>
      
      <div id="search-results"></div>
    </div>
  `;

  document.getElementById('search-btn').addEventListener('click', searchMedia);
  document.getElementById('search-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') searchMedia();
  });
}

async function searchMedia() {
  const query = document.getElementById('search-input').value.trim();
  if (!query) return;
  state.searchQuery = query;
  PHOTO_CACHE_BUST = String(Date.now());

  const resultsContainer = document.getElementById('search-results');
  resultsContainer.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;

  try {
    const data = await api(`/bloggers/search?q=${encodeURIComponent(query)}`);
    state.searchResults = data.results || [];
    renderSearchResults(resultsContainer);
  } catch (e) {
    resultsContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">😔</div>
        <div class="empty-title">Ошибка поиска</div>
        <div class="empty-text">Попробуйте еще раз</div>
      </div>
    `;
  }
}

function renderSearchResults(container) {
  if (state.searchResults.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Ничего не найдено</div>
        <div class="empty-text">Попробуйте ввести точное название канала</div>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="search-results fade-in">
      <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 12px;">
        Найдено: ${state.searchResults.length}
      </p>
      ${state.searchResults.map(blogger => {
    const clientMatch = resolveSearchMatchClient(blogger, state.searchQuery);
    const matchPlatform = blogger.match_platform || clientMatch.platform;
    const matchLabel = blogger.match_label || clientMatch.label;
    const matchChannelId = blogger.match_channel_id
      || clientMatch.channelId
      || (matchPlatform === 'telegram' ? resolveChannelIdByLabel(blogger, matchLabel) : null);
    const matchChannelUsername = matchChannelId && Array.isArray(blogger.tg_channels)
      ? (blogger.tg_channels.find(ch => String(ch.id) === String(matchChannelId))?.username || null)
      : null;
    const matchLabelAttr = matchLabel ? encodeURIComponent(matchLabel) : '';
    const displayName = matchPlatform === 'telegram'
      ? (getMatchedChannelDisplayLabel(blogger, matchChannelId, matchLabel) || getBloggerDisplayName(blogger))
      : (matchLabel || getBloggerDisplayName(blogger));
    const displayLabelAttr = displayName ? encodeURIComponent(displayName) : '';
    const avatarMarkup = buildAvatarMarkup({
      ...blogger,
      match_platform: matchPlatform,
      match_channel_id: matchChannelId,
      match_channel_username: matchChannelUsername,
      match_label: matchLabel,
      match_query: state.searchQuery,
    }, displayName, { layout: 'row' });
    const verifiedBadge = renderVerifiedBadge(blogger.is_verified);
    return `
          <div class="search-result-item" data-id="${blogger.id}" data-match-platform="${matchPlatform || ''}" data-match-label="${matchLabelAttr}" data-match-channel-id="${matchChannelId || ''}" data-display-label="${displayLabelAttr}">
            ${avatarMarkup}
            <div class="search-result-info">
              <div class="search-result-name">${displayName}${verifiedBadge}</div>
              <div class="search-result-platforms">
                ${blogger.twitch_channel ? '<span class="platform-tag twitch">Twitch</span>' : ''}
                ${blogger.channels_count > 0 ? '<span class="platform-tag telegram">Telegram</span>' : ''}
              </div>
            </div>
          </div>
        `;
  }).join('')}
    </div>
  `;

  hydrateTwitchAvatars(container);
  container.querySelectorAll('.search-result-item').forEach(item => {
    hydrateSearchResultAvatar(item);
  });

  container.querySelectorAll('.search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const matchLabel = item.dataset.matchLabel ? decodeURIComponent(item.dataset.matchLabel) : null;
      const displayLabel = item.dataset.displayLabel ? decodeURIComponent(item.dataset.displayLabel) : null;
      const matchPlatform = item.dataset.matchPlatform || null;
      const matchChannelId = item.dataset.matchChannelId || null;
      selectBlogger(item.dataset.id, {
        platform: matchPlatform,
        label: matchLabel || displayLabel,
        channelId: matchChannelId,
      });
    });
  });

}

async function selectBlogger(bloggerId, matchOverride = null) {
  try {
    if (matchOverride && (matchOverride.platform || matchOverride.label || matchOverride.channelId)) {
      state.selectedMatchPlatform = matchOverride.platform || null;
      state.selectedMatchChannelId = matchOverride.channelId || null;
      if (state.selectedMatchPlatform === 'telegram' && state.selectedMatchChannelId) {
        const cached = state.searchResults.find(b => String(b.id) === String(bloggerId));
        const displayLabel = cached
          ? getMatchedChannelDisplayLabel(cached, state.selectedMatchChannelId, matchOverride.label)
          : matchOverride.label;
        state.selectedMatchLabel = displayLabel || matchOverride.label || null;
      } else {
        state.selectedMatchLabel = matchOverride.label || null;
      }
    } else {
      const cached = state.searchResults.find(b => String(b.id) === String(bloggerId));
      if (cached) {
        const clientMatch = resolveSearchMatchClient(cached, state.searchQuery);
        state.selectedMatchPlatform = cached.match_platform || clientMatch.platform || null;
        state.selectedMatchChannelId = cached.match_channel_id || clientMatch.channelId || null;
        state.selectedMatchLabel = state.selectedMatchPlatform === 'telegram'
          ? getMatchedChannelDisplayLabel(cached, state.selectedMatchChannelId, cached.match_label || clientMatch.label)
          : (cached.match_label || clientMatch.label || null);
      } else {
        state.selectedMatchPlatform = null;
        state.selectedMatchLabel = null;
        state.selectedMatchChannelId = null;
      }
    }
    const data = await api(`/blogger/${bloggerId}`);
    state.selectedBlogger = data;

    if (state.selectedMatchPlatform === 'telegram' && Array.isArray(data.channels)) {
      const query = normalizeSearchInput(state.searchQuery || '');
      const label = normalizeSearchInput(state.selectedMatchLabel || '');
      const target = query || label;
      if (target && !state.selectedMatchChannelId) {
        const matched = data.channels.find((ch) => {
          const uname = normalizeSearchInput(ch?.username);
          const title = normalizeSearchInput(ch?.title);
          return (uname && uname === target) || (title && title === target);
        });
        if (matched) {
          state.selectedMatchChannelId = matched.id;
          state.selectedMatchLabel = matched.title || (matched.username ? String(matched.username).replace(/^@/, '') : null);
        }
      }
      if (state.selectedMatchChannelId) {
        const matched = data.channels.find(ch => String(ch.id) === String(state.selectedMatchChannelId));
        if (matched) {
          state.selectedMatchLabel = matched.title || (matched.username ? String(matched.username).replace(/^@/, '') : state.selectedMatchLabel);
        }
      }
    }
    renderBloggerProfile();
  } catch (e) {
    showToast('Ошибка загрузки', true);
  }
}

function renderBloggerProfile() {
  const blogger = state.selectedBlogger;
  const container = document.getElementById('app-content');
  state.selectedPlatform = null;
  state.selectedChannelId = null;
  state.selectedChannelLabel = null;
  const twitchPrice = blogger.twitch_channel ? normalizePrice(blogger.twitch_price) : null;
  const tgChannels = Array.isArray(blogger.channels) ? blogger.channels : [];
  let orderedTgChannels = [...tgChannels];
  if (state.selectedMatchPlatform === 'telegram' && orderedTgChannels.length > 1) {
    let targetId = state.selectedMatchChannelId;
    if (!targetId && state.selectedMatchLabel) {
      const target = normalizeSearchInput(state.selectedMatchLabel);
      const match = orderedTgChannels.find((ch) => {
        const uname = normalizeSearchInput(ch?.username);
        const title = normalizeSearchInput(ch?.title);
        return (uname && uname === target) || (title && title === target);
      });
      if (match) targetId = match.id;
    }
    if (targetId) {
      const idx = orderedTgChannels.findIndex(ch => String(ch.id) === String(targetId));
      if (idx > 0) {
        const [selected] = orderedTgChannels.splice(idx, 1);
        orderedTgChannels.unshift(selected);
      }
    }
  }
  const tgButtons = orderedTgChannels.map((ch) => {
    const label = ch.title || (ch.username ? String(ch.username).replace(/^@/, '') : 'Telegram');
    const displayLabel = label.length > 15 ? label.slice(0, 12) + '...' : label;
    const price = normalizePrice(ch.price);
    const rawUsername = ch.username ? String(ch.username).replace(/^@/, '').trim() : '';
    const photoUrl = ch.id ? `/api/channel/${ch.id}/photo?v=${PHOTO_CACHE_BUST}${rawUsername ? `&u=${encodeURIComponent(rawUsername)}` : ''}` : null;
    const avatarStyle = buildAvatarStyle(label || ch.id || 'tg');
    const avatarChar = getAvatarInitial(label, 'T');
    return `
      <div class="platform-btn" data-platform="telegram" data-channel-id="${ch.id}" data-price="${price}">
        <div class="platform-btn-avatar" style="${avatarStyle}">
          <span class="avatar-fallback">${avatarChar}</span>
          ${photoUrl ? `<img src="${photoUrl}" alt="" loading="lazy" onload="window.__avatarImgLoad && window.__avatarImgLoad(this)" onerror="window.__avatarImgError && window.__avatarImgError(this)">` : ''}
        </div>
        <div class="platform-btn-name">${displayLabel}</div>
        <div class="platform-btn-subtitle">Telegram</div>
        <div class="badge">${price} ₽</div>
      </div>
    `;
  }).join('');

  const displayName = state.selectedMatchLabel || getBloggerDisplayName(blogger);
  const avatarMarkup = buildAvatarMarkup({
    ...blogger,
    match_platform: state.selectedMatchPlatform,
    match_channel_id: state.selectedMatchChannelId,
  }, displayName, { size: 'lg' });
  const verifiedBadge = renderVerifiedBadge(blogger.is_verified);
  const twitchLogin = String(blogger?.twitch_channel || '').trim().replace(/^@/, '');

  const twitchButton = blogger.twitch_channel ? `
    <div class="platform-btn" data-platform="twitch" data-price="${twitchPrice}">
      <div class="platform-btn-avatar">
        <span class="avatar-fallback">🟣</span>
        ${twitchLogin ? `<img alt="" class="twitch-avatar-img" data-twitch-login="${twitchLogin}" loading="lazy" onload="window.__avatarImgLoad && window.__avatarImgLoad(this)" onerror="window.__avatarImgError && window.__avatarImgError(this)">` : ''}
      </div>
      <div class="platform-btn-name">${twitchLogin || 'Twitch'}</div>
      <div class="platform-btn-subtitle">Twitch</div>
      <div class="badge">${twitchPrice} ₽</div>
    </div>
  ` : '';

  const platformButtons = state.selectedMatchPlatform === 'twitch'
    ? `${twitchButton}${tgButtons}`
    : `${tgButtons}${twitchButton}`;

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          ${avatarMarkup}
          <div>
            <div class="card-title">${displayName}${verifiedBadge}</div>
            <div class="card-subtitle">Выберите платформу для разбана</div>
          </div>
        </div>
        
        <div class="platform-selector" id="platform-selector">
          ${platformButtons}
        </div>
        
        <div id="unban-form" class="hidden">
          <div class="input-group">
            <label class="input-label" id="nick-label">Ваш ник для разбана</label>
            <input type="text" class="input" id="nick-input" placeholder="Введите ник">
          </div>
          
          <button class="btn btn-primary btn-block" id="pay-btn">
            💳 Оплатить <span id="pay-amount">0</span> ₽
          </button>
        </div>
      </div>
    </div>
  `;

  hydrateTwitchAvatars(container);

  document.getElementById('back-btn').addEventListener('click', () => {
    state.selectedBlogger = null;
    state.selectedPlatform = null;
    state.selectedChannelId = null;
    state.selectedChannelLabel = null;
    state.selectedMatchLabel = null;
    state.selectedMatchPlatform = null;
    state.selectedMatchChannelId = null;
    renderContent();
  });

  document.querySelectorAll('.platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.platform-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      state.selectedPlatform = btn.dataset.platform;
      if (state.selectedPlatform === 'telegram') {
        state.selectedChannelId = btn.dataset.channelId || null;
        state.selectedChannelLabel = btn.querySelector('.platform-btn-name')?.textContent?.trim() || null;
      } else {
        state.selectedChannelId = null;
        state.selectedChannelLabel = null;
      }

      const price = normalizePrice(btn.dataset.price);
      document.getElementById('pay-amount').textContent = price;
      const nickLabel = document.getElementById('nick-label');
      const nickInput = document.getElementById('nick-input');
      if (state.selectedPlatform === 'telegram') {
        nickLabel.textContent = 'Telegram ID или @username';
        nickInput.placeholder = 'Например: 123456789 или @username';
      } else {
        nickLabel.textContent = 'Ваш ник для разбана';
        nickInput.placeholder = 'Введите ник';
      }
      document.getElementById('unban-form').classList.remove('hidden');
    });
  });

  document.getElementById('pay-btn').addEventListener('click', createUnbanOrder);
}

async function createUnbanOrder() {
  const nick = document.getElementById('nick-input').value.trim();
  if (!nick) {
    showToast('Введите ник', true);
    return;
  }

  const priceBtn = document.querySelector('.platform-btn.selected');
  if (!priceBtn) {
    showToast('Выберите платформу', true);
    return;
  }
  const price = normalizePrice(priceBtn.dataset.price);

  if (price < MIN_UNBAN_PRICE) {
    showToast(`Минимальная цена: ${MIN_UNBAN_PRICE} ₽`, true);
    return;
  }

  renderPaymentOptions(nick, price);
}

function renderPaymentOptions(nick, price) {
  const container = document.getElementById('app-content');
  const nicepayMin = getNicepayMinAmountRub();
  const showNicePay = Number(price) >= nicepayMin;

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">💳</div>
          <div>
            <div class="card-title">Оплата</div>
            <div class="card-subtitle">К оплате: <strong>${price} ₽</strong></div>
          </div>
        </div>
        
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
          Разбан: <strong>${nick}</strong> (${getSelectedPlatformLabel()})
        </p>
        
        <div class="payment-methods">
          ${showNicePay ? `
          <div class="payment-method" data-method="nicepay">
            <span class="payment-method-icon">💳</span>
            <span class="payment-method-name">Банковская карта</span>
          </div>
          ` : ''}
          <div class="payment-method" data-method="cryptobot">
            <span class="payment-method-icon">💎</span>
            <span class="payment-method-name">CryptoBot</span>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderBloggerProfile);

  document.querySelectorAll('.payment-method').forEach(method => {
    method.addEventListener('click', async () => {
      showLoader();

      try {
        const data = await api('/unban/create', {
          method: 'POST',
          body: JSON.stringify({
            userId: state.userId,
            bloggerId: state.selectedBlogger.id,
            platform: state.selectedPlatform,
            targetNick: nick,
            paymentMethod: method.dataset.method,
            channelId: state.selectedPlatform === 'telegram' ? state.selectedChannelId : null,
          }),
        });

        if (data.nowpay) {
          hideLoader();
          if (!data.payAddress) {
            showToast('NOWpayments: не удалось получить адрес', true);
            return;
          }
          const amountText = data.payAmount && data.payCurrency
            ? `${data.payAmount} ${String(data.payCurrency).toUpperCase()}`
            : `${price} ${String(data.priceCurrency || 'RUB').toUpperCase()}`;
          showModal({
            icon: '💵',
            title: 'Оплата USDT (NOWpayments)',
            text: `Переведите <b>${amountText}</b> на адрес:<br><br><code style="background: rgba(0,0,0,0.05); padding: 8px; border-radius: 4px; display: block; word-break: break-all; margin: 8px 0;">${data.payAddress}</code><br>После оплаты нажмите кнопку ниже для проверки.`,
            confirmText: 'Я перевел',
            onConfirm: () => {
              showWaitingScreen({ id: data.pendingId, method: 'nowpay', paymentUrl: data.paymentUrl });
            }
          });
        } else if (data.paymentUrl) {
          const pending = { id: data.pendingId, method: method.dataset.method, paymentUrl: data.paymentUrl };
          hideLoader();
          if (tg) {
            showToast('Перенаправляем на оплату...');
            openPaymentLink(data.paymentUrl);
          }
          showWaitingScreen(pending);
        } else {
          hideLoader();
          showToast('Ошибка создания платежа', true);
        }
      } catch (e) {
        hideLoader();
        showToast('Ошибка создания платежа', true);
      }
    });
  });
}

function normalizePending(pending) {
  if (!pending) return null;
  if (typeof pending === 'string') return { id: pending };
  if (pending.pendingId && !pending.id) return { ...pending, id: pending.pendingId };
  return pending;
}

function getPendingMaxAgeMs(pending) {
  const method = pending.method || pending.paymentMethod;
  if (method === 'nowpay' || method === 'crypto') return 30 * 60 * 1000;
  return PENDING_TTL_MS;
}

function isPendingExpired(pending) {
  const ts = pending.savedAt || pending.createdAt;
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts > getPendingMaxAgeMs(pending);
}

function getPendingTitle(pending) {
  const method = pending?.method || pending?.paymentMethod;
  if (method === 'nowpay') return 'Проверяем оплату USDT.';
  return 'Проверяем оплату.';
}

function getPendingText(pending) {
  const method = pending?.method || pending?.paymentMethod;
  if (method === 'nowpay') return 'Обычно подтверждение занимает до 15 минут.';
  return 'Обычно это занимает 5-15 минут.';
}

function showWaitingScreen(pending) {
  const pendingData = normalizePending(pending);
  if (!pendingData?.id) return;
  if (isPendingExpired(pendingData)) {
    clearPending();
    renderContent();
    return;
  }
  savePending(pendingData);
  hideLoader();
  const { id: pendingId, paymentUrl } = pendingData;
  const container = document.getElementById('app-content');
  container.innerHTML = `
    <div class="fade-in">
      <div class="glass-card card" style="text-align: center; padding: 40px 20px;">
        <div class="spinner loader-spinner" style="margin: 0 auto 24px;"></div>
        <div class="empty-title">${getPendingTitle(pendingData)}</div>
        <div class="empty-text" id="pending-status-text">${getPendingText(pendingData)}</div>
        ${paymentUrl ? '<button class="btn btn-primary btn-block mt-16" id="open-payment-btn">Открыть оплату</button>' : ''}
        <button class="btn btn-secondary btn-block mt-16" id="cancel-pending-btn">Отменить</button>
      </div>
    </div>
  `;

  if (paymentUrl) {
    document.getElementById('open-payment-btn').addEventListener('click', () => openPaymentLink(paymentUrl));
  }
  document.getElementById('cancel-pending-btn').addEventListener('click', () => {
    clearPending();
    hideLoader();
    renderContent();
  });

  const poll = async () => {
    try {
      const current = loadPending();
      if (!current || current.id !== pendingId) {
        return;
      }

      const data = await api(`/unban/check/${pendingId}`);
      if (data.status === 'completed') {
        clearPending();
        container.innerHTML = `
          <div class="fade-in glass-card card empty-state">
            <div class="card-icon" style="font-size: 48px; margin-bottom: 16px;">✅</div>
            <div class="empty-title">Успешно!</div>
            <div class="empty-text">Ваш запрос подтвержден. Вы разбанены!</div>
            <button class="btn btn-primary mt-24" onclick="renderContent()">Вернуться</button>
          </div>
        `;
        showToast('✅ Разбан подтвержден!');
        return;
      }
      if (data.status === 'rejected') {
        clearPending();
        container.innerHTML = `
          <div class="fade-in glass-card card empty-state">
            <div class="card-icon" style="font-size: 48px; margin-bottom: 16px;">❌</div>
            <div class="empty-title">Отклонено</div>
            <div class="empty-text">К сожалению, ваш платеж не был подтвержден.<br>Свяжитесь с поддержкой, если считаете это ошибкой.</div>
            <button class="btn btn-primary mt-24" onclick="renderContent()">Назад</button>
          </div>
        `;
        showToast('❌ Платеж отклонен', true);
        return;
      }
      if (data.status === 'expired') {
        clearPending();
        container.innerHTML = `
          <div class="fade-in glass-card card empty-state">
            <div class="card-icon" style="font-size: 48px; margin-bottom: 16px;">⏳</div>
            <div class="empty-title">Время ожидания истекло</div>
            <div class="empty-text">Платеж не подтвердили вовремя. Создайте новый запрос.</div>
            <button class="btn btn-primary mt-24" onclick="renderContent()">Вернуться</button>
          </div>
        `;
        showToast('Время ожидания истекло', true);
        return;
      }
      if (data.status === 'missing') {
        clearPending();
        container.innerHTML = `
          <div class="fade-in glass-card card empty-state">
            <div class="card-icon" style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <div class="empty-title">Заявка не найдена</div>
            <div class="empty-text">Мы не нашли активную заявку. Создайте новую оплату.</div>
            <button class="btn btn-primary mt-24" onclick="renderContent()">Вернуться</button>
          </div>
        `;
        showToast('Заявка не найдена', true);
        return;
      }

      setTimeout(poll, 5000);
    } catch (e) {
      setTimeout(poll, 5000);
    }
  };

  poll();
}

function renderMediaMode(container) {
  if (state.isNewUser) {
    renderNewUserScreen(container);
  } else {
    renderMediaPanel(container);
  }
}

function renderNewUserScreen(container) {
  container.innerHTML = `
    <div class="fade-in">
      <div class="glass-card card empty-state">
        <div class="empty-icon">🎬</div>
        <div class="empty-title">Панель медиа</div>
        <div class="empty-text">
          Этот функционал предназначен для владельцев каналов.
          Здесь вы сможете управлять разбанами, привязывать каналы и выводить средства.
        </div>
        <button class="btn btn-primary" id="start-media-btn">
          🚀 Начать
        </button>
      </div>
    </div>
  `;

  document.getElementById('start-media-btn').addEventListener('click', async () => {
    try {
      await api(`/user/${state.userId}/create`, { method: 'POST' });
      state.isNewUser = false;
      renderMediaPanel(container);
    } catch (e) {

      state.isNewUser = false;
      renderMediaPanel(container);
    }
  });
}

function renderMediaPanel(container) {
  const user = state.user || {};
  const balance = user.balance || 0;

  container.innerHTML = `
    <div class="fade-in">
      <div class="stats-grid">
        <div class="stat-card glass-card">
          <div class="stat-value ${(user.balance || 0) > 0 ? 'sensitive' : ''}" title="${(user.balance || 0) > 0 ? 'Нажмите, чтобы показать' : ''}">${balance} ₽</div>
          <div class="stat-label">Баланс</div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-value">${user.purchases_count || 0}</div>
          <div class="stat-label">Продаж</div>
        </div>
      </div>
      
      <div class="glass-card card">
        <div class="list-item" id="socials-btn">
          <div class="list-item-content">
            <div class="list-item-icon">📢</div>
            <div class="list-item-text">
              <div class="list-item-title">Соц.сети</div>
              <div class="list-item-subtitle">Twitch, Telegram каналы</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
        
        <div class="list-item" id="finance-btn">
          <div class="list-item-content">
            <div class="list-item-icon">💰</div>
            <div class="list-item-text">
              <div class="list-item-title">Финансы</div>
              <div class="list-item-subtitle">Вывод, статистика</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
        
        <div class="list-item" id="link-btn">
          <div class="list-item-content">
            <div class="list-item-icon">🔗</div>
            <div class="list-item-text">
              <div class="list-item-title">Персональная ссылка</div>
              <div class="list-item-subtitle">Для подписчиков</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
        
        ${user.queue_count > 0 ? `
          <div class="list-item" id="queue-btn" style="background: rgba(255, 159, 10, 0.1);">
            <div class="list-item-content">
              <div class="list-item-icon">⚠️</div>
              <div class="list-item-text">
                <div class="list-item-title">Очередь разбанов</div>
                <div class="list-item-subtitle">${user.queue_count} ожидают ручного разбана</div>
              </div>
            </div>
            <span class="badge badge-warning">${user.queue_count}</span>
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.getElementById('socials-btn').addEventListener('click', renderSocialsScreen);
  document.getElementById('finance-btn').addEventListener('click', () => {
    if (!hasLinkedSocials()) {
      showToast('Сначала привяжите Twitch или Telegram канал', true);
      return;
    }
    renderFinanceScreen();
  });
  document.getElementById('link-btn').addEventListener('click', showPersonalLink);

  const queueBtn = document.getElementById('queue-btn');
  if (queueBtn) {
    queueBtn.addEventListener('click', () => {
      if (!hasLinkedSocials()) {
        showToast('Сначала привяжите Twitch или Telegram канал', true);
        return;
      }
      renderQueueScreen();
    });
  }
}

function renderSocialsScreen() {
  const container = document.getElementById('app-content');
  const user = state.user || {};
  clearTwitchVerifyTimer();

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">📢</div>
          <div>
            <div class="card-title">Соц.сети</div>
            <div class="card-subtitle">Управление каналами</div>
          </div>
        </div>
        
        <div class="list-item" id="twitch-manage">
          <div class="list-item-content">
            <div class="list-item-icon" style="background: rgba(145, 70, 255, 0.12);">
              <img class="platform-logo twitch" src="${TWITCH_LOGO_URL}" alt="Twitch">
            </div>
            <div class="list-item-text">
              <div class="list-item-title">Twitch</div>
              <div class="list-item-subtitle">
                ${user.twitch_channel ? `✅ ${user.twitch_channel}` : '❌ Не подключен'}
              </div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
        
        <div class="list-item" id="telegram-manage">
          <div class="list-item-content">
            <div class="list-item-icon" style="background: rgba(42, 171, 238, 0.14);">
              <img class="platform-logo telegram" src="${TELEGRAM_LOGO_URL}" alt="Telegram">
            </div>
            <div class="list-item-text">
              <div class="list-item-title">Telegram</div>
              <div class="list-item-subtitle">
                ${user.channels_count > 0 ? `✅ ${user.channels_count} каналов` : '❌ Нет каналов'}
              </div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => renderMediaPanel(container));
  document.getElementById('twitch-manage').addEventListener('click', renderTwitchSettings);
  document.getElementById('telegram-manage').addEventListener('click', renderTelegramChannels);
}

function renderTwitchSettings() {
  const container = document.getElementById('app-content');
  const user = state.user || {};

  if (state.twitchVerify && state.twitchVerify.status === 'pending') {
    renderTwitchVerifyScreen();
    return;
  }
  if (state.twitchVerify && state.twitchVerify.status === 'verified') {
    renderTwitchVerifySuccess();
    return;
  }

  if (!user.twitch_channel) {

    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
        
        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon" style="background: rgba(145, 70, 255, 0.12);">
              <img class="platform-logo twitch" src="${TWITCH_LOGO_URL}" alt="Twitch">
            </div>
            <div>
              <div class="card-title">Подключить Twitch</div>
              <div class="card-subtitle">Введите название канала</div>
            </div>
          </div>
          
          <div class="input-group">
            <input type="text" class="input" id="twitch-input" placeholder="Например: ninja">
          </div>
          
          <button class="btn btn-primary btn-block" id="link-twitch-btn">
            🔗 Подключить
          </button>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', renderSocialsScreen);
    document.getElementById('link-twitch-btn').addEventListener('click', () => {
      showSocialChangeModal({
        title: 'Подключить Twitch?',
        text: 'Канал будет привязан и пользователи смогут покупать разбан в Twitch.',
        confirmText: 'Подключить',
        requireConfirm: false,
        onConfirm: linkTwitch,
      });
    });
  } else {

    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
        
        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon" style="background: rgba(145, 70, 255, 0.12);">
              <img class="platform-logo twitch" src="${TWITCH_LOGO_URL}" alt="Twitch">
            </div>
            <div>
              <div class="card-title">${user.twitch_channel}</div>
              <div class="card-subtitle">Цена разбана: ${normalizePrice(user.twitch_price)} ₽</div>
            </div>
          </div>
          
          <div class="input-group">
          <label class="input-label">Новая цена (₽, минимум ${MIN_UNBAN_PRICE}). Рекомендуем: карта от ${getNicepayMinAmountRub()} ₽.</label>
          <input type="number" class="input" id="twitch-price" value="${normalizePrice(user.twitch_price)}" min="${MIN_UNBAN_PRICE}">
        </div>
          
          <button class="btn btn-primary btn-block mb-16" id="save-price-btn">
            💾 Сохранить цену
          </button>
          
          <button class="btn btn-danger btn-block" id="unlink-twitch-btn">
            ❌ Отвязать Twitch
          </button>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', renderSocialsScreen);
    document.getElementById('save-price-btn').addEventListener('click', saveTwitchPrice);
    document.getElementById('unlink-twitch-btn').addEventListener('click', () => {
      showSocialChangeModal({
        title: 'Отвязать Twitch?',
        text: 'Канал будет отвязан и пользователи не смогут покупать разбан в Twitch.',
        confirmText: 'Отвязать',
        danger: true,
        requireConfirm: true,
        onConfirm: unlinkTwitch,
      });
    });
  }
}

async function linkTwitch() {
  const channelName = document.getElementById('twitch-input').value.trim();
  if (!channelName) {
    showToast('Введите название канала', true);
    return;
  }

  try {
    const data = await api('/twitch/verify/start', {
      method: 'POST',
      body: JSON.stringify({ userId: state.userId, channelName }),
    });
    state.twitchVerify = {
      requestId: data.requestId,
      channelLogin: data.channelLogin,
      code: data.code,
      expiresAt: data.expiresAt,
      botLogin: data.botLogin,
      status: 'pending',
    };
    renderTwitchVerifyScreen();
  } catch (e) {
    showToast(e.message || 'Ошибка верификации', true);
  }
}

function clearTwitchVerifyTimer() {
  if (state.twitchVerifyTimer) {
    clearTimeout(state.twitchVerifyTimer);
    state.twitchVerifyTimer = null;
  }
}

function scheduleTwitchVerifyPoll() {
  clearTwitchVerifyTimer();
  if (!state.twitchVerify || state.twitchVerify.status !== 'pending') return;
  state.twitchVerifyTimer = setTimeout(checkTwitchVerificationStatus, 5000);
}

async function checkTwitchVerificationStatus() {
  if (!state.twitchVerify?.requestId) return;
  try {
    const data = await api(`/twitch/verify/${state.twitchVerify.requestId}`);
    state.twitchVerify.status = data.status;
    state.twitchVerify.code = data.code || state.twitchVerify.code;
    state.twitchVerify.expiresAt = data.expiresAt || state.twitchVerify.expiresAt;

    if (data.status === 'verified') {
      clearTwitchVerifyTimer();
      state.twitchVerify.status = 'verified';
      renderTwitchVerifySuccess();
      return;
    }

    renderTwitchVerifyScreen();
  } catch (e) {
    scheduleTwitchVerifyPoll();
  }
}

function renderTwitchVerifyScreen() {
  const container = document.getElementById('app-content');
  const verify = state.twitchVerify;
  if (!verify) {
    renderTwitchSettings();
    return;
  }
  if (verify.status === 'verified') {
    renderTwitchVerifySuccess();
    return;
  }

  clearTwitchVerifyTimer();
  const timeLeftMs = verify.expiresAt ? Math.max(0, verify.expiresAt - Date.now()) : 0;
  const minutesLeft = Math.max(1, Math.ceil(timeLeftMs / 60000));
  const isExpired = verify.status === 'expired' || timeLeftMs <= 0;
  const verifyCommand = `!verify ${verify.code}`;

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon" style="background: rgba(145, 70, 255, 0.12);">
            <img class="platform-logo twitch" src="${TWITCH_LOGO_URL}" alt="Twitch">
          </div>
          <div>
            <div class="card-title">Подтверждение владения</div>
            <div class="card-subtitle">${verify.channelLogin}</div>
          </div>
        </div>
        
        <div class="input-group">
          <label class="input-label">Команда подтверждения</label>
          <div class="input" style="font-weight: 700; letter-spacing: 1px;">${verifyCommand}</div>
        </div>
        
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 8px;">
          Напишите в чате вашего Twitch-канала: <strong>${verifyCommand}</strong>
        </p>
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
          Срок действия: ${isExpired ? 'истек' : `${minutesLeft} мин`}
        </p>
        
        ${isExpired ? `
          <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
            Код истек. Нажмите «Назад», чтобы получить новый.
          </p>
        ` : `
          <button class="btn btn-primary btn-block mb-12" id="copy-verify-btn">📋 Скопировать команду</button>
          <button class="btn btn-primary btn-block" id="check-verify-btn">✅ Проверить</button>
        `}
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    state.twitchVerify = null;
    renderTwitchSettings();
  });

  const copyBtn = document.getElementById('copy-verify-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(verifyCommand).then(() => {
        showToast('Команда скопирована');
      }).catch(() => {
        showToast('Не удалось скопировать', true);
      });
    });
  }

  const checkBtn = document.getElementById('check-verify-btn');
  if (checkBtn) checkBtn.addEventListener('click', checkTwitchVerificationStatus);

  if (!isExpired) scheduleTwitchVerifyPoll();
}

function renderTwitchVerifySuccess() {
  const container = document.getElementById('app-content');
  const verify = state.twitchVerify;
  if (!verify) {
    renderTwitchSettings();
    return;
  }

  clearTwitchVerifyTimer();
  const botLogin = verify.botLogin || 'unbanmepls_lol';
  const modCommand = `/mod ${botLogin}`;

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon" style="background: linear-gradient(135deg, #2ecc71, #27ae60);">✅</div>
          <div>
            <div class="card-title">Канал подтвержден</div>
            <div class="card-subtitle">${verify.channelLogin}</div>
          </div>
        </div>
        
        <div class="input-group">
          <label class="input-label">Команда для модератора</label>
          <div class="input" id="mod-command" style="font-weight: 700;">${modCommand}</div>
        </div>
        
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
          Скопируйте команду и отправьте ее в чат вашего Twitch-канала.
        </p>
        
        <button class="btn btn-primary btn-block mb-12" id="copy-mod-btn">📋 Скопировать</button>
        <button class="btn btn-secondary btn-block" id="done-mod-btn">Готово</button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => {
    state.twitchVerify = null;
    renderTwitchSettings();
  });

  document.getElementById('copy-mod-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(modCommand).then(() => {
      showToast('Команда скопирована');
    }).catch(() => {
      showToast('Не удалось скопировать', true);
    });
  });

  document.getElementById('done-mod-btn').addEventListener('click', async () => {
    state.twitchVerify = null;
    await loadUser();
    renderSocialsScreen();
  });
}

async function saveTwitchPrice() {
  const price = parseInt(document.getElementById('twitch-price').value);
  if (!Number.isFinite(price) || price < MIN_UNBAN_PRICE) {
    showToast(`Минимальная цена: ${MIN_UNBAN_PRICE} ₽`, true);
    return;
  }

  try {
    await api('/twitch/price', {
      method: 'PATCH',
      body: JSON.stringify({ userId: state.userId, price: Math.round(price) }),
    });
    state.user.twitch_price = Math.round(price);
    showToast('Цена обновлена!');
  } catch (e) {
    showToast(e.message || 'Ошибка', true);
  }
}

async function unlinkTwitch() {
  try {
    await api('/twitch', {
      method: 'DELETE',
      body: JSON.stringify({ userId: state.userId }),
    });
    await loadUser();
    showToast('Twitch отвязан');
    renderSocialsScreen();
  } catch (e) {
    showToast('Ошибка', true);
  }
}

function renderTelegramChannels() {
  const container = document.getElementById('app-content');
  const user = state.user || {};
  const channels = user.channels || [];

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon" style="background: rgba(42, 171, 238, 0.14);">
            <img class="platform-logo telegram" src="${TELEGRAM_LOGO_URL}" alt="Telegram">
          </div>
          <div>
            <div class="card-title">Telegram каналы</div>
            <div class="card-subtitle">${channels.length} подключено</div>
          </div>
        </div>
        
        ${channels.length === 0 ? `
          <div class="empty-state" style="padding: 24px 0;">
            <div class="empty-text">Нет подключенных каналов</div>
          </div>
        ` : channels.map(ch => `
          <div class="list-item channel-item" data-id="${ch.id}">
            <div class="list-item-content">
              <div class="list-item-text">
                <div class="list-item-title">${ch.title}</div>
                <div class="list-item-subtitle">${normalizePrice(ch.price)} ₽</div>
              </div>
            </div>
            <span class="list-item-arrow">›</span>
          </div>
        `).join('')}
        
        <button class="btn btn-primary btn-block mt-16" id="add-channel-btn">
          ➕ Добавить канал
        </button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderSocialsScreen);
  document.getElementById('add-channel-btn').addEventListener('click', renderAddChannel);

  document.querySelectorAll('.channel-item').forEach(item => {
    item.addEventListener('click', () => renderChannelSettings(item.dataset.id));
  });
}

function renderAddChannel() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">➕</div>
          <div>
            <div class="card-title">Добавить канал</div>
            <div class="card-subtitle">Введите @username канала</div>
          </div>
        </div>
        
        <div class="input-group">
          <input type="text" class="input" id="channel-input" placeholder="@mychannel">
        </div>
        
        <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 16px;">
          ⚠️ Бот должен быть администратором канала
        </p>
        
        <button class="btn btn-primary btn-block" id="link-channel-btn">
          🔗 Подключить
        </button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderTelegramChannels);
  document.getElementById('link-channel-btn').addEventListener('click', async () => {
    const username = document.getElementById('channel-input').value.trim();
    if (!username) {
      showToast('Введите username', true);
      return;
    }

    showSocialChangeModal({
      title: 'Подключить канал?',
      text: 'Канал будет привязан и появится в списке.',
      confirmText: 'Подключить',
      requireConfirm: false,
      onConfirm: async () => {
        try {
          await api('/channel/link', {
            method: 'POST',
            body: JSON.stringify({ userId: state.userId, username }),
          });
          showToast('Канал добавлен!');
          await loadUser();
          renderTelegramChannels();
        } catch (e) {
          showToast(e.message || 'Ошибка подключения канала', true);
        }
      },
    });
  });
}

function renderChannelSettings(channelId) {
  const container = document.getElementById('app-content');
  const channel = (state.user?.channels || []).find(c => c.id === channelId);

  if (!channel) {
    renderTelegramChannels();
    return;
  }

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon" style="background: rgba(42, 171, 238, 0.14);">
            <img class="platform-logo telegram" src="${TELEGRAM_LOGO_URL}" alt="Telegram">
          </div>
          <div>
            <div class="card-title">${channel.title}</div>
            <div class="card-subtitle">${channel.username || 'Закрытый канал'}</div>
          </div>
        </div>
        
        <div class="input-group">
          <label class="input-label">Введите новую цену разбана для этого канала (минимум ${MIN_UNBAN_PRICE} ₽)<br><br>Оплата картой будет доступна если цена больше ${getNicepayMinAmountRub()}₽</label>
          <input type="number" class="input" id="channel-price" value="${normalizePrice(channel.price)}" min="${MIN_UNBAN_PRICE}">
        </div>
        
        <button class="btn btn-primary btn-block mb-16" id="save-channel-btn">
          💾 Сохранить
        </button>
        
        <button class="btn btn-danger btn-block" id="unlink-channel-btn">
          ❌ Отвязать канал
        </button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderTelegramChannels);

  document.getElementById('save-channel-btn').addEventListener('click', async () => {
    const price = parseInt(document.getElementById('channel-price').value);
    if (!Number.isFinite(price) || price < MIN_UNBAN_PRICE) {
      showToast(`Минимальная цена: ${MIN_UNBAN_PRICE} ₽`, true);
      return;
    }

    try {
      await api(`/channel/${channelId}/price`, {
        method: 'PATCH',
        body: JSON.stringify({ price: Math.round(price) }),
      });
      channel.price = Math.round(price);
      showToast('Цена обновлена!');
    } catch (e) {
      showToast(e.message || 'Ошибка', true);
    }
  });

  document.getElementById('unlink-channel-btn').addEventListener('click', () => {
    showSocialChangeModal({
      title: 'Отвязать канал?',
      text: 'Канал будет отвязан и пользователи не смогут покупать разбан.',
      confirmText: 'Отвязать',
      danger: true,
      requireConfirm: true,
      onConfirm: async () => {
        try {
          await api(`/channel/${channelId}`, { method: 'DELETE' });
          showToast('Канал отвязан');
          await loadUser();
          renderTelegramChannels();
        } catch (e) {
          showToast('Ошибка', true);
        }
      },
    });
  });
}

function renderFinanceScreen() {
  const container = document.getElementById('app-content');
  const user = state.user || {};
  const promo = state.userPromo;
  const promoSubtitle = promo ? 'Активен' : 'Активировать промокод';

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">💰</div>
          <div>
            <div class="card-title">Финансы</div>
            <div class="card-subtitle">Баланс: <span class="${(user.balance || 0) > 0 ? 'sensitive' : ''}">${user.balance || 0} ₽</span></div>
          </div>
        </div>
        
        <div class="list-item" id="withdraw-btn">
          <div class="list-item-content">
            <div class="list-item-icon">💸</div>
            <div class="list-item-text">
              <div class="list-item-title">Вывести средства</div>
              <div class="list-item-subtitle">USDT TRC20</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
        
        <div class="list-item" id="stats-btn">
          <div class="list-item-content">
            <div class="list-item-icon">📊</div>
            <div class="list-item-text">
              <div class="list-item-title">Статистика</div>
              <div class="list-item-subtitle">История продаж</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>

        <div class="list-item" id="promo-btn">
          <div class="list-item-content">
            <div class="list-item-icon">🎁</div>
            <div class="list-item-text">
              <div class="list-item-title">Промокод</div>
              <div class="list-item-subtitle">${promoSubtitle}</div>
            </div>
          </div>
          <span class="list-item-arrow">›</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => renderMediaPanel(container));
  document.getElementById('withdraw-btn').addEventListener('click', renderWithdrawScreen);
  document.getElementById('stats-btn').addEventListener('click', renderStatsScreen);
  document.getElementById('promo-btn').addEventListener('click', renderPromoScreen);
}

function renderPromoScreen() {
  const container = document.getElementById('app-content');
  const promo = state.userPromo;
  const expiresAt = promo?.expires_at ? new Date(promo.expires_at).toLocaleDateString('ru-RU') : '';

  if (promo) {
    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>

        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon">🎁</div>
            <div>
              <div class="card-title">Промокод активен</div>
              <div class="card-subtitle">${maskPromoCode(promo.code)}</div>
            </div>
          </div>

          <div class="list-item" style="cursor: default;">
            <div class="list-item-content">
              <div class="list-item-icon">🏷️</div>
              <div class="list-item-text">
                <div class="list-item-title">Комиссия</div>
                <div class="list-item-subtitle">${promo.discount_percent}%</div>
              </div>
            </div>
          </div>

          <div class="list-item" style="cursor: default;">
            <div class="list-item-content">
              <div class="list-item-icon">📅</div>
              <div class="list-item-text">
                <div class="list-item-title">Действует до</div>
                <div class="list-item-subtitle">${expiresAt}</div>
              </div>
            </div>
          </div>

          <button class="btn btn-danger btn-block mt-16" id="deactivate-promo-btn">
            ❌ Деактивировать
          </button>
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', renderFinanceScreen);
    document.getElementById('deactivate-promo-btn').addEventListener('click', async () => {
      try {
        await api('/promo/deactivate', {
          method: 'POST',
          body: JSON.stringify({ userId: state.userId }),
        });
        state.userPromo = null;
        showToast('Промокод деактивирован');
        renderPromoScreen();
      } catch (e) {
        showToast('Ошибка', true);
      }
    });
    return;
  }

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>

      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">🎁</div>
          <div>
            <div class="card-title">Промокод</div>
          </div>
        </div>

        <div class="input-group">
          <label class="input-label">Введите код</label>
          <input type="text" class="input" id="promo-code-input" placeholder="Например: SALE10">
        </div>

        <button class="btn btn-primary btn-block" id="activate-promo-btn">
          ✅ Активировать
        </button>
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderFinanceScreen);
  document.getElementById('activate-promo-btn').addEventListener('click', async () => {
    const code = document.getElementById('promo-code-input').value.trim();
    if (!code) {
      showToast('Введите промокод', true);
      return;
    }

    try {
      const data = await api('/promo/activate', {
        method: 'POST',
        body: JSON.stringify({ userId: state.userId, code }),
      });
      state.userPromo = data.userPromo || null;
      showToast('Промокод активирован');
      renderPromoScreen();
    } catch (e) {
      showToast('Промокод не найден', true);
    }
  });
}

function renderWithdrawScreen() {
  const container = document.getElementById('app-content');
  const user = state.user || {};
  const balance = user.balance || 0;

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      
      <div class="glass-card card">
        <div class="card-header">
          <div class="card-icon">💸</div>
          <div>
            <div class="card-title">Вывод средств</div>
            <div class="card-subtitle">Доступно: ${balance} ₽</div>
          </div>
        </div>
        
        ${balance < 1000 ? `
          <div class="empty-state" style="padding: 24px 0;">
            <div class="empty-icon">💰</div>
            <div class="empty-text">Минимальная сумма вывода: 1000 ₽</div>
          </div>
        ` : `
          <div class="input-group">
            <label class="input-label">Сумма (₽)</label>
            <input type="number" class="input" id="withdraw-amount" value="${balance}" min="1000" max="${balance}">
          </div>
          
          <div class="input-group">
            <label class="input-label">Кошелек USDT (TRC20)</label>
            <input type="text" class="input" id="withdraw-wallet" placeholder="T...">
          </div>
          
          <button class="btn btn-primary btn-block" id="withdraw-submit">
            💸 Вывести
          </button>
        `}
      </div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderFinanceScreen);

  const submitBtn = document.getElementById('withdraw-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const amount = parseInt(document.getElementById('withdraw-amount').value);
      const wallet = document.getElementById('withdraw-wallet').value.trim();

      if (!amount || amount < 1000) {
        showToast('Минимум 1000 ₽', true);
        return;
      }
      if (amount > balance) {
        showToast('Недостаточно средств', true);
        return;
      }
      if (!wallet || !wallet.startsWith('T') || wallet.length < 30) {
        showToast('Неверный адрес кошелька', true);
        return;
      }

      showModal({
        icon: '💸',
        title: 'Подтвердите вывод',
        text: `Сумма: ${amount} ₽\nКошелек: ${wallet.substring(0, 10)}...`,
        confirmText: 'Подтвердить',
        onConfirm: async () => {
          try {
            await api('/withdraw', {
              method: 'POST',
              body: JSON.stringify({ userId: state.userId, amount, wallet }),
            });
            showToast('Заявка отправлена!');
            renderFinanceScreen();
          } catch (e) {
            showToast('Ошибка', true);
          }
        },
      });
    });
  }
}

async function renderStatsScreen() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      <div class="loading"><div class="spinner"></div></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', renderFinanceScreen);

  try {
    const data = await api(`/user/${state.userId}/stats`);

    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
        
        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon">📊</div>
            <div>
              <div class="card-title">Статистика</div>
            </div>
          </div>
          
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${data.totalIncome || 0} ₽</div>
              <div class="stat-label">Всего заработано</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${data.totalWithdrawn || 0} ₽</div>
              <div class="stat-label">Выведено</div>
            </div>
          </div>
          
          <p style="color: var(--text-secondary); font-size: 13px; margin-bottom: 12px;">
            Последние ${data.purchases?.length || 0} продаж:
          </p>
          
          ${(data.purchases || []).slice(0, 10).map(p => `
            <div class="list-item">
              <div class="list-item-content">
                <div class="list-item-text">
                  <div class="list-item-title">${p.target_nick}</div>
                  <div class="list-item-subtitle">${p.platform_label || p.platform} • ${new Date(p.date).toLocaleDateString()}</div>
                </div>
              </div>
              <span class="badge badge-success">${p.price} ₽</span>
            </div>
          `).join('') || '<p style="color: var(--text-muted); text-align: center;">Пока нет продаж</p>'}
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', renderFinanceScreen);
  } catch (e) {
    showToast('Ошибка загрузки', true);
    renderFinanceScreen();
  }
}

async function renderQueueScreen() {
  const container = document.getElementById('app-content');

  container.innerHTML = `
    <div class="fade-in">
      <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
      <div class="loading"><div class="spinner"></div></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => renderMediaPanel(container));

  try {
    const data = await api(`/user/${state.userId}/queue`);
    const queue = data.queue || [];

    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
        
        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon" style="background: linear-gradient(135deg, #ff9f0a, #ff6b00);">⚠️</div>
            <div>
              <div class="card-title">Ручные разбаны</div>
              <div class="card-subtitle">${queue.length} ожидают</div>
            </div>
          </div>
          
          ${queue.length === 0 ? `
            <div class="empty-state" style="padding: 24px 0;">
              <div class="empty-icon">✅</div>
              <div class="empty-text">Очередь пуста!</div>
            </div>
          ` : queue.map(item => `
            <div class="list-item queue-item" data-id="${item.id}">
              <div class="list-item-content">
                <div class="list-item-text">
                  <div class="list-item-title">${item.target_nick}</div>
                  <div class="list-item-subtitle">${item.platform_label || item.platform}</div>
                </div>
              </div>
              <button class="btn btn-sm btn-primary done-btn" data-id="${item.id}">
                ✅ Разбанил
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => renderMediaPanel(container));

    document.querySelectorAll('.done-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;

        showModal({
          icon: '✅',
          title: 'Подтвердите разбан',
          text: 'Вы точно разбанили этого пользователя?',
          confirmText: 'Да, разбанил',
          onConfirm: async () => {
            try {
              await api(`/queue/${id}/done`, { method: 'POST' });
              showToast('Отмечено!');
              renderQueueScreen();
            } catch (e) {
              showToast('Ошибка', true);
            }
          },
        });
      });
    });
  } catch (e) {
    showToast('Ошибка загрузки', true);
    renderMediaPanel(container);
  }
}

async function showPersonalLink() {
  const container = document.getElementById('app-content');
  const tgCount = state.user?.channels_count ?? (Array.isArray(state.user?.channels) ? state.user.channels.length : 0);
  const hasSocials = Boolean(state.user?.twitch_channel) || tgCount > 0;
  if (!hasSocials) {
    showToast('Сначала привяжите Twitch или Telegram канал', true);
    return;
  }

  showLoader('Загрузка ссылки...');

  try {
    const res = await apiWithInitData(`/user/${state.userId}/link`);
    const currentSlug = res.slug || `b_${state.userId}`;
    const botUsername = 'unbanmeplease_bot';
    const fullLink = `https://t.me/${botUsername}?start=${currentSlug}`;

    hideLoader();

    container.innerHTML = `
      <div class="fade-in">
        <button class="btn btn-secondary btn-sm mb-16" id="back-btn">← Назад</button>
        
        <div class="glass-card card">
          <div class="card-header">
            <div class="card-icon">🔗</div>
            <div>
              <div class="card-title">Персональная ссылка</div>
              <div class="card-subtitle">Настройте свою ссылку для приглашений</div>
            </div>
          </div>
          
          <div class="input-group">
            <label class="input-label">Ваша ссылка</label>
            <div class="input" style="background: rgba(145, 70, 255, 0.05); border-color: var(--accent-primary); color: var(--accent-primary); font-weight: 500; word-break: break-all;">
              ${fullLink}
            </div>
          </div>
          
          <button class="btn btn-primary btn-block mb-16" id="copy-link-btn">
            📋 Скопировать ссылку
          </button>
          
          <hr style="border: 0; border-top: 1px solid var(--glass-border); margin: 24px 0;">
          
          <div class="card-title" style="font-size: 16px; margin-bottom: 12px;">Настройки ссылки</div>
          
          <div class="input-group">
             <label class="input-label">Уникальный адрес (Slug)</label>
             <input type="text" class="input" id="slug-input" placeholder="Например: ninja" value="${res.slug || ''}" maxlength="32">
             <p style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">Можно использовать буквы, цифры и подчеркивания.</p>
          </div>
          
          <div style="display: flex; gap: 8px; margin-bottom: 12px;">
             <button class="btn btn-secondary" style="flex: 1;" id="save-slug-btn">💾 Сохранить</button>
             <button class="btn btn-secondary" style="flex: 1;" id="random-slug-btn">🎲 Random</button>
          </div>
          
          ${res.slug ? `
            <button class="btn btn-danger btn-block" id="reset-slug-btn">
              ❌ Сбросить (Вернуть ID)
            </button>
          ` : ''}
          
        </div>
      </div>
    `;

    document.getElementById('back-btn').addEventListener('click', () => renderMediaPanel(container));

    document.getElementById('copy-link-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(fullLink).then(() => {
        showToast('Ссылка скопирована!');
      }).catch(() => showToast('Ошибка копирования', true));
    });

    document.getElementById('save-slug-btn').addEventListener('click', async () => {
      const newSlug = document.getElementById('slug-input').value.trim();
      if (!newSlug) return showToast('Введите адрес', true);

      showLoader('Сохранение...');
      try {
        await apiWithInitData(`/user/${state.userId}/slug`, {
          method: 'POST',
          body: JSON.stringify({ slug: newSlug })
        });
        showToast('Ссылка обновлена!');
        showPersonalLink();
      } catch (e) {
        hideLoader();
        showToast(e.message || 'Ошибка сохранения', true);
      }
    });

    document.getElementById('random-slug-btn').addEventListener('click', async () => {
      showLoader('Генерация...');
      try {
        const data = await apiWithInitData(`/user/${state.userId}/slug/random`);
        hideLoader();
        const input = document.getElementById('slug-input');
        if (input && data?.slug) input.value = data.slug;
        showToast('Сгенерировано. Нажмите «Сохранить»');
      } catch (e) {
        hideLoader();
        showToast(e.message || 'Ошибка генерации', true);
      }
    });

    if (document.getElementById('reset-slug-btn')) {
      document.getElementById('reset-slug-btn').addEventListener('click', () => {
        showModal({
          icon: '⚠️',
          title: 'Сбросить ссылку?',
          text: 'Ссылка вернется к стандартному виду с вашим ID. Старая ссылка перестанет работать.',
          confirmText: 'Сбросить',
          danger: true,
          onConfirm: async () => {
            showLoader('Сброс...');
            try {
              await apiWithInitData(`/user/${state.userId}/slug`, { method: 'DELETE' });
              showToast('Ссылка сброшена');
              showPersonalLink();
            } catch (e) {
              hideLoader();
              showToast('Ошибка сброса', true);
            }
          }
        });
      });
    }

  } catch (e) {
    hideLoader();
    showToast('Ошибка загрузки настроек', true);
    renderMediaPanel(container);
  }
}


let modalCallback = null;

function showModal({ icon = '⚠️', title, text, confirmText = 'Подтвердить', danger = false, onConfirm }) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-text').innerHTML = text;

  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.textContent = confirmText;
  confirmBtn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;

  modalCallback = onConfirm;
  confirmBtn.onclick = () => {
    const cb = modalCallback;
    hideModal();
    if (cb) cb();
  };

  document.getElementById('modal-overlay').classList.add('active');
}

function hideModal() {
  document.getElementById('modal-overlay').classList.remove('active');
  modalCallback = null;
}


function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');

  toastText.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('active');

  setTimeout(() => {
    toast.classList.remove('active');
  }, 3000);
}

function hasLinkedSocials() {
  const tgCount = state.user?.channels_count ?? (Array.isArray(state.user?.channels) ? state.user.channels.length : 0);
  return Boolean(state.user?.twitch_channel) || tgCount > 0;
}

function showSocialChangeModal({ title, text, confirmText, danger = false, onConfirm, requireConfirm = false }) {
  const isVerified = !!state.user?.is_verified;
  if (isVerified || requireConfirm) {
    const warning = isVerified
      ? '<br><br><b>⚠️ У вас есть верификация. При изменении соцсетей галочка будет снята.</b>'
      : '';
    showModal({
      icon: '⚠️',
      title,
      text: `${text}${warning}`,
      confirmText: confirmText || 'Продолжить',
      danger,
      onConfirm,
    });
    return true;
  }
  if (onConfirm) onConfirm();
  return false;
}

function showLoader(text = '') {
  const overlay = document.getElementById('loader-overlay');
  const textEl = document.getElementById('loader-text');
  textEl.innerHTML = text;
  overlay.classList.add('active');
}

function hideLoader() {
  document.getElementById('loader-overlay').classList.remove('active');
}
