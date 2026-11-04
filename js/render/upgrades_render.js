'use strict';
/* ============================================================
   РЕНДЕР: УЛУЧШЕНИЯ (render/upgrades_render.js) — v1.8.0
   Окно «УЛУЧШЕНИЯ» (Меню → Улучшения): все мета-покупки за ДУШИ.
   Четыре группы: Контроль (поле/опции забега), Гримуар (редкости,
   страницы колоды, фракции), Фичи (Арена, Казино, бонусы),
   Слуги (улучшения фракций, вкладки открытых).
   Строки: яркое = можно купить сейчас; приглушённое (.avail) —
   куплено, заблокировано или не хватает Душ.
   ============================================================ */

let upgHideBought = false; /* «Скрыть недоступные»: купленное + закрытое предусловиями */
let upgStaffTab = 'undead'; /* открытая вкладка группы «Слуги» */

function openUpgrades() {
  mk('upgModal',
    '<h2>УЛУЧШЕНИЯ</h2>' +
    '<div id="upgList" style="width:100%;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:12px;min-height:0"></div>' +
    '<div class="btn-row" style="display:flex;justify-content:center;align-items:center;gap:28px">' +
      '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#a39e92;visibility:hidden" aria-hidden="true"><input type="checkbox" disabled style="width:14px;height:14px">Скрыть недоступные</label>' +
      '<button class="btn btn-take" id="upgX">Закрыть</button>' +
      '<label class="upg-hide" style="display:flex;align-items:center;gap:6px;font-size:12px;color:#a39e92"><input type="checkbox" id="upgHideChk" style="width:14px;height:14px;accent-color:var(--gold)">Скрыть недоступные</label>' +
    '</div>', 560);
  const card = document.querySelector('#upgModal .modal-card');
  if (card) card.style.overflow = 'hidden'; /* прокрутка — только у списка */
  $('upgX').onclick = () => close_('upgModal');
  $('upgHideChk').onchange = () => { upgHideBought = $('upgHideChk').checked; renderUpgrades(); };
  $('upgHideChk').checked = upgHideBought; /* галочка живёт между открытиями окна */
  renderUpgrades();
  open_('upgModal');
}

/* Строка улучшения: icon / название+описание / цена справа.
   cls 'avail' — приглушённая (недоступная сейчас). */
function upgRowHTML(icon, name, desc, rightHTML, cls, action) {
  return '<div class="upg-item ' + (cls || '') + '"' + (action ? ' data-upg="' + action + '"' : '') + '>' +
    '<span class="ic">' + icon + '</span>' +
    '<span class="txt"><b>' + name + '</b><br><small>' + desc + '</small></span>' +
    '<span class="cost">' + rightHTML + '</span></div>';
}
/* Цена в Душах (иконка + число) / отметка о покупке */
function upgCost(n) { return SOUL_IMG + '<b>' + n + '</b>'; }
function upgOwnedMsg(txt) { return txt || '✔'; }
/* Скрывать строку под «Скрыть недоступные»? Куплено (.done) или
   закрыто предусловием (.lock): недоступно и то, и другое. */
function upgHidden(cls) {
  const s = String(cls || '');
  return upgHideBought && (s.indexOf('done') >= 0 || s.indexOf('lock') >= 0);
}

/* Строки типа UPG_ONCE (фичи, редкости, опции) покупаются через
   buyUpgradeOnce из logic/upgrades.js — там же проверки и тосты. */

/* Последовательные строки (поле / страницы колоды):
   i — индекс уровня, lv — текущий уровень, data — массив уровней. */
function seqRow(icon, lv, i, item, action) {
  if (lv > i) { /* куплено */
    const right = upgOwnedMsg();
    if (upgHidden('avail done')) return '';
    return upgRowHTML(icon, item.name, item.desc, right, 'avail done', null);
  }
  if (lv < i) { /* ещё не открыто (закрыто предыдущим уровнем) */
    if (upgHidden('avail lock')) return '';
    return upgRowHTML(icon, item.name, item.desc, upgCost(item.cost), 'avail lock', null);
  }
  /* следующий уровень — покупается сейчас */
  const afford = souls >= item.cost;
  return upgRowHTML(icon, item.name, item.desc, upgCost(item.cost), afford ? '' : 'avail', action);
}

function renderUpgrades() {
  const list = $('upgList');
  if (!list) return;
  if (typeof renderMenuSouls === 'function') renderMenuSouls(); /* счётчик Душ в меню за окном */
  let html = '';

  /* ============ КОНТРОЛЬ ============ */
  html += '<div class="upg-group-title"><span class="line"></span><span>' + UPG_CATS[0].title + '</span><span class="line"></span></div>';
  html += '<div class="upg-group">';
  UPG_FIELD.forEach((f, i) => { html += seqRow('🧱', fieldLv, i, f, 'field'); });
  if (fieldLv >= UPG_FIELD.length && !upgHidden('done'))
    html += upgRowHTML('🧱', 'Территория: ' + fieldSize() + '×' + fieldSize(), 'Максимальный размер Алтаря.', upgOwnedMsg(), 'avail done');
  ['darkomens', 'darksave', 'ground'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = featOwned(k);
    const afford = souls >= u.cost;
    const cls = owned ? 'avail done' : (afford ? '' : 'avail need');
    if (upgHidden(owned ? 'done' : '')) return;
    html += upgRowHTML(u.icon, u.name, u.desc, owned ? upgOwnedMsg() : upgCost(u.cost), cls, owned ? null : k);
  });
  html += '</div>';

  /* ============ ГРИМУАР ============ */
  html += '<div class="upg-group-title"><span class="line"></span><span>' + UPG_CATS[1].title + '</span><span class="line"></span></div>';
  html += '<div class="upg-group">';
  ['r4', 'r5'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = featOwned(k);
    const locked = u.need && !featOwned(u.need);
    const afford = souls >= u.cost;
    const cls = owned ? 'avail done' : (locked ? 'avail lock' : (afford ? '' : 'avail need'));
    if (upgHidden(owned ? 'done' : '')) return;
    html += upgRowHTML(u.icon, u.name, u.desc + (locked ? ' <i>— сперва ' + UPG_ONCE[u.need].name + '</i>' : ''),
      owned ? upgOwnedMsg() : upgCost(u.cost), cls, owned ? null : k);
  });
  UPG_DECK.forEach((p, i) => { html += seqRow('📖', deckLv, i, p, 'deck'); });
  if (deckLv >= UPG_DECK.length && !upgHidden('done'))
    html += upgRowHTML('📖', 'Гримуар: ' + deckCap() + ' карт', 'Полный Гримуар — максимум страниц.', upgOwnedMsg(), 'avail done');
  ['f_cultist', 'f_beast', 'f_demon'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = factionOwned(k.slice(2));
    const afford = souls >= u.cost;
    const cls = owned ? 'avail done' : (afford ? '' : 'avail need');
    if (upgHidden(owned ? 'done' : '')) return;
    html += upgRowHTML(u.icon, u.book || u.name, u.desc, owned ? upgOwnedMsg() : upgCost(u.cost), cls, owned ? null : k);
  });
  html += '</div>';

  /* ============ ФИЧИ ============ */
  html += '<div class="upg-group-title"><span class="line"></span><span>' + UPG_CATS[2].title + '</span><span class="line"></span></div>';
  html += '<div class="upg-group"><div class="ups">';
  ['arena', 'casino'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = featOwned(k);
    const afford = souls >= u.cost;
    const cls = owned ? 'avail done' : (afford ? '' : 'avail need');
    if (upgHidden(owned ? 'done' : '')) return;
    html += upgRowHTML(u.icon, u.name, u.desc, owned ? upgOwnedMsg() : upgCost(u.cost), cls, owned ? null : k);
  });
  UPG_BONUS.forEach(s => {
    const l = upgLv[s.id] || 0, maxed = l >= s.max;
    const cost = maxed ? null : s.cost(l);
    const afford = !maxed && souls >= cost;
    const cls = maxed ? 'avail done' : (afford ? '' : 'avail need');
    if (upgHidden(maxed ? 'done' : '')) return;
    html += upgRowHTML(s.icon, s.name + ' <small style="color:#8f8a80">(ур. ' + l + '/' + s.max + ')</small>', s.desc,
      maxed ? 'МАКС' : upgCost(cost), cls, maxed ? null : 'b:' + s.id);
  });
  html += '</div></div>';

  /* v1.13.0: группа «Слуги» скрыта — там были одни заглушки «Тест» */

  list.innerHTML = html;

  /* Клик: вся строка — покупка */
  list.querySelectorAll('[data-upg]').forEach(row => {
    const a = row.dataset.upg;
    row.style.cursor = 'pointer';
    row.onclick = () => {
      if (a === 'field') buyUpgradeField();
      else if (a === 'deck') buyUpgradeDeck();
      else if (a.indexOf('b:') === 0) buyUpgradeBonus(a.slice(2));
      else if (a.indexOf('st:') === 0) buyUpgradeStaff(a.slice(3));
      else buyUpgradeOnce(a);
    };
  });
}
