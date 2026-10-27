'use strict';
/* ============================================================
   ЛОГИКА: ЗНАМЕНИЯ (logic/events.js)
   Активный слой для Алтаря: раз в ~1.5-2.5 минуты на случайной
   клетке вспыхивает Знамение (18 игровых секунд):
   - 💠 Жила Бездны — мгновенно +90 сек дохода (идёт в порог Эпохи);
   - ⏱ Ускорение — весь доход ×3 на 30 игровых секунд;
   - 🔮 Реликварий — случайная неполученная Реликвия.
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
    omenTimer = (95 + Math.random() * 55) * (hasRelic('heart') ? 0.75 : 1);
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
  let type;
  const roll = Math.random();
  if (roll < 0.14 && unownedRelics().length) type = 'relic';
  else type = roll < 0.62 ? 'vein' : 'haste';
  omens.push({ r, c, type, until: gameTime + 18 });
  renderOmens();
  sfx('omen');
  toast('✨ <b>Знамение</b> на Алтаре! Жми, пока не погасло');
  if (!guideSeen.omen) { guideQueue.push('omen'); guideQueueRun(); }
}

function collectOmen(o) {
  const idx = omens.indexOf(o);
  if (idx < 0) return;
  omens.splice(idx, 1);
  stats.omens = (stats.omens || 0) + 1;
  const colors = { vein: ['#80e0ff', '#e8c060', '#fff'], haste: ['#80e060', '#fff', '#e8c060'], relic: ['#c9a227', '#e8c060', '#fff'] }[o.type];
  fxAtCell(o.r, o.c, colors, 26, 'wave');
  if (o.type === 'vein') {
    const gain = Math.max(500, Math.round(calculateIncome() * 90));
    crystals += gain; runEarned += gain;
    fxAtCell(o.r, o.c, colors, 0);
    fxFloatFromCell(o.r, o.c, '+' + fmtShort(gain) + ' 💎', '#80e0ff');
    sfx('win');
  } else if (o.type === 'haste') {
    altBuff = { mult: 3, until: gameTime + 30, label: '⏱ УСКОРЕНИЕ ×3' };
    fxFloatFromCell(o.r, o.c, '×3 НА 30с', '#80e060');
    sfx('relic');
  } else {
    if (!grantRandomRelic()) {
      const gain = Math.max(2000, Math.round(calculateIncome() * 240));
      crystals += gain; runEarned += gain;
      fxFloatFromCell(o.r, o.c, '+' + fmtShort(gain) + ' 💎', '#e8c060');
    } else fxFloatFromCell(o.r, o.c, 'РЕЛИКВИЯ!', '#c9a227', 22);
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

/* Отрисовка слоя знамений поверх грида */
function renderOmens() {
  const layer = document.getElementById('omenLayer');
  if (!layer) return;
  layer.innerHTML = '';
  const n = playableSize, st = gridStart();
  const meta = { vein: ['💠', 'Жила Бездны'], haste: ['⏱', 'Ускорение ×3'], relic: ['🔮', 'Реликварий'] };
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
    d.innerHTML = '<span class="omen-ic">' + meta[o.type][0] + '</span><span class="omen-sec">18</span>';
    d.title = meta[o.type][1] + ' — кликни!';
    d.onclick = ev => { ev.stopPropagation(); collectOmen(o); };
    layer.appendChild(d);
  });
}
