const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let towers = {}; // окрема вежа для кожного гравця
let scores = {};
let timer = 900;

io.on("connection", socket => {
  console.log("Гравець під'єднався:", socket.id);

  socket.on("add-block", ({ word, user }) => {
    if (!towers[user]) towers[user] = [];
    towers[user].push({ word });
    scores[user] = (scores[user] || 0) + 1;
    io.emit("sync", { towers, scores });
  });

  socket.on("sync", ({ towers: newTowers, scores: newScores }) => {
    towers = newTowers;
    scores = newScores;
    io.emit("sync", { towers, scores });
  });

  socket.on("disconnect", () => {
    console.log("Гравець вийшов:", socket.id);
  });
});

// Таймер для бурі
setInterval(() => {
  timer--;
  io.emit("tick", { timer });
  if (timer <= 0) {
    towers = {};
    timer = 900;
    io.emit("clear");
    io.emit("sync", { towers, scores });
  }
}, 1000);

// ✅ Лише один виклик!
server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
