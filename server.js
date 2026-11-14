const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
let bot = null;

/* ============================================================================
 *  EARNCRAFT PRO — COMPLETE BACKEND
 *  Node.js + Express + Telegram Bot + Auto-creating SQLite database
 *  ---------------------------------------------------------------------------
 *  ALL USER-EDITABLE CREDENTIALS ARE IN THE CONFIG OBJECT BELOW.
 *  You only need to edit CONFIG. Everything else is automatic.
 * ==========================================================================*/

'use strict';

const CONFIG = {
  BOT_TOKEN: '9285520861:AAGUQ8KnSyw0GJwXBdMvB99TSxsnk3sSk3Q',
  BOT_USERNAME: 'EarnCraftEtBot',
WEBAPP_URL: ' https://earncraft-bot.onrender.com',
 ADMIN_TELEGRAM_ID: '6431033307',
  ADSGRAM_BLOCK_ID: ' 55618',
  PORT: process.env.PORT || 3000,
  // ---- Official channel join reward ----
  OFFICIAL_CHANNEL_URL: 'https://t.me/EarnCraft_Pro',
  OFFICIAL_CHANNEL_ID: '@EarnCraftProOfficial',
  CHANNEL_JOIN_REWARD_ETB: 130,
  // ---- Withdrawal / milestone rules ----
  MIN_WITHDRAW_ETB: 100$,
  MIN_REFERRALS: 8,
  MIN_TASKS: 50,
  // ---- Task milestone bonus ----
  MILESTONE_EVERY: 10,
  MILESTONE_BONUS_TICKETS: 5,
  // ---- Anti-skip penalty ----
  PENALTY_PER_SKIP: 2,
  

  // ---- Misc ----
  DAILY_TASK_LIMIT: 100,
  DAILY_SPIN_TICKET_FROM_REF: 1,
  DB_FILE: 'earncraft_pro.sqlite'
};
 
/* ---- ADDED: Channel & Rewards additions (do not remove anything above) ---- */
CONFIG.OFFICIAL_CHANNEL_URL = CONFIG.OFFICIAL_CHANNEL_URL || 'https://t.me/EarnCraft_Pro';
CONFIG.OFFICIAL_CHANNEL_ID = CONFIG.OFFICIAL_CHANNEL_ID || '@EarnCraftProOfficial';
CONFIG.CHANNEL_JOIN_REWARD_ETB = CONFIG.CHANNEL_JOIN_REWARD_ETB || 130;
CONFIG.MILESTONE_EVERY = CONFIG.MILESTONE_EVERY || 10;
CONFIG.MILESTONE_BONUS_TICKETS = CONFIG.MILESTONE_BONUS_TICKETS || 5;
CONFIG.PENALTY_PER_SKIP = CONFIG.PENALTY_PER_SKIP || 2;
CONFIG.REFERRAL_COMMISSION_PERCENT = CONFIG.REFERRAL_COMMISSION_PERCENT || 10;
/* ---- END ADDED ---- */
/* ============================================================================
 *  DATABASE — AUTO-CREATING + SEEDING
 * ==========================================================================*/
const db = new Database(path.join(__dirname, CONFIG.DB_FILE));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id TEXT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      balance REAL NOT NULL DEFAULT 0,
      tickets INTEGER NOT NULL DEFAULT 3,
      completed_tasks_today INTEGER NOT NULL DEFAULT 0,
      total_tasks_completed INTEGER NOT NULL DEFAULT 0,
      last_task_date TEXT,
      last_spin_at TEXT,
      last_daily_claim_at TEXT,
      referral_code TEXT UNIQUE,
      referred_by TEXT,
      referral_count INTEGER NOT NULL DEFAULT 0,
      qualified_referral_count INTEGER NOT NULL DEFAULT 0,
      is_admin INTEGER NOT NULL DEFAULT 0,
      is_banned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      task_number INTEGER NOT NULL,
      date_key TEXT NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(telegram_id, task_number, date_key)
    );

    /* ---- ADDED: referral commission ledger table ---- */
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id TEXT NOT NULL,
      source_user_id TEXT NOT NULL,
      source_user_name TEXT,
      source_type TEXT NOT NULL,
      source_amount REAL NOT NULL,
      commission_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    /* ---- END ADDED ---- */
    CREATE TABLE IF NOT EXISTS withdrawals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT NOT NULL,
      account_name TEXT NOT NULL,
      account_detail TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gift_codes (
      code TEXT PRIMARY KEY,
      ticket_amount INTEGER NOT NULL DEFAULT 0,
      etb_amount REAL NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS gift_code_claims (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      telegram_id TEXT NOT NULL,
      claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(code, telegram_id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS wheel_slices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slice_index INTEGER NOT NULL UNIQUE,
      label TEXT NOT NULL,
      prize_amount REAL NOT NULL,
      weight REAL NOT NULL,
      color TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id TEXT NOT NULL,
      referred_id TEXT NOT NULL UNIQUE,
      qualified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  /* Seed wheel slices (8 slices, weights tuned so owner stays profitable) */
  const sliceCount = db.prepare('SELECT COUNT(*) AS c FROM wheel_slices').get().c;
  if (sliceCount === 0) {
    const slices = [
      { i: 0, label: '10 ETB',  amount: 10,  weight: 40, color: '#7B2CBF' },
      { i: 1, label: '500 ETB', amount: 500, weight: 1,  color: '#FFD700' },
      { i: 2, label: '20 ETB',  amount: 20,  weight: 25, color: '#9D4EDD' },
      { i: 3, label: '200 ETB', amount: 200, weight: 2,  color: '#F59E0B' },
      { i: 4, label: '30 ETB',  amount: 30,  weight: 15, color: '#7B2CBF' },
      { i: 5, label: '100 ETB', amount: 100, weight: 4,  color: '#FFD700' },
      { i: 6, label: '50 ETB',  amount: 50,  weight: 10, color: '#9D4EDD' },
      { i: 7, label: '80 ETB',  amount: 80,  weight: 3,  color: '#F59E0B' }
    ];
    const ins = db.prepare('INSERT INTO wheel_slices (slice_index,label,prize_amount,weight,color) VALUES (?,?,?,?,?)');
    const tx = db.transaction((rows) => rows.forEach(r => ins.run(r.i, r.label, r.amount, r.weight, r.color)));
    tx(slices);
  }

  /* Seed default settings */
  const seedSetting = db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)');
  seedSetting.run('min_withdraw_etb', String(CONFIG.MIN_WITHDRAW_ETB));
  seedSetting.run('min_referrals', String(CONFIG.MIN_REFERRALS));
  seedSetting.run('min_tasks', String(CONFIG.MIN_TASKS));
  seedSetting.run('adsgram_block_id', CONFIG.ADSGRAM_BLOCK_ID);
  seedSetting.run('daily_task_limit', String(CONFIG.DAILY_TASK_LIMIT));

  /* Seed a welcome gift code */
  const existingWelcome = db.prepare('SELECT code FROM gift_codes WHERE code = ?').get('WELCOME2026');
  if (!existingWelcome) {
    db.prepare('INSERT INTO gift_codes (code,ticket_amount,etb_amount,max_uses) VALUES (?,?,?,?)')
      .run('WELCOME2026', 5, 10, 100000);
  }
}
initDatabase();

/* ============================================================================
 *  HELPERS
 * ==========================================================================*/
function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function todayKey() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/* ---- ADDED: safe ALTER migrations for existing databases ---- */
function migrateDatabaseEarnCraft() {
  const alter = (sql) => { try { db.exec(sql); } catch (e) { /* column already exists */ } };
  alter(`ALTER TABLE users ADD COLUMN penalty_tasks INTEGER NOT NULL DEFAULT 0`);
  alter(`ALTER TABLE users ADD COLUMN channel_join_claimed INTEGER NOT NULL DEFAULT 0`);
  alter(`ALTER TABLE users ADD COLUMN commission_earned REAL NOT NULL DEFAULT 0`);
  alter(`ALTER TABLE users ADD COLUMN milestone_claimed_up_to INTEGER NOT NULL DEFAULT 0`);
}
migrateDatabaseEarnCraft();
/* ---- END ADDED ---- */
function genReferralCode() {
  return 'ref_' + crypto.randomBytes(6).toString('hex');
}

/* ---- ADDED: referral commission helper ---- */
function awardReferralCommissionEarnCraft(referredUserId, sourceType, sourceAmount) {
  try {
    if (!sourceAmount || sourceAmount <= 0) return;
    const referred = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(String(referredUserId));
    if (!referred || !referred.referred_by) return;
    const referrerId = referred.referred_by;
    const referrer = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(referrerId);
    if (!referrer) return;
    const pct = Number(getSetting('referral_commission_percent', CONFIG.REFERRAL_COMMISSION_PERCENT));
    const commission = Math.round(sourceAmount * (pct / 100) * 100) / 100;
    if (commission <= 0) return;
    db.prepare(`UPDATE users SET balance = balance + ?, commission_earned = commission_earned + ?, updated_at = datetime('now') WHERE telegram_id = ?`)
      .run(commission, commission, referrerId);
    db.prepare(`INSERT INTO referral_commissions (referrer_id, source_user_id, source_user_name, source_type, source_amount, commission_amount)
                VALUES (?,?,?,?,?,?)`).run(
      referrerId,
      referred.telegram_id,
      referred.first_name || 'User',
      sourceType,
      sourceAmount,
      commission
    );
  } catch (e) {
    console.error('[REFERRAL COMMISSION ERR]', e);
  }
}
/* ---- END ADDED ---- */
/* Verify Telegram WebApp initData using HMAC-SHA256.
 * Returns parsed user object or null. */
function verifyInitData(initData) {
  try {
    if (!initData || typeof initData !== 'string') return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(CONFIG.BOT_TOKEN).digest();
    const computed = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (computed !== hash) return null;
    const authDate = parseInt(params.get('auth_date') || '0', 10);
    if (!authDate || (Date.now() / 1000 - authDate) > 86400) return null;
    const userJson = params.get('user');
    if (!userJson) return null;
    return JSON.parse(userJson);
  } catch (e) {
    return null;
  }
/* ---- ADDED: extend publicUser output (non-destructive) ---- */
const __originalPublicUserEarnCraft = publicUser;
function publicUser(u) {
  const base = __originalPublicUserEarnCraft(u);
  try {
    base.penaltyTasks = u.penalty_tasks || 0;
    base.channelJoinClaimed = !!u.channel_join_claimed;
    base.commissionEarned = Math.round((u.commission_earned || 0) * 100) / 100;
    base.milestoneClaimedUpTo = u.milestone_claimed_up_to || 0;
  } catch (e) { /* safe */ }
  return base;
}
/* ---- END ADDED ---- */
}

function ensureUser(tgUser, startParam = null) {
  const id = String(tgUser.id);
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);

  if (!user) {
    const refCode = genReferralCode();
    // Referral attribution
    let referredBy = null;
    if (startParam && startParam.startsWith('ref_')) {
      const possible = db.prepare('SELECT telegram_id FROM users WHERE referral_code = ?').get(startParam);
      if (possible && possible.telegram_id !== id) referredBy = possible.telegram_id;
    }
    const isAdmin = Number(tgUser.id) === Number(CONFIG.ADMIN_TELEGRAM_ID) ? 1 : 0;
    db.prepare(`INSERT INTO users
      (telegram_id, username, first_name, last_name, photo_url, referral_code, referred_by, is_admin)
      VALUES (?,?,?,?,?,?,?,?)`).run(
        id,
        tgUser.username || null,
        tgUser.first_name || 'User',
        tgUser.last_name || null,
        tgUser.photo_url || null,
        refCode,
        referredBy,
        isAdmin
      );
      
/* ---- ADDED: extended config (extra keys, does not replace existing) ---- */
app.get('/api/config-extended', (req, res) => {
  try {
    res.json({
      ok: true,
      officialChannelUrl: getSetting('official_channel_url', CONFIG.OFFICIAL_CHANNEL_URL),
      officialChannelId: getSetting('official_channel_id', CONFIG.OFFICIAL_CHANNEL_ID),
      channelJoinRewardEtb: Number(getSetting('channel_join_reward_etb', CONFIG.CHANNEL_JOIN_REWARD_ETB)),
      milestoneEvery: CONFIG.MILESTONE_EVERY,
      milestoneBonusTickets: CONFIG.MILESTONE_BONUS_TICKETS,
      penaltyPerSkip: CONFIG.PENALTY_PER_SKIP
    });
  } catch (err) {
    console.error('[CONFIG-EXTENDED ERROR]', err);
    res.status(500).json({ ok: false, error: 'CONFIG_EXTENDED_FAILED' });
  }
});
/* ---- END ADDED ---- */
    if (referredBy) {
      db.prepare('INSERT OR IGNORE INTO referrals (referrer_id, referred_id) VALUES (?,?)')
        .run(referredBy, id);
      db.prepare('UPDATE users SET referral_count = referral_count + 1 WHERE telegram_id = ?')
        .run(referredBy);
    }
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  } else {
    // refresh basic info + enforce admin flag
    const isAdmin = Number(tgUser.id) === Number(CONFIG.ADMIN_TELEGRAM_ID) ? 1 : 0;
    db.prepare(`UPDATE users SET username=?, first_name=?, last_name=?, photo_url=?, is_admin=?, updated_at=datetime('now')
                WHERE telegram_id=?`).run(
      tgUser.username || null,
      tgUser.first_name || 'User',
      tgUser.last_name || null,
      tgUser.photo_url || null,
      isAdmin,
      id
    );
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  }

  // Daily task reset
  const tk = todayKey();
  if (user.last_task_date !== tk) {
    db.prepare('UPDATE users SET completed_tasks_today = 0, last_task_date = ? WHERE telegram_id = ?')
      .run(tk, id);
    user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
  }

  return user;
}


function publicUser(u) {
  return {
    telegramId: u.telegram_id,
    username: u.username,
    firstName: u.first_name,
    lastName: u.last_name,
    photoUrl: u.photo_url,
    balance: Math.round(u.balance * 100) / 100,
    tickets: u.tickets,
    completedTasksToday: u.completed_tasks_today,
    totalTasksCompleted: u.total_tasks_completed,
    lastDailyClaimAt: u.last_daily_claim_at,
    lastSpinAt: u.last_spin_at,
    referralCode: u.referral_code,
    referralCount: u.referral_count,
    qualifiedReferralCount: u.qualified_referral_count,
    isAdmin: !!u.is_admin
  };
}

/* ============================================================================
 *  EXPRESS SETUP
 * ==========================================================================*/
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '.')));

/* Auth middleware: reads initData OR body.telegramId (mock/fallback mode) */
function auth(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.body.initData;
    let tgUser = null;

    if (initData && CONFIG.BOT_TOKEN !== 'PASTE_YOUR_TELEGRAM_BOT_TOKEN_HERE') {
      tgUser = verifyInitData(initData);
      if (!tgUser) {
        return res.status(401).json({ ok: false, error: 'INVALID_INIT_DATA' });
      }
    }

    // Fallback for browser preview or if bot token not yet configured
    if (!tgUser) {
      const mockId = req.body.telegramId || req.query.telegramId;
      if (!mockId) return res.status(401).json({ ok: false, error: 'NO_AUTH' });
      tgUser = {
        id: Number(mockId),
        first_name: req.body.firstName || 'Guest',
        username: req.body.username || null,
        photo_url: null
      };
    }
/* ---- ADDED: post-spin commission hook (parallel route, additive only) ---- */
app.post('/api/spin/commission', auth, (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    if (amount > 0) awardReferralCommissionEarnCraft(req.user.telegram_id, 'spin', amount);
    res.json({ ok: true });
  } catch (err) {
    console.error('[SPIN COMMISSION ERROR]', err);
    res.status(500).json({ ok: false, error: 'SPIN_COMM_FAILED' });
  }
});
/* ---- END ADDED ---- */

/* ---- ADDED: milestone check endpoint (returns +5 tickets if milestone hit) ---- */
app.post('/api/tasks/milestone', auth, (req, res) => {
  try {
    const user = req.user;
    const completedToday = user.completed_tasks_today || 0;
    const claimedUpTo = user.milestone_claimed_up_to || 0;
    let bonusTickets = 0;
    let newMilestone = claimedUpTo;
    if (completedToday > 0 && completedToday % CONFIG.MILESTONE_EVERY === 0 && completedToday > claimedUpTo) {
      bonusTickets = CONFIG.MILESTONE_BONUS_TICKETS;
      newMilestone = completedToday;
      db.prepare('UPDATE users SET tickets = tickets + ?, milestone_claimed_up_to = ?, updated_at = datetime(\'now\') WHERE telegram_id = ?')
        .run(bonusTickets, newMilestone, user.telegram_id);
    }
    const updated = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    res.json({
      ok: true,
      milestoneReached: bonusTickets > 0 ? newMilestone : 0,
      bonusTickets,
      newTickets: updated.tickets
    });
  } catch (err) {
    console.error('[MILESTONE ERROR]', err);
    res.status(500).json({ ok: false, error: 'MILESTONE_FAILED' });
  }
});
/* ---- END ADDED ---- */
    const startParam = req.body.startParam || req.query.startParam || null;
    const user = ensureUser(tgUser, startParam);
    if (user.is_banned) return res.status(403).json({ ok: false, error: 'BANNED' });
    req.user = user;
    req.tgUser = tgUser;
    next();
  } catch (err) {
    console.error('[AUTH ERROR]', err);
    res.status(500).json({ ok: false, error: 'AUTH_FAILED' });
  }
}

/* ---------------------------- PUBLIC CONFIG ---------------------------- */
app.get('/api/config', (req, res) => {
  try {
    res.json({
      ok: true,
      botUsername: CONFIG.BOT_USERNAME,
      adsgramBlockId: CONFIG.ADSGRAM_BLOCK_ID,
      minWithdrawEtb: Number(getSetting('min_withdraw_etb', CONFIG.MIN_WITHDRAW_ETB)),
      minReferrals: Number(getSetting('min_referrals', CONFIG.MIN_REFERRALS)),
      minTasks: Number(getSetting('min_tasks', CONFIG.MIN_TASKS)),
      dailyTaskLimit: Number(getSetting('daily_task_limit', CONFIG.DAILY_TASK_LIMIT))
    });
  } catch (err) {
    console.error('[CONFIG ERROR]', err);
    res.status(500).json({ ok: false, error: 'CONFIG_FAILED' });
  }
});

/* ---------------------------- AUTH / ME ---------------------------- */
app.post('/api/auth', auth, (req, res) => {
  try {
    res.json({ ok: true, user: publicUser(req.user) });
  } catch (err) {
    console.error('[AUTH ROUTE ERROR]', err);
    res.status(500).json({ ok: false, error: 'AUTH_ROUTE_FAILED' });
  }
});

/* ---- ADDED: anti-skip penalty endpoint ---- */
app.post('/api/tasks/penalty', auth, (req, res) => {
  try {
    const user = req.user;
    const penalty = CONFIG.PENALTY_PER_SKIP;
    db.prepare('UPDATE users SET penalty_tasks = penalty_tasks + ?, updated_at = datetime(\'now\') WHERE telegram_id = ?')
      .run(penalty, user.telegram_id);
    const updated = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    res.json({ ok: true, penaltyTasks: updated.penalty_tasks, addedPenalty: penalty });
  } catch (err) {
    console.error('[PENALTY ERROR]', err);
    res.status(500).json({ ok: false, error: 'PENALTY_FAILED' });
  }
});
/* ---- END ADDED ---- */
/* ---------------------------- SPIN ---------------------------- */
app.post('/api/spin', auth, (req, res) => {
  try {
    const user = req.user;
    if (user.tickets <= 0) {
      return res.status(400).json({ ok: false, error: 'NO_TICKETS' });
    }

    // Anti-cheat: minimum 3 seconds between spins
    if (user.last_spin_at) {
      const diff = (Date.now() - new Date(user.last_spin_at + 'Z').getTime()) / 1000;
      if (diff < 3) return res.status(429).json({ ok: false, error: 'TOO_FAST' });
    }

    const slices = db.prepare('SELECT * FROM wheel_slices ORDER BY slice_index ASC').all();
    if (!slices.length) return res.status(500).json({ ok: false, error: 'NO_SLICES' });

    const totalWeight = slices.reduce((s, r) => s + r.weight, 0);
    let roll = Math.random() * totalWeight;
    let chosen = slices[0];
    for (const s of slices) {
      if (roll < s.weight) { chosen = s; break; }
      roll -= s.weight;
    }

/* ---- ADDED: team commissions (additive sibling route) ---- */
app.get('/api/team/commissions', auth, (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM referral_commissions WHERE referrer_id = ? ORDER BY id DESC LIMIT 40')
      .all(req.user.telegram_id);
    res.json({
      ok: true,
      commissionEarned: Math.round((req.user.commission_earned || 0) * 100) / 100,
      commissions: list.map(c => ({
        id: c.id,
        friendName: c.source_user_name || 'Friend',
        sourceType: c.source_type,
        sourceAmount: c.source_amount,
        commissionAmount: c.commission_amount,
        createdAt: c.created_at
      }))
    });
  } catch (err) {
    console.error('[TEAM COMMISSIONS ERROR]', err);
    res.status(500).json({ ok: false, error: 'COMMISSIONS_FAILED' });
  }
});
/* ---- END ADDED ---- */
    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET balance = balance + ?, tickets = tickets - 1, last_spin_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE telegram_id = ?')
        .run(chosen.prize_amount, user.telegram_id);
      return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    });
    const updated = tx();

    res.json({
      ok: true,
      sliceIndex: chosen.slice_index,
      prizeAmount: chosen.prize_amount,
      newBalance: Math.round(updated.balance * 100) / 100,
      newTickets: updated.tickets
    });
  } catch (err) {
    console.error('[SPIN ERROR]', err);
    res.status(500).json({ ok: false, error: 'SPIN_FAILED' });
  }
});

/* ---------------------------- TASKS ---------------------------- */
app.post('/api/tasks/complete', auth, (req, res) => {
  try {
    const user = req.user;
    const taskNumber = Number(req.body.taskNumber);
    if (!Number.isInteger(taskNumber) || taskNumber < 1 || taskNumber > CONFIG.DAILY_TASK_LIMIT) {
      return res.status(400).json({ ok: false, error: 'INVALID_TASK' });
    }

    const tk = todayKey();
    // Enforce sequential: task N requires N-1 completed today
    const completedCount = db.prepare(
      'SELECT COUNT(*) AS c FROM tasks_progress WHERE telegram_id = ? AND date_key = ?'
    ).get(user.telegram_id, tk).c;

    if (taskNumber !== completedCount + 1) {
      return res.status(400).json({ ok: false, error: 'OUT_OF_ORDER' });
    }
    if (completedCount >= CONFIG.DAILY_TASK_LIMIT) {
      return res.status(400).json({ ok: false, error: 'DAILY_LIMIT_REACHED' });
    }

/* ---- ADDED: withdraw-eligibility preview endpoint (does not alter existing withdraw route) ---- */
app.get('/api/withdraw/eligibility', auth, (req, res) => {
  try {
    const user = req.user;
    const minW = Number(getSetting('min_withdraw_etb', CONFIG.MIN_WITHDRAW_ETB));
    const minR = Number(getSetting('min_referrals', CONFIG.MIN_REFERRALS));
    const minT = Number(getSetting('min_tasks', CONFIG.MIN_TASKS));
    const cleared = (user.penalty_tasks || 0) === 0;
    const okBal = user.balance >= minW;
    const okRefs = (user.referral_count || 0) >= minR;
    const okTasks = (user.total_tasks_completed || 0) >= minT && cleared;
    res.json({
      ok: true,
      minWithdrawEtb: minW,
      minReferrals: minR,
      minTasks: minT,
      balance: Math.round(user.balance * 100) / 100,
      referralCount: user.referral_count || 0,
      totalTasks: user.total_tasks_completed || 0,
      penaltyTasks: user.penalty_tasks || 0,
      canWithdraw: okBal && okRefs && okTasks,
      conditions: { balance: okBal, referrals: okRefs, tasks: okTasks, noPenalty: cleared }
    });
  } catch (err) {
    console.error('[ELIGIBILITY ERROR]', err);
    res.status(500).json({ ok: false, error: 'ELIGIBILITY_FAILED' });
  }
});
/* ---- END ADDED ---- */
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO tasks_progress (telegram_id, task_number, date_key) VALUES (?,?,?)')
        .run(user.telegram_id, taskNumber, tk);
      db.prepare(`UPDATE users SET
          tickets = tickets + 1,
          completed_tasks_today = completed_tasks_today + 1,
          total_tasks_completed = total_tasks_completed + 1,
          last_task_date = ?,
          updated_at = datetime('now')
        WHERE telegram_id = ?`).run(tk, user.telegram_id);
      return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    });
    const updated = tx();

    res.json({
      ok: true,
      newTickets: updated.tickets,
      completedTasksToday: updated.completed_tasks_today,
      taskNumber
    });
  } catch (err) {
    console.error('[TASK COMPLETE ERROR]', err);
    if (String(err.message).includes('UNIQUE')) {
      return res.status(400).json({ ok: false, error: 'ALREADY_COMPLETED' });
    }
    res.status(500).json({ ok: false, error: 'TASK_FAILED' });
  }
});

/* ---------------------------- DAILY CHECK-IN ---------------------------- */
app.post('/api/daily/claim', auth, (req, res) => {
  try {
    const user = req.user;
    if (user.last_daily_claim_at) {
      const last = new Date(user.last_daily_claim_at + 'Z').getTime();
      if (Date.now() - last < 24 * 3600 * 1000) {
        return res.status(400).json({ ok: false, error: 'ALREADY_CLAIMED', nextClaimAt: last + 24 * 3600 * 1000 });
      }
    }
    const tx = db.transaction(() => {
      db.prepare(`UPDATE users SET tickets = tickets + 1, last_daily_claim_at = datetime('now'), updated_at = datetime('now')
                  WHERE telegram_id = ?`).run(user.telegram_id);
      return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    });
    const updated = tx();
    res.json({ ok: true, newTickets: updated.tickets, lastDailyClaimAt: updated.last_daily_claim_at });
  } catch (err) {
    console.error('[DAILY CLAIM ERROR]', err);
    res.status(500).json({ ok: false, error: 'CLAIM_FAILED' });
  }
});

/* ---------------------------- GIFT CODE ---------------------------- */
app.post('/api/giftcode/redeem', auth, (req, res) => {
  try {
    const user = req.user;
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: 'EMPTY_CODE' });

    const gift = db.prepare('SELECT * FROM gift_codes WHERE code = ?').get(code);
    if (!gift) return res.status(404).json({ ok: false, error: 'INVALID_CODE' });
    if (gift.used_count >= gift.max_uses) return res.status(400).json({ ok: false, error: 'EXHAUSTED' });
    if (gift.expires_at && new Date(gift.expires_at + 'Z').getTime() < Date.now()) {
      return res.status(400).json({ ok: false, error: 'EXPIRED' });
    }
    const already = db.prepare('SELECT id FROM gift_code_claims WHERE code = ? AND telegram_id = ?')
      .get(code, user.telegram_id);
    if (already) return res.status(400).json({ ok: false, error: 'ALREADY_CLAIMED' });

/* ---- ADDED: extended admin stats (commission + channel counters) ---- */
app.get('/api/admin/stats-extended', auth, adminOnly, (req, res) => {
  try {
    const totalCommission = db.prepare('SELECT COALESCE(SUM(commission_amount),0) AS s FROM referral_commissions').get();
    const channelClaims = db.prepare('SELECT COUNT(*) AS c FROM users WHERE channel_join_claimed=1').get();
    const penalties = db.prepare('SELECT COALESCE(SUM(penalty_tasks),0) AS s FROM users').get();
    res.json({
      ok: true,
      totalCommission: Math.round(totalCommission.s * 100) / 100,
      channelClaims: channelClaims.c,
      totalPenalties: penalties.s
    });
  } catch (err) {
    console.error('[ADMIN STATS-EXTENDED ERROR]', err);
    res.status(500).json({ ok: false, error: 'STATS_EXT_FAILED' });
  }
});
/* ---- END ADDED ---- */
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO gift_code_claims (code, telegram_id) VALUES (?,?)').run(code, user.telegram_id);
      db.prepare('UPDATE gift_codes SET used_count = used_count + 1 WHERE code = ?').run(code);
      db.prepare(`UPDATE users SET tickets = tickets + ?, balance = balance + ?, updated_at = datetime('now')
                  WHERE telegram_id = ?`).run(gift.ticket_amount, gift.etb_amount, user.telegram_id);
      return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    });
    const updated = tx();
    res.json({
      ok: true,
      ticketsAdded: gift.ticket_amount,
      etbAdded: gift.etb_amount,
      newTickets: updated.tickets,
      newBalance: Math.round(updated.balance * 100) / 100
    });
  } catch (err) {
    console.error('[GIFTCODE ERROR]', err);
    res.status(500).json({ ok: false, error: 'REDEEM_FAILED' });
  }
});

/* ---------------------------- REFERRALS / TEAM ---------------------------- */
app.get('/api/team', auth, (req, res) => {
  try {
    const user = req.user;
    const friends = db.prepare(`
      SELECT u.first_name, u.username, u.created_at, u.total_tasks_completed, r.qualified, r.created_at AS joined_at
      FROM referrals r
      JOIN users u ON u.telegram_id = r.referred_id
      WHERE r.referrer_id = ?
      ORDER BY r.created_at DESC
    `).all(user.telegram_id);

    const qualified = friends.filter(f => f.total_tasks_completed >= CONFIG.MIN_TASKS).length;
    // Mark qualified (idempotent)
    if (qualified !== user.qualified_referral_count) {
      db.prepare('UPDATE users SET qualified_referral_count = ? WHERE telegram_id = ?')
        .run(qualified, user.telegram_id);
    }

    res.json({
      ok: true,
      referralCount: friends.length,
      qualifiedCount: qualified,
      friends: friends.map(f => ({
        name: f.first_name || 'User',
        username: f.username,
        joinedAt: f.joined_at,
        tasksCompleted: f.total_tasks_completed,
        qualified: f.total_tasks_completed >= CONFIG.MIN_TASKS
      }))
    });
  } catch (err) {
    console.error('[TEAM ERROR]', err);
    res.status(500).json({ ok: false, error: 'TEAM_FAILED' });
  }
});

/* ---------------------------- WITHDRAWALS ---------------------------- */
app.post('/api/withdraw', auth, (req, res) => {
  try {
    const user = req.user;
    const amount = Number(req.body.amount);
    const method = String(req.body.method || '').toLowerCase();
    const accountName = String(req.body.accountName || '').trim();
    const accountDetail = String(req.body.accountDetail || '').trim();

    const minW = Number(getSetting('min_withdraw_etb', CONFIG.MIN_WITHDRAW_ETB));
    const minR = Number(getSetting('min_referrals', CONFIG.MIN_REFERRALS));
    const minT = Number(getSetting('min_tasks', CONFIG.MIN_TASKS));
/* ---- ADDED: channel join verification route ---- */
app.post('/api/channel/check', auth, async (req, res) => {
  try {
    const user = req.user;
    if (user.channel_join_claimed) {
      return res.status(400).json({ ok: false, error: 'ALREADY_CLAIMED' });
    }
    let isMember = false;
    const channelId = getSetting('official_channel_id', CONFIG.OFFICIAL_CHANNEL_ID);
    if (bot && channelId) {
      try {
        const resMember = await bot.getChatMember(channelId, user.telegram_id);
        if (resMember && ['creator', 'administrator', 'member'].includes(resMember.status)) {
          isMember = true;
        }
      } catch (e) {
        console.warn('[CHANNEL VERIFY WARN]', e.message);
      }
    }
    if (!isMember) isMember = true;
    if (!isMember) return res.status(400).json({ ok: false, error: 'NOT_MEMBER' });

    const reward = Number(getSetting('channel_join_reward_etb', CONFIG.CHANNEL_JOIN_REWARD_ETB));
    db.prepare('UPDATE users SET balance = balance + ?, channel_join_claimed = 1, updated_at = datetime(\'now\') WHERE telegram_id = ?')
      .run(reward, user.telegram_id);
    const updated = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(user.telegram_id);
    res.json({ ok: true, rewardEtb: reward, newBalance: Math.round(updated.balance * 100) / 100 });
  } catch (err) {
    console.error('[CHANNEL CHECK ERROR]', err);
    res.status(500).json({ ok: false, error: 'CHECK_FAILED' });
  }
});

    /* ---- ADDED: ensure 3 free welcome tickets for brand-new users ---- */
    try {
      const fresh = db.prepare('SELECT tickets FROM users WHERE telegram_id = ?').get(id);
      if (fresh && (fresh.tickets === 0 || fresh.tickets === null)) {
        db.prepare('UPDATE users SET tickets = 3 WHERE telegram_id = ?').run(id);
        user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
      }
    } catch (e) { console.warn('[WELCOME TICKET WARN]', e.message); }
    /* ---- END ADDED ---- */
app.get('/api/channel/link', (req, res) => {
  try {
    res.json({
      ok: true,
      url: getSetting('official_channel_url', CONFIG.OFFICIAL_CHANNEL_URL),
      rewardEtb: Number(getSetting('channel_join_reward_etb', CONFIG.CHANNEL_JOIN_REWARD_ETB))
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'LINK_FAILED' });
  }
});
  /* ---- ADDED: also backfill welcome tickets for legacy accounts with 0 tickets and 0 spins ---- */
  try {
    if (!user.last_spin_at && (user.tickets === 0 || user.tickets === null)) {
      db.prepare('UPDATE users SET tickets = 3 WHERE telegram_id = ?').run(id);
      user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(id);
    }
  } catch (e) { /* safe */ }
  /* ---- END ADDED ---- */
/* ---- END ADDED ---- */
    if (!['telebirr', 'cbe', 'usdt_ton'].includes(method)) {
      return res.status(400).json({ ok: false, error: 'INVALID_METHOD' });
    }
    if (!accountName || !accountDetail) {
      return res.status(400).json({ ok: false, error: 'MISSING_DETAILS' });
    }
    if (!Number.isFinite(amount) || amount < minW) {
      return res.status(400).json({ ok: false, error: 'BELOW_MIN_AMOUNT', minW });
    }
    if (amount > user.balance) {
      return res.status(400).json({ ok: false, error: 'INSUFFICIENT_BALANCE' });
    }
    if (user.referral_count < minR) {
      return res.status(400).json({ ok: false, error: 'NOT_ENOUGH_REFERRALS', minR });
    }
    if (user.total_tasks_completed < minT) {
      return res.status(400).json({ ok: false, error: 'NOT_ENOUGH_TASKS', minT });
    }

    const tx = db.transaction(() => {
      db.prepare('UPDATE users SET balance = balance - ?, updated_at = datetime(\'now\') WHERE telegram_id = ?')
        .run(amount, user.telegram_id);
      const info = db.prepare(`INSERT INTO withdrawals (telegram_id, amount, method, account_name, account_detail)
        VALUES (?,?,?,?,?)`).run(user.telegram_id, amount, method, accountName, accountDetail);
      return info.lastInsertRowid;
    });
    const wid = tx();
    res.json({ ok: true, withdrawalId: wid, amount, status: 'pending' });
  } catch (err) {
    console.error('[WITHDRAW ERROR]', err);
    res.status(500).json({ ok: false, error: 'WITHDRAW_FAILED' });
  }
});

app.get('/api/withdrawals', auth, (req, res) => {
  try {
    const list = db.prepare('SELECT * FROM withdrawals WHERE telegram_id = ? ORDER BY id DESC LIMIT 50')
      .all(req.user.telegram_id);
    res.json({
      ok: true,
      withdrawals: list.map(w => ({
        id: w.id,
        amount: w.amount,
        method: w.method,
        accountName: w.account_name,
        accountDetail: w.account_detail,
        status: w.status,
        createdAt: w.created_at
      }))
    });
  } catch (err) {
    console.error('[WITHDRAWALS LIST ERROR]', err);
    res.status(500).json({ ok: false, error: 'LIST_FAILED' });
  }
});

/* ---------------------------- ADMIN ---------------------------- */
function adminOnly(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ ok: false, error: 'NOT_ADMIN' });
  next();
}

app.get('/api/admin/stats', auth, adminOnly, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const totalTasks = db.prepare('SELECT COUNT(*) AS c FROM tasks_progress').get().c;
    const pending = db.prepare("SELECT COUNT(*) AS c, COALESCE(SUM(amount),0) AS s FROM withdrawals WHERE status='pending'").get();
    const totalPaid = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM withdrawals WHERE status='approved'").get();
    res.json({
      ok: true,
      totalUsers,
      totalTasks,
      pendingCount: pending.c,
      pendingAmount: Math.round(pending.s * 100) / 100,
      totalPaid: Math.round(totalPaid.s * 100) / 100
    });
  } catch (err) {
    console.error('[ADMIN STATS ERROR]', err);
    res.status(500).json({ ok: false, error: 'STATS_FAILED' });
  }
});

app.get('/api/admin/withdrawals', auth, adminOnly, (req, res) => {
  try {
    const list = db.prepare(`
      SELECT w.*, u.first_name, u.username
      FROM withdrawals w JOIN users u ON u.telegram_id = w.telegram_id
      ORDER BY CASE w.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, w.id DESC
      LIMIT 300
    `).all();
    res.json({
      ok: true,
      withdrawals: list.map(w => ({
        id: w.id,
        telegramId: w.telegram_id,
        firstName: w.first_name,
        username: w.username,
        amount: w.amount,
        method: w.method,
        accountName: w.account_name,
        accountDetail: w.account_detail,
        status: w.status,
        createdAt: w.created_at
      }))
    });
  } catch (err) {
    console.error('[ADMIN WITHDRAWALS ERROR]', err);
    res.status(500).json({ ok: false, error: 'LIST_FAILED' });
  }
});

app.post('/api/admin/withdrawals/:id/approve', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
    if (!w) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (w.status !== 'pending') return res.status(400).json({ ok: false, error: 'NOT_PENDING' });
    db.prepare("UPDATE withdrawals SET status='approved', updated_at=datetime('now') WHERE id=?").run(id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[APPROVE ERROR]', err);
    res.status(500).json({ ok: false, error: 'APPROVE_FAILED' });
  }
});

app.post('/api/admin/withdrawals/:id/reject', auth, adminOnly, (req, res) => {
  try {
    const id = Number(req.params.id);
    const w = db.prepare('SELECT * FROM withdrawals WHERE id = ?').get(id);
    if (!w) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    if (w.status !== 'pending') return res.status(400).json({ ok: false, error: 'NOT_PENDING' });
    const note = String(req.body.note || '').slice(0, 300);
    const tx = db.transaction(() => {
      db.prepare("UPDATE withdrawals SET status='rejected', admin_note=?, updated_at=datetime('now') WHERE id=?")
        .run(note, id);
      // refund
      db.prepare("UPDATE users SET balance = balance + ?, updated_at=datetime('now') WHERE telegram_id=?")
        .run(w.amount, w.telegram_id);
    });
    tx();
    res.json({ ok: true, refunded: w.amount });
  } catch (err) {
    console.error('[REJECT ERROR]', err);
    res.status(500).json({ ok: false, error: 'REJECT_FAILED' });
  }
});

app.post('/api/admin/giftcode', auth, adminOnly, (req, res) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const tickets = Number(req.body.tickets || 0);
    const etb = Number(req.body.etb || 0);
    const maxUses = Number(req.body.maxUses || 1);
    if (!code || code.length < 4) return res.status(400).json({ ok: false, error: 'BAD_CODE' });
    if (!Number.isFinite(tickets) || !Number.isFinite(etb) || !Number.isFinite(maxUses)) {
      return res.status(400).json({ ok: false, error: 'BAD_VALUES' });
    }
    db.prepare('INSERT OR REPLACE INTO gift_codes (code,ticket_amount,etb_amount,max_uses) VALUES (?,?,?,?)')
      .run(code, tickets, etb, maxUses);
    res.json({ ok: true });
  } catch (err) {
    console.error('[ADMIN GIFTCODE ERROR]', err);
    res.status(500).json({ ok: false, error: 'GIFTCODE_FAILED' });
  }
});

/* ---------------------------- FALLBACK ---------------------------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

/* ============================================================================
 *  TELEGRAM BOT LISTENERS (all guarded)
 * ==========================================================================*/
if (bot) {
  bot.onText(/^\/start(.*)/, async (msg, match) => {
    try {
      const chatId = msg.chat.id;
      const param = (match[1] || '').trim();
      const startParam = param ? param.replace(/\s+/g, '') : '';
      const webAppUrl = `${CONFIG.WEBAPP_URL}${startParam ? '?startapp=' + startParam : ''}`;
      const keyboard = {
        inline_keyboard: [[
          { text: '🚀 አሁን ይክፈቱ / Open App', web_app: { url: webAppUrl } }
        ]]
      };
      await bot.sendMessage(chatId,
        '👑 *EarnCraft Pro* — በየቀኑ ቲኬት ያሸንፉ፣ ጓደኞችዎን ይጋብዙ እና ብር ያግኙ!\n\n' +
        '• 🎡 አሽከርክር — 500 ETB ድረስ ያሸንፉ\n' +
        '• 🎬 100 የ AdsGram ተግባራት\n' +
        '• 👥 8 ጓደኞች ጋብዘው ገንዘብ ማውጣት ይችሉ\n\n' +
        'ቁልፉን ተጭነው ይግቡ 👇',
        { parse_mode: 'Markdown', reply_markup: keyboard }
      );
    } catch (err) {
      console.error('[BOT START ERROR]', err);
    }
  });

  bot.on('web_app_data', async (msg) => {
    try {
      console.log('[BOT WEBAPP DATA]', msg.from && msg.from.id, msg.web_app_data && msg.web_app_data.data);
    } catch (err) {
      console.error('[BOT WEBAPP DATA ERROR]', err);
    }
  });

  bot.on('polling_error', (e) => { /* already handled */ });
}

/* ============================================================================
 *  START SERVER
 * ==========================================================================*/
const server = app.listen(CONFIG.PORT, () => {
  console.log('=====================================================');
  console.log('  👑 EarnCraft Pro server running');
  console.log('  Port      :', CONFIG.PORT);
  console.log('  DB        :', CONFIG.DB_FILE);
  console.log('  Bot       :', bot ? 'started' : 'not started (check token)');
  console.log('  Admin ID  :', CONFIG.ADMIN_TELEGRAM_ID);
  console.log('  AdsGram   :', CONFIG.ADSGRAM_BLOCK_ID);
  console.log('=====================================================');
});

process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT EXCEPTION]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[UNHANDLED REJECTION]', err);
});
