const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

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

let scoresSession = { A0: {}, A1: {}, A2: {} };
let scoresGlobal = { A0: {}, A1: {}, A2: {} };
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
  console.log("Користувач під'єднався:", socket.id);
  socket.emit("sync", { scoresSession, scoresGlobal });
  socket.emit("tick", { timer });
  startTimer();

  socket.on("add-block", data => {
    const { user, level } = data;
    if (!user || !level) return;
    // Сесійний рейтинг
    if (!scoresSession[level][user]) scoresSession[level][user] = 0;
    scoresSession[level][user]++;
    // Глобальний рейтинг
    if (!scoresGlobal[level][user]) scoresGlobal[level][user] = 0;
    scoresGlobal[level][user]++;
    io.emit("sync", { scoresSession, scoresGlobal });
  });

  socket.on("disconnect", () => {
    console.log("Користувач вийшов:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Сервер працює на порті 3000");
});
