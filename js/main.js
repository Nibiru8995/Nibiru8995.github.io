'use strict';
/* ============================================================
   ГЛАВНЫЙ ФАЙЛ (main.js)
   Игровой цикл, связывание событий, обучение, загрузка/меню.
   Подключается ПОСЛЕДНИМ: все модули уже загружены.
   ============================================================ */

let lastTick = performance.now();

function gameLoop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.2) * speedMult;
  lastTick = now;
  if (!gamePaused && gameStarted) {
    computeIncome();
    const inc = calculateIncome();
    crystals += inc * dt;
    runTime += dt; gameTime += dt;
    tickFactionMechanics(dt);
    tickOmens(dt);
    updateHUD();
  }
  requestAnimationFrame(gameLoop);
}

/* ---------------- Гача: обработка кнопок ---------------- */
function doRolls(count) {
  const free = count === 1 && freeRolls > 0;
  const res = performRolls(count, free);
  if (!res) { toast('Не хватает 💎'); return; }
  if (free) { freeRolls--; saveRun(); toast('🏅 Бесплатная крутка по вехе!'); }
  sfx('roll');
  if (count === 1 && res.cards.length === 1) showDrop(res.cards[0]);
  else showMulti(res.cards, count);
  updateHUD(); checkAchievements();
}

/* ---------------- Обучение ----------------
   Учит базовым механикам: гача+пити, установка и СТАКИНГ карт,
   синергии+затухание, как продвигать Эпохи (без принуждения).
   Онбординг новых фич — отдельная система logic/guide.js. */
const TUT_GIVE = l => { l.forEach(([id, n]) => { inventory[id] = (inventory[id] || 0) + n; discovered.add(id); }); renderCollection(); };
const gridHas = id => grid.some(row => row.some(it => it && it.cardId === id));
const gridStacked = () => grid.some(row => row.some(it => it && it.stacks >= 2));
const TUT = [
  { t: '📖 <b>Обучение.</b> Игровой цикл: <b>крутите карты</b> → ставьте на <b>Алтарь</b> → карты приносят 💎/сек → копите порог → <b>Эпоха</b> даёт печати 🔱 и открывает новые фичи. Это учебный забег — прогресс не сохранится.', n: 1, pre: () => { crystals = 500; updateHUD(); } },
  { t: '<b>Шаг 1. Гача.</b> Жмите «КРУТКА», затем «ПРИНЯТЬ». Гача выдаёт ТОЛЬКО карты вашей фракции. <b>Гарантия (pity):</b> каждые 10 круток — минимум ★3, каждые 80 — ★5. Счётчик гарантии виден над кнопками круток.', hl: '#roll1', ok: () => Object.keys(inventory).length > 0 },
  { t: '<b>Шаг 2.</b> Карта упала в коллекцию внизу. Кликните по ней — карта возьмётся «в руку», а подходящие клетки Алтаря подсветятся.', hl: '#collectGrid', ok: () => placingMode },
  { t: '<b>Шаг 3. Алтарь.</b> Кликните по подсвеченной клетке — карта встанет и начнёт приносить 💎/сек (счётчик над Алтарём).', hl: '#grid', ok: () => cardsOnGrid() > 0 },
  { t: '<b>Шаг 4. Стакинг — главный секрет Алтаря!</b> Мы выдали «Скелета» ×2. Выберите его и поставьте на любую клетку. Одна и та же клетка вмещает до ×5 копий одной карты — это называется стак.', pre: () => TUT_GIVE([['u0', 2]]), hl: '#collectGrid', ok: () => gridHas('u0') },
  { t: '<b>Шаг 5. Стак.</b> Выберите второго Скелета и кликните по ТОЙ ЖЕ клетке — карты лягут стопкой ×2. Доход клетки растёт с каждым слоем. Стак — способ выжать максимум из одной клетки без расширения.', hl: '#grid', ok: gridStacked },
  { t: '<b>Шаг 6. Синергии.</b> Мы выдали «Костяного Рыцаря» — партнёр Скелета. <b style="color:#80e060">Зелёная рамка</b> в коллекции — партнёры, зелёные клетки — ставить рядом. Между партнёрами загорится линия.', pre: () => TUT_GIVE([['u4', 1]]), hl: '#grid', ok: () => countLinks() > 0 },
  { t: '<b>Правила Алтаря.</b> ♻ Повторы одной пары затухают (2-я ×0.8, 3-я ×0.55) — стройте разные связки. 🎵 Хор: +4% за каждую УНИКАЛЬНУЮ активную пару. ⛓ Формации: 3 в ряд ×1.15, 2×2 ×1.3, 5 в ряд ×1.5. 🪄 Кнопка «Авто» расставит всё за вас.', n: 1 },
  { t: '<b>Шаг 7. Эпоха — без принуждения.</b> Большая кнопка над Алтарём показывает % порога. Когда наберёте — она предложит начать Эпоху ' + (epoch + 1) + ' (+печати 🔱). Торопиться НЕ обязательно — фармите, сколько хочется. Эпохи открывают: Э2 — ⚔ Арену; Э3 — Поле 5×5 и ★4; Э4 — 🎰 Казино; Э5 — Культистов; дальше 7×7, ★5, Звери, 9×9, Демоны. ПОЛЕ растёт САМО при переходе — докупать ничего не нужно. При переходе сбрасываются карты и 💎; остаются 🔱, ачивки и открытые фишки.', hl: '#epochUpBtn', n: 1 },
  { t: '<b>Готово!</b> Совет: Алтарь — главный источник дохода. Новые фичи (Арена, Казино, расширения) сами покажут подсказку при открытии. Удачи, Гриндер!', n: 1, last: 1 }
];
let tutI = -1, tutTimer = null;
function tutGo(i) {
  tutI = i;
  qsa('.tut-hl').forEach(e => e.classList.remove('tut-hl'));
  const st = TUT[i];
  if (st.pre) st.pre();
  $('tutText').innerHTML = st.t;
  $('tutStep').textContent = 'Шаг ' + (i + 1) + ' / ' + TUT.length;
  const nb = $('tutNext');
  nb.style.display = st.n ? '' : 'none';
  nb.textContent = st.last ? 'В меню' : 'Далее';
  if (st.hl) { const t = document.querySelector(st.hl); if (t) { t.classList.add('tut-hl'); t.scrollIntoView({ block: 'nearest' }); } }
}
function startTutorial() {
  noSave = true;
  gameStarted = true; /* доход и HUD работают, но сохранение отключено */
  rebuildPlayableMask(); /* фикс: в учебном режиме маска клеток не строилась */
  $('menuBtn').style.display = 'none';
  $('tutPanel').classList.add('show');
  $('tutNext').onclick = () => { if (TUT[tutI].last) location.reload(); else tutGo(tutI + 1); };
  $('tutExit').onclick = () => location.reload();
  tutGo(0);
  tutTimer = setInterval(() => { const st = TUT[tutI]; if (st && st.ok && st.ok()) tutGo(tutI + 1); }, 400);
}

/* ---------------- Новая игра ---------------- */
function startFreshRun() {
  epoch = 1; maxEpoch = Math.max(maxEpoch, 1); faction = 'undead';
  crystals = 2500 + (sealLv.impulse > 0 ? 2500 * Math.pow(2, sealLv.impulse) : 0);
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = 3;
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false), fallen: {} };
  arenaAuto = false;
  pity4 = 0; pity5 = 0; runRolls = 0; runEarned = 0; runTime = 0;
  altBuff = { mult: 1, until: 0, label: '' };
  milestoneIdx = 0; freeRolls = 0;
  omens = []; omenTimer = 60;
  const startR1 = POOL_1.filter(id => CARDS[id].faction === faction);
  const startR3 = POOL_3.filter(id => CARDS[id].faction === faction);
  drawDistinct(startR1, 2).concat([pick(startR3)]).forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
  computeIncome();
  gameStarted = true; noSave = false;
  saveRun(); saveMeta();
  refreshAll();
  toast('⚜ ' + FACTION_INFO[faction].epochTitle);
  queueFeatureGuides(); /* первая Эпоха за фракцию — краткое обучение */
}
function refreshAll() {
  buildGrid(); renderCollection(); renderFighters(); initArena(); updateHUD(); updateBanner(); updateEpochUI();
}

/* ---------------- Меню ---------------- */
function showMenu() {
  gamePaused = true;
  $('menuContinue').disabled = !hasRunSave() && !gameStarted;
  $('menu').classList.add('show');
}
function hideMenu() { $('menu').classList.remove('show'); gamePaused = false; }
function restartWith(mode) {
  try { sessionStorage.setItem('gg_mode', mode); } catch (e) { }
  noSave = true;
  location.reload();
}

/* Обновление настроек-интерфейса */
function updateSettingsUI() {
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', (+b.dataset.s) === speedMult));
  $('sfxToggle').textContent = soundOn ? 'ВКЛ' : 'ВЫКЛ';
  $('musicToggle').textContent = musicOn ? 'ВКЛ' : 'ВЫКЛ';
  $('fxToggle').textContent = fxOn ? 'ВКЛ' : 'ВЫКЛ';
}

/* ---------------- Привязка событий ---------------- */
function wireEvents() {
  /* Крутки */
  [1, 10, 100, 1000].forEach(n => $('roll' + n).addEventListener('click', () => doRolls(n)));
  $('rollAll').addEventListener('click', () => {
    if (crystals < rollCost()) return;
    doRolls(Math.min(2000, Math.floor(crystals / rollCost())));
  });

  /* Инструменты */
  $('deleteToolBtn').addEventListener('click', function () {
    deleteMode = !deleteMode; placingMode = false; pendingCard = null; moveMode = false; moveSource = null;
    $('moveToolBtn').classList.remove('active');
    this.classList.toggle('active', deleteMode);
    renderGrid(); renderCollection(); updateBanner();
  });
  $('moveToolBtn').addEventListener('click', function () {
    moveMode = !moveMode; moveSource = null; placingMode = false; pendingCard = null; deleteMode = false;
    $('deleteToolBtn').classList.remove('active');
    this.classList.toggle('active', moveMode);
    renderGrid(); renderCollection(); updateBanner();
  });

  /* Арена */
  $('arenaFightBtn').addEventListener('click', arenaFightClick);
  $('arenaRetreatBtn').addEventListener('click', arenaRetreat);
  $('arenaAutoChk').addEventListener('change', function () { arenaAuto = this.checked; if (arenaAuto) tryStartAutoBattle(); });

  /* Коллекция */
  $('bulkDup').onclick = () => bulkFight('dup');
  $('bulk1').onclick = () => bulkFight('one');
  $('bulkAll').onclick = () => { ask('Отправить в бой ВСЕ карты из коллекции?', () => bulkFight('all')); };
  $('rarityFilter').addEventListener('change', e => { rarityFilter = e.target.value; renderCollection(); });

  /* Эпоха и ачивки: большая кнопка — старт при готовности, иначе Меню Эпохи */
  $('epochUpBtn').addEventListener('click', () => {
    if (canEpochUp()) confirmEpochUp();
    else openEpochMenu();
  });
  $('achvBtn').addEventListener('click', openAchv);

  /* Казино */
  $('casinoBtn').addEventListener('click', openCasino);
  $('hubX').onclick = () => close_('hub');
  $('hub').addEventListener('click', e => {
    const g = e.target.closest('[data-g]');
    if (!g) return;
    close_('hub');
    if (g.dataset.g === 'slots') return openSlots();
    open_('cgModal');
    ({ aviator: gAviator, roulette: gRoulette, poker: gPoker })[g.dataset.g]();
  });
  $('cgClose').onclick = () => { if (busy) return toast('Сначала завершите раунд'); close_('cgModal'); open_('hub'); };
  $('slotCloseBtn').addEventListener('click', () => { if (casinoSpinning) return; close_('casinoModal'); });
  $('betAdd1000').addEventListener('click', () => addBet(1000));
  $('betAdd10000').addEventListener('click', () => addBet(10000));
  $('betAll').addEventListener('click', () => { if (casinoSpinning) return; casinoBet = Math.max(MIN_BET, Math.floor(crystals)); updateCasinoUI(); });
  $('betReset').addEventListener('click', () => { if (casinoSpinning) return; casinoBet = MIN_BET; updateCasinoUI(); });
  $('slotLeverBtn').addEventListener('click', slotsSpin);
  $('cgBody').addEventListener('click', e => {
    if (e.target.dataset.chip || e.target.dataset.k) rouletteBoardClick(e);
    const a = e.target.dataset.p;
    if (a) pkAct(a);
  });

  /* Кнопки ½/×2/МАКС у ставок */
  document.addEventListener('click', e => {
    const b = e.target.dataset && e.target.dataset.b;
    if (!b) return;
    const [id, k] = b.split(':'), i = $(id), v = +i.value || 0;
    i.value = k === 'h' ? Math.max(MIN_BET, Math.floor(v / 2)) : k === 'd' ? Math.min(Math.floor(crystals), v * 2) : Math.floor(crystals);
  });

  /* Настройки */
  $('settingsBtn').addEventListener('click', () => {
    updateSettingsUI();
    $('settingsModal').classList.add('show');
  });
  $('settingsClose').addEventListener('click', () => {
    $('settingsModal').classList.remove('show');
  });
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.addEventListener('click', () => {
      speedMult = +b.dataset.s || 1;
      if (speedMult > 1) stats.speedUsed = 1;
      saveMeta(); updateSettingsUI(); checkAchievements();
      toast('⏩ Скорость игры: ×' + speedMult);
    });
  });
  $('sfxToggle').addEventListener('click', () => { soundOn = !soundOn; saveMeta(); updateSettingsUI(); if (soundOn) sfx('click'); });
  $('musicToggle').addEventListener('click', () => { musicOn = !musicOn; saveMeta(); if (musicOn) musicStart(); else musicStop(); updateSettingsUI(); });
  $('fxToggle').addEventListener('click', () => { fxOn = !fxOn; saveMeta(); updateSettingsUI(); });
  /* Реликвии */
  $('relicsBtn').addEventListener('click', openRelics);
  $('resetBtn').addEventListener('click', () => {
    ask('Стереть ВЕСЬ прогресс (включая печати и ачивки)?', () => {
      noSave = true; wipeAll(); location.reload();
    });
  });

  /* Меню */
  $('menuBtn').onclick = () => { saveRun(); saveMeta(); showMenu(); };
  $('menuContinue').onclick = () => {
    if (!gameStarted) { const ok = loadRun(); gameStarted = true; if (ok) toast('Забег загружен'); refreshAll(); }
    hideMenu();
  };
  $('menuNew').onclick = () => {
    const go = () => { try { localStorage.removeItem(SAVE_RUN); } catch (e) { } startFreshRun(); hideMenu(); };
    if (hasRunSave() || gameStarted) ask('Начать заново? Прогресс текущей Эпохи будет сброшен. Достижения и печати останутся.', go);
    else go();
  };
  $('menuTut').onclick = () => restartWith('tutorial');
  $('menuEpoch').onclick = () => { hideMenu(); openEpochMenu(); };

  /* Клавиши и глобальные события */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      for (const id of ['casinoModal', 'cgModal', 'hub', 'epochWarn', 'factionModal', 'epochModal', 'achvModal', 'dlg']) {
        const m = $(id);
        if (m && m.classList.contains('show')) {
          if (id === 'casinoModal' && casinoSpinning) return;
          if (id === 'cgModal' && busy) return;
          m.classList.remove('show');
          return;
        }
      }
      cancelSelection();
    }
  });
  window.addEventListener('contextmenu', e => { if (placingMode || deleteMode || moveMode) { e.preventDefault(); cancelSelection(); } });
  window.addEventListener('resize', drawSynergies);
  window.addEventListener('beforeunload', () => { saveRun(); saveMeta(); });
  setInterval(saveRun, 5000);
  setInterval(() => {
    if (gameStarted && !gamePaused) checkAchievements();
  }, 1000);
}

/* ---------------- Экономический интервал: прогресс Эпохи ---------------- */
let lastC = crystals;
setInterval(() => {
  const d = crystals - lastC;
  /* Заработок идёт только от экономики, не от казино (чтобы не «натыкать» Эпохи) */
  if (d > 0 && !document.querySelector('#casinoModal.show,#cgModal.show')) runEarned += d;
  lastC = crystals;
  checkMilestones();
  if (runEarned >= epochThreshold(epoch) && gameStarted && !gamePaused) {
    const upBtn = $('epochUpBtn');
    if (upBtn && !upBtn.classList.contains('flash-once')) {
      upBtn.classList.add('flash-once');
      toast('⚜ Порог Эпохи достигнут! Жмите кнопку ЭПОХИ над Алтарём');
      setTimeout(() => upBtn.classList.remove('flash-once'), 4000);
    }
  }
  stats.maxInc = Math.max(stats.maxInc, calculateIncome());
}, 250);

/* ---------------- Загрузка ---------------- */
(function boot() {
  let m = null;
  try { m = sessionStorage.getItem('gg_mode'); sessionStorage.removeItem('gg_mode'); } catch (e) { }
  window.BOOT_MODE = m;
  loadMeta();
  wireEvents();
  fxInit();
  document.addEventListener('pointerdown', soundUnlock, { once: true });
  /* Звук кликов на кнопки/карты — делегированно */
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('button, .cell, .coll-card, .faction-card, .omen')) sfx('click');
  }, true);
  requestAnimationFrame(gameLoop);
  if (m === 'tutorial') { hideMenu(); startTutorial(); return; }
  if (m === 'new') { hideMenu(); startFreshRun(); return; }
  if (hasRunSave()) {
    gameStarted = true;
    loadRun();
    computeIncome();
    refreshAll();
    initGuidesForSave(); /* открытые фичи не объясняем, незнакомую фракцию — показываем */
    showMenu();
  } else {
    computeIncome();
    refreshAll();
    showMenu();
  }
})();
