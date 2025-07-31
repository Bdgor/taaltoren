const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cron = require("node-cron");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

let towers = {};
let scores = {};
let timer = 900;

// Очищення щодня о 00:00
cron.schedule("0 0 * * *", () => {
  scores = {};
  towers = {};
  console.log("Щоденне очищення рейтингів і веж");
});

io.on("connection", socket => {
  console.log("Гравець під'єднався:", socket.id);
  socket.on("add-block", ({ word, user }) => {
    if (!towers[user]) towers[user] = [];
    towers[user].push({ word });
    scores[user] = (scores[user] || 0) + 1;
    io.emit("sync", { towers, scores });
  });

  socket.on("sync", data => {
    towers = data.towers;
    scores = data.scores;
    io.emit("sync", { towers, scores });
  });

  socket.emit("sync", { towers, scores });

  socket.on("disconnect", () => {
    console

// ✅ Лише один виклик!
server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
