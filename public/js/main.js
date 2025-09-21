// main.js — мінімальна інтеграція з твоїм бекендом

const $ = (s, r=document) => r.querySelector(s);

// --------- HEALTH ---------
async function loadHealth(){
  try{
    const r = await fetch('/health', { credentials:'include' }); // є у твоєму сервері
    const j = await r.json();
    if(j.ok){
      $('#health').innerHTML = `
        <div><span class="ok">OK</span> • ${new Date(j.ts).toLocaleString()}</div>
        <div class="muted">API доступний</div>
      `;
    }else{
      $('#health').innerHTML = `<span class="bad">FAIL</span>`;
    }
  }catch(e){
    $('#health').innerHTML = `<span class="bad">Помилка</span> <span class="muted">${e.message}</span>`;
  }
}

// --------- SCORES (snapshot + live) ---------
async function loadScores(){
  try{
    const r = await fetch('/scores/public', { credentials:'include' }); // є у твоєму сервері
    const j = await r.json();
    renderScores(j);
  }catch(e){
    $('#scores').textContent = 'Помилка завантаження';
  }
}

function renderScores({ scoresSession={}, scoresGlobal={}, timer=0 }={}){
  const fmt = (obj={}) => Object.entries(obj)
    .sort((a,b)=> (b[1]||0)-(a[1]||0))
    .slice(0,5)
    .map(([u,p])=>`${u}: ${p}`).join(', ') || '—';
  $('#scores').innerHTML = `
    <div><b>A0</b> глобально: ${fmt(scoresGlobal.A0)} </div>
    <div><b>A1</b> глобально: ${fmt(scoresGlobal.A1)} </div>
    <div><b>A2</b> глобально: ${fmt(scoresGlobal.A2)} </div>
    <div class="muted" style="margin-top:6px">Таймер раунду: <span id="t">${timer}</span> с</div>
  `;
}

// Live через Socket.IO
const socket = io({ withCredentials:true });
socket.on('sync', ({ scoresSession, scoresGlobal }) => renderScores({ scoresSession, scoresGlobal }));
socket.on('tick', ({ timer }) => { const t=$('#t'); if(t) t.textContent = timer; });

// --------- PING DB ----------
$('#btnPing')?.addEventListener('click', async ()=>{
  const out = $('#pingOut');
  out.textContent = '...';
  try{
    const r = await fetch('/ping-db');
    const txt = await r.text();
    out.textContent = txt; // сервер повертає рядок "MySQL працює! ..."
  }catch(e){
    out.textContent = 'Помилка: ' + e.message;
  }
});

// --------- старт ---------
loadHealth();
loadScores();
