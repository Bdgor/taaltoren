const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const connection = require('./db');
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

// --- Тестовий маршрут --- //
app.get('/test-mysql', (req, res) => {
  connection.query('SELECT 1 + 1 AS solution', (err, results) => {
    if (err) return res.status(500).send('Помилка MySQL: ' + err.message);
    res.send('MySQL працює! 1+1=' + results[0].solution);
  });
});

// --- Отримати всіх користувачів --- //
app.get('/api/users', (req, res) => {
  connection.query('SELECT id, username, email, points, created_at FROM users', (err, results) => {
    if (err) return res.status(500).json({ ok: false, msg: 'DB error' });
    res.json({ ok: true, users: results });
  });
});

// --- Реєстрація --- //
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ ok: false, msg: 'Всі поля обовʼязкові' });

  connection.query(
    'SELECT id FROM users WHERE username=? OR email=?',
    [username, email],
    async (err, results) => {
      if (err) return res.status(500).json({ ok: false, msg: 'DB error' });
      if (results.length > 0)
        return res.status(400).json({ ok: false, msg: 'Логін або e-mail вже існує' });

      const hashedPassword = await bcrypt.hash(password, 10);

      connection.query(
        'INSERT INTO users (username, email, password_hash, points) VALUES (?, ?, ?, 0)',
        [username, email, hashedPassword],
        (err2) => {
          if (err2) return res.status(500).json({ ok: false, msg: 'DB error' });
          return res.json({ ok: true, msg: 'Користувача зареєстровано' });
        }
      );
    }
  );
});

// --- Логін --- //
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, msg: 'Введіть логін та пароль' });

  connection.query(
    'SELECT * FROM users WHERE username = ?',
    [username],
    async (err, results) => {
      if (err || results.length === 0)
        return res.status(400).json({ ok: false, msg: 'Користувача не знайдено' });

      const user = results[0];
      const isValid = await bcrypt.compare(password, user.password_hash);
      if (!isValid)
        return res.status(400).json({ ok: false, msg: 'Невірний пароль' });

      res.json({ ok: true, msg: 'Вхід успішний', user: { id: user.id, username: user.username, email: user.email, points: user.points } });
    }
  );
});

// --- Папка зі статикою (в кінці!) --- //
app.use(express.static("public"));

// --- Глобальний рейтинг (залишається у файлі) --- //
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");

function loadGlobalScores() {
  try {
    if (fs.existsSync(GLOBAL_FILE)) {
      return JSON.parse(fs.readFileSync(GLOBAL_FILE, "utf-8"));
    }
  } catch (e) {}
  return { A0: {}, A1: {}, A2: {} };
}
function saveGlobalScores(scoresGlobal) {
  try {
    fs.writeFileSync(GLOBAL_FILE, JSON.stringify(scoresGlobal, null, 2), "utf-8");
  } catch (e) {}
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

// --- WebSocket --- //
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
    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("disconnect", () => {});
});

// --- Запуск сервера --- //
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log("Сервер працює на порті " + PORT);
});

