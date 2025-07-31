// server.js (Node.js + Socket.IO)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
  }
});

let players = {};

io.on('connection', (socket) => {
  console.log('Гравець підʼєднався:', socket.id);

  socket.on('register', (nickname) => {
    players[socket.id] = { nickname, score: 0 };
    io.emit('players', players);
  });

  socket.on('update_score', (score) => {
    if (players[socket.id]) {
      players[socket.id].score = score;
      io.emit('players', players);
    }
  });

  socket.on('disconnect', () => {
    console.log('Відʼєднано:', socket.id);
    delete players[socket.id];
    io.emit('players', players);
  });
});

server.listen(3000, () => {
  console.log('Мультиплеєр-сервер запущено на порті 3000');
});