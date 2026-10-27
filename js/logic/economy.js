'use strict';
/* ============================================================
   ЛОГИКА: ЭКОНОМИКА (logic/economy.js)
   Доход карт: парные синергии с ЗАТУХАНИЕМ повторов (анти-спам),
   «Хор синергий» за разнообразие, формации, фракционные механики,
   АРМИЯ нежити (непрерывные цепи) и уникальные механики ★4/★5
   (SPECIALS в data/cards.js). Рендер отсюда не вызывается.
   ============================================================ */

const NEI4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const NEI8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

/* Контекст расчёта (заполняется в computeIncome, читается factionMult) */
let INC_CTX = { uniquePairs: 0, c4Cells: [], hasC9: false, armyMult: {} };

/* Активный временный буст (Жнец «Жатва», Вехи, Ускорение): ставит logic */
function activeAltBuff() {
  if (altBuff && altBuff.until > gameTime) return altBuff; /* gameTime — единое игровое время (скорость ×2/×4 учтена) */
  if (altBuff) { altBuff.mult = 1; altBuff.label = ''; }
  return altBuff || { mult: 1, until: 0, label: '' };
}

function rebuildPlayableMask() {
  playableMask = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
  const start = Math.floor((GRID_SIZE - playableSize) / 2);
  for (let r = start; r < start + playableSize; r++)
    for (let c = start; c < start + playableSize; c++) playableMask[r][c] = true;
}

function getNeighbors(r, c) {
  const res = [];
  for (const [dr, dc] of NEI4) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc]) res.push({ r: nr, c: nc, item: grid[nr][nc] });
  }
  return res;
}
function getNeighbors8(r, c) {
  const res = [];
  for (const [dr, dc] of NEI8) {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc]) res.push({ r: nr, c: nc, item: grid[nr][nc] });
  }
  return res;
}

function cardsOnGrid() {
  let n = 0;
  grid.forEach(row => row.forEach(i => { if (i) n++; }));
  return n;
}

/* Канонический ключ звена между двумя соседними клетками (порядок аргументов не важен).
   Используется экономикой и рендером — единая правда о затухании звеньев. */
function linkKey(r1, c1, r2, c2) {
  return (r1 < r2 || (r1 === r2 && c1 < c2)) ? (r1 + ',' + c1 + '|' + r2 + ',' + c2) : (r2 + ',' + c2 + '|' + r1 + ',' + c1);
}

/* ---------------- ФОРМАЦИИ (общая механика) ---------------- */
function formation(r, c) {
  const it = grid[r][c]; if (!it) return 1;
  const f = CARDS[it.cardId].faction;
  const same = (a, b) => grid[a] && grid[a][b] && CARDS[grid[a][b].cardId].faction === f;
  let m = 1;
  for (const [dr, dc] of [[0, 1], [1, 0]]) {
    let n = 1;
    for (let k = 1; k < 9; k++) { if (same(r + dr * k, c + dc * k)) n++; else break; }
    for (let k = 1; k < 9; k++) { if (same(r - dr * k, c - dc * k)) n++; else break; }
    if (n >= 3) m = Math.max(m, 1.15);
    if (n >= 5) m = Math.max(m, 1.5);
  }
  for (const [a, b] of [[0, 0], [0, -1], [-1, 0], [-1, -1]])
    if (same(r + a, c + b) && same(r + a + 1, c + b) && same(r + a, c + b + 1) && same(r + a + 1, c + b + 1)) m = Math.max(m, 1.3);
  return m;
}

/* ---------------- ФРАКЦИОННЫЕ МЕХАНИКИ + спец-механики ★4/★5 ---------------- */
function radius2(r, c) {
  const res = [];
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc]) res.push({ r: nr, c: nc, item: grid[nr][nc] });
  }
  return res;
}

function factionMult(r, c, card, item) {
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'chain') {
    /* «Скованный Смертью» (★5): рядом с ним цепь считается в радиусе 2 */
    const longChain = getNeighbors(r, c).some(n => n.item.cardId === 'u11');
    const src = longChain ? radius2(r, c) : getNeighbors(r, c);
    const nUndead = src.filter(n => CARDS[n.item.cardId].faction === 'undead').length;
    let m = 1 + 0.08 * nUndead;
    let nearAnchor = false, radius2Count = 0;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const oid = grid[nr][nc].cardId;
      if (oid === 'u10') { radius2Count++; if (dr || dc) nearAnchor = true; }
      else if (CARDS[oid].faction === 'undead') radius2Count++;
    }
    if (card.id === 'u10') m *= 1 + 0.1 * Math.max(0, radius2Count - 1);
    else if (nearAnchor) m *= 1.25;
    return m;
  }
  if (mech === 'formation') {
    if (card.id === 'c4') {
      const n4 = getNeighbors(r, c), n8 = getNeighbors8(r, c);
      const o = n4.length, d = n8.length - o;
      const formMult = (o + d) >= 8 ? 3.0 : d >= 4 ? 2.2 : o >= 4 ? 2.0 : 1.0;
      return formMult * (1 + 0.15 * (o + d));
    }
    let m = getNeighbors(r, c).some(n => n.item.cardId === 'c4') ? 1.15 : 1;
    /* «Верховный Жрец» (★4): аура Алтарей достаёт до 2-го круга (+7.5%) */
    if (INC_CTX.hasC9 && m === 1) {
      const twoAway = INC_CTX.c4Cells.some(([ar, ac]) => Math.abs(ar - r) <= 2 && Math.abs(ac - c) <= 2) &&
        !INC_CTX.c4Cells.some(([ar, ac]) => Math.abs(ar - r) <= 1 && Math.abs(ac - c) <= 1);
      if (twoAway) m = 1.075;
    }
    /* «Инквизитор» (★4): +25% за каждую уникальную пару на поле */
    if (card.id === 'c8') m *= Math.min(5, 1 + 0.25 * INC_CTX.uniquePairs);
    return m;
  }
  if (mech === 'cycle') {
    let m = 1 + (item.predBuff || 0) + (item.hydraBuff || 0) + (item.grifBuff || 0);
    if (card.id === 'b7') m *= 1 + 0.25 * getNeighbors(r, c).filter(n => CARDS[n.item.cardId].faction === 'beast').length;
    /* «Гидра» (★4): +10% за соседа-хищника */
    if (card.id === 'b9') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => isPredator(CARDS[n.item.cardId])).length;
    /* «Василиск» (★4): +10% за окаменевшего соседа (зверь ниже редкостью) */
    if (card.id === 'b8') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => {
      const pc = CARDS[n.item.cardId];
      return pc.faction === 'beast' && pc.rarity < card.rarity;
    }).length;
    return m;
  }
  if (mech === 'chaos') {
    let m = item.mutBuff || 1;
    const nb = getNeighbors(r, c);
    /* «Адский Рыцарь» (★4): +6% за соседа-демона */
    if (card.id === 'd8') m *= 1 + 0.06 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    /* «Князь Тьмы» (★5): +10% за демона в радиусе 2 */
    if (card.id === 'd10') m *= 1 + 0.10 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    /* «Кузня Хаоса» Балрога: накопленный бафф */
    if (card.id === 'd9' && item.balrBuff) m *= item.balrBuff;
    /* «Голод» (★5): +40% за соседа-демона, соседи теряют 10% */
    if (card.id === 'd11') m *= 1 + 0.40 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    else if (nb.some(n => n.item.cardId === 'd11')) m *= 0.9;
    return m;
  }
  return 1;
}

/* ---------------- РАСЧЁТ ДОХОДА (одним проходом) ---------------- */
function computeIncome() {
  const usage = {};           // pairIndex -> число НЕзащищённых активаций (слоты затухания)
  const pairSeen = {};        // пары хотя бы с одним звеном (для Хора — независимо от аур)
  const cellActs = {};        // 'r,c' -> [{pair, factor}]
  const linkFactors = {};     // linkKey -> эффективный множитель затухания (тултип, линии)
  const linkWarded = {};      // linkKey -> 1, если звено под Аурой Власти (Лич)

  /* Спец-флаги ★4/★5: Лич (снятие затухания), Голос Пустоты, Глаз Бездны */
  let hasLich = false, hasVoice = false, hasEye = false;
  const lichAdj = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'u8') {
      hasLich = true;
      lichAdj.add(r + ',' + c);
      getNeighbors(r, c).forEach(n => lichAdj.add(n.r + ',' + n.c));
    }
    else if (it.cardId === 'c11') hasVoice = true;
    else if (it.cardId === 'c10') hasEye = true;
  }

  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    /* прямые соседи вправо и вниз, чтобы звено считалось один раз */
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const pair = findPair(CARDS[it.cardId], CARDS[grid[nr][nc].cardId]);
      if (!pair) continue;
      const idx = SYNERGY_PAIRS.indexOf(pair);
      pairSeen[idx] = 1;
      const key = r + ',' + c, key2 = nr + ',' + nc;
      const lk = linkKey(r, c, nr, nc);
      /* «Лич» (★4): звенья рядом с ним НЕ затухают (×1.0) и НЕ расходуют
         слоты затухания пары — аура реально снимает штраф за множественные связи */
      if (hasLich && (lichAdj.has(key) || lichAdj.has(key2))) {
        (cellActs[key] = cellActs[key] || []).push({ pair, factor: 1 });
        (cellActs[key2] = cellActs[key2] || []).push({ pair, factor: 1 });
        linkFactors[lk] = 1; linkWarded[lk] = 1;
        continue;
      }
      usage[idx] = (usage[idx] || 0) + 1;
      let factor = SYN_DR[Math.min(usage[idx] - 1, SYN_DR.length - 1)];
      /* «Голос Пустоты» (★5): затухание у культистов не ниже ×0.5 */
      if (hasVoice && CARDS[it.cardId].faction === 'cultist' && CARDS[grid[nr][nc].cardId].faction === 'cultist')
        factor = Math.max(0.5, factor);
      (cellActs[key] = cellActs[key] || []).push({ pair, factor });
      (cellActs[key2] = cellActs[key2] || []).push({ pair, factor });
      linkFactors[lk] = factor;
    }
  }
  const uniquePairs = Object.keys(pairSeen).length;
  /* «Глаз Бездны» (★5): Хор вдвое сильнее; «Око Культиста» (реликвия): +2% за пару */
  const divBonus = (DIVERSITY_BONUS + (hasRelic('eye') ? 0.02 : 0)) * (hasEye ? 2 : 1);
  const divCap = DIVERSITY_CAP * (hasEye ? 2 : 1);
  const diversityMult = 1 + Math.min(divCap, divBonus * uniquePairs);
  const sealMult = 1 + 0.25 * sealLv.rich;

  /* Контекст для factionMult: уникальные пары, клетки Алтарей, Жрец */
  INC_CTX.uniquePairs = uniquePairs;
  INC_CTX.c4Cells = [];
  INC_CTX.hasC9 = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'c4') INC_CTX.c4Cells.push([r, c]);
    else if (it.cardId === 'c9') INC_CTX.hasC9 = true;
  }

  /* АРМИЯ нежити: бонус за размер непрерывной компоненты (BFS по 4-соседству) */
  INC_CTX.armyMult = {};
  let armyBest = 0;
  if (FACTION_INFO[faction].mechanic === 'chain') {
    const compId = {};
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
      const it = grid[r][c];
      if (!it || CARDS[it.cardId].faction !== 'undead') continue;
      if (compId[r + ',' + c]) continue;
      /* BFS новой компоненты */
      const cells = [], q = [[r, c]];
      compId[r + ',' + c] = 1;
      while (q.length) {
        const [cr, cc] = q.pop(); cells.push([cr, cc]);
        getNeighbors(cr, cc).forEach(n => {
          if (CARDS[n.item.cardId].faction !== 'undead' || compId[n.r + ',' + n.c]) return;
          compId[n.r + ',' + n.c] = 1; q.push([n.r, n.c]);
        });
      }
      const am = Math.min(2, 1 + 0.015 * (cells.length - 1));
      if (cells.length > armyBest) armyBest = cells.length;
      cells.forEach(([cr, cc]) => { INC_CTX.armyMult[cr + ',' + cc] = am; });
    }
  }

  const perCell = {};
  let total = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it) { continue; }
    const card = CARDS[it.cardId];
    let flat = 0, mult = 1;
    (cellActs[r + ',' + c] || []).forEach(a => {
      if (a.pair.kind === 'flat') flat += a.pair.value * it.stacks * a.factor;
      else mult *= 1 + (a.pair.value - 1) * a.factor;
    });
    const val = (card.baseRate * it.stacks * mult + flat) * factionMult(r, c, card, it) * formation(r, c) * (INC_CTX.armyMult[r + ',' + c] || 1);
    perCell[r + ',' + c] = val;
    total += val;
  }
  total *= diversityMult * sealMult;
  /* «Свеча Забвения» (реликвия): +10% дохода */
  total *= 1 + (hasRelic('candle') ? 0.10 : 0);
  /* «Жнец Душ» (★4): периодический буст «Жатва» на весь доход */
  total *= activeAltBuff().mult;
  incomeCache = { total, uniquePairs, perCell, pairUsage: usage, diversityMult, armyBest, armyMultOf: INC_CTX.armyMult,
    linkFactors, linkWarded, lichZone: Array.from(lichAdj) };
  return total;
}

function calculateIncome() { return incomeCache.total || 0; }
function calcCardIncome(r, c) { return incomeCache.perCell[r + ',' + c] || 0; }
function currentDiversity() { return incomeCache.uniquePairs || 0; }

function countLinks() {
  let n = 0;
  for (const k in incomeCache.pairUsage) n += incomeCache.pairUsage[k];
  return n;
}

/* Мощь Алтаря: бонус к урону Арены от синергий */
function altarPower() {
  return Math.min(3, (1 + 0.03 * countLinks()) * incomeCache.diversityMult);
}

/* ---------------- ЦЕНА КРУТКИ ----------------
   Растёт с числом круток за Эпоху, печати снижают */
function rollCost() {
  const raw = 150 * (1 + runRolls / 250) * (1 - 0.1 * sealLv.greed);
  return Math.max(30, Math.min(Math.round(raw), 150 * 25));
}
