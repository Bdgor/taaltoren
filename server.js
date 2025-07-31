const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // дозволити всім
    methods: ["GET", "POST"]
  }
});

let tower = [];

io.on("connection", socket => {
  console.log("Гравець під'єднався:", socket.id);
  socket.emit("sync", { tower });

  socket.on("add-block", text => {
    tower.push(text);
    io.emit("sync", { tower });
  });

  socket.on("clear-tower", () => {
    tower = [];
    io.emit("clear");
  });

  socket.on("disconnect", () => {
    console.log("Гравець вийшов:", socket.id);
  });
});

server.listen(3000, () => {
  console.log("Мультплеєр-сервер запущено на порті 3000");
});
