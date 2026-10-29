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
      'Кристаллы 💎', 'Pity-счётчики круток', 'РЕЛИКВИИ (собранные и расставленные)'],
    keep: ['Достижения 🏅', 'Печати 🔱 и магазин печатей', 'Открытые фишки карт',
      'Доступные фракции и разблокировки Эпох']
  };
}

/* ПОЛЕ РАСТЁТ САМО: при переходе playableSize = epochMaxSize(epoch) —
   докупать расширения не нужно (пользователь молодец, что апал Эпоху) */
/* ---------------- Общий сброс забега (v1.4.3) ----------------
   Единая правда для Вознесения (doEpochUp) и Рестарта Эпохи (doEpochRestart).
   ВАЖНО: вызывать ПОСЛЕ epoch++/назначения эпохи и уже с НОВОЙ фракцией —
   playableSize считается как epochMaxSize(epoch) по АКТУАЛЬНОЙ эпохе.
   Возвращает время завершённого забега (для Таблички Тьмы). */
function resetRunCommon(newFaction) {
  const _runSecsAtEnd = runTime;
  faction = newFaction;
  applyFactionTheme(); /* v1.5.0: новая фракция — новая тема (фон/палитра) */
  /* Сброс забега. Поле растёт АВТОМАТИЧЕСКИ (бесплатно) до размера Эпохи.
     v1.2.5: РЕЛИКВИИ — расходник забега: сбрасывается и коллекция,
     и расстановка (эффекты реликвий мощные именно поэтому).
     v1.4.3: blessed-реликвии и счётчики забега (ритуалы/оффлайн) чистятся тоже. */
  const baseCr = 2500;
  crystals = baseCr + (sealLv.impulse > 0 ? 2500 * Math.pow(2, sealLv.impulse) : 0);
  RELICS_OWNED = new Set(); relicSlots = {}; relicPity = 0;
  blessedRelics = new Set(); runRituals = 0; runOffline = 0;
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = epochMaxSize(epoch);
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false), fallen: {} };
  arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
  arenaStreak = 0;
  pity4 = 0; pity5 = 0; runRolls = 0; runEarned = 0; runTime = 0;
  altBuff = { mult: 1, until: 0, label: '' };
  ritualResonance = 0; surgeUntil = 0;
  milestoneIdx = 0; freeRolls = 0;
  contractsInit(); /* v1.2.9: Тёмный Пакт начинается заново с каждой Эпохой */
  omens = []; omenTimer = 60; renderOmens();

  /* Стартовый набор фракции: пара случайных карт + ключ механики + ЗДАНИЕ:
     нежить — Некромант + Кладбище, культисты — Ритуальный Алтарь,
     звери — готовая цепь + Вольер, демоны — Кровавый Жрец + Яма */
  const startR1 = POOL_3.filter(id => CARDS[id].faction === faction);
  const gift = drawDistinct(startR1, 2).concat(startKitFor(faction));
  gift.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });

  computeIncome();
  saveMeta(); saveRun();
  buildGrid();
  cancelSelection();
  renderCollection(); renderFighters(); initArena(); updateHUD(); updateBanner(); updateEpochUI();
  return _runSecsAtEnd;
}

/* ---------------- Подготовка нового забега внутри выбранной фракции ---------------- */
function doEpochUp(newFaction) {
  const gain = epochSealsGain(epoch);
  seals += gain; sealsTotal += gain;
  epoch++;
  maxEpoch = Math.max(maxEpoch, epoch);
  /* Шоу Эпохи */
  sfx('epoch');
  fxConfetti(130);
  fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#e8c060');
  const _runSecsAtEnd = resetRunCommon(newFaction);
  toast('⚜ ЭПОХА ' + epoch + ' «' + epochName(epoch) + '» · ' + FACTION_INFO[faction].epochTitle + ': +' + gain + ' 🔱');
  supaSubmit(_runSecsAtEnd, true); /* v1.2.9.2: Вознесение — гарантированная запись (Эпоха выросла) */
  checkAchievements();
  queueFeatureGuides(); /* онбординг: новая фракция/фичи этой Эпохи */
}

/* v1.4.3 «Второй Круг»: РЕСТАРТ ТЕКУЩЕЙ Эпохи — кнопка над «Меню».
   Забег сгорает целиком, Эпоха ОСТАЁТСЯ той же, фракцию можно сменить.
   Вознесением НЕ считается: печатей 🔱 НЕ даёт (иначе рестарт-фарм). */
function doEpochRestart(newFaction) {
  const _runSecsAtEnd = resetRunCommon(newFaction);
  sfx('epoch');
  toast('⟲ ЭПОХА ' + epoch + ' «' + epochName(epoch) + '» начата заново · ' + FACTION_INFO[faction].epochTitle);
  supaSubmit(_runSecsAtEnd, false, true); /* тихая запись: Эпоха не выросла — только если рекорд побит */
  checkAchievements();
  queueFeatureGuides();
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
