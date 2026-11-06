'use strict';
/*
ДАННЫЕ + ДВИЖОК: ЗДАНИЯ (data/buildings.js)
Здание — особый тип карты (rarity 'B'): постройка с аурой
и/или периодическим эффектом. Ставится как карта, эффекты
НЕ растут от стаков (только доход клетки).
Эффекты зданий читаются экономикой (INC_CTX.bld) и тиками
(tickBuildings в logic/faction_mechanics.js).
 ============================================================*/

/* Радиус ауры здания (клетки). 0 = эффект глобальный. */
const BUILDING_AURA = {
  bl_grave: 2, bl_crypt: 2, bl_mound: 0,
  bl_altar: 1, bl_obelisk: 2, bl_well: 3,
  bl_pen: 2, bl_pole: 3, bl_spring: 2,
  bl_pit: 2, bl_gates: 2, bl_glacier: 2
};

/* Периодические эффекты (секунды): Кладбище — выдача из барабана колоды
   (v1.16.0, раз в минуту; за каждую связь со Скованным −10с до минимума 10),
   Врата — призыв, Гора — ЖАТВА */
const BLD_TIMER = { bl_grave: 60, bl_gates: 25, bl_mound: 30 };

/* Списки бесплатного призыва (базовые карты фракции).
   v1.16.0: Кладбище больше НЕ призывает — выдаёт карты из барабана колоды
   (deckQueue), поэтому его пула больше нет. */
const BLD_SUMMON_POOL = {
  bl_gates: ['d0', 'd1', 'd2', 'd3']
};

/* Радиусы туманных зон — ТОЛЬКО у зданий : у здания зона
настоящая механика с радиусом (Кладбище выдаёт карты из колоды и усиливает,
Склеп защищает звенья, Обелиск ускоряет, Вольер щитит), подсветка показывает
клетки под эффектом. У карт-юнитов аур НЕТ вообще — ни у Лича, ни у демонов,
зверей и Хтони.
 Подсказки юнитов живут в тултипах ✦, а не в тумане на клетках.*/
function auraRadiusOf(cardId) {
  return BUILDING_AURA[cardId] !== undefined ? BUILDING_AURA[cardId] : 0;
}

/* ---------------- ДВИЖОК АУР ЗДАНИЙ ----------------
Пересобирается в computeIncome. INC_CTX.bld[ключ] = сколько аур
данного вида накрывает клетку. Аура НЕ растёт от стаков здания.
⛓ ПРИКОВАННЫЕ ЗДАНИЯ: здание с орто-соседом «Прикованный Страж»
(u11) — chainedAt; его аура ×1.5 (graveM/gatesM/glacierM/obeliskM),
глобальные флаги pen/pole/spring/pit/wells/mound, зона прикованного
Склепа защищает 4 звена пары вместо 2.
абилка прикованного здания больше НЕ дублируется
 КУЛДАУН между срабатываниями вдвое короче (см. tickBuildings).*/
function buildBuildingAuras() {
  const bld = { grave: {}, graveM: {}, obelisk: {}, obeliskM: {}, gates: {}, gatesM: {}, glacier: {}, glacierM: {},
    pen: {}, pole: {}, spring: {}, pit: {}, wells: 0, mound: 0,
    penChained: false, poleChained: false, springChained: false, pitChained: false,
    wellsChained: false, moundChained: false, chainedAt: new Set(), cryptChainedZone: new Set() };
  const chainedHere = (r, c) => getNeighbors(r, c).some(n => n.item.cardId === 'u11');
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (!CARDS[it.cardId] || !CARDS[it.cardId].isBuilding) continue;
    const R = BUILDING_AURA[it.cardId]; if (R === undefined) continue;
    const chained = chainedHere(r, c); /* ⛓ Приковано Скованным Цепью */
    if (chained) bld.chainedAt.add(r + ',' + c);
    const add = key => { for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const nk = nr + ',' + nc;
      bld[key][nk] = (bld[key][nk] || 0) + 1;
    } };
    const addM = (key, mKey) => { for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (chained) bld[mKey][nr + ',' + nc] = 1;
    } };
    if (it.cardId === 'bl_grave') { add('grave'); addM('grave', 'graveM'); }
    else if (it.cardId === 'bl_obelisk') { add('obelisk'); addM('obelisk', 'obeliskM'); }
    else if (it.cardId === 'bl_gates') { add('gates'); addM('gates', 'gatesM'); }
    else if (it.cardId === 'bl_glacier') { add('glacier'); addM('glacier', 'glacierM'); }
    else if (it.cardId === 'bl_pen') { add('pen'); if (chained) bld.penChained = true; }
    else if (it.cardId === 'bl_pole') { add('pole'); if (chained) bld.poleChained = true; }
    else if (it.cardId === 'bl_spring') { add('spring'); if (chained) bld.springChained = true; }
    else if (it.cardId === 'bl_pit') { add('pit'); if (chained) bld.pitChained = true; }
    else if (it.cardId === 'bl_well') { bld.wells++; if (chained) bld.wellsChained = true; }
    else if (it.cardId === 'bl_mound') { bld.mound++; if (chained) bld.moundChained = true; }
  }
  return bld;
}

/* Зона Склепа (звенья нежити в радиусе НЕ СЛАБЕЮТ) +
 зона ПРИКОВАННОГО Склепа (радиус ×2 — защищает до 4 звеньев пары — мощность ×2).
 v1.16.0: базовый радиус 1, за каждого ПРИВЯЗАННОГО Некроманта
 (ортососед-Некромант — Склеп связывается с Некромантами) +1. */
function buildCryptZone() {
  const zone = new Set();
  const chained = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'bl_crypt') continue;
    const isChained = getNeighbors(r, c).some(n => n.item.cardId === 'u11');
    const near = getNeighbors(r, c);
    let R = 1;
    near.forEach(n => {
      const nc = CARDS[n.item.cardId];
      if (nc && nc.faction === 'undead' && nc.cat === 'necro' && !nc.isBuilding) R++;
    });
    if (isChained) R *= 2;
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
        zone.add(nr + ',' + nc);
        if (isChained) chained.add(nr + ',' + nc);
      }
    }
  }
  INC_CTX.cryptChainedZone = chained;
  return zone;
}

/* v1.16.0 (5.3) «УЛУЧШЕНИЕ ГОРЫ КОСТЕЙ»: Скелеты-Скованные и Несущие волю,
   стоящие в радиусе 1 от Горы, считаются УЛУЧШЕННЫМИ на один X — отдача
   как у юнита на стопку больше (Скелет ×7 даёт как ×8). Доход считается
   в economy.js (INC_CTX.moundBoost). ⛓ Прикованная Гора (4.2) —
   «улучшает связанных ЕЩЁ на один X» (итого +2). */
function buildMoundBoost() {
  const map = {};
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'bl_mound') continue;
    const chained = getNeighbors(r, c).some(n => n.item.cardId === 'u11');
    const boost = chained ? 2 : 1;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const cit = grid[nr][nc]; if (!cit) continue;
      const meta = UNDEAD_META[cit.cardId]; if (!meta) continue;
      if ((meta.cat === 'thrall' || meta.cat === 'bearer') && meta.subrace === 'skeleton') {
        const k = nr + ',' + nc;
        if (!(map[k] > boost)) map[k] = boost;
      }
    }
  }
  return map;
}

/* Тик периодических зданий: выдача из колоды (Кладбище), призыв (Врата), ЖАТВА (Гора).
⛓ ПРИКОВАННЫЕ ЗДАНИЯ (Прикованный Страж рядом):
 Кладбище выдаёт за раз ДВЕ карты (вместо одной),
 Врата Ада 25с → 12.5с, ЖАТВА Горы 30с → 15с (кд вдвое короче).*/
let bldGatesTimer = 0, bldMoundTimer = 0; /* v1.16.0: таймер Кладбищ — ПО-ИНДИВИДУАЛЬНО (grid-item), не глобальный */
/* в момент срабатывания способности здание
получает fxUntil — renderGrid даст карте класс fx-live (вспышка-каст),
 а buildAuraMap оживит туман её ауры. Пока здание молчит — всё стоит тихо.*/
function fxMarkBuildings(id, secs) {
  const until = gameTime + secs;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && it.cardId === id) it.fxUntil = until;
  }
}
function tickBuildings(dt) {
  let changed = false;
  /* ⛓ какие здания прикованы (орто-сосед u11) — один проход на тик */
  const chainedIds = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && it.cardId === 'u11') {
      getNeighbors(r, c).forEach(n => {
        const nit = n.item;
        if (nit && nit.cardId !== 'u11' && CARDS[nit.cardId] && CARDS[nit.cardId].isBuilding) chainedIds.add(nit.cardId);
      });
    }
  }
  /* -- Кладбище (v1.16.0, 5.1) --
     Способность: раз в минуту выдаёт ИГРОКУ карту из барабана колоды
     (deckQueue из state.js: по копии за раз).
     • За каждую связь со Скелетом-Скованным (звено) КД −10с (мин 10с).
     • ⛓ Прикованное Стражем: срабатывает ДВАЖДЫ за раз (две карты).
     • НЕ синхронно: у каждого Кладбища свой таймер прямо на клетке
       (it.graveCD), стартовый сдвиг — по координатам клетки.
     • Барабан исчерпан → Кладбище превращается в Гору костей,
       ВНЕ зависимости от содержимого колоды. */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'bl_grave') continue;
    if (it.graveCD === undefined) it.graveCD = (r * GRID_SIZE + c) % BLD_TIMER.bl_grave; /* десинхронизация кладбищ */
    it.graveCD += dt;
    /* звено со Скованным: каждый орто-сосед-Скелет-Скованный — минус 10с */
    const links = getNeighbors(r, c).filter(n => {
      const m = CARDS[n.item.cardId];
      return !!(m && m.faction === 'undead' && !m.isBuilding && UNDEAD_META[n.item.cardId] &&
        UNDEAD_META[n.item.cardId].cat === 'thrall' && UNDEAD_META[n.item.cardId].subrace === 'skeleton');
    }).length;
    const graveNeed = Math.max(10, BLD_TIMER.bl_grave - 10 * links);
    it.graveNeed = graveNeed; /* для бейджа перезарядки */
    if (it.graveCD < graveNeed) continue;
    it.graveCD = 0;
    const chainedHere = getNeighbors(r, c).some(n => n.item.cardId === 'u11');
    const take = chainedHere ? 2 : 1;
    let given = 0;
    while (given < take && deckQueue.length) {
      const id = deckQueue.pop();
      if (!CARDS[id]) continue;
      inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
      stats.summons = (stats.summons || 0) + 1; /* контракты «получите карты от зданий» */
      given++;
      changed = true;
    }
    it.fxUntil = gameTime + 3; /* кладбищенский туман оживает на 3с */
    if (given) {
      toast('🪦 Кладбище выдало из колоды: <b>' + given + ' карт(ы)</b>' + (chainedHere ? ' ⛓' : ''), 'summon', 45);
      changed = true;
    }
    /* колода вычерпана → Гора костей (вне зависимости от колоды) */
    if (!deckQueue.length) {
      it.cardId = 'bl_mound';
      const hp = cardHp(CARDS.bl_mound.rarity);
      it.stacks = 1; it.hp = hp; it.maxHp = hp;
      delete it.graveCD; delete it.graveNeed;
      fxMarkBuildings('bl_mound', 5);
      toast('🪦→🗿 Колода вычерпана: Кладбище стало <b>Горой костей</b>!', 'summon', 60);
      changed = true;
    }
  }
  /* Врата Ада: бесплатный демон каждые 25с (⛓ прикованные — каждые 12.5с) */
  if (hasCard('bl_gates')) {
    bldGatesTimer += dt;
    const gatesChained = chainedIds.has('bl_gates');
    if (bldGatesTimer >= BLD_TIMER.bl_gates * (gatesChained ? 0.5 : 1)) {
      bldGatesTimer = 0;
      const id = pick(BLD_SUMMON_POOL.bl_gates);
      inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
      stats.summons = (stats.summons || 0) + 1; /* для контрактов */
      fxMarkBuildings('bl_gates', 3); /* вспышка портала на 3с */
      toast('🚪 Врата Ада выпустили: <b>' + CARDS[id].name + '</b> (в коллекции)' + (gatesChained ? ' ⛓' : ''), 'summon', 45);
      changed = true;
    }
  }
  /* Гора костей: ЖАТВА ×2 каждые 30с (⛓ прикованная — каждые 15с) */
  const mounds = countOnGrid('bl_mound');
  if (mounds > 0) {
    bldMoundTimer += dt;
    const moundChained = chainedIds.has('bl_mound');
    if (bldMoundTimer >= BLD_TIMER.bl_mound * (moundChained ? 0.5 : 1)) {
      bldMoundTimer = 0;
      const mult = Math.min(3, 2 + 0.25 * (mounds - 1));
      altBuff.mult = mult; altBuff.until = gameTime + 5;
      fxMarkBuildings('bl_mound', 5); /* Гора дышит, пока идёт ЖАТВА (5с) */
      altBuff.label = '🗿 ЖАТВА ×' + mult.toFixed(2).replace(/\.?0+$/, '') + (moundChained ? ' ⛓' : '');
      toast('🗿 Гора костей отдаёт накопленное: доход ×' + mult.toFixed(2).replace(/\.?0+$/, '') + ' на 5 секунд!' + (moundChained ? ' ⛓' : ''), 'mound', 40);
      updateHUD();
    }
  }
  if (changed) { renderCollection(); updateHUD(); }
}
function countOnGrid(id) {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && grid[r][c].cardId === id) n++;
  return n;
}
