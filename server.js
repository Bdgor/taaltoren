const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let towers = {};   // вежі по гравцю
let scores = {};   // рахунок по гравцю
let timer = 900;   // 15 хвилин для бурі

// 🕓 Очищення щодоби (24 годин = 86400000 мс)
setInterval(() => {
  towers = {};
  scores = {};
  io.emit("clear");
  console.log("Рейтинг та вежі очищено автоматично.");
}, 86400000);

// ⏱️ Таймер для бурі кожну хвилину
setInterval(() => {
  timer--;
  if (timer <= 0) {
    towers = {};
    scores = {};
    io.emit("clear");
    timer = 900; // скинути таймер
    console.log("Вежу знищено бурею.");
  } else {
    io.emit("tick", { timer });
  }
}, 1000);

io.on("connection", socket => {
  console.log("Гравець під'єднався:", socket.id);

  socket.emit("sync", { towers, scores, timer });

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

server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});


// ✅ Лише один виклик!
server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
