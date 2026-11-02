'use strict';
/* ============================================================
   ЛОГИКА: КОНТРАКТЫ ЭПОХИ + ЗНАМЕНИЕ СУДЬБЫ (logic/contracts.js)
   «Тёмный Пакт» v1.8.0:
   - пул по расе: НЕЖИТЬ — 80 контрактов (contracts_undead.js),
     остальные расы — общий пул (data/contracts.js);
   - на забег выпадает 4 случайных контракта, ВСЕ активны сразу;
   - ГЛАВНОЕ ПРАВИЛО: контракт может выпасть ТОЛЬКО если он
     выполним с колодой, с которой игрок начал Эпоху — у пульных
     контрактов есть req-требования, они сверяются со снапшотом
     стартовой колоды (runDeck, снимается в handOutDeck);
   - награда по сложности: 1/2/3 Души; за все 4 — «ПАКТ ИСПОЛНЕН»
     +2 Души (печати 🔱 удалены из игры);
   - блоки контрактов под гридом: сверху название, под ним задача,
     справа — награда в душах.
   - ЗНАМЕНИЕ СУДЬБЫ: первый вход за день — ×2 доход на 5 минут.
   - ХРОНИКИ ТЬМЫ: разовые ДУШИ за полное открытие наборов фракций
     (раньше — печати).
   ============================================================ */

/* contracts объявлена в state.js: { list, used, done, nextAt, pact } */

/* ---------------- Движок ---------------- */
function tplById(id) {
  return contractPool().find(t => t.id === id) || null;
}

/* Пул контрактов текущей расы. */
function contractPool() {
  return (faction === 'undead' && typeof CONTRACTS_UNDEAD !== 'undefined' && CONTRACTS_UNDEAD.length)
    ? CONTRACTS_UNDEAD : CONTRACT_TPL;
}

/* Награда контракта в душах (по сложности; общий пул — обычные). */
function contractReward(tpl) { return CONTRACT_REWARD[tpl && tpl.diff ? tpl.diff : 1] || 1; }

/* ---- Метрики-помощники для пульных контрактов ---- */
function collectionTotal() { return Object.values(collection).reduce((a, b) => a + b, 0); }
function deckCountOf(race) { const d = activeDeckFor(race); return d ? d.cards.reduce((s, e) => s + (e.n || 1), 0) : 0; }
function deckEntryMaxOf(race) { const d = activeDeckFor(race); return d ? d.cards.reduce((m, e) => Math.max(m, e.n || 1), 0) : 0; }
function deckStackEntriesOf(race, minN) {
  const d = activeDeckFor(race);
  return d ? d.cards.filter(e => (e.n || 1) >= minN).length : 0;
}
function casinoRounds() { let n = 0; Object.values(stats.g || {}).forEach(o => n += (o.w || 0) + (o.l || 0)); return n; }
function casinoWins() { let n = 0; Object.values(stats.g || {}).forEach(o => n += (o.w || 0)); return n; }
function gridHasCard(id) { return grid.some(row => row.some(it => it && it.cardId === id)); }
function gridStackOf(id, k) { return grid.some(row => row.some(it => it && it.cardId === id && it.stacks >= k)) ? 1 : 0; }
function stackedCells(k) { let n = 0; grid.forEach(row => row.forEach(it => { if (it && it.stacks >= k) n++; })); return n; }
function fieldCap() { return playableSize <= 3 ? 4 : playableSize <= 5 ? 8 : playableSize <= 7 ? 12 : 16; }
/* Число активных звеньев на Алтаре с участием карты id (любой партнёр) */
function pairLinksOf(id) {
  let n = 0;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== id) continue;
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE || !grid[nr][nc]) continue;
      if (findPair(CARDS[id], CARDS[grid[nr][nc].cardId])) n++;
    }
  }
  return n;
}
/* Число активных звеньев конкретной ПАРЫ на Алтаре */
function pairCount2(a, b) {
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

/* ---- Требования по СТАРТОВОЙ колоде (runDeck — снапшот из handOutDeck) ----
   Гарантия выполнимости: контракт с req не выпадет, если в колоде,
   с которой начата Эпоха, нет нужных карт/копий/построек. */
function runDeckCounts() {
  const cnt = {};
  (runDeck || []).forEach(id => { cnt[id] = (cnt[id] || 0) + 1; });
  /* Фолбэк для старых сейвов без снапшота: что уже лежит в инвентаре */
  if (!Object.keys(cnt).length && typeof inventory === 'object') {
    Object.keys(inventory).forEach(id => { if ((inventory[id] || 0) > 0) cnt[id] = inventory[id]; });
  }
  return cnt;
}
function contractReqOK(tpl) {
  const q = tpl.req;
  if (!q) return true;
  const cnt = runDeckCounts();
  if (q.has) { for (const id of q.has) if (!cnt[id]) return false; }
  if (q.n) { for (const id in q.n) if ((cnt[id] || 0) < q.n[id]) return false; }
  if (q.any) { for (const grp of q.any) if (!grp.some(id => cnt[id])) return false; }
  if (q.bld) {
    let b = 0;
    for (const id in cnt) if (CARDS[id] && CARDS[id].isBuilding) b++;
    if (b < q.bld) return false;
  }
  if (q.minEntry) {
    let ok = false;
    for (const id in cnt) if (cnt[id] >= q.minEntry) { ok = true; break; }
    if (!ok) return false;
  }
  return true;
}

function contractProgress(c) {
  const tpl = tplById(c.id); if (!tpl) return 0;
  let v;
  try { v = tpl.val(); } catch (e) { return 0; }
  v = tpl.kind === 'delta' ? v - (c.base || 0) : v;
  return Math.max(0, Math.min(c.target, v));
}

/* Доступные шаблоны: не выпадали в этом забеге, фича куплена,
   req по стартовой колоде пройден, «live»-цель ещё не закрыта сама собой */
function contractsAvailable() {
  return contractPool().filter(t => {
    if (contracts.used.indexOf(t.id) >= 0) return false;
    if (contracts.list.some(c => c.id === t.id)) return false;
    try {
      if (t.okf && !featOwned(t.okf)) return false;
      if (t.ok && !t.ok()) return false;
      if (!contractReqOK(t)) return false;
      if (t.kind === 'live' && t.val() >= t.target(epoch)) return false;
    } catch (e) { return false; }
    return true;
  });
}

function spawnContract() {
  if (contracts.list.length >= CONTRACTS_ACTIVE) return;
  const avail = contractsAvailable();
  if (!avail.length) return;
  const tpl = pick(avail);
  contracts.list.push({
    id: tpl.id,
    diff: tpl.diff || 1,
    target: Math.max(1, tpl.target(epoch)),
    base: tpl.kind === 'delta' ? (tpl.val() || 0) : 0
  });
  contracts.used.push(tpl.id);
}

/* Инициализация серии на новый забег (старт/Эпоха/чит-забег).
   ВАЖНО: вызывается ПОСЛЕ выдачи колоды — req сверяется со стартовой колодой. */
function contractsInit() {
  contracts = { list: [], used: [], done: 0, nextAt: 0, pact: false };
  for (let i = 0; i < CONTRACTS_ACTIVE; i++) spawnContract();
  renderContractsBtn(); renderContractsPanel();
}

/* Восстановление из сохранения: битые элементы выбрасываются */
function contractsRestore(d) {
  contracts = { list: [], used: [], done: 0, nextAt: 0, pact: false };
  if (d && typeof d === 'object') {
    contracts.done = clamp(+d.done || 0, 0, CONTRACTS_PER_RUN);
    contracts.pact = !!d.pact;
    contracts.nextAt = 0;
    if (Array.isArray(d.used)) d.used.forEach(id => { if (tplById(id)) contracts.used.push(id); });
    if (Array.isArray(d.list)) d.list.forEach(c => {
      const tpl = c && tplById(c.id);
      if (!tpl || typeof c.target !== 'number' || c.target < 1) return;
      contracts.list.push({ id: c.id, diff: c.diff || tpl.diff || 1, target: c.target, base: +c.base || 0 });
    });
    contracts.list = contracts.list.slice(0, CONTRACTS_ACTIVE);
    /* добираем до 4, если сохранение было неполным (v1.7.0-сейвы и т.п.);
       guard от вечного цикла, если подходящих меньше 4 */
    let guard = 24;
    while (contracts.list.length < CONTRACTS_ACTIVE && guard-- > 0) spawnContract();
  } else {
    for (let i = 0; i < CONTRACTS_ACTIVE; i++) spawnContract();
  }
  renderContractsBtn(); renderContractsPanel();
}

/* Проверка выполнения — вызывается раз в секунду и после значимых действий */
function checkContracts() {
  if (!gameStarted || gamePaused || noSave) return;
  if (!contracts.list.length) return;
  let changed = false;
  for (let i = contracts.list.length - 1; i >= 0; i--) {
    const c = contracts.list[i];
    if (contractProgress(c) < c.target) continue;
    const tpl = tplById(c.id);
    const rw = contractReward(tpl);
    contracts.list.splice(i, 1);
    contracts.done++;
    /* v1.8.0: контракт платит ДУШАМИ по сложности (1/2/3) */
    gainSouls(rw); saveMeta();
    /* Шоу: волна по панели контрактов + всплывающий текст */
    const anchor = $('contractsPanel') || $('contractsBtn');
    if (anchor && anchor.getBoundingClientRect) {
      const b = anchor.getBoundingClientRect();
      fxFxAt(anchor, ['#e8c060', '#fff8d0', '#c9a227'], 22);
      fxFloat(b.left + b.width / 2, b.top, '📜 КОНТРАКТ ИСПОЛНЕН · +' + rw + ' ДУШИ', '#ffe080', 18);
    }
    toast('📜 <b>Контракт исполнен:</b> ' + (tpl ? tpl.icon : '') + ' ' + (tpl ? tpl.name : '') + ' → ' + SOUL_IMG + ' <b>+' + rw + ' ' + (rw === 1 ? 'Душа' : 'Души') + '</b>', 'contract', 8);
    sfx('relic');
    changed = true;
  }
  if (contracts.done >= CONTRACTS_PER_RUN && !contracts.pact) {
    contracts.pact = true;
    gainSouls(CONTRACT_PACT_SOULS); saveMeta();
    fxConfetti(110);
    fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#c9a227');
    sfx('epoch');
    setTimeout(() => toast('🕯 <b>ПАКТ ИСПОЛНЕН.</b> Четыре подписи Тьмой приняты: ' + SOUL_IMG + ' <b>+' + CONTRACT_PACT_SOULS + ' Души</b>', 'pact', 5), 900);
    changed = true;
  }
  if (changed) { renderContractsBtn(); renderContractsPanel(); updateHUD(); saveRun(); checkAchievements(); }
}

/* ---------------- Кнопка + бейдж ---------------- */
function renderContractsBtn() {
  const b = $('contractsBadge'); if (!b) return;
  const txt = contracts.done + '/' + CONTRACTS_PER_RUN;
  if (b.textContent !== txt) b.textContent = txt;
}

/* ---------------- БЛОК КОНТРАКТА ----------------
   Сверху — название, справа — награда в душах, под ними — задача,
   внизу — прогресс. Сложность подсвечивает рамку (2 — золото, 3 — пурпур). */
function contractBlockHTML(c) {
  const tpl = tplById(c.id); if (!tpl) return '';
  const prog = contractProgress(c);
  const pct = Math.floor((prog / c.target) * 100);
  const rw = contractReward(tpl);
  const diffCls = c.diff >= 3 ? ' ctr-d3' : c.diff === 2 ? ' ctr-d2' : '';
  return '<div class="ctr-block' + diffCls + '">' +
    '<div class="ctr-head">' +
    '<span class="ctr-name">' + tpl.icon + ' ' + tpl.name + '</span>' +
    '<span class="ctr-reward" title="Награда Тёмного Пакта">' + SOUL_IMG + '<b>+' + rw + '</b></span>' +
    '</div>' +
    '<div class="ctr-task">' + tpl.text(c.target) + '</div>' +
    '<div class="ctr-track"><div class="cr-fill" style="width:' + pct + '%"></div><span class="ctr-count">' + fmt(prog) + ' / ' + fmt(c.target) + '</span></div>' +
    '</div>';
}

/* ---------------- ПАНЕЛЬ ПОД ГРИДОМ ----------------
   Список блоков активных контрактов. */
const _hudPanel = { hidden: null };
function renderContractsPanel() {
  const el = $('contractsPanel'); if (!el) return;
  const show = gameStarted && !noSave;
  if (_hudPanel.hidden !== !show) { _hudPanel.hidden = !show; el.style.display = show ? '' : 'none'; }
  if (!show) return;
  let html = contracts.list.map(contractBlockHTML).join('');
  if (!html) html = contracts.pact
    ? '<div class="ctr-empty">🕯 Пакт исполнен — все четыре подписи собраны.</div>'
    : '<div class="ctr-empty">Все контракты исполнены — Тьма готовит новую партию…</div>';
  if (el.dataset.sig === html) return;
  el.dataset.sig = html;
  el.innerHTML = html;
}

/* ---------------- Модалка «Контракты» (кнопка) ---------------- */
function openContracts() {
  mk('contractModal',
    '<h2>📜 КОНТРАКТЫ ЭПОХИ ' + epoch + '</h2>' +
    '<div class="desc">Тёмный Пакт: <b>' + CONTRACTS_PER_RUN + '</b> случайных задания на забег — выпали из пула, как повезло. ' +
    'Награда по сложности: <b>1 Душа</b> (обычные), <b>2 Души</b> (сложные), <b>3 Души</b> (очень сложные). ' +
    'Все контракты выполнимы с колодой, с которой вы начали Эпоху. Исполните все четыре — Пакт заплатит ещё <b>+' + CONTRACT_PACT_SOULS + ' Души</b>.</div>' +
    '<div id="contractList"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="contractX">ЗАКРЫТЬ</button></div>', 560);
  $('contractX').onclick = () => close_('contractModal');
  renderContractList();
  open_('contractModal');
}

function renderContractList() {
  const el = $('contractList'); if (!el) return;
  let html = '';
  if (contracts.list.length) html = contracts.list.map(contractBlockHTML).join('');
  else html = '<div class="res" style="text-align:center">Активных контрактов нет.</div>';
  if (contracts.pact) html += '<div class="res" style="text-align:center;color:#ffe080">🕯 Пакт исполнен — все четыре подписи собраны. Бонус уплачен Душами.</div>';
  else if (contracts.done > 0) html += '<div class="cr-progress-line">Исполнено: <b>' + contracts.done + '</b> / ' + CONTRACTS_PER_RUN + '</div>';
  if (el.dataset.sig === html) return;
  el.dataset.sig = html;
  el.innerHTML = html;
}

/* ---------------- ЗНАМЕНИЕ СУДЬБЫ (ежедневный дар) ---------------- */
function dailyKey() { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

function checkDailyGift() {
  if (noSave || !gameStarted) return;
  if (lastDaily === dailyKey()) return;
  lastDaily = dailyKey();
  /* v1.7.0: круток даром больше НЕТ — только бафф дохода */
  altBuff = { mult: 2, until: gameTime + 300, label: '✨ ЗНАМЕНИЕ СУДЬБЫ ×2' };
  fxShockwave(window.innerWidth / 2, 120, '#80e0ff');
  sfx('relic');
  setTimeout(() => toast('✨ <b>Знамение Судьбы:</b> Тьма ждёт тебя снова — доход <b>×2 на 5 минут</b>!', 'daily', 5), 800);
  updateHUD(); saveRun();
}

/* ---------------- ХРОНИКИ ТЬМЫ (коллекционные вершины) ----------------
   За ПОЛНОЕ открытие набора фракции — разовые ДУШИ (печати удалены).
   Ключи вида 'undead3' / 'undeadB' / 'undead4' / 'undead5' — вечные. */
const CHRON_TIERS = [
  { r: '3', name: 'стандарт', reward: 2 },
  { r: 'B', name: 'постройки', reward: 2 },
  { r: '4', name: 'редкие ★4', reward: 3 },
  { r: '5', name: '★5 — владыки', reward: 5 }
];
function chronCards(f, r) {
  return Object.keys(CARDS).filter(id => CARDS[id].faction === f && String(CARDS[id].rarity) === r);
}
function chronComplete(f, r) {
  const list = chronCards(f, r);
  return list.length > 0 && list.every(id => discovered.has(id));
}
function checkChronicles() {
  if (noSave) return;
  let got = false;
  FACTION_KEYS.forEach(f => CHRON_TIERS.forEach(t => {
    const key = f + t.r;
    if (chron[key]) return;
    if (!chronComplete(f, t.r)) return;
    chron[key] = 1;
    gainSouls(t.reward);
    got = true;
    fxConfetti(70);
    sfx('milestone');
    setTimeout(() => toast('📖 <b>Хроника «' + FACTION_INFO[f].name + ' · ' + t.name + '» завершена:</b> ' + SOUL_IMG + ' +' + t.reward + ' Души', 'chron', 6), got ? 400 : 0);
  }));
  if (got) { saveMeta(); updateHUD(); if ($('achvModal') && $('achvModal').classList.contains('show')) renderAchvList(); }
}
