'use strict';
/* ============================================================
   ЛОГИКА: КАЗИНО (logic/casino_logic.js)
   Математика игр: слоты, рулетка, блэкджек. Минимальная ставка
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
  if (net > 0) updateHUD();
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

/* ---- Блэкджек: математика (v1.3.0 — вместо покера) ----
   Карта — число 0..51: ранг = c % 13 (0 — туз), масть = (c/13|0) % 4.
   Туз = 11 с мягким пересчётом в 1 при переборе. */
function bjShoe(nDecks) {
  const d = [];
  for (let n = 0; n < nDecks; n++) for (let i = 0; i < 52; i++) d.push(i);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
const bjCard = c => BJ_RANKS[c % 13] + BJ_SUITS[(c / 13 | 0) % 4];
const bjRed = c => ((c / 13 | 0) % 4) === 1 || ((c / 13 | 0) % 4) === 2;
const bjRankVal = c => c % 13 === 0 ? 11 : Math.min(10, c % 13 + 1);
function bjHandVal(hand) {
  let t = 0, aces = 0;
  hand.forEach(c => { const v = bjRankVal(c); t += v; if (v === 11) aces++; });
  while (t > 21 && aces > 0) { t -= 10; aces--; }
  return t;
}
const bjIsBlackjack = hand => hand.length === 2 && bjHandVal(hand) === 21;
const bjBusted = hand => bjHandVal(hand) > 21;
