'use strict';
/* ============================================================
   ЛОГИКА: ЭКОНОМИКА (logic/economy.js)
   Доход карт: парные синергии (повторы одной пары дают всё меньше),
   бонус за разнообразие, формации, фракционные механики, ЗДАНИЯ
   (ауры/периодика — data/buildings.js), АРМИЯ нежити и уникальные
   механики ★4/★5 (SPECIALS в data/cards.js). Рендер отсюда не вызывается.
   ============================================================ */

const NEI4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const NEI8 = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];

/* Контекст расчёта (заполняется в computeIncome, читается factionMult/рендер):
   ritual — клетки в ритуале, ritualOuter — расширенный круг,
   formActive — активная формация алтаря, formCell — клетка-участник,
   bld — ауры зданий (data/buildings.js) */
let INC_CTX = { uniquePairs: 0, armyMult: {}, ritual: new Set(), ritualOuter: new Set(), formActive: {}, formCell: {}, bld: null, undeadCount: 0 };

/* ------- РЕЛИКВИИ 4.0 «Закон Тьмы» (v1.3.0) -------
   Слот столбца держит реликвию-ПРАВИЛО (ни одного множителя дохода):
   законы затухания/Хора для нежити (nail/skull/chor/urn/heart/sun),
   законы пищевой цепи для зверей (fang/range/bough/apex/kcap/hungerFlip),
   законы Хаоса для демонов (chaos/coin/march/face/rift/crownD).
   Культистские законы ритуала — глобальные (ritualRuleMods).
   Освящение распространяет закон на соседние столбы. */
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
   только ГЕОМЕТРИЯ: цепь ритуала от Алтаря/Хтони + формации + ВНЕШНИЙ КРУГ.
   v1.2.7: формации больше не требуют ПУСТЫХ клеток — поле 5×5 вмещает
   несколько ритуальных узлов, а пространство вне цепи работает:
   культисты рядом с ритуалом (но вне его) — «служители» ВНЕШНЕГО КРУГА. */
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
  /* ВНЕШНИЙ КРУГ (v1.2.7): культисты НЕ в цепи, но соседние с ней.
     Цепь строится только по ПРЯМЫМ сторонам (орто), поэтому служители —
     это культисты ПО ДИАГОНАЛИ от ритуала: они не тянут цепь на себя,
     но дают выплате и заряду бонус (двиг — computeRitualEngine). */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const k = r + ',' + c;
    if (INC_CTX.ritual.has(k) || !isCult(r, c)) continue;
    if (getNeighbors8(r, c).some(n => INC_CTX.ritual.has(n.r + ',' + n.c))) INC_CTX.ritualOuter.add(k);
  }
  /* Формации вокруг каждого источника ритуала (множители СКОРОСТИ заряда).
     v1.2.7: НИ одна формация не требует пустых клеток:
     Крест — 4 орто-соседа; Кольцо — все 8 вокруг; Ромб — кольцо + 4 вершины. */
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
  const B = INC_CTX.bld || { grave: {}, obelisk: {}, gates: {}, glacier: {}, pen: {}, pole: {}, spring: {}, pit: {}, wells: 0, mound: 0 };
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
    /* Псалмопевец: +10% за каждое своё активное звено */
    if (card.id === 'u12') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => findPair(card, CARDS[n.item.cardId])).length;
    /* v1.2.6: «Медленный рост» Зомби (u1) — накопленный бафф (тик в faction_mechanics.js) */
    if (card.id === 'u1' && item.growBuff) m *= 1 + item.growBuff;
    /* v1.2.5: новые ниши + здания */
    if (card.id === 'u9') m *= 1 + 0.15 * radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'undead').length; /* Коса */
    if (card.id === 'u7') m *= 1 + 0.08 * nUndead;                                                                /* Кладка */
    if (card.id === 'u0') m *= 1 + 0.15 * radius2(r, c).filter(n => CARDS[n.item.cardId].rarity === 5).length;   /* Гарнизон */
    if (card.id === 'u6') m *= 1 + 0.15 * getNeighbors(r, c).filter(n => { const nc2 = CARDS[n.item.cardId]; return nc2.faction === 'undead' && nc2.rarity === 3; }).length; /* Слёзы */
    const ga = B.grave[r + ',' + c] || 0;            /* Кладбище: +12% нежити в зоне */
    if (ga) m *= 1 + 0.12 * Math.min(3, ga);
    if (B.mound > 0) m *= 1 + 0.03 * INC_CTX.undeadCount; /* Гора костей: +3% за каждую нежить */
    return m;
  }
  if (mech === 'formation') {
    /* v1.2.6: у культистов ДОХОДА НЕТ — вся экономика фракции — выплата
       за проведённый ритуал (двиг в faction_mechanics.js) */
    return 0;
  }
  if (mech === 'cycle') {
    /* ФИДБЕК 4: ЗВЕРИ БЕЗ СИНЕРГИЙ. Инкам — исключительно от пищевой цепи:
       хищники кусают травоядных/падальщиков, травоядные пасутся на флоре,
       флора лечит хищников и кормится выпасом, падальщики жиреют с смертей. */
    let buffSum = (item.predBuff || 0) + (item.graze || 0) + (item.floraBuff || 0) + (item.scavBuff || 0);
    let m = 1 + buffSum;
    /* v1.3.0: законные реликвии зверей обрабатываются тиком цепи
       (fang/kcap/bough/hungerFlip — см. beastCycleTick) */
    const eng = colEngine(c);
    /* Голод хищника (без добычи рядом) — ставит beastCycleTick.
       «Кость Голода» (hungerFlip): голодный хищник НЕ СЛАБЕЕТ */
    if (item.hunger && item.hunger < 1 && !(eng && eng.hungerFlip)) m *= item.hunger;
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
    /* ДЕМОНЫ: УГЛИ — в толпе (2+ рядом) демон копит угли и ВЗРЫВАЕТСЯ
       предсказуемыми результатами (бафф/превращение/перегрев). */
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
    /* v1.2.5: Мучитель у раскалённых + здания (Врата/Ледник) */
    if (card.id === 'd12') m *= 1 + 0.12 * nb.filter(n => (n.item.embers || 0) >= 3).length;
    const ga = B.gates[r + ',' + c] || 0, gl = B.glacier[r + ',' + c] || 0;
    if (ga) m *= 1 + 0.10 * Math.min(2, ga);
    if (gl) m *= 1 + 0.08 * Math.min(2, gl);
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

  /* РЕЛИКВИИ 4.0: движок законов по столбцам */
  rebuildRelicEngine();
  const skullUse = {};        // pairIndex -> первое звено пары уже под Черепом Владыки
  const wardedUse = {};       // pairIndex -> сколько звеньев пары уже под Аурой Власти (кап 2)
  const cryptUse = {};        // pairIndex -> звенья под Склепом (кап 2 на пару)
  const necroUse = {};        // pairIndex -> звенья Некроманта (кап 2 на пару)

  /* v1.2.5: ЗДАНИЯ — ауры + зона Склепа + счётчик нежити (Гора костей) */
  INC_CTX.bld = buildBuildingAuras();
  const cryptZone = buildCryptZone();
  let undeadCount = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && CARDS[it.cardId].faction === 'undead') undeadCount++;
  }
  INC_CTX.undeadCount = undeadCount;

  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    /* прямые соседи вправо и вниз, чтобы звено считалось один раз */
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const pair = findPair(CARDS[it.cardId], CARDS[grid[nr][nc].cardId]);
      if (!pair) continue;
      const idx = pair.idx; /* v1.2.9.1 (perf): кэш индекса вместо indexOf */
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

      /* Колонные реликвии (виды): titan — повторы², chain/sun — без повторов */
      const e1 = colEngine(c), e2 = colEngine(nc);
      const wardedLink = hasLich && (lichAdj.has(key) || lichAdj.has(key2));
      const isUndeadPair = cardA.faction === 'undead' && cardB.faction === 'undead';
      const cryptLink = isUndeadPair && (cryptZone.has(key) || cryptZone.has(key2));   /* Склеп */
      const necroLink = cardA.id === 'u5' || cardB.id === 'u5';                        /* Тёмная наука Некроманта */

      let factor;
      if (wardedLink && (wardedUse[idx] || 0) < 2) {
        /* «Лич» (★4): первые 2 звена КАЖДОЙ пары не слабеют и не жгут слоты */
        wardedUse[idx] = (wardedUse[idx] || 0) + 1;
        factor = 1;
      } else if (cryptLink && (cryptUse[idx] || 0) < 2) {
        /* «Склеп» (здание): звенья нежити в его зоне не слабеют (первые 2 на пару) */
        cryptUse[idx] = (cryptUse[idx] || 0) + 1;
        factor = 1;
      } else if (necroLink && (necroUse[idx] || 0) < 2) {
        /* «Тёмная наука» Некроманта: его звенья не слабеют */
        necroUse[idx] = (necroUse[idx] || 0) + 1;
        factor = 1;
      } else {
        /* v1.3.0 ЗАКОНЫ РЕЛИКВИЙ: защиты от затухания — по правилам.
           Защищённое звено НЕ ЖЖЁТ слоты затухания (как у Лича/Склепа). */
        const hasLaw = name => (e1 && e1[name]) || (e2 && e2[name]);
        const colStack3 = cc => {
          if (!(cc >= 0 && cc < GRID_SIZE)) return false;
          for (let rr = 0; rr < GRID_SIZE; rr++) { const ci = grid[rr][cc]; if (ci && (ci.stacks || 1) >= 3) return true; }
          return false;
        };
        /* «Корона Тлена»: звенья столба не затухают — безусловно */
        if (hasLaw('noDecay')) { factor = 1; }
        /* «Гробовой Гвоздь» (триггер): пока в столбе стопка ×3 — звенья не затухают */
        else if (e1 && e1.nailHold && colStack3(c)) factor = 1;
        else if (e2 && e2.nailHold && colStack3(nc)) factor = 1;
        /* «Урна Владык»: звено, касающееся стопки, не затухает */
        else if ((e1 && e1.stackHold && (it.stacks || 1) >= 2) ||
                 (e2 && e2.stackHold && (grid[nr][nc].stacks || 1) >= 2)) factor = 1;
        /* «Череп Владыки»: первое звено КАЖДОЙ пары держится */
        else if (hasLaw('firstHold') && !(skullUse[idx] > 0)) {
          skullUse[idx] = 1; factor = 1;
        } else {
          usage[idx] = (usage[idx] || 0) + 1;
          /* Повторы: у нежити своя, ЖЁСТКАЯ кривая */
          const curve = (cardA.faction === 'undead' && cardB.faction === 'undead') ? SYN_DR_UNDEAD : SYN_DR;
          factor = curve[Math.min(usage[idx] - 1, curve.length - 1)];
          /* «Сердце Пустоты»: повтор не глушит звено столба до конца */
          if (factor < 0.35 && hasLaw('revive')) factor = 0.35;
        }
      }
      /* «Костяной Рыцарь»: повтор его пары не слабее ×0.5 */
      if (cardA.id === 'u4' || cardB.id === 'u4') factor = Math.max(0.5, factor);
      /* «Голос Пустоты» (★5): повторы у культистов не ниже ×0.5 */
      if (hasVoice && cardA.faction === 'cultist' && cardB.faction === 'cultist')
        factor = Math.max(0.5, factor);
      (cellActs[key] = cellActs[key] || []).push({ pair, factor });
      (cellActs[key2] = cellActs[key2] || []).push({ pair, factor });
      linkFactors[lk] = factor;
      if (wardedLink) linkWarded[lk] = 1;

      /* Разнообразие: вес пары («Плачущий Камень» делает пары громче) */
      let w = 1;
      if ((e1 && e1.choir) || (e2 && e2.choir)) w = 3;
      if (w > 0) pairSeen[idx] = Math.max(pairSeen[idx] || 0, w);
    }
  }
  const uniquePairs = Object.keys(pairSeen).length;
  /* Разнообразие: взвешенная сумма уникальных пар; «Глаз Бездны» (★5) удваивает вклад */
  let divWeight = 0;
  for (const k in pairSeen) divWeight += pairSeen[k];
  const divBonus = DIVERSITY_BONUS * (hasEye ? 2 : 1);
  const divCap = DIVERSITY_CAP * (hasEye ? 2 : 1);
  const diversityMult = 1 + Math.min(divCap, divBonus * divWeight);
  const sealMult = 1 + 0.25 * sealLv.rich;

  /* Контекст для factionMult: уникальные пары */
  INC_CTX.uniquePairs = uniquePairs;

  /* АРМИЯ нежити: бонус за размер непрерывной компоненты (BFS по 4-соседству).
     v1.2: реликвия «Штандарт Легиона» (kind legion) поднимает кап с ×2 до ×2.6 */
  INC_CTX.armyMult = {};
  let armyBest = 0;
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
    /* РЕЛИКВИИ 4.0: множителей столбца больше НЕТ — только правила */
    const val = (card.baseRate * it.stacks * mult + flat) * factionMult(r, c, card, it) * formation(r, c) *
      (INC_CTX.armyMult[r + ',' + c] || 1);
    perCell[r + ',' + c] = val;
    total += val;
  }
  total *= diversityMult * sealMult;
  /* Временный буст всего дохода: ЖАТВА (Гора костей), вехи, Ускорение */
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

/* Мощь Алтаря: бонус к урону Арены от синергий (v1.2: кап 4, сильнее за звено —
   петля баланса арена↔алтарь: чем богаче ритуал, тем больнее бьют отряды).
   v1.2.6: у культистов звеньев нет — мощность растёт от УЧАСТНИКОВ ритуала. */
function altarPower() {
  if (FACTION_INFO[faction].mechanic === 'formation')
    return Math.min(4, 1 + 0.05 * (INC_CTX.ritual ? INC_CTX.ritual.size : 0));
  return Math.min(4, (1 + 0.035 * countLinks()) * incomeCache.diversityMult);
}

/* ---------------- ЦЕНА КРУТКИ ----------------
   Растёт с числом круток за Эпоху, печати снижают */
function rollCost() {
  const raw = 150 * (1 + runRolls / 250) * (1 - 0.1 * sealLv.greed);
  return Math.max(30, Math.min(Math.round(raw), 150 * 25));
}
