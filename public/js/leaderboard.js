const $ = (s,r=document)=>r.querySelector(s);
(async ()=>{
  const r = await fetch('/api/leaderboard');
  const data = await r.json();
  if (!data.ok){ $('#lb').innerHTML = '<li>Помилка завантаження</li>'; return; }
  $('#lb').innerHTML = data.items.map((it, i) =>
    `<li><span class="rank">${i+1}.</span> <span class="name">${it.name||('User '+it.id)}</span> <span class="score">${it.total}</span></li>`
  ).join('');
})();
