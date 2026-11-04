'use strict';
/* ============================================================
   ГЛАВНЫЙ ФАЙЛ (main.js)
   Игровой цикл, связывание событий, обучение, загрузка/меню.
   Подключается ПОСЛЕДНИМ: все модули уже загружены.
   ============================================================ */

let lastTick = performance.now();
/* v1.2.9.1 (perf): computeIncome — самый тяжёлый проход игры (полный скан
   поля, BFS армии, ауры зданий). Пересчёт раз в 100мс вместо каждого кадра:
   income между пересчётами читается из incomeCache. На цифры, баланс и
   видимость это не влияет — совпадает с прежним result до \$в пределах 0.1с. */
let lastRecalc = 0;

function gameLoop(now) {
  const dt = Math.min((now - lastTick) / 1000, 0.2) * speedMult;
  lastTick = now;
  if (!gamePaused && gameStarted) {
    if (now - lastRecalc >= 100) { computeIncome(); lastRecalc = now; }
    const inc = calculateIncome();
    crystals += inc * dt;
    runTime += dt; gameTime += dt;
    tickFactionMechanics(dt);
    tickOmens(dt);
    updateHUD(now);
  }
  requestAnimationFrame(gameLoop);
}

/* ---------------- Гача: СТАРЫЙ ВНУТРИ-ЗАБЕГОВОЙ БЛОК СНЯТ (v1.6.0) ----------------
   Крутки переехали в ГРИМУАР (меню → «Гримуар») и идут за ДУШИ
   (logic/gacha.js: performGrimRolls). В забеге карты выдаются
   колодой целиком на старте. */

/* ---------------- Обучение (фидбек 5: НАГЛЯДНОЕ) ----------------
   Каждый шаг — ОДНО конкретное действие игрока, система проверяет
   его сама (ok-условия). Первую комбинацию игрок собирает РУКАМИ:
   карта за картой, со стаком, звеном и демонстрацией слабых повторов.
   Онбординг новых фич — отдельная система logic/guide.js.
   v1.6.0: шаг «Гача» заменён на «Колода» — в забеге круток нет,
   колода выдаётся целиком; крутки — за Души в Гримуаре. */
const TUT_GIVE = l => { l.forEach(([id, n]) => { inventory[id] = (inventory[id] || 0) + n; discovered.add(id); }); renderCollection(); };
const gridHas = id => grid.some(row => row.some(it => it && it.cardId === id));
const gridStacked = () => grid.some(row => row.some(it => it && it.stacks >= 2));
/* --- Хелперы обучения v2: окна, счётчики, учебный старт забега --- */
const tutOpen = id => { const m = $(id); return !!(m && m.classList.contains('show')); };
let tutB = {}, tutDeckId = null;
const tutActiveDeck = () => (deckById(grimSelDeckId) && deckById(grimSelDeckId).race === 'undead' ? deckById(grimSelDeckId) : null) || deckById(tutDeckId) || activeDeckFor('undead') || decks[0] || null;
const tutStackCount = () => { let s = 0; decks.forEach(k => k.cards.forEach(e => { if ((e.n || 1) >= 2) s++; })); return s; };
/* Учебный забег = «Новая игра» с колодой из обучения, но noSave
   держится и сейв реального прогресса не перезаписывается. */
function tutStartRun() {
  let d = tutActiveDeck();
  if (d && !d.cards.some(e => (e.n || 1) >= 2)) { collectionAdd('u0', 3); d.cards.push({ id: 'u0', n: 3 }); }
  epoch = 1; maxEpoch = Math.max(maxEpoch, epoch);
  gameStarted = true;
  resetRunCommon('undead', d && d.race === 'undead' ? d : null);
  toast('Учебная Эпоха · колода «' + (d ? d.name : 'старт-кит') + '» выдана целиком');
}
/* Ссылка на карту в коллекции (для точечной подсветки) */
const collSel = id => '.coll-card[data-cid="' + id + '"]';
/* Число звеньев конкретной пары на поле */
function pairLinkCount(a, b) {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      const p = findPair(CARDS[it.cardId], CARDS[grid[nr][nc].cardId]);
      if (p && ((p.a === a && p.b === b) || (p.a === b && p.b === a))) n++;
    }
  }
  return n;
}
const TUT = [
  { t: 'Добро пожаловать! Короткий тур: соберём колоду, расставим карты на Алтаре и перейдём в новую Эпоху. Это тренировка — настоящий прогресс не пострадает.', n: 1 },

  /* --- АКТ 1: ГРИМУАР (колода: создать, наполнить, стак, крутка) --- */
  { t: 'Откройте Гримуар: здесь собирают колоды и призывают новые карты.', hl: '#menuGrim', ok: () => tutOpen('grimModal') },
  { t: 'Создайте колоду: нажмите «Создать».', hl: '.grim-newdeck', aux: '#grimNewDeckModal', pre: () => { tutB.decks = decks.length; const cd = deckById(grimSelDeckId); tutDeckId = (cd && cd.race === 'undead') ? cd.id : (((activeDeckFor('undead') || decks[0]) || {}).id || null); }, ok: () => decks.length > tutB.decks },
  { t: 'Нажмите на карту, чтобы добавить её в колоду.', pre: () => { const d = tutActiveDeck(); tutB.t = d ? deckTotal(d) : 0; }, hl: '#grimCards', ok: () => { const d = tutActiveDeck(); return !!(d && deckTotal(d) > tutB.t); } },
  { t: 'Стрелка ▲ добавляет копию. Карта с копиями встаёт на поле стопкой и приносит больше дохода.', pre: () => { if (collectionFree('u0') - (deckUsedCount(tutActiveDeck() || { cards: [] }, 'u0') || 0) < 1) collectionAdd('u0', 2); const d = tutActiveDeck(); if (d && !deckUsedCount(d, 'u0')) addToDeck(d, 'u0'); tutB.st = tutStackCount(); renderGrimuar(); }, hl: '.deck-up', ok: () => tutStackCount() > tutB.st },
  { t: 'Души тратятся на призыв. Нажмите «1 призыв», чтобы получить новую карту.', pre: () => { souls += 12; tutB.rolls = stats.rolls || 0; renderGrimuar(); }, hl: '#grimGacha .gg-roll[data-race="undead"][data-n="1"]', ok: () => (stats.rolls || 0) > tutB.rolls },

  /* --- АКТ 2: УЛУЧШЕНИЯ (один бонус за счёт обучения) --- */
  { t: 'Теперь откройте «Улучшения»: за Души там покупают поле, колоду и фракции.', hl: '#menuUpgrades', ok: () => tutOpen('upgModal') },
  { t: 'Купите любое улучшение. Души мы выдали.', pre: () => { souls = Math.max(souls, 9); tutB.upg = Object.values(upgLv).reduce((a, b) => a + (b | 0), 0); if (tutOpen('upgModal')) renderUpgrades(); }, hl: '.ups', ok: () => Object.values(upgLv).reduce((a, b) => a + (b | 0), 0) > tutB.upg },
  { t: 'Нажмите «Продолжить», чтобы начать забег с вашей колодой.', hl: '#menuContinue', ok: () => !tutOpen('menu') },

  /* --- АКТ 3: АЛТАРЬ (карта, здание, стак, звено) --- */
  { t: 'Выберите карту в списке, затем нажмите на свободную клетку Алтаря.', pre: () => { tutStartRun(); renderCollection(); }, hl: () => placingMode ? '#grid' : collSel(Object.keys(inventory)[0]), ok: () => cardsOnGrid() > 0 },
  { t: 'Поставьте «Кладбище» к картам: это здание усиливает соседей.', pre: () => { if (!inventory.bl_grave) TUT_GIVE([['bl_grave', 1]]); }, hl: () => (placingMode && pendingCard === 'bl_grave') ? '#grid' : collSel('bl_grave'), ok: () => gridHas('bl_grave') },
  { t: 'Поставьте Скелета. Копии из колоды встанут одной стопкой.', pre: () => { if (!inventory.u0) { inventory.u0 = 3; discovered.add('u0'); } deckStacks['u0'] = deckStacks['u0'] || [3]; renderCollection(); }, hl: () => (placingMode && pendingCard === 'u0') ? '#grid' : collSel('u0'), ok: () => { const it = grid.flat().find(x => x && x.cardId === 'u0'); return !!(it && it.stacks >= 2); } },
  { t: 'Поставьте Рыцаря рядом со Скелетом: между ними появится нить. Это синергия.', pre: () => TUT_GIVE([['u4', 2]]), hl: () => (placingMode && pendingCard === 'u4') ? '#grid' : collSel('u4'), ok: () => pairLinkCount('u0', 'u4') > 0 },

  /* --- АКТ 4: ЭПОХИ (порог, дар, Вознесение) --- */
  { t: 'Порог новой Эпохи мы оплатили за вас. Нажмите «Далее».', pre: () => { crystals += 60000; }, n: 1 },
  { t: 'Нажмите кнопку Эпохи, подтвердите и выберите колоду. За каждую новую Эпоху вы получаете Души.', pre: () => { tutB.epoch = epoch; }, hl: () => tutOpen('epochWarn') ? '#ewYes' : tutOpen('deckPickModal') ? '#deckPickModal' : '#epochUpBtn', ok: () => epoch > tutB.epoch },
  { t: 'Готово! Колода, Алтарь, новая Эпоха — вот и вся игра. Удачи!', n: 1, last: 1 }
];
let tutI = -1, tutTimer = null;
/* --- Механика обучения v2.1 ---
   ЦЕЛЬ шага подсвечена; жать можно ТОЛЬКО её (чужие кнопки —
   disabled/.tut-lock). Окно, где лежит цель, авто-держится открытым,
   все лишние окна закрываются сами: просишь «Улучшения» — Гримуар
   уходит, зовёшь в забег — Улучшения уходят; очередь фракций/колод
   при Вознесении тоже ведётся сама.
   Панель наставника СТАВИТСЯ ВОЗЛЕ цели (справа → слева → снизу →
   сверху) и никогда её не накрывает; без цели — по центру сверху. */
function tutTarget() {
  const st = TUT[tutI]; if (!st || !st.hl) return null;
  const sel = typeof st.hl === 'function' ? st.hl() : st.hl;
  let el = sel ? document.querySelector(sel) : null;
  /* оверлей-модал — цепляемся за его ВИДИМУЮ карточку, не за весь экран */
  if (el && el.matches('.modal')) el = el.querySelector('.modal-card') || el;
  return el;
}
/* v1.12.3: «вспомогательное окно» шага — модалка, которую шаг ОЖИДАЕТ
   (например, окно создания колоды на шаге «Заведи свою колоду»).
   Она открывается кликом по цели и обязана жить, пока игрок её заполняет:
   tutEnsure не смеет её закрывать, tutLock — блокировать её кнопки. */
function tutAux() {
  const st = TUT[tutI];
  if (!st || !st.aux) return null;
  const sel = typeof st.aux === 'function' ? st.aux() : st.aux;
  return sel ? document.querySelector(sel) : null;
}
function tutEnsure(t) {
  if (!t) return; /* без цели (обзорные шаги) окна не трогаем */
  const aux = tutAux();
  qsa('.modal.show').forEach(m => {
    if (t && m.contains(t)) return;
    if (aux && (aux === m || m.contains(aux))) return; /* v1.12.3: окно шага не закрываем */
    m.classList.remove('show');
  });
  if (t && !t.closest('.modal.show')) { const m = t.closest('.modal'); if (m) m.classList.add('show'); }
}
function tutLock(t) {
  const aux = tutAux(); /* v1.12.3: содержимое вспомогательного окна шага — свободно */
  document.querySelectorAll('[data-tutdis]').forEach(e => {
    e.disabled = e.getAttribute('data-tutwas') === '1';
    e.removeAttribute('data-tutdis'); e.removeAttribute('data-tutwas');
  });
  document.querySelectorAll('.tut-lock').forEach(e => e.classList.remove('tut-lock'));
  document.querySelectorAll('button, input, select, .coll-card, .cell, .faction-card, .deckpick-row').forEach(el => {
    if (el.closest('#tutPanel')) return;
    if (t && (t === el || t.contains(el) || el.contains(t))) return;
    if (aux && (aux === el || aux.contains(el))) return; /* v1.12.3: окно шага не блокируем */
    if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
      if (!el.hasAttribute('data-tutdis')) { if (el.disabled) el.setAttribute('data-tutwas', '1'); el.setAttribute('data-tutdis', '1'); }
      el.disabled = true;
    }
    el.classList.add('tut-lock');
  });
}
function tutPlace(t) {
  const p = $('tutPanel'), m = 8, gap = 12;
  const W = p.offsetWidth, H = p.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
  let x = Math.max(m, (vw - W) / 2), y = 8; /* без цели — по центру сверху */
  if (t) {
    const r = t.getBoundingClientRect();
    const sideY = Math.max(m, Math.min(r.top + (r.height - H) / 2, vh - m - H));
    if (r.right + gap + W <= vw - m) { x = r.right + gap; y = sideY; }
    else if (r.left - gap - W >= m) { x = r.left - gap - W; y = sideY; }
    else if (r.bottom + gap + H <= vh - m) { y = r.bottom + gap; x = Math.max(m, Math.min(r.left, vw - m - W)); }
    else if (r.top - gap - H >= m) { y = r.top - gap - H; x = Math.max(m, Math.min(r.left, vw - m - W)); }
    else { /* узкий экран: прижимаемся к цели, не вылезая за край */
      x = r.left >= vw / 2 ? Math.max(m, r.left - gap - W) : Math.min(vw - m - W, r.right + gap);
      y = Math.max(m, Math.min(r.top, vh - m - H));
    }
  }
  p.style.left = Math.round(x) + 'px';
  p.style.top = Math.round(y) + 'px';
}
function tutSync() {
  const t = tutTarget();
  tutEnsure(t);
  qsa('.tut-hl').forEach(e => e.classList.remove('tut-hl'));
  if (t) { t.classList.add('tut-hl'); tutLock(t); tutPlace(t); }
  else tutLock(null);
}
function tutGo(i) {
  tutI = i;
  const st = TUT[i];
  if (st.pre) st.pre();
  $('tutText').innerHTML = st.t;
  $('tutStep').textContent = 'Шаг ' + (i + 1) + ' / ' + TUT.length;
  const nb = $('tutNext');
  nb.style.display = st.n ? '' : 'none';
  nb.textContent = st.last ? 'В меню' : 'Далее';
  tutSync();
  const t = document.querySelector('.tut-hl');
  if (t) t.scrollIntoView({ block: 'nearest' });
}
function startTutorial() {
  noSave = true;
  gameStarted = true; /* цикл и HUD работают, но сохранение отключено */
  /* v2: обучение идёт ИЗ МЕНЮ — меню остаётся открытым до старта забега */
  $('menuBtn').style.display = 'none';
  const rb = $('epochRestartBtn'); if (rb) rb.style.display = 'none'; /* в обучении рестарта нет */
  $('tutPanel').classList.add('show');
  $('tutNext').onclick = () => { if (TUT[tutI].last) location.reload(); else tutGo(tutI + 1); };
  $('tutExit').onclick = () => location.reload();
  window.addEventListener('resize', tutSync);
  tutGo(0);
  tutTimer = setInterval(() => { const st = TUT[tutI]; if (st && st.ok && st.ok()) tutGo(tutI + 1); else tutSync(); }, 400);
}

/* ---------------- Новая игра ----------------
   v1.8.0: при старте игрок ОБЯЗАН выбрать колоду (окно выбора колоды
   расы). Никакого авто-старта с «активной» — раса = нежить, колода = ваш выбор. */
function startFreshRun(f, deck) {
  epoch = 1; maxEpoch = Math.max(maxEpoch, 1);
  gameStarted = true; noSave = false;
  resetRunCommon(f || 'undead', deck || null); /* колода/старт-кит, deckStacks, runDeck, контракты */
  checkDailyGift(); /* v1.2.9: первый вход за день — Знамение Судьбы */
  toast('' + FACTION_INFO[faction].epochTitle);
  queueFeatureGuides(); /* первая Эпоха за фракцию — краткое обучение */
}

/* ---------------- DEBUG-режим (фидбек 4) ----------------
   Секрет: 3 клика по строке «Тёмное Наследие» в меню. Позволяет
   начать ЛЮБУЮ эпоху с ЛЮБОЙ фракцией (сохранение выкл. по умолчанию). */
let dbgFlavorClicks = 0, dbgFlavorTimer = null;
function debugSecretClick() {
  dbgFlavorClicks++;
  clearTimeout(dbgFlavorTimer);
  dbgFlavorTimer = setTimeout(() => dbgFlavorClicks = 0, 1600);
  if (dbgFlavorClicks >= 3) { dbgFlavorClicks = 0; openDebugModal(); }
}
/* Чит-пасхалка: по одному экземпляру каждой карты — в вечную коллекцию
   Гримуара (для тестов колод и синергий). */
function grantFullCollection() {
  const ids = Object.keys(CARDS);
  ids.forEach(id => collectionAdd(id, 1));
  saveMeta();
  toast('🛠 ЧИТ: в Гримуар добавлено по 1 экземпляру каждой карты (' + ids.length + ' типов)');
  if ($('grimModal') && $('grimModal').classList.contains('show')) renderGrimuar();
}
function openDebugModal() {
  grantFullCollection(); /* клик по пасхалке сразу выдаёт коллекцию */
  const maxE = Math.max(EPOCHS.length + 2, 12);
  mk('dbgModal',
    '<h2>🛠 ЧИТ-РЕЖИМ</h2>' +
    '<div class="res">Старт с любой Эпохи и фракции. По умолчанию сохранение ОТКЛЮЧЕНО (мета-прогресс не трогается).</div>' +
    '<h3 style="margin:8px 0 4px">Эпоха</h3><div id="dbgEpochs" style="display:flex;flex-wrap:wrap;gap:4px">' +
    Array.from({ length: maxE }, (_, i) => '<button class="mini dbg-e" data-e="' + (i + 1) + '">' + (i + 1) + '</button>').join('') + '</div>' +
    '<h3 style="margin:8px 0 4px">Фракция</h3><div id="dbgFactions">' +
    FACTION_KEYS.map(f => '<div class="faction-card dbg-f" data-f="' + f + '" style="border-color:' + FACTION_INFO[f].color + '"><h3 style="color:' + FACTION_INFO[f].color + '">' + FACTION_INFO[f].name + '</h3><small>' + FACTION_INFO[f].mechanicName + '</small></div>').join('') + '</div>' +
    '<div class="set-row" style="margin-top:8px"><span>💰 Толстый кошелёк (+1 млрд ТЭ):</span><input type="checkbox" id="dbgRich"></div>' +
    '<div class="set-row"><span>💾 Включить сохранение (ОСТОРОЖНО: перезапишет забег):</span><input type="checkbox" id="dbgSave"></div>' +
    '<div class="set-row"><span>' + DE_IMG + ' Тёмная энергия в ТЕКУЩИЙ забег (+250 тыс):</span><button class="mini" id="dbgCash"' + (gameStarted ? '' : ' disabled') + '>ВЫДАТЬ</button></div>' +
    '<div class="set-row"><span>📚 Полная коллекция Гримуара (+1 каждой карты):</span><button class="mini" id="dbgColl">ВЫДАТЬ</button></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="dbgX">Закрыть</button><button class="btn btn-take" id="dbgGo" disabled>СТАРТ</button></div>', 640);
  $('dbgX').onclick = () => close_('dbgModal');
  $('dbgCash').onclick = () => {
    crystals += 250000;
    computeIncome(); updateHUD(); saveRun();
    toast('🛠 ЧИТ: +250 000 Тёмной энергии');
  };
  $('dbgColl').onclick = () => grantFullCollection();
  let selE = 0, selF = null;
  const refresh = () => {
    $('dbgEpochs').querySelectorAll('.dbg-e').forEach(b => b.style.borderColor = +b.dataset.e === selE ? '#ffe080' : '');
    $('dbgFactions').querySelectorAll('.dbg-f').forEach(b => b.style.boxShadow = b.dataset.f === selF ? '0 0 10px ' + FACTION_INFO[b.dataset.f].color : '');
    $('dbgGo').disabled = !(selE && selF);
  };
  $('dbgEpochs').querySelectorAll('.dbg-e').forEach(b => b.onclick = () => { selE = +b.dataset.e; refresh(); });
  $('dbgFactions').querySelectorAll('.dbg-f').forEach(b => b.onclick = () => { selF = b.dataset.f; refresh(); });
  $('dbgGo').onclick = () => {
    close_('dbgModal');
    startDebugRun(selE, selF, $('dbgRich').checked, $('dbgSave').checked);
  };
  open_('dbgModal');
  refresh();
}
function startDebugRun(ep, f, rich, keepSave) {
  noSave = !keepSave;
  epoch = ep; maxEpoch = Math.max(maxEpoch, ep); faction = f;
  crystals = 2500 * ep + (rich ? 1e9 : 0);
  grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
  playableSize = 9; /* чит-режим: сразу всё поле */
  rebuildPlayableMask();
  inventory = {}; pendingCard = null; deckStacks = {};
  fighters = {}; fighterHpState = {};
  arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: Array(ARENA.roomsPerFloor).fill(false), fallen: {} };
  arenaAuto = false; arenaStreak = 0;
  pity4 = 0; pity5 = 0; runRolls = 0; runEarned = 0; runTime = 0;
  relicSlots = {};
  altBuff = { mult: 1, until: 0, label: '' };
  ritualResonance = 0; surgeUntil = 0;
  milestoneIdx = 0;
  omens = []; omenTimer = 9999;
  /* Стартовый набор: карта механики фракции + ЗДАНИЕ + мешок карт для теста механик */
  const startR1 = POOL_3.filter(id => CARDS[id].faction === faction);
  drawDistinct(startR1, 2).concat(startKitFor(faction)).forEach(id => { inventory[id] = (inventory[id] || 0) + 3; discovered.add(id); });
  POOL_3.filter(id => CARDS[id].faction === faction).forEach(id => { inventory[id] = (inventory[id] || 0) + 12; discovered.add(id); });
  POOL_B.filter(id => CARDS[id].faction === faction).forEach(id => { inventory[id] = (inventory[id] || 0) + 3; discovered.add(id); });
  POOL_4.filter(id => CARDS[id].faction === faction).forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
  computeIncome();
  gameStarted = true;
  contractsInit(); /* v1.2.9: контракты видны и в чит-режиме (noSave не даёт их исполнить) */
  if (keepSave) { saveRun(); saveMeta(); }
  hideMenu();
  refreshAll();
  toast('🛠 ЧИТ: Эпоха ' + ep + ' · ' + FACTION_INFO[f].name + (keepSave ? ' · сохранение ВКЛ' : ' · сохранение ВЫКЛ'));
}
function refreshAll() {
  applyFactionTheme(); /* v1.5.0: тема фракции (фон/палитра) */
  buildGrid(); renderCollection(); renderFighters(); initArena(); updateHUD(); updateBanner(); updateEpochUI();
}

/* ---------------- Меню ---------------- */
/* Счётчик Душ в меню (замена старой строки «Тёмное Наследие»):
   баланс + рекорд Эпохи, для видности живёт рядом с любыми покупками */
function renderMenuSouls() {
  const el = $('menuSouls');
  if (!el) return;
  el.innerHTML = SOUL_IMG + ' Души: <b style="color:#d8b74a">' + fmtShort(souls) +
    '</b> <span style="color:#55555a">·</span> рекорд Эпоха <b>' + maxEpoch + '</b>';
}
function showMenu() {
  gamePaused = true;
  renderMenuSouls();
  $('menuContinue').disabled = !hasRunSave() && !gameStarted;
  $('menu').classList.add('show');
  /* v1.4.1 ТЗ: выход в меню — тихая запись рекорда (только рост),
     затем свежак Таблички и счётчика игроков за день.
     Табличка перечитывается ПОСЛЕ завершения записи — иначе гонка:
     блок покажет старьё раньше, чем POST дойдёт до базы. */
  if (typeof supaMenuSave === 'function') {
    Promise.resolve(supaMenuSave()).then(() => { if (typeof lbFetch === 'function') setTimeout(lbFetch, 350); });
  }
  if (typeof wallFetch === 'function') setTimeout(wallFetch, 100);
  if (typeof renderDailyCount === 'function') setTimeout(renderDailyCount, 160);
}
function hideMenu() { $('menu').classList.remove('show'); gamePaused = false; }
function restartWith(mode) {
  try { sessionStorage.setItem('gg_mode', mode); } catch (e) { }
  noSave = true;
  location.reload();
}

function updateSettingsUI() {
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', (+b.dataset.s) === speedMult));
  $('sfxToggle').textContent = soundOn ? 'ВКЛ' : 'ВЫКЛ';
  $('musicToggle').textContent = musicOn ? 'ВКЛ' : 'ВЫКЛ';
  $('fxToggle').textContent = fxOn ? 'ВКЛ' : 'ВЫКЛ';
}

/* ---------------- Привязка событий ---------------- */
function wireEvents() {
  /* Крутки: СНЯТЫ с экрана забега (v1.6.0) — Призыв живёт в Гримуаре.
     Элементы #rollBar удалены из index.html. */

  /* Инструменты */
  /* v1.4.1: Табличка Тьмы переехала в главное меню (над Стеной) —
     кнопка «Рейтинг» из игровой панели снята, запись рекорда
     автоматическая: Вознесение / выход в меню / уход со страницы. */
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
  /* v1.2.7: оверлей «Поле боя» */
  $('arenaExpandBtn').addEventListener('click', () => { open_('arenaOverlay'); updateArenaUI(); });
  $('arenaCloseBtn').addEventListener('click', () => close_('arenaOverlay'));
  /* v1.3.1: клик по живому мини-визуалу — то же, что «Поле боя ▾» */
  const am = $('arenaMini');
  if (am) am.addEventListener('click', () => { if (!$('arenaExpandBtn').disabled) $('arenaExpandBtn').click(); });

  /* Коллекция */
  /* Резец Тьмы: масс-кнопки «в бой» (bulk1/bulkAll/bulkDup) сняты с экрана.
     bulkFight() в logic/arena.js остаётся — судьба решается отдельно. */
  $('rarityFilter').addEventListener('change', e => { rarityFilter = e.target.value; renderCollection(); });

  /* Эпоха и ачивки: большая кнопка — старт при готовности, иначе Меню Эпохи */
  $('epochUpBtn').addEventListener('click', () => {
    if (canEpochUp()) confirmEpochUp();
    else openEpochMenu();
  });
  /* v1.4.3 «Второй Круг»: рестарт ТЕКУЩЕЙ Эпохи — подтверждение + выбор фракции */
  $('epochRestartBtn').addEventListener('click', confirmEpochRestart);
  $('achvBtn').addEventListener('click', openAchv);
  /* v1.2.9: Тёмный Пакт — контракты Эпохи */
  $('contractsBtn').addEventListener('click', openContracts);

  /* Казино */
  $('casinoBtn').addEventListener('click', openCasino);
  $('hubX').onclick = () => close_('hub');
  $('hub').addEventListener('click', e => {
    const g = e.target.closest('[data-g]');
    if (!g) return;
    close_('hub');
    if (g.dataset.g === 'slots') return openSlots();
    open_('cgModal');
    $('cgBody').className = ''; /* v1.5.15: фон-класс предыдущей игры сбрасывается */
    ({ aviator: gAviator, roulette: gRoulette, blackjack: gBlackjack })[g.dataset.g]();
  });
  $('cgClose').onclick = () => { if (busy) return toast('Сначала завершите раунд'); close_('cgModal'); open_('hub'); };
  $('slotCloseBtn').addEventListener('click', () => { if (casinoSpinning) return; close_('casinoModal'); });
  $('betAdd1000').addEventListener('click', () => addBet(1000));
  $('betAdd10000').addEventListener('click', () => addBet(10000));
  $('betAll').addEventListener('click', () => { if (casinoSpinning) return; casinoBet = Math.max(MIN_BET, Math.floor(crystals)); updateCasinoUI(); });
  $('betReset').addEventListener('click', () => { if (casinoSpinning) return; casinoBet = MIN_BET; updateCasinoUI(); });
  $('slotLeverBtn').addEventListener('click', slotsSpin);
  $('cgBody').addEventListener('click', e => {
    /* v1.5.15: ячейки рулетки содержат спрайты-иконки — ищем [data-k]/[data-chip] через closest */
    if (e.target.closest && e.target.closest('[data-chip],[data-k]')) rouletteBoardClick(e);
    const a = e.target.dataset.p;
    if (a) bjAct(a);
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
  /* Реликвии v1.2.6: вкладка коллекции «⚒ РЕЛИКВИИ» + ряд слотов над Алтарём */
  $('resetBtn').addEventListener('click', () => {
    ask('Стереть ВЕСЬ прогресс (включая Души, коллекцию, Улучшения и ачивки)?', () => {
      noSave = true; wipeAll(); location.reload();
    });
  });

  /* Меню */
  $('menuBtn').onclick = () => { saveRun(); saveMeta(); showMenu(); };
  /* Пасхалка: цифра 2 при открытом меню — только курсор и клавиатура выдают */
  window.addEventListener('keydown', e => {
    if (e.key === '2' && $('menu').classList.contains('show') && !(e.target && e.target.closest && e.target.closest('input'))) openDebugModal();
  });
  $('menuContinue').onclick = () => {
    if (!gameStarted) { const ok = loadRun(); gameStarted = true; if (ok) toast('Забег загружен'); refreshAll(); }
    hideMenu();
  };
  $('menuNew').onclick = () => {
    const go = () => {
      try { localStorage.removeItem(SAVE_RUN); } catch (e) { }
      /* v1.8.0: обязательный выбор колоды перед стартом.
         v1.11.1: колоды ВСЕХ открытых рас (была только нежить) —
         раса забега = раса выбранной колоды. */
      openDeckPick(null, d => { startFreshRun(d.race, d); hideMenu(); });
    };
    if (hasRunSave() || gameStarted) ask('Начать заново? Прогресс текущей Эпохи будет сброшен. Достижения и Улучшения останутся.', go);
    else go();
  };
  $('menuTut').onclick = () => restartWith('tutorial');
  /* Пасхалка: три быстрых клика на «2» в заголовке меню — благословение, +100 Душ */
  let titleTwoN = 0, titleTwoT = 0;
  const elTitleTwo = $('titleTwo');
  if (elTitleTwo) elTitleTwo.onclick = () => {
    const now = Date.now();
    if (now - titleTwoT > 1500) titleTwoN = 0; /* серия прервана — заново */
    titleTwoT = now;
    if (++titleTwoN < 3) return;
    titleTwoN = 0;
    gainSouls(100);
    saveMeta();
    renderMenuSouls();
    toast('🕯 <b>Гача-Гриндер II благословил вас: +100 Душ.</b>');
  };
  /* v1.5.13: закрытие окон Эпохи больше не «выбрасывает» из меню. */
  /* v1.6.0: ГРИМУАР и УЛУЧШЕНИЯ в главном меню; v1.8.0: Улучшения — рабочая мастерская за Души */
  $('menuGrim').onclick = () => { openGrimuar(); };
  $('menuUpgrades').onclick = () => { openUpgrades(); };

  /* Клавиши и глобальные события */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      for (const id of ['casinoModal', 'cgModal', 'hub', 'epochWarn', 'factionModal', 'deckPickModal', 'epochModal', 'achvModal', 'dlg', 'dbgModal', 'relicPick', 'relicsModal', 'arenaOverlay', 'contractModal', 'wallNameModal', 'grimModal', 'grimRollModal', 'upgModal']) {
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
  window.addEventListener('resize', () => { if (typeof applyGridMetrics === 'function') applyGridMetrics(); drawSynergies(); });
  window.addEventListener('beforeunload', () => { saveRun(); saveMeta(); });
  setInterval(saveRun, 5000);
  setInterval(() => {
    if (gameStarted && !gamePaused) {
      checkAchievements();
      checkContracts();   /* v1.2.9: Тёмный Пакт — прогресс и выдача */
      checkChronicles();  /* v1.2.9: Хроники Тьмы — вершины коллекции */
      if ($('contractModal') && $('contractModal').classList.contains('show')) renderContractList();
    }
  }, 1000);
}

/* ---------------- Экономический интервал: прогресс Эпохи ---------------- */
let lastC = crystals;
setInterval(() => {
  const d = crystals - lastC;
  lastC = crystals;
  /* v1.2.6: в порог Эпохи идёт ТОЛЬКО доход Алтаря. Всё остальное
     (награды Арены, знамения, компенсации, продажа дубликатов)
     помечается в incomeExempt — Эпохи больше не «натыкаются» сами. */
  if (d > 0 && !document.querySelector('#casinoModal.show,#cgModal.show')) {
    const credited = Math.max(0, d - incomeExempt);
    runEarned += credited;
  }
  incomeExempt = 0;
  /* v1.2.7: САМОВОССТАНОВЛЕНИЕ ОТОБРАЖЕНИЯ — если DOM разошёлся с состоянием
     («ауры пропали», «карты задвоились»), перерисовываем поле в течение 250мс */
  if (gameStarted && !gamePaused && typeof gridSignature === 'function') {
    if (gridSignature() !== lastRenderSig) renderGrid();
    else if (typeof updateFxLive === 'function') updateFxLive(); /* v1.5.1: вспышки способностей без перерисовки поля */
  }
  checkMilestones();
  if (runEarned >= epochThreshold(epoch) && gameStarted && !gamePaused) {
    const upBtn = $('epochUpBtn');
    if (upBtn && !upBtn.classList.contains('flash-once')) {
      upBtn.classList.add('flash-once');
      toast('Порог Эпохи достигнут! Жмите кнопку ЭПОХИ над Алтарём');
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
  wipeLegacySaves(); /* v1.7.0: обнуление учеток — старые сейвы v1 и «отправленный рекорд» вычищаются */
  loadMeta();
  migrateUpgrades(); /* v1.8.0: разовый перенос открывавшегося Эпохами в покупки за Души */
  migrateDeckPages(); /* v1.8.0: страницы колоды по сохранённым колодам (старый лимит был 64) */
  supaPing(); /* v1.2.9.2: уникальный игрок за день */
  maybeAskNick(); /* v1.2.9.2: имя для Таблички Тьмы — спрашиваем один раз */
  wallInit(); /* v1.3.0: СТЕНА ТЬМЫ — чат в главном меню */
  lbInit(); /* v1.4.1: ТАБЛИЦА ТЬМЫ — рейтинг по Эпохам над чатом */
  renderDailyCount(); /* v1.4.1: «Активных игроков за день» под чатом */
  wireEvents();
  fxInit();
  document.addEventListener('pointerdown', soundUnlock, { once: true });
  /* Звук кликов на кнопки/карты — делегированно */
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('button, .cell, .coll-card, .faction-card, .omen')) sfx('click');
  }, true);
  requestAnimationFrame(gameLoop);
  if (m === 'tutorial') { startTutorial(); return; } /* меню не прячем: акт Гримуара идёт из меню */
  if (m === 'new') { hideMenu(); startFreshRun(); return; }
  if (hasRunSave()) {
    gameStarted = true;
    loadRun();
    computeIncome();
    refreshAll();
    checkDailyGift(); /* v1.2.9: Знамение Судьбы — только в реальном забеге */
    initGuidesForSave(); /* открытые фичи не объясняем, незнакомую фракцию — показываем */
    showMenu();
  } else {
    computeIncome();
    refreshAll();
    showMenu();
  }
})();
