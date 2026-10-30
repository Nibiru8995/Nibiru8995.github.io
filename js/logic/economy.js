'use strict';
/* ============================================================
   ЛОГИКА: ЭКОНОМИКА (logic/economy.js) — v1.4.0 «Закон и Кара»
   Доход карт: парные синергии (повторы одной пары дают всё меньше),
   бонус за разнообразие, формации, фракционные механики, ЗДАНИЯ
   (ауры/периодика — data/buildings.js), АРМИЯ нежити и уникальные
   механики ★4/★5 (SPECIALS в data/cards.js). Рендер отсюда не вызывается.

   v1.4.0 — РАСЧЁТ СВЯЗЕЙ В ТРИ ФАЗЫ:
   ФАЗА 1: сбор рёбер — пары из synergies.js + УНИВЕРСАЛЬНЫЕ звенья
           прикованных зданий (⛓ Скованный Цепью: здание + любая карта).
   ФАЗА 2: граф поля — ЗНАМЕНИЕ ВЛАДЫКИ (u10): вся связная цепь,
           в которой стоит Владыка, усиливается (×1.25 к звеньям,
           золотые линии). ПАКТ ТИШИНЫ ЛИЧА (u8): при активных звеньях
           со Склепом И Некромантом звенья на ДЛИНЕ 2 от Лича не слабеют
           (зелено-золотые линии).
   ФАЗА 3: факторы затухания, активации, Хор разнообразия.
   v1.3.1: надбавка за уникальные пары убрана; «Плачущий Камень» (slowfade).
   Кары реликвий (nailPain/skullDeath/chorSorrow/urnGreed/heartDrain/
   bannerDiscipline) и бафф «Короны Тлена» (crownLord ×2) — здесь.
   ============================================================ */

const NEI4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const NEI8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

/* Контекст расчёта (заполняется в computeIncome, читается factionMult/рендер):
   ritual — клетки в ритуале, ritualOuter — расширенный круг,
   formActive — активная формация алтаря, formCell — клетка-участник,
   bld — ауры зданий (data/buildings.js) */
let INC_CTX = { uniquePairs: 0, armyMult: {}, ritual: new Set(), ritualOuter: new Set(), formActive: {}, formCell: {}, bld: null, undeadCount: 0 };

/* ------- РЕЛИКВИИ 4.0 «Закон и Кара» (v1.4.0) -------
   Слот столбца держит реликвию-ПРАВИЛО: бафф + ощутимая кара.
   Законы затухания/Хора для нежити, пищевой цепи для зверей,
   Хаоса для демонов. Культистские законы ритуала — глобальные
   (ritualRuleMods). Освящение распространяет закон И кару. */
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

/* ---------------- РИТУАЛ КУЛЬТИСТОВ (v1.2.7 — ПЕПЕЛ И ПОРЯДОК) ----------------
   У культистов НЕТ ни дохода, ни синергий — вся фракция живёт ВЫПЛАТОЙ
   за проведённый ритуал (двиг — faction_mechanics.js). Здесь строится
   только ГЕОМЕТРИЯ: цепь ритуала от Алтаря/Хтони + формации + ВНЕШНИЙ КРУГ. */
const FORM_DEFS = [
  { kind: 'diamond', mult: 2.6, label: 'Ромб' },
  { kind: 'square',  mult: 2.0, label: 'Кольцо' },
  { kind: 'cross',   mult: 1.7, label: 'Крест' }
];
/* Источники ритуала: здание-Алтарь или хтонь на его месте */
const RITUAL_SOURCES = { bl_altar: 1, c10: 1, c11: 1 };
function buildRitualContext() {
  INC_CTX.ritual = new Set(); INC_CTX.ritualOuter = new Set();
  INC_CTX.formActive = {}; INC_CTX.formCell = {};
  const isCult = (r, c) => !!(grid[r] && grid[r][c] && CARDS[grid[r][c].cardId].faction === 'cultist');
  const inB = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  const altars = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && RITUAL_SOURCES[grid[r][c].cardId]) altars.push([r, c]);
  if (!altars.length) return;
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
  /* ВНЕШНИЙ КРУГ: культисты НЕ в цепи, но соседние с ней.
     Цепь строится только по ПРЯМЫМ сторонам (орто), поэтому служители —
     это культисты ПО ДИАГОНАЛИ от ритуала. */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const k = r + ',' + c;
    if (INC_CTX.ritual.has(k) || !isCult(r, c)) continue;
    if (getNeighbors8(r, c).some(n => INC_CTX.ritual.has(n.r + ',' + n.c))) INC_CTX.ritualOuter.add(k);
  }
  /* Формации вокруг каждого источника ритуала (множители СКОРОСТИ заряда). */
  altars.forEach(([ar, ac]) => {
    const orth = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dr, dc]) => [ar + dr, ac + dc]);
    const ring = NEI8.map(([dr, dc]) => [ar + dr, ac + dc]);
    const dia = [[ar - 2, ac], [ar + 2, ac], [ar, ac - 2], [ar, ac + 2]];
    const allCult = list => list.every(([r, c]) => inB(r, c) && isCult(r, c));
    let found = null;
    if (allCult(dia) && allCult(ring)) found = Object.assign({}, FORM_DEFS[0], { cells: ring.concat(dia) }); /* Ромб: 12 карт */
    else if (allCult(ring)) found = Object.assign({}, FORM_DEFS[1], { cells: ring });                        /* Кольцо: 8 карт */
    else if (allCult(orth)) found = Object.assign({}, FORM_DEFS[2], { cells: orth });                        /* Крест: 4 карты */
    if (!found) return;
    found = Object.assign({}, found);
    found.formMult = found.mult;
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
  const B = INC_CTX.bld || { grave: {}, graveM: {}, obelisk: {}, gates: {}, gatesM: {}, glacier: {}, glacierM: {}, pen: {}, pole: {}, spring: {}, pit: {}, wells: 0, mound: 0 };
  if (mech === 'chain') {
    /* v1.4.0: «Скованный Цепью» больше не тянет цепь нежити — он прикован
       к зданиям (см. computeIncome и SPECIALS u11). */
    const src = getNeighbors(r, c);
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
    /* «Владыка Тлена» (★5): +10% за каждую нежить в радиусе 2 */
    if (card.id === 'u10') m *= 1 + 0.1 * Math.max(0, radius2Count - 1);
    else if (nearAnchor) m *= 1.25;
    /* Псалмопевец: +10% за каждое своё активное звено */
    if (card.id === 'u12') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => findPair(card, CARDS[n.item.cardId])).length;
    /* v1.2.6: «Медленный рост» Зомби (u1) — накопленный бафф */
    if (card.id === 'u1' && item.growBuff) m *= 1 + item.growBuff;
    if (card.id === 'u9') m *= 1 + 0.15 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'undead').length; /* Коса */
    if (card.id === 'u7') m *= 1 + 0.08 * nUndead;                                                                /* Кладка */
    if (card.id === 'u0') m *= 1 + 0.15 * radius2(r, c).filter(n => CARDS[n.item.cardId].rarity === 5).length;   /* Гарнизон */
    if (card.id === 'u6') m *= 1 + 0.15 * getNeighbors(r, c).filter(n => { const nc2 = CARDS[n.item.cardId]; return nc2.faction === 'undead' && nc2.rarity === 3; }).length; /* Слёзы */
    /* Кладбище: +12% нежити в зоне; прикованное Кладбище — +18% */
    const ga = B.grave[r + ',' + c] || 0;
    if (ga) m *= 1 + 0.12 * (B.graveM[r + ',' + c] ? 1.5 : 1) * Math.min(3, ga);
    /* Гора костей: +3% за каждую нежить; прикованная — +4.5% */
    if (B.mound > 0) m *= 1 + (B.moundChained ? 0.045 : 0.03) * INC_CTX.undeadCount;
    return m;
  }
  if (mech === 'formation') {
    /* у культистов ДОХОДА НЕТ — вся экономика фракции — выплата за ритуал */
    return 0;
  }
  if (mech === 'cycle') {
    /* ЗВЕРИ БЕЗ СИНЕРГИЙ. Инкам — исключительно от пищевой цепи. */
    let buffSum = (item.predBuff || 0) + (item.graze || 0) + (item.floraBuff || 0) + (item.scavBuff || 0);
    let m = 1 + buffSum;
    const eng = colEngine(c);
    /* Голод хищника (без добычи рядом) — ставит beastCycleTick.
       «Кость Голода» (hungerFlip): голодный хищник НЕ СЛАБЕЕТ */
    if (item.hunger && item.hunger < 1 && !(eng && eng.hungerFlip)) m *= item.hunger;
    /* v1.4.0 КАРА «Кости Голода» (hungerSated): сытый хищник столба −25% */
    if (eng && eng.hungerSated && !(item.hunger && item.hunger < 1)) m *= 0.75;
    if (card.id === 'b12') m *= 1 + 0.06 * getNeighbors(r, c).filter(n => CARDS[n.item.cardId].diet === 'herb').length;
    if (card.id === 'b17' && item.fleshyBuff) m *= 1 + item.fleshyBuff;
    if (card.id === 'b9') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => isPredator(CARDS[n.item.cardId])).length;
    if (card.id === 'b8') m *= 1 + 0.10 * (item.petrCount || 0);
    if (item.hydraBuff && item.hydraBuff > 1) m *= item.hydraBuff;
    return m;
  }
  if (mech === 'chaos') {
    /* ДЕМОНЫ: УГЛИ — в толпе демон копит угли и ВЗРЫВАЕТСЯ. */
    let m = (1 + 0.10 * (item.embers || 0)) * (item.mutBuff || 1);
    if (item.boomUntil && item.boomUntil > gameTime) m *= 2;   /* «Перегрев»: ×2 на 12 сек */
    const nb = getNeighbors(r, c);
    const eng = colEngine(c);
    /* v1.4.0 КАРА «Кандалов Легиона» (marchLoner): демон столба без соседей-демонов −30% */
    if (eng && eng.marchLoner &&
        !getNeighbors8(r, c).some(n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding)) m *= 0.7;
    /* v1.4.0 КАРА «Разлома Ада» (riftDrain): −5% навсегда за каждый свой взрыв */
    if (item.riftTax) m *= (1 - item.riftTax);
    if (card.id === 'd6') m *= 1 + 0.08 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (card.id === 'd8') m *= 1 + 0.06 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (card.id === 'd10') m *= 1 + 0.10 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (card.id === 'd0') m *= 1 + 0.08 * nb.filter(n => (n.item.embers || 0) >= 3).length;
    if (card.id === 'd2' && item.harmBuff) m *= 1 + item.harmBuff;
    if (card.id === 'd13' && item.tyrBuff && item.tyrBuff > 1) m *= item.tyrBuff;
    if (card.id === 'd14') m *= 1 + 0.10 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (card.id === 'd9' && item.balrBuff) m *= item.balrBuff;
    if (card.id === 'd11') m *= 1 + 0.40 * nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    else if (nb.some(n => n.item.cardId === 'd11')) m *= 0.9;
    if (card.id === 'd12') m *= 1 + 0.12 * nb.filter(n => (n.item.embers || 0) >= 3).length;
    /* Врата Ада: +10% демонов в зоне (прикованные — +15%); Ледник: +8% (+12%) */
    const ga = B.gates[r + ',' + c] || 0, gl = B.glacier[r + ',' + c] || 0;
    if (ga) m *= 1 + 0.10 * (B.gatesM[r + ',' + c] ? 1.5 : 1) * Math.min(2, ga);
    if (gl) m *= 1 + 0.08 * (B.glacierM[r + ',' + c] ? 1.5 : 1) * Math.min(2, gl);
    return m;
  }
  return 1;
}

/* ---------------- РАСЧЁТ ДОХОДА (три фазы, v1.4.0) ---------------- */
function computeIncome() {
  const usage = {};           // pairIndex -> число НЕзащищённых активаций (слоты затухания)
  const pairSeen = {};        // pairIndex -> вес в Хоре (1 обычная, 3 — Плачущий Камень)
  const cellActs = {};        // 'r,c' -> [{pair, factor, amp}]
  const linkFactors = {};     // linkKey -> эффективный множитель затухания (тултип, линии; 0 — мертво)
  const linkRoyal = {};       // linkKey -> 1, звено усилено Знамением Владыки (золотое)
  const linkLich = {};        // linkKey -> 1, звено под Пактом Тишины Лича (зелено-золотое)
  const linkedCells = new Set(); // клетки, у которых есть хотя бы одно звено

  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'formation') buildRitualContext();

  /* РЕЛИКВИИ 4.0: движок законов и кар по столбцам */
  rebuildRelicEngine();
  const skullUse = {};        // pairIndex -> сколько звеньев пары уже под Черепом Владыки
  const cryptUse = {};        // pairIndex -> звенья под Склепом (кап 2, прикованный — 3)
  /* Глобальные кары забега (скан до фазы звеньев): «Сердце Пустоты» высасывает силу, «Штандарт» требует строя */
  let heartDrainOn = false, bannerOn = false;
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]); if (!r) continue;
    const eng = RELIC_KIND_ENGINE[r.kind]; if (!eng) continue;
    if (eng.heartDrain) heartDrainOn = true;
    if (eng.bannerDiscipline) bannerOn = true;
  }

  /* v1.2.5: ЗДАНИЯ — ауры + ⛓ прикованные здания + зона Склепа + счётчик нежити */
  INC_CTX.bld = buildBuildingAuras();
  const INC_B = INC_CTX.bld;
  const cryptZone = buildCryptZone();
  const cryptChainedZone = INC_CTX.cryptChainedZone || new Set();
  let undeadCount = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && CARDS[it.cardId].faction === 'undead') undeadCount++;
  }
  INC_CTX.undeadCount = undeadCount;

  /* Клетки Личей и Владык (для Пакта Тишины и Знамения Владыки) + спец-флаги ★5 */
  const lichCells = [], lordCells = [];
  let hasVoice = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'u8') lichCells.push(r + ',' + c);
    else if (it.cardId === 'u10') lordCells.push(r + ',' + c);
    else if (it.cardId === 'c11') hasVoice = true;   /* «Голос Пустоты»: повторы культистов не ниже ×0.5 */
  }

  /* ============ ФАЗА 1: СБОР РЁБЕР ============ */
  const edges = [];
  let uniSeq = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const it2 = grid[nr][nc];
      const A = CARDS[it.cardId], Bc = CARDS[it2.cardId];
      const key = r + ',' + c, key2 = nr + ',' + nc;
      const lk = linkKey(r, c, nr, nc);
      let pair = findPair(A, Bc);
      if (!pair) {
        /* v1.4.0 ⛓ ПРИКОВАННОЕ ЗДАНИЕ: связывается с ЛЮБОЙ соседней картой */
        const chainedSide = (A.isBuilding && INC_B.chainedAt && INC_B.chainedAt.has(key) && !Bc.isBuilding) ? key :
          ((Bc.isBuilding && INC_B.chainedAt && INC_B.chainedAt.has(key2) && !A.isBuilding) ? key2 : null);
        if (!chainedSide) continue;
        const other = chainedSide === key ? Bc : A;
        pair = { kind: 'flat', value: 1.5, idx: 'U' + (uniSeq++),
          text: 'Прикованное здание + ' + other.name + ' → +1.5/с (цепь)' };
      }
      edges.push({ r, c, nr, nc, key, key2, lk, pair, aId: it.cardId, bId: it2.cardId });
      linkedCells.add(key); linkedCells.add(key2);
    }
  }

  /* ============ ФАЗА 2: ГРАФ — ЗНАМЕНИЕ ВЛАДЫКИ + ПАКТ ЛИЧА ============ */
  const adj = {};
  edges.forEach((e, i) => { (adj[e.key] = adj[e.key] || []).push(i); (adj[e.key2] = adj[e.key2] || []).push(i); });
  const royalEdge = new Set(), lichEdge = new Set();
  /* ЗНАМЕНИЕ ВЛАДЫКИ: вся связная цепь, содержащая Владыку, усиливается.
     Пример: Владыка — Лич — Некромант — Псалмопевец: ВСЕ считаются
     связанными с Владыкой (они в его цепи), каждое звено цепи ×1.25. */
  {
    const seen = new Set(lordCells);
    const q = lordCells.slice();
    while (q.length) {
      const k = q.shift();
      (adj[k] || []).forEach(i => {
        royalEdge.add(i);
        const e = edges[i];
        const nk = e.key === k ? e.key2 : e.key;
        if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
      });
    }
  }
  /* ПАКТ ТИШИНЫ ЛИЧА: если у Лича активны звенья СО СКЛЕПОМ и с НЕКРОМАНТОМ
     одновременно — звенья на ДЛИНЕ 2 от Лича не слабеют от повторов. */
  for (const lk0 of lichCells) {
    const my = adj[lk0] || [];
    const hasCrypt = my.some(i => edges[i].aId === 'bl_crypt' || edges[i].bId === 'bl_crypt');
    const hasNecro = my.some(i => edges[i].aId === 'u5' || edges[i].bId === 'u5');
    if (!hasCrypt || !hasNecro) continue;
    const seen = new Set([lk0]);
    my.forEach(i => {
      lichEdge.add(i);
      const e = edges[i];
      const nk = e.key === lk0 ? e.key2 : e.key;
      if (seen.has(nk)) return;
      seen.add(nk);
      (adj[nk] || []).forEach(j => lichEdge.add(j));
    });
  }
  /* Зона Пакта (для подсветки клеток зелено-золотом) */
  const lichZoneCells = new Set();
  lichEdge.forEach(i => { lichZoneCells.add(edges[i].key); lichZoneCells.add(edges[i].key2); });

  /* ============ ФАЗА 3: ЗАТУХАНИЕ, АКТИВАЦИИ, ХОР ============ */
  const colStack3 = cc => {
    if (!(cc >= 0 && cc < GRID_SIZE)) return false;
    for (let rr = 0; rr < GRID_SIZE; rr++) { const ci = grid[rr][cc]; if (ci && (ci.stacks || 1) >= 3) return true; }
    return false;
  };
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const A = CARDS[e.aId], Bc = CARDS[e.bId];
    const it = grid[e.r][e.c], it2 = grid[e.nr][e.nc];
    const key = e.key, key2 = e.key2, lk = e.lk, pair = e.pair;

    /* КУЛЬТИСТЫ: звено живо только когда ОБА конца в ритуале (фидбек 3). */
    if (mech === 'formation' && A.faction === 'cultist' && Bc.faction === 'cultist' &&
        (!INC_CTX.ritual.has(key) || !INC_CTX.ritual.has(key2))) {
      linkFactors[lk] = 0;
      continue;
    }

    const e1 = colEngine(e.c), e2 = colEngine(e.nc);
    const isUndeadPair = A.faction === 'undead' && Bc.faction === 'undead';
    /* Склеп: звенья нежити в его зоне не слабеют (первые 2 на пару; ⛓ прикованный — 4, мощность ×2) */
    const cryptLink = isUndeadPair && (cryptZone.has(key) || cryptZone.has(key2));
    const cryptCap = (cryptChainedZone.has(key) || cryptChainedZone.has(key2)) ? 4 : 2;

    let factor;
    if (lichEdge.has(i)) {
      /* «Пакт Тишины» Лича: звенья на длине 2 не слабеют и не жгут слоты */
      factor = 1;
    } else if (cryptLink && (cryptUse[pair.idx] || 0) < cryptCap) {
      cryptUse[pair.idx] = (cryptUse[pair.idx] || 0) + 1;
      factor = 1;
    } else {
      const hasLaw = name => (e1 && e1[name]) || (e2 && e2[name]);
      /* «Гробовой Гвоздь» (триггер): пока в столбе стопка ×3 — звенья не затухают */
      if (e1 && e1.nailHold && colStack3(e.c)) factor = 1;
      else if (e2 && e2.nailHold && colStack3(e.nc)) factor = 1;
      /* «Урна Владык»: звено, касающееся стопки ×2+, не затухает */
      else if (hasLaw('stackHold') && ((it.stacks || 1) >= 2 || (it2.stacks || 1) >= 2)) factor = 1;
      /* «Череп Владыки»: первые ДВА звена каждой пары держатся, третьи и далее — МЕРТВЫ */
      else if (hasLaw('firstHold')) {
        const used = skullUse[pair.idx] || 0;
        if (used < 2) { skullUse[pair.idx] = used + 1; factor = 1; }
        else factor = 0;
      } else {
        usage[pair.idx] = (usage[pair.idx] || 0) + 1;
        /* Повторы: у нежити своя, ЖЁСТКАЯ кривая.
           «Плачущий Камень» (v1.3.1 slowfade): затухание пар столба НЕ УГЛУБЛЯЕТСЯ */
        const curve = isUndeadPair ? SYN_DR_UNDEAD : SYN_DR;
        const fadeCap = ((e1 && e1.slowfade) || (e2 && e2.slowfade)) ? 1 : curve.length - 1;
        factor = curve[Math.min(usage[pair.idx] - 1, fadeCap)];
        /* «Сердце Пустоты»: повтор не глушит звено столба до конца */
        if (factor < 0.35 && hasLaw('revive')) factor = 0.35;
        /* КАРА «Сердца Пустоты» (heartDrain): вне столба Сердца затухание ВДВОЕ ЖЕСТЧЕ */
        if (factor < 1 && heartDrainOn && !(e1 && e1.revive) && !(e2 && e2.revive))
          factor = Math.max(0.02, factor * 0.5);
        /* КАРА «Гробового Гвоздя»: пока стопки ×3 нет — затухание вдвое жёстче
           (однократно на звено, даже если оба конца в столбе Гвоздя) */
        if (factor < 1) {
          const nailPainHit = (e1 && e1.nailPain && !colStack3(e.c)) || (e2 && e2.nailPain && !colStack3(e.nc));
          if (nailPainHit) factor = Math.max(0.02, factor * 0.5);
        }
      }
    }

    (cellActs[key] = cellActs[key] || []).push({ pair, factor, amp: royalEdge.has(i) ? 1.25 : 1 });
    (cellActs[key2] = cellActs[key2] || []).push({ pair, factor, amp: royalEdge.has(i) ? 1.25 : 1 });
    linkFactors[lk] = factor;
    if (royalEdge.has(i)) linkRoyal[lk] = 1;
    if (lichEdge.has(i)) linkLich[lk] = 1;
    /* «Костяной Рыцарь»: повтор его пары не слабее ×0.5 */
    if (A.id === 'u4' || Bc.id === 'u4') {
      const fix = f => f > 0 ? Math.max(0.5, f) : f;
      factor = fix(factor);
      cellActs[key][cellActs[key].length - 1].factor = factor;
      cellActs[key2][cellActs[key2].length - 1].factor = factor;
      linkFactors[lk] = factor;
    }
    /* «Голос Пустоты» (★5): повторы у культистов не ниже ×0.5 */
    if (hasVoice && A.faction === 'cultist' && Bc.faction === 'cultist') {
      const fix = f => f > 0 ? Math.max(0.5, f) : f;
      factor = fix(factor);
      cellActs[key][cellActs[key].length - 1].factor = factor;
      cellActs[key2][cellActs[key2].length - 1].factor = factor;
      linkFactors[lk] = factor;
    }

    /* v1.3.1: пары просто СЧИТАЮТСЯ (достижения «Синергетик»), надбавки за разнообразие нет */
    if (factor > 0) pairSeen[pair.idx] = 1;
  }

  const uniquePairs = Object.keys(pairSeen).length;
  /* v1.3.1: надбавка за уникальные пары УБРАНА — уникальность считается для ачивок */
  const sealMult = 1 + 0.25 * sealLv.rich;

  /* Контекст для factionMult: уникальные пары */
  INC_CTX.uniquePairs = uniquePairs;

  /* АРМИЯ нежити: бонус за размер непрерывной компоненты (BFS по 4-соседству).
     «Штандарт Легиона» (kind legion) поднимает кап с ×2 до ×2.6 */
  INC_CTX.armyMult = {};
  let armyBest = 0;
  INC_CTX.armyBestSet = new Set();
  if (mech === 'chain') {
    let armyCap = 2;
    if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
      const r = relicById(relicSlots[k]);
      if (r && r.kind === 'legion') armyCap = Math.max(armyCap, 2.6);
    }
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
      const am = Math.min(armyCap, 1 + 0.015 * (cells.length - 1));
      if (cells.length > armyBest) {
        armyBest = cells.length;
        INC_CTX.armyBestSet = new Set(cells.map(([cr, cc]) => cr + ',' + cc));
      }
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
      const v = a.pair.value * a.amp; /* Знамение Владыки: звено цепи ×1.25 */
      if (a.pair.kind === 'flat') flat += v * it.stacks * a.factor;
      else mult *= 1 + (v - 1) * a.factor;
    });
    /* ЗАКОНЫ СТОЛБА v1.4.0: кары и Корона Тлена */
    let colMult = 1;
    const eng = colEngine(c);
    if (eng) {
      /* «Корона Тлена»: прибыль Некроманта/Лича/Владыки в столбе ×2 */
      if (eng.crownLord && (card.id === 'u5' || card.id === 'u8' || card.id === 'u10')) colMult *= 2;
      /* КАРА «Урны Владык»: одиночки −50%, стопки +30% */
      if (eng.urnGreed) colMult *= (it.stacks || 1) >= 2 ? 1.3 : 0.5;
      /* КАРА «Плачущего Камня»: карты без единого звена −50% */
      if (eng.chorSorrow && !linkedCells.has(r + ',' + c)) colMult *= 0.5;
    }
    /* КАРА «Штандарта Легиона»: нежить вне крупнейшей армии −20% */
    if (bannerOn && mech === 'chain' && card.faction === 'undead' && !INC_CTX.armyBestSet.has(r + ',' + c)) colMult *= 0.8;
    const val = (card.baseRate * it.stacks * mult + flat) * factionMult(r, c, card, it) * formation(r, c) *
      (INC_CTX.armyMult[r + ',' + c] || 1) * colMult;
    perCell[r + ',' + c] = val;
    total += val;
  }
  /* v1.3.1 ТЗ: надбавка за уникальные пары УБРАНА — только печати Эпохи */
  total *= sealMult;
  /* Временный буст всего дохода: ЖАТВА (Гора костей), вехи, Ускорение */
  total *= activeAltBuff().mult;
  incomeCache = { total, uniquePairs, perCell, pairUsage: usage, armyBest, armyMultOf: INC_CTX.armyMult,
    linkFactors, linkRoyal, linkLich, lichZone: Array.from(lichZoneCells) };
  /* v1.5.9 (perf): движок ритуала обновляется ВМЕСТЕ с контекстом (INC_CTX) —
     раньше он пересчитывался на КАЖДОМ кадре (60 раз/с), теперь — при каждом
     пересчёте дохода (10 Гц и при любых изменениях поля). Шкала ритуала,
     бейджи ⚡ и статистика читают всегда свежий движок, как и раньше. */
  if (mech === 'formation' && typeof computeRitualEngine === 'function') {
    RITUAL_ENGINE = computeRitualEngine();
    INC_CTX.ritualCellSpeed = RITUAL_ENGINE.cellSpeed;
    if (typeof _ritualEngineAt !== 'undefined') _ritualEngineAt = gameTime;
  }
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

/* Мощь Алтаря: бонус к урону Арены от синергий.
   У культистов звеньев нет — мощность растёт от УЧАСТНИКОВ ритуала. */
function altarPower() {
  if (FACTION_INFO[faction].mechanic === 'formation')
    return Math.min(4, 1 + 0.05 * (INC_CTX.ritual ? INC_CTX.ritual.size : 0));
  return Math.min(4, 1 + 0.035 * countLinks());
}

/* ---------------- ЦЕНА КРУТКИ ----------------
   Растёт с числом круток за Эпоху, печати снижают */
function rollCost() {
  const raw = 150 * (1 + runRolls / 250) * (1 - 0.1 * sealLv.greed);
  return Math.max(30, Math.min(Math.round(raw), 150 * 25));
}
