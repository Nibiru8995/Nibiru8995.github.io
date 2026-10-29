'use strict';
/* ============================================================
   ДАННЫЕ + ДВИЖОК: ЗДАНИЯ (data/buildings.js) — v1.2.5
   Здание — особый тип карты (rarity 'B'): постройка с аурой
   и/или периодическим эффектом. Ставится как карта, эффекты
   НЕ растут от стаков (только доход клетки).
   Эффекты зданий читаются экономикой (INC_CTX.bld) и тиками
   (tickBuildings в logic/faction_mechanics.js).
   ============================================================ */

/* Радиус ауры здания (клетки). 0 = эффект глобальный. */
const BUILDING_AURA = {
  bl_grave: 2, bl_crypt: 2, bl_mound: 0,
  bl_altar: 1, bl_obelisk: 2, bl_well: 3,
  bl_pen: 2, bl_pole: 3, bl_spring: 2,
  bl_pit: 2, bl_gates: 2, bl_glacier: 2
};

/* Периодические эффекты (секунды): Кладбище/Врата — призыв, Гора — Жатва */
const BLD_TIMER = { bl_grave: 12, bl_gates: 25, bl_mound: 30 };

/* Списки бесплатного призыва (базовые карты фракции) */
const BLD_SUMMON_POOL = {
  bl_grave: ['u0', 'u1', 'u2', 'u3'],
  bl_gates: ['d0', 'd1', 'd2', 'd3']
};

/* Радиусы аур карт + зданий — единая карта для подсветки (grid_render) */
function auraRadiusOf(cardId) {
  if (BUILDING_AURA[cardId] !== undefined) return BUILDING_AURA[cardId];
  const R = { u8: 1, u10: 2, u11: 2, bl_altar: 1, c9: 2, b8: 1, b9: 2, b10: 1, d8: 1, d9: 1, d10: 2, d11: 1 };
  return R[cardId] || 0;
}

/* ---------------- ДВИЖОК АУР ЗДАНИЙ ----------------
   Пересобирается в computeIncome. INC_CTX.bld[ключ] = сколько аур
   данного вида накрывает клетку. Аура НЕ растёт от стаков здания.
   v1.4.0 ⛓ ПРИКОВАННЫЕ ЗДАНИЯ: здание с орто-соседом «Скованный Цепью»
   (u11) — chainedAt; его аура ×1.5 (graveM/gatesM/glacierM/obeliskM),
   глобальные флаги pen/pole/spring/pit/wells/mound, зона прикованного
   Склепа защищает 3 звена пары вместо 2, периодика срабатывает дважды. */
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
    const chained = chainedHere(r, c);   /* ⛓ Приковано Скованным Цепью */
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

/* Зона Склепа (звенья нежити в радиусе 2 от каждого Склепа не слабеют) +
   зона ПРИКОВАННОГО Склепа (защищает до 3 звеньев пары) */
function buildCryptZone() {
  const zone = new Set();
  const chained = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'bl_crypt') continue;
    const isChained = getNeighbors(r, c).some(n => n.item.cardId === 'u11');
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
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

/* Тик периодических зданий: призыв и Жатва.
   v1.4.0 ⛓ ПРИКОВАННЫЕ ЗДАНИЯ (Скованный Цепью рядом): абилка срабатывает
   ДВАЖДЫ — Кладбище и Врата поднимают двоих, ЖАТВА Горы длится 10с вместо 5с. */
function bldIsChained(id) {
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (it && it.cardId === id && getNeighbors(r, c).some(n => n.item.cardId === 'u11')) return true;
  }
  return false;
}
let bldGraveTimer = 0, bldGatesTimer = 0, bldMoundTimer = 0;
function tickBuildings(dt) {
  let changed = false;
  /* Кладбище: бесплатная нежить каждые 12с (прикованное — по двое) */
  if (hasCard('bl_grave')) {
    bldGraveTimer += dt;
    if (bldGraveTimer >= BLD_TIMER.bl_grave) {
      bldGraveTimer = 0;
      const nTimes = bldIsChained('bl_grave') ? 2 : 1;
      for (let i = 0; i < nTimes; i++) {
        const id = pick(BLD_SUMMON_POOL.bl_grave);
        inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
        stats.summons = (stats.summons || 0) + 1; /* v1.2.9: для контрактов */
        toast('🪦 Кладбище подняло: <b>' + CARDS[id].name + '</b> (в коллекции)' + (nTimes > 1 ? ' ⛓ ДВОЙНОЙ ПРИЗЫВ' : ''), 'summon', 45);
      }
      changed = true;
    }
  }
  /* Врата Ада: бесплатный демон каждые 25с (прикованные — по двое) */
  if (hasCard('bl_gates')) {
    bldGatesTimer += dt;
    if (bldGatesTimer >= BLD_TIMER.bl_gates) {
      bldGatesTimer = 0;
      const nTimes = bldIsChained('bl_gates') ? 2 : 1;
      for (let i = 0; i < nTimes; i++) {
        const id = pick(BLD_SUMMON_POOL.bl_gates);
        inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
        stats.summons = (stats.summons || 0) + 1; /* v1.2.9: для контрактов */
        toast('🚪 Врата Ада выпустили: <b>' + CARDS[id].name + '</b> (в коллекции)' + (nTimes > 1 ? ' ⛓ ДВОЙНОЙ ПРИЗЫВ' : ''), 'summon', 45);
      }
      changed = true;
    }
  }
  /* Гора костей: ЖАТВА ×2 (бывшая «Жатва» Жнеца) каждые 30с.
     ⛓ Прикованная Гора: дубликат — ЖАТВА длится 10с вместо 5с. */
  const mounds = countOnGrid('bl_mound');
  if (mounds > 0) {
    bldMoundTimer += dt;
    if (bldMoundTimer >= BLD_TIMER.bl_mound) {
      bldMoundTimer = 0;
      const mult = Math.min(3, 2 + 0.25 * (mounds - 1));
      const chained = bldIsChained('bl_mound');
      altBuff.mult = mult; altBuff.until = gameTime + 5 * (chained ? 2 : 1);
      altBuff.label = '🗿 ЖАТВА ×' + mult.toFixed(2).replace(/\.?0+$/, '') + (chained ? ' ⛓' : '');
      toast('🗿 Гора костей отдаёт накопленное: доход ×' + mult.toFixed(2).replace(/\.?0+$/, '') + ' на ' + (chained ? '10 секунд (двойная) ⛓' : '5 секунд!') , 'mound', 40);
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
