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

/* Контекст расчёта (заполняется в computeIncome, читается factionMult/рендер):
   ritual — клетки в ритуале (цепь от Алтаря), ritualOuter — «Второй круг» c9,
   formActive — активная формация алтаря, formCell — клетка-участник формации */
let INC_CTX = { uniquePairs: 0, armyMult: {}, ritual: new Set(), ritualOuter: new Set(), formActive: {}, formCell: {} };

/* ------- РЕЛИКВИИ 2.0: колоные эффекты (фидбек 7-8) -------
   Слот столбца держит реликвию: бафф/дебафф действует на столбец c.
   RELIC_COL_MULT — множитель дохода карт СВОЕГО столбца,
   RELIC_NEI_MULT — штраф соседним столбцам (c±1).
   Звеньевые эффекты (chain/sun — без затухания, titan — фактор²,
   chor — двойной Хор, voidr — выпадение из Хора) применяются в
   computeIncome к звеньям, касающимся столбца. */
const RELIC_COL_MULT = { forge: 1.6, chain: 0.8, chor: 0.75, titan: 2.5, voidr: 3.0, sun: 2.5 };
const RELIC_NEI_MULT = { forge: 0.85, sun: 0.7 };
function colRelicMap() {
  const m = {};
  if (epoch < RELIC_SLOT_EPOCH) return m;
  for (const k in relicSlots) { const r = relicById(relicSlots[k]); if (r) m[+k] = r.id; }
  return m;
}

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

/* ---------------- ФОРМАЦИИ (общая механика) ----------------
   У культистов СВОЯ геометрия (ритуал + формации Алтаря) —
   общий бонус «3 в ряд» им не положен (фидбек 3). */
function formation(r, c) {
  const it = grid[r][c]; if (!it) return 1;
  if (FACTION_INFO[faction].mechanic === 'formation') return 1;
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

/* ---------------- РИТУАЛ КУЛЬТИСТОВ (фидбек 3) ----------------
   Ритуал = множество клеток, соединённых цепочкой культистов
   с «Ритуальным Алтарём» (c4). Вне ритуала звенья культистов МЕРТВЫ.
   Формации Алтаря (Крест/Квадрат/Кольцо/Великий Круг) усиливают
   алтарь и участников. «Верховный Жрец» (c9) расползает ритуал
   на одну клетку дальше (+7.5% охваченным). */
const FORM_DEFS = [
  { kind: 'great',  mult: 4.0, label: 'Великий Круг' },
  { kind: 'ring',   mult: 3.0, label: 'Кольцо' },
  { kind: 'square', mult: 2.2, label: 'Квадрат' },
  { kind: 'cross',  mult: 2.0, label: 'Крест' }
];
function buildRitualContext() {
  INC_CTX.ritual = new Set(); INC_CTX.ritualOuter = new Set();
  INC_CTX.formActive = {}; INC_CTX.formCell = {};
  const isCult = (r, c) => !!(grid[r] && grid[r][c] && CARDS[grid[r][c].cardId].faction === 'cultist');
  const inB = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  const altars = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && grid[r][c].cardId === 'c4') altars.push([r, c]);
  if (!altars.length) return;
  /* BFS от алтарей по культистам (4-соседство) */
  const q = altars.slice();
  altars.forEach(([r, c]) => INC_CTX.ritual.add(r + ',' + c));
  for (let i = 0; i < q.length; i++) {
    const [cr, cc] = q[i];
    getNeighbors(cr, cc).forEach(n => {
      const k = n.r + ',' + n.c;
      if (INC_CTX.ritual.has(k) || CARDS[n.item.cardId].faction !== 'cultist') return;
      INC_CTX.ritual.add(k); q.push([n.r, n.c]);
    });
  }
  /* «Верховный Жрец» (c9): второй круг ритуала */
  INC_CTX.ritual.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    getNeighbors(r, c).forEach(n => {
      const nk = n.r + ',' + n.c;
      if (!INC_CTX.ritual.has(nk) && !INC_CTX.ritualOuter.has(nk) && isCult(n.r, n.c)) INC_CTX.ritualOuter.add(nk);
    });
  });
  /* Формации вокруг каждого Алтаря (клетки вне поля ломают узор) */
  altars.forEach(([ar, ac]) => {
    const orth = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [ar + dr, ac + dc]);
    const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => [ar + dr, ac + dc]);
    const r1 = NEI8.map(([dr, dc]) => [ar + dr, ac + dc]);
    const r2 = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      if (Math.max(Math.abs(dr), Math.abs(dc)) === 2) r2.push([ar + dr, ac + dc]);
    const b1 = r1.every(([r, c]) => inB(r, c));
    const allCult = list => list.every(([r, c]) => inB(r, c) && isCult(r, c));
    const allEmpty = list => list.every(([r, c]) => inB(r, c) && !grid[r][c]);
    let found = null;
    if (allCult(r2) && allCult(r1)) found = { kind: 'great', mult: 4.0, label: 'Великий Круг', cells: r2.concat(r1) };
    else if (b1 && allCult(r2) && allEmpty(r1)) found = { kind: 'ring', mult: 3.0, label: 'Кольцо', cells: r2 };
    else if (allCult(r1)) found = { kind: 'square', mult: 2.2, label: 'Квадрат', cells: r1 };
    else if (allCult(orth) && allEmpty(diag)) found = { kind: 'cross', mult: 2.0, label: 'Крест', cells: orth };
    if (!found) return;
    INC_CTX.formActive[ar + ',' + ac] = found;
    found.cells.forEach(([r, c]) => { INC_CTX.formCell[r + ',' + c] = found.kind; });
  });
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
    /* Алтарь (c4): множитель активной формации + 15% за ритуального соседа */
    if (card.id === 'c4') {
      const f = INC_CTX.formActive[r + ',' + c];
      const n = getNeighbors(r, c).filter(n => INC_CTX.ritual.has(n.r + ',' + n.c)).length;
      return (f ? f.mult : 1) * (1 + 0.15 * n);
    }
    const k = r + ',' + c;
    let m = 1;
    if (INC_CTX.ritual.has(k)) {
      if (INC_CTX.formCell[k]) m = 1.25;                         /* участник формации */
      else if (getNeighbors(r, c).some(n => n.item.cardId === 'c4')) m = 1.15; /* соседи Алтаря */
    } else if (INC_CTX.ritualOuter.has(k)) m = 1.075;            /* Второй круг (c9) */
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
  const pairSeen = {};        // pairIndex -> вес в Хоре (1 обычная, 2 — Хор Забвения; voidr-пары не попадают)
  const cellActs = {};        // 'r,c' -> [{pair, factor}]
  const linkFactors = {};     // linkKey -> эффективный множитель затухания (тултип, линии; 0 — мертво)
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

  /* РИТУАЛ культистов: строится до звеньев — звенья вне ритуала мертвы (фидбек 3) */
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'formation') buildRitualContext();

  /* РЕЛИКВИИ 2.0: карта столбец -> relicId (фидбек 7-8) */
  const colR = colRelicMap();
  const wardedUse = {};       // pairIndex -> сколько звеньев пары уже под Аурой Власти (кап 2)

  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    /* прямые соседи вправо и вниз, чтобы звено считалось один раз */
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const pair = findPair(CARDS[it.cardId], CARDS[grid[nr][nc].cardId]);
      if (!pair) continue;
      const idx = SYNERGY_PAIRS.indexOf(pair);
      const key = r + ',' + c, key2 = nr + ',' + nc;
      const lk = linkKey(r, c, nr, nc);
      const cardA = CARDS[it.cardId], cardB = CARDS[grid[nr][nc].cardId];

      /* КУЛЬТИСТЫ: звено живо только когда ОБА конца в ритуале (фидбек 3).
         Мёртвое звено не даёт доход, не жжёт слоты и не попадает в Хор. */
      if (mech === 'formation' && cardA.faction === 'cultist' && cardB.faction === 'cultist' &&
          (!INC_CTX.ritual.has(key) || !INC_CTX.ritual.has(key2))) {
        linkFactors[lk] = 0;
        continue;
      }

      /* Колонные реликвии звена: titan ×² , chain/sun — без затухания */
      const r1 = colR[c], r2 = colR[nc];
      const wardedLink = hasLich && (lichAdj.has(key) || lichAdj.has(key2));

      let factor;
      if (wardedLink && (wardedUse[idx] || 0) < 2) {
        /* «Лич» (★4): первые 2 звена КАЖДОЙ пары не затухают и не жгут слоты (фидбек 2) */
        wardedUse[idx] = (wardedUse[idx] || 0) + 1;
        factor = 1;
      } else {
        usage[idx] = (usage[idx] || 0) + 1;
        /* Затухание: у нежити своя, ЖЁСТКАЯ кривая (фидбек 2) */
        const curve = (cardA.faction === 'undead' && cardB.faction === 'undead') ? SYN_DR_UNDEAD : SYN_DR;
        factor = curve[Math.min(usage[idx] - 1, curve.length - 1)];
        if (r1 === 'titan' || r2 === 'titan') factor = factor * factor;
        if (r1 === 'chain' || r2 === 'chain' || r1 === 'sun' || r2 === 'sun') factor = 1;
      }
      /* «Голос Пустоты» (★5): затухание у культистов не ниже ×0.5 */
      if (hasVoice && cardA.faction === 'cultist' && cardB.faction === 'cultist')
        factor = Math.max(0.5, factor);
      (cellActs[key] = cellActs[key] || []).push({ pair, factor });
      (cellActs[key2] = cellActs[key2] || []).push({ pair, factor });
      linkFactors[lk] = factor;
      if (wardedLink) linkWarded[lk] = 1;

      /* Хор: вес пары (voidr исключает пару из Хора, chor удваивает) */
      let w = 1;
      if (r1 === 'chor' || r2 === 'chor') w = 2;
      if (r1 === 'voidr' || r2 === 'voidr') w = 0;
      if (w > 0) pairSeen[idx] = Math.max(pairSeen[idx] || 0, w);
    }
  }
  const uniquePairs = Object.keys(pairSeen).length;
  /* Хор синергий: взвешенная сумма пар; «Глаз Бездны» (★5) удваивает вклад */
  let divWeight = 0;
  for (const k in pairSeen) divWeight += pairSeen[k];
  const divBonus = DIVERSITY_BONUS * (hasEye ? 2 : 1);
  const divCap = DIVERSITY_CAP * (hasEye ? 2 : 1);
  const diversityMult = 1 + Math.min(divCap, divBonus * divWeight);
  const sealMult = 1 + 0.25 * sealLv.rich;

  /* Контекст для factionMult: уникальные пары */
  INC_CTX.uniquePairs = uniquePairs;

  /* АРМИЯ нежити: бонус за размер непрерывной компоненты (BFS по 4-соседству) */
  INC_CTX.armyMult = {};
  let armyBest = 0;
  if (mech === 'chain') {
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
    /* РЕЛИКВИИ 2.0: бафф/дебафф столбца + штраф соседним столбцам */
    let colM = RELIC_COL_MULT[colR[c]] || 1;
    const nl = RELIC_NEI_MULT[colR[c - 1]], nrk = RELIC_NEI_MULT[colR[c + 1]];
    if (nl) colM *= nl;
    if (nrk) colM *= nrk;
    const val = (card.baseRate * it.stacks * mult + flat) * factionMult(r, c, card, it) * formation(r, c) *
      (INC_CTX.armyMult[r + ',' + c] || 1) * colM;
    perCell[r + ',' + c] = val;
    total += val;
  }
  total *= diversityMult * sealMult;
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
