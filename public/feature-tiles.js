document.addEventListener('DOMContentLoaded', () => {
  // показувати тільки залогіненим? залишаємо true/false як потрібно
  const isLoggedIn =
    !!(localStorage.getItem('user') ||
       localStorage.getItem('username') ||
       localStorage.getItem('token') ||
       (document.cookie || '').match(/username=/));

  // якщо треба показувати завжди — розкоментуй наступний рядок
  // const isLoggedIn = true;

  if (!isLoggedIn) return;

  const wrap = document.createElement('section');
  wrap.id = 'feature-tiles';
  wrap.innerHTML = `
    <h2 style="text-align:center;margin-top:24px">Додаткові завдання</h2>
    <div class="feature-grid">
      <a class="feature-card" href="/sentences">
        <div class="icon">🧩</div>
        <div class="title">Збери речення</div>
        <div class="desc">Перетягни слова у правильному порядку</div>
      </a>
      <a class="feature-card" href="/dialogues">
        <div class="icon">💬</div>
        <div class="title">Діалоги</div>
        <div class="desc">Тренуй розмовні фрази за рівнями</div>
      </a>
    </div>
  `;

  // вставляємо після основного контенту
  const target =
    document.querySelector('#levels, .levels, main') || document.body;
  target.appendChild(wrap);
});
