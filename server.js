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
app.use(express.static("public"));

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
      scoresSession = { A0: {}, A1: {}, A2: {} }; // Скидаємо лише сесійний рахунок
      timer = 900;
      io.emit("clear");
      io.emit("sync", { scoresSession, scoresGlobal });
    }
  }, 1000);
}

io.on("connection", socket => {
  // --- Обробка реєстрації логіна (унікальність) ---
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
    if (!scoresSession[level][user]) scoresSession[level][user]()
