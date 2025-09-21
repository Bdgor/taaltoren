// /public/js/words.js
const $ = (s, r=document) => r.querySelector(s);

function getLevel() {
  const p = new URLSearchParams(location.search);
  const lv = (p.get('level') || 'A0').toUpperCase();
  const allowed = new Set(['A0','A1','A2','B1','B2','C1']);
  return allowed.has(lv) ? lv : 'A0';
}

let lastQuestion = null;
let currentLevel = getLevel();
let streak = 0;

// безпечні оновлення DOM
$('#levelBadge') && ($('#levelBadge').textContent = currentLevel);
$('#title') && ($('#title').textContent = `Збірка слів — рівень ${currentLevel}`);
$('#streak') && ($('#streak').textContent = `Серія: ${streak}`);

async function refreshStats(){
  try{
    const r = await fetch('/api/my-stats', { credentials:'include' });
    const data = await r.json();
    if (data?.ok){
      const bubble = $('#ratingBubble');
      if (bubble) bubble.textContent = `${data.stats.score} / ${data.stats.balance} / ${data.stats.total}`;
    }
  }catch{}
}

function renderQuestion(q){
  const box = $('#questionBox');
  if (!box) return;
  const opts = q.options.map(o =>
    `<button class="tt-btn tt-option" data-choice="${o.text}">${o.text}</button>`
  ).join(' ');
  box.innerHTML = `
    <div class="tt-card-inner">
      <div class="tt-prompt"><strong>${q.prompt}</strong></div>
      <div class="tt-row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${opts}</div>
    </div>`;
  const fb = $('#feedback'); if (fb) fb.textContent = '';

  document.querySelectorAll('.tt-option').forEach(btn=>{
    btn.addEventListener('click', ()=> answer(btn.dataset.choice));
  });
}

async function loadQuestion(){
  try{
    const r = await fetch(`/api/words/question?level=${encodeURIComponent(currentLevel)}`, { credentials:'include' });
    const data = await r.json().catch(()=>({ ok:false }));
    if (!data?.ok){
      const box = $('#questionBox');
      if (box) box.innerHTML = `<div class="muted">Для рівня ${currentLevel} поки немає завдань${data?.error?` (${data.error})`:''}.</div>`;
      return;
    }
    lastQuestion = { key: data.question.key, level: currentLevel };
    renderQuestion(data.question);
  }catch(err){
    console.error('loadQuestion error:', err);
  }
}

async function answer(choice){
  if (!lastQuestion) return;
  try{
    const r = await fetch('/api/words/answer', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      credentials:'include',
      body: JSON.stringify({ key:lastQuestion.key, choice, level:lastQuestion.level })
    });
    const data = await r.json().catch(()=>({ ok:false }));
    const fb = $('#feedback');

    if (data?.ok){
      if (data.correct){ streak++; fb && (fb.textContent = '✅ Правильно! +1 очко'); }
      else { streak = 0; fb && (fb.textContent = '❌ Неправильно. -1 очко'); }
      const st = $('#streak'); st && (st.textContent = `Серія: ${streak}`);
      await refreshStats();
      setTimeout(loadQuestion, 700);
    } else {
      fb && (fb.textContent = 'Помилка: ' + (data?.error || 'невідомо'));
    }
  }catch(err){
    console.error('answer error:', err);
  }
}

$('#btnNext')?.addEventListener('click', loadQuestion);

/* ====== TTS (Web Speech API) ====== */
const TTS = {
  enabled: true,
  voices: [],
  voiceNL: null,
  voiceUK: null,
  loadVoices(){
    TTS.voices = window.speechSynthesis ? speechSynthesis.getVoices() : [];
    // вибираємо NL
    const nlCandidates = TTS.voices.filter(v =>
      /nl/i.test(v.lang || '') || /Dutch/i.test(v.name || '')
    );
    TTS.voiceNL = nlCandidates[0] || TTS.voices.find(v => /en/i.test(v.lang||'')) || null;
    // вибираємо UKR
    const ukCandidates = TTS.voices.filter(v =>
      /(uk|ukr|ua)/i.test(v.lang || '') || /Ukrainian/i.test(v.name || '')
    );
    TTS.voiceUK = ukCandidates[0] || TTS.voices.find(v => /ru|pl|cs|sk/i.test(v.lang||'')) || null; // запасні слов’янські
    TTS.populateSelectors();
  },
  populateSelectors(){
    const selNL = document.getElementById('voiceNL');
    const selUK = document.getElementById('voiceUK');
    if (!selNL || !selUK) return;
    function fill(sel, prefer){
      sel.innerHTML = '';
      TTS.voices.forEach((v,i)=>{
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = `${v.name} (${v.lang})`;
        if (prefer && v === prefer) opt.selected = true;
        sel.appendChild(opt);
      });
    }
    fill(selNL, TTS.voiceNL);
    fill(selUK, TTS.voiceUK);
  },
  speak(text, langPref){
    if (!TTS.enabled || !window.speechSynthesis || !text) return;
    const utter = new SpeechSynthesisUtterance(text);
    const pick = (pref) => {
      if (!TTS.voices?.length) return null;
      // якщо передали конкретну мову
      if (pref === 'nl'){
        if (TTS.voiceNL) return TTS.voiceNL;
        const v = TTS.voices.find(v=>/nl/i.test(v.lang)); if (v) return v;
      }
      if (pref === 'uk'){
        if (TTS.voiceUK) return TTS.voiceUK;
        const v = TTS.voices.find(v=>/(uk|ukr|ua)|Ukrainian/i.test(v.lang+v.name)); if (v) return v;
      }
      return TTS.voices[0] || null;
    };
    utter.voice = pick(langPref);
    utter.lang  = utter.voice?.lang || (langPref==='nl' ? 'nl-NL' : (langPref==='uk' ? 'uk-UA' : ''));
    utter.rate = 0.95; utter.pitch = 1; utter.volume = 1;
    try { speechSynthesis.cancel(); } catch {}
    speechSynthesis.speak(utter);
  }
};

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => TTS.loadVoices();
  // деякі браузери не кидають подію — пробуємо раз:
  setTimeout(()=> TTS.loadVoices(), 300);
}

// керування з UI
document.getElementById('toggleTTS')?.addEventListener('change', e => {
  TTS.enabled = e.target.checked;
  if (!TTS.enabled && 'speechSynthesis' in window) speechSynthesis.cancel();
});
document.getElementById('voiceNL')?.addEventListener('change', e => {
  const v = TTS.voices[parseInt(e.target.value,10)];
  if (v) TTS.voiceNL = v;
});
document.getElementById('voiceUK')?.addEventListener('change', e => {
  const v = TTS.voices[parseInt(e.target.value,10)];
  if (v) TTS.voiceUK = v;
});


/* =========================
   🎰 ІГРОВИЙ АВТОМАТ — синхронізований із сервером
   ========================= */
const ICONS = {
  star:   '/img/slots/star.svg',
  banana: '/img/slots/banana.svg',
  cherry: '/img/slots/cherry.svg',
  lemon:  '/img/slots/lemon.svg',
  grape:  '/img/slots/grape.svg',
  bell:   '/img/slots/bell.svg',
  clover: '/img/slots/clover.svg',
  gem:    '/img/slots/gem.svg',
  seven:  '/img/slots/seven.svg'
};
// прелоад
Object.values(ICONS).forEach(src => { const i = new Image(); i.src = src; });

let spinTimers = [];
let spinStart = 0;
const MIN_SPIN_MS = 2000;   // довше обертання
const STEP_STOP_MS = 400;   // плавніша послідовна зупинка
const REQ_TIMEOUT_MS = 8000;
let lastStats = null;

function setReelIdx(idx, key){
  const el = document.getElementById(`reel${idx}`);
  const img = el?.querySelector('img');
  if (img && ICONS[key]) img.src = ICONS[key];
}
function randomKey(){
  const keys = Object.keys(ICONS);
  return keys[Math.floor(Math.random()*keys.length)];
}
function startSpin(){
  stopSpinNow();
  spinStart = Date.now();
  [1,2,3].forEach((n,i)=>{
    spinTimers[i] = setInterval(()=> setReelIdx(n, randomKey()), 65 + i*15);
  });
}
function stopSpinSeq(finalKeys=null){
  // зупиняємо 1-2-3 з кроком і (опц.) виставляємо фінальні ключі
  [0,1,2].forEach(i=>{
    setTimeout(()=>{
      clearInterval(spinTimers[i]);
      if (finalKeys && finalKeys[i]) setReelIdx(i+1, finalKeys[i]);
    }, i*STEP_STOP_MS);
  });
  setTimeout(()=>{ spinTimers = []; }, STEP_STOP_MS*3+20);
}
function stopSpinNow(){ spinTimers.forEach(t=> clearInterval(t)); spinTimers=[]; }

function errorText(code){
  switch(code){
    case 'min_bet_10': return 'Ставка замала (мінімум 10).';
    case 'insufficient_balance': return 'Недостатньо балансу: внесіть очки й спробуйте ще.';
    case 'bad_amount': return 'Невірна або нульова сума.';
    case 'network': return 'Мережна помилка.';
    default: return code || 'Сталася помилка.';
  }
}
function syncPlayButton(stats){
  lastStats = stats || lastStats;
  const btn = $('#btnPlay'); if (!btn) return;
  const bet = Math.max(10, parseInt($('#bet')?.value || 0));
  const balance = Number((lastStats && lastStats.balance) || 0);
  btn.disabled = !(balance >= bet);
}
async function refreshStatsPlus(){
  try{
    const r = await fetch('/api/my-stats', { credentials:'include' });
    const data = await r.json();
    if (data?.ok){
      const bubble = $('#ratingBubble');
      if (bubble) bubble.textContent = `${data.stats.score} / ${data.stats.balance} / ${data.stats.total}`;
      syncPlayButton(data.stats);
    }
  }catch{}
}
$('#bet')?.addEventListener('input', ()=> syncPlayButton(lastStats));

async function doPlay(){
  const btn = $('#btnPlay'); const msg = $('#machineMsg');
  const bet = Math.max(10, parseInt($('#bet')?.value || 0));
  const balance = Number((lastStats && lastStats.balance) || 0);
  if (balance < bet){ msg && (msg.textContent = errorText('insufficient_balance')); return; }

  btn && (btn.disabled = true);
  msg && (msg.textContent = 'Крутимо…');
  startSpin();

  // таймаут запиту
  const ctrl = new AbortController();
  const timer = setTimeout(()=> ctrl.abort(), REQ_TIMEOUT_MS);
  let resp;
  try{
    const r = await fetch('/api/game/play', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ bet }),
      signal: ctrl.signal
    });
    resp = await r.json().catch(()=>({ ok:false }));
  }catch{
    resp = { ok:false, error:'network' };
  }finally{
    clearTimeout(timer);
  }

  const remain = Math.max(0, MIN_SPIN_MS - (Date.now() - spinStart));
  setTimeout(()=>{
    const finalKeys = Array.isArray(resp?.reels) ? resp.reels : null;
    stopSpinSeq(finalKeys);
    if (resp?.ok){
      msg && (msg.textContent = resp.prize > 0
        ? `Виграш +${resp.prize}. Баланс: ${resp.stats.balance}`
        : `Нема виграшу. Баланс: ${resp.stats.balance}`);
      refreshStatsPlus();
    } else {
      msg && (msg.textContent = 'Помилка: ' + errorText(resp?.error));
      refreshStatsPlus();
    }
    setTimeout(()=>{ btn && (btn.disabled = false); syncPlayButton(lastStats); }, STEP_STOP_MS*3+80);
  }, remain);
}
$('#btnPlay')?.addEventListener('click', doPlay);

// чіпи внесення
document.querySelectorAll('.btn-chip[data-dep]')?.forEach(btn=>{
  btn.addEventListener('click', async ()=>{
    const amount = parseInt(btn.dataset.dep || '0');
    const msg = $('#machineMsg');
    if (!lastStats) await refreshStatsPlus();
    const score = Number((lastStats && lastStats.score) || 0);
    if (score < amount){ msg && (msg.textContent = 'Недостатньо особистих очок для внесення.'); return; }

    btn.disabled = true;
    try{
      const r = await fetch('/api/game/deposit', {
        method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
        body: JSON.stringify({ amount })
      });
      const data = await r.json().catch(()=>({ ok:false }));
      if (data?.ok){ msg && (msg.textContent = `Переказано ${amount} в баланс.`); await refreshStatsPlus(); }
      else { msg && (msg.textContent = 'Помилка: ' + errorText(data?.error)); }
    }catch{ msg && (msg.textContent = errorText('network')); }
    finally{ btn.disabled = false; }
  });
});

// вивід
async function doWithdraw(){
  const btn = $('#btnWithdraw'); const msg = $('#machineMsg');
  const amount = parseInt($('#wdAmt')?.value || 0);
  if (!amount || amount <= 0){ msg && (msg.textContent = 'Вкажіть суму для виводу.'); return; }
  btn && (btn.disabled = true);
  try{
    const r = await fetch('/api/game/withdraw', {
      method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
      body: JSON.stringify({ amount })
    });
    const data = await r.json().catch(()=>({ ok:false }));
    if (data?.ok){ msg && (msg.textContent = 'Виведено в загальну суму.'); await refreshStatsPlus(); }
    else { msg && (msg.textContent = 'Помилка: ' + errorText(data?.error)); }
  }catch{ msg && (msg.textContent = errorText('network')); }
  finally{ btn && (btn.disabled = false); }
}
$('#btnWithdraw')?.addEventListener('click', doWithdraw);

// стартове оновлення
refreshStatsPlus();



// ===== Міні-лідерборд (топ-10)
async function miniLeaderboard(){
  try{
    const r = await fetch('/api/leaderboard');
    const data = await r.json();
    if (!data?.ok) return;
    const top = data.items.slice(0,10).map((it,i)=>
      `<div style="display:flex;justify-content:space-between;"><span>${i+1}. ${it.name || ('User '+it.id)}</span><strong>${it.total}</strong></div>`
    ).join('');
    const el = $('#miniLb'); el && (el.innerHTML = `<div class="muted">Топ-10 (за загальною сумою):</div>${top}`);
  }catch{}
}

// старт
refreshStats();
miniLeaderboard();

// --- страховка: якщо розмітки автомата немає — додамо її динамічно (на випадок старої сторінки)
(function ensureSlotMarkup(){
  if (document.getElementById('btnPlay')) return;
  const wrap = document.querySelector('.tt-wrap') || document.body;
  const section = document.createElement('section');
  section.className = 'tt-card'; section.style.marginTop = '12px';
  section.innerHTML = `
    <h3 style="margin:6px 0 10px">🎰 Ігровий автомат</h3>
    <div class="slot-wrap">
      <div class="reel" id="reel1"><img alt="" /></div>
      <div class="reel" id="reel2"><img alt="" /></div>
      <div class="reel" id="reel3"><img alt="" /></div>
    </div>
    <div class="tt-row" style="gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px">
      <label for="bet">Ставка (мін. 10):</label>
      <input id="bet" type="number" min="10" step="1" value="10" style="width:110px" />
      <button class="tt-btn" id="btnPlay">Грати</button>
      <input id="depAmt" type="number" min="1" step="1" placeholder="Внести з очок → баланс" style="width:210px" />
      <button class="tt-btn" id="btnDeposit">Внести</button>
      <input id="wdAmt" type="number" min="1" step="1" placeholder="Вивести баланс → загальна" style="width:230px" />
      <button class="tt-btn" id="btnWithdraw">Вивести</button>
      <a class="tt-btn" href="/leaderboard.html" style="margin-left:auto">🏆 Повний рейтинг</a>
    </div>
    <div id="machineMsg" class="muted" style="margin-top:8px"></div>
    <div id="miniLb" class="muted" style="margin-top:10px"></div>
  `;
  wrap.appendChild(section);
  $('#btnPlay')?.addEventListener('click', doPlay);
  $('#btnDeposit')?.addEventListener('click', doDeposit);
  $('#btnWithdraw')?.addEventListener('click', doWithdraw);
})();
