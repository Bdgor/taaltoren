// server.js (production, domain-only, Android/Capacitor ready)
require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const bcrypt = require("bcrypt");
const connection = require("./db");

const app = express();
const server = http.createServer(app);

// --- CORS (гнучкий allowlist + лог походження) ---
const allowlist = [
  'https://terminusapp.nl',
  'https://www.terminusapp.nl',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  'http://127.0.0.1'
];

function isAllowedOrigin(origin) {
  if (!origin) return true;                       // curl / серверні запити
  if (allowlist.includes(origin)) return true;
  if (origin.endsWith('.terminusapp.nl')) return true;         // сабдомени
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;  // localhost з портом
  if (/^capacitor:\/\//.test(origin)) return true;              // всі capacitor://
  return false;
}

const corsOptions = {
  origin: (origin, cb) => {
    if (isAllowedOrigin(origin)) return cb(null, true);
    console.warn('CORS blocked Origin:', origin); // лог для діагностики
    return cb(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Socket.IO з CORS
const io = new Server(server, {
  cors: {
    origin: (origin, cb) => {
      if (isAllowedOrigin(origin)) return cb(null, true);
      console.warn('Socket.IO blocked Origin:', origin);
      return cb(new Error('Not allowed by CORS (socket.io)'));
    },
    methods: ["GET", "POST"]
  }
});

// Парсери та статика
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // у т.ч. /uploads

// Легке логування кожного HTTP-запиту (допомагає діагностувати з додатку)
app.use((req, _res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path} Origin=${req.headers.origin || "-"} UA=${req.headers["user-agent"] || "-"}`
  );
  next();
});

// ===================== ТЕСТ/HEALTH =====================
app.get("/ping-db", async (_req, res) => {
  try {
    const [rows] = await connection.query("SELECT 1 + 1 AS solution");
    res.send("MySQL працює! 1+1=" + rows[0].solution);
  } catch (err) {
    res.status(500).send("Помилка MySQL: " + err.message);
  }
});

// простий health для Android/Capacitor/моніторингу
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// детальний health (з перевіркою БД)
app.get("/healthz", async (_req, res) => {
  try {
    const [r] = await connection.query("SELECT 1 AS ok");
    res.json({ ok: true, db: r[0]?.ok === 1, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// залишаємо твій існуючий для сумісності
app.get("/__health", async (_req, res) => {
  try {
    const [r] = await connection.query("SELECT 1 AS ok");
    res.json({ ok: true, db: r[0]?.ok === 1, ts: Date.now() });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ===================== УТИЛІТИ =====================
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token" });
  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload.role !== "admin") throw new Error("Not admin");
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

// Папка для фонів
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `bg-${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10 МБ
});

// ===================== АДМІН: ЛОГІН =====================
app.post("/admin/login", (req, res) => {
  const { password } = req.body;
  if (!password) return res.status(400).json({ error: "Password required" });
  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.ADMIN_JWT_SECRET, { expiresIn: "12h" });
  res.json({ token });
});

// ===================== АДМІН: НАЛАШТУВАННЯ (тема/фон) =====================
app.get("/admin/settings", requireAdmin, async (_req, res) => {
  try {
    const [rows] = await connection.query("SELECT theme, bg_image_url FROM settings WHERE id=1");
    const row = rows[0] || {};
    let theme = { mode: "light", primary: "#0ea5e9" };
    try { if (row.theme) theme = JSON.parse(row.theme); } catch {}
    res.json({ theme, bg_image_url: row.bg_image_url || null });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.put("/admin/settings/theme", requireAdmin, async (req, res) => {
  try {
    const theme = req.body.theme || {};
    await connection.query("UPDATE settings SET theme=? WHERE id=1", [JSON.stringify(theme)]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/admin/settings/background", requireAdmin, upload.single("background"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const publicPath = "/uploads/" + req.file.filename;
    await connection.query("UPDATE settings SET bg_image_url=? WHERE id=1", [publicPath]);
    res.json({ ok: true, bg_image_url: publicPath });
  } catch (e) {
    res.status(500).json({ error: "DB error" });
  }
});

// Публічне читання налаштувань (для фронту)
app.get("/settings/public", async (_req, res) => {
  try {
    const [rows] = await connection.query("SELECT theme, bg_image_url FROM settings WHERE id=1");
    const row = rows[0] || {};
    let theme = { mode: "light", primary: "#0ea5e9" };
    try { if (row.theme) theme = JSON.parse(row.theme); } catch {}
    res.json({ theme, bg_image_url: row.bg_image_url || null });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// ===================== WORDS CRUD =====================
app.get("/admin/words", requireAdmin, async (req, res) => {
  try {
    const { level } = req.query;
    const sql = level ? "SELECT * FROM words WHERE level=? ORDER BY id DESC"
                      : "SELECT * FROM words ORDER BY id DESC";
    const params = level ? [level] : [];
    const [rows] = await connection.query(sql, params);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.post("/admin/words", requireAdmin, async (req, res) => {
  try {
    const { ua, nl_correct, nl_wrong1, nl_wrong2, level } = req.body;
    if (!ua || !nl_correct || !nl_wrong1 || !nl_wrong2) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const [result] = await connection.query(
      "INSERT INTO words (ua, nl_correct, nl_wrong1, nl_wrong2, level) VALUES (?,?,?,?,?)",
      [ua, nl_correct, nl_wrong1, nl_wrong2, level || "A0"]
    );
    res.json({ ok: true, id: result.insertId });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.put("/admin/words/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { ua, nl_correct, nl_wrong1, nl_wrong2, level } = req.body;
    await connection.query(
      "UPDATE words SET ua=?, nl_correct=?, nl_wrong1=?, nl_wrong2=?, level=? WHERE id=?",
      [ua, nl_correct, nl_wrong1, nl_wrong2, level || "A0", id]
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

app.delete("/admin/words/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await connection.query("DELETE FROM words WHERE id=?", [id]);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "DB error" });
  }
});

// Сторінка адмінки
app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ===================== API КОРИСТУВАЧІВ =====================
app.get("/api/users", async (_req, res) => {
  try {
    const [results] = await connection.query(
      "SELECT id, username, email, points, created_at FROM users"
    );
    res.json({ ok: true, users: results });
  } catch {
    res.status(500).json({ ok: false, msg: "DB error" });
  }
});

app.post("/api/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ ok: false, msg: "Всі поля обовʼязкові" });

  try {
    const [existing] = await connection.query(
      "SELECT id FROM users WHERE username=? OR email=?",
      [username, email]
    );
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, msg: "Логін або e-mail вже існує" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.query(
      "INSERT INTO users (username, email, password_hash, points) VALUES (?, ?, ?, 0)"
      , [username, email, hashedPassword]
    );
    res.json({ ok: true, msg: "Користувача зареєстровано" });
  } catch {
    res.status(500).json({ ok: false, msg: "DB error" });
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, msg: "Введіть логін та пароль" });

  try {
    const [results] = await connection.query(
      "SELECT * FROM users WHERE username = ?",
      [username]
    );
    if (results.length === 0) return res.status(400).json({ ok: false, msg: "Користувача не знайдено" });

    const user = results[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(400).json({ ok: false, msg: "Невірний пароль" });

    res.json({
      ok: true,
      msg: "Вхід успішний",
      user: { id: user.id, username: user.username, email: user.email, points: user.points }
    });
  } catch {
    res.status(500).json({ ok: false, msg: "DB error" });
  }
});

// ===================== API: ДОДАТИ ОЧКИ =====================
app.post("/api/add-points", async (req, res) => {
  const { username, level, points } = req.body;
  if (!username || !level || typeof points !== "number" || points <= 0) {
    return res.status(400).json({ ok: false, msg: "Неправильні вхідні дані" });
  }

  try {
    const [result] = await connection.query(
      "UPDATE users SET points = points + ? WHERE username = ?",
      [points, username]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, msg: "Користувач не знайдений" });
    }

    // Оновити глобальний рейтинг у файлі
    scoresGlobal = loadGlobalScores();
    if (!scoresGlobal[level]) scoresGlobal[level] = {};
    scoresGlobal[level][username] = (scoresGlobal[level][username] || 0) + points;

    try { saveGlobalScores(scoresGlobal); } catch (e) { console.error("Помилка збереження глобального рейтингу:", e); }

    io.emit("sync", { scoresSession, scoresGlobal });
    res.json({ ok: true, msg: `Додано ${points} очок користувачу ${username}` });
  } catch {
    res.status(500).json({ ok: false, msg: "Помилка оновлення в базі даних" });
  }
});

// ===================== РЕЙТИНГ (файлова частина) =====================
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");

function loadGlobalScores() {
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      return JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf-8"));
    }
  } catch (e) {
    console.error("Помилка читання global_scores.json:", e);
  }
  return { A0: {}, A1: {}, A2: {} };
}

function saveGlobalScores(scoresGlobal) {
  try {
    fs.writeFileSync(GLOBAL_FILE, JSON.stringify(scoresGlobal, null, 2), "utf-8");
  } catch (e) {
    console.error("Помилка запису global_scores.json:", e);
  }
}

let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = loadGlobalScores();
let timer = 900;
let interval = null;

// публічний знімок рейтингу для стартового рендера
app.get("/scores/public", (_req, res) => {
  res.json({ scoresSession, scoresGlobal, timer });
});

function startTimer() {
  if (interval) return;
  interval = setInterval(() => {
    timer--;
    io.emit("tick", { timer });
    if (timer <= 0) {
      scoresSession = { A0: {}, A1: {}, A2: {} };
      timer = 900;
      io.emit("clear");
      io.emit("sync", { scoresSession, scoresGlobal });
    }
  }, 1000);
}

// ===================== SOCKET.IO =====================
io.on("connection", (socket) => {
  socket.emit("sync", { scoresSession, scoresGlobal });
  socket.emit("tick", { timer });
  startTimer();

  socket.on("add-block", async ({ user, level }) => {
    if (!user || !level) return;

    if (!scoresSession[level][user]) scoresSession[level][user] = 0;
    scoresSession[level][user]++;
    if (!scoresGlobal[level][user]) scoresGlobal[level][user] = 0;
    scoresGlobal[level][user]++;

    try {
      await connection.query("UPDATE users SET points = points + 1 WHERE username = ?", [user]);
    } catch (err) {
      console.error("MySQL update error:", err);
    }

    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("sub-block", async ({ user, level, minus }) => {
    if (!user || !level) return;

    let m = Math.abs(Number(minus) || 1);
    if (!scoresSession[level][user]) scoresSession[level][user] = 0;
    scoresSession[level][user] = Math.max(0, scoresSession[level][user] - m);
    if (!scoresGlobal[level][user]) scoresGlobal[level][user] = 0;
    scoresGlobal[level][user] = Math.max(0, scoresGlobal[level][user] - m);

    try {
      await connection.query("UPDATE users SET points = GREATEST(points - ?, 0) WHERE username = ?", [m, user]);
    } catch (err) {
      console.error("MySQL update error:", err);
    }

    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });
});

// ===================== ЗАПУСК =====================
const PORT = process.env.PORT || 3000;
// слухаємо на 0.0.0.0 (обов'язково для зовнішніх підключень)
server.listen(PORT, "0.0.0.0", () => {
  console.log("Сервер працює на порті " + PORT);
});

