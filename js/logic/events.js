'use strict';
/* ============================================================
   ЛОГИКА: ЗНАМЕНИЯ (logic/events.js)
   Активный слой для Алтаря: раз в ~1.5-2.5 минуты на случайной
   клетке вспыхивает Знамение (18 игровых секунд):
   - 💠 Жила Бездны — мгновенно +45 сек дохода (половина — в порог Эпохи);
   - ⏱ Ускорение — доход ×3..×6 (растёт с Эпохой) на 30-60 сек;
   - 🔮 Реликварий — случайная неполученная Реликвия (или крупная компенсация).
   Спавн отключён в обучении (noSave). Сбор: клик по иконке.
   ============================================================ */

let omenTimer = 75, omens = [];

function tickOmens(dt) {
  if (!gameStarted || gamePaused || noSave) return;
  omenTimer -= dt;
  const before = omens.length;
  omens = omens.filter(o => o.until > gameTime); /* игровое время — при ×4 знамение живёт те же 18 игровых секунд */
  if (omens.length !== before) renderOmens();
  if (omenTimer <= 0) {
    spawnOmen();
    omenTimer = 95 + Math.random() * 55;
  }
  /* обратный отсчёт на иконках */
  omens.forEach(o => {
    const el = document.getElementById('omen-' + o.r + '-' + o.c);
    if (el) {
      const s = Math.ceil(o.until - gameTime);
      const lbl = el.querySelector('.omen-sec');
      if (lbl && lbl.textContent !== String(s)) lbl.textContent = s;
    }
  });
}

function spawnOmen() {
  if (omens.length >= 2) return;
  const st = gridStart(), open = [];
  for (let r = st; r < st + playableSize; r++)
    for (let c = st; c < st + playableSize; c++)
      if (!omens.some(o => o.r === r && o.c === c)) open.push([r, c]);
  if (!open.length) return;
  const [r, c] = pick(open);
  const type = Math.random() < 0.6 ? 'vein' : 'haste';
  omens.push({ r, c, type, until: gameTime + 18 });
  renderOmens();
  toast('✨ <b>Знамение</b> на Алтаре! Жми, пока не погасло');
  /* v1.0: Знамения БОЛЬШЕ НЕ озвучиваются (фидбек: меньше звуков) — только вспышка */
  if (!guideSeen.omen) { guideQueue.push('omen'); guideQueueRun(); }
}

function collectOmen(o) {
  const idx = omens.indexOf(o);
  if (idx < 0) return;
  omens.splice(idx, 1);
  stats.omens = (stats.omens || 0) + 1;
  const colors = { vein: ['#80e0ff', '#e8c060', '#fff'], haste: ['#80e060', '#fff', '#e8c060'] }[o.type];
  fxAtCell(o.r, o.c, colors, 26, 'wave');
  if (o.type === 'vein') {
    /* v1.2.6: +45 сек дохода — целиком ВНЕ порога Эпохи (иначе Эпохи копились слишком быстро). */
    const gain = Math.max(400, Math.round(calculateIncome() * 45));
    crystals += gain; incomeExempt += gain;
    fxAtCell(o.r, o.c, colors, 0);
    fxFloatFromCell(o.r, o.c, '+' + fmtShort(gain) + ' 💎', '#80e0ff');
    sfx('win');
  } else {
    /* Ребаланс (пункт 6 ТЗ): множитель и длительность растут с Эпохой: ×3..×6, 30..60 сек. */
    const mult = Math.min(6, 3 + Math.floor((epoch - 1) / 3));
    const dur = Math.min(60, 30 + epoch * 3);
    altBuff = { mult, until: gameTime + dur, label: '⏱ УСКОРЕНИЕ ×' + mult };
    fxFloatFromCell(o.r, o.c, '×' + mult + ' НА ' + dur + 'с', '#80e060');
    sfx('relic');
  }
  updateHUD(); saveRun(); checkAchievements();
  renderOmens();
}

/* Всплывающая цифра над клеткой (через canvas-FX) */
function fxFloatFromCell(r, c, text, color, size) {
  if (!fxOK()) return;
  const n = playableSize, st = gridStart();
  const cell = gridEl.children[(r - st) * n + (c - st)];
  if (!cell) return;
  const b = cell.getBoundingClientRect();
  fxFloat(b.left + b.width / 2, b.top, text, color, size);
}

/* Отрисовка слоя знамений поверх грида (спрайты + эмодзи-фолбэк) */
const OMEN_META = {
  vein:  { icon: '💠', name: 'Жила Бездны', img: 'assets/fx/omen_vein.png' },
  haste: { icon: '⏱', name: 'Ускорение',  img: 'assets/fx/omen_haste.png' }
};
function omenIconHTML(type) {
  const m = OMEN_META[type];
  return '<img class="omen-img" src="' + m.img + '" alt="" onerror="cardArtFail(this,\'omen-ic\',\'' + m.icon + '\')">';
}
/* v1.5.9 (perf): слой знамений перестраивается только когда список
   знамений/размер поля реально изменились (renderOmens зовётся из
   каждого renderGrid, а знамения меняются раз в минуты). */
let _omensSig = null;
function renderOmens() {
  const layer = document.getElementById('omenLayer');
  if (!layer) return;
  const sig = playableSize + '|' + omens.map(o => o.r + '-' + o.c + '-' + o.type).join(',');
  if (sig === _omensSig) return;
  _omensSig = sig;
  layer.innerHTML = '';
  const n = playableSize, st = gridStart();
  omens.forEach(o => {
    const cell = gridEl.children[(o.r - st) * n + (o.c - st)];
    if (!cell) return;
    const b = cell.getBoundingClientRect(), wrapEl = document.getElementById('gridWrap');
    const w = wrapEl && wrapEl.getBoundingClientRect ? wrapEl.getBoundingClientRect() : { left: 0, top: 0 };
    const d = document.createElement('div');
    d.className = 'omen omen-' + o.type;
    d.id = 'omen-' + o.r + '-' + o.c;
    d.style.left = (b.left - w.left + b.width / 2 - 21) + 'px';
    d.style.top = (b.top - w.top + b.height / 2 - 21) + 'px';
    d.innerHTML = omenIconHTML(o.type) + '<span class="omen-sec">18</span>';
    d.title = OMEN_META[o.type].name + ' — кликни!';
    d.onclick = ev => { ev.stopPropagation(); collectOmen(o); };
    layer.appendChild(d);
  });
}
