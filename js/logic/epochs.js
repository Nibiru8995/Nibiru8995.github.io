'use strict';
/* ============================================================
   ЛОГИКА: ЭПОХИ (logic/epochs.js) — v1.8.0 «Вечная Эпоха»
   Прогресс, переход, сброс. ЭПОХИ БЕСКОНЕЧНЫ и ничего не
   открывают (все покупки — за Души в «Улучшениях»); порог растёт
   множителем ×3 (data/epochs.js). Поле задаётся купленными
   расширениями (fieldSize()), от Эпохи не растёт.
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
      'Тёмная энергия'],
    keep: ['Достижения 🏅', 'Улучшения (за Души)', 'Открытые фишки карт',
      'ДУШИ, коллекция и колоды Гримуара']
  };
}

/* v1.7.0: ВЫДАЧА КОЛОДЫ В ЗАБЕГ + ЗАСТАКОВАННЫЕ КАРТЫ.
   v1.8.0: колода — ЗАПИСИ {id, n}. Каждая запись со стаком n≥2 кладёт
   своё N в ОЧЕРЕДЬ deckStacks[id] (по убыванию). Постановка карты на
   грид берёт ПЕРВЫЙ стак очереди и встанет готовым юнитом ×N.
   Отдельные записи ×1 приходят одиночками — игрок сам решает в
   Гримуаре, что застакать (фиолетовая стрелка ▲ — та запись, на
   которую кликнули), а что оставить развёрнутым.
   Снапшот runDeck — для req-требований контрактов. */
function handOutDeck(deck) {
  deckStacks = {};
  runDeck = [];
  if (!deck || !deck.cards.length) return '';
  const q = {};
  deck.cards.forEach(en => {
    const id = en.id, n = en.n || 1;
    inventory[id] = (inventory[id] || 0) + n;
    runDeck.push(id);
    if (n >= 2) (q[id] = q[id] || []).push(n);
    discovered.add(id);
  });
  Object.keys(q).forEach(id => { q[id].sort((a, b) => b - a); deckStacks[id] = q[id]; });
  return deck.name;
}

/* ---------------- Общий сброс забега (v1.4.3) ----------------
   Единая правда для Вознесения (doEpochUp) и Рестарта Эпохи (doEpochRestart).
   ВАЖНО: вызывать ПОСЛЕ epoch++/назначения эпохи и уже с НОВОЙ фракцией.
   Возвращает время завершённого забега (для Таблички Тьмы).

   v1.6.0: на старте забега игроку выдаётся выбранная колода его расы
   целиком (обязательный выбор колоды при выборе расы — v1.8.0).
   Нет колоды (чит-режим) — фолбэк на классический старт-кит.
   v1.8.0: записи {id, n} → очереди deckStacks; контракты
   инициализируются ПОСЛЕ выдачи колоды (req сверяется с runDeck). */
function resetRunCommon(newFaction, deck) {
  const _runSecsAtEnd = runTime;
  faction = newFaction;
  applyFactionTheme(); /* новая фракция — новая тема (фон/палитра) */
  /* Сброс забега. Поле = купленный размер (Улучшения).
     РЕЛИКВИИ — расходник забега, но пока способа получить их нет
     (v1.8.0): схрон удалён, коллекция всегда пуста. */
  const baseCr = 2500;
  crystals = baseCr + (upgLv.impulse > 0 ? 2500 * Math.pow(2, upgLv.impulse) : 0);
  RELICS_OWNED = new Set(); relicSlots = {}; blessedRelics = new Set(); runRituals = 0; runOffline = 0;
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = fieldSize();
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
  omens = []; omenTimer = 60; renderOmens();

  /* v1.8.1 «Подготовленная земля»: в центре поля бесплатно стоит
     базовое здание фракции (нежить — Кладбище, культисты — Алтарь).
     Ставится как обычное здание (buildBuildingAuras его видит). */
  if (featOwned('ground')) {
    const base = faction === 'undead' ? 'bl_grave' : (faction === 'cultist' ? 'bl_altar' : null);
    if (base) {
      const mid = Math.floor(playableSize / 2), gr = gridStart() + mid, gc = gridStart() + mid;
      if (!grid[gr][gc] && CARDS[base]) {
        const hp = cardHp(CARDS[base].rarity);
        grid[gr][gc] = { cardId: base, stacks: 1, hp, maxHp: hp,
          predBuff: 0, mutBuff: 1, embers: 0, hunger: 1, graze: 0, floraBuff: 0, scavBuff: 0, boomUntil: 0, petrCount: 0 };
      }
    }
  }

  /* ВЫДАЁМ КОЛОДУ (v1.6.0): выбранная колода расы забега — в инвентарь сразу.
     v1.8.0: записи {id, n} → очереди deckStacks; runDeck-снапшот.
     v1.11.1: пустой/чужой колоды больше НЕ создаём (авто-колоды убраны) —
     фолбэк на старт-кит фракции, как и обещает окно выбора колоды. */
  let deckTitle = '';
  const src = (deck && deck.cards.length) ? deck : null;
  if (src && src.cards.length) {
    deckTitle = handOutDeck(src);
  } else {
    deckStacks = {}; runDeck = [];
    const startR1 = POOL_3.filter(id => CARDS[id].faction === faction);
    const gift = drawDistinct(startR1, 2).concat(startKitFor(faction));
    gift.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); runDeck.push(id); });
  }
  /* Заголовок коллекции = колода, с которой начат забег */
  const ct = $('collectionTitle'); if (ct) ct.textContent = deckTitle ? 'Колода: ' + deckTitle : 'Колода';

  /* v1.8.0: контракты ПОСЛЕ выдачи колоды — 4 случайных, выполнимых
     с той колодой, с которой начата Эпоха */
  contractsInit();

  computeIncome();
  saveMeta(); saveRun();
  buildGrid();
  cancelSelection();
  renderCollection(); renderFighters(); initArena(); updateHUD(); updateBanner(); updateEpochUI();
  return _runSecsAtEnd;
}

/* ---------------- Вознесение: новая Эпоха ---------------- */
function doEpochUp(newFaction, deck) {
  epoch++;
  maxEpoch = Math.max(maxEpoch, epoch);
  /* СМЕНА ЭПОХИ ПЛАТИТ ДУШОЙ — источник Призыва и Улучшений №1 */
  gainSouls(ASCEND_SOULS);
  /* Шоу Эпохи */
  sfx('epoch');
  fxConfetti(130);
  fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#e8c060');
  const _runSecsAtEnd = resetRunCommon(newFaction, deck);
  toast('ЭПОХА ' + epoch + ' «' + epochName(epoch) + '» · ' + FACTION_INFO[faction].epochTitle + ': ' + SOUL_IMG + ' +' + ASCEND_SOULS + ' Души');
  supaSubmit(_runSecsAtEnd, true); /* Вознесение — гарантированная запись (Эпоха выросла) */
  checkAchievements();
  queueFeatureGuides(); /* онбординг: новая фракция/фичи */
}

/* v1.4.3 «Второй Круг»: РЕСТАРТ ТЕКУЩЕЙ Эпохи — кнопка над «Меню».
   Забег сгорает целиком, Эпоха ОСТАЁТСЯ той же, фракцию и колоду
   можно выбрать заново. Вознесением НЕ считается. */
function doEpochRestart(newFaction, deck) {
  const _runSecsAtEnd = resetRunCommon(newFaction, deck);
  sfx('epoch');
  toast('⟲ ЭПОХА ' + epoch + ' «' + epochName(epoch) + '» начата заново · ' + FACTION_INFO[faction].epochTitle);
  supaSubmit(_runSecsAtEnd, false, true); /* тихая запись: Эпоха не выросла — только если рекорд побит */
  checkAchievements();
  queueFeatureGuides();
}
