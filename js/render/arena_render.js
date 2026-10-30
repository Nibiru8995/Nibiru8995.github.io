'use strict';
/* ============================================================
   РЕНДЕР: АРЕНА «КОЛЫБЕЛЬ ВОЙНЫ» (render/arena_render.js)
   Canvas-автобатлер, версия «для показов» (фидбек раунда 4):
   - retina-чёткий канвас (devicePixelRatio);
   - живой фон: дарк-фэнтези ассет + дрейфующий туман, пепел,
     виньетка, мерцание жаровен;
   - отряды: спрайты с рамками редкости, боссы крупнее и с
     багровой аурой, взмахи ближнего боя (слэш-арки);
   - стрелки ПАЛЯТ болтами с трассами, попадания сыплют искры;
   - гибель: растворение + восходящая «душа», тряска экрана;
   - баннеры ПОБЕДА/ПОРАЖЕНИЕ, предпросмотр армий до боя.
   Логика боя — logic/arena.js.
   ============================================================ */

const battleCanvas = () => $('battleCanvas');
let battleBg = null, battleBgTried = false;

function battleCtx() {
  const cv = battleCanvas();
  if (!cv) return null;
  /* Retina: внутренний размер × dpr, рисуем в логических координатах */
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const needW = Math.round(ARENA.FIELD_W * dpr), needH = Math.round(ARENA.FIELD_H * dpr);
  if (cv.width !== needW || cv.height !== needH) {
    cv.width = needW; cv.height = needH;
  }
  const ctx = cv.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/* Фон поля: дарк-фэнтези ассет; без ассета — процедурный градиент */
function loadBattleBg() {
  if (battleBg || battleBgTried) return;
  battleBgTried = true;
  const img = new Image();
  img.onload = () => { battleBg = img; _bgCache = null; }; /* v1.5.9: сброс кэша статики */
  img.src = 'assets/arena/battlefield.jpg';
}

/* «Часы» атмосферы — тикают всегда, даже вне боя (туман/пепел в превью) */
function ambTime() { return performance.now() / 1000; }

/* ============================================================
   v1.5.9 (perf): КАНАС АРЕНЫ БЕЗ ПОСТОЯННОГО ПЕРЕСЧЕТА.
   drawBattleBg раньше КАЖДЫЙ кадр (и в мини-доке 60 раз/с, и в
   оверлее) создавал 3-4 градиента (фон-фолбэк, 2 пятна тумана,
   виньетка) — дорогие операции. Теперь:
   - статика (картинка фона + тени «дорог войны») рисуется ОДИН раз
     в офскрин-канвас и дальше кладётся одним drawImage;
   - туман — предзапечённый спрайт того же градиента, двигается так же;
   - виньетка — кэшированный объект градиента (координаты фиксированы).
   Пиксели кадра — те же самые; меняется только способ их получения.
   ============================================================ */
let _bgCache = null, _fogSprites = {}, _vgCache = new WeakMap();

function staticBgCanvas() {
  if (_bgCache) return _bgCache;
  const c = document.createElement('canvas');
  c.width = ARENA.FIELD_W; c.height = ARENA.FIELD_H;
  const x = c.getContext('2d');
  if (!x) return null;
  if (battleBg) x.drawImage(battleBg, 0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
  else {
    /* v1.3.1: без ассета — холодный серо-синий склеп вместо тёплого градиента */
    const g = x.createLinearGradient(0, 0, 0, ARENA.FIELD_H);
    g.addColorStop(0, '#0e1013'); g.addColorStop(0.6, '#14171b'); g.addColorStop(1, '#0a0c0e');
    x.fillStyle = g; x.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
    x.strokeStyle = '#00000055'; x.lineWidth = 1;
    for (let y = 70; y < ARENA.FIELD_H; y += 34) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(ARENA.FIELD_W, y); x.stroke();
    }
  }
  /* Три полосы движения — мягкая тень «дорог войны» */
  x.fillStyle = 'rgba(0,0,0,0.14)';
  [96, 160, 224].forEach(ly => { x.fillRect(0, ly - 22, ARENA.FIELD_W, 44); });
  _bgCache = c;
  return c;
}

function fogSprite(fr) {
  if (_fogSprites[fr]) return _fogSprites[fr];
  const c = document.createElement('canvas');
  c.width = c.height = Math.ceil(fr * 2);
  const x = c.getContext('2d');
  if (!x) return null;
  const fog = x.createRadialGradient(fr, fr, 10, fr, fr, fr);
  fog.addColorStop(0, 'rgba(150,158,168,0.10)');
  fog.addColorStop(1, 'rgba(150,158,168,0)');
  x.fillStyle = fog;
  x.fillRect(0, 0, fr * 2, fr * 2);
  _fogSprites[fr] = c;
  return c;
}

function cachedVignette(ctx, inner, outer, alpha) {
  let vg = _vgCache.get(ctx);
  if (!vg) {
    vg = ctx.createRadialGradient(ARENA.FIELD_W / 2, ARENA.FIELD_H / 2, inner, ARENA.FIELD_W / 2, ARENA.FIELD_H / 2, outer);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,' + alpha + ')');
    _vgCache.set(ctx, vg);
  }
  return vg;
}

function drawBattleBg(ctx) {
  const bg = staticBgCanvas();
  if (bg) ctx.drawImage(bg, 0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
  else { ctx.fillStyle = '#0e1013'; ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H); }
  const t = ambTime();
  /* Дрейфующий туман: два мягких пятна, гуляют в противофазе
     v1.3.1: холодный серый туман кладбища вместо тёплого
     v1.5.9: спрайт того же градиента — пиксель-в-пиксель */
  for (let i = 0; i < 2; i++) {
    const fx = ARENA.FIELD_W * (0.3 + 0.4 * i) + Math.sin(t * 0.11 + i * 2.7) * 90;
    const fy = 60 + i * 90 + Math.cos(t * 0.09 + i * 1.9) * 26;
    const fr = 150 + i * 60;
    const sp = fogSprite(fr);
    if (sp) ctx.drawImage(sp, fx - fr, fy - fr, fr * 2, fr * 2);
  }
  /* Пепел/искры в воздухе — медленно плывут вверх; в вайбе склепа — пепельно-голубые */
  for (let i = 0; i < 14; i++) {
    const ph = i * 2.399;
    const px = (ARENA.FIELD_W * ((i * 0.618) % 1) + Math.sin(t * 0.4 + ph) * 30 + ARENA.FIELD_W) % ARENA.FIELD_W;
    const py = ARENA.FIELD_H - ((t * (8 + (i % 4) * 4) + i * 47) % (ARENA.FIELD_H + 40));
    const a = 0.10 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2 + ph));
    ctx.fillStyle = i % 3 ? 'rgba(190,200,215,' + a + ')' : 'rgba(230,240,255,' + (a * 0.7) + ')';
    ctx.fillRect(px, py, 2, 2);
  }
  /* Виньетка + тёмная кайма (градиент кэшируется) */
  ctx.fillStyle = cachedVignette(ctx, 130, 340, 0.5);
  ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
}

function rarityFrameColor(r) {
  return ({ B: '#9a8a6a', 1: '#8a8a8a', 3: '#3a7ac0', 4: '#a070b0', 5: '#d4b050' })[r] || '#8a8a8a';
}

function drawUnit(ctx, u, imgCache, tNow) {
  const S = u.boss ? 56 : 42;
  const bob = Math.sin((tNow !== undefined ? tNow : battle.t) * 3 + u.bob) * 1.6;
  const deadA = u.dead ? Math.max(0, 1 - u.deadT * 2.2) : 1;
  if (deadA <= 0) return;
  const lungeX = u.lunge > 0 ? (u.side === 'hero' ? 7 : -7) * u.lunge : 0;
  const x = u.x + lungeX - S / 2, y = u.y + bob - S / 2;

  ctx.save();
  ctx.globalAlpha = u.dead ? deadA * 0.8 : 1;
  if (u.dead) ctx.translate(0, u.deadT * 14);

  /* тень */
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.ellipse(u.x, u.y + S * 0.42, S * 0.34, S * 0.12, 0, 0, 6.29);
  ctx.fill();

  /* боссовая аура: багровое пульсирующее сияние; элита — золотистая */
  if (u.boss && !u.dead) {
    const pulse = 0.22 + 0.12 * Math.sin(battle.t * 5);
    ctx.fillStyle = 'rgba(255,60,40,' + pulse.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + 4, S * 0.62, S * 0.5, 0, 0, 6.29);
    ctx.fill();
  } else if (u.elite && !u.dead) {
    const pulse = 0.16 + 0.1 * Math.sin(battle.t * 4 + u.bob);
    ctx.fillStyle = 'rgba(255,208,80,' + pulse.toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(u.x, u.y + 4, S * 0.55, S * 0.45, 0, 0, 6.29);
    ctx.fill();
  }

  /* спрайт */
  const img = imgCache(u.img);
  if (img) {
    ctx.drawImage(img, x, y, S, S);
  } else {
    ctx.fillStyle = u.side === 'hero' ? '#2a3a2a' : '#3a1a1a';
    ctx.fillRect(x, y, S, S);
  }

  /* вспышка попадания — мягкое «осветление» */
  if (u.flash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = u.flash * 0.55 * deadA;
    ctx.fillStyle = u.side === 'hero' ? '#ff9090' : '#ffe0a0';
    ctx.fillRect(x, y, S, S);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = deadA;
  }

  /* рамка стороны + цвет редкости */
  ctx.strokeStyle = u.side === 'hero' ? '#40a0c0' : '#c03030';
  ctx.globalAlpha = (u.dead ? deadA * 0.8 : 1) * 0.55;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, S - 1, S - 1);
  ctx.globalAlpha = u.dead ? deadA * 0.8 : 1;
  ctx.strokeStyle = rarityFrameColor(u.rarity) + '99';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, S - 5, S - 5);

  /* ВЗМАХ ближнего боя: белая арка в сторону врага */
  if (u.slash > 0 && !u.dead) {
    const dir = u.side === 'hero' ? 1 : -1;
    const prog = 1 - u.slash;
    ctx.save();
    ctx.translate(u.x + dir * S * 0.55, u.y);
    ctx.rotate(dir * (-0.7 + prog * 1.4));
    ctx.strokeStyle = 'rgba(255,240,200,' + (u.slash * 0.85).toFixed(2) + ')';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.52, -0.6, 0.6);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,' + (u.slash * 0.4).toFixed(2) + ')';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.38, -0.5, 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* HP-полоса: тёмная подложка, градиентная заливка, светлая кайма */
  const hpPct = Math.max(0, u.hp / u.maxHp);
  const bw = S + 10, bx = u.x + lungeX - bw / 2, by = y - 9;
  ctx.fillStyle = '#000000cc';
  ctx.fillRect(bx, by, bw, 6);
  const hg = ctx.createLinearGradient(bx, by, bx + bw, by);
  const hc = hpPct > 0.5 ? ['#2fae2f', '#66d866'] : hpPct > 0.2 ? ['#c9a227', '#ffe080'] : ['#c02020', '#ff6040'];
  hg.addColorStop(0, hc[0]); hg.addColorStop(1, hc[1]);
  ctx.fillStyle = hg;
  ctx.fillRect(bx + 1, by + 1, Math.max(0, (bw - 2) * hpPct), 4);
  ctx.strokeStyle = '#00000088';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, 5);

  /* численность отряда — тёмная плашка */
  if (u.k > 1) {
    ctx.font = 'bold 9px monospace';
    const label = 'x' + u.k;
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = '#000000aa';
    ctx.fillRect(x + S - tw - 8, y + S - 2, tw + 6, 11);
    ctx.fillStyle = '#ffe080';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + S - tw - 5, y + S + 7);
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

/* Статичные армии для предпросмотра (до боя): те же позиции, что в spawnBattle.
   v1.5.9 (perf): превью строится заново только когда сменились волна/отряд —
   раньше аллокации и сортировка были каждый кадр простоя. */
let _pvCache = null, _pvKey = null;
function previewArmies() {
  const wave = arenaState.enemy;
  const key = (wave ? wave.floor + '|' + wave.room + '|' + wave.name : '-') + '#' +
    Object.keys(fighters).map(id => id + ':' + fighters[id] + ':' + (fighterHpState[id] ? Math.round(fighterHpState[id]) : '')).join(',') + '#' +
    (battle.active ? 1 : 0);
  if (_pvCache && _pvKey === key) return _pvCache;
  const W = ARENA.FIELD_W;
  const out = { hero: [], foe: [] };
  buildHeroSquads().forEach((s, i) => {
    const r = CARDS[s.cardId].rarity;
    out.hero.push({
      side: 'hero', rarity: r, k: s.k, boss: false, dead: false, deadT: 0,
      img: CARD_ART_DIR + s.cardId + '.png', hp: 1, maxHp: 1,
      x: 110 + Math.floor(i / 3) * 46, y: laneY(i), bob: i * 1.3, flash: 0, lunge: 0, slash: 0
    });
  });
  (wave ? wave.units : []).forEach((d, i) => {
    out.foe.push({
      side: 'foe', rarity: d.rarity, k: d.k, boss: !!d.boss, dead: false, deadT: 0,
      img: foeSprite(d.faction, d.boss), hp: 1, maxHp: 1,
      x: W - 110 - Math.floor(i / 3) * 46, y: laneY(i), bob: i * 1.7, flash: 0, lunge: 0, slash: 0
    });
  });
  _pvCache = out; _pvKey = key;
  return out;
}

function renderBattle() {
  const ctx = battleCtx();
  if (!ctx) return;
  loadBattleBg();
  const t = ambTime();

  ctx.save();
  /* тряска экрана */
  if (battle.shake > 0.1) {
    ctx.translate((Math.random() - 0.5) * battle.shake * 2, (Math.random() - 0.5) * battle.shake * 2);
  }

  drawBattleBg(ctx);

  const tNow = battle.active ? battle.t : t;
  let units;
  if (battle.active) {
    units = battle.units.slice().sort((a, b) => (a.dead === b.dead ? a.y - b.y : a.dead ? -1 : 1));
  } else {
    /* превью: армии стоят друг напротив друга */
    const pv = previewArmies();
    units = pv.hero.concat(pv.foe).sort((a, b) => a.y - b.y);
  }
  units.forEach(u => drawUnit(ctx, u, imgCache, tNow));

  /* снаряды: светящийся болт с трассой */
  battle.projs.forEach(p => {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const tl = 12;
    ctx.strokeStyle = p.color + '66';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - (p.side === 'hero' ? tl : -tl), p.y + 1);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, 6.29);
    ctx.fill();
    ctx.fillStyle = '#ffffffcc';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.4, 0, 6.29);
    ctx.fill();
    ctx.restore();
  });

  /* искры: короткие штрихи, «души» — вверх */
  battle.sparks.forEach(s => {
    const a = Math.max(0, s.life / s.maxLife);
    ctx.globalAlpha = a;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (s.soul) {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y + 4);
    } else {
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - s.vx * 1.6, s.y - s.vy * 1.6);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  /* всплывающие цифры */
  ctx.textAlign = 'center';
  battle.floats.forEach(f => {
    ctx.globalAlpha = Math.max(0, f.life / f.maxLife);
    ctx.font = 'bold 12px monospace';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  });
  ctx.globalAlpha = 1;
  ctx.restore();

  /* Баннер ПОБЕДА/ПОРАЖЕНИЕ */
  if (battle.banner) {
    const b = battle.banner;
    const a = Math.min(1, b.life * 2.4);
    const scale = 1 + (1 - Math.min(1, b.life * 2)) * 0.15;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, ARENA.FIELD_H / 2 - 34, ARENA.FIELD_W, 68);
    ctx.translate(ARENA.FIELD_W / 2, ARENA.FIELD_H / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.strokeText(b.text, 0, 10);
    ctx.fillStyle = b.win ? '#ffd700' : '#ff5050';
    ctx.shadowColor = b.win ? '#c9a227' : '#ff2020';
    ctx.shadowBlur = 18;
    ctx.fillText(b.text, 0, 10);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  /* Превью до боя: мягкое затемнение + подсказка */
  if (!arenaState.fighting && !battle.active) {
    ctx.fillStyle = 'rgba(5,2,1,0.30)';
    ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
    ctx.textAlign = 'center';
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 2.4);
    ctx.font = 'bold 11px Georgia, serif';
    ctx.fillStyle = '#e8c060';
    ctx.fillText('— ЖДЁМ ПРИКАЗА —', ARENA.FIELD_W / 2, 24);
    ctx.globalAlpha = 1;
  }
}

/* ---------------- ПАНЕЛЬ БОЙЦОВ ---------------- */
function renderFighters() {
  const list = $('fightersList');
  list.innerHTML = '';
  const ids = Object.keys(fighters).sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity));
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
    if (isEliteRoom(i)) d.classList.add('elite');
    if (arenaState.cleared[i - 1]) d.classList.add('cleared');
    if (i === arenaState.room) d.classList.add('current');
    ind.appendChild(d);
  }
  /* Комната + фракция волны (цветом фракции) + метка элиты (v1.2) */
  const wf = waveFaction(arenaState.floor, arenaState.room);
  $('arenaRoomText').innerHTML = 'Комната ' + arenaState.room + ' / ' + ARENA.roomsPerFloor +
    (isEliteRoom(arenaState.room) ? ' · <b style="color:#ffe080">ЭЛИТА</b>' : '') +
    ' · <b style="color:' + FACTION_INFO[wf].color + '">' + FACTION_INFO[wf].name + '</b>';
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
  $('altarBuff').textContent = '✦ Мощь Алтаря: ×' + altarPower().toFixed(2) + ' к урону отрядов (звенья, хор и печати)';
  $('arenaStatus').textContent = arenaState.status;
  $('arenaStatus').className = 'arena-status ' + (arenaState.status.includes('Победа') || arenaState.status.includes('БОСС') ? 'win' : arenaState.status.includes('Поражение') ? 'lose' : '');
  /* v1.2.7: компактный док виден всегда — дублируем туда краткий статус */
  const dockStatus = $('arenaDockStatus');
  if (dockStatus) dockStatus.textContent = arenaState.status || 'Отряд ждёт приказа';
  const btn = $('arenaFightBtn'), retBtn = $('arenaRetreatBtn');
  /* ФИКС «прыжка» арены: кнопка всегда занимает место, показывается через visibility.
     Резец Тьмы: без эмодзи и капса. */
  if (arenaState.fighting) { btn.disabled = true; btn.textContent = 'Бой идёт…'; retBtn.classList.add('visible'); }
  else {
    btn.disabled = false; retBtn.classList.remove('visible');
    if (arenaState.cleared[arenaState.room - 1]) {
      btn.textContent = arenaState.room < ARENA.roomsPerFloor ? 'Следующая комната' : 'Новый этаж';
    } else btn.textContent = 'В бой';
  }
  if (!battle.active) renderBattle(); /* превью поля */
  renderArenaDockVisual(); /* Резец Тьмы: полосы и отряд в доке */
}

/* ------- Резец Тьмы: живой визуал боя в «Колыбели Войны” -------
   Полосы здоровья отряда (золотая) и волны (кровавая) + мини-арты
   бойцов из rendered fighters. Обновляется от updateHUD (heavy) и
   сразу после каждого хода автобоя. */
function renderArenaDockVisual() {
  const minePct = $('adMinePct'), foePct = $('adFoePct');
  const mineFill = $('adMineFill'), foeFill = $('adFoeFill');
  const foeName = $('adFoeName'), squadEl = $('adSquad');
  if (!minePct || !foeFill) return;

  /* Отряд: суммарный HP живых бойцов (в бою — по боевой записи) */
  let hNow = 0, hMax = 0;
  if (battle.active) {
    battle.units.filter(u => u.side === 'hero' && u.maxHp > 0).forEach(u => { hNow += Math.max(0, u.hp); hMax += u.maxHp; });
  } else {
    hMax = calcTotalHp();
    hNow = Object.values(fighterHpState).reduce((s, st) => s + Math.max(0, st.hp || 0), 0);
    if (hMax > 0 && hNow <= 0) hNow = hMax; /* свежий отряд — полный */
  }
  if (hMax <= 0) hMax = 1;
  const mP = Math.max(0, Math.min(100, (hNow / hMax) * 100));
  minePct.textContent = Math.round(mP) + '%';
  mineFill.style.width = mP + '%';

  /* Волна */
  const wave = arenaState.enemy;
  let fNow = 0, fMax = 0, fname = 'Волна';
  if (wave) {
    fname = wave.name;
    if (battle.active) {
      battle.units.filter(u => u.side === 'foe').forEach(u => { fNow += Math.max(0, u.hp); fMax += u.maxHp; });
      if (fMax <= 0) fMax = waveMaxHp(wave) * Math.max(1, wave.units.length);
    } else { fNow = fMax = waveMaxHp(wave); }
    if (fMax <= 0) fMax = 1;
    const fP = Math.max(0, Math.min(100, (fNow / fMax) * 100));
    foePct.textContent = Math.round(fP) + '%';
    foeFill.style.width = fP + '%';
  } else { foePct.textContent = '—'; foeFill.style.width = '0%'; }
  foeName.textContent = fname;

  /* Отряд-иконки: мини-арты текущих бойцов, павшие — тускнеют.
     v1.5.9 (perf): innerHTML перестраивается только при смене состава/
     состояния бойцов (раньше — 5 раз/с с пересозданием img-спрайтов). */
  const heroes = battle.active ? battle.units.filter(u => u.side === 'hero') : null;
  let html = '', sqSig = '';
  if (heroes) {
    heroes.forEach(u => {
      const card = CARDS[u.cardId || u.id];
      const dead = u.hp <= 0;
      sqSig += (u.cardId || u.id) + (dead ? '!' : '') + ';';
      const art = card ? cardArtHTML(card, 'ad-art', '') : '<img class="ad-art">';
      html += '<span class="ad-unit' + (dead ? ' dead' : '') + '">' + art + '</span>';
    });
  } else {
    Object.keys(fighters).forEach(id => {
      const card = CARDS[id];
      if (!card) return;
      const st = fighterHpState[id];
      const dead = st && st.hp <= 0;
      sqSig += id + (dead ? '!' : '') + ';';
      html += '<span class="ad-unit' + (dead ? ' dead' : '') + '">' + cardArtHTML(card, 'ad-art', '') + '</span>';
    });
  }
  if (squadEl.__sig !== sqSig) {
    squadEl.__sig = sqSig;
    squadEl.innerHTML = html || '<span>отряд пуст</span>';
  }
}

/* ============================================================
   v1.3.1 ТЗ: ЖИВОЙ ВИЗУАЛ АВТОБАТЛЕРА — мини-канвас в правой
   панели ПОД панелью «Колыбель Войны». Та же сцена, что на
   Поле боя (фон, отряды, волна, эффекты), обрезанная по центру.
   Клик — открыть оверлей (навешен в main.js).
   ============================================================ */
function renderMini() {
  const el = $('adCanvas'), wrap = $('arenaMini');
  if (!el || !wrap || wrap.style.display === 'none' || !wrap.offsetParent) return;
  const ctx = el.getContext('2d');
  if (!ctx) return;
  loadBattleBg();
  const W = el.width, H = el.height;
  const s = W / ARENA.FIELD_W;
  const sceneH = ARENA.FIELD_H * s;
  const offY = -(sceneH - H) / 2;             /* центр поля по вертикали */
  ctx.setTransform(s, 0, 0, s, 0, offY);
  drawBattleBg(ctx);
  let units;
  if (battle.active) units = battle.units.slice().sort((a, b) => (a.dead === b.dead ? a.y - b.y : a.dead ? -1 : 1));
  else {
    const pv = previewArmies();
    units = pv.hero.concat(pv.foe).sort((a, b) => a.y - b.y);
  }
  units.forEach(u => drawUnit(ctx, u, imgCache, battle.active ? battle.t : ambTime()));
  /* мягкая виньетка мини-поля (градиент кэшируется) */
  const vg = cachedVignette(ctx, 90, 300, 0.42);
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, ARENA.FIELD_W, ARENA.FIELD_H);
}

(function miniLoop() {
  try { renderMini(); } catch (e) { /* фон-исключения не роняют игру */ }
  requestAnimationFrame(miniLoop);
})();
