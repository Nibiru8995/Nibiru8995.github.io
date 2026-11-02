'use strict';
/* ============================================================
   ЛОГИКА: КОНТРАКТЫ ЭПОХИ + ЗНАМЕНИЕ СУДЬБЫ (logic/contracts.js)
   «Тёмный Пакт»: серия из 6 заданий на забег, 3 активных сразу.
   v1.7.0 «Плата Душами»:
   - НАГРАДА КОНТРАКТА — 1 ДУША (крутки и ТЭ сверх награды сняты;
     бесплатные крутки убраны из игры совсем);
   - в игре активные контракты выводятся СПИСКОМ БЛОКОВ ПОД ГРИДОМ
     (#contractsPanel): сверху название, под ним задача, справа —
     награда в душах. Кнопка «Контракты» открывает те же блоки окном;
   - за все 6 — «ПАКТ ИСПОЛНЕН»: +1 печать 🔱 и шоу;
   - прогресс — дельты от stats/живых значений; в сохранении забега
     лежит только плоский массив (валидация при загрузке).
   - ЗНАМЕНИЕ СУДЬБЫ: первый вход за календарный день — ×2 доход
     на 5 минут (только в реальном забеге). Крутки даром больше
     не даёт.
   - ХРОНИКИ ТЬМЫ: разовые печати за полное открытие наборов фракций.
   ============================================================ */

/* contracts объявлена в state.js (v1.2.9): { list, used, done, nextAt, pact } —
   здесь только логика работы с ней. */

/* ---------------- Движок ---------------- */
function tplById(id) { return CONTRACT_TPL.find(t => t.id === id) || null; }

function contractProgress(c) {
  const tpl = tplById(c.id); if (!tpl) return 0;
  let v;
  try { v = tpl.val(); } catch (e) { return 0; }
  v = tpl.kind === 'delta' ? v - (c.base || 0) : v;
  return Math.max(0, Math.min(c.target, v));
}

/* Доступные шаблоны: не использованы в этом забеге, фильтр фичи пройден,
   «live»-цель ещё не выполнена самим фактом (иначе награда за ничего) */
function contractsAvailable() {
  return CONTRACT_TPL.filter(t => {
    if (contracts.used.indexOf(t.id) >= 0) return false;
    if (contracts.list.some(c => c.id === t.id)) return false;
    try {
      if (!t.ok()) return false;
      if (t.kind === 'live' && t.val() >= t.target(epoch)) return false;
    } catch (e) { return false; }
    return true;
  });
}

function spawnContract() {
  if (contracts.done + contracts.list.length >= CONTRACTS_PER_RUN) return;
  const avail = contractsAvailable();
  if (!avail.length || contracts.list.length >= CONTRACTS_ACTIVE) return;
  const tpl = pick(avail);
  contracts.list.push({
    id: tpl.id,
    target: Math.max(1, tpl.target(epoch)),
    base: tpl.kind === 'delta' ? (tpl.val() || 0) : 0
  });
  contracts.used.push(tpl.id);
}

/* Инициализация серии на новый забег (старт/Эпоха/чит-забег) */
function contractsInit() {
  contracts = { list: [], used: [], done: 0, nextAt: 0, pact: false };
  for (let i = 0; i < CONTRACTS_ACTIVE; i++) spawnContract();
  renderContractsBtn(); renderContractsPanel();
}

/* Восстановление из сохранения: битые элементы выбрасываются (Тимка спал спокойно) */
function contractsRestore(d) {
  contracts = { list: [], used: [], done: 0, nextAt: 0, pact: false };
  if (d && typeof d === 'object') {
    contracts.done = clamp(+d.done || 0, 0, CONTRACTS_PER_RUN);
    contracts.pact = !!d.pact;
    contracts.nextAt = +d.nextAt || 0;
    if (Array.isArray(d.used)) d.used.forEach(id => { if (tplById(id)) contracts.used.push(id); });
    if (Array.isArray(d.list)) d.list.forEach(c => {
      const tpl = c && tplById(c.id);
      if (!tpl || typeof c.target !== 'number' || c.target < 1) return;
      contracts.list.push({ id: c.id, target: c.target, base: +c.base || 0 });
    });
    contracts.list = contracts.list.slice(0, CONTRACTS_ACTIVE);
    /* добираем до 3 активных, если сохранение было неполным */
    while (contracts.list.length < CONTRACTS_ACTIVE && contracts.done + contracts.list.length < CONTRACTS_PER_RUN) {
      spawnContract();
    }
  }
  renderContractsBtn(); renderContractsPanel();
}

/* Проверка выполнения — вызывается раз в секунду и после значимых действий */
function checkContracts() {
  if (!gameStarted || gamePaused || noSave) return;
  if (contracts.nextAt && gameTime >= contracts.nextAt) { contracts.nextAt = 0; spawnContract(); renderContractsBtn(); renderContractsPanel(); }
  if (!contracts.list.length) return;
  let changed = false;
  for (let i = contracts.list.length - 1; i >= 0; i--) {
    const c = contracts.list[i];
    if (contractProgress(c) < c.target) continue;
    const tpl = tplById(c.id);
    contracts.list.splice(i, 1);
    contracts.done++;
    /* v1.7.0: контракт платит ДУШОЙ — единственная награда Тёмного Пакта */
    souls += CONTRACT_SOUL_REWARD; saveMeta();
    /* Шоу: волна по панели контрактов + всплывающий текст */
    const anchor = $('contractsPanel') || $('contractsBtn');
    if (anchor && anchor.getBoundingClientRect) {
      const b = anchor.getBoundingClientRect();
      fxFxAt(anchor, ['#e8c060', '#fff8d0', '#c9a227'], 22);
      fxFloat(b.left + b.width / 2, b.top, '📜 КОНТРАКТ ИСПОЛНЕН · +1 ДУША', '#ffe080', 18);
    }
    toast('📜 <b>Контракт исполнен:</b> ' + (tpl ? tpl.icon : '') + ' ' + (tpl ? tpl.name : '') + ' → ' + SOUL_IMG + ' <b>+' + CONTRACT_SOUL_REWARD + ' Душа</b> <small>(валюта Призыва в Гримуаре)</small>', 'contract', 8);
    sfx('relic');
    if (contracts.done >= CONTRACTS_PER_RUN && !contracts.pact) {
      contracts.pact = true;
      seals += 1; sealsTotal += 1;
      fxConfetti(110);
      fxShockwave(window.innerWidth / 2, window.innerHeight / 2, '#c9a227');
      sfx('epoch');
      setTimeout(() => toast('🕯 <b>ПАКТ ИСПОЛНЕН.</b> Шесть подписей Тьмой приняты: <b>+1 🔱</b>', 'pact', 5), 900);
    } else {
      contracts.nextAt = gameTime + CONTRACT_REROLL_DELAY;
    }
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

/* ---------------- БЛОК КОНТРАКТА (v1.7.0) ----------------
   Сверху — название, справа — награда в душах, под ними — задача,
   внизу — прогресс. Один и тот же блок живёт в панели под гридом
   и в модалке «Контракты». */
function contractBlockHTML(c) {
  const tpl = tplById(c.id); if (!tpl) return '';
  const prog = contractProgress(c);
  const pct = Math.floor((prog / c.target) * 100);
  return '<div class="ctr-block">' +
    '<div class="ctr-head">' +
    '<span class="ctr-name">' + tpl.icon + ' ' + tpl.name + '</span>' +
    '<span class="ctr-reward" title="Награда: душа на Тёмный Пакт">' + SOUL_IMG + '<b>+' + CONTRACT_SOUL_REWARD + '</b></span>' +
    '</div>' +
    '<div class="ctr-task">' + tpl.text(c.target) + '</div>' +
    '<div class="ctr-track"><div class="cr-fill" style="width:' + pct + '%"></div><span class="ctr-count">' + fmt(prog) + ' / ' + fmt(c.target) + '</span></div>' +
    '</div>';
}

/* ---------------- ПАНЕЛЬ ПОД ГРИДОМ (v1.7.0) ----------------
   Список блоков активных контрактов. Прячется в обучении/чит-режиме
   и пока меню/Гримуар важнее — просто пустует при отсутствии списка. */
const _hudPanel = { hidden: null };
function renderContractsPanel() {
  const el = $('contractsPanel'); if (!el) return;
  const show = gameStarted && !noSave;
  if (_hudPanel.hidden !== !show) { _hudPanel.hidden = !show; el.style.display = show ? '' : 'none'; }
  if (!show) return;
  let html = contracts.list.map(contractBlockHTML).join('');
  if (!html) html = contracts.pact
    ? '<div class="ctr-empty">🕯 Пакт исполнен — все шесть подписей собраны.</div>'
    : '<div class="ctr-empty">Все активные контракты исполнены — Тьма готовит новый…</div>';
  if (el.dataset.sig === html) return;
  el.dataset.sig = html;
  el.innerHTML = html;
}

/* ---------------- Модалка «Контракты» (кнопка) ---------------- */
function openContracts() {
  mk('contractModal',
    '<h2>📜 КОНТРАКТЫ ЭПОХИ ' + epoch + '</h2>' +
    '<div class="desc">Тёмный Пакт: <b>' + CONTRACTS_PER_RUN + '</b> заданий за забег, <b>' + CONTRACTS_ACTIVE + '</b> активных. ' +
    'Награда каждого — <b>' + CONTRACT_SOUL_REWARD + ' Душа</b> (валюта Призыва в Гримуаре). Исполните все шесть — Тьма заплатит печатью 🔱.</div>' +
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
  if (contracts.pact) html += '<div class="res" style="text-align:center;color:#ffe080">🕯 Пакт исполнен — все шесть подписей собраны. +1 🔱 уплачено Тьмой.</div>';
  else if (contracts.done > 0) html += '<div class="cr-progress-line">Исполнено: <b>' + contracts.done + '</b> / ' + CONTRACTS_PER_RUN +
    (contracts.nextAt ? ' · следующий контракт — через ' + Math.max(1, Math.ceil(contracts.nextAt - gameTime)) + 'с' : '') + '</div>';
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
   За ПОЛНОЕ открытие набора фракции — разовые печати. Ключи вида
   'undead3' / 'undeadB' / 'undead4' / 'undead5' живут в мета-сохранении. */
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
    seals += t.reward; sealsTotal += t.reward;
    got = true;
    fxConfetti(70);
    sfx('milestone');
    setTimeout(() => toast('📖 <b>Хроника «' + FACTION_INFO[f].name + ' · ' + t.name + '» завершена:</b> +' + t.reward + ' 🔱', 'chron', 6), got ? 400 : 0);
  }));
  if (got) { saveMeta(); updateHUD(); if ($('achvModal') && $('achvModal').classList.contains('show')) renderAchvList(); }
}
