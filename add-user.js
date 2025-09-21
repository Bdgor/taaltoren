// add-user.js
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

(async () => {
  try {
    const email = 'bdgor777@gmail.com';
    const name = 'bdgor';
    const password = 'Bdgor3991';
    const hash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (email, password_hash, name, role, is_verified) VALUES (?,?,?,?,?)',
      [email, hash, name, 'user', 1]
    );

    console.log('Користувач створений:', email);
    process.exit(0);
  } catch (e) {
    console.error('Помилка:', e);
    process.exit(1);
  }
})();
