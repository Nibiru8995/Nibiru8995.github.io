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
    reset: ['Грид (Алтарь) и расставленные карты', 'Инвентарь забега (включая застакованные карты колоды)', 'Бойцы и этажи Арены',
      'Тёмная энергия', 'РЕЛИКВИИ (собранные и расставленные)'],
    keep: ['Достижения 🏅', 'Печати 🔱 и магазин печатей', 'Открытые фишки карт',
      'Доступные фракции и разблокировки Эпох',
      'ДУШИ, коллекция и колоды Гримуара']
  };
}

/* ПОЛЕ РАСТЁТ САМО: при переходе playableSize = epochMaxSize(epoch) —
   докупать расширения не нужно (пользователь молодец, что апал Эпоху) */
/* v1.7.0: ВЫДАЧА КОЛОДЫ В ЗАБЕГ + ЗАСТАКОВАННЫЕ КАРТЫ.
   Копии одной карты в колоде (до DECK_STACK_MAX = 5) приходят стаком:
   deckStacks[cardId] = N — первая постановка такой карты на грид
   встанет ГОТОВЫМ юнитом ×N (logic/grid.js), а не одной копией. */
function handOutDeck(deck) {
  deckStacks = {};
  if (!deck || !deck.cards.length) return '';
  const cnt = {};
  deck.cards.forEach(id => {
    inventory[id] = (inventory[id] || 0) + 1;
    cnt[id] = (cnt[id] || 0) + 1;
    discovered.add(id);
  });
  Object.keys(cnt).forEach(id => { if (cnt[id] >= 2) deckStacks[id] = Math.min(cnt[id], DECK_STACK_MAX); });
  return deck.name;
}

/* ---------------- Общий сброс забега (v1.4.3) ----------------
   Единая правда для Вознесения (doEpochUp) и Рестарта Эпохи (doEpochRestart).
   ВАЖНО: вызывать ПОСЛЕ epoch++/назначения эпохи и уже с НОВОЙ фракцией —
   playableSize считается как epochMaxSize(epoch) по АКТУАЛЬНОЙ эпохе.
   Возвращает время завершённого забега (для Таблички Тьмы).

   v1.6.0 «Гримуар»: на старте забега игроку выдаётся ВСЯ активная колода
   его расы (пункт 6 итерации: механика выдачи будет усложнена позже).
   Нет колоды/она пуста — фолбэк на классический старт-кит.
   v1.7.0: застакованные карты колоды идут через deckStacks; ручной
   стак на гриде отключён; pity — мета, крутки платят Душами. */
function resetRunCommon(newFaction) {
  const _runSecsAtEnd = runTime;
  faction = newFaction;
  applyFactionTheme(); /* v1.5.0: новая фракция — новая тема (фон/палитра) */
  /* Сброс забега. Поле растёт АВТОМАТИЧЕСКИ (бесплатно) до размера Эпохи.
     РЕЛИКВИИ — расходник забега: коллекция и расстановка сбрасываются,
     но из СХРОНА Призыва выдаются накопленные реликвии (relicStash). */
  const baseCr = 2500;
  crystals = baseCr + (sealLv.impulse > 0 ? 2500 * Math.pow(2, sealLv.impulse) : 0);
  RELICS_OWNED = new Set(relicStash.filter(id => relicById(id))); relicStash = [];
  relicSlots = {}; blessedRelics = new Set(); runRituals = 0; runOffline = 0;
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = epochMaxSize(epoch);
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false), fallen: {} };
  arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
  arenaStreak = 0;
  runRolls = 0; runEarned = 0; runTime = 0;
  altBuff = { mult: 1, until: 0, label: '' };
  ritualResonance = 0; surgeUntil = 0;
  milestoneIdx = 0;
  contractsInit(); /* v1.2.9: Тёмный Пакт начинается заново с каждой Эпохой */
  omens = []; omenTimer = 60; renderOmens();

  /* ВЫДАЁМ КОЛОДУ (v1.6.0): вся активная колода расы забега — в инвентарь сразу.
     v1.7.0: застакованные копии — через deckStacks (постановка = юнит ×N).
     Пусто → старт-кит фракции, как раньше. */
  let deckTitle = '';
  const deck = ensureStarterDeck(faction);
  const src = (deck && deck.cards.length) ? deck : null;
  if (src) {
    deckTitle = handOutDeck(src);
  } else {
    deckStacks = {};
    const startR1 = POOL_3.filter(id => CARDS[id].faction === faction);
    const gift = drawDistinct(startR1, 2).concat(startKitFor(faction));
    gift.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
  }
  /* Заголовок коллекции = колода, с которой начат забег (v1.6.0, пункт 2) */
  const ct = $('collectionTitle'); if (ct) ct.textContent = deckTitle ? 'Колода: ' + deckTitle : 'Колода';

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
  /* v1.6.0: СМЕНА ЭПОХИ ПЛАТИТ ДУШОЙ — источник Призыва №1 */
  souls += 1;
  /* Шоу Эпохи */
  sfx('epoch');
  fxConfetti(130);
  fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#e8c060');
  const _runSecsAtEnd = resetRunCommon(newFaction);
  toast('⚜ ЭПОХА ' + epoch + ' «' + epochName(epoch) + '» · ' + FACTION_INFO[faction].epochTitle + ': +' + gain + ' 🔱 · ' + SOUL_IMG + ' +1 Душа');
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
