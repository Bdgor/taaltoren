// /public/js/login.js
const $ = (s, r=document) => r.querySelector(s);

function getNextUrl() {
  const p = new URLSearchParams(location.search);
  const next = p.get('next');
  // захист: дозволяємо лише внутрішні відносні шляхи
  if (next && next.startsWith('/') && !next.startsWith('//')) return next;
  return '/home.html';
}

$('#formLogin')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#loginEmail')?.value?.trim();
  const password = $('#loginPass')?.value;
  const msg = $('#msgLogin');
  const btn = $('#btnLogin');

  if (!email || !password) {
    if (msg) msg.textContent = 'Вкажіть email і пароль.'; 
    return;
  }

  btn && (btn.disabled = true);
  msg && (msg.textContent = 'Входимо…');

  try{
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });

    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : { ok: r.ok };

    if (r.ok && data?.ok) {
      // ✅ успіх — редірект
      location.href = getNextUrl();
    } else {
      msg && (msg.textContent = 'Помилка: ' + (data?.error || ('HTTP ' + r.status)));
    }
  } catch (err) {
    msg && (msg.textContent = 'Мережна помилка: ' + err.message);
  } finally {
    btn && (btn.disabled = false);
  }
});
