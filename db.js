const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'localhost',
  user: 'Bdgor',
  password: 'MyStrongPass123',
  database: 'your_database_name' // заміни на актуальну назву
});

connection.connect((err) => {
  if (err) {
    console.error('Помилка підключення до MySQL:', err);
    return;
  }
  console.log('Підключено до MySQL!');
});

module.exports = connection;
