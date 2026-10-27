'use strict';
/* ============================================================
   РЕНДЕР: АРЕНА «КОЛЫБЕЛЬ ВОЙНЫ» (render/arena_render.js)
   Canvas-автобатлер: фон поля, спрайты отрядов с HP-полосами,
   выпады атаки, вспышки попаданий, гибель с растворением,
   всплывающие цифры урона. Логика боя — logic/arena.js.
   ============================================================ */

const battleCanvas = () => $('battleCanvas');
let battleBg = null, battleBgTried = false;

function battleCtx() {
  const cv = battleCanvas();
  if (!cv) return null;
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  if (cv.width !== ARENA.FIELD_W || cv.height !== ARENA.FIELD_H) {
    cv.width = ARENA.FIELD_W; cv.height = ARENA.FIELD_H;
  }
  return ctx;
}

/* Фон поля: дарк-фэнтези ассет; без ассета — процедурный градиент */
function loadBattleBg() {
  if (battleBg || battleBgTried) return;
  battleBgTried = true;
  const img = new Image();
  img.onload = () => { battleBg = img; };
  img.src = 'assets/arena/battlefield.png';
}

function drawBattleBg(ctx) {
  if (battleBg) { ctx.drawImage(battleBg, 0, 0, ARENA.FIELD_W, ARENA.FIELD_H); return; }
  const g = ctx.createLinearGradient(0, 0, 0, ARENA.FIELD_H);
  g.addColorStop(0, '#150a06'); g.addColorStop(0.6, '#1e1009'); g.addColorStop(1, '#0d0704');
  ctx.fillStyle = g; ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
  ctx.strokeStyle = '#00000055'; ctx.lineWidth = 1;
  for (let y = 70; y < ARENA.FIELD_H; y += 34) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ARENA.FIELD_W, y); ctx.stroke();
  }
}

function drawUnit(ctx, u, imgCache) {
  const bob = Math.sin(battle.t * 3 + u.bob) * 1.6;
  const deadA = u.dead ? Math.max(0, 1 - u.deadT * 2.2) : 1;
  if (deadA <= 0) return;
  const lungeX = u.lunge > 0 ? (u.side === 'hero' ? 7 : -7) * u.lunge : 0;
  const S = 42;
  const x = u.x + lungeX - S / 2, y = u.y + bob - S / 2;

  ctx.save();
  ctx.globalAlpha = u.dead ? deadA : 1;
  if (u.dead) { ctx.globalAlpha = deadA * 0.8; ctx.translate(0, u.deadT * 14); }

  /* тень */
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(u.x, u.y + S * 0.42, S * 0.34, S * 0.12, 0, 0, 6.29);
  ctx.fill();

  /* спрайт */
  const img = imgCache(u.img);
  if (img) {
    ctx.drawImage(img, x, y, S, S);
  } else {
    ctx.fillStyle = u.side === 'hero' ? '#2a3a2a' : '#3a1a1a';
    ctx.fillRect(x, y, S, S);
  }

  /* вспышка попадания */
  if (u.flash > 0) {
    ctx.globalAlpha = u.flash * 0.75 * deadA;
    ctx.fillStyle = u.side === 'hero' ? '#ff8080' : '#ffe0a0';
    ctx.fillRect(x, y, S, S);
    ctx.globalAlpha = deadA;
  }

  /* рамка стороны */
  ctx.strokeStyle = u.side === 'hero' ? '#40a0c088' : '#c0303088';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);

  /* HP-полоса */
  const hpPct = Math.max(0, u.hp / u.maxHp);
  const bw = S + 8;
  ctx.fillStyle = '#000000aa';
  ctx.fillRect(x - 4, y - 8, bw, 5);
  ctx.fillStyle = hpPct > 0.5 ? '#40d040' : hpPct > 0.2 ? '#e0c040' : '#ff3030';
  ctx.fillRect(x - 3, y - 7, (bw - 2) * hpPct, 3);

  /* численность отряда */
  if (u.k > 1) {
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffe080';
    ctx.textAlign = 'left';
    ctx.fillText('x' + u.k, x + S - 8, y + S + 2);
  }
  ctx.restore();
}

const _imgCacheMap = {};
function imgCache(src) {
  if (!_imgCacheMap[src]) {
    const im = new Image();
    im.onload = () => { im._ok = true; };
    im.onerror = () => { im._ok = false; };
    im.src = src;
    _imgCacheMap[src] = im;
  }
  const im = _imgCacheMap[src];
  return im.complete && im.naturalWidth ? im : null;
}

function renderBattle() {
  const ctx = battleCtx();
  if (!ctx) return;
  loadBattleBg();
  drawBattleBg(ctx);
  /* мёртвые — под живыми */
  battle.units.slice().sort((a, b) => (a.dead === b.dead ? a.y - b.y : a.dead ? -1 : 1)).forEach(u => drawUnit(ctx, u, imgCache));
  /* всплывающие цифры */
  ctx.textAlign = 'center';
  battle.floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = 'bold 11px monospace';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  /* предпросмотр волны до боя: затемнение с текстом */
  if (!arenaState.fighting && !battle.active) {
    ctx.fillStyle = 'rgba(5,2,1,0.35)';
    ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
  }
}

/* ---------------- ПАНЕЛЬ БОЙЦОВ ---------------- */
function renderFighters() {
  const list = $('fightersList');
  list.innerHTML = '';
  const ids = Object.keys(fighters).sort((a, b) => CARDS[b].rarity - CARDS[a].rarity);
  ids.forEach(id => {
    const c = CARDS[id];
    const count = fighters[id];
    const row = document.createElement('div');
    const currentHp = fighterHpState[id] || fighterHp(c.rarity) * count;
    const maxHp = fighterHp(c.rarity) * count;
    row.className = 'fighter-row';
    row.innerHTML = '<div class="f-hp-bar" style="width:' + (currentHp / maxHp) * 100 + '%"></div>' +
      cardArtHTML(c, 'f-art', 'f-icon') + '<span class="f-name">' + c.name + '</span>' +
      '<span class="f-count">x' + count + '</span><span class="f-dmg">⚔' + fmt(fighterDmg(c.rarity) * count) + '</span>';
    if (currentHp <= 0) row.style.opacity = .4;
    row.title = 'Клик — вернуть в инвентарь';
    row.onclick = () => {
      if (arenaState.fighting) return;
      inventory[id] = (inventory[id] || 0) + fighters[id];
      delete fighters[id]; delete fighterHpState[id];
      renderFighters(); renderCollection(); updateArenaUI();
    };
    list.appendChild(row);
  });
  if (ids.length === 0) list.innerHTML = '<div class="fighter-empty">Нет бойцов.<br>Ctrl+клик или ПКМ по карте в коллекции,<br>чтобы добавить её в бойцы.</div>';
  $('fightersTotalDmg').textContent = 'Σ ' + fmt(calcTotalDamage());
}

/* ---------------- ПАНЕЛЬ АРЕНЫ ---------------- */
function updateArenaUI() {
  const wave = arenaState.enemy;
  $('arenaFloorNum').textContent = arenaState.floor;
  const ind = $('roomIndicator');
  ind.innerHTML = '';
  for (let i = 1; i <= ARENA.roomsPerFloor; i++) {
    const d = document.createElement('div');
    d.className = 'room-dot';
    if (i === ARENA.roomsPerFloor) d.classList.add('boss');
    if (arenaState.cleared[i - 1]) d.classList.add('cleared');
    if (i === arenaState.room) d.classList.add('current');
    ind.appendChild(d);
  }
  $('arenaRoomText').textContent = '✖ Комната ' + arenaState.room + ' / ' + ARENA.roomsPerFloor;
  /* Волна врагов: имя + суммарный HP (по живым отрядам в бою или полный) */
  if (wave) {
    let hpNow, hpMax;
    if (battle.active) {
      hpNow = battle.units.filter(u => u.side === 'foe').reduce((s, u) => s + u.hp, 0);
      hpMax = battle.units.filter(u => u.side === 'foe').reduce((s, u) => s + u.maxHp, 0) || 1;
    } else {
      hpNow = hpMax = waveMaxHp(wave);
    }
    $('arenaMonsterName').textContent = wave.name;
    const pct = Math.max(0, (hpNow / hpMax) * 100);
    $('arenaEnemyBar').style.width = pct + '%';
    $('arenaEnemyHp').textContent = fmt(Math.ceil(hpNow)) + ' / ' + fmt(hpMax);
  }
  $('arenaStatAtk').textContent = fmt(calcTotalDamage());
  $('arenaStatHp').textContent = fmt(calcTotalHp());
  $('arenaStatDmg').textContent = fmt(calcTotalDamage());
  $('altarBuff').textContent = '🔱 Мощь Алтаря: ×' + altarPower().toFixed(2) + ' к урону отрядов (звенья, хор и печати)';
  $('arenaStatus').textContent = arenaState.status;
  $('arenaStatus').className = 'arena-status ' + (arenaState.status.includes('Победа') || arenaState.status.includes('БОСС') ? 'win' : arenaState.status.includes('Поражение') ? 'lose' : '');
  const btn = $('arenaFightBtn'), retBtn = $('arenaRetreatBtn');
  /* ФИКС «прыжка» арены: кнопка всегда занимает место, показывается через visibility */
  if (arenaState.fighting) { btn.disabled = true; btn.textContent = '⚔ БОЙ ИДЁТ...'; retBtn.classList.add('visible'); }
  else {
    btn.disabled = false; retBtn.classList.remove('visible');
    if (arenaState.cleared[arenaState.room - 1]) {
      btn.textContent = arenaState.room < ARENA.roomsPerFloor ? '➡ Следующая комната' : '🏆 Новый этаж';
    } else btn.textContent = '⚔ В БОЙ';
  }
  if (!battle.active) renderBattle(); /* превью поля */
}
