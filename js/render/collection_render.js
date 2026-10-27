'use strict';
/* ============================================================
   РЕНДЕР: КОЛЛЕКЦИЯ (render/collection_render.js)
   Вкладки: показываем ТОЛЬКО открытые фракции (пункт 9 ТЗ),
   фильтр редкостей только из доступных. Кнопки «в бой» видны
   только с открытой Ареной. Эмодзи вместо спрайтов.
   ============================================================ */

function renderCollection() {
  const cont = $('collectGrid');
  cont.innerHTML = '';
  const sel = placingMode && pendingCard ? CARDS[pendingCard] : null;

  /* Фильтр редкостей: только открытые в текущей Эпохе */
  renderRarityFilter();

  /* Вкладки: заблокированные фракции не отображаем вовсе (пункт 9 ТЗ) */
  const tabsEl = $('collectionTabs');
  tabsEl.innerHTML = '';
  const invFactions = [...new Set(Object.keys(inventory).map(id => CARDS[id].faction))];
  const visible = FACTION_KEYS.filter(f => epochFactions(epoch).includes(f) &&
    (f === faction || invFactions.includes(f)));
  const tabs = [['all', 'ВСЕ']].concat(visible.map(f => [f, FACTION_INFO[f].name.toUpperCase()]));
  if (collectionFilter !== 'all' && !visible.includes(collectionFilter)) collectionFilter = 'all';
  tabs.forEach(([f, label]) => {
    const t = document.createElement('div');
    t.className = 'coll-tab' + (collectionFilter === f ? ' active' : '');
    t.dataset.faction = f;
    t.textContent = label;
    t.onclick = () => {
      qsa('.coll-tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      collectionFilter = f; renderCollection();
    };
    tabsEl.appendChild(t);
  });

  const ids = Object.keys(inventory).filter(id =>
    (collectionFilter === 'all' || CARDS[id].faction === collectionFilter) &&
    (rarityFilter === 'all' || CARDS[id].rarity == rarityFilter));
  const pv = id => sel && sel.id !== id && linked(sel, CARDS[id]) ? 1 : 0;
  ids.sort((a, b) => pv(b) - pv(a) || CARDS[b].rarity - CARDS[a].rarity || a.localeCompare(b));

  ids.forEach(id => {
    const card = CARDS[id], count = inventory[id];
    const el = document.createElement('div');
    el.className = 'coll-card star' + card.rarity + ' f-' + card.faction;
    el.style.setProperty('--glow', rarityColor(card.rarity));
    el.style.setProperty('--cardBg', rarityBg(card.rarity));
    if (pv(id)) el.classList.add('partner');
    if (sel && sel.id === id) el.classList.add('selected');
    el.innerHTML = cardArtHTML(card, 'coll-art', 'coll-glyph') +
      '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
      '<span class="count">' + count + '</span>';
    el.addEventListener('mouseenter', e => showCardTooltip(e, card, card.baseRate));
    el.addEventListener('mousemove', moveTooltip);
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('click', e => {
      if (e.ctrlKey || e.shiftKey) { addFighter(id, 1); return; }
      deleteMode = false; moveMode = false; moveSource = null;
      $('deleteToolBtn').classList.remove('active'); $('moveToolBtn').classList.remove('active');
      if (placingMode && pendingCard === id) { cancelSelection(); return; }
      pendingCard = id; placingMode = true;
      hideTooltip(); renderGrid(); renderCollection(); updateBanner();
    });
    el.addEventListener('contextmenu', e => { e.preventDefault(); addFighter(id, 1); });
    cont.appendChild(el);
  });
  if (!ids.length) cont.innerHTML = '<div class="fighter-empty">Здесь пусто. Крутите карты!</div>';
  $('collectStats').textContent = 'Карт: ' + Object.values(inventory).reduce((a, b) => a + b, 0) + ' · открыто ' + discovered.size + '/' + Object.keys(CARDS).length;
  renderActions();
}

/* Пересборка селекта редкостей: недоступные ★ скрыты (пункт 9 ТЗ) */
function renderRarityFilter() {
  const sel = $('rarityFilter');
  const opts = [['all', 'Все ★']].concat(unlockedRarities().map(r => [String(r), '★' + r]));
  sel.innerHTML = opts.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('');
  if (!opts.some(([v]) => v === rarityFilter)) rarityFilter = 'all';
  sel.value = rarityFilter;
}

function renderActions() {
  const el = $('cardActions');
  if (!placingMode || !pendingCard || !inventory[pendingCard]) {
    el.innerHTML = '<span class="act-hint">Выберите карту: <b style="color:#80e060">зелёная рамка</b> — партнёры по синергии, подсветятся лучшие клетки. ПКМ / Shift+клик — в бой.</span>' +
      '<button id="autoBtn2">🪄 Стак</button>';
  } else {
    const c = CARDS[pendingCard], n = inventory[pendingCard];
    el.innerHTML = '<b>' + cardArtHTML(c, 'inline-art', '') + ' ' + c.name + '</b> ×' + n +
      ' <button data-n="1">⚔ ×1</button>' + (n > 5 ? '<button data-n="5">⚔ ×5</button>' : '') +
      (n > 1 ? '<button data-n="' + n + '">⚔ все (' + n + ')</button>' : '') +
      '<span class="act-hint">или кликните по Алтарю</span><button id="autoBtn2">🪄 Стак</button>';
  }
  $('autoBtn2').onclick = autoStack;
  $('autoBtn2').title = 'Уложить карты из инвентаря в существующие стопки на поле';
  el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => addFighter(pendingCard, +b.dataset.n));
}
