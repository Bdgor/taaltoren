const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: '38.180.137.243',
  user: 'Bdgor',
  password: 'Bdgor3991',
  database: 'taaltoren'
});

connection.connect((err) => {
  if (err) {
    console.error('Помилка підключення до MySQL:', err);
    return;
  }
  console.log('Підключено до MySQL!');
});

module.exports = connection;
