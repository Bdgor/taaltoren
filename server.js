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
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Файли для зберігання рейтингу і логінів (залишаємо поки що, якщо треба міграція — перенесемо в MySQL) ---
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");
const USERS_FILE = path.join(__dirname, "users.json");

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
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
    }
  } catch (e) {}
  return {};
}
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (e) {}
}

let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = loadGlobalScores();
let registeredUsers = loadUsers();

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

// --- WebSocket логіка ---
io.on("connection", socket => {
  // --- Стара логіка реєстрації в json ---
  socket.on("register-user", (login, callback) => {
    const loginKey = login.trim().toLowerCase();
    if (!loginKey) return callback({ ok: false, msg: "Порожній логін" });
    if (registeredUsers[loginKey]) {
      return callback({ ok: false, msg: "Логін уже зайнятий!" });
    }
    registeredUsers[loginKey] = true;
    saveUsers(registeredUsers);
    callback({ ok: true });
  });

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

// --- Реєстрація користувача через API + MySQL ---
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
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        [username, email, hashedPassword],
        (err2, result) => {
          if (err2) return res.status(500).json({ ok: false, msg: 'DB error' });
          return res.json({ ok: true, msg: 'Користувача зареєстровано' });
        }
      );
    }
  );
});

// --- Тестовий роут для перевірки MySQL ---
app.get('/test-mysql', (req, res) => {
  connection.query('SELECT 1 + 1 AS solution', (err, results) => {
    if (err) {
      res.status(500).send('Помилка MySQL: ' + err.message);
      return;
    }
    res.send('MySQL працює! 1+1=' + results[0].solution);
  });
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Сервер працює на порті " + PORT);
});
