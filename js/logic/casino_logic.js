'use strict';
/* ============================================================
   ЛОГИКА: КАЗИНО (logic/casino_logic.js)
   Математика игр: слоты, рулетка, покер. Минимальная ставка
   MIN_BET = 1000 💎 (пункт 9 ТЗ). DOM-отрисовка в render/casino_render.js.
   ============================================================ */

let casinoBet = 0, casinoSpinning = false;

function getSlotSymbol() {
  let total = 0;
  for (const k in SLOT_WEIGHTS) total += SLOT_WEIGHTS[k];
  let r = Math.random() * total;
  for (const k in SLOT_WEIGHTS) { r -= SLOT_WEIGHTS[k]; if (r <= 0) return k; }
  return '🍒';
}
function generateSlotGrid() {
  return Array.from({ length: 3 }, () => Array(5).fill(null).map(() => getSlotSymbol()));
}
function checkGridWin(g) {
  let results = [], totalWin = 0, scatterCount = 0;
  g.forEach(row => row.forEach(sym => { if (sym === SCATTER_SYMBOL) scatterCount++; }));
  if (scatterCount >= 3) {
    const scatterMult = scatterCount === 3 ? 5 : scatterCount === 4 ? 20 : 100;
    results.push({ type: 'scatter', count: scatterCount, mult: scatterMult });
    totalWin += scatterMult;
  }
  PAYLINES.forEach((line, idx) => {
    const symbols = line.map((row, col) => g[row][col]);
    let firstSym = symbols[0] === WILD_SYMBOL ? null : symbols[0], comboLen = 0;
    for (let i = 0; i < 5; i++) {
      const sym = symbols[i];
      if (sym === SCATTER_SYMBOL) break;
      if (sym === WILD_SYMBOL) { comboLen++; continue; }
      if (firstSym === null) { firstSym = sym; comboLen++; continue; }
      if (sym === firstSym) { comboLen++; continue; }
      break;
    }
    if (comboLen >= 3 && firstSym !== null) {
      const mult = SLOT_PAYOUTS[firstSym] ? SLOT_PAYOUTS[firstSym][comboLen - 3] : 0;
      if (mult > 0) { results.push({ type: 'line', line: idx, mult, len: comboLen, firstSym }); totalWin += mult; }
    }
  });
  return { results, totalWin };
}

/* Статистика казино + учёт проигрышей для ачивки */
function rec(game, net) {
  if (!net) return;
  const o = stats.g[game] || (stats.g[game] = { w: 0, l: 0, net: 0 });
  net > 0 ? o.w++ : o.l++;
  o.net += net;
  if (net < 0) stats.casinoLost += -net;
  sfx(net > 0 ? 'win' : 'lose');
  if (net > 0) {
    /* «Кости Игрока» (реликвия): выигрыши +10% сверху */
    if (hasRelic('dice')) {
      const bonus = Math.round(net * 0.10);
      crystals += bonus;
      toast('🎲 Кости Игрока: +' + fmt(bonus) + ' 💎 сверху');
    }
    /* Крупный выигрыш может принести РЕЛИКВИЮ */
    if (net >= MIN_BET * 20 && Math.random() < 0.15) grantRandomRelic();
    updateHUD();
  }
}

/* Проверка ставки (все игры казино) */
function validateBet(v) {
  if (!(v >= MIN_BET)) { toast('Минимальная ставка ' + fmt(MIN_BET) + ' 💎'); return 0; }
  if (v > crystals) { toast('Не хватает 💎'); return 0; }
  return Math.floor(v);
}

/* ---- Рулетка: выплаты ---- */
function roulettePay(k, n) {
  if (k[0] === 'n') return +k.slice(2) === n ? 36 : 0;
  if (!n) return 0;
  return {
    red: ROULETTE_RED.has(n) ? 2 : 0, black: !ROULETTE_RED.has(n) ? 2 : 0,
    even: n % 2 === 0 ? 2 : 0, odd: n % 2 ? 2 : 0,
    low: n <= 18 ? 2 : 0, high: n >= 19 ? 2 : 0,
    d1: n <= 12 ? 3 : 0, d2: n > 12 && n <= 24 ? 3 : 0, d3: n > 24 ? 3 : 0,
    c1: n % 3 === 1 ? 3 : 0, c2: n % 3 === 2 ? 3 : 0, c3: n % 3 === 0 ? 3 : 0
  }[k];
}

/* ---- Покер: математика ---- */
const pCard = c => POKER_RANKS[c >> 2] + POKER_SUITS[c & 3];
const pIsRed = c => (c & 3) === 1 || (c & 3) === 2;
function mkDeck() {
  const d = [];
  for (let i = 0; i < 52; i++) d.push(i);
  for (let i = 51; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function pScore5(a) {
  const r = a.map(c => c >> 2).sort((x, y) => y - x);
  const fl = a.every(c => (c & 3) === (a[0] & 3));
  const cnt = {};
  r.forEach(x => cnt[x] = (cnt[x] || 0) + 1);
  const g = Object.entries(cnt).map(([k, v]) => [v, +k]).sort((x, y) => y[0] - x[0] || y[1] - x[1]);
  const u = [...new Set(r)];
  let st = 0;
  if (u.length === 5) {
    if (u[0] - u[4] === 4) st = u[0] + 1;
    else if (u.join() === '12,3,2,1,0') st = 4;
  }
  const cat = st && fl ? 8 : g[0][0] === 4 ? 7 : g[0][0] === 3 && g[1][0] === 2 ? 6 : fl ? 5 : st ? 4 : g[0][0] === 3 ? 3 : g[0][0] === 2 && g[1][0] === 2 ? 2 : g[0][0] === 2 ? 1 : 0;
  const key = st ? [st - 1] : g.map(x => x[1]);
  return cat * 1e7 + key.reduce((s, x, i) => s + x * Math.pow(15, 4 - i), 0);
}
function pBest(h) {
  let b = 0;
  for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) {
    const s = pScore5(h.filter((_, k) => k !== i && k !== j));
    if (s > b) b = s;
  }
  return b;
}
function pEquity(h, bd, n) {
  const used = new Set(h.concat(bd)), rest = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) rest.push(c);
  const need = 2 + 5 - bd.length;
  let w = 0;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < need; k++) {
      const j = k + Math.random() * (rest.length - k) | 0;
      [rest[k], rest[j]] = [rest[j], rest[k]];
    }
    const bd2 = bd.concat(rest.slice(2, need));
    const a = pBest(h.concat(bd2)), b = pBest([rest[0], rest[1]].concat(bd2));
    w += a > b ? 1 : a === b ? .5 : 0;
  }
  return w / n;
}
