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

/* ------- РЕЛИКВИИ 3.0: движок видов эффектов (фидбек 8) -------
   Слот столбца держит фракционную реликвию. Вид эффекта описан
   в RELIC_KIND_ENGINE (data/relics.js); базовый множитель столбца
   и штраф соседям — colMult/nei. Спец-виды (form/hunt/fertile/apex/
   king/chaos/hungerFast) применяются во фракционных ветках. */
function colRelicMap() {
  const m = {};
  if (epoch < RELIC_SLOT_EPOCH) return m;
  for (const k in relicSlots) { const r = relicById(relicSlots[k]); if (r) m[+k] = r.kind; }
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
   общий бонус «3 в ряд» им не положен (фидбек 3).
   Звери (фидбек 4) формаций НЕ имеют вовсе: их инкам —
   только от нанесения урона/кормления друг другу. */
function formation(r, c) {
  const it = grid[r][c]; if (!it) return 1;
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'formation' || mech === 'cycle') return 1;
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

/* ---------------- РИТУАЛ КУЛЬТИСТОВ (фидбек 3, усилен раундом 3) ----------------
   Ритуал = множество клеток, соединённых цепочкой культистов
   с «Ритуальным Алтарём» (c4). ВНЕ ритуала культист даёт ~ноль (×0.15).
   Формации Алтаря (Крест/Квадрат/Кольцо/Великий Круг) дают ЧЛЕНАМ
   ПОЛНЫЙ множитель формации; множитель усиливают КЛЮЧЕВЫЕ КАРТЫ,
   стоящие В ФОРМАЦИИ: c5 +0.15, c8 +0.3, c9 +0.5, c10 +0.75, c11 +0.4.
   «Верховный Жрец» (c9) расползает ритуал на одну клетку дальше. */
const FORM_DEFS = [
  { kind: 'great',  mult: 4.0, label: 'Великий Круг' },
  { kind: 'ring',   mult: 3.0, label: 'Кольцо' },
  { kind: 'square', mult: 2.2, label: 'Квадрат' },
  { kind: 'cross',  mult: 2.0, label: 'Крест' }
];
/* КЛЮЧЕВЫЕ КАРТЫ ритуала: id -> прибавка к множителю формации */
const RITUAL_KEYS = { c5: 0.15, c8: 0.3, c9: 0.5, c10: 0.75, c11: 0.4 };
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
  /* Формации вокруг каждого Алтаря (клетки вне поля ломают узор).
     КЛЮЧЕВЫЕ КАРТЫ в клетках формации усиливают её множитель.
     v1.0: новая формация «Ромб» — 4 культиста на вершинах (дистанция 2),
     внутренние 8 клеток пусты: ×2.35. */
  altars.forEach(([ar, ac]) => {
    const orth = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [ar + dr, ac + dc]);
    const diag = [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([dr, dc]) => [ar + dr, ac + dc]);
    const r1 = NEI8.map(([dr, dc]) => [ar + dr, ac + dc]);
    const r2 = [];
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      if (Math.max(Math.abs(dr), Math.abs(dc)) === 2) r2.push([ar + dr, ac + dc]);
    const dia = [[ar - 2, ac], [ar + 2, ac], [ar, ac - 2], [ar, ac + 2]];
    const b1 = r1.every(([r, c]) => inB(r, c));
    const diaB = dia.every(([r, c]) => inB(r, c));
    const allCult = list => list.every(([r, c]) => inB(r, c) && isCult(r, c));
    const allEmpty = list => list.every(([r, c]) => inB(r, c) && !grid[r][c]);
    let found = null;
    if (allCult(r2) && allCult(r1)) found = { kind: 'great', mult: 4.0, label: 'Великий Круг', cells: r2.concat(r1) };
    else if (b1 && allCult(r2) && allEmpty(r1)) found = { kind: 'ring', mult: 3.0, label: 'Кольцо', cells: r2 };
    else if (diaB && allCult(dia) && allEmpty(r1)) found = { kind: 'diamond', mult: 2.35, label: 'Ромб', cells: dia };
    else if (allCult(r1)) found = { kind: 'square', mult: 2.2, label: 'Квадрат', cells: r1 };
    else if (allCult(orth) && allEmpty(diag)) found = { kind: 'cross', mult: 2.0, label: 'Крест', cells: orth };
    if (!found) return;
    /* Усиление ритуала ключевыми картами, стоящими В ФОРМАЦИИ */
    let keyBonus = 0; const keysUsed = [];
    found.cells.forEach(([r, c]) => {
      const it = grid[r][c]; if (!it) return;
      const b = RITUAL_KEYS[it.cardId];
      if (b) { keyBonus += b; keysUsed.push(CARDS[it.cardId].name); }
    });
    found.keyBonus = Math.min(2.0, keyBonus);
    found.keysUsed = keysUsed;
    found.formMult = found.mult + found.keyBonus;
    INC_CTX.formActive[ar + ',' + ac] = found;
    found.cells.forEach(([r, c]) => { INC_CTX.formCell[r + ',' + c] = found; });
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
    /* ФИДБЕК (раунд 3): культист ОБЯЗАН стоять в ритуале.
       Вне ритуала — ×0.15 (≈ ноль). Член формации — ПОЛНЫЙ множитель
       формации (×2..×4 + ключевые карты). Алтарь в центре — обязателен. */
    if (card.id === 'c4') {
      const f = INC_CTX.formActive[r + ',' + c];
      const n = getNeighbors(r, c).filter(n => INC_CTX.ritual.has(n.r + ',' + n.c)).length;
      return (f ? f.formMult : 1) * (1 + 0.15 * n);
    }
    const k = r + ',' + c;
    let m = 1;
    if (INC_CTX.formCell[k]) {
      m = INC_CTX.formCell[k].formMult;                            /* член формации — ПОЛНЫЙ множитель */
      const form = colEngine(c);                                   /* «Око Ритуала»: +0.5 к множителю в столбце */
      if (form && form.formAdd) m += form.formAdd;
    }
    else if (INC_CTX.ritual.has(k)) {
      if (getNeighbors(r, c).some(n => n.item.cardId === 'c4')) m = 1.15; /* соседи Алтаря */
    } else if (INC_CTX.ritualOuter.has(k)) m = 1.075;              /* Второй круг (c9) */
    else m = 0.15;                                                 /* ВНЕ РИТУАЛА — почти ноль */
    /* «Инквизитор» (★4): +25% за каждую уникальную пару на поле */
    if (card.id === 'c8') m *= Math.min(5, 1 + 0.25 * INC_CTX.uniquePairs);
    return m;
  }
  if (mech === 'cycle') {
    /* ФИДБЕК 4: ЗВЕРИ БЕЗ СИНЕРГИЙ. Инкам — исключительно от пищевой цепи:
       хищники кусают травоядных/падальщиков, травоядные пасутся на флоре,
       флора лечит хищников и кормится выпасом, падальщики жиреют с смертей. */
    let buffSum = (item.predBuff || 0) + (item.graze || 0) + (item.floraBuff || 0) + (item.scavBuff || 0);
    let m = 1 + buffSum;
    /* «Клык Альфы» (реликвия): баффы охоты/выпаса ×1.5 */
    const eng = colEngine(c);
    if (eng && eng.hunt && buffSum > 0) m = 1 + buffSum * 1.5;
    /* «Ветвь Древеня» (реликвия): флора столбца — баффы кормления ×2 */
    if (eng && eng.fertile && card.diet === 'flora') m = 1 + buffSum * 2;
    /* «Корона Зверя» (реликвия): травоядные столбца −25% */
    if (eng && eng.herbPenalty && card.diet === 'herb') m *= eng.herbPenalty;
    /* Голод хищника (без добычи рядом) — ставит beastCycleTick */
    if (item.hunger && item.hunger < 1) m *= item.hunger;
    /* v1.1: Лань — Стадность: +6% за соседа-травоядного */
    if (card.id === 'b12') m *= 1 + 0.06 * getNeighbors(r, c).filter(n => CARDS[n.item.cardId].diet === 'herb').length;
    /* v1.1: Колосс — Живая Крепость: жиреет от укусов (fleshyBuff ставит beastCycleTick) */
    if (card.id === 'b17' && item.fleshyBuff) m *= 1 + item.fleshyBuff;
    /* Древень-флора: +12% за каждого прокормленного (леченого или выпасанного) — в floraBuff */
    /* «Гидра» (★4): +10% за соседа-хищника */
    if (card.id === 'b9') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => isPredator(CARDS[n.item.cardId])).length;
    /* «Василиск» (★4): +10% за каждого окаменевшего соседа */
    if (card.id === 'b8') m *= 1 + 0.10 * (item.petrCount || 0);
    /* «Гидра»: рост от укусов вокруг (ставит beastCycleTick) */
    if (item.hydraBuff && item.hydraBuff > 1) m *= item.hydraBuff;
    return m;
  }
  if (mech === 'chaos') {
    /* ФИДБЕК 5: УГЛИ ХАОСА — демоны копят угли в толпе и ВЗРЫВАЮТСЯ
       предсказуемыми результатами (бафф/превращение/перегрев), дебаффов нет. */
    let m = (1 + 0.10 * (item.embers || 0)) * (item.mutBuff || 1);
    if (item.boomUntil && item.boomUntil > gameTime) m *= 2;   /* «Перегрев»: ×2 на 12 сек */
    const nb = getNeighbors(r, c);
    /* «Кровавый Жрец» (★3): +8% за соседа-демона (стабилизатор) */
    if (card.id === 'd6') m *= 1 + 0.08 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    /* «Адский Рыцарь» (★4): +6% за соседа-демона */
    if (card.id === 'd8') m *= 1 + 0.06 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    /* «Князь Тьмы» (★5): +10% за демона в радиусе 2 */
    if (card.id === 'd10') m *= 1 + 0.10 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    /* v1.1: роли младших демонов и новые карты */
    if (card.id === 'd0') m *= 1 + 0.08 * nb.filter(n => (n.item.embers || 0) >= 3).length;          /* Бес дразнит */
    if (card.id === 'd2' && item.harmBuff) m *= 1 + item.harmBuff;                                    /* Гончая чует взрывы */
    if (card.id === 'd13' && item.tyrBuff && item.tyrBuff > 1) m *= item.tyrBuff;                     /* Пепельный Тиран */
    if (card.id === 'd14') m *= 1 + 0.10 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length; /* Кулак Пекла */
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

  /* Спец-флаги ★4/★5: Лич (снятие затухания), Голос Пустоты, Глаз Бездны.
     ФИДБЕК (раунд 3): зона Лича включает ВСЕ соседние клетки — в т.ч. пустые,
     чтобы игрок чётко видел, куда попадает эффект. */
  let hasLich = false, hasVoice = false, hasEye = false;
  const lichAdj = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'u8') {
      hasLich = true;
      lichAdj.add(r + ',' + c);
      for (const [dr, dc] of NEI4) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (playableMask[nr] && playableMask[nr][nc]) lichAdj.add(nr + ',' + nc);
      }
    }
    else if (it.cardId === 'c11') hasVoice = true;
    else if (it.cardId === 'c10') hasEye = true;
  }

  /* РИТУАЛ культистов: строится до звеньев — звенья вне ритуала мертвы (фидбек 3) */
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'formation') buildRitualContext();

  /* РЕЛИКВИИ 3.0: движок видов по столбцам (фидбек 8) */
  rebuildRelicEngine();
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

      /* Колонные реликвии (виды): titan — затухание², chain/sun — без затухания */
      const e1 = colEngine(c), e2 = colEngine(nc);
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
        if ((e1 && e1.decaySq) || (e2 && e2.decaySq)) factor = factor * factor;
        if ((e1 && e1.noDecay) || (e2 && e2.noDecay)) factor = 1;
      }
      /* «Голос Пустоты» (★5): затухание у культистов не ниже ×0.5 */
      if (hasVoice && cardA.faction === 'cultist' && cardB.faction === 'cultist')
        factor = Math.max(0.5, factor);
      (cellActs[key] = cellActs[key] || []).push({ pair, factor });
      (cellActs[key2] = cellActs[key2] || []).push({ pair, factor });
      linkFactors[lk] = factor;
      if (wardedLink) linkWarded[lk] = 1;

      /* Хор: вес пары (noChoir исключает пару из Хора, choir удваивает) */
      let w = 1;
      if ((e1 && e1.choir) || (e2 && e2.choir)) w = 2;
      if ((e1 && e1.noChoir) || (e2 && e2.noChoir)) w = 0;
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
    /* РЕЛИКВИИ 3.0: множитель столбца + штраф соседним (фидбек 8: дебаффы часто сильнее) */
    let colM = 1;
    const eOwn = colEngine(c), eL = colEngine(c - 1), eR = colEngine(c + 1);
    if (eOwn) colM *= eOwn.colMult;
    if (eL && eL.nei) colM *= eL.nei;
    if (eR && eR.nei) colM *= eR.nei;
    const val = (card.baseRate * it.stacks * mult + flat) * factionMult(r, c, card, it) * formation(r, c) *
      (INC_CTX.armyMult[r + ',' + c] || 1) * colM;
    perCell[r + ',' + c] = val;
    total += val;
  }
  total *= diversityMult * sealMult;
  /* «Жнец Душ» (★4): периодический буст «Жатва» на весь доход */
  total *= activeAltBuff().mult;
  /* v1.0: РЕЗОНАНС РИТУАЛА — всплеск ×1.5 (см. faction_mechanics.js) */
  if (surgeUntil > gameTime) total *= 1.5;
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
