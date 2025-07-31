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

let towers = {};  // { username: [ { word } ] }
let scores = {};  // { username: score }
let timer = 900;  // 15 хвилин у секундах

io.on("connection", socket => {
  console.log("Гравець під’єднався:", socket.id);

  socket.emit("sync", { towers, scores });
  socket.emit("tick", { timer });

  socket.on("add-block", ({ word, user }) => {
    if (!towers[user]) towers[user] = [];
    towers[user].push({ word });

    if (!scores[user]) scores[user] = 0;
    scores[user] += 1;

    io.emit("sync", { towers, scores });
  });

  socket.on("sync", ({ towers: clientTowers, scores: clientScores }) => {
    towers = { ...towers, ...clientTowers };
    scores = { ...scores, ...clientScores };
    io.emit("sync", { towers, scores });
  });

  socket.on("disconnect", () => {
    console.log("Гравець вийшов:", socket.id);
  });
});

// Таймер для бурі кожні 15 хвилин
setInterval(() => {
  timer--;
  if (timer <= 0) {
    towers = {}; // скидати вежі
    timer = 900;
    io.emit("clear");
  }
  io.emit("tick", { timer });
}, 1000);

server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});


server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
