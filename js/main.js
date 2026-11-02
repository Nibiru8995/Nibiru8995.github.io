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
  { t: '📖 <b>Обучение.</b> Цикл игры: <b>колода</b> (из Гримуара) → ставьте карты на <b>Алтарь</b> → они приносят ТЭ/сек → копите порог → <b>Эпоха</b>. Это учебный забег — прогресс не сохранится. Дальше — только ваши действия, система проверит каждый шаг.', n: 1, pre: () => { crystals = 500; updateHUD(); } },
  { t: '<b>Шаг 1. Колода — уже у вас.</b> С этой итерации забег выдаёт ВСЮ колоду сразу — она лежит в коллекции слева. Кликните по любой карте — она возьмётся «в руку» (крутки и пополнение колоды — в Гримуаре, за Души).', hl: () => collSel(Object.keys(inventory)[0]), ok: () => placingMode },
  { t: '<b>Шаг 2. Поставьте карту.</b> Кликните по любой клетке Алтаря. Карта начнёт приносить ТЭ/сек — счётчик над Алтарём.', hl: '#grid', ok: () => cardsOnGrid() > 0 },
  { t: '<b>Шаг 3. ЗДАНИЕ!</b> Мы выдали <b>«Кладбище»</b> — постройку: она сама раз в 12с поднимает бесплатную нежить и усиливает соседей. Выберите её в коллекции и поставьте рядом с картами.', pre: () => TUT_GIVE([['bl_grave', 1]]), hl: () => collSel('bl_grave'), ok: () => gridHas('bl_grave') },
  { t: '<b>Шаг 4. СТАК — главный секрет Алтаря!</b> Мы выдали <b>«Скелета» ×3</b>. Кликните по Скелету в коллекции (подсвечен).', pre: () => TUT_GIVE([['u0', 3]]), hl: () => collSel('u0'), ok: () => placingMode && pendingCard === 'u0' },
  { t: '<b>Шаг 5. Стак.</b> Поставьте Скелета на любую свободную клетку, затем кликните ПО ТОЙ ЖЕ клетке ещё <b>ДВАЖДЫ</b> — получится стопка ×3 с ТРОЙНЫМ доходом клетки. Одна клетка держит до ×5 копий одной карты.', hl: '#grid', ok: () => { const it = grid.flat().find(x => x && x.cardId === 'u0'); return !!(it && it.stacks >= 3); } },
  { t: '<b>Шаг 6. ПЕРВАЯ КОМБИНАЦИЯ!</b> Мы выдали <b>«Костяного Рыцаря»</b> — партнёра Скелета. Выберите его в коллекции (золотая подсветка).', pre: () => TUT_GIVE([['u4', 1]]), hl: () => collSel('u4'), ok: () => placingMode && pendingCard === 'u4' },
  { t: '<b>Шаг 7. Завершите связку.</b> Кликните по подсвеченной ЗЕЛЁНЫМ клетке рядом со Скелетом. Между картами вспыхнет линия — это синергия, доход обоих вырастет.', hl: '#grid', ok: () => pairLinkCount('u0', 'u4') > 0 },
  { t: '🎉 <b>Первая комбинация собрана!</b> Линия на Алтаре = активное звено. Тултип (наведи мышь) показывает звенья и доход карты.', n: 1 },
  { t: '<b>Шаг 8. Повторы слабее.</b> Мы выдали ещё Скелета и Рыцаря. Соберите ВТОРУЮ такую же пару в сторонке и заметьте, что линия стала тусклее.', pre: () => TUT_GIVE([['u0', 1], ['u4', 1]]), hl: '#grid', ok: () => pairLinkCount('u0', 'u4') >= 2 },
  { t: '⚠️ Видите? Вторая линия <b>бледная</b> — повтор одной и той же пары даёт всё меньше: 2-е звено ×0.7, 3-е ×0.45… у нежити — ещё жёстче. <b>Стройте РАЗНЫЕ связки</b> — каждая новая пара работает в полную силу.', n: 1 },
  { t: '<b>Шаг 9. Эпоха.</b> Большая кнопка над Алтарём показывает % порога. Наберёте — она откроет переход в следующую Эпоху (+печати 🔱 и <b>+1 Душа</b>). Эпохи открывают: Э2 — ⚔ Арену и <b>реликвии</b>; Э3 — поле 5×5 и ★4; Э4 — 🎰 Казино; Э5 — Культистов. Поле растёт само.', hl: '#epochUpBtn', n: 1 },
  { t: '✅ <b>Готово!</b> Между забегами заходите в <b>Меню → Гримуар</b>: Души тратятся на Призыв карт, коллекция вечна, колоды собираются под расу. Удачи, Гриндер!', n: 1, last: 1 }
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
  if (st.hl) {
    const sel = typeof st.hl === 'function' ? st.hl() : st.hl;
    const t = sel && document.querySelector(sel);
    if (t) { t.classList.add('tut-hl'); t.scrollIntoView({ block: 'nearest' }); }
  }
}
function startTutorial() {
  noSave = true;
  gameStarted = true; /* доход и HUD работают, но сохранение отключено */
  rebuildPlayableMask(); /* фикс: в учебном режиме маска клеток не строилась */
  $('menuBtn').style.display = 'none';
  const rb = $('epochRestartBtn'); if (rb) rb.style.display = 'none'; /* v1.4.3: в обучении рестарта нет */
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
  arenaAuto = false; arenaStreak = 0;
  runRolls = 0; runEarned = 0; runTime = 0;
  relicSlots = {};
  altBuff = { mult: 1, until: 0, label: '' };
  ritualResonance = 0; surgeUntil = 0;
  milestoneIdx = 0;
  omens = []; omenTimer = 60;
  /* v1.6.0: выдаём активную колоду расы (нет — старт-кит) */
  const deck = ensureStarterDeck(faction);
  if (deck && deck.cards.length) {
    deck.cards.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
    const ct = $('collectionTitle'); if (ct) ct.textContent = 'Колода: ' + deck.name;
  } else {
    const startR1 = POOL_3.filter(id => CARDS[id].faction === faction);
    drawDistinct(startR1, 2).concat(startKitFor(faction)).forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
  }
  computeIncome();
  gameStarted = true; noSave = false;
  contractsInit(); /* v1.2.9: серия контрактов нового забега */
  checkDailyGift(); /* v1.2.9: первый вход за день — Знамение Судьбы */
  saveRun(); saveMeta();
  refreshAll();
  toast('⚜ ' + FACTION_INFO[faction].epochTitle);
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
function openDebugModal() {
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
    '<div class="btn-row"><button class="btn btn-take" id="dbgX">Закрыть</button><button class="btn btn-take" id="dbgGo" disabled>СТАРТ</button></div>', 640);
  $('dbgX').onclick = () => close_('dbgModal');
  $('dbgCash').onclick = () => {
    crystals += 250000;
    computeIncome(); updateHUD(); saveRun();
    toast('🛠 ЧИТ: +250 000 Тёмной энергии');
  };
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
  playableSize = epochMaxSize(epoch);
  rebuildPlayableMask();
  inventory = {}; pendingCard = null;
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
function showMenu() {
  gamePaused = true;
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
    ask('Стереть ВЕСЬ прогресс (включая печати и ачивки)?', () => {
      noSave = true; wipeAll(); location.reload();
    });
  });

  /* Меню */
  $('menuBtn').onclick = () => { saveRun(); saveMeta(); showMenu(); };
  $('menuFlavor').addEventListener('click', debugSecretClick); /* пасхалка: 3 клика по подзаголовку — только курсор выдаёт */
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
  /* v1.5.13: Меню Эпохи открывается ПОВЕРХ главного меню (z 550 > 500).
     Раньше hideMenu() «выбрасывал» игрока из меню: закрытие окна Эпохи
     оставляло пустой экран игры вместо главного меню. */
  $('menuEpoch').onclick = () => openEpochMenu();
  /* v1.6.0: ГРИМУАР и УЛУЧШЕНИЯ в главном меню */
  $('menuGrim').onclick = () => { openGrimuar(); };
  $('menuUpgrades').onclick = () => {
    mk('upgModal',
      '<h2>✦ УЛУЧШЕНИЯ</h2>' +
      '<div class="res">Мастерская Тьмы готовится открыться.</div>' +
      '<div id="upgList" style="width:100%">' +
      '<div class="epoch-row off"><span class="er-icon">🔒</span><span class="er-txt"><b>Улучшение карт</b><br><small>Дубликаты из коллекции будут качать уровень карты: +доход, +эффект. Уровень остаётся навсегда.</small></span></div>' +
      '<div class="epoch-row off"><span class="er-icon">🔒</span><span class="er-txt"><b>Слоты колоды</b><br><small>Расширение лимита колоды сверх 64 карт.</small></span></div>' +
      '<div class="epoch-row off"><span class="er-icon">🔒</span><span class="er-txt"><b>Улучшения печатей</b><br><small>Второй круг прокачки для магазина печатей.</small></span></div>' +
      '</div>' +
      '<div class="flavor">Появится в следующей итерации переработки. Дубликаты коллекции копятся уже сейчас — не пропадут.</div>' +
      '<div class="btn-row"><button class="btn btn-take" id="upgX">Закрыть</button></div>', 560);
    $('upgX').onclick = () => close_('upgModal');
    open_('upgModal');
  };

  /* Клавиши и глобальные события */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      for (const id of ['casinoModal', 'cgModal', 'hub', 'epochWarn', 'factionModal', 'epochModal', 'achvModal', 'dlg', 'dbgModal', 'relicPick', 'relicsModal', 'arenaOverlay', 'contractModal', 'wallNameModal', 'grimModal', 'grimRollModal', 'upgModal']) {
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
  if (m === 'tutorial') { hideMenu(); startTutorial(); return; }
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
