const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',  // або вкажи конкретну адресу клієнта
  }
});

let tower = [];

io.on('connection', socket => {
  console.log(`👤 Нове підключення: ${socket.id}`);
  socket.emit('sync', { tower });

  socket.on('add-block', word => {
    tower.push(word);
    io.emit('sync', { tower });
  });

  socket.on('clear-tower', () => {
    tower = [];
    io.emit('clear');
  });

  socket.on('disconnect', () => {
    console.log(`❌ Відключився: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Socket.IO сервер запущено на порту ${PORT}`);
});
