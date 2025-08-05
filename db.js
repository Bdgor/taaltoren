const mysql = require('mysql2');

const pool = mysql.createPool({
  host: '38.180.137.243',
  user: 'Bdgor',
  password: 'Bdgor3991',
  database: 'taaltoren',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
