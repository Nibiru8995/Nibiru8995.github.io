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
let grimSubTab = 'all';     // подвкладка подфракций (подрас) — только у нежить
let grimTypeTab = 'all';    // подвкладка типов (у нежити — cat, у остальных — роль)

/* Ключ типа карты для подвкладки: здания — отдельный тип, у нежити — категория,
   у остальных фракций — роль */
function grimTypeKey(card) {
  if (card.isBuilding) return 'bld';
  return card.cat || ('r_' + card.role);
}
const GRIM_TYPE_LABELS = {
  bld: 'Здания',
  thrall: 'Скованные', bearer: 'Несущие волю', necro: 'Некроманты', lord: 'Владыки',
  r_builder: 'Строители', r_amplifier: 'Усилители', r_anchor: 'Якоря', r_healer: 'Поддержка',
  r_burst: 'Взрывные', r_predator: 'Хищники', r_flora: 'Флора', r_scav: 'Падальщики'
};
/* v1.8.0: возврат к выбору колоды (окно выбора расы на Эпоху → «Собрать в Гримуаре») */
let grimPickReturn = null;

/* Квадратные карты коллекции: высота авто-рядов грида = ширине колонки.
   CSS (aspect-ratio / padding-top:100%) здесь не работает — браузер не
   учитывает эти размеры при раскладке авто-рядов, ряды сжимаются и
   карты наезжают друг на друга. Поэтому явные px через ResizeObserver. */
let grimCardsRO = null;
function grimSquareRows() {
  const gc = $('grimCards'); if (!gc) return;
  const card = gc.querySelector('.coll-card');
  if (card && card.offsetWidth > 0) gc.style.gridAutoRows = card.offsetWidth + 'px';
}

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
    '</div>' +
    '<button class="mini" id="grimX" style="margin-left:auto">✕ Закрыть</button>' +
    '</div>' +
    '<div class="grim-body">' +
    '<div class="grim-col">' +
    '<div class="grim-col-title">КОЛЛЕКЦИЯ</div>' +
    '<div class="grim-tabs" id="grimTabs"></div>' +
    '<div class="grim-subtabs" id="grimSubTabs"></div>' +
    '<div class="grim-subtabs" id="grimTypeTabs"></div>' +
    '<div class="grim-cards" id="grimCards"></div>' +
    '<div class="grim-collstats" id="grimCollStats"></div>' +
    '</div>' +
    '<div class="grim-col">' +
    '<div class="grim-col-title">КОЛОДЫ</div>' +
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
  if (!grimCardsRO) {
    grimCardsRO = new ResizeObserver(() => grimSquareRows());
    grimCardsRO.observe(document.documentElement);
  }
  renderGrimuar();
}

function grimUnlocked() { return availFactions(); }

function renderGrimuar() {
  if (!$('grimModal') || !$('grimModal').classList.contains('show')) return;
  renderGrimHead();
  renderGrimTabs();
  renderGrimSubTabs();
  renderGrimCollection();
  renderGrimDecks();
  renderGrimDeckView();
  renderGrimGacha();
}

function renderGrimHead() {
  hudSet('gsouls', $('grimSouls'), 'text', fmt(souls));
}

/* ---------------- Вкладки рас коллекции ---------------- */
function renderGrimTabs() {
  const el = $('grimTabs');
  const races = grimUnlocked();
  el.innerHTML = races.map(f => {
    const n = Object.keys(collection).filter(id => CARDS[id].faction === f).length;
    const tot = Object.keys(CARDS).filter(id => CARDS[id].faction === f).length;
    return '<div class="gtab' + (grimRaceTab === f ? ' active' : '') + '" data-r="' + f + '" title="Открыто типов карт: ' + n + ' / ' + tot + '">' +
      FACTION_INFO[f].name + ' <small>' + n + '/' + tot + '</small></div>';
  }).join('');
  el.querySelectorAll('[data-r]').forEach(t => t.onclick = () => { grimRaceTab = t.dataset.r; grimSubTab = 'all'; grimTypeTab = 'all'; renderGrimuar(); });
}

/* ---------------- Подвкладки: подфракции (подрасы) и типы ---------------- */
function renderGrimSubTabs() {
  const subEl = $('grimSubTabs'), typeEl = $('grimTypeTabs');
  if (!subEl || !typeEl) return;
  const all = Object.keys(CARDS).map(id => CARDS[id]).filter(c => c.faction === grimRaceTab);
  /* Подфракции — только если у фракции они есть (сейчас — нежить) */
  const subs = [];
  all.forEach(c => { if (c.subrace && !subs.includes(c.subrace)) subs.push(c.subrace); });
  if (grimSubTab !== 'all' && !subs.includes(grimSubTab)) grimSubTab = 'all';
  subEl.style.display = subs.length ? '' : 'none';
  subEl.innerHTML = ['all'].concat(subs).map(s =>
    '<div class="gsubtab' + (grimSubTab === s ? ' active' : '') + '" data-s="' + s + '">' + (s === 'all' ? 'Все' : (SUBRACE_INFO[s] || s)) + '</div>').join('');
  subEl.querySelectorAll('[data-s]').forEach(t => t.onclick = () => { grimSubTab = t.dataset.s; renderGrimuar(); });
  /* Типы — у нежити категории реворка, у остальных — роли */
  const types = [];
  all.forEach(c => { const k = grimTypeKey(c); if (!types.includes(k)) types.push(k); });
  if (grimTypeTab !== 'all' && !types.includes(grimTypeTab)) grimTypeTab = 'all';
  typeEl.innerHTML = ['all'].concat(types).map(t =>
    '<div class="gsubtab' + (grimTypeTab === t ? ' active' : '') + '" data-t="' + t + '">' + (t === 'all' ? 'Все' : (GRIM_TYPE_LABELS[t] || t)) + '</div>').join('');
  typeEl.querySelectorAll('[data-t]').forEach(t => t.onclick = () => { grimTypeTab = t.dataset.t; renderGrimuar(); });
}

/* ---------------- Коллекция (слева) ---------------- */
function renderGrimCollection() {
  const cont = $('grimCards');
  const deck = deckById(grimSelDeckId);
  const filtered = grimSubTab !== 'all' || grimTypeTab !== 'all';
  const ids = Object.keys(collection).filter(id => {
    const cd = CARDS[id];
    if (cd.faction !== grimRaceTab) return false;
    if (grimSubTab !== 'all' && cd.subrace !== grimSubTab) return false;
    if (grimTypeTab !== 'all' && grimTypeKey(cd) !== grimTypeTab) return false;
    return true;
  });
  ids.sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity) || a.localeCompare(b));
  if (!ids.length) {
    const anyInFaction = Object.keys(collection).some(id => CARDS[id].faction === grimRaceTab);
    cont.innerHTML = '<div class="fighter-empty">' + (anyInFaction && filtered
      ? 'Под текущие подвкладки ничего не попало.'
      : 'Коллекция этой расы пуста.<br>Сделайте Призыв внизу экрана — карты ложатся сюда навсегда.') + '</div>';
  } else {
    cont.innerHTML = ids.map(id => {
      const card = CARDS[id];
      const owned = collection[id];
      const inDeck = deck && deck.race === grimRaceTab ? deckUsedCount(deck, id) : 0;
      const canAdd = deck && deck.race === grimRaceTab && deckTotal(deck) < deckCap() && inDeck < owned;
      return '<div class="coll-card star' + card.rarity + ' f-' + card.faction + (canAdd ? ' grim-addable' : ' grim-dim') + '" data-gid="' + id + '" style="--glow:' + rarityColor(card.rarity) + ';--cardBg:' + rarityBg(card.rarity) + (card.isBuilding ? ';border-style:double' : '') + '">' +
        cardArtHTML(card, 'coll-art', 'coll-glyph') +
        '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
        '<span class="count">×' + owned + '</span>' +
        (inDeck ? '<span class="grim-indeck" title="В выбранной колоде">в колоде: ' + inDeck + '</span>' : '') +
        '</div>';
    }).join('');
    cont.querySelectorAll('[data-gid]').forEach(el => {
      const id = el.dataset.gid;
      el.addEventListener('mouseenter', e => grimShowTooltip(e, CARDS[id]));
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);
      el.addEventListener('click', () => {
        const d = deckById(grimSelDeckId);
        if (!d) { toast('Сначала выберите или создайте колоду справа'); return; }
        if (d.race !== CARDS[id].faction) { toast('Эта колода расы «' + FACTION_INFO[d.race].name + '» — карты других рас в неё не входят'); return; }
        if (deckTotal(d) >= deckCap()) { toast('В колоде уже ' + deckCap() + ' копий — лимит'); return; }
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
  grimSquareRows();
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
        '<span class="gdr-count">' + deckTotal(d) + '/' + deckCap() + '</span>' +
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

/* Создание колоды — ОДНА кнопка открывает модальную форму: имя + фракция */
function grimHexA(hex, a) {
  const v = parseInt(hex.slice(1), 16);
  return 'rgba(' + ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255) + ',' + a + ')';
}
function openGrimNewDeckModal() {
  const races = grimUnlocked();
  let selRace = races.includes(grimRaceTab) ? grimRaceTab : races[0];
  mkFresh('grimNewDeckModal',
    '<h2 style="margin:2px 0 8px">Новая колода</h2>' +
    '<div class="grim-ndf">' +
    '<label class="grim-ndf-l" for="grimNdName">Имя колоды</label>' +
    '<input id="grimNdName" maxlength="24" placeholder="Например: Кости и Туман…">' +
    '<label class="grim-ndf-l">Фракция</label>' +
    '<div class="grim-ndf-races" id="grimNdRaces">' +
    races.map(f => '<div class="grim-ndf-race' + (f === selRace ? ' sel' : '') + '" data-f="' + f + '" style="border-color:' + FACTION_INFO[f].color + ';color:' + FACTION_INFO[f].color + '">' +
      '<span class="gdr-dot" style="background:' + FACTION_INFO[f].color + '"></span>' + FACTION_INFO[f].name + '</div>').join('') +
    '</div>' +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="grimNdCancel">Отмена</button><button class="btn btn-take" id="grimNdOk">Создать</button></div>', 950);
  const sel = f => {
    selRace = f;
    $('grimNdRaces').querySelectorAll('.grim-ndf-race').forEach(el => el.classList.toggle('sel', el.dataset.f === f));
  };
  $('grimNdRaces').querySelectorAll('.grim-ndf-race').forEach(el => el.onclick = () => { sel(el.dataset.f); sfx('click'); });
  $('grimNdCancel').onclick = () => close_('grimNewDeckModal');
  $('grimNdOk').onclick = () => {
    const nd = createDeck(selRace, $('grimNdName').value);
    if (nd) {
      close_('grimNewDeckModal');
      grimSelDeckId = nd.id; grimRaceTab = selRace;
      sfx('milestone');
      toast('Колода «' + nd.name + '» создана — наполняйте её картами коллекции');
      renderGrimuar();
    }
  };
  $('grimNdName').addEventListener('keydown', e => { if (e.key === 'Enter') $('grimNdOk').click(); });
  open_('grimNewDeckModal');
  $('grimNdName').focus();
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
  /* Создание колоды — одна кнопка, форма открывается модалкой */
  let html = '<div class="grim-newdeck"><button class="mini grim-newdeck-btn" id="grimNewBtn">＋ Создать колоду</button></div>';
  if (d) {
    const act = activeDeck[d.race] === d.id;
    html += '<div class="grim-deckhead">' +
      '<b>' + d.name + '</b> <span class="grim-race-badge" style="border-color:' + FACTION_INFO[d.race].color + ';color:' + FACTION_INFO[d.race].color + '">' + FACTION_INFO[d.race].name + '</span>' +
      '<span style="margin-left:auto">' + deckTotal(d) + '/' + deckCap() + '</span>' +
      (act ? '' : '<button class="mini" id="grimSetActive">★ Сделать активной</button>') +
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
          '<div class="deck-info"><span class="deck-name">' + card.name + ' <i>' + starsOf(card.rarity) + '</i></span>' +
          '<span class="deck-sub">' + FACTION_INFO[card.faction].name + (n >= dsm ? ' · стак полон ×' + n : '') + '</span></div>' +
          (n > 1 ? '<span class="deck-count">×' + n + '</span>' : '<span class="deck-count dim">×1</span>') +
          (canStack ? '<button class="deck-up" data-up="' + idx + '" title="Застакать ЭТУ копию: +1 из коллекции (×' + (n + 1) + ')">▲</button>' : '') +
          '</div>';
      }).join('');
    } else {
      html += '<div class="fighter-empty" style="grid-column:1/-1">Пусто. Кликайте карты коллекции слева — каждая ляжет сюда отдельным блоком (дубликаты разрешены).</div>';
    }
    html += '</div>';
  } else {
    html += '<div class="fighter-empty">Выберите колоду выше или создайте новую.</div>';
  }
  el.innerHTML = html;
  $('grimNewBtn').onclick = openGrimNewDeckModal;
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
    el2.addEventListener('mouseenter', e => grimShowTooltip(e, CARDS[d.cards[idx].id]));
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
/* Призыв — блок на каждую доступную фракцию: линия-разделитель с именем,
   под ней «1 призыв» и «10 призывов». Стиль блока — в цветах фракции;
   расу Призыва задаёт нажатая кнопка. Гаранты — в подсказке блока. */
function renderGrimGacha() {
  const el = $('grimGacha');
  const races = grimUnlocked();
  if (!races.includes(gachaRace)) gachaRace = races[0];
  const unlocked = unlockedRarities();
  let pity = 'Гаранты (вечные): ';
  if (unlocked.includes(5)) pity += '★4 через ' + Math.max(0, pity4Max() - pity4) + ' · ★5 через ' + Math.max(0, 80 - pity5);
  else if (unlocked.includes(4)) pity += '★4 через ' + Math.max(0, pity4Max() - pity4);
  else pity += '★3 через ' + Math.max(0, pity4Max() - pity4);
  el.innerHTML = races.map(f => {
    const col = FACTION_INFO[f].color;
    return '<div class="gg-block" title="' + pity + '" style="--fc:' + col +
      ';--fc-brd:' + grimHexA(col, .5) + ';--fc-bg:' + grimHexA(col, .07) +
      ';--fc-line:' + grimHexA(col, .55) + '">' +
      '<div class="gg-divider"><span>' + FACTION_INFO[f].name.toLowerCase() + '</span></div>' +
      '<div class="gg-btns">' +
      '<button class="roll-btn gg-roll" data-race="' + f + '" data-n="1">1 призыв<span class="cost">1 Душа</span></button>' +
      '<button class="roll-btn gg-roll" data-race="' + f + '" data-n="10">10 призывов<span class="cost">10 Душ</span></button>' +
      '</div></div>';
  }).join('');
  el.querySelectorAll('.gg-roll').forEach(b => b.onclick = () => {
    gachaRace = b.dataset.race; saveMeta(); grimDoRolls(+b.dataset.n);
  });
  refreshGrimRollButtons();
}

function refreshGrimRollButtons() {
  /* бесплатных круток нет — только Души */
  document.querySelectorAll('#grimGacha .gg-roll').forEach(b => {
    b.disabled = souls < (+b.dataset.n) * GRIM_ROLL_COST;
  });
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
