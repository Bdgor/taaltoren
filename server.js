const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const connection = require('./db'); // твій MySQL коннект
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Тестовий маршрут для перевірки MySQL ---
app.get('/ping-db', async (req, res) => {
  try {
    const [results] = await connection.promise().query('SELECT 1 + 1 AS solution');
    res.send('MySQL працює! 1+1=' + results[0].solution);
  } catch (err) {
    res.status(500).send('Помилка MySQL: ' + err.message);
  }
});

// --- Отримати всіх користувачів ---
app.get('/api/users', async (req, res) => {
  try {
    const [results] = await connection.promise().query('SELECT id, username, email, points, created_at FROM users');
    res.json({ ok: true, users: results });
  } catch (err) {
    res.status(500).json({ ok: false, msg: 'DB error' });
  }
});

// --- Реєстрація ---
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ ok: false, msg: 'Всі поля обовʼязкові' });

  try {
    const [existing] = await connection.promise().query('SELECT id FROM users WHERE username=? OR email=?', [username, email]);
    if (existing.length > 0) {
      return res.status(400).json({ ok: false, msg: 'Логін або e-mail вже існує' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.promise().query('INSERT INTO users (username, email, password_hash, points) VALUES (?, ?, ?, 0)', [username, email, hashedPassword]);
    res.json({ ok: true, msg: 'Користувача зареєстровано' });
  } catch (err) {
    res.status(500).json({ ok: false, msg: 'DB error' });
  }
});

// --- Логін ---
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, msg: 'Введіть логін та пароль' });

  try {
    const [results] = await connection.promise().query('SELECT * FROM users WHERE username = ?', [username]);
    if (results.length === 0) return res.status(400).json({ ok: false, msg: 'Користувача не знайдено' });

    const user = results[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(400).json({ ok: false, msg: 'Невірний пароль' });

    res.json({
      ok: true,
      msg: 'Вхід успішний',
      user: { id: user.id, username: user.username, email: user.email, points: user.points }
    });
  } catch (err) {
    res.status(500).json({ ok: false, msg: 'DB error' });
  }
});

// --- Новий ендпоінт для додавання очок ---
app.post('/api/add-points', async (req, res) => {
  const { username, level, points } = req.body;

  if (!username || !level || typeof points !== 'number' || points <= 0) {
    return res.status(400).json({ ok: false, msg: 'Неправильні вхідні дані' });
  }

  try {
    const [result] = await connection.promise().query(
      'UPDATE users SET points = points + ? WHERE username = ?',
      [points, username]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ ok: false, msg: 'Користувач не знайдений' });
    }

    // Оновлення глобального рейтингу у файлі
    scoresGlobal = loadGlobalScores();

    if (!scoresGlobal[level]) scoresGlobal[level] = {};
    scoresGlobal[level][username] = (scoresGlobal[level][username] || 0) + points;

    try {
      saveGlobalScores(scoresGlobal);
    } catch (e) {
      console.error('Помилка збереження глобального рейтингу:', e);
    }

    // Повідомляємо всіх клієнтів про оновлення рейтингу
    io.emit("sync", { scoresSession, scoresGlobal });

    res.json({ ok: true, msg: `Додано ${points} очок користувачу ${username}` });
  } catch (err) {
    res.status(500).json({ ok: false, msg: 'Помилка оновлення в базі даних' });
  }
});

// --- Папка зі статикою (в кінці!) ---
app.use(express.static("public"));

// --- Глобальний рейтинг ---
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");

function loadGlobalScores() {
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      return JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf-8"));
    }
  } catch (e) {
    console.error('Помилка читання global_scores.json:', e);
  }
  return { A0: {}, A1: {}, A2: {} };
}

function saveGlobalScores(scoresGlobal) {
  try {
    fs.writeFileSync(GLOBAL_FILE, JSON.stringify(scoresGlobal, null, 2), "utf-8");
  } catch (e) {
    console.error('Помилка запису global_scores.json:', e);
  }
}

let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = loadGlobalScores();
let timer = 900;
let interval = null;

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

// --- WebSocket ---
io.on("connection", socket => {
  socket.emit("sync", { scoresSession, scoresGlobal });
  socket.emit("tick", { timer });
  startTimer();

  socket.on("add-block", data => {
    const { user, level } = data;
    if (!user || !level) return;

    if (!scoresSession[level][user]) scoresSession[level][user] = 0;
    scoresSession[level][user]++;
    if (!scoresGlobal[level][user]) scoresGlobal[level][user] = 0;
    scoresGlobal[level][user]++;

    // Оновлення в MySQL
    connection.query(
      'UPDATE users SET points = points + 1 WHERE username = ?',
      [user],
      (err) => {
        if (err) console.error('MySQL update error:', err);
      }
    );

    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("sub-block", data => {
    const { user, level, minus } = data;
    if (!user || !level) return;
    let m = Math.abs(Number(minus) || 1);
    if (!scoresSession[level][user]) scoresSession[level][user] = 0;
    scoresSession[level][user] = Math.max(0, scoresSession[level][user] - m);
    if (!scoresGlobal[level][user]) scoresGlobal[level][user] = 0;
    scoresGlobal[level][user] = Math.max(0, scoresGlobal[level][user] - m);

    // Оновлення в MySQL
    connection.query(
      'UPDATE users SET points = GREATEST(points - ?, 0) WHERE username = ?',
      [m, user],
      (err) => {
        if (err) console.error('MySQL update error:', err);
      }
    );

    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("disconnect", () => {});
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log("Сервер працює на порті " + PORT);
});

