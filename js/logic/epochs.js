'use strict';
/* ============================================================
   ЛОГИКА: ЭПОХИ (logic/epochs.js)
   Пункт 1 ТЗ: престиж → Эпоха. Прогресс, переход, сброс,
   печати и магазин печатей. Поле расширяется АВТОМАТИЧЕСКИ при
   переходе (epochMaxSize), докупать ничего не нужно.
   ============================================================ */

function epochProgress() {
  const threshold = epochThreshold(epoch);
  return { earned: runEarned, threshold, pct: Math.min(1, runEarned / threshold) };
}
function canEpochUp() { return runEarned >= epochThreshold(epoch); }

/* Что сбросится, а что останется (для окна-предупреждения) */
function epochResetSummary() {
  return {
    reset: ['Грид (Алтарь) и карты', 'Инвентарь карт', 'Бойцы и этажи Арены',
      'Кристаллы 💎', 'Pity-счётчики круток'],
    keep: ['Достижения 🏅', 'Печати 🔱 и магазин печатей', 'Открытые фишки карт',
      'Доступные фракции и разблокировки Эпох']
  };
}

/* ПОЛЕ РАСТЁТ САМО: при переходе playableSize = epochMaxSize(epoch) —
   докупать расширения не нужно (пользователь молодец, что апал Эпоху) */
/* ---------------- Подготовка нового забега внутри выбранной фракции ---------------- */
function doEpochUp(newFaction) {
  let gain = epochSealsGain(epoch);
  /* «Корона Забытых» (реликвия): +25% печатей */
  if (hasRelic('crown')) gain = Math.round(gain * 1.25);
  seals += gain; sealsTotal += gain;
  epoch++;
  maxEpoch = Math.max(maxEpoch, epoch);
  faction = newFaction;
  /* Реликвии за Эпохи 3 / 5 / 7 */
  if (epoch === 3 || epoch === 5 || epoch === 7) setTimeout(() => grantRandomRelic(), 900);
  /* Шоу Эпохи */
  sfx('epoch');
  fxConfetti(130);
  fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#e8c060');

  /* Сброс забега. Поле растёт АВТОМАТИЧЕСКИ (бесплатно) до размера Эпохи */
  const baseCr = 2500 * (hasRelic('bag') ? 2 : 1);
  crystals = baseCr + (sealLv.impulse > 0 ? 2500 * Math.pow(2, sealLv.impulse) : 0);
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = epochMaxSize(epoch);
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false), fallen: {} };
  arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
  pity4 = 0; pity5 = 0; runRolls = 0; runEarned = 0; runTime = 0;
  altBuff = { mult: 1, until: 0, label: '' };
  milestoneIdx = 0; freeRolls = 0;
  omens = []; omenTimer = 60; renderOmens();

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
  queueFeatureGuides(); /* онбординг: новая фракция/фичи этой Эпохи */
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
