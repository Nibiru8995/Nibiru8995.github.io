'use strict';
/*
РЕНДЕР: ГРИМУАР (render/grimuar_render.js)
Мета-экран между забегами (Меню → «Гримуар»):
СЛЕВА — ВЕЧНАЯ коллекция карт Призыва (по расам, с количествами);
СПРАВА — колоды (лимит 64 карты, дубликаты разрешены, у каждой
расы своя колода, переименование, активная колода);
СНИЗУ — ПРИЗЫВ: выбор расы, pity-гаранты, крутки за ДУШИ
(×1 = 1 душа, ×10 = 10 душ; бесплатные списываются первыми).
Выпавшие карты ложатся в коллекцию (не в инвентарь забега).
Изменения колоды вступают в силу со следующего забега.
 ============================================================*/

let grimSelDeckId = null;  // выбранная колода в правой панели
let grimRaceTab = null;  // раса фильтра коллекции (null = текущая gachaRace)

function openGrimuar() {
  /* Первая колода — стартовая (создастся, если колод ещё нет) */
  ensureStarterDeck('undead');
  if (!grimSelDeckId || !deckById(grimSelDeckId)) {
    const act = deckById(activeDeck[faction]) || decks[0];
    grimSelDeckId = act ? act.id : null;
  }
  if (!grimRaceTab || !epochFactions(epoch).includes(grimRaceTab)) grimRaceTab = gachaRace;
  mk('grimModal',
    '<div class="grim-head">' +
    '<h2 style="margin:0">📖 ГРИМУАР</h2>' +
    '<div class="grim-res">' +
    '<span class="res-chip grim-souls" title="Души — валюта Призыва. Источники: смена Эпохи, каждые 5 этажей Арены, контракты"><span class="soul-icon"></span><b id="grimSouls">0</b>&nbsp;Души</span>' +
    '<span class="grim-free" id="grimFree"></span>' +
    '</div>' +
    '<button class="mini" id="grimX" style="margin-left:auto">✕ Закрыть</button>' +
    '</div>' +
    '<div class="grim-note" id="grimNote"></div>' +
    '<div class="grim-body">' +
    '<div class="grim-col">' +
    '<div class="grim-col-title">КОЛЛЕКЦИЯ <small>вечная · клик — добавить в выбранную колоду</small></div>' +
    '<div class="grim-tabs" id="grimTabs"></div>' +
    '<div class="grim-cards" id="grimCards"></div>' +
    '<div class="grim-collstats" id="grimCollStats"></div>' +
    '</div>' +
    '<div class="grim-col">' +
    '<div class="grim-col-title">КОЛОДЫ <small>до ' + DECK_SIZE + ' карт · дубликаты разрешены · своя раса</small></div>' +
    '<div class="grim-decks" id="grimDecks"></div>' +
    '<div class="grim-deckview" id="grimDeckView"></div>' +
    '</div>' +
    '</div>' +
    '<div class="grim-gacha" id="grimGacha"></div>', 900);
  $('grimX').onclick = () => { close_('grimModal'); if (gameStarted) { updateHUD(); } };
  /* mk ставит inline max-width — перебиваем для широкого экрана Гримуара,
 открываем ДО рендера (рендер гвардится по.show)*/
  const card = $('grimModal').querySelector('.modal-card');
  card.style.maxWidth = '1080px';
  card.style.maxHeight = '94vh';
  card.style.overflow = 'hidden';
  open_('grimModal');
  renderGrimuar();
}

function grimUnlocked() { return epochFactions(epoch); }

function renderGrimuar() {
  if (!$('grimModal') || !$('grimModal').classList.contains('show')) return;
  renderGrimHead();
  renderGrimTabs();
  renderGrimCollection();
  renderGrimDecks();
  renderGrimDeckView();
  renderGrimGacha();
}

function renderGrimHead() {
  hudSet('gsouls', $('grimSouls'), 'text', fmt(souls));
  const free = $('grimFree');
  const txt = freeRolls > 0 ? 'Бесплатных круток: ' + freeRolls : 'Бесплатных круток нет — источники: вехи, контракты, Арена, Знамение';
  if (free.dataset.sig !== txt) { free.dataset.sig = txt; free.textContent = txt; }
  /* Примечание про применение изменений */
  const note = $('grimNote');
  const relicN = relicStash.length;
  let n = '';
  if (gameStarted) n += '⚠ Забег уже идёт: крутки пополнят коллекцию, а состав колоды применится со СЛЕДУЮЩЕГО забега. ';
  if (relicN) n += '⚒ В схроне реликвий: ' + relicN + ' — выдадутся на старте следующего забега. ';
  if (n !== (note.dataset.sig || '')) { note.dataset.sig = n; note.innerHTML = n || '&nbsp;'; note.style.display = n ? '' : 'none'; }
}

/* ---------------- Вкладки рас коллекции ---------------- */
function renderGrimTabs() {
  const el = $('grimTabs');
  const races = grimUnlocked();
  el.innerHTML = races.map(f => {
    const n = Object.keys(collection).filter(id => CARDS[id].faction === f).length;
    const tot = Object.keys(CARDS).filter(id => CARDS[id].faction === f).length;
    return '<div class="coll-tab' + (grimRaceTab === f ? ' active' : '') + '" data-r="' + f + '" title="Открыто типов карт: ' + n + ' / ' + tot + '">' +
      FACTION_INFO[f].name + ' <small>' + n + '/' + tot + '</small></div>';
  }).join('');
  el.querySelectorAll('[data-r]').forEach(t => t.onclick = () => { grimRaceTab = t.dataset.r; renderGrimuar(); });
}

/* ---------------- Коллекция (слева) ---------------- */
function renderGrimCollection() {
  const cont = $('grimCards');
  const deck = deckById(grimSelDeckId);
  const ids = Object.keys(collection).filter(id => CARDS[id].faction === grimRaceTab);
  ids.sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity) || a.localeCompare(b));
  if (!ids.length) {
    cont.innerHTML = '<div class="fighter-empty">Коллекция этой расы пуста.<br>Сделайте Призыв внизу экрана — карты ложатся сюда навсегда.</div>';
  } else {
    cont.innerHTML = ids.map(id => {
      const card = CARDS[id];
      const owned = collection[id];
      const inDeck = deck && deck.race === grimRaceTab ? deckUsedCount(deck, id) : 0;
      const canAdd = deck && deck.race === grimRaceTab && deck.cards.length < DECK_SIZE && inDeck < owned;
      return '<div class="coll-card star' + card.rarity + ' f-' + card.faction + (canAdd ? ' grim-addable' : ' grim-dim') + '" data-gid="' + id + '" style="--glow:' + rarityColor(card.rarity) + ';--cardBg:' + rarityBg(card.rarity) + (card.isBuilding ? ';border-style:double' : '') + '">' +
        cardArtHTML(card, 'coll-art', 'coll-glyph') +
        '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
        '<span class="count">×' + owned + '</span>' +
        (inDeck ? '<span class="grim-indeck" title="В выбранной колоде">в колоде: ' + inDeck + '</span>' : '') +
        '</div>';
    }).join('');
    cont.querySelectorAll('[data-gid]').forEach(el => {
      const id = el.dataset.gid;
      el.addEventListener('mouseenter', e => showCardTooltip(e, CARDS[id], CARDS[id].baseRate));
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);
      el.addEventListener('click', () => {
        const d = deckById(grimSelDeckId);
        if (!d) { toast('Сначала выберите или создайте колоду справа'); return; }
        if (d.race !== CARDS[id].faction) { toast('Эта колода расы «' + FACTION_INFO[d.race].name + '» — карты других рас в неё не входят'); return; }
        if (d.cards.length >= DECK_SIZE) { toast('В колоде уже ' + DECK_SIZE + ' карт — лимит'); return; }
        if (deckUsedCount(d, id) >= collectionFree(id)) { toast('Свободных копий «' + CARDS[id].name + '» больше нет — сделайте Призыв'); return; }
        addToDeck(d, id);
        sfx('click');
        renderGrimuar();
      });
    });
  }
  const ownedTypes = Object.keys(collection).length;
  const st = 'Типов карт в коллекции: ' + ownedTypes + ' из ' + Object.keys(CARDS).length +
    ' · копий всего: ' + fmt(Object.values(collection).reduce((a, b) => a + b, 0)) +
    (relicStash.length ? ' · ⚒ в схроне: ' + relicStash.length : '');
  if ($('grimCollStats').dataset.sig !== st) { $('grimCollStats').dataset.sig = st; $('grimCollStats').textContent = st; }
}

/* ---------------- Колоды (справа) ---------------- */
function renderGrimDecks() {
  const el = $('grimDecks');
  if (!decks.length) {
    el.innerHTML = '<div class="fighter-empty">Колод ещё нет — создайте первую ниже.</div>';
  } else {
    el.innerHTML = decks.map(d => {
      const act = activeDeck[d.race] === d.id;
      return '<div class="grim-deck-row' + (grimSelDeckId === d.id ? ' sel' : '') + (act ? ' active' : '') + '" data-d="' + d.id + '">' +
        '<span class="gdr-dot" style="background:' + FACTION_INFO[d.race].color + '" title="' + FACTION_INFO[d.race].name + '"></span>' +
        '<span class="gdr-name">' + d.name + '</span>' +
        '<span class="gdr-count">' + d.cards.length + '/' + DECK_SIZE + '</span>' +
        (act ? '<span class="gdr-star" title="Активная колода этой расы — выдаётся на старте забега">★</span>' : '') +
        '<button class="mini gdr-rename" title="Переименовать">✎</button>' +
        '<button class="mini gdr-del" title="Удалить колоду">🗑</button>' +
        '</div>';
    }).join('');
    el.querySelectorAll('[data-d]').forEach(row => {
      const id = row.dataset.d;
      row.addEventListener('click', e => {
        if (e.target.closest('.gdr-rename') || e.target.closest('.gdr-del')) return;
        grimSelDeckId = id; renderGrimuar();
      });
      row.querySelector('.gdr-rename').onclick = () => grimRenameDeck(id);
      row.querySelector('.gdr-del').onclick = () => {
        const d = deckById(id);
        ask('Удалить колоду «' + d.name + '»? Карты вернутся в коллекцию.', () => {
          deleteDeck(id);
          if (grimSelDeckId === id) grimSelDeckId = decks.length ? decks[0].id : null;
          renderGrimuar();
        });
      };
    });
  }
}

function grimRenameDeck(id) {
  const d = deckById(id); if (!d) return;
  const row = document.querySelector('.grim-deck-row[data-d="' + id + '"]');
  if (!row) return;
  const nameEl = row.querySelector('.gdr-name');
  const input = document.createElement('input');
  input.className = 'grim-rename-inp';
  input.maxLength = 24;
  input.value = d.name;
  nameEl.replaceWith(input);
  input.focus(); input.select();
  const done = () => {
    d.name = (input.value.trim() || d.name).slice(0, 24);
    saveMeta();
    renderGrimuar();
  };
  input.addEventListener('keydown', e => { if (e.key === 'Enter') done(); if (e.key === 'Escape') renderGrimuar(); });
  input.addEventListener('blur', done);
}

function renderGrimDeckView() {
  const el = $('grimDeckView');
  const d = deckById(grimSelDeckId);
  /* Форма создания новой колоды — всегда внизу панели */
  const races = grimUnlocked();
  let html = '<div class="grim-newdeck">' +
    '<select id="grimNewRace">' + races.map(f => '<option value="' + f + '"' + (f === grimRaceTab ? ' selected' : '') + '>' + FACTION_INFO[f].name + '</option>').join('') + '</select>' +
    '<input id="grimNewName" maxlength="24" placeholder="Имя новой колоды…">' +
    '<button class="mini" id="grimNewBtn">＋ Создать</button>' +
    '</div>';
  if (d) {
    const act = activeDeck[d.race] === d.id;
    html += '<div class="grim-deckhead">' +
      '<b>' + d.name + '</b> <span class="grim-race-badge" style="border-color:' + FACTION_INFO[d.race].color + ';color:' + FACTION_INFO[d.race].color + '">' + FACTION_INFO[d.race].name + '</span>' +
      '<span style="margin-left:auto">' + d.cards.length + '/' + DECK_SIZE + '</span>' +
      (act ? '<span class="gdr-star" title="Выдаётся на старте забега этой расы">★ активная</span>'
           : '<button class="mini" id="grimSetActive">★ Сделать активной</button>') +
      '</div>' +
      '<div class="grim-deckcards" id="grimDeckCards">';
    if (d.cards.length) {
      const counts = {};
      d.cards.forEach(id => counts[id] = (counts[id] || 0) + 1);
      html += Object.keys(counts).sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity) || a.localeCompare(b)).map(id => {
        const card = CARDS[id];
        return '<div class="coll-card star' + card.rarity + '" data-rm="' + id + '" style="--glow:' + rarityColor(card.rarity) + ';--cardBg:' + rarityBg(card.rarity) + '" title="' + card.name + ' — клик: убрать копию">' +
          cardArtHTML(card, 'coll-art', 'coll-glyph') +
          '<span class="count">×' + counts[id] + '</span></div>';
      }).join('');
    } else {
      html += '<div class="fighter-empty" style="grid-column:1/-1">Пусто. Кликайте карты коллекции слева — они лягут сюда.</div>';
    }
    html += '</div>' +
      '<div class="grim-deckhint">' + (gameStarted
        ? 'Состав применится со следующего забега этой расы.'
        : 'На старте забега этой расы вся колода выдаётся в инвентарь целиком.') + '</div>';
  } else {
    html += '<div class="fighter-empty">Выберите колоду выше или создайте новую.</div>';
  }
  el.innerHTML = html;
  $('grimNewBtn').onclick = () => {
    const race = $('grimNewRace').value;
    const nd = createDeck(race, $('grimNewName').value);
    if (nd) { grimSelDeckId = nd.id; grimRaceTab = race; sfx('click'); renderGrimuar(); }
  };
  const sa = $('grimSetActive');
  if (sa) sa.onclick = () => {
    activeDeck[d.race] = d.id;
    saveMeta(); sfx('milestone');
    toast('★ Колода «' + d.name + '» — активная для расы «' + FACTION_INFO[d.race].name + '»');
    renderGrimuar();
  };
  if (d) el.querySelectorAll('[data-rm]').forEach(el2 => {
    const id = el2.dataset.rm;
    el2.addEventListener('click', () => { removeFromDeck(d, id); renderGrimuar(); });
    el2.addEventListener('mouseenter', e => showCardTooltip(e, CARDS[id], CARDS[id].baseRate));
    el2.addEventListener('mousemove', moveTooltip);
    el2.addEventListener('mouseleave', hideTooltip);
  });
}

/* ---------------- ПРИЗЫВ (снизу) ---------------- */
function renderGrimGacha() {
  const el = $('grimGacha');
  const races = grimUnlocked();
  if (!races.includes(gachaRace)) gachaRace = races[0];
  const unlocked = unlockedRarities();
  let pity = 'Гаранты: ';
  if (unlocked.includes(5)) pity += '★4 через ' + Math.max(0, pity4Max() - pity4) + ' · ★5 через ' + Math.max(0, 80 - pity5);
  else if (unlocked.includes(4)) pity += '★4 через ' + Math.max(0, pity4Max() - pity4);
  else pity += '★3 через ' + Math.max(0, pity4Max() - pity4);
  el.innerHTML =
    '<div class="gg-left">' +
    '<span class="gg-title">ПРИЗЫВ</span>' +
    '<select id="grimRace">' + races.map(f => '<option value="' + f + '"' + (f === gachaRace ? ' selected' : '') + '>' + FACTION_INFO[f].name + '</option>').join('') + '</select>' +
    '<span class="gg-pity" title="Гарантия не сбрасывается никогда (вечная)">' + pity + '</span>' +
    (freeRolls > 0 ? '<span class="gg-free">бесплатных: ' + freeRolls + '</span>' : '') +
    '</div>' +
    '<div class="gg-btns">' +
    '<button class="roll-btn' + (freeRolls > 0 ? ' free-roll' : '') + '" id="grimRoll1">Крутка ×1<span class="cost">' + (freeRolls > 0 ? 'бесплатно' : '1 Душа') + '</span></button>' +
    '<button class="roll-btn" id="grimRoll10">Крутка ×10<span class="cost">' + Math.max(0, 10 - freeRolls) + ' Душ</span></button>' +
    '</div>';
  $('grimRace').onchange = e => { gachaRace = e.target.value; saveMeta(); renderGrimGacha(); };
  $('grimRoll1').onclick = () => grimDoRolls(1);
  $('grimRoll10').onclick = () => grimDoRolls(10);
  refreshGrimRollButtons();
}

function refreshGrimRollButtons() {
  const b1 = $('grimRoll1'), b10 = $('grimRoll10');
  if (!b1 || !b10) return;
  const cost10 = Math.max(0, 10 - freeRolls);
  b1.disabled = freeRolls <= 0 && souls < GRIM_ROLL_COST;
  b10.disabled = freeRolls <= 0 && souls < cost10;
  const c10 = b10.querySelector('.cost');
  c10.textContent = freeRolls >= 10 ? 'бесплатно' : cost10 + ' Душ';
  b10.classList.toggle('free-roll', freeRolls >= 10);
  b1.classList.toggle('free-roll', freeRolls > 0);
  if (b1.disabled !== undefined) {
    b1.querySelector('.cost').textContent = freeRolls > 0 ? 'бесплатно' : '1 Душа';
  }
}

function grimDoRolls(count) {
  const res = performGrimRolls(count);
  if (!res) { toast(SOUL_IMG + ' Не хватает Душ: 1 Душа = 1 крутка. Источники: смена Эпохи, каждые 5 этажей Арены, контракты'); return; }
  sfx('roll');
  if (res.free > 0) toast('🏅 Бесплатные крутки: ×' + res.free + (res.paid ? ' + за Души: ×' + res.paid : ''));
  grimShowResults(res);
  renderGrimuar();
  if (gameStarted && typeof checkContracts === 'function') checkContracts();
  checkAchievements();
}

/* ---------------- Окно результатов Призыва ----------------
 Карты уже в коллекции, реликвии — в схроне. Группировка + шоу редкостей.*/
function grimShowResults(res) {
  const cards = res.cards || [], relics = res.relics || [];
  mk('grimRollModal',
    '<div class="rarity-banner" id="grRarityBanner"></div>' +
    '<h2 id="grTitle">Призыв</h2>' +
    '<div class="multi-reveal" id="grReveal" style="max-height:46vh;overflow:auto"></div>' +
    '<div class="flavor">Карты — в вечную коллекцию Гримуара.' + (relics.length ? ' Реликвии — в схрон: выдадутся на старте следующего забега.' : '') + '</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="grOk">ПРИНЯТЬ</button></div>', 960);
  const cardEl = document.getElementById('grimRollModal').querySelector('.modal-card');
  playRarityEffect(cardEl, $('grRarityBanner'),
    relics.some(id => relicById(id).rarity === 5) || cards.some(id => CARDS[id].rarity === 5) ? 5 :
    relics.some(id => relicById(id).rarity === 4) || cards.some(id => CARDS[id].rarity === 4) ? 4 : 3);

  const counts = {};
  cards.forEach(id => counts[id] = (counts[id] || 0) + 1);
  const newSet = new Set(res.newTypes || []);
  const rows = Object.keys(counts)
    .sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity) || counts[b] - counts[a])
    .map(id => {
      const c = CARDS[id];
      return '<div class="multi-row">' +
        cardArtHTML(c, 'mr-art', 'mr-glyph') +
        '<span class="mr-name">' + c.name + ' <i>' + starsOf(c.rarity) + (newSet.has(id) ? ' · <b style="color:#8fc87f">НОВАЯ</b>' : '') + '</i></span>' +
        '<span class="mr-count">×' + counts[id] + '</span></div>';
    }).join('');
  const relRows = relics.map(id => {
    const r = relicById(id);
    return '<div class="multi-row relic">' + relicArtHTML(r, 'mr-art', '') +
      '<span class="mr-name">' + r.name + ' <i>' + '★'.repeat(r.rarity) + ' РЕЛИКВИЯ → схрон</i></span><span class="mr-count">×1</span></div>';
  }).join('');
  $('grReveal').innerHTML = (rows || '') + relRows;
  $('grTitle').textContent = 'Призыв: ' + (cards.length + relics.length) + ' карт' +
    (res.free ? ' · бесплатных ×' + res.free : '') + (res.paid ? ' · за Души ×' + res.paid : '');
  if (cards.length + relics.length === 1 && cards.length === 1) {
    const c = CARDS[cards[0]];
    $('grTitle').textContent = c.name + ' · ' + starsOf(c.rarity) + ' · ' + FACTION_INFO[c.faction].name;
  }
  $('grOk').onclick = () => close_('grimRollModal');
  open_('grimRollModal');
  const b = cardEl.getBoundingClientRect();
  if (cards.some(id => CARDS[id].rarity === 5)) { fxBeams(b.left + b.width / 2, b.top + b.height / 2); fxConfetti(70); }
}
