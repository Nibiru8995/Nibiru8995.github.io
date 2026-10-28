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
   данного вида накрывает клетку. Аура НЕ растёт от стаков здания. */
function buildBuildingAuras() {
  const bld = { grave: {}, obelisk: {}, gates: {}, glacier: {}, pen: {}, pole: {}, spring: {}, pit: {}, wells: 0, mound: 0 };
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (!CARDS[it.cardId] || !CARDS[it.cardId].isBuilding) continue;
    const R = BUILDING_AURA[it.cardId]; if (R === undefined) continue;
    const add = key => { for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      bld[key][nr + ',' + nc] = (bld[key][nr + ',' + nc] || 0) + 1;
    } };
    if (it.cardId === 'bl_grave') add('grave');
    else if (it.cardId === 'bl_obelisk') add('obelisk');
    else if (it.cardId === 'bl_gates') add('gates');
    else if (it.cardId === 'bl_glacier') add('glacier');
    else if (it.cardId === 'bl_pen') add('pen');
    else if (it.cardId === 'bl_pole') add('pole');
    else if (it.cardId === 'bl_spring') add('spring');
    else if (it.cardId === 'bl_pit') add('pit');
    else if (it.cardId === 'bl_well') bld.wells++;
    else if (it.cardId === 'bl_mound') bld.mound++;
  }
  return bld;
}

/* Зона Склепа (звенья нежити в радиусе 2 от каждого Склепа не слабеют) */
function buildCryptZone() {
  const zone = new Set();
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'bl_crypt') continue;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) zone.add(nr + ',' + nc);
    }
  }
  return zone;
}

/* Тик периодических зданий: призыв и Жатва */
let bldGraveTimer = 0, bldGatesTimer = 0, bldMoundTimer = 0;
function tickBuildings(dt) {
  let changed = false;
  /* Кладбище: бесплатная нежить каждые 12с */
  if (hasCard('bl_grave')) {
    bldGraveTimer += dt;
    if (bldGraveTimer >= BLD_TIMER.bl_grave) {
      bldGraveTimer = 0;
      const id = pick(BLD_SUMMON_POOL.bl_grave);
      inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
      stats.summons = (stats.summons || 0) + 1; /* v1.2.9: для контрактов */
      toast('🪦 Кладбище подняло: <b>' + CARDS[id].name + '</b> (в коллекции)', 'summon', 45);
      changed = true;
    }
  }
  /* Врата Ада: бесплатный демон каждые 25с */
  if (hasCard('bl_gates')) {
    bldGatesTimer += dt;
    if (bldGatesTimer >= BLD_TIMER.bl_gates) {
      bldGatesTimer = 0;
      const id = pick(BLD_SUMMON_POOL.bl_gates);
      inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
      stats.summons = (stats.summons || 0) + 1; /* v1.2.9: для контрактов */
      toast('🚪 Врата Ада выпустили: <b>' + CARDS[id].name + '</b> (в коллекции)', 'summon', 45);
      changed = true;
    }
  }
  /* Гора костей: ЖАТВА ×2 (бывшая «Жатва» Жнеца) каждые 30с */
  const mounds = countOnGrid('bl_mound');
  if (mounds > 0) {
    bldMoundTimer += dt;
    if (bldMoundTimer >= BLD_TIMER.bl_mound) {
      bldMoundTimer = 0;
      const mult = Math.min(3, 2 + 0.25 * (mounds - 1));
      altBuff.mult = mult; altBuff.until = gameTime + 5;
      altBuff.label = '🗿 ЖАТВА ×' + mult.toFixed(2).replace(/\.?0+$/, '');
      toast('🗿 Гора костей отдаёт накопленное: доход ×' + mult.toFixed(2).replace(/\.?0+$/, '') + ' на 5 секунд!', 'mound', 40);
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
