'use strict';
/* ============================================================
   РЕНДЕР: КОЛЛЕКЦИЯ (render/collection_render.js)
   Вкладки: открытые фракции + РЕЛИКВИИ (жизнь в коллекции,
   слоты столбов — ряд над гридом). Фильтр редкостей.
   v1.2.6: ПРОДАЖА ДУБЛИКАТОВ — сток для сотен лишних карт
   (к середине забега инвентарь раздувался до 300-400 копий).
   Кнопки «в бой» видны только с открытой Ареной.
   ============================================================ */

let relicTabActive = false;

/* ---- СТОК КАРТ: продажа дубликатов (v1.2.6) ----
   Продаются копии СВЕРХ лимита стека (остаётся 5 на каждый тип).
   Выручка НЕ идёт в порог Эпохи (incomeExempt) — иначе крутки
   становились бы бесплатным фармом прогресса. */
function sellPriceOf(card) {
  const base = { B: 200, 3: 600, 4: 3000, 5: 12000 }[rarityRank(card.rarity)] || 200;
  return Math.round(base * (1 + 0.4 * (epoch - 1)));
}
function sellDupesOf(id, silent) {
  const have = inventory[id] || 0, keep = maxStacks();
  if (have <= keep) return 0;
  const n = have - keep;
  const gold = n * sellPriceOf(CARDS[id]);
  inventory[id] = keep;
  crystals += gold; incomeExempt += gold;
  stats.soldGold = (stats.soldGold || 0) + gold; /* v1.2.9: счётчик для контрактов */
  if (!silent) toast('💰 Продано «' + CARDS[id].name + '» ×' + n + ' → +' + fmtShort(gold) + ' 💎 (осталось ' + keep + ')');
  return gold;
}
function sellAllDupes() {
  let n = 0, gold = 0;
  Object.keys(inventory).forEach(id => {
    const have = inventory[id], keep = maxStacks();
    if (have > keep) { gold += sellDupesOf(id, true); n += have - keep; }
  });
  if (!n) { toast('Дубликатов сверх стека ×' + maxStacks() + ' нет — продавать нечего'); return; }
  toast('💰 Продано карт: ' + n + ' → +' + fmtShort(gold) + ' 💎 (в порог Эпохи НЕ идёт)');
  sfx('win');
  computeIncome(); renderCollection(); updateHUD(); saveRun();
}

function renderCollection() {
  const cont = $('collectGrid');
  cont.innerHTML = '';
  const sel = placingMode && pendingCard ? CARDS[pendingCard] : null;
  const relicsUnlocked = epoch >= RELIC_SLOT_EPOCH;

  /* Фильтр редкостей: только открытые в текущей Эпохе */
  renderRarityFilter();

  /* Вкладки: заблокированные фракции не отображаем вовсе */
  const tabsEl = $('collectionTabs');
  tabsEl.innerHTML = '';
  const invFactions = [...new Set(Object.keys(inventory).map(id => CARDS[id].faction))];
  const visible = FACTION_KEYS.filter(f => epochFactions(epoch).includes(f) &&
    (f === faction || invFactions.includes(f)));
  const tabs = [['all', 'ВСЕ']].concat(visible.map(f => [f, FACTION_INFO[f].name.toUpperCase()]));
  if (relicsUnlocked) tabs.push(['relics', '⚒ РЕЛИКВИИ']);
  if (collectionFilter !== 'all' && collectionFilter !== 'relics' && !visible.includes(collectionFilter)) collectionFilter = 'all';
  if (!relicsUnlocked && collectionFilter === 'relics') collectionFilter = 'all';
  relicTabActive = collectionFilter === 'relics';
  /* Фильтр редкостей не имеет смысла на вкладке реликвий */
  $('rarityFilter').style.visibility = relicTabActive ? 'hidden' : 'visible';
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

  /* ===== ВКЛАДКА РЕЛИКВИЙ ===== */
  if (relicTabActive) { renderRelicTab(cont); return; }

  const ids = Object.keys(inventory).filter(id =>
    (collectionFilter === 'all' || CARDS[id].faction === collectionFilter) &&
    (rarityFilter === 'all' || String(CARDS[id].rarity) === String(rarityFilter)));
  const pv = id => sel && sel.id !== id && linked(sel, CARDS[id]) ? 1 : 0;
  ids.sort((a, b) => pv(b) - pv(a) || rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity) || a.localeCompare(b));

  ids.forEach(id => {
    const card = CARDS[id], count = inventory[id];
    const el = document.createElement('div');
    el.className = 'coll-card star' + card.rarity + ' f-' + card.faction;
    el.dataset.cid = id; /* якорь для обучающих подсветок */
    el.style.setProperty('--glow', rarityColor(card.rarity));
    el.style.setProperty('--cardBg', rarityBg(card.rarity));
    if (card.isBuilding) el.style.borderStyle = 'double';
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

/* ===== Вкладка реликвий: клик по реликвии → выбор столба ===== */
function renderRelicTab(cont) {
  const mine = relicsOfFaction(faction);
  const usedBy = {};
  Object.keys(relicSlots).forEach(col => { usedBy[relicSlots[col]] = +col + 1; });
  $('rarityFilter').style.visibility = 'hidden';
  const st = gridStart(), cols = [];
  const cultGlobal = FACTION_INFO[faction].mechanic === 'formation';
  for (let dc = 0; dc < playableSize; dc++) cols.push(st + dc);
  cont.innerHTML = mine.map(r => {
    const own = hasRelic(r.id);
    const col = usedBy[r.id] ? usedBy[r.id] - 1 : null;
    return '<div class="relic-pick" data-id="' + r.id + '" style="border-color:' + RELIC_RARITY_COLOR(r.rarity) + (own ? '' : ';opacity:.35') + '">' +
      relicArtHTML(r, 'relic-pick-img', '') +
      '<span><b>' + (own ? r.name : '???') + '</b> ' + (own ? '★'.repeat(r.rarity) : '') +
      '<br><small style="color:#8fc87f">✅ ' + (own ? r.buff : 'источник: гача с Эпохи ' + RELIC_DROP_EPOCH) + '</small>' +
      (own ? '<br><small style="color:' + (col !== null ? '#c9a227' : '#8a7a5a') + '">' + (col !== null ? '📍 стоит в столбе ' + (col + 1) + ' (клик — снять)' : 'клик — поставить в столб') + '</small>' +
        (cultGlobal ? '<br><small style="color:#c9a227">ритуальная — действует на ВЕСЬ ритуал</small>' : '')
        : '') + '</span></div>';
  }).join('') +
    (RELICS_OWNED.size === 0 ? '<div class="fighter-empty">Реликвий пока нет — падают из гачи с Эпохи ' + RELIC_DROP_EPOCH + '.<br>Слоты столбов — в ряду НАД Алтарём.</div>' : '');
  cont.querySelectorAll('.relic-pick').forEach(el => {
    const id = el.dataset.id;
    if (!hasRelic(id)) return;
    el.onclick = () => {
      const col = Object.keys(relicSlots).find(k => relicSlots[k] === id);
      if (col !== undefined) { onColSlotClick(+col); return; } /* снять */
      /* Вставить: если свободный столб один — сразу туда, иначе выбор */
      const free = cols.filter(c => !relicSlots[c]);
      if (!free.length) { toast('Все столбы заняты — сначала снимите реликвию'); return; }
      if (free.length === 1 || cultGlobal) { placeRelicCol(id, free[0]); return; }
      mk('relicColPick', '<h2>⚒ «' + relicById(id).name + '» — в какой столб?</h2>' +
        '<div class="res">Бафф действует на весь столб Алтаря.</div>' +
        '<div class="btn-row" style="flex-wrap:wrap">' +
        free.map(c => '<button class="btn btn-take" data-col="' + c + '" style="max-width:none;width:auto;min-width:70px">' + (c + 1) + '</button>').join('') +
        '</div>', 480);
      $('relicColPick').querySelectorAll('[data-col]').forEach(b => {
        b.onclick = () => { close_('relicColPick'); placeRelicCol(id, +b.dataset.col); };
      });
      open_('relicColPick');
    };
  });
  $('collectStats').textContent = 'Реликвий собрано: ' + RELICS_OWNED.size + ' / ' + RELICS.length + ' (эпоха сбрасывает их)';
  renderActions();
}

function placeRelicCol(id, c) {
  relicSlots[c] = id;
  const r = relicById(id);
  toast(r.icon + ' «' + r.name + '» встала в столб ' + (c + 1));
  sfx('place');
  computeIncome(); renderGrid(); updateHUD(); saveRun();
}

/* Пересборка селекта редкостей: недоступные скрыты */
function renderRarityFilter() {
  const sel = $('rarityFilter');
  const opts = [['all', 'Все ★']].concat(unlockedRarities().map(r => [String(r), r === 'B' ? 'Здания' : '★' + r]));
  sel.innerHTML = opts.map(([v, l]) => '<option value="' + v + '">' + l + '</option>').join('');
  if (!opts.some(([v]) => v === rarityFilter)) rarityFilter = 'all';
  sel.value = rarityFilter;
}

function renderActions() {
  const el = $('cardActions');
  const dupBtn = '<button id="sellDupesBtn" title="Продать все копии сверх стека ×' + maxStacks() + ' (выручка НЕ двигает порог Эпохи)">💰 Продать дубликаты</button>';
  if (relicTabActive) {
    el.innerHTML = '<span class="act-hint">Реликвии — чистый бафф на один столб Алтаря (культовые — на весь ритуал). Живут до конца Эпохи.</span>' +
      '<button id="autoBtn2">🪄 Стак</button>';
  } else if (!placingMode || !pendingCard || !inventory[pendingCard]) {
    el.innerHTML = '<span class="act-hint">Выберите карту: <b style="color:#80e060">зелёная рамка</b> — партнёры по синергии, подсветятся лучшие клетки. ПКМ / Shift+клик — в бой.</span>' +
      dupBtn + '<button id="autoBtn2">🪄 Стак</button>';
  } else {
    const c = CARDS[pendingCard], n = inventory[pendingCard];
    const extra = n > maxStacks() ? ' <button id="sellThisBtn">💰 продать лишние (' + (n - maxStacks()) + ' → +' + fmtShort((n - maxStacks()) * sellPriceOf(c)) + ' 💎)</button>' : '';
    el.innerHTML = '<b>' + cardArtHTML(c, 'inline-art', '') + ' ' + c.name + '</b> ×' + n +
      ' <button data-n="1">⚔ ×1</button>' + (n > 5 ? '<button data-n="5">⚔ ×5</button>' : '') +
      (n > 1 ? '<button data-n="' + n + '">⚔ все (' + n + ')</button>' : '') + extra +
      '<span class="act-hint">или кликните по Алтарю</span>' + dupBtn + '<button id="autoBtn2">🪄 Стак</button>';
  }
  $('autoBtn2').onclick = autoStack;
  $('autoBtn2').title = 'Уложить карты из инвентаря в существующие стопки на поле';
  const sd = $('sellDupesBtn'); if (sd) sd.onclick = sellAllDupes;
  const s1 = $('sellThisBtn'); if (s1) s1.onclick = () => { sellDupesOf(pendingCard); computeIncome(); renderCollection(); updateHUD(); saveRun(); };
  el.querySelectorAll('[data-n]').forEach(b => b.onclick = () => addFighter(pendingCard, +b.dataset.n));
}
