'use strict';
/* ============================================================
   ЛОГИКА: ЭПОХИ (logic/epochs.js)
   Пункт 1 ТЗ: престиж → Эпоха. Прогресс, переход, сброс,
   печати и магазин печатей. Пункты 7-8 ТЗ: расширение Алтаря
   целиком, только нечётные размеры 3→5→7→9.
   ============================================================ */

function epochProgress() {
  const threshold = epochThreshold(epoch);
  return { earned: runEarned, threshold, pct: Math.min(1, runEarned / threshold) };
}
function canEpochUp() { return runEarned >= epochThreshold(epoch); }

/* Что сбросится, а что останется (для окна-предупреждения) */
function epochResetSummary() {
  return {
    reset: ['Грид (Алтарь) и его расширения', 'Инвентарь карт', 'Бойцы и этажи Арены',
      'Кристаллы 💎', 'Pity-счётчики круток'],
    keep: ['Достижения 🏅', 'Печати 🔱 и магазин печатей', 'Открытые фишки карт',
      'Доступные фракции и разблокировки Эпох']
  };
}

/* ---------------- РАСШИРЕНИЕ АЛТАРЯ (пункты 7-8 ТЗ) ----------------
   Только целыми нечётными шагами: 3×3 → 5×5 → 7×7 → 9×9.
   Следующий шаг виден всегда (но 9×9 — абсолютный максимум),
   а ПОКУПКА доступна только если эпоха уже открыла этот размер. */
function altarNextSize() {
  if (playableSize >= GRID_SIZE) return null;
  return playableSize + 2;
}
function altarUpgradeCost() {
  const n = altarNextSize();
  if (!n) return 0;
  return Math.round((ALTAR_COST[n] || 0) * (1 - 0.15 * sealLv.arch));
}
function buyAltarUpgrade() {
  const n = altarNextSize();
  if (!n) { toast('Алтарь уже максимального размера'); return; }
  if (n > epochMaxSize(epoch)) {
    let ue = 3;
    while (epochMaxSize(ue) < n) ue++;
    toast('🧱 Расширение до ' + n + '×' + n + ' откроется в Эпохе ' + ue);
    return;
  }
  const cost = altarUpgradeCost();
  if (crystals < cost) { toast('Не хватает 💎: нужно ' + fmt(cost)); return; }
  crystals -= cost;
  playableSize = n;
  rebuildPlayableMask();
  computeIncome();
  buildGrid();
  cancelSelection();
  renderCollection(); updateHUD();
  renderEpochMenu();
  toast('🧱 Алтарь расширен до ' + n + '×' + n + '!');
  checkAchievements();
}

/* ---------------- Подготовка нового забега внутри выбранной фракции ---------------- */
function doEpochUp(newFaction) {
  const gain = epochSealsGain(epoch);
  seals += gain; sealsTotal += gain;
  epoch++;
  maxEpoch = Math.max(maxEpoch, epoch);
  faction = newFaction;

  /* Сброс забега */
  crystals = 2500 + (sealLv.impulse > 0 ? 2500 * Math.pow(2, sealLv.impulse) : 0);
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = 3;
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false) };
  arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
  pity4 = 0; pity5 = 0; runRolls = 0; runEarned = 0; runTime = 0;

  /* Стартовый набор фракции: 2 разных ★1 и 1 ★3 */
  const startR1 = POOL_1.filter(id => CARDS[id].faction === faction);
  const startR3 = POOL_3.filter(id => CARDS[id].faction === faction);
  const gift = drawDistinct(startR1, 2).concat([pick(startR3)]);
  gift.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });

  computeIncome();
  saveMeta(); saveRun();
  buildGrid();
  cancelSelection();
  renderCollection(); renderFighters(); initArena(); updateHUD(); updateBanner(); updateEpochUI();
  toast('⚜ ' + FACTION_INFO[faction].epochTitle + ': +' + gain + ' 🔱');
  checkAchievements();
}

/* Магазин печатей */
function sealCost(seal) { return seal.cost(sealLv[seal.id]); }
function buySeal(id) {
  const seal = SEALS_SHOP.find(s => s.id === id);
  if (!seal || sealLv[id] >= seal.max) return;
  const cost = sealCost(seal);
  if (seals < cost) { toast('Не хватает печатей 🔱: нужно ' + cost); return; }
  seals -= cost; sealLv[id]++;
  saveMeta();
  renderEpochMenu(); updateHUD();
  toast(seal.icon + ' ' + seal.name + ': уровень ' + sealLv[id]);
}
