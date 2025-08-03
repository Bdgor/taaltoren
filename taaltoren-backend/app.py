from flask import Flask, request, jsonify
import mysql.connector

app = Flask(__name__)

# Підключення до бази
db = mysql.connector.connect(
    host="localhost",
    user="root",
    password="Bdgor@3991",
    database="taaltoren"
)

@app.route('/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    cur = db.cursor()
    cur.execute("INSERT INTO users (username, password) VALUES (%s, %s)", (username, password))
    db.commit()
    cur.close()
    return jsonify({"message": "Користувач зареєстрований!"})

@app.route('/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    cur = db.cursor()
    cur.execute("SELECT id FROM users WHERE username=%s AND password=%s", (username, password))
    user = cur.fetchone()
    cur.close()
    if user:
        return jsonify({"message": "Успішний вхід!"})
    else:
        return jsonify({"message": "Невірний логін або пароль!"}), 401

@app.route('/leaderboard', methods=['GET'])
def leaderboard():
    cur = db.cursor(dictionary=True)
    cur.execute("SELECT username, points FROM users ORDER BY points DESC LIMIT 10")
    results = cur.fetchall()
    cur.close()
    return jsonify(results)

@app.route('/add_points', methods=['POST'])
def add_points():
    data = request.json
    username = data.get('username')
    points = data.get('points', 0)
    cur = db.cursor()
    cur.execute("UPDATE users SET points = points + %s WHERE username = %s", (points, username))
    db.commit()
    cur.close()
    return jsonify({'message': 'Очки оновлено!'})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000)

