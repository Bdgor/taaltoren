const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const connection = require('./db');

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

// --- Файли для зберігання рейтингу і логінів ---
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");
const USERS_FILE = path.join(__dirname, "users.json");

// --- Збереження та читання глобального рейтингу ---
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

// --- Збереження та читання логінів ---
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

// --- Ініціалізація змінних ---
let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = loadGlobalScores();
let registeredUsers = loadUsers();

let timer = 900;
let interval = null;

// --- Таймер сесії ---
function startTimer() {
  if (interval) return;
  interval = setInterval(() => {
    timer--;
    io.emit("tick", { timer });
    if (timer <= 0) {
      scoresSession = { A0: {}, A1: {}, A2: {} }; // Скидаємо лише сесійний рахунок
      timer = 900;
      io.emit("clear");
      io.emit("sync", { scoresSession, scoresGlobal });
    }
  }, 1000);
}

// --- WebSocket логіка ---
io.on("connection", socket => {
  // --- Унікальний логін ---
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

  // --- Додавання балів ---
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

  // --- Віднімання балів ---
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

  socket.on("disconnect", () => {
    // Не видаляємо логін з users.json — тільки якщо хочеш вручну
  });
});

// --- Запуск сервера ---
const PORT = process.env.PORT || 3000;
app.get('/test-mysql', (req, res) => {
  connection.query('SELECT 1 + 1 AS solution', (err, results) => {
    if (err) {
      res.status(500).send('Помилка MySQL: ' + err.message);
      return;
    }
    res.send('MySQL працює! 1+1=' + results[0].solution);
  });
});
server.listen(PORT, () => {
  console.log("Сервер працює на порті " + PORT);
});

