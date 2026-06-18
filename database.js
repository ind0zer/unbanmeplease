import Database from 'better-sqlite3';

const db = new Database('database.db');
db.pragma('journal_mode = WAL');

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT,
      twitch_channel TEXT,
      twitch_channel_id TEXT,
      twitch_price INTEGER DEFAULT 500,
      link_slug TEXT UNIQUE,
      is_verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      title TEXT,
      price INTEGER DEFAULT 100,
      owner_id TEXT,
      username TEXT,
      photo_file_id TEXT,
      FOREIGN KEY(owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS pending_actions (
      key TEXT PRIMARY KEY,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blogger_id TEXT,
      platform TEXT,
      target_nick TEXT,
      price INTEGER,
      net_amount INTEGER,
      channel_id TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    
    CREATE TABLE IF NOT EXISTS username_cache (
      username TEXT PRIMARY KEY,
      user_id TEXT
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT,
      amount INTEGER,
      wallet TEXT,
      status TEXT, -- pending, approved, rejected
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS unban_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      blogger_id TEXT,
      target_nick TEXT,
      platform TEXT,
      price INTEGER,
      channel_id TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS promocodes (
      code TEXT PRIMARY KEY,
      discount_percent INTEGER,
      valid_days INTEGER,
      max_uses INTEGER DEFAULT -1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_promo (
      user_id TEXT PRIMARY KEY,
      promo_code TEXT,
      activated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS twitch_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      channel_login TEXT,
      channel_id TEXT,
      code TEXT,
      status TEXT,
      created_at INTEGER,
      expires_at INTEGER,
      verified_at INTEGER
    );

    

    CREATE INDEX IF NOT EXISTS idx_twitch_verifications_channel
      ON twitch_verifications(channel_login);
    CREATE INDEX IF NOT EXISTS idx_twitch_verifications_user
      ON twitch_verifications(user_id);

  `);

try {
  const columns = db.prepare('PRAGMA table_info(purchases)').all();
  if (!columns.some(c => c.name === 'net_amount')) {
    db.exec('ALTER TABLE purchases ADD COLUMN net_amount INTEGER');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(purchases)').all();
  if (!columns.some(c => c.name === 'channel_id')) {
    db.exec('ALTER TABLE purchases ADD COLUMN channel_id TEXT');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(unban_queue)').all();
  if (!columns.some(c => c.name === 'channel_id')) {
    db.exec('ALTER TABLE unban_queue ADD COLUMN channel_id TEXT');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.some(c => c.name === 'twitch_channel_id')) {
    db.exec('ALTER TABLE users ADD COLUMN twitch_channel_id TEXT');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(channels)').all();
  if (!columns.some(c => c.name === 'photo_file_id')) {
    db.exec('ALTER TABLE channels ADD COLUMN photo_file_id TEXT');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.some(c => c.name === 'link_slug')) {
    db.exec('ALTER TABLE users ADD COLUMN link_slug TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_link_slug ON users(link_slug)');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  if (!columns.some(c => c.name === 'is_verified')) {
    db.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER DEFAULT 0');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

try {
  const columns = db.prepare('PRAGMA table_info(promocodes)').all();
  if (!columns.some(c => c.name === 'max_uses')) {
    db.exec('ALTER TABLE promocodes ADD COLUMN max_uses INTEGER DEFAULT -1');
  }
} catch (e) {
  console.error('DB init error:', e.message);
}

const normalizeUserId = (value) => {
  if (value === null || value === undefined) return value;
  const str = String(value).trim();
  return str.endsWith('.0') ? str.slice(0, -2) : str;
};

const normalizeUserIds = () => {
  const rows = db.prepare("SELECT id, display_name, twitch_channel, twitch_channel_id, twitch_price FROM users WHERE id LIKE '%.0'").all();
  if (rows.length === 0) return;

  const getUser = db.prepare('SELECT id, display_name, twitch_channel, twitch_channel_id, twitch_price FROM users WHERE id = ?');
  const updateUser = db.prepare('UPDATE users SET display_name = ?, twitch_channel = ?, twitch_channel_id = ?, twitch_price = ? WHERE id = ?');
  const updateUserId = db.prepare('UPDATE users SET id = ? WHERE id = ?');
  const deleteUser = db.prepare('DELETE FROM users WHERE id = ?');

  const updateChannels = db.prepare('UPDATE channels SET owner_id = ? WHERE owner_id = ?');
  const updatePurchases = db.prepare('UPDATE purchases SET blogger_id = ? WHERE blogger_id = ?');
  const updateWithdrawals = db.prepare('UPDATE withdrawals SET user_id = ? WHERE user_id = ?');
  const updateQueue = db.prepare('UPDATE unban_queue SET blogger_id = ? WHERE blogger_id = ?');
  const updatePromo = db.prepare('UPDATE user_promo SET user_id = ? WHERE user_id = ?');
  const deletePromo = db.prepare('DELETE FROM user_promo WHERE user_id = ?');
  const selectPromo = db.prepare('SELECT 1 FROM user_promo WHERE user_id = ?');
  const updateUsernameCache = db.prepare('UPDATE username_cache SET user_id = ? WHERE user_id = ?');

  const tx = db.transaction(() => {
    rows.forEach(row => {
      const oldId = row.id;
      const newId = normalizeUserId(oldId);
      if (!newId || newId === oldId) return;

      const existing = getUser.get(newId);
      if (existing) {
        const mergedDisplay = existing.display_name || row.display_name;
        const mergedTwitchChannel = existing.twitch_channel || row.twitch_channel;
        const mergedTwitchChannelId = existing.twitch_channel_id || row.twitch_channel_id;
        let mergedTwitchPrice = existing.twitch_price;
        if (!existing.twitch_channel && row.twitch_channel && row.twitch_price !== null && row.twitch_price !== undefined) {
          mergedTwitchPrice = row.twitch_price;
        }
        if (
          mergedDisplay !== existing.display_name ||
          mergedTwitchChannel !== existing.twitch_channel ||
          mergedTwitchChannelId !== existing.twitch_channel_id ||
          mergedTwitchPrice !== existing.twitch_price
        ) {
          updateUser.run(mergedDisplay, mergedTwitchChannel, mergedTwitchChannelId, mergedTwitchPrice, newId);
        }

        updateChannels.run(newId, oldId);
        updatePurchases.run(newId, oldId);
        updateWithdrawals.run(newId, oldId);
        updateQueue.run(newId, oldId);
        updateUsernameCache.run(newId, oldId);

        const promoNew = selectPromo.get(newId);
        if (promoNew) {
          deletePromo.run(oldId);
        } else {
          updatePromo.run(newId, oldId);
        }

        deleteUser.run(oldId);
        return;
      }

      updateUserId.run(newId, oldId);
      updateChannels.run(newId, oldId);
      updatePurchases.run(newId, oldId);
      updateWithdrawals.run(newId, oldId);
      updateQueue.run(newId, oldId);
      updateUsernameCache.run(newId, oldId);
      updatePromo.run(newId, oldId);
    });
  });

  tx();
};

normalizeUserIds();

export const DB = {
  getUser: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
  getUserBySlug: (slug) => db.prepare('SELECT * FROM users WHERE LOWER(link_slug) = LOWER(?)').get(slug),
  createUser: (id) => db.prepare('INSERT OR IGNORE INTO users (id) VALUES (?)').run(id),
  updateUserDisplay: (id, name) => db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(name, id),
  updateUserSlug: (id, slug) => db.prepare('UPDATE users SET link_slug = ? WHERE id = ?').run(slug, id),
  setUserVerified: (id, isVerified) => db.prepare('UPDATE users SET is_verified = ? WHERE id = ?').run(isVerified ? 1 : 0, id),
  checkSlugExists: (slug, excludeUserId) => {
    const row = db.prepare('SELECT id FROM users WHERE LOWER(link_slug) = LOWER(?) AND id != ?').get(slug, excludeUserId);
    return !!row;
  },
  updateTwitch: (id, channel, price, channelId) => {
    if (channelId === undefined) {
      const current = db.prepare('SELECT twitch_channel_id FROM users WHERE id = ?').get(id);
      const existingId = current ? current.twitch_channel_id : null;
      return db.prepare('UPDATE users SET twitch_channel = ?, twitch_price = ?, twitch_channel_id = ? WHERE id = ?')
        .run(channel, price, existingId, id);
    }
    return db.prepare('UPDATE users SET twitch_channel = ?, twitch_price = ?, twitch_channel_id = ? WHERE id = ?')
      .run(channel, price, channelId, id);
  },
  getAllBloggers: () => db.prepare('SELECT * FROM users WHERE display_name IS NOT NULL OR twitch_channel IS NOT NULL').all(),
  searchUsers: (query) => {
    const normalized = (query || '').toLowerCase();
    const cleaned = normalized.replace(/^@/, '');
    const term = `%${normalized}%`;
    const termClean = `%${cleaned}%`;
    const sql = `
      SELECT DISTINCT u.* 
      FROM users u
      LEFT JOIN channels c ON c.owner_id = u.id
      WHERE 
        LOWER(u.twitch_channel) LIKE ? OR
        LOWER(u.display_name) LIKE ? OR
        LOWER(c.title) LIKE ? OR
        LOWER(c.username) LIKE ? OR
        REPLACE(LOWER(c.username), '@', '') LIKE ?
    `;
    return db.prepare(sql).all(term, term, term, term, termClean);
  },

  checkDisplayNameExists: (name, excludeUserId) => {
    const row = db.prepare('SELECT id FROM users WHERE LOWER(display_name) = LOWER(?) AND id != ?').get(name, excludeUserId);
    return !!row;
  },
  checkTwitchLinked: (channelName, excludeUserId, channelId) => {
    if (channelId) {
      const row = db.prepare('SELECT id FROM users WHERE (LOWER(twitch_channel) = LOWER(?) OR twitch_channel_id = ?) AND id != ?')
        .get(channelName, channelId, excludeUserId);
      return !!row;
    }
    const row = db.prepare('SELECT id FROM users WHERE LOWER(twitch_channel) = LOWER(?) AND id != ?').get(channelName, excludeUserId);
    return !!row;
  },
  checkChannelLinked: (channelId, excludeUserId) => {
    const row = db.prepare('SELECT owner_id FROM channels WHERE id = ? AND owner_id != ?').get(channelId, excludeUserId);
    return !!row;
  },

  getChannel: (id) => db.prepare('SELECT * FROM channels WHERE id = ?').get(id),
  getUserChannels: (userId) => db.prepare('SELECT * FROM channels WHERE owner_id = ?').all(userId),
  addChannel: (channel) => db.prepare('INSERT OR REPLACE INTO channels (id, title, price, owner_id, username, photo_file_id) VALUES (@id, @title, @price, @owner_id, @username, @photo_file_id)').run(channel),
  removeChannel: (id) => db.prepare('DELETE FROM channels WHERE id = ?').run(id),
  updateChannelPrice: (id, price) => db.prepare('UPDATE channels SET price = ? WHERE id = ?').run(price, id),
  updateChannelPhoto: (id, photoFileId) => db.prepare('UPDATE channels SET photo_file_id = ? WHERE id = ?').run(photoFileId, id),

  getPending: (key) => {
    const row = db.prepare('SELECT data FROM pending_actions WHERE key = ?').get(key);
    return row ? JSON.parse(row.data) : null;
  },
  setPending: (key, data) => db.prepare('INSERT OR REPLACE INTO pending_actions (key, data) VALUES (?, ?)').run(key, JSON.stringify(data)),
  deletePending: (key) => db.prepare('DELETE FROM pending_actions WHERE key = ?').run(key),
  getAllPending: () => {
    const rows = db.prepare('SELECT * FROM pending_actions').all();
    const out = {};
    for (const r of rows) out[r.key] = JSON.parse(r.data);
    return out;
  },

  addPurchase: (p) => db.prepare('INSERT INTO purchases (blogger_id, platform, target_nick, price, net_amount, channel_id) VALUES (@bloggerId, @platform, @targetNick, @price, @net_amount, @channelId)').run(p),
  getPurchases: (bloggerId) => db.prepare('SELECT * FROM purchases WHERE blogger_id = ? ORDER BY date DESC').all(bloggerId),

  addToQueue: (q) => db.prepare('INSERT INTO unban_queue (blogger_id, target_nick, platform, price, channel_id) VALUES (@bloggerId, @targetNick, @platform, @price, @channelId)').run(q),
  getQueue: (bloggerId) => db.prepare('SELECT * FROM unban_queue WHERE blogger_id = ? ORDER BY date ASC').all(bloggerId),
  deleteQueueItem: (id) => db.prepare('DELETE FROM unban_queue WHERE id = ?').run(id),

  addWithdrawal: (w) => db.prepare('INSERT INTO withdrawals (user_id, amount, wallet, status) VALUES (@userId, @amount, @wallet, @status)').run(w),
  getWithdrawals: (userId) => db.prepare('SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC').all(userId),
  getWithdrawal: (id) => db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id),
  updateWithdrawalStatus: (id, status) => db.prepare('UPDATE withdrawals SET status = ? WHERE id = ?').run(status, id),

  getUserIdByUsername: (username) => {
    const row = db.prepare('SELECT user_id FROM username_cache WHERE username = ?').get(username.toLowerCase());
    return row ? row.user_id : null;
  },
  saveUsername: (username, userId) => db.prepare('INSERT OR REPLACE INTO username_cache (username, user_id) VALUES (?, ?)').run(username.toLowerCase(), userId),

  createTwitchVerification: (v) => db.prepare(
    `INSERT INTO twitch_verifications
      (id, user_id, channel_login, channel_id, code, status, created_at, expires_at, verified_at)
     VALUES (@id, @user_id, @channel_login, @channel_id, @code, @status, @created_at, @expires_at, @verified_at)`
  ).run(v),
  getTwitchVerification: (id) => db.prepare('SELECT * FROM twitch_verifications WHERE id = ?').get(id),
  getPendingTwitchVerificationByUser: (userId) =>
    db.prepare('SELECT * FROM twitch_verifications WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .get(userId, 'pending'),
  getPendingTwitchVerificationByChannel: (channelLogin) =>
    db.prepare('SELECT * FROM twitch_verifications WHERE channel_login = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
      .get(channelLogin, 'pending'),
  setTwitchVerificationStatus: (id, status, verifiedAt) => {
    if (verifiedAt !== undefined) {
      return db.prepare('UPDATE twitch_verifications SET status = ?, verified_at = ? WHERE id = ?').run(status, verifiedAt, id);
    }
    return db.prepare('UPDATE twitch_verifications SET status = ? WHERE id = ?').run(status, id);
  },
  expireTwitchVerifications: (now) =>
    db.prepare('UPDATE twitch_verifications SET status = ? WHERE status = ? AND expires_at <= ?')
      .run('expired', 'pending', now),
  getActiveTwitchVerificationChannels: () =>
    db.prepare('SELECT DISTINCT channel_login FROM twitch_verifications WHERE status = ?').all('pending')
      .map(r => r.channel_login),

  getGlobalStats: () => {
    const users = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const channels = db.prepare('SELECT COUNT(*) as count FROM channels').get().count;
    const income = db.prepare('SELECT SUM(price) as total FROM purchases').get().total || 0;
    const purchases = db.prepare('SELECT COUNT(*) as count FROM purchases').get().count;
    return { users, channels, income, purchases };
  },
  getAllUserIds: () => db.prepare('SELECT id FROM users').all().map(u => u.id),

  getConfig: (key) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : null;
  },
  setConfig: (key, value) => db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, String(value)),

  createPromo: (code, discountPercent, validDays, maxUses = -1) =>
    db.prepare('INSERT INTO promocodes (code, discount_percent, valid_days, max_uses) VALUES (?, ?, ?, ?)').run(code, discountPercent, validDays, maxUses),
  getAllPromos: () => db.prepare('SELECT * FROM promocodes ORDER BY created_at DESC').all(),
  getPromo: (code) => db.prepare('SELECT * FROM promocodes WHERE code = ?').get(code),
  deletePromo: (code) => db.prepare('DELETE FROM promocodes WHERE code = ?').run(code),

  activatePromo: (userId, promoCode) => db.prepare('INSERT OR REPLACE INTO user_promo (user_id, promo_code, activated_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(userId, promoCode),
  getUserPromoRaw: (userId) => db.prepare('SELECT * FROM user_promo WHERE user_id = ?').get(userId),
  getPromoActiveUses: (code) => {
    const row = db.prepare(`
      SELECT COUNT(*) as count
      FROM user_promo up
      JOIN promocodes p ON p.code = up.promo_code
      WHERE up.promo_code = ?
        AND datetime(up.activated_at, '+' || p.valid_days || ' days') > datetime('now')
    `).get(code);
    return row ? row.count : 0;
  },
  getUserPromo: (userId) => {
    const row = db.prepare('SELECT * FROM user_promo WHERE user_id = ?').get(userId);
    if (!row) return null;
    const promo = db.prepare('SELECT * FROM promocodes WHERE code = ?').get(row.promo_code);
    if (!promo) return null;
    const activatedDate = new Date(row.activated_at);
    const expiresDate = new Date(activatedDate.getTime() + promo.valid_days * 24 * 60 * 60 * 1000);
    const isExpired = new Date() > expiresDate;
    return isExpired ? null : { ...promo, activated_at: row.activated_at, expires_at: expiresDate.toISOString() };
  },
  deactivatePromo: (userId) => db.prepare('DELETE FROM user_promo WHERE user_id = ?').run(userId),
};

export default DB;
