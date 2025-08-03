const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static("public")); // Папка з HTML, CSS, JS
app.use(express.json()); // Щоб читати JSON з форми

// --- Файли для зберігання ---
const GLOBAL_FILE = path.join(__dirname, "global_scores.json");
const USERS_FILE = path.join(__dirname, "users.json");

// --- Завантаження та збереження даних ---
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

// --- Дані у пам'яті ---
let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = loadGlobalScores();
let registeredUsers = loadUsers();

let timer = 900;
let interval = null;

// --- Запуск таймера ---
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

// --- Обробка WebSocket ---
io.on("connection", socket => {
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
    scoresSession[level][user] = (scoresSession[level][user] || 0) + 1;
    scoresGlobal[level][user] = (scoresGlobal[level][user] || 0) + 1;
    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("sub-block", data => {
    const { user, level, minus } = data;
    if (!user || !level) return;
    let m = Math.abs(Number(minus) || 1);
    scoresSession[level][user] = Math.max(0, (scoresSession[level][user] || 0) - m);
    scoresGlobal[level][user] = Math.max(0, (scoresGlobal[level][user] || 0) - m);
    saveGlobalScores(scoresGlobal);
    io.emit("sync", { scoresSession, scoresGlobal });
  });
});

// --- HTTP endpoint для форми реєстрації ---
app.post("/register", (req, res) => {
  const { username, password, email } = req.body;
  const loginKey = username.trim().toLowerCase();

  if (!username || !password || !email) {
    return res.status(400).json({ error: "Усі поля обов'язкові" });
  }

  if (registeredUsers[loginKey]) {
    return res.status(409).json({ error: "Користувач вже існує" });
  }

  registeredUsers[loginKey] = { password, email };
  saveUsers(registeredUsers);

  return res.status(201).json({ message: "Реєстрація успішна!" });
});

// --- Запуск ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Сервер працює на порті " + PORT);
});
