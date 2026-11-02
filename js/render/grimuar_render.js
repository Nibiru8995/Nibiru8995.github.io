'use strict';
/* ============================================================
   РЕНДЕР: ГРИМУАР (render/grimuar_render.js) — v1.7.0 «Плата Душами»
   Мета-экран между забегами (Меню → «Гримуар»):
   СЛЕВА  — ВЕЧНАЯ коллекция карт Призыва (по расам, с количествами);
   СПРАВА — колоды (лимит 64 карты, дубликаты разрешены, у каждой
            расы своя колода, переименование, активная колода).
            v1.7.0: карты колоды — СПИСОК ПРЯМОУГОЛЬНЫХ БЛОКОВ;
            у карты, которую можно застакать дубликатом из коллекции,
            ФИОЛЕТОВАЯ СТРЕЛКА ▲ (стаки до DECK_STACK_MAX = 5).
   СНИЗУ  — ПРИЗЫВ: выбор расы, pity-гаранты, крутки ЗА ДУШИ
            (×1 = 1 душа, ×10 = 10 душ; v1.7.0: бесплатных круток НЕТ).
   Выпавшие карты ложатся в коллекцию (не в инвентарь забега).
   Изменения колоды вступают в силу со следующего забега; застакованная
   карта ставится на грид сразу стопкой ×N (logic/grid.js).
   ============================================================ */

let grimSelDeckId = null;   // выбранная колода в правой панели
let grimRaceTab = null;     // раса фильтра коллекции (null = текущая gachaRace)
/* v1.8.0: возврат к выбору колоды (окно выбора расы на Эпоху → «Собрать в Гримуаре») */
let grimPickReturn = null;

function openGrimuar() {
  /* Первая колода — стартовая (создастся, если колод ещё нет) */
  ensureStarterDeck('undead');
  if (!grimSelDeckId || !deckById(grimSelDeckId)) {
    const act = deckById(activeDeck[faction]) || decks[0];
    grimSelDeckId = act ? act.id : null;
  }
  if (!grimRaceTab || !availFactions().includes(grimRaceTab)) grimRaceTab = gachaRace;
  mk('grimModal',
    '<div class="grim-head">' +
    '<h2 style="margin:0">📖 ГРИМУАР</h2>' +
    '<div class="grim-res">' +
    '<span class="res-chip grim-souls" title="Души — валюта Призыва. Источники: старт 30, смена Эпохи, каждые 5 этажей Арены, контракты"><span class="soul-icon"></span><b id="grimSouls">0</b>&nbsp;Души</span>' +
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
    '<div class="grim-col-title">КОЛОДЫ <small>до ' + DECK_SIZE + ' копий · стак до ×' + deckStackMax() + ' · своя раса</small></div>' +
    '<div class="grim-decks" id="grimDecks"></div>' +
    '<div class="grim-deckview" id="grimDeckView"></div>' +
    '</div>' +
    '</div>' +
    '<div class="grim-gacha" id="grimGacha"></div>', 900);
  $('grimX').onclick = () => { close_('grimModal'); if (gameStarted) { updateHUD(); } const back = grimPickReturn; grimPickReturn = null; if (back) back(); };
  /* mk() ставит inline max-width — перебиваем для широкого экрана Гримуара,
     открываем ДО рендера (рендер гвардится по .show) */
  const card = $('grimModal').querySelector('.modal-card');
  card.style.maxWidth = '1080px';
  card.style.maxHeight = '94vh';
  card.style.overflow = 'hidden';
  open_('grimModal');
  renderGrimuar();
}

function grimUnlocked() { return availFactions(); }

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
  /* v1.8.0: Души — валюта Призыва И Улучшений */
  const txt = '1 Душа = 1 крутка · Души также тратятся в «Улучшениях» · источники: старт 30, смена Эпохи, каждые 5 этажей Арены, контракты';
  if (free.dataset.sig !== txt) { free.dataset.sig = txt; free.textContent = txt; }
  /* Примечание про применение изменений */
  const note = $('grimNote');
  let n = '';
  if (gameStarted) n += '⚠ Забег уже идёт: крутки пополнят коллекцию, а состав колоды применится со СЛЕДУЮЩЕГО забега. ';
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
      const canAdd = deck && deck.race === grimRaceTab && deckTotal(deck) < DECK_SIZE && inDeck < owned;
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
        if (deckTotal(d) >= DECK_SIZE) { toast('В колоде уже ' + DECK_SIZE + ' копий — лимит'); return; }
        if (deckUsedCount(d, id) >= collectionFree(id)) { toast('Свободных копий «' + CARDS[id].name + '» больше нет — сделайте Призыв'); return; }
        addToDeck(d, id); /* v1.8.0: клик — добавить как ДУБЛИКАТ (новый блок) */
        sfx('click');
        renderGrimuar();
      });
    });
  }
  const ownedTypes = Object.keys(collection).length;
  const st = 'Типов карт в коллекции: ' + ownedTypes + ' из ' + Object.keys(CARDS).length +
    ' · копий всего: ' + fmt(Object.values(collection).reduce((a, b) => a + b, 0));
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
        '<span class="gdr-count">' + deckTotal(d) + '/' + DECK_SIZE + '</span>' +
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
      '<span style="margin-left:auto">' + deckTotal(d) + '/' + DECK_SIZE + '</span>' +
      (act ? '<span class="gdr-star" title="Выдаётся на старте забега этой расы">★ активная</span>'
           : '<button class="mini" id="grimSetActive">★ Сделать активной</button>') +
      '</div>' +
      '<div class="deck-list" id="grimDeckCards">';
    if (d.cards.length) {
      /* v1.8.0: колода — СПИСОК ПРЯМОУГОЛЬНЫХ БЛОКОВ, КАЖДАЯ КОПИЯ —
         ОТДЕЛЬНАЯ ЗАПИСЬ: клик по карте коллекции добавляет ДУБЛИКАТ
         (новый блок ×1), а клик по ФИОЛЕТОВОЙ СТРЕЛКЕ ▲ стакаает
         ИМЕННО ТУ запись, на которую кликнули (+1 копия из коллекции,
         до deckStackMax()). На старте забега запись ×N станет юнитом ×N. */
      const dsm = deckStackMax();
      html += d.cards.map((en, idx) => {
        const card = CARDS[en.id];
        const n = en.n || 1;
        const canStack = canStackEntry(d, idx);
        return '<div class="deck-row star' + card.rarity + '" data-rm="' + idx + '" style="--glow:' + rarityColor(card.rarity) + ';--cardBg:' + rarityBg(card.rarity) + '" title="' + card.name + ' — клик: убрать копию из колоды">' +
          cardArtHTML(card, 'deck-art', 'deck-glyph') +
          '<div class="deck-info"><span class="deck-name">' + card.name + ' <i>' + starsOf(card.rarity) + (card.isBuilding ? ' · постройка' : '') + '</i></span>' +
          '<span class="deck-sub">' + FACTION_INFO[card.faction].name + (n >= dsm ? ' · стак полон ×' + n : '') + '</span></div>' +
          (n > 1 ? '<span class="deck-count">×' + n + '</span>' : '<span class="deck-count dim">×1</span>') +
          (canStack ? '<button class="deck-up" data-up="' + idx + '" title="Застакать ЭТУ копию: +1 из коллекции (×' + (n + 1) + ')">▲</button>' : '') +
          '</div>';
      }).join('');
    } else {
      html += '<div class="fighter-empty" style="grid-column:1/-1">Пусто. Кликайте карты коллекции слева — каждая ляжет сюда отдельным блоком (дубликаты разрешены).</div>';
    }
    html += '</div>' +
      '<div class="grim-deckhint">' +
      'Клик по карте коллекции — добавить копию как дубликат (новый блок). ' +
      '▲ у блока — застакать ИМЕННО ЭТУ копию из коллекции (до ×' + deckStackMax() + '): на старте забега она встанет на грид ГОТОВОЙ стопкой ×N. ' +
      'Клик по блоку — убрать копию. ' + (gameStarted
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
    const idx = +el2.dataset.rm;
    el2.addEventListener('click', e => {
      if (e.target.closest('.deck-up')) return; /* стрелка — свой обработчик */
      removeFromDeck(d, idx); renderGrimuar();
    });
    el2.addEventListener('mouseenter', e => showCardTooltip(e, CARDS[d.cards[idx].id], CARDS[d.cards[idx].id].baseRate));
    el2.addEventListener('mousemove', moveTooltip);
    el2.addEventListener('mouseleave', hideTooltip);
  });
  if (d) el.querySelectorAll('[data-up]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const idx = +btn.dataset.up;
      if (!canStackEntry(d, idx)) return;
      if (!stackUpEntry(d, idx)) { toast('Свободных копий «' + CARDS[d.cards[idx].id].name + '» больше нет — сделайте Призыв'); return; }
      sfx('place');
      renderGrimuar();
    });
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
    '<span class="gg-free">1 Душа = 1 крутка · бесплатных круток нет</span>' +
    '</div>' +
    '<div class="gg-btns">' +
    '<button class="roll-btn" id="grimRoll1">Крутка ×1<span class="cost">1 Душа</span></button>' +
    '<button class="roll-btn" id="grimRoll10">Крутка ×10<span class="cost">10 Душ</span></button>' +
    '</div>';
  $('grimRace').onchange = e => { gachaRace = e.target.value; saveMeta(); renderGrimGacha(); };
  $('grimRoll1').onclick = () => grimDoRolls(1);
  $('grimRoll10').onclick = () => grimDoRolls(10);
  refreshGrimRollButtons();
}

function refreshGrimRollButtons() {
  const b1 = $('grimRoll1'), b10 = $('grimRoll10');
  if (!b1 || !b10) return;
  /* v1.7.0: бесплатных круток нет — только Души */
  b1.disabled = souls < GRIM_ROLL_COST;
  b10.disabled = souls < 10 * GRIM_ROLL_COST;
}

function grimDoRolls(count) {
  const res = performGrimRolls(count);
  if (!res) { toast(SOUL_IMG + ' Не хватает Душ: 1 Душа = 1 крутка. Источники: старт 30, смена Эпохи, каждые 5 этажей Арены, контракты'); return; }
  sfx('roll');
  grimShowResults(res);
  renderGrimuar();
  if (gameStarted && typeof checkContracts === 'function') checkContracts();
  checkAchievements();
}

/* ---------------- Окно результатов Призыва ----------------
   Карты уже в коллекции. Группировка + шоу редкостей.
   v1.8.0: реликвий в Призыве больше нет. */
function grimShowResults(res) {
  const cards = res.cards || [];
  mk('grimRollModal',
    '<div class="rarity-banner" id="grRarityBanner"></div>' +
    '<h2 id="grTitle">Призыв</h2>' +
    '<div class="multi-reveal" id="grReveal" style="max-height:46vh;overflow:auto"></div>' +
    '<div class="flavor">Карты — в вечную коллекцию Гримуара. Реликвий в Призыве больше нет — источник появится позже.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="grOk">ПРИНЯТЬ</button></div>', 960);
  const cardEl = document.getElementById('grimRollModal').querySelector('.modal-card');
  playRarityEffect(cardEl, $('grRarityBanner'),
    cards.some(id => CARDS[id].rarity === 5) ? 5 : cards.some(id => CARDS[id].rarity === 4) ? 4 : 3);

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
  $('grReveal').innerHTML = rows;
  $('grTitle').textContent = 'Призыв: ' + cards.length + ' карт · за Души ×' + res.paid;
  if (cards.length === 1) {
    const c = CARDS[cards[0]];
    $('grTitle').textContent = c.name + ' · ' + starsOf(c.rarity) + ' · ' + FACTION_INFO[c.faction].name;
  }
  $('grOk').onclick = () => close_('grimRollModal');
  open_('grimRollModal');
  const b = cardEl.getBoundingClientRect();
  if (cards.some(id => CARDS[id].rarity === 5)) { fxBeams(b.left + b.width / 2, b.top + b.height / 2); fxConfetti(70); }
}
