// /public/js/reset.js
const $ = (s, r=document) => r.querySelector(s);

// 1) Старт: попросити лист/токен
document.getElementById('formResetStart')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = $('#resetEmail').value.trim();
  const box = $('#msgResetStart'); box.className='muted'; box.textContent='Надсилаємо інструкції…';
  $('#btnResetStart').disabled = true;

  try{
    const r = await fetch('/api/request-password-reset', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ email })
    });
    const data = await r.json().catch(()=>({ ok:r.ok }));
    if (r.ok && data?.ok){
      box.className='ok';
      box.textContent = data.token
        ? `Лист відправлено. DEV-токен: ${data.token}`
        : 'Лист відправлено (якщо email існує). Перевірте пошту.';
      if (data.token) { $('#resetCode').value = data.token; }
    } else {
      box.className='err';
      box.textContent = 'Помилка: ' + (data?.error || ('HTTP '+r.status));
    }
  }catch(err){
    box.className='err'; box.textContent='Мережна помилка: '+err.message;
  }finally{
    $('#btnResetStart').disabled = false;
  }
});

// 2) Фініш: змінити пароль за токеном
document.getElementById('formResetFinish')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const token = $('#resetCode').value.trim();
  const password = $('#resetNewPass').value;
  const box = $('#msgResetFinish'); box.className='muted'; box.textContent='Оновлюємо пароль…';
  $('#btnResetFinish').disabled = true;

  try{
    const r = await fetch('/api/reset-password', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ token, password })
    });
    const data = await r.json().catch(()=>({ ok:r.ok }));
    if (r.ok && data?.ok){
      box.className='ok';
      box.textContent = 'Пароль змінено. Можете увійти.';
      setTimeout(()=> location.href='/login', 900);
    } else {
      box.className='err';
      box.textContent = 'Помилка: ' + (data?.error || ('HTTP '+r.status));
    }
  }catch(err){
    box.className='err'; box.textContent='Мережна помилка: '+err.message;
  }finally{
    $('#btnResetFinish').disabled = false;
  }
});
