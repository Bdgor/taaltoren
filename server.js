const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(path.join(__dirname)));

let tower = [];
let players = {};
let timer = 900;

// Скидання башти кожні 15 хв
setInterval(() => {
  tower = [];
  io.emit("clear");
  timer = 900;
}, 1000 * 900);

// Зменшення таймера кожну секунду
setInterval(() => {
  if (timer > 0) timer--;
  io.emit("tick", { timer });
}, 1000);

io.on("connection", socket => {
  console.log("Гравець під'єднався:", socket.id);
  socket.emit("sync", { tower, timer, scores: players });

  socket.on("add-block", ({ word, user }) => {
    tower.push({ word, user });

    // Підрахунок балів
    if (!players[user]) players[user] = 0;
    players[user]++;

    io.emit("sync", { tower, timer, scores: players });
  });

  socket.on("disconnect", () => {
    console.log("Гравець вийшов:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
