'use strict';
/* ============================================================
   ЛОГИКА: ЭКОНОМИКА (logic/economy.js) — v1.4.0 «Закон и Кара»
   Доход карт: парные синергии (повторы одной пары дают всё меньше),
   бонус за разнообразие, формации, фракционные механики, ЗДАНИЯ
   (ауры/периодика — data/buildings.js), АРМИЯ нежити и уникальные
   механики ★4/★5 (SPECIALS в data/cards.js). Рендер отсюда не вызывается.

   v1.4.0 — РАСЧЁТ СВЯЗЕЙ В ТРИ ФАЗЫ:
   ФАЗА 1: сбор рёбер — пары из synergies.js + УНИВЕРСАЛЬНЫЕ звенья
           прикованных зданий (⛓ Прикованный Страж: здание + любая карта).
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
let INC_CTX = { uniquePairs: 0, armyMult: {}, ritual: new Set(), ritualOuter: new Set(), formActive: {}, formCell: {}, bld: null, undeadCount: 0,
  necro: { fog: new Set(), oath: new Set(), fogSrc: new Set() }, linkPhase: {} };

/* ============ v1.9.0 РЕВОРК НЕЖИТИ: КАТЕГОРИИ / ПОДРАСЫ / АУРЫ ============ */
const UNDEAD_LORDS = { u9: 1, u10: 1, u11: 1, u24: 1, u26: 1, u36: 1, u38: 1 };
/* «Ночной Договор» (★4/★5 Призрак×Вампир): затухание по МЯГКОЙ кривой SYN_DR */
const NIGHT_PACT_PAIRS = { 'u24|u36': 1, 'u25|u37': 1, 'u26|u38': 1 };

function radiusN(r, c, R) {
  const res = [];
  for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc]) res.push({ r: nr, c: nc, item: grid[nr][nc] });
  }
  return res;
}
/* Пустые ИГРАБЕЛЬНЫЕ клетки в радиусе 1 (8 соседей) — для Огонька u15 и Фонарщицы u20 */
function emptyAround(r, c) {
  let n = 0;
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc;
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
    if (playableMask[nr] && playableMask[nr][nc] && !grid[nr][nc]) n++;
  }
  return n;
}
/* ЖИВЫЕ партнёры по звеньям: орто-соседи + ФАЗОВЫЕ (расстояние 2).
   Живость — по linkFactors ЭТОГО прохода computeIncome (единая правда).
   Читается в factionMult (каналы Несущих) и в тиках (лечение/дань). */
function livePartners(r, c, card) {
  const res = [];
  const check = (nr, nc) => {
    if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) return;
    const it2 = grid[nr][nc]; if (!it2) return;
    const p = findPair(card, CARDS[it2.cardId]);
    if (!p) return;
    const lf = INC_CTX.curLinkFactors ? INC_CTX.curLinkFactors[linkKey(r, c, nr, nc)] : undefined;
    if (lf === undefined || lf > 0) res.push({ r: nr, c: nc, item: it2, card: CARDS[it2.cardId] });
  };
  getNeighbors(r, c).forEach(n => check(n.r, n.c));
  [[0, 2], [0, -2], [2, 0], [-2, 0]].forEach(([dr, dc]) => check(r + dr, c + dc));
  return res;
}
function liveLinkCount(r, c, card) { return livePartners(r, c, card).length; }
/* Кап «Медленного роста» Зомби: +60%, а при ЖИВОМ звене u1-u3 — +90% (решение В4).
   Читается тиком (faction_mechanics.js) и тултипом (hud.js). */
function zombieGrowCap(r, c) {
  if (r === undefined || !grid[r] || !grid[r][c] || grid[r][c].cardId !== 'u1') return GROW_CAP;
  return livePartners(r, c, CARDS.u1).some(p => p.card.id === 'u3') ? 0.9 : GROW_CAP;
}

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
  INC_CTX.formActive = {}; INC_CTX.formCell = {}; INC_CTX.ritualSrc = null;
  const isCult = (r, c) => !!(grid[r] && grid[r][c] && CARDS[grid[r][c].cardId].faction === 'cultist');
  const inB = (r, c) => r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
  const altars = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && RITUAL_SOURCES[grid[r][c].cardId]) altars.push([r, c]);
  if (!altars.length) return;
  INC_CTX.ritualSrc = altars[0][0] + ',' + altars[0][1]; /* для геометрии Ложи */
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
    /* v1.4.0: «Прикованный Страж» (бывш. «Скованный Цепью») не тянет цепь нежити — он прикован
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
    /* v1.5.14 (QA итерация 2): «Плотные захоронения» Могильщика (u3) —
       спец описан на карте и показывал в тултипе «✦ АКТИВНА», но множителя
       в расчёте НЕ БЫЛО вовсе — отображение врало о доходе.
       +12% за каждого соседа, стоящего в стопке ×2 и больше */
    if (card.id === 'u3') m *= 1 + 0.12 * getNeighbors(r, c).filter(n => (n.item.stacks || 1) >= 2).length;
    /* ============ v1.9.0 ЛИЧНЫЕ ПАССИВКИ СКОВАННЫХ ============
       Собраны в отдельный множитель pm: «Тумандело» (u19) дублирует
       его связанной Скованной (капы пассивок не меняются).
       u2 Жажда теперь регулярно просыпается — Кровоток Вампиров ранит. */
    let pm = 1;
    if (card.id === 'u0') pm *= 1 + 0.15 * radius2(r, c).filter(n => CARDS[n.item.cardId].rarity === 5).length;   /* Гарнизон */
    if (card.id === 'u1' && item.growBuff) pm *= 1 + item.growBuff;                                                /* Рост */
    if (card.id === 'u2') pm *= 1 + 0.15 * radius2(r, c).filter(n => n.item.hp < n.item.maxHp - 0.01).length;    /* Жажда */
    if (card.id === 'u13') pm *= liveLinkCount(r, c, card) === 1 ? 1.2 : 1;                                       /* Рывок */
    if (card.id === 'u15') pm *= 1 + 0.10 * Math.min(8, emptyAround(r, c));                                       /* Блуждающий свет */
    if (card.id === 'u17') {                                                                                      /* Дремота */
      const friends = livePartners(r, c, card);
      const stranger = getNeighbors8(r, c).some(n => CARDS[n.item.cardId].faction === 'undead' &&
        !friends.some(p => p.r === n.r && p.c === n.c));
      if (!stranger) pm *= 1.18;
    }
    if (card.id === 'u18') pm *= 1 + 0.09 * radius2(r, c).filter(n => { const q = CARDS[n.item.cardId]; return q.subrace === 'ghost' && !q.isBuilding; }).length; /* Канон */
    if (card.id === 'u25') pm *= 1 + Math.min(1.0, 0.05 * radiusN(r, c, 3).filter(n => CARDS[n.item.cardId].faction === 'undead').length); /* Безымянный */
    if (card.id === 'u27') pm *= radius2(r, c).some(n => UNDEAD_LORDS[n.item.cardId]) ? 1.15 : 1;                 /* Иерархия */
    if (card.id === 'u28' && (item.stacks || 1) > 1) pm *= 1 + 0.08 * (item.stacks - 1);                          /* Мышиный пир */
    if (card.id === 'u29') pm *= 1 + 0.10 * radius2(r, c).filter(n => n.item.hp >= n.item.maxHp - 0.01).length;   /* Здоровая кровь */
    if (card.id === 'u30') pm *= 1 + 0.12 * radius2(r, c).filter(n => CARDS[n.item.cardId].isBuilding).length;    /* Свой гроб */
    m *= pm;
    /* «Тумандело» (u19): связанная Скованная с личной пассивкой — эффект ВДВОЕ */
    if (pm !== 1 && livePartners(r, c, card).some(p => p.card.id === 'u19')) m *= pm;

    /* ============ КАНАЛЫ «НЕСУЩИХ ВОЛЮ»: усиление СВЯЗАННОЙ Скованной ============ */
    if (card.cat === 'thrall') {
      const partners = livePartners(r, c, card);
      const liveLinks = partners.length;
      partners.forEach(p => {
        if (p.card.id === 'u14' && item.hp >= item.maxHp - 0.01) m *= 1.10;          /* Правка костей: полная HP */
        else if (p.card.id === 'u20') m *= 1 + 0.12 * Math.min(8, emptyAround(r, c)); /* Фонарь: простор вокруг Скованной */
        else if (p.card.id === 'u21' && (p.item.bellUntil || 0) > gameTime) m *= 1.5; /* Звон (пульс 10с) */
        else if (p.card.id === 'u31') m *= 1.18;                                      /* Дань крови */
        else if (p.card.id === 'u32' && liveLinks === 1) m *= 1.25;                   /* Дуэль: только её звено */
        else if (p.card.id === 'u33') m *= 1 + 0.06 * radiusN(r, c, 3).filter(n => { const q = CARDS[n.item.cardId]; return q.subrace === 'vampire' && !q.isBuilding; }).length; /* Родословная */
        else if (p.card.id === 'u37') m *= 1.15;                                      /* Великий Договор */
      });
      /* «Ноктюрн» (u24): все Призраки поля ×1.5 во время пульса */
      if (card.subrace === 'ghost' && typeof nocturneUntil !== 'undefined' && nocturneUntil > gameTime) m *= 1.5;
    }
    /* Псалмопевец: +10% за каждое своё АКТИВНОЕ звено синергии.
       v1.5.14 (QA итерация 2): считаются только ЖИВЫЕ звенья (фактор > 0). */
    if (card.id === 'u12') m *= 1 + 0.10 * getNeighbors(r, c).filter(n => {
      const p = findPair(card, CARDS[n.item.cardId]);
      if (!p) return false;
      const lf = INC_CTX.curLinkFactors ? INC_CTX.curLinkFactors[linkKey(r, c, n.r, n.c)] : undefined;
      return lf === undefined ? true : lf > 0;
    }).length;
    /* Коса Жнеца (v1.9.0): +12% за нежить в радиусе 2 и ещё +10% за каждую РАНЕНУЮ */
    if (card.id === 'u9') {
      const rr2 = radius2(r, c);
      m *= 1 + 0.12 * rr2.filter(n => CARDS[n.item.cardId].faction === 'undead').length +
        0.10 * rr2.filter(n => n.item.hp < n.item.maxHp - 0.01).length;
    }
    if (card.id === 'u7') m *= 1 + 0.08 * nUndead;                                                                /* Кладка */
    if (card.id === 'u6') m *= 1 + 0.15 * getNeighbors(r, c).filter(n => { const nc2 = CARDS[n.item.cardId]; return nc2.faction === 'undead' && nc2.rarity === 3; }).length; /* Слёзы */
    /* «Право ночи» Старого Господина (u38): Вампиры в радиусе 2 +10% */
    if (card.subrace === 'vampire' && !card.isBuilding && card.id !== 'u38' &&
        radius2(r, c).some(n => n.item.cardId === 'u38')) m *= 1.10;
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

/* ---------------- АУРЫ НЕКРОМАНТОВ (v1.9.0, Д.2) ----------------
   У юнитов аур в коде не было — компактный движок по образцу
   buildBuildingAuras. Правило стаков (Д.2): аура ОДНОЙ И ТОЙ ЖЕ карты
   не стакается (множества клеток), ауры РАЗНЫХ Некромантов действуют
   одновременно — каждая меняет СВОЁ измерение, «+X%» не складывается:
   u23 «Туман» — ГЕОМЕТРИЯ (пары Скованных в зоне дотягиваются на 2),
   u35 «Кровавый обет» — РЕСУРС HP (щит от даней, лечение ×2).
   Пульс u5 «Поднятие» — тиковый (faction_mechanics.js), зоны не создаёт. */
function buildNecroAuras() {
  const fog = new Set(), oath = new Set(), fogSrc = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId !== 'u23' && it.cardId !== 'u35') continue;
    const isFog = it.cardId === 'u23';
    if (isFog) fogSrc.add(r + ',' + c);
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      (isFog ? fog : oath).add(nr + ',' + nc);
    }
  }
  return { fog, oath, fogSrc };
}

/* ---------------- РАСЧЁТ ДОХОДА (три фазы, v1.4.0) ---------------- */
function computeIncome() {
  const usage = {};           // pairIndex -> число НЕзащищённых активаций (слоты затухания)
  const pairSeen = {};        // pairIndex -> вес в Хоре (1 обычная, 3 — Плачущий Камень)
  const cellActs = {};        // 'r,c' -> [{pair, factor, amp}]
  const linkFactors = {};     // linkKey -> эффективный множитель затухания (тултип, линии; 0 — мертво)
  const linkRoyal = {};       // linkKey -> 1, звено усилено Знамением Владыки (золотое)
  const linkLich = {};        // linkKey -> 1, звено под Пактом Тишины Лича (зелено-золотое)
  const linkPhase = {};       // v1.9.0: linkKey -> 1, ФАЗОВОЕ звено Призраков (пунктир на расстоянии 2/3)
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
  /* v1.9.0: ауры Некромантов (Туман u23 / Кровавый обет u35) */
  INC_CTX.necro = buildNecroAuras();
  let undeadCount = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && CARDS[it.cardId].faction === 'undead') undeadCount++;
  }
  INC_CTX.undeadCount = undeadCount;

  /* Клетки Личей и Владык (для Пакта Тишины и Знамения Владыки) + спец-флаги ★5 */
  const lichCells = [], lordCells = [], beaconCells = [], masterCells = [];
  let hasVoice = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'u8') lichCells.push(r + ',' + c);
    else if (it.cardId === 'u10') lordCells.push(r + ',' + c);
    else if (it.cardId === 'u26') beaconCells.push([r, c]);   /* Маяк Мёртвых: цепь ×1.2 */
    else if (it.cardId === 'u38') masterCells.push([r, c]);   /* Старый Господин: цепь ×1.15 */
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

  /* ============ ФАЗА 1.5: ФАЗОВЫЕ СВЯЗИ ПРИЗРАКОВ (v1.9.0, решение В1) ============
     Пары с участием ПРИЗРАКА (или Скованного в «Тумане» Заклинателя u23)
     работают на расстоянии 2 по орто (значение пары ×0.5); Призрак в
     радиусе 3 от Маяка Мёртвых (u26) — на расстоянии 3. Промежуточная
     клетка может быть пустой или занятой (призраки бесплотны).
     Затухание — обычное (слоты пары общие с орто-экземплярами).
     Рендер: тонкая пунктирная линия base-ghost (без захламления). */
  const nearBeacon = (rr, cc) => beaconCells.some(([br, bc]) => Math.max(Math.abs(br - rr), Math.abs(bc - cc)) <= 3);
  const phaseEligible = (A2, B2, keyA, keyB) => {
    if (A2.faction !== 'undead' || B2.faction !== 'undead' || A2.isBuilding || B2.isBuilding) return false;
    if (A2.subrace === 'ghost' || B2.subrace === 'ghost') return true;
    const fog = INC_CTX.necro.fog;
    return !!(A2.cat === 'thrall' && fog.has(keyA)) || !!(B2.cat === 'thrall' && fog.has(keyB));
  };
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const A = CARDS[it.cardId], key = r + ',' + c;
    for (const [dr, dc] of [[0, 2], [2, 0], [0, 3], [3, 0]]) {
      const dist = dr || dc;
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const it2 = grid[nr][nc];
      const Bc = CARDS[it2.cardId], key2 = nr + ',' + nc;
      const pair = findPair(A, Bc);
      if (!pair) continue;
      const gA = A.subrace === 'ghost', gB = Bc.subrace === 'ghost';
      if (dist === 3) {
        /* дальняя фаза — только Призрак в радиусе 3 от Маяка */
        if (!((gA && nearBeacon(r, c)) || (gB && nearBeacon(nr, nc)))) continue;
      } else if (!phaseEligible(A, Bc, key, key2)) continue;
      const lk = linkKey(r, c, nr, nc);
      edges.push({ r, c, nr, nc, key, key2, lk, pair: Object.assign({}, pair, { value: pair.value * 0.5 }),
        aId: it.cardId, bId: it2.cardId, phase: true });
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
  /* ПАКТ ТИШИНЫ ЛИЧА (v1.9.0 переописан): если рядом Склеп (соседство
     или звено) — звенья на ДЛИНЕ 2 от Лича не слабеют от повторов.
     Требование звена с Некромантом снято (Д.1: некромант-некромант запрещены). */
  for (const lk0 of lichCells) {
    const my = adj[lk0] || [];
    const hasCrypt = my.some(i => edges[i].aId === 'bl_crypt' || edges[i].bId === 'bl_crypt');
    if (!hasCrypt) continue;
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

  /* v1.9.0: НЕЗАТУХАЮЩИЕ звенья — «Великий Договор» Матриархи (u37 со
     Скованными) и «Право ночи» Старого Господина (u38 — все его звенья). */
  const noFadeEdge = new Set();
  edges.forEach((e, i) => {
    if (e.aId === 'u38' || e.bId === 'u38') noFadeEdge.add(i);
    else if (e.aId === 'u37' || e.bId === 'u37') {
      const other = CARDS[e.aId === 'u37' ? e.bId : e.aId];
      if (other.cat === 'thrall') noFadeEdge.add(i);
    }
  });
  /* Цепь Маяка Мёртвых (u26) ×1.2 и цепь Старого Господина (u38) ×1.15 —
     по образцу Знамения Владыки: вся связная компонента, множители перемножаются. */
  const edgeAmp = {};
  const bfsAmp = (cellKeys, amp) => {
    const seen = new Set(cellKeys);
    const q = cellKeys.slice();
    while (q.length) {
      const k = q.shift();
      (adj[k] || []).forEach(i => {
        edgeAmp[i] = (edgeAmp[i] || 1) * amp;
        const e = edges[i];
        const nk = e.key === k ? e.key2 : e.key;
        if (!seen.has(nk)) { seen.add(nk); q.push(nk); }
      });
    }
  };
  if (beaconCells.length) bfsAmp(beaconCells.map(([r, c]) => r + ',' + c), 1.2);
  if (masterCells.length) bfsAmp(masterCells.map(([r, c]) => r + ',' + c), 1.15);

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
    if (lichEdge.has(i) || noFadeEdge.has(i)) {
      /* «Пакт Тишины» Лича / Великий Договор Матриархи / Право ночи Старого Господина:
         звенья не слабеют и не жгут слоты */
      factor = 1;
    } else if (cryptLink && (cryptUse[pair.idx] || 0) < cryptCap) {
      cryptUse[pair.idx] = (cryptUse[pair.idx] || 0) + 1;
      factor = 1;
    } else {
      /* v1.9.0 «Поднятие» (u5): щит Скованной — её СЛЕДУЮЩЕЕ звено ×1.0 без слота (не стакается, Д.2) */
      if ((it.shieldLinks || 0) > 0 || (it2.shieldLinks || 0) > 0) {
        if ((it.shieldLinks || 0) > 0) it.shieldLinks--;
        if ((it2.shieldLinks || 0) > 0) it2.shieldLinks--;
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
        /* Повторы: у нежити своя, ЖЁСТКАЯ кривая; у «Ночного Договора»
           (★4/★5 Призрак×Вампир) — мягкая SYN_DR.
           «Плачущий Камень» (v1.3.1 slowfade): затухание пар столба НЕ УГЛУБЛЯЕТСЯ */
        const nightP = NIGHT_PACT_PAIRS[pair.a + '|' + pair.b];
        const curve = nightP ? SYN_DR : (isUndeadPair ? SYN_DR_UNDEAD : SYN_DR);
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
    }

    (cellActs[key] = cellActs[key] || []).push({ pair, factor, amp: (royalEdge.has(i) ? 1.25 : 1) * (edgeAmp[i] || 1) });
    (cellActs[key2] = cellActs[key2] || []).push({ pair, factor, amp: (royalEdge.has(i) ? 1.25 : 1) * (edgeAmp[i] || 1) });
    linkFactors[lk] = factor;
    if (e.phase) linkPhase[lk] = 1;
    if (royalEdge.has(i)) linkRoyal[lk] = 1;
    if (lichEdge.has(i)) linkLich[lk] = 1;
    /* «Костяной Рыцарь» и «Эхо в Стекле» (v1.9.0): повтор их пары не слабее ×0.5 */
    if (A.id === 'u4' || Bc.id === 'u4' || A.id === 'u16' || Bc.id === 'u16') {
      const fix = f => f > 0 ? Math.max(0.5, f) : f;
      factor = fix(factor);
      cellActs[key][cellActs[key].length - 1].factor = factor;
      cellActs[key2][cellActs[key2].length - 1].factor = factor;
      linkFactors[lk] = factor;
    }
    /* v1.9.0 «Полночь» Барона (u36): во время пульса его звенья ×1.5 */
    if (A.id === 'u36' || Bc.id === 'u36') {
      const baronIt = A.id === 'u36' ? it : it2;
      if (baronIt && (baronIt.midnightUntil || 0) > gameTime) {
        factor *= 1.5;
        cellActs[key][cellActs[key].length - 1].factor = factor;
        cellActs[key2][cellActs[key2].length - 1].factor = factor;
        linkFactors[lk] = factor;
      }
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
  const sealMult = 1 + 0.25 * upgLv.rich;

  /* Контекст для factionMult: уникальные пары + ЖИВЫЕ факторы звеньев
     (v1.5.14: Псалмопевец читает факторы ЭТОГО прохода, а не прошлый кэш) */
  INC_CTX.uniquePairs = uniquePairs;
  INC_CTX.curLinkFactors = linkFactors;

  /* АРМИЯ нежити: бонус за размер непрерывной компоненты (BFS по 4-соседству).
     «Штандарт Легиона» (kind legion) поднимает кап с ×2 до ×2.6.
     v1.5.14: armyCap вынесен на уровень функции — его читает
     incomeCache (строка «Армия: N (×m)» раньше хардкодила ×2 даже
     под Штандартом — отображение врало о реальном капе). */
  INC_CTX.armyMult = {};
  let armyBest = 0;
  let armyCap = 2;
  INC_CTX.armyBestSet = new Set();
  if (mech === 'chain') {
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
  incomeCache = { total, uniquePairs, perCell, pairUsage: usage, armyBest, armyCap, armyMultOf: INC_CTX.armyMult,
    linkFactors, linkRoyal, linkLich, linkPhase, lichZone: Array.from(lichZoneCells) };
  INC_CTX.linkPhase = linkPhase;
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

/* v1.7.0: ЦЕНА КРУТКИ СНЯТА — Призыв платит Душами (logic/gacha.js,
   GRIM_ROLL_COST), бесплатные крутки убраны совсем. */
