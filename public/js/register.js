const $ = (s, r=document) => r.querySelector(s);
const siteKey = '6Lfh0c0rAAAAAMX0xOMrdbrP-UHU9RKQSyaG6bgw';

// Налаштування ендпоїнтів (замініть під свою API-схему за потреби)
const EP = {
  start:   '/api/register/start',   // {name,email,password, recaptchaToken}
  confirm: '/api/register/confirm', // {email, code,          recaptchaToken}
  resend:  '/api/register/resend'   // {email,                recaptchaToken}
};

async function recaptchaToken(action){
  if(!window.grecaptcha) return '';
  await grecaptcha.ready();
  try { return await grecaptcha.execute(siteKey, { action }); } catch { return ''; }
}

// КРОК 1 → надсилаємо лист з кодом
$('#formReg1')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const name = $('#name').value.trim();
  const email = $('#email').value.trim();
  const password = $('#password').value;
  const password2 = $('#password2').value;
  const agree = $('#agree').checked;
  const msg = $('#msgReg1'); msg.className='muted'; msg.textContent='Готуємо лист із кодом…';

  if(!name || !email || !password){ msg.className='err'; msg.textContent='Заповніть усі поля.'; return; }
  if(password !== password2){ msg.className='err'; msg.textContent='Паролі не співпадають.'; return; }
  if(!agree){ msg.className='err'; msg.textContent='Потрібно погодитись з умовами користування.'; return; }

  $('#btnReg1').disabled = true;
  try{
    const token = await recaptchaToken('register_start');
    const r = await fetch(EP.start, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ name, email, password, recaptchaToken: token })
    });
    const ct = r.headers.get('content-type')||'';
    const data = ct.includes('json') ? await r.json() : { ok:r.ok, error: await r.text() };
    if (r.ok && data?.ok !== false){
      msg.className='ok'; msg.textContent='Код відправлено на '+email+'. Введіть код нижче.';
      // Перехід на крок 2
      $('#formReg1').classList.add('hidden');
      $('#formReg2').classList.remove('hidden');
      $('#regEmailNote').textContent = 'Email: '+email;
      $('#formReg2').dataset.email = email;
      $('#regCode').focus();
    } else {
      msg.className='err'; msg.textContent='Помилка: ' + (data?.error || ('HTTP '+r.status));
    }
  }catch(err){
    msg.className='err'; msg.textContent='Мережна помилка: '+err.message;
  }finally{
    $('#btnReg1').disabled = false;
  }
});

// КРОК 2 → підтверджуємо код і створюємо акаунт
$('#formReg2')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const email = e.currentTarget.dataset.email;
  const code  = $('#regCode').value.trim();
  const msg = $('#msgReg2'); msg.className='muted'; msg.textContent='Перевіряю код…';
  $('#btnReg2').disabled = true;
  try{
    const token = await recaptchaToken('register_confirm');
    const r = await fetch(EP.confirm, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ email, code, recaptchaToken: token })
    });
    const data = await r.json().catch(()=>({ ok:r.ok }));
    if (r.ok && data?.ok !== false){
      msg.className='ok'; msg.textContent='Акаунт створено. Тепер увійдіть.';
      setTimeout(()=> location.href='/login', 600);
    } else {
      msg.className='err'; msg.textContent='Код невірний або прострочений.';
    }
  }catch(err){
    msg.className='err'; msg.textContent='Мережна помилка: '+err.message;
  }finally{
    $('#btnReg2').disabled = false;
  }
});

// Надіслати код повторно
$('#btnResend')?.addEventListener('click', async ()=>{
  const email = $('#formReg2').dataset.email || $('#email').value.trim();
  const msg = $('#msgReg2'); msg.className='muted'; msg.textContent='Надсилаємо код…';
  try{
    const token = await recaptchaToken('register_resend');
    const r = await fetch(EP.resend, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ email, recaptchaToken: token })
    });
    msg.className = r.ok ? 'ok' : 'err';
    msg.textContent = r.ok ? 'Код надіслано.' : 'Не вдалося надіслати код.';
  }catch(err){
    msg.className='err'; msg.textContent='Мережна помилка: '+err.message;
  }
});

// Назад до кроку 1 (змінити email)
$('#btnBack')?.addEventListener('click', ()=>{
  $('#formReg2').classList.add('hidden');
  $('#formReg1').classList.remove('hidden');
});
<script type="module">
const f = document.getElementById('formReg1');
const msg = document.getElementById('msgReg1');

f?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  msg.textContent = '';
  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;

  const r = await fetch('/api/register', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ name, email, password, password2 })
  });
  const data = await r.json();
  if (data.ok) { location.href = '/login'; }
  else msg.textContent = 'Помилка: ' + (data.error || 'невідомо');
});
</script>