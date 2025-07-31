const express = require("express");
const http = require("http");
const cors = require("cors");
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

app.use(cors());
app.use(express.static("public"));

let towers = {};       // кожен гравець має свою вежу
let scores = {};       // рейтинг гравців
let timer = 900;       // 15 хвилин
let interval = null;

// Запуск таймера
function startTimer() {
  if (interval) return;
  interval = setInterval(() => {
    timer--;
    io.emit("tick", { timer });
    if (timer <= 0) {
      towers = {};
      timer = 900;
      io.emit("clear");
      io.emit("sync", { towers, scores });
    }
  }, 1000);
}

io.on("connection", socket => {
  console.log("Користувач під'єднався:", socket.id);
  socket.emit("sync", { towers, scores });
  socket.emit("tick", { timer });
  startTimer();

  socket.on("add-block", data => {
    const { user, word } = data;
    if (!towers[user]) towers[user] = [];
    towers[user].push({ word });
    if (!scores[user]) scores[user] = 0;
    scores[user]++;
    io.emit("sync", { towers, scores });
  });

  socket.on("sync", data => {
    towers = data.towers;
    scores = data.scores;
    io.emit("sync", { towers, scores });
  });

  socket.on("disconnect", () => {
    console.log("Користувач вийшов:", socket.id);
  });
});

// Очищення таблиці гравців раз на добу
cron.schedule("0 0 * * *", () => {
  scores = {};
  console.log("Очищено рейтинг гравців.");
});

server.listen(3000, () => {
  console.log("Сервер працює на порті 3000");
});
