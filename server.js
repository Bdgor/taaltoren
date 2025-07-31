const socket = io("https://taaltoren.onrender.com");
let words = [];
let currentIndex = 0;
let username = localStorage.getItem("username") || "";
let playerTowers = {};
let timer = 900;
let scores = {};
let correctWords = new Set(JSON.parse(localStorage.getItem("correctWords") || "[]"));
let level = parseInt(localStorage.getItem("level") || "1");

if (username) {
    document.getElementById("usernameInput").style.display = "none";
    document.getElementById("game").style.display = "block";
}

async function loadWords() {
    try {
        let file = "/words.csv";
        if (level >= 3) file = "/words3.csv";
        else if (level === 2) file = "/words2.csv";

        const response = await fetch(file);
        const text = await response.text();
        const lines = text.trim().split("\n");
        words = lines.map(line => {
            const [ua, correct, wrong1, wrong2] = line.split(",");
            return { ua, correct, wrong: [wrong1, wrong2] };
        });
        shuffle(words);
        updateLevelDisplay();
        nextQuestion();
    } catch (err) {
        document.getElementById("question").innerText = "Не вдалося завантажити слова.";
        console.error("Помилка завантаження CSV:", err);
    }
}

function updateLevelDisplay() {
    document.getElementById("levelDisplay").innerText = `Рівень складності: ${level}`;
}

socket.on("sync", data => {
    playerTowers = data.towers || {};
    scores = data.scores || {};
    renderTower();
    renderLeaderboard();
});

socket.on("clear", () => {
    correctWords.clear();
    level++;
    localStorage.setItem("level", level);
    localStorage.setItem("correctWords", JSON.stringify([]));
    updateLevelDisplay();
    loadWords();
});

socket.on("tick", data => {
    timer = data.timer;
    updateTimerDisplay();
});

function updateTimerDisplay() {
    const minutes = String(Math.floor(timer / 60)).padStart(2, '0');
    const seconds = String(timer % 60).padStart(2, '0');
    document.getElementById("countdown").innerText = `${minutes}:${seconds}`;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function nextQuestion() {
    if (correctWords.size >= words.length) {
        correctWords.clear();
        localStorage.setItem("correctWords", JSON.stringify([]));
    }

    let found = false;
    for (let i = 0; i < words.length; i++) {
        if (!correctWords.has(words[i].correct)) {
            currentIndex = i;
            found = true;
            break;
        }
    }
    if (!found) return;

    const item = words[currentIndex];
    document.getElementById("question").innerText = `Як буде "${item.ua}" нідерландською?`;

    let options = [item.correct, ...item.wrong];
    shuffle(options);

    const optionsDiv = document.getElementById("options");
    optionsDiv.innerHTML = "";
    options.forEach(option => {
        const btn = document.createElement("button");
        btn.innerText = option;
        btn.onclick = () => {
            if (option === item.correct) {
                correctWords.add(item.correct);
                localStorage.setItem("correctWords", JSON.stringify([...correctWords]));
                socket.emit("add-block", { word: item.correct, user: username });
                playSound('correct');
            } else {
                scores[username] = (scores[username] || 0) - 1;
                socket.emit("sync", { towers: playerTowers, scores });
                playSound('wrong');
            }
            nextQuestion();
        };
        optionsDiv.appendChild(btn);
    });
}

function renderTower() {
    const towerDiv = document.getElementById("tower");
    const scoreDiv = document.getElementById("score");
    towerDiv.innerHTML = "";
    const personalTower = playerTowers[username] || [];
    personalTower.slice().reverse().forEach(entry => {
        const block = document.createElement("div");
        block.className = "block";
        block.innerText = `${entry.word}`;
        towerDiv.appendChild(block);
    });
    scoreDiv.innerText = `Висота вежі: ${personalTower.length}`;
}

function renderLeaderboard() {
    const lb = document.getElementById("leaderboard");
    lb.innerHTML = `<h3>Рейтинг гравців</h3>`;
    const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    lb.innerHTML += `<ul>${sorted.map(([name, score]) => `<li>${name}: ${score}</li>`).join('')}</ul>`;
}

function playSound(type) {
    const sounds = {
        correct: new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_96f7e97907.mp3'),
        wrong: new Audio('https://cdn.pixabay.com/audio/2022/03/15/audio_88195d96a7.mp3'),
        storm: new Audio('https://cdn.pixabay.com/audio/2022/02/23/audio_1ad76fc186.mp3')
    };
    if (sounds[type]) sounds[type].play();
}

function startGame() {
    username = document.getElementById("username").value.trim();
    if (!username) return alert("Введіть ім’я!");
    localStorage.setItem("username", username);
    document.getElementById("usernameInput").style.display = "none";
    document.getElementById("game").style.display = "block";
    loadWords();
}

if (username) loadWords();
