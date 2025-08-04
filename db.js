const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',          // якщо MySQL на цьому ж сервері
  user: 'Bdgor',              // твій користувач
  password: 'Bdogr3991',      // твій пароль
  database: 'taaltoren'       // твоя база
});

connection.connect((err) => {
  if (err) {
    console.error('Помилка підключення до MySQL:', err);
    return;
  }
  console.log('Підключено до MySQL!');
});

module.exports = connection;
