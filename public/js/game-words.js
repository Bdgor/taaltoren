const $ = (s, r=document) => r.querySelector(s);

async function myStats(){
  const r = await fetch('/api/my-stats', { credentials:'include' });
  const data = await r.json();
  if (data.ok) {
    const t = `${data.stats.score} / ${data.stats.balance} / ${data.stats.total}`;
    $('#ratingBubble').textContent = t;
  }
}

async function nextQuestion(){
  const level = $('#level').value;
  const r = await fetch(`/api/words/question?level=${encodeURIComponent(level)}`, { credentials:'include' });
  const data = await r.json();
  if (!data.ok) {
    $('#questionBox').innerHTML = `<div class="muted">Немає питань для рівня ${level}</div>`;
    return;
  }

  const q = data.question;
  const opts = q.options.map(o => 
    `<button class="tt-btn tt-option" data-choice="${o.text}">${o.text}</button>`
  ).join(' ');

  $('#questionBox').innerHTML = `
    <div class="tt-card-inner">
      <div class="tt-prompt"><strong>${q.prompt}</strong></div>
      <div class="tt-row" style="gap:8px;flex-wrap:wrap;margin-top:8px">${opts}</div>
    </div>`;
  $('#feedback').textContent = '';

  document.querySelectorAll('.tt-option').forEach(btn=>{
    btn.addEventListener('click', ()=> answerQuestion(q.wordId, btn.dataset.choice));
  });
}

async function answerQuestion(wordId, choice){
  const r = await fetch('/api/words/answer', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    credentials:'include',
    body: JSON.stringify({ wordId, choice })
  });
  const data = await r.json();
  if (data.ok){
    $('#feedback').textContent = data.correct ? '✅ Правильно! +1 очко' : '❌ Неправильно. -1 очко';
    await myStats();
  } else {
    $('#feedback').textContent = 'Помилка: ' + (data.error || 'невідомо');
  }
}

$('#btnNext')?.addEventListener('click', nextQuestion);

// Ігровий автомат
$('#btnPlay')?.addEventListener('click', async ()=>{
  const bet = parseInt($('#bet').value||0);
  const m = $('#machineMsg'); m.textContent = 'Крутимо…';
  const r = await fetch('/api/game/play', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body: JSON.stringify({ bet })
  });
  const data = await r.json();
  if (data.ok){
    m.textContent = `Баланс: ${data.stats.balance}. ${bet>=10?'':'(мін. ставка 10)'}`;
    await myStats();
  } else {
    m.textContent = 'Помилка: ' + (data.error || 'невідомо');
  }
});

$('#btnDeposit')?.addEventListener('click', async ()=>{
  const amount = parseInt($('#depAmt').value||0);
  const m = $('#machineMsg'); 
  const r = await fetch('/api/game/deposit', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body: JSON.stringify({ amount })
  });
  const data = await r.json();
  if (data.ok){ m.textContent = 'Переказано в баланс.'; await myStats(); }
  else { m.textContent = 'Помилка: ' + (data.error || 'невідомо'); }
});

$('#btnWithdraw')?.addEventListener('click', async ()=>{
  const amount = parseInt($('#wdAmt').value||0);
  const m = $('#machineMsg'); 
  const r = await fetch('/api/game/withdraw', {
    method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
    body: JSON.stringify({ amount })
  });
  const data = await r.json();
  if (data.ok){ m.textContent = 'Виведено в загальну суму.'; await myStats(); }
  else { m.textContent = 'Помилка: ' + (data.error || 'невідомо'); }
});

myStats();
