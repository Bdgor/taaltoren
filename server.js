const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Роздаємо статичні файли з поточної директорії
app.use(express.static(__dirname));

// Віддаємо index.html на GET /
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

let tower = [];

io.on("connection", (socket) => {
  console.log("🔌 Клієнт підключився");

  socket.emit("sync", { tower });

  socket.on("add-block", (word) => {
    tower.push(word);
    io.emit("sync", { tower });
  });

  socket.on("clear-tower", () => {
    tower = [];
    io.emit("clear");
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Сервер запущено на порту ${PORT}`);
});
