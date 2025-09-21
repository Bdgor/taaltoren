// server.js — БД, сесії, авторизація, reset password, статика, захист сторінок + ГРА (CSV A0–C1, рейтинг, автомат)
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const http = require('http');
const crypto = require('crypto');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');

// ── 1) App & HTTP server
const app = express();
const server = http.createServer(app);

// ── 2) Middlewares
app.disable('x-powered-by');
app.set('trust proxy', 1); // важливо за проксі/HTTPS

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// CORS
const ALLOW_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',').map(s => s.trim()).filter(Boolean);
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || ALLOW_ORIGINS.includes('*') || ALLOW_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── 3) MySQL pool + session store
const dbCfg = {
  host    : process.env.DB_HOST || '127.0.0.1',
  port    : Number(process.env.DB_PORT || 3306),
  user    : process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_general_ci'
};
const pool = mysql.createPool(dbCfg);

const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: dbCfg.host,
  port: dbCfg.port,
  user: dbCfg.user,
  password: dbCfg.password,
  database: dbCfg.database,
  clearExpired: true,
  checkExpirationInterval: 15 * 60 * 1000,
  expiration: 24 * 60 * 60 * 1000
});

const isProd = process.env.NODE_ENV === 'production';
app.use(session({
  key: 'tt.sid',
  secret: process.env.SESSION_SECRET || 'change_me',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',              // якщо крос-домен + HTTPS: розглянь 'none' та secure:true
    secure: !!isProd,             // true у проді з HTTPS
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ── 4) Ensure tables (разово на старті; IF NOT EXISTS — безпечно)
const CREATE_USERS_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(120) DEFAULT NULL,
  role          ENUM('user','admin') NOT NULL DEFAULT 'user',
  is_verified   TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
`;
const CREATE_PASSWORD_RESETS_SQL = `
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  email       VARCHAR(190) NOT NULL,
  token       VARCHAR(128) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at  DATETIME NOT NULL,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  INDEX (email),
  INDEX (token)
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
`;
const CREATE_USER_STATS_SQL = `
CREATE TABLE IF NOT EXISTS user_stats (
  user_id INT PRIMARY KEY,
  score INT NOT NULL DEFAULT 0,     -- особисті очки (гра слів)
  total INT NOT NULL DEFAULT 0,     -- загальна сума (глобальний рейтинг)
  balance INT NOT NULL DEFAULT 0,   -- баланс автомата
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_stats_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
`;
const CREATE_GAME_ROUNDS_SQL = `
CREATE TABLE IF NOT EXISTS game_rounds (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  bet INT NOT NULL,
  outcome ENUM('win','lose','none') NOT NULL DEFAULT 'none',
  prize INT NOT NULL DEFAULT 0,
  reels VARCHAR(64) NOT NULL,
  delta INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_game_rounds_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX(user_id), INDEX(created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;
`;

async function ensureTables(){
  await pool.query(CREATE_USERS_SQL);
  await pool.query(CREATE_PASSWORD_RESETS_SQL);
  await pool.query(CREATE_USER_STATS_SQL);
  await pool.query(CREATE_GAME_ROUNDS_SQL);
}
ensureTables().catch(e => { console.error('[DB] Ensure tables failed:', e); process.exit(1); });

// ── 5) Health
app.get('/api/health/db', async (_req, res) => {
  try {
    const [r] = await pool.query('SELECT 1 AS ok');
    const [t] = await pool.query("SHOW TABLES LIKE 'users'");
    res.json({ ok: true, db: r?.[0]?.ok === 1, usersTable: t.length > 0 });
  } catch (e) {
    res.status(500).json({ ok:false, error:'db_failed', detail:String(e.message||e) });
  }
});
app.get('/api/health/app', (_req, res) => {
  res.json({ ok:true, uptime: process.uptime(), time: new Date().toISOString() });
});

// ── 6) Auth helpers
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (req.accepts('json') && !req.accepts('html')) {
    return res.status(401).json({ ok:false, error:'unauthorized' });
  }
  return res.redirect('/login');
}
function authOnly(req,res,next){ return req.session?.user ? next() : res.status(401).json({ ok:false, error:'unauthorized' }); }
async function getOrCreateStats(userId){
  const [r] = await pool.query('SELECT * FROM user_stats WHERE user_id=? LIMIT 1',[userId]);
  if (r.length) return r[0];
  await pool.query('INSERT INTO user_stats (user_id) VALUES (?)',[userId]);
  const [r2] = await pool.query('SELECT * FROM user_stats WHERE user_id=? LIMIT 1',[userId]);
  return r2[0];
}

// ── 7) Protected pages (перехопити ДО статики)
const PROTECTED_PAGES = new Set([
  '/home.html',
  '/words-levels.html',
  '/words.html',
  '/sentences.html',
  '/dialogs.html',
  '/tests.html',
  '/game-words.html',
  '/leaderboard.html'
]);
app.use((req, res, next) => {
  if (req.method === 'GET' && PROTECTED_PAGES.has(req.path)) {
    return requireAuth(req, res, next);
  }
  next();
});

// ── 8) Auth API
app.post('/api/register', async (req, res) => {
  try {
    let { name, email, password, password2 } = req.body || {};
    email = String(email||'').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ ok:false, error:'email_password_required' });
    if (password2 !== undefined && password2 !== password) {
      return res.status(400).json({ ok:false, error:'password_mismatch' });
    }
    const [ex] = await pool.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
    if (ex.length) return res.status(409).json({ ok:false, error:'email_exists' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO users (email, password_hash, name, role, is_verified) VALUES (?,?,?,?,?)',
      [email, hash, name || null, 'user', 1]
    );
    res.json({ ok:true });
  } catch (e) {
    console.error('register', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    let { email, password } = req.body || {};
    email = String(email||'').trim().toLowerCase();
    if (!email || !password) return res.status(400).json({ ok:false, error:'email_password_required' });

    const [rows] = await pool.query(
      'SELECT id,email,password_hash,name,role,is_verified FROM users WHERE email=? LIMIT 1',
      [email]
    );
    if (!rows.length) return res.status(401).json({ ok:false, error:'invalid_credentials' });

    const u = rows[0];
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ ok:false, error:'invalid_credentials' });
    if (!u.is_verified) return res.status(403).json({ ok:false, error:'email_not_verified' });

    req.session.user = { id:u.id, email:u.email, name:u.name, role:u.role };
    await getOrCreateStats(u.id); // гарантуємо наявність статистики
    res.json({ ok:true, user: req.session.user });
  } catch (e) {
    console.error('login', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session?.destroy?.(() => res.json({ ok:true }));
});

app.get('/api/me', (req, res) => {
  if (!req.session?.user) return res.status(401).json({ ok:false, error:'unauthorized' });
  res.json({ ok:true, user: req.session.user });
});

// ── 9) Password Reset API
app.post('/api/request-password-reset', async (req, res) => {
  try {
    let { email } = req.body || {};
    email = String(email||'').trim().toLowerCase();
    if (!email) return res.status(400).json({ ok:false, error:'email_required' });

    const [u] = await pool.query('SELECT id FROM users WHERE email=? LIMIT 1', [email]);
    if (!u.length) return res.json({ ok:true, sent:true }); // не палимо існування

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30*60*1000); // 30 хв
    await pool.query('INSERT INTO password_resets (email, token, expires_at) VALUES (?,?,?)', [email, token, expiresAt]);

    const devPayload = isProd ? {} : { token }; // у DEV повертаємо токен
    res.json({ ok:true, sent:true, ...devPayload });
  } catch (e) {
    console.error('request-password-reset', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

app.post('/api/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ ok:false, error:'token_password_required' });

    const [rows] = await pool.query('SELECT email, expires_at, used FROM password_resets WHERE token=? LIMIT 1',[token]);
    if (!rows.length) return res.status(400).json({ ok:false, error:'invalid_token' });

    const pr = rows[0];
    if (pr.used) return res.status(400).json({ ok:false, error:'token_used' });
    if (new Date(pr.expires_at).getTime() < Date.now()) return res.status(400).json({ ok:false, error:'token_expired' });

    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password_hash=? WHERE email=? LIMIT 1', [hash, pr.email]);
    await pool.query('UPDATE password_resets SET used=1 WHERE token=? LIMIT 1', [token]);

    res.json({ ok:true, changed:true });
  } catch (e) {
    console.error('reset-password', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

// ── 10) ГРА “Збірка слів” (CSV A0–C1), рейтинг, автомат
const DATA_DIR = process.env.WORDS_DIR || path.join(__dirname, 'public', 'data');
const wordsCache = new Map(); // level -> rows

function loadCsvRows(filePath){
  const raw = fs.readFileSync(filePath, 'utf8');
  const lines = raw.split(/\r?\n/).filter(l => l.trim().length);
  const header = lines.shift();
  const cols = header.split(',');
  const idx = {
    ua : cols.indexOf('ua'),
    c  : cols.indexOf('nl_correct'),
    w1 : cols.indexOf('nl_wrong1'),
    w2 : cols.indexOf('nl_wrong2'),
  };
  if (idx.ua<0 || idx.c<0 || idx.w1<0 || idx.w2<0) {
    throw new Error('CSV header must be: ua,nl_correct,nl_wrong1,nl_wrong2');
  }
  const rows = [];
  for (const line of lines){
    const parts = line.split(',');
    if (parts.length < 4) continue;
    rows.push({
      ua: parts[idx.ua].trim(),
      correct: parts[idx.c].trim(),
      wrong1: parts[idx.w1].trim(),
      wrong2: parts[idx.w2].trim(),
    });
  }
  return rows;
}
function getWordsForLevel(level){
  const key = (level || 'A0').toUpperCase();
  if (wordsCache.has(key)) return wordsCache.get(key);
  const candidates = [
    path.join(DATA_DIR, `words-${key}.csv`),
    path.join(DATA_DIR, 'words.csv')
  ];
  for (const fp of candidates){
    if (fs.existsSync(fp)) {
      const rows = loadCsvRows(fp);
      wordsCache.set(key, rows);
      return rows;
    }
  }
  return [];
}
function shuffle(arr){ const a=[...arr]; for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }
function pickOne(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

// GET /api/words/question?level=A1
app.get('/api/words/question', authOnly, async (req, res) => {
  try{
    const level = String(req.query.level || 'A0').toUpperCase();
    const rows = getWordsForLevel(level);
    if (!rows.length) return res.status(404).json({ ok:false, error:'no_words_for_level' });

    const row = pickOne(rows);
    const options = shuffle([row.correct, row.wrong1, row.wrong2]).map(t => ({ text:t }));
    const key = Buffer.from(`${row.ua}::${row.correct}`).toString('base64');

    res.json({ ok:true, question: { key, prompt: row.ua, options } });
  }catch(e){
    console.error('words/question', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

// POST /api/words/answer { key, choice, level }
app.post('/api/words/answer', authOnly, async (req, res) => {
  try{
    const userId = req.session.user.id;
    const { key, choice } = req.body || {};
    if (!key || !choice) return res.status(400).json({ ok:false, error:'bad_payload' });

    const decoded = Buffer.from(String(key), 'base64').toString('utf8');
    const [ua, correct] = decoded.split('::');
    const isCorrect = String(choice).trim() === String(correct).trim();

    const delta = isCorrect ? 1 : -1;
    await pool.query(
      'INSERT INTO user_stats (user_id, score) VALUES (?,0) ON DUPLICATE KEY UPDATE score=score+?',
      [userId, delta]
    );
    const [s] = await pool.query('SELECT score,balance,total FROM user_stats WHERE user_id=?',[userId]);
    res.json({ ok:true, correct: isCorrect, stats: s[0] });
  }catch(e){
    console.error('words/answer', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

// Діагностика CSV
app.get('/api/words/health', authOnly, (req,res)=>{
  const out = ['A0','A1','A2','B1','B2','C1'].map(lv=>{
    const file1 = path.join(DATA_DIR, `words-${lv}.csv`);
    const file2 = path.join(DATA_DIR, 'words.csv');
    const picked = fs.existsSync(file1) ? file1 : (fs.existsSync(file2) ? file2 : null);
    let rows=0, error=null;
    if (picked){
      try { rows = loadCsvRows(picked).length; } catch(e){ error = String(e.message||e); }
    }
    return { level:lv, file:picked, rows, error };
  });
  res.json({ ok:true, dataDir: DATA_DIR, levels: out });
});

// Баланс/ставка/вивід/рейтинг
app.get('/api/my-stats', authOnly, async (req,res)=>{
  const st = await getOrCreateStats(req.session.user.id);
  res.json({ ok:true, stats: st });
});

// deposit: з score -> balance
app.post('/api/game/deposit', authOnly, async (req,res)=>{
  try{
    const userId = req.session.user.id;
    const amount = Math.max(0, parseInt(req.body?.amount||0));
    if (amount <= 0) return res.status(400).json({ ok:false, error:'bad_amount' });

    const conn = await pool.getConnection();
    try{
      await conn.beginTransaction();
      const [s] = await conn.query('SELECT score,balance FROM user_stats WHERE user_id=? FOR UPDATE',[userId]);
      const st = s[0] || { score:0, balance:0 };
      if (st.score < amount) throw new Error('insufficient_score');
      await conn.query('UPDATE user_stats SET score=score-?, balance=balance+? WHERE user_id=?',[amount, amount, userId]);
      await conn.commit();
    }catch(err){ await conn.rollback(); return res.status(400).json({ ok:false, error: err.message }); }
    finally{ conn.release(); }
    const [r] = await pool.query('SELECT score,balance,total FROM user_stats WHERE user_id=?',[userId]);
    res.json({ ok:true, stats:r[0] });
  }catch(e){ res.status(500).json({ ok:false, error:'server_error' }); }
});

// withdraw: з balance -> total
app.post('/api/game/withdraw', authOnly, async (req,res)=>{
  try{
    const userId = req.session.user.id;
    const amount = Math.max(0, parseInt(req.body?.amount||0));
    if (amount <= 0) return res.status(400).json({ ok:false, error:'bad_amount' });

    const conn = await pool.getConnection();
    try{
      await conn.beginTransaction();
      const [s] = await conn.query('SELECT balance,total FROM user_stats WHERE user_id=? FOR UPDATE',[userId]);
      const st = s[0] || { balance:0, total:0 };
      if (st.balance < amount) throw new Error('insufficient_balance');
      await conn.query('UPDATE user_stats SET total=total+?, balance=balance-? WHERE user_id=?',[amount, amount, userId]);
      await conn.commit();
    }catch(err){ await conn.rollback(); return res.status(400).json({ ok:false, error: err.message }); }
    finally{ conn.release(); }
    const [r] = await pool.query('SELECT score,balance,total FROM user_stats WHERE user_id=?',[userId]);
    res.json({ ok:true, stats:r[0] });
  }catch(e){ res.status(500).json({ ok:false, error:'server_error' }); }
});

// === SLOT MACHINE CONFIG ===
const SLOT_SYMBOLS = [
  'star',    // ⭐
  'banana',  // 🍌
  'cherry',  // 🍒
  'lemon',   // 🍋
  'grape',   // 🍇
  'bell',    // 🔔
  'clover',  // 🍀
  'gem',     // 💎
  'seven'    // 7️⃣
];

// ваги рідкісності (що менша вага — то рідше)
const SYMBOL_WEIGHTS = {
  star:   10,
  banana: 8,
  cherry: 14,
  lemon:  14,
  grape:  14,
  bell:   8,
  clover: 8,
  gem:    6,
  seven:  2  // дуже рідко
};

// обчислення призу за правилами
function payoutFor(reels) {
  const cnt = reels.reduce((m,s)=> (m[s]=(m[s]||0)+1, m), {});
  let prize = 0;

  // ⭐ зірочки
  if (cnt.star === 3) prize = Math.max(prize, 50);
  else if (cnt.star === 2) prize = Math.max(prize, 10);
  else if (cnt.star === 1) prize = Math.max(prize, 5);

  // 🍌 банани
  if (cnt.banana === 3) prize = Math.max(prize, 100);
  else if (cnt.banana === 2) prize = Math.max(prize, 50);
  else if (cnt.banana === 1) prize = Math.max(prize, 5);

  // 7️⃣ сімірки
  if (cnt.seven === 3) prize = Math.max(prize, 200);

  return prize;
}

// вибір символу з урахуванням ваг
function weightedPick() {
  const total = Object.values(SYMBOL_WEIGHTS).reduce((a,b)=>a+b,0);
  let r = Math.random()*total;
  for (const s of SLOT_SYMBOLS){
    r -= SYMBOL_WEIGHTS[s];
    if (r <= 0) return s;
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length-1];
}

function spinReels() {
  return [weightedPick(), weightedPick(), weightedPick()];
}

// === API: PLAY === (мін. ставка 10)
app.post('/api/game/play', requireAuth, async (req, res) => {
  try{
    const userId = req.session.user.id;
    const bet = Math.max(10, parseInt(req.body?.bet || 0));
    if (!Number.isFinite(bet) || bet < 10) return res.status(400).json({ ok:false, error:'min_bet_10' });

    // зчитаємо поточний баланс
    const [s] = await pool.query('SELECT score, balance, total FROM user_stats WHERE user_id=? LIMIT 1', [userId]);
    if (!s.length) {
      await pool.query('INSERT INTO user_stats (user_id, score, balance, total) VALUES (?,0,0,0)', [userId]);
      return res.status(400).json({ ok:false, error:'insufficient_balance' });
    }
    const stats = s[0];
    if (Number(stats.balance) < bet) return res.status(400).json({ ok:false, error:'insufficient_balance' });

    // крутимо
    const reels = spinReels();
    const prize = payoutFor(reels); // фіксовані очки за комбінацію

    // списуємо ставку і додаємо приз
    const delta = -bet + prize;
    await pool.query('UPDATE user_stats SET balance = balance + ? WHERE user_id=?', [delta, userId]);

    // лог гри (опц.)
    await pool.query(
      'INSERT INTO game_rounds (user_id, bet, outcome, prize, reels, delta) VALUES (?,?,?,?,?,?)',
      [userId, bet, prize>0?'win':(bet>0?'lose':'none'), prize, reels.join(','), delta]
    );

    // повертаємо свіжі показники
    const [s2] = await pool.query('SELECT score, balance, total FROM user_stats WHERE user_id=? LIMIT 1', [userId]);
    const out = s2[0];

    res.json({ ok:true, reels, prize, bet, stats: out });
  }catch(e){
    console.error('game/play', e);
    res.status(500).json({ ok:false, error:'server_error' });
  }
});

// Leaderboard: топ-50 по total
app.get('/api/leaderboard', async (_req,res)=>{
  try{
    const [rows] = await pool.query(`
      SELECT u.id, COALESCE(NULLIF(u.name,''), SUBSTRING_INDEX(u.email,'@',1)) AS name, s.total
      FROM users u JOIN user_stats s ON s.user_id = u.id
      ORDER BY s.total DESC, u.id ASC
      LIMIT 50
    `);
    res.json({ ok:true, items: rows });
  }catch(e){ res.status(500).json({ ok:false, error:'server_error' }); }
});

// ── 11) Static files
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

app.get('/ugoda',    (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'privacy.html')));
app.get('/register', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'register.html')));
app.get('/login',    (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/reset',    (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'reset.html')));

// ── 12) 404 для API
app.use('/api', (_req, res) => res.status(404).json({ ok:false, error:'NOT_FOUND' }));

// ── 13) SPA fallback (опц.)
if (process.env.SPA_INDEX === '1') {
  const indexFile = path.join(PUBLIC_DIR, 'index.html');
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (['/login','/register','/ugoda','/privacy.html'].includes(req.path)) return next();
    res.sendFile(indexFile, err => err && next());
  });
}

// ── 14) Start
const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`[OK] Server listening on http://${HOST}:${PORT}`);
});

// ── 15) Graceful shutdown
function shutdown(sig){
  console.log(`[${sig}] Shutting down...`);
  server.close(() => {
    console.log('HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 5000).unref();
}
['SIGINT','SIGTERM'].forEach(s => process.on(s, () => shutdown(s)));
