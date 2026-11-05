'use strict';
/*
РЕНДЕР: ГРИД / АЛТАРЬ (render/grid_render.js)
Отрисовка ТОЛЬКО открытых клеток : закрытая зона
не существует для игрока, пока не куплено расширение Алтаря.
Размер сетки — только нечётный (3×3 → 5×5 → 7×7 → 9×9).
Карты (эмодзи), бейджи дохода, SVG-линии синергий и цепей.
 ============================================================*/

const gridEl = document.getElementById('grid');
const synergySvg = document.getElementById('synergySvg');
const tooltip = document.getElementById('tooltip');
const banner = document.getElementById('selectionBanner');

/* Смещение открытого квадрата внутри 9×9-матрицы данных */
function gridStart() { return Math.floor((GRID_SIZE - playableSize) / 2); }

/* Подгонка сетки под текущий размер: клетки крупнее на малом Алтаре.
размер считается от ВЫСОТЫ экрана — интерфейс целиком
 помещается во вьюпорт без прокрутки страницы.*/
function applyGridMetrics() {
  const n = playableSize;
  const cap = { 3: 82, 5: 74, 7: 62, 9: 52 }[n] || 52;
  const narrow = window.innerWidth <= 1100;
  const vhPad = narrow ? 9999 : 300, vwPad = narrow ? 40 : 560;
  const sizeExpr = 'min(' + cap + 'px, max(40px, calc((100vh - ' + vhPad + 'px) / ' + n + ')), max(40px, calc((100vw - ' + vwPad + 'px) / ' + n + ')))';
  const wrap = $('gridWrap');
  if (wrap) wrap.style.setProperty('--cell-size', sizeExpr);
  /* Резец Тьмы: слоты столбов — ровно те же квадраты, что клетки грида */
  const rsr = $('relicSlotRow');
  if (rsr) rsr.style.setProperty('--cell-size', sizeExpr);
  gridEl.style.gridTemplateColumns = 'repeat(' + n + ', var(--cell-size))';
  gridEl.style.gridTemplateRows = 'repeat(' + n + ', var(--cell-size))';
}

/* Карты/здания, чья механика действует на ОКРУЖЕНИЕ: радиус ауры.
Радиусы зданий — BUILDING_AURA (data/buildings.js), карт — здесь.
Аура подсвечивает ВСЕ клетки зоны — включая пустые.
туман зоны СПОКОЙНЫЙ и ПОСТОЯННЫЙ (без пульсаций и
дыхания) — мигание зоны читалось как случайный туман на чужих
 картах. Зона — статичный маркер области эффекта здания.*/
function buildAuraMap() {
  const map = {};
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const R = auraRadiusOf(it.cardId); if (!R) continue;
    const color = FACTION_INFO[CARDS[it.cardId].faction].color;
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) > R) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (!playableMask[nr] || !playableMask[nr][nc]) continue; /* закрытые клетки не подсвечиваем */
      const k = nr + ',' + nc;
      const prev = map[k];
      map[k] = { color: prev ? prev.color : color, big: R >= 2 || (prev && prev.big) };
    }
  }
  /* v1.9.0 ауры НЕКРОМАНТОВ (u23 Туман — холодная бирюза, u35 Обет — глухой багрец):
     ТИХАЯ подсветка (класс aura-necro, без миганий) — решение В1: видно, но не мешает. */
  const necroAura = { u23: { R: 2, color: '#7fb8b0' }, u35: { R: 2, color: '#b06070' } };
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const na = necroAura[it.cardId]; if (!na) continue;
    for (let dr = -na.R; dr <= na.R; dr++) for (let dc = -na.R; dc <= na.R; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (!playableMask[nr] || !playableMask[nr][nc]) continue;
      const k = nr + ',' + nc;
      const prev = map[k];
      if (prev) continue; /* аура здания важнее — не дублируем подсветку */
      map[k] = { color: na.color, big: false, necro: true };
    }
  }
  /* v1.12.0 ДИКИЕ УГОДЬЯ: зоны зверей — тихая зелёная заливка (радиусы
     берутся из BEAST_GROUNDS.zones — с учётом Тотема/Солончика/Хозяина Троп).
     Ауры Тотемов — в той же заливке (отдельные кольца не рисуем). */
  if (FACTION_INFO[faction].mechanic === 'grounds' && typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS.zones) {
    const bcol = FACTION_INFO.beast.color;
    BEAST_GROUNDS.zones.forEach(z => {
      for (let dr = -z.rad; dr <= z.rad; dr++) for (let dc = -z.rad; dc <= z.rad; dc++) {
        const nr = z.r + dr, nc = z.c + dc;
        if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
        if (!playableMask[nr] || !playableMask[nr][nc]) continue;
        const k = nr + ',' + nc;
        if (map[k]) continue; /* аура здания важнее */
        map[k] = { color: bcol, big: z.rad >= 2, grounds: true };
      }
    });
  }
  return map;
}

function buildGrid() {
  applyGridMetrics();
  gridEl.innerHTML = '';
  const n = playableSize, st = gridStart();
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = document.createElement('div');
    cell.className = 'cell playable';
    cell.dataset.r = r; cell.dataset.c = c;
    /* onclick назначается ОДИН раз — r/c клетки постоянны,
 пока её не пересоздаст buildGrid (смена размера Алтаря)*/
    cell.onclick = () => onCellClick(r, c);
    gridEl.appendChild(cell);
  }
  renderGrid();
}

/* ================= СЛОТЫ РЕЛИКВИЙ НАД АЛТАРЁМ =================
Отдельная панель слева УБРАНА (перегружала интерфейс). Вместо неё
компактный ряд слотов прямо над гридом: столб ↔ слот, клик — вставить/снять.
Резец Тьмы: подпись вынесена ИЗ ряда, клетки — строгие квадраты того же
размера, что и клетки грида (1:1 по колонкам Алтаря).
Реликвии культистов — глобальные (ритуальные): столб не важен.
 Открывается на Эпохе 2 (applyFeatureLocks).*/
function renderRelicSlots() {
  const row = $('relicSlotRow');
  if (!row) return;
  if (!RELICS_OWNED.size) { if (row.style.display !== 'none') row.style.display = 'none'; return; }
  row.style.display = '';
  const st = gridStart();
  /* сигнатура для мемоиза: какие столбы заняты чем */
  const cultGlobal = FACTION_INFO[faction].mechanic === 'formation';
  const sig = playableSize + '|' + st + '|' + cultGlobal + '|' + JSON.stringify(relicSlots);
  if (row.dataset.sig === sig) return;
  row.dataset.sig = sig;
  let slots = '';
  for (let dc = 0; dc < playableSize; dc++) {
    const c = st + dc;
    const rel = relicAtCol(c);
    if (rel) {
      slots += '<div class="rsr-slot filled" data-col="' + c + '" style="--relicC:' + RELIC_RARITY_COLOR(rel.rarity) + '" title="' + rel.name + ' — клик: снять\n✅ ' + rel.rule + '\n❌ ' + (rel.curse || '') + '">' +
        relicArtHTML(rel, 'rsr-img', '') + '</div>';
    } else {
      slots += '<div class="rsr-slot empty" data-col="' + c + '" title="Пустой столб — клик: вставить реликвию"><span>+</span></div>';
    }
  }
  row.innerHTML = '<div class="rsr-grid">' + slots + '</div>';
  const g = row.querySelector('.rsr-grid');
  g.style.gridTemplateColumns = 'repeat(' + playableSize + ', var(--cell-size))';
  row.querySelectorAll('.rsr-slot').forEach(el => { el.onclick = () => onColSlotClick(+el.dataset.col); });
}

function onColSlotClick(c) {
  if (!RELICS_OWNED.size) return;
  if (relicSlots[c]) {
    const r = relicById(relicSlots[c]);
    delete relicSlots[c];
    computeIncome(); renderGrid(); updateHUD(); saveRun();
    toast(r.icon + ' «' + r.name + '» снята со столбца ' + (c + 1));
    return;
  }
  const avail = unassignedRelics();
  if (!avail.length) { toast('Свободных реликвий нет — способа получить их пока нет (см. «Улучшения»)'); return; }
  const cultGlobal = FACTION_INFO[faction].mechanic === 'formation';
  mk('relicPick', '<h2>Реликвия в столб ' + (c + 1) + '</h2>' +
    '<div class="res">' + (cultGlobal
      ? 'Реликвии культистов — РИТУАЛЬНЫЕ: их закон и кара действуют на весь ритуал сразу.'
      : 'Закон и КАРА реликвии действуют на ВСЮ эту колонку Алтаря.') + '</div>' +
    '<div id="relicPickGrid"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="relicPickX">Отмена</button></div>', 560);
  $('relicPickX').onclick = () => close_('relicPick');
  $('relicPickGrid').innerHTML = avail.map(id => {
    const r = relicById(id);
    return '<div class="relic-pick" data-id="' + id + '" style="border-color:' + RELIC_RARITY_COLOR(r.rarity) + '">' +
      relicArtHTML(r, 'relic-pick-img', '') + '<span><b>' + r.name + '</b> ' + '★'.repeat(r.rarity) +
      '<br><small style="color:#8fc87f">✅ ' + r.rule + '</small>' +
      '<br><small style="color:#e08a8a">❌ ' + r.curse + '</small></span></div>';
  }).join('');
  $('relicPickGrid').querySelectorAll('.relic-pick').forEach(el => {
    el.onclick = () => {
      relicSlots[c] = el.dataset.id;
      close_('relicPick');
      const r = relicById(el.dataset.id);
      toast(r.icon + ' «' + r.name + '» встала в столбец ' + (c + 1));
      sfx('place');
      computeIncome(); updateHUD(); saveRun();
      enforceRelicBans(false); /* кара-запрет немедленно изгоняет чужие карты */
      renderGrid();
    };
  });
  open_('relicPick');
}

/*
perf: ИНКРЕМЕНТАЛЬНЫЙ РЕНДЕР ПОЛЯ.
У каждой клетки — сигнатура состояния; перерисовывается только
изменившаяся клетка, причём при сохранной СТРУКТУРЕ (карта/бейджи)
обновляются только ТЕКСТЫ бейджей и классы — без пересборки DOM.
Разметка, классы, бейджи и слушатели — байт-в-байт прежние:
визуал и поведение не меняются вовсе.
 ============================================================*/
function renderGrid() {
  /* Защита: при смене размера Алтаря клетки пересоздаются автоматически */
  if (gridEl.children.length !== playableSize * playableSize) { buildGrid(); return; }
  const n = playableSize, st = gridStart();
  const cells = gridEl.children;
  const auraMap = buildAuraMap();
  const mech = FACTION_INFO[faction].mechanic;
  const relicsOn = epoch >= RELIC_SLOT_EPOCH;
  const colRelCache = {};
  const colRelOf = c => relicsOn ? (colRelCache[c] !== undefined ? colRelCache[c] : (colRelCache[c] = relicAtCol(c))) : null;
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = cells[dr * n + dc];
    const item = grid[r][c];
    const key = r + ',' + c;
    const az = auraMap[key];

    /* --- классы клетки (аура/ритуал/режимы) --- */
    let cls = 'cell playable';
    if (r === 4 && c === 4) cls += ' center-cell';
    if (az) { cls += az.necro ? ' aura-necro' : ' aura-zone'; if (az.big && !az.necro) cls += ' r2'; }
    if (incomeCache.lichZone && incomeCache.lichZone.indexOf(key) >= 0) cls += ' aura-lich';
    if (INC_CTX.ritual && INC_CTX.ritual.has(key)) cls += ' ritual-cell';
    else if (INC_CTX.ritualOuter && INC_CTX.ritualOuter.has(key)) cls += ' ritual-outer';
    if (INC_CTX.formCell && INC_CTX.formCell[key]) cls += ' ritual-part';
    if (moveMode && moveSource && moveSource.r === r && moveSource.c === c) cls += ' move-source';
    else if (moveMode && moveSource && !item) cls += ' move-target';
    else if (placingMode && pendingCard && !item) cls += ' place-target';
    const hc = hintClass(r, c);
    if (hc) cls += ' ' + hc;

    if (!item) {
      /* пустая клетка: только классы и цвет ауры */
      const sig = 'E|' + cls + '|' + (az ? az.color : '');
      if (cell.__sig !== sig) {
        cell.__sig = sig; cell.__struct = ''; cell.__refs = null;
        if (cell.className !== cls) cell.className = cls;
        if (az) cell.style.setProperty('--auraC', az.color);
        else if (cell.style.getPropertyValue('--auraC')) cell.style.removeProperty('--auraC');
        if (cell.firstChild) cell.innerHTML = '';
      }
      continue;
    }

    const card = CARDS[item.cardId];
    const income = calcCardIncome(r, c);
    const damaged = item.hp < item.maxHp - 0.01;
    const hpPct = damaged ? Math.max(0, (item.hp / item.maxHp) * 100) : 100;
    const hpColor = hpPct > 50 ? '#40d040' : hpPct > 20 ? '#e0c040' : '#ff3030';
    let badgeTxt = income.toFixed(2);
    if (mech === 'formation' && card.faction === 'cultist' && !card.isBuilding) {
      const cs = (INC_CTX.ritualCellSpeed && INC_CTX.ritualCellSpeed[key]) || 0;
      badgeTxt = cs > 0 ? '⚡' + cs.toFixed(2) : '· · ·';
    }
    const colRel = colRelOf(c);
    const chainedB = card.isBuilding && INC_CTX.bld && INC_CTX.bld.chainedAt && INC_CTX.bld.chainedAt.has(key);
    const u11chain = card.id === 'u11' && getNeighbors(r, c).some(n2 => CARDS[n2.item.cardId].isBuilding);
    const hasSp = !!SPECIALS[card.id];
    const sa = hasSp ? specialActive(card, item, r, c) : null;
    const inForm = formation(r, c) > 1;
    const fxLive = item.fxUntil > gameTime;
    const boomOn = mech === 'chaos' && item.boomUntil > gameTime;
    const mutOn = mech === 'chaos' && item.mutBuff && item.mutBuff !== 1;
    /* v1.12.0: корона АЛЬФЫ стаи (двоевластие — отдельная подпись) */
    const bgCrown = (mech === 'grounds' && typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS.alpha && BEAST_GROUNDS.alpha[key]) ? BEAST_GROUNDS.alpha[key] : null;
    const emberN = (mech === 'chaos' && item.embers > 0) ? item.embers : 0;
    /* v1.11.0: тление (Пепел), Пир хаоса (Мрак), строй (Легион) */
    const tleOn = mech === 'chaos' && (item.tleUntil || 0) > gameTime;
    const feastOn = mech === 'chaos' && (item.feastUntil || 0) > gameTime && (item.feastBuff || 1) > 1;
    const formOn = mech === 'chaos' && !card.isBuilding && card.subrace === 'legion' &&
      !!(INC_CTX.legionForm && INC_CTX.legionForm[key]);

    /* --- СТРУКТУРА: что требует пересборки DOM (наличие элементов/атрибутов) --- */
    const struct = item.cardId + '#' + item.stacks +
      '|' + (damaged ? 'D' : '') +
      '|' + (emberN ? 'e' : '') + (mutOn ? 'm' : '') + (boomOn ? 'b' : '') +
      (tleOn ? 't' : '') + (feastOn ? 'p' : '') + (formOn ? 's' : '') +
      (bgCrown ? (bgCrown.dual ? 'q2' : 'q1') : '') +
      '|' + (colRel ? colRel.id : '') +
      '|' + (chainedB ? 'C' : '') + (u11chain ? 'U' : '') +
      '|' + (hasSp ? (sa.active ? 'A' : 'a') : '-') +
      '|' + card.rarity + card.faction;
    const sig = struct +
      '|' + badgeTxt + '|' + (emberN || '') +
      '|' + cls + '|' + (az ? az.color : '') +
      '|' + (inForm ? 'F' : '') + (fxLive ? 'X' : '') +
      '|' + (INC_CTX.formActive && INC_CTX.formActive[key] ? 'AF' : '') +
      '|' + (damaged ? Math.round(hpPct) + hpColor : '');
    if (cell.__sig === sig) continue;

    const R = cell.__refs;
    if (R && cell.__struct === struct) {
      /* --- ЛЁГКИЙ ПАТЧ: структура та же — обновляем тексты/классы/стили --- */
      cell.__sig = sig;
      if (cell.className !== cls) cell.className = cls;
      if (az) { if (R.auraC !== az.color) { R.auraC = az.color; cell.style.setProperty('--auraC', az.color); } }
      else if (cell.style.getPropertyValue('--auraC')) { R.auraC = null; cell.style.removeProperty('--auraC'); }
      if (R.income.textContent !== badgeTxt) R.income.textContent = badgeTxt;
      if (R.ember) { const t = '◆'.repeat(emberN); if (R.ember.textContent !== t) R.ember.textContent = t; }
      if (R.hpbar) {
        const w = hpPct + '%';
        if (R.hpbar.style.width !== w) { R.hpbar.style.width = w; R.hpbar.style.background = hpColor; R.hpbar.style.color = hpColor; }
      }
      if (R.sp) {
        if (R.spOn !== sa.active) { R.spOn = sa.active; R.sp.classList.toggle('on', sa.active); R.sp.setAttribute('title', (sa.active ? 'Особенность активна' : 'Особенность не задействована') + ': ' + (SPECIALS[card.id] || '').replace(/"/g, '')); }
      }
      R.card.classList.toggle('in-formation', inForm);
      R.card.classList.toggle('fx-live', fxLive);
      R.card.classList.toggle('altar-active', !!(mech === 'formation' && RITUAL_SOURCES[card.id] && INC_CTX.formActive && INC_CTX.formActive[key]));
      cell.__curIncome = income;
      continue;
    }

    /* --- ПОЛНАЯ ПЕРЕСБОРКА КЛЕТКИ (разметка прежняя) --- */
    cell.__sig = sig; cell.__struct = struct;
    cell.className = cls;
    if (az) { cell.style.setProperty('--auraC', az.color); } else if (cell.style.getPropertyValue('--auraC')) cell.style.removeProperty('--auraC');
    cell.innerHTML = '';
    const cardEl = document.createElement('div');
    cardEl.className = 'card star' + card.rarity + ' f-' + card.faction;
    cardEl.style.setProperty('--glow', rarityColor(card.rarity));
    cardEl.style.setProperty('--cardBg', rarityBg(card.rarity));
    /* у культистов инкам 0 — бейдж показывает ВКЛАД В РИТУАЛ (⚡) */
    let badges = '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
      '<span class="card-name">' + card.name + '</span>' +
      '<span class="income-badge">' + badgeTxt + '</span>';
    /* РЕЛИКВИИ 3.0: маркер реликвии на карте, стоящей в её столбце (спрайт) */
    if (colRel) badges += '<span class="anchor-badge relic-mini" style="color:' + RELIC_RARITY_COLOR(colRel.rarity) + '" title="Столбец под реликвией: ' + colRel.name + '\n✅ ' + colRel.rule + '\n❌ ' + (colRel.curse || '') + '">' + relicArtHTML(colRel, 'relic-mini-img', '') + '</span>';
    /* ⛓ ПРИКОВАННОЕ ЗДАНИЕ (Скованным Цепью) */
    if (chainedB)
      badges += '<span class="anchor-badge" style="color:#b8c4d4" title="⛓ Приковано Скованным Цепью: кулдаун абилки вдвое короче, аура ×1.5, звено с любой соседней картой">⛓</span>';
    /* ⛓ сам Скованный — маркер, когда его цепь работает */
    if (u11chain)
      badges += '<span class="anchor-badge" style="color:#b8c4d4" title="Цепь здания захвачена">⛓</span>';
    /* ЗДАНИЯ: значок постройки + бейдж якоря для Алтаря */
    if (card.isBuilding) badges += '<span class="anchor-badge" style="color:#e8c060" title="Здание">🏛</span>';
    if (RITUAL_SOURCES[card.id]) badges += '<span class="anchor-badge">🔱</span>';
    /* Уникальная механика (SPECIALS): ✦ светится, когда особенность СЕЙЧАС работает
 тусклый значок означает, что бонусы карты не задействованы*/
    if (hasSp) {
      badges += '<span class="anchor-badge sp-badge' + (sa.active ? ' on' : '') + '" title="' +
        (sa.active ? 'Особенность активна' : 'Особенность не задействована') + ': ' + (SPECIALS[card.id] || '').replace(/"/g, '') + '">✦</span>';
      /* Карта НЕ мерцает; активность показывает золотой ✦ (класс on). */
    }
    /* Таймерные способности: бейджи перезарядки (: + Зомби-рост, Кладбище, Врата, Кузнецы демонов) */
    if (card.id === 'bl_mound') badges += '<span class="cd-badge" data-cd="mound"></span>';
    if (card.id === 'd9') badges += '<span class="cd-badge" data-cd="balr"></span>';
    if (card.id === 'd22') badges += '<span class="cd-badge" data-cd="gor"></span>';
    if (card.id === 'd31') badges += '<span class="cd-badge" data-cd="zav"></span>';
    if (card.id === 'd41') badges += '<span class="cd-badge" data-cd="trub"></span>';
    if (card.id === 'u1') badges += '<span class="cd-badge" data-cd="grow" data-r="' + r + '" data-c2="' + c + '"></span>';
    if (card.id === 'bl_grave') badges += '<span class="cd-badge" data-cd="grave"></span>';
    if (card.id === 'bl_gates') badges += '<span class="cd-badge" data-cd="gates"></span>';
    /* ДЕМОНЫ: угли Хаоса (0..5) — оранжевые ромбы */
    if (emberN)
      badges += '<span class="ember-badge">' + '◆'.repeat(emberN) + '</span>';
    /* ДЕМОНЫ: перегрев (×2) */
    if (boomOn)
      badges += '<span class="mut-badge" style="color:#ff6040">×2</span>';
    /* ДЕМОНЫ: накопленный бафф мутаций */
    if (mutOn)
      badges += '<span class="mut-badge">▲</span>';
    /* ДЕМОНЫ v1.11.0: тление · Пир хаоса · строй */
    if (tleOn)
      badges += '<span class="mut-badge" style="color:#ffb060" title="Тление: ×' + (item.tleVal || 1.1).toFixed(2) + ' — жар своего взрыва ещё тёплый">✹</span>';
    if (feastOn)
      badges += '<span class="mut-badge" style="color:#c080ff" title="Пир хаоса: ×' + (item.feastBuff || 1).toFixed(2) + ' — чужие взрывы кормят (до ×1.5)">🍖</span>';
    if (formOn)
      badges += '<span class="mut-badge" style="color:#9ab0d0" title="В строю: угли ×1.25, взрыв — контролируемый бафф ×1.25">⛨</span>';
    /* ЗВЕРИ: корона альфы (v1.12.0 — вместо бейджей сытости/голода) */
    if (bgCrown)
      badges += '<span class="anchor-badge" style="color:#ffd34d" title="' + (bgCrown.dual
        ? 'СПОРНАЯ КОРОНА: двоевластие в стае — сила короны ×0.5'
        : 'АЛЬФА СТАИ: трофеи ×1.25, вся стая +10%') + '">👑</span>';
    if (item.stacks > 1) badges += '<span class="stack-badge">x' + item.stacks + '</span>';
    cardEl.innerHTML = (damaged ? '<div class="hp-bar" style="width:' + hpPct + '%;background:' + hpColor + ';color:' + hpColor + ';"></div>' : '') +
      cardArtHTML(card, 'card-art', 'glyph') + badges;
    if (inForm) cardEl.classList.add('in-formation');
    /* таймерная способность сработала (fxUntil от fxMarkBuildings) — вспышка-каст */
    if (fxLive) cardEl.classList.add('fx-live');
    /* активный источник ритуала — кольцо рун */
    if (mech === 'formation' && card.faction === 'cultist') {
      if (RITUAL_SOURCES[card.id] && INC_CTX.formActive[key]) cardEl.classList.add('altar-active');
    }
    /* income читается из cell.__curIncome — тултип всегда показывает
 актуальный доход, даже когда клетка обновилась лёгким патчем*/
    cell.__curIncome = income;
    cardEl.addEventListener('mouseenter', e => showCardTooltip(e, card, cell.__curIncome, r, c));
    cardEl.addEventListener('mousemove', moveTooltip);
    cardEl.addEventListener('mouseleave', hideTooltip);
    cell.appendChild(cardEl);
    /* кэш ссылок на бейджи для лёгкого патча */
    cell.__refs = {
      card: cardEl,
      income: cardEl.querySelector('.income-badge'),
      ember: cardEl.querySelector('.ember-badge'),
      hpbar: cardEl.querySelector('.hp-bar'),
      sp: hasSp ? cardEl.querySelector('.sp-badge') : null,
      spOn: hasSp ? sa.active : null,
      auraC: az ? az.color : null
    };
  }
  drawSynergies();
  updateGridStats();
  renderOmens();
  renderRelicSlots();
  renderRitualBar();
  lastRenderSig = gridSignature(); /* после рендера запоминаем состояние */
}

/* ================= : САМОВОССТАНОВЛЕНИЕ ОТОБРАЖЕНИЯ =================
«То ауры не отображаются, то карты дублируют» — любой рассинхрон DOM и
состояния теперь чинится сам: раз в 250мс сравниваем дешёвую сигнатуру
 поля с той, что была при последнем рендере; разошлась — перерисовываем.*/
let lastRenderSig = '';
function gridSignature() {
  let s = FACTION_INFO[faction].mechanic + '|' + playableSize + '|' + epoch + '|' +
    (placingMode ? 'P' + pendingCard : '') + (deleteMode ? 'D' : '') + (moveMode ? 'M' : '') +
    (moveSource ? '@' + moveSource.r + ',' + moveSource.c : '') + '|' +
    (INC_CTX.ritual ? INC_CTX.ritual.size : 0) + '/' + (INC_CTX.ritualOuter ? INC_CTX.ritualOuter.size : 0) + '/' +
    Object.keys(INC_CTX.formActive || {}).length + '|' + Object.keys(relicSlots).length + '|';
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it) { s += '.'; continue; }
    s += it.cardId + 'x' + it.stacks +
      ',h' + Math.round(it.hp) + '/' + Math.round(it.maxHp) +
      ',e' + (it.embers || 0) + ',g' + Math.round((it.growBuff || 0) * 100) +
      ',m' + Math.round((it.mutBuff || 1) * 100) + ',b' + Math.round((it.balrBuff || 1) * 100) +
      (it.boomUntil > gameTime ? '!' : '');
  }
  return s;
}

/* → : вспышки способностей (fxUntil) обновляются классами
РАЗ в 250мс — без стирания DOM. Прежний вариант (флаг F в
сигнатуре) перерисовывал всё поле 2 раза за цикл Кладбища: игрок видел
мигание, а все анимации перезапускались строем. classList.toggle не
перезапускает анимацию, пока класс не изменился.
Туман зон постоянный и тихий.
 В харнесе gridEl === null — выходим тихо.*/
function updateFxLive() {
  if (!gridEl) return;
  const n = playableSize, st = gridStart();
  const cells = gridEl.children;
  if (cells.length !== n * n) return;
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = cells[dr * n + dc];
    const it = grid[r][c];
    if (cell.firstElementChild) cell.firstElementChild.classList.toggle('fx-live', !!(it && it.fxUntil > gameTime));
  }
}

/* ---- : АКТИВНОСТЬ ОСОБЕННОСТИ (✦) ----
Тусклый ✦ = условие особенности не выполнено (карта работает "вхолостую").
 Золотой ✦ = бонус сейчас капает. Проверки простые и точные.*/
function specialActive(card, item, r, c) {
  const nb = getNeighbors(r, c), r2 = radius2(r, c);
  switch (card.id) {
    case 'u0': return { active: r2.some(n => CARDS[n.item.cardId].rarity === 5) };
    case 'u1': return { active: (item.growBuff || 0) > 0 };
    case 'u2': return { active: r2.some(n => n.item.hp < n.item.maxHp - 0.01) };
    case 'u3': return { active: nb.some(n => n.item.stacks >= 2) || nb.some(n => n.item.cardId === 'u1') };
    case 'u4': case 'u12':
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId])) };
    case 'u5': /* «Поднятие»: есть кому поднять */
      return { active: nb.some(n => CARDS[n.item.cardId].cat === 'thrall') };
    case 'u8': /* Пакт Тишины (v1.9.0): достаточно Склепа рядом */
      return { active: nb.some(n => n.item.cardId === 'bl_crypt') };
    case 'u6': return { active: nb.some(n => { const q = CARDS[n.item.cardId]; return q.faction === 'undead' && q.rarity === 3; }) };
    case 'u7': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u9': /* Коса (v1.9.0): нежить или раненые в радиусе 2 */
      return { active: r2.some(n => CARDS[n.item.cardId].faction === 'undead' || n.item.hp < n.item.maxHp - 0.01) };
    case 'u10': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u11': return { active: nb.some(n => CARDS[n.item.cardId].isBuilding) };
    case 'u13': /* Рывок: ровно одно живое звено */
      return { active: liveLinkCount(r, c, card) === 1 };
    case 'u14': /* Правка костей: есть связанная Скованная */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId]) && CARDS[n.item.cardId].cat === 'thrall') };
    case 'u15': return { active: emptyAround(r, c) > 0 };
    case 'u16': /* Эхо: есть звенья, которые защищать */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId])) };
    case 'u17': {
      const friends = livePartners(r, c, card);
      return { active: !getNeighbors8(r, c).some(n => CARDS[n.item.cardId].faction === 'undead' && !friends.some(p => p.r === n.r && p.c === n.c)) };
    }
    case 'u18': return { active: r2.some(n => { const q = CARDS[n.item.cardId]; return q.subrace === 'ghost' && !q.isBuilding; }) };
    case 'u19': case 'u20': case 'u22': /* каналы: есть связанная Скованная */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId]) && CARDS[n.item.cardId].cat === 'thrall') };
    case 'u21': /* Звон: связанная Скованная есть; пульс виден по fx */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId]) && CARDS[n.item.cardId].cat === 'thrall') };
    case 'u23': /* Туман: есть Скованные в ауре */
      return { active: r2.some(n => CARDS[n.item.cardId].cat === 'thrall') };
    case 'u24': return { active: typeof nocturneUntil !== 'undefined' && nocturneUntil > gameTime };
    case 'u25': return { active: radiusN(r, c, 3).some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u26': /* Маяк: есть призрачные звенья */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId]) && CARDS[n.item.cardId].subrace === 'ghost') };
    case 'u27': return { active: r2.some(n => UNDEAD_LORDS[n.item.cardId]) };
    case 'u28': return { active: (item.stacks || 1) > 1 };
    case 'u29': return { active: r2.some(n => n.item.hp >= n.item.maxHp - 0.01) };
    case 'u30': return { active: r2.some(n => CARDS[n.item.cardId].isBuilding) };
    case 'u31': case 'u33': case 'u34': case 'u37': /* каналы: есть связанная Скованная */
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId]) && CARDS[n.item.cardId].cat === 'thrall') };
    case 'u32': /* Дуэль: связанная Скованная связана ТОЛЬКО с ней */
      return { active: livePartners(r, c, card).some(p => p.card.cat === 'thrall' && liveLinkCount(p.r, p.c, p.card) <= 2) };
    case 'u35': /* Обет: есть Скованные в ауре */
      return { active: r2.some(n => CARDS[n.item.cardId].cat === 'thrall') };
    case 'u36': return { active: (item.midnightUntil || 0) > gameTime };
    case 'u38': return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId])) };
    case 'c1': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'cultist') };
    case 'c2': return { active: nb.some(n => RITUAL_SOURCES[n.item.cardId]) };
    case 'c3': return { active: radius2(r, c).some(n => INC_CTX.ritual && INC_CTX.ritual.has(n.r + ',' + n.c)) };
    case 'c12': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'cultist' && !INC_CTX.ritual.has(n.r + ',' + n.c)) };
    case 'd0': case 'd12': return { active: nb.some(n => (n.item.embers || 0) >= 3) };
    case 'd1': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd2': return { active: (item.harmBuff || 0) > 0 };
    case 'd4': return { active: nb.some(n => CARDS[n.item.cardId].subrace === 'dark') };
    case 'd5': return { active: (item.whisperUntil || 0) > gameTime || nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd6': case 'd8': case 'd10': case 'd14':
      return { active: (card.id === 'd10' || card.id === 'd14' ? r2 : nb).some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd7': case 'd37': return { active: !!(INC_CTX.legionForm && INC_CTX.legionForm[r + ',' + c]) };
    case 'd9': return { active: (item.balrBuff || 1) > 1 || nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd11': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd13': return { active: (item.tyrBuff || 1) > 1 };
    case 'd15': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    /* --- v1.11.0: новые демоны --- */
    case 'd16': return { active: nb.some(n => CARDS[n.item.cardId].subrace === 'ash') };
    case 'd17': return { active: r2.some(n => (n.item.embers || 0) >= 3) };
    case 'd18': return { active: nb.some(n => (n.item.embers || 0) >= 3) };
    case 'd19': return { active: (item.tleUntil || 0) > gameTime };
    case 'd20': return { active: nb.some(n => CARDS[n.item.cardId].subrace === 'ash') };
    case 'd21': return { active: (item.embers || 0) > 0 };
    case 'd22': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd23': return { active: (item.pyroBuff || 1) > 1 };
    case 'd24': return { active: (item.embers || 0) > 0 || nb.some(n => CARDS[n.item.cardId].subrace === 'ash') };
    case 'd25': return { active: (item.phxBuff || 1) > 1 || (item.embers || 0) > 0 };
    case 'd26': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd27': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd28': return { active: r2.some(n => (n.item.boomUntil || 0) > gameTime) };
    case 'd29': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd30': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd31': return { active: (item.zavUntil || 0) > gameTime || nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd32': return { active: r2.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd33': return { active: (item.voidUntil || 0) > gameTime || r2.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd34': return { active: r2.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd35': return { active: (item.harkBuff || 1) > 1 };
    case 'd36': return { active: true }; /* аура поля: пока на поле — работает */
    case 'd38': case 'd39': return { active: nb.some(n => CARDS[n.item.cardId].subrace === 'legion') };
    case 'd40': return { active: r2.some(n => CARDS[n.item.cardId].isBuilding) };
    case 'd41': return { active: radiusN(r, c, 3).some(n => CARDS[n.item.cardId].subrace === 'legion' && INC_CTX.legionForm && INC_CTX.legionForm[n.r + ',' + n.c]) };
    case 'd42': return { active: nb.some(n => CARDS[n.item.cardId].cat === 'crown') };
    case 'd43': return { active: nb.filter(n => CARDS[n.item.cardId].faction === 'demon').length >= 2 };
    case 'd44': return { active: r2.some(n => CARDS[n.item.cardId].subrace === 'legion' && INC_CTX.legionForm && INC_CTX.legionForm[n.r + ',' + n.c]) };
    case 'd45': case 'd46': return { active: r2.some(n => CARDS[n.item.cardId].subrace === 'legion') };
    case 'd47': return { active: radiusN(r, c, 3).some(n => CARDS[n.item.cardId].subrace === 'legion') };
    /* ЗВЕРИ v1.12.0: активность особенности — из расчёта угодий */
    case 'b0': case 'b1': case 'b2': case 'b3': case 'b5': case 'b6': case 'b9':
    case 'b10': case 'b11': case 'b12': case 'b13': case 'b16': case 'b18': case 'b19':
    case 'b20': case 'b21': case 'b22': case 'b23': case 'b24': case 'b26': case 'b27':
    case 'b28': case 'b29': case 'b30': case 'b32': case 'b34': case 'b35': case 'b36':
    case 'b37': case 'b38': case 'b40': case 'b41': case 'b42': case 'b46': case 'b47':
    case 'b48': case 'b49': case 'b50': case 'b51': case 'b52': case 'b53':
    case 'b54': case 'b55': case 'b56': case 'b57': case 'b58': case 'b59': {
      const bg2 = (typeof BEAST_GROUNDS !== 'undefined') ? BEAST_GROUNDS : null;
      return { active: !!(bg2 && bg2.active && bg2.active[r + ',' + c]) };
    }
    case 'b4': case 'b7': case 'b8': case 'b14': case 'b15': case 'b17': case 'b25':
    case 'b31': case 'b33': case 'b39': case 'b43': case 'b44': case 'b45':
      return { active: true }; /* постоянные свойства: радиус/укрытие/аура */
    default: return { active: true }; /* здания и остальное — всегда */
  }
}

/* SVG-линии: парные синергии + цепи нежити (координаты — по открытым клеткам).
у НЕЖИТИ все связи — цепи. : связь — банда из пяти тёмных
цепочек между самыми кромками карт (центры карт свободны).
Светится и бежит только свет по металлу: холодный проблеск по всем цепям,
 яркий фиолетовый — по особым связям. Прочие фракции — прежний вид.*/
function mkLine(cls, coords) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', coords.x1); l.setAttribute('y1', coords.y1);
  l.setAttribute('x2', coords.x2); l.setAttribute('y2', coords.y2);
  l.setAttribute('class', cls);
  synergySvg.appendChild(l);
  return l;
}

/*
perf: drawSynergies БЕЗ LAYOUT-THRASHING (без принудительных layout-
чтений и без полной пересборки SVG на каждый renderGrid):
1) спецификации связей собираются одним проходом БЕЗ обращений
к layout; если они не изменились с прошлой отрисовки — SVG
не трогается вовсе (SMIL/CSS-анимации не рестартуют);
2) при реальной перерисовке все прямоугольники читаются ОДНИМ
проходом (один forced layout вместо десятков).
Геометрия, классы и порядок элементов SVG — прежние.
 ============================================================*/
let _synSig = null;

function drawSynergies() {
  const ug = FACTION_INFO[faction].mechanic === 'chain'; /* цепи — тема нежити */
  const n = playableSize, st = gridStart();
  /* --- Проход 1: сбор спецификаций связей (без layout-чтений) --- */
  const specs = [];
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    const item = grid[r][c]; if (!item) continue;
    const card = CARDS[item.cardId];
    for (const [dr, dc] of [[1, 0], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
      const it2 = grid[nr][nc]; if (!it2) continue;
      if (nr >= st + n || nc >= st + n) continue; /* за пределами поля карт нет (инвариант игры) */
      const nCard = CARDS[it2.cardId];
      const pair = findPair(card, nCard);
      if (!pair) {
        if (ug && card.faction === 'undead' && nCard.faction === 'undead')
          specs.push({ horiz: r === nr, mode: 'adj', lf: undefined, isMult: false });
        continue;
      }
      const kind = pair.kind === 'mult' ? 'mult' : pair.kind === 'chain' ? 'chain' : pair.kind === 'royal' ? 'royal' : 'good';
      const lk = linkKey(r, c, nr, nc);
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      const royal = !!(incomeCache.linkRoyal && incomeCache.linkRoyal[lk]);
      const lichW = !!(incomeCache.linkLich && incomeCache.linkLich[lk]);
      if (ug) {
        const mode = royal ? 'royal' : lichW ? 'lich' : kind === 'chain' ? 'big' : 'plain';
        specs.push({ horiz: r === nr, mode, lf, isMult: kind === 'mult' });
      } else {
        specs.push({ horiz: r === nr, kind, lf, lichW, royal });
      }
    }
  }
  /* v1.9.0: спецификации ФАЗОВЫХ связей (Призраки/Туман/Маяк) — для сигнатуры */
  const phaseSpecs = [];
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    if (!grid[r][c]) continue;
    for (const [dr, dc] of [[0, 2], [2, 0], [0, 3], [3, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= st + n || nc >= st + n || !grid[nr][nc]) continue;
      const lk = linkKey(r, c, nr, nc);
      if (!incomeCache.linkPhase || !incomeCache.linkPhase[lk]) continue;
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      phaseSpecs.push((r === nr ? 'h' : 'v') + lf);
    }
  }
  /* v1.12.0: спецификации СТАЙ зверей (пунктир между союзниками по пересечению угодий) */
  const packSpecs = (FACTION_INFO[faction].mechanic === 'grounds' && typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS.packEdges)
    ? BEAST_GROUNDS.packEdges.map(e => e.join(':')) : [];
  /* Сигнатура: состав связей + режим + вьюпорт (resize меняет координаты
тогда принудительно перерисовываем; вызов из resize-обработчика придёт
 с той же сигнатурой связей, но новым размером окна).*/
  let sig = (ug ? 'U' : 'L') + n + '|' + window.innerWidth + 'x' + window.innerHeight + '|' + specs.map(s =>
    s.horiz ? 'h' : 'v').join('') + '#' + specs.map(s =>
    (s.mode || s.kind) + (s.lf === undefined ? '' : ':' + s.lf) + (s.royal ? 'R' : '') + (s.lichW ? 'W' : '') + (s.isMult ? 'M' : '')).join(';') +
    '|PH' + phaseSpecs.join(';') + '|PK' + packSpecs.join(';');
  if (sig === _synSig) return;
  _synSig = sig;

  synergySvg.innerHTML = '';
  fxGlintList = []; /* траектории проблесков пересобираются с SVG */
  const sr = synergySvg.getBoundingClientRect();
  const cellAt = (r, c) => gridEl.children[(r - st) * n + (c - st)];
  /* ВСЕ прямоугольники читаются одним проходом (один forced layout) */
  const rects = new Array(n * n), cardRects = new Array(n * n);
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const cell = cellAt(st + dr, st + dc);
    rects[dr * n + dc] = cell.getBoundingClientRect();
    const ca = cell.firstElementChild;
    cardRects[dr * n + dc] = ca ? ca.getBoundingClientRect() : null;
  }
  const rectOf = (r, c) => rects[(r - st) * n + (c - st)];
  const cardRectOf = (r, c) => {
    const cr = cardRects[(r - st) * n + (c - st)];
    return cr || rectOf(r, c);
  };
  const cx = (c) => { const b = rectOf(st, c); return b.left - sr.left + b.width / 2; };
  const cy = (r) => { const b = rectOf(r, st); return b.top - sr.top + b.height / 2; };
  /* геометрия цепи — ВО ВСЮ КРОМКУ: связь идёт вдоль ОБЩЕГО края
карт по всей его высоте/ширине. Горизонтальные соседи — вертикальный
шов (вся высота карты), вертикальные соседи — горизонтальный шов
(вся ширина карты). Центры карт свободны: банда лежит только на
 стыке клеток. Координаты — из прямоугольников самих карт.*/
  const ugLinkCoords = !ug ? null : (r, c, nr, nc) => {
    const ra = cardRectOf(r, c), rb = cardRectOf(nr, nc);
    if (r === nr) {
      const mx = (ra.right + rb.left) / 2 - sr.left;
      return { x1: mx, y1: ra.top - sr.top, x2: mx, y2: ra.bottom - sr.top };
    }
    const my = (ra.bottom + rb.top) / 2 - sr.top;
    return { x1: ra.left - sr.left, y1: my, x2: ra.right - sr.left, y2: my };
  };
  let si = 0;
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    const item = grid[r][c]; if (!item) continue;
    const card = CARDS[item.cardId];
    for (const [dr, dc] of [[1, 0], [0, 1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= GRID_SIZE || nc >= GRID_SIZE) continue;
      const it2 = grid[nr][nc]; if (!it2) continue;
      if (nr >= st + n || nc >= st + n) continue;
      const nCard = CARDS[it2.cardId];
      const pair = findPair(card, nCard);
      if (!pair) {
        /* Соседство без пары — это НЕ синергия, а бонус соседства
(+8% за соседа-нежить, factionMult) и связность Армии (+1.5% за
нежить в непрерывной цепи). Соседство помечено ОДНОЙ тусклой
нитью по середине шва, БЕЗ проблеска: полная банда (и фиолетовое
 свечение Лича/Владыки) — только у синергии.*/
        if (ug && card.faction === 'undead' && nCard.faction === 'undead') drawUgLink(ugLinkCoords(r, c, nr, nc), 'adj', undefined, false);
        continue;
      }
      const kind = pair.kind === 'mult' ? 'mult' : pair.kind === 'chain' ? 'chain' : pair.kind === 'royal' ? 'royal' : 'good';
      const lk = linkKey(r, c, nr, nc);
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      const royal = !!(incomeCache.linkRoyal && incomeCache.linkRoyal[lk]);
      const lichW = !!(incomeCache.linkLich && incomeCache.linkLich[lk]);
      const coords = { x1: cx(c), y1: cy(r), x2: cx(nc), y2: cy(nr) };
      if (ug) {
        /* вся связь нежити = тёмная банда цепей; особые связи получают фиолетовый отблеск */
        const mode = royal ? 'royal' : lichW ? 'lich' : kind === 'chain' ? 'big' : 'plain';
        drawUgLink(ugLinkCoords(r, c, nr, nc), mode, lf, kind === 'mult');
        continue;
      }
      /* прежний вид (культисты/звери/демоны): линия синергии + бегущий поток.
faded — реальное затухание из экономики; royal — Знамение Владыки;
 lich — Пакт Тишины Лича; dead — мёртвое звено*/
      mkLine(kind === 'mult' ? 'base-mult' : kind === 'chain' ? 'base-chain' : kind === 'royal' ? 'base-royal' : 'base-good', coords);
      mkLine('syn-flow' + (kind === 'mult' ? ' mult' : kind === 'chain' ? ' chainflow' : '') +
        (lf === 0 ? ' dead' : lf < 1 ? ' faded' : '') +
        (lichW ? ' lich' : royal ? ' royal' : ''), coords);
    }
  }
  /* v1.9.0 ФАЗОВЫЕ СВЯЗИ: тонкая пунктирная нить между НЕсоседними клетками
     (Призраки/Туман/Маяк). Без банадов и проблесков — тихо, по решению В1:
     видно, но не захламляет поле. */
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    if (!grid[r][c]) continue;
    for (const [dr, dc] of [[0, 2], [2, 0], [0, 3], [3, 0]]) {
      const nr = r + dr, nc = c + dc;
      if (nr >= st + n || nc >= st + n || !grid[nr][nc]) continue;
      const lk = linkKey(r, c, nr, nc);
      if (!incomeCache.linkPhase || !incomeCache.linkPhase[lk]) continue;
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      mkLine('base-ghost' + (lf === 0 ? ' dead' : ''), { x1: cx(c), y1: cy(r), x2: cx(nc), y2: cy(nr) });
    }
  }
  /* v1.12.0 СТАИ ЗВЕРЕЙ: зелёный пунктир между хищниками с пересекающимися угодьями */
  if (FACTION_INFO[faction].mechanic === 'grounds' && typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS.packEdges) {
    BEAST_GROUNDS.packEdges.forEach(([r1, c1, r2, c2]) => {
      if (r1 < st || r1 >= st + n || c1 < st || c1 >= st + n) return;
      if (r2 < st || r2 >= st + n || c2 < st || c2 >= st + n) return;
      mkLine('base-pack', { x1: cx(c1), y1: cy(r1), x2: cx(c2), y2: cy(r2) });
    });
  }
  /* геометрия проблесков — на fx-канву (координаты SVG + смещение) */
  if (typeof fxSetGlints === 'function') fxSetGlints(fxGlintList, sr.left, sr.top);
}

/*
— шов выглядел плотной
лестницей одинаковых колец (решётка), а не цепями.
ФИЗИКА БЕЗ ИЗМЕНЕНИЙ ( /8): оковы лежат на ОБЩЕМ краю
двух соседних карт (расположение прежнее — только шов, по 7px на
карту) и СКРЕПЛЯЮТ карты ПОПЕРЁК шва, от карты к карте.
ЧТО СМЕНИЛОСЬ — ОБРАЗ:
1) НЕСКОЛЬКО ЦЕПЕЙ: шов скрепляют 3 ОТДЕЛЬНЫЕ короткие нити на
высотах ~25% / 50% / 75% кромки, между ними чистый стык.
2) ПО-РАЗНОМУ НАТЯНУТЫ: у каждой нити своя натяжка — тугая
(почти прямая), средняя и слабая (провисает дугой). У
вертикального шва нити висят ВНИЗ, у горизонтального слабые
бортают ВБОК. Порядок натяжек и сторона прогиба
детерминированы координатами шва — поле живое, но стабильное.
3) НИТЬ — ОДИН СПРАЙТ : вся нить с звеньями по дуге
запечена в одну картинку 30x30 (генератор scripts/gen_chains_sprite.py
рисует те же звенья по той же квадратичной кривой, ориентация
чередуется плансмя/боком, металл ГЛУХОЙ — alpha=255). На шов всего
3 картинки-нити — на поле 9x9 348 <image> вместо ~928 у.
ПРОБЛЕСК: один на шов — свет бежит ВДОЛЬ цепи от карты к карте,
перетекая с нити на нить: дуга нити → скольжение по шву → дуга
следующей. Мягкое пятно (glint_pale.png / фиолетовый glint_royal.png
у особых связей: royal — Владыка, lich — Пакт, big — Скованный,
mult; : у связей под Пактом Лича/Знамением Владыки — яркая
рунная glint_magic.png); полупрозрачен только свет. Мёртвое звено
не светится вовсе; faded/dead гасят все нити связи (CSS.ug-band).
РЕНДЕР СВЕТА — на fx-канве (fx.js), НЕ SMIL: замер на 9x9 дал 27fps
на SMIL (animateMotion/animateTransform/даже animate x+y) против
45fps у с 432 SMIL-плитками; канва с drawImage — 59-60fps.
drawUgLink отдаёт лишь ломаную вдоль дуг (fxGlintList), фаза
детерминированная (по координатам шва) — свет стабилен.
 ============================================================*/
const UG_STRANDS = 3; /* нитей на шов */
const UG_STR = 30; /* плитка целой нити (30x30, центр кривой — 15,15) */
/* траектории проблесков — заполняется drawUgLink при фактической
 перерисовке SVG, отрисовывает fx.js (канва): SMIL на густом поле проседал*/
let fxGlintList = [];

/* Натяжки нитей: тугая / средняя / слабая (прогиб дуги, px)
 ДОЛЖНЫ совпадать с UG_SLACK в scripts/gen_chains_sprite.py*/
const UG_SLACK = [1.5, 4, 8];

function drawUgLink(coords, mode, lf, isMult) {
  const NS = 'http://www.w3.org/2000/svg';
  const faded = lf !== undefined && lf > 0 && lf < 1, dead = lf === 0;
  const st = (faded ? ' faded' : dead ? ' dead' : '');
  const g = document.createElementNS(NS, 'g');
  /* 'adj' — соседство без пары: одна тусклая нить, класс.adj */
  const adjOnly = mode === 'adj';
  g.setAttribute('class', 'ug-band' + st + (adjOnly ? ' adj' : ''));
  const seed = Math.abs(Math.round(coords.x1 * 7 + coords.y1 * 13));
  const special = mode === 'royal' || mode === 'lich' || mode === 'big' || isMult;
  /* связи, УЛУЧШЕННЫЕ ЛИЧОМ (Пакт Тишины,
mode 'lich') или ВЛАДЫКОЙ ТЛЕНА (Знамение Владыки, mode 'royal'),
скреплены МАГИЧЕСКИМИ цепями с фиолетовым свечением — спрайты
*_magic.png: та же геометрия нитей (расположение и физика прежние),
зачарованный тёмно-фиолетовый металл + запечённый ореол (полупрозрачен
только свет, металл глухой). Остальные связи — могильная сталь:
 big (Скованный) и mult лишь отблёскивают фиолетовым,.*/
  const magic = mode === 'royal' || mode === 'lich';
  const dur = special ? 2.6 : 4.2;
  const horiz = coords.x1 !== coords.x2; /* шов горизонтальный (соседи в столбце) */
  const L = horiz ? coords.x2 - coords.x1 : coords.y2 - coords.y1;
  const mkIm = (href, x, y, w, h) => {
    const im = document.createElementNS(NS, 'image');
    im.setAttribute('href', href); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    im.setAttribute('x', x.toFixed(1)); im.setAttribute('y', y.toFixed(1));
    im.setAttribute('width', String(w)); im.setAttribute('height', String(h));
    im.setAttribute('style', 'image-rendering:pixelated');
    return im;
  };
  /* 3 нити; порядок натяжек и сторона прогиба свои у каждого шва
 (детерминированы координатами) — поле живое, но стабильное.*/
  const strands = [];
  /* у соседства без пары — ОДНА тугая нить ПО СЕРЕДИНЕ шва
(та же геометрия/спрайты, просто меньше и тише: полная банда
 остаётся знаком настоящей связи-синергии).*/
  for (let i = 0; i < (adjOnly ? 1 : UG_STRANDS); i++) {
    const t = adjOnly ? 0.5 : (i + 1) / (UG_STRANDS + 1);
    const k = adjOnly ? 0 : (seed + i * 5) % 3; /* индекс натяжки 0..2 */
    const slack = UG_SLACK[k];
    if (!horiz) {
      /* вертикальный шов: нить горизонтальна, провисает ВНИЗ;
 проблеск после дуги нити скользит по шву к следующей*/
      const y = coords.y1 + L * t;
      strands.push({ x: coords.x1, y, slack, side: 0, file: 'chain_v_' + k + (magic ? '_magic' : '') });
      g.appendChild(mkIm('assets/fx/chain_v_' + k + (magic ? '_magic' : '') + '.png' + ASSET_VER_Q, coords.x1 - UG_STR / 2, y - UG_STR / 2, UG_STR, UG_STR));
    } else {
      /* горизонтальный шов: нить вертикальна; слабая бортает ВБОК */
      const x = coords.x1 + L * t;
      const side = ((seed + i) & 1) ? 1 : -1;
      const file = (k === 0 ? 'chain_h_0' : 'chain_h_' + k + (side > 0 ? 'r' : 'l')) + (magic ? '_magic' : '');
      strands.push({ x, y: coords.y1, slack, side, file });
      g.appendChild(mkIm('assets/fx/' + file + '.png' + ASSET_VER_Q, x - UG_STR / 2, coords.y1 - UG_STR / 2, UG_STR, UG_STR));
    }
  }
  synergySvg.appendChild(g);
  /* проблеск: одно пятно света патрулирует весь шов — свет бежит ВДОЛЬ
цепи от карты к карте: дуга нити (с прогибом) → скольжение по шву →
дуга следующей. Мёртвое звено не светится вовсе; полупрозрачен
только СВЕТ, металл под ним глухой.
РЕНДЕР СВЕТА — на fx-канве (fx.js), не SMIL: замер на поле 9x9
показал, что даже лёгкие SMIL-анимации на 100+ элементов просаживали
кадр до ~27fps, а drawImage на уже идущем канве — почти бесплатен.
Сюда отдаём только геометрию: ломаная вдоль дуг нитей (по 4 отрезка
 на дугу — плавно повторяет прогиб) и детерминированная фаза.*/
  /* соседство без пары НЕ светится — проблеск бегёт только
по настоящим связям (синергия-пара / прикованное здание), там он
 и был задуман как знак живого потока звена.*/
  if (!dead && !adjOnly) {
    const pts = [];
    const quadPts = (p0, c, p2) => {
      for (let s2 = 0; s2 <= 4; s2++) {
        const t = s2 / 4, mt = 1 - t;
        pts.push([mt * mt * p0[0] + 2 * mt * t * c[0] + t * t * p2[0],
                  mt * mt * p0[1] + 2 * mt * t * c[1] + t * t * p2[1]]);
      }
    };
    for (let i = 0; i < UG_STRANDS; i++) {
      const s = strands[i];
      const dx = horiz ? s.side * s.slack * 2 : 0; /* прогиб середины дуги */
      const dy = horiz ? 0 : s.slack * 2;
      quadPts([s.x - 7, s.y], [s.x + dx, s.y + dy], [s.x + 7, s.y]); /* дуга нити */
      if (i < UG_STRANDS - 1) {
        const n = strands[i + 1];
        pts.push([n.x - 7, n.y]); /* скольжение по шву */
      }
    }
    fxGlintList.push({ pts, dur, phase: (seed % 97) / 97, alpha: faded ? .4 : 1, royal: special, magic });
  }
}
function updateGridStats() {
  const inc = calculateIncome();
  let extra = '';
  /* Активный буст «ЖАТВА» (Гора костей) */
  const b = activeAltBuff();
  if (b.mult > 1) extra += ' · <b style="color:#ffd34d">' + b.label + '</b> (' + Math.max(0, Math.ceil(b.until - gameTime)) + 'с)';
  /* Армия нежити (крупнейшая непрерывная цепь).
кап берётся из incomeCache.armyCap (со «Штандартом Легиона»
 он ×2.6, а не захардкоженный ×2 — раньше отображение врало).*/
  if (FACTION_INFO[faction].mechanic === 'chain' && incomeCache.armyBest > 1) {
    const am = Math.min(incomeCache.armyCap || 2, 1 + 0.015 * (incomeCache.armyBest - 1));
    extra += ' · Армия: <b>' + incomeCache.armyBest + '</b> (×' + am.toFixed(2) + ')';
  }
  /* v1.12.0: сводка угодий зверей (до сигнатуры) */
  if (FACTION_INFO[faction].mechanic === 'grounds' && typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS) {
    extra += ' · Акты охоты: <b>' + BEAST_GROUNDS.acts + '</b>' +
      (BEAST_GROUNDS.packs ? ' · стай: <b>' + BEAST_GROUNDS.packs + '</b> (крупнейшая <b>' + BEAST_GROUNDS.packBest + '</b>)' : '');
  }
  const sig = 'gs|' + countLinks() + '|' + currentDiversity() + '|' + inc.toFixed(2) + '|' + extra;
  if (updateGridStats._sig === sig) return; /* не перерисовываем строку каждый кадр */
  updateGridStats._sig = sig;
  /* Ритуал культистов : участники · внешний круг · скорость · выплата · заряд */
  if (FACTION_INFO[faction].mechanic === 'formation') {
    const E = RITUAL_ENGINE || computeRitualEngine();
    const forms = Object.keys(INC_CTX.formActive).length;
    const rpct = Math.floor(ritualResonance);
    extra += ' · Ритуал: <b>' + E.participants + '</b>' + (forms ? ' · формаций: <b>' + forms + '</b>' : '') +
      (E.outer ? ' · внешний круг: <b>' + E.outer + '</b> (+' + Math.round(E.outerPay * 100) + '% 💰)' : '') +
      ' · ⚡<b>' + E.speed.toFixed(2) + '%/с</b>' + (E.capped ? ' (макс)' : '') +
      ' · 💰<b>+' + fmtShort(E.payout) + '</b>' +
      ' · Заряд: <b>' + rpct + '%</b>';
  }
  $('gridStats').innerHTML = 'Доход: <b>+' + inc.toFixed(2) + '/сек</b>' + extra;
  updateCooldownBadges();
}

/* БОЛЬШАЯ ШКАЛА РИТУАЛА над Алтарём — её невозможно не заметить.
 Золотая полоса, шиммер, пульс на подходе к выплате.*/
function renderRitualBar() {
  const bar = $('ritualBar');
  if (!bar) return;
  if (FACTION_INFO[faction].mechanic !== 'formation') { if (bar.style.display !== 'none') bar.style.display = 'none'; return; }
  if (bar.style.display !== '') bar.style.display = '';
  const E = RITUAL_ENGINE || computeRitualEngine();
  const pct = Math.min(100, ritualResonance);
  const fill = bar.querySelector('.rb-fill'), info = bar.querySelector('.rb-info'), label = bar.querySelector('.rb-label');
  if (!fill || !info) return;
  fill.style.width = pct + '%';
  bar.classList.toggle('almost', pct >= 80);
  let infoTxt;
  if (E.speed > 0) {
    label.textContent = '🔥 РИТУАЛ';
    infoTxt = '⚡ ' + E.speed.toFixed(2) + '%/с' + (E.capped ? ' (макс)' : '') + ' · 💰 +' + fmtShort(E.payout) + ' ' + DE_IMG + ' за цикл' +
      (E.outer ? ' · круг +' + Math.round(E.outerPay * 100) + '%' : '') + (E.banner ? ' · ' + E.banner : '');
  } else if (E.ready) {
    label.textContent = '🔥 РИТУАЛ';
    infoTxt = 'Нет участников — поставьте культистов в цепь от Алтаря (шкала не тает!)';
  } else {
    label.textContent = '🔥 РИТУАЛ';
    infoTxt = 'Поставьте Ритуальный Алтарь — без него ритуал не идёт';
  }
  if (info.dataset.sig !== infoTxt) { info.dataset.sig = infoTxt; info.innerHTML = infoTxt; }
}

/* Живые счётчики перезарядки способностей прямо на картах.
Патчит текст существующих бейджей каждый кадр — полный рендер поля не нужен.
 Покрывает: Зомби-рост (u1), Кладбище (12с), Врата Ада (25с).*/
function updateCooldownBadges() {
  const mech = FACTION_INFO[faction].mechanic;
  qsa('.cd-badge').forEach(el => {
    let txt = '';
    if (el.dataset.cd === 'mound' && typeof bldMoundTimer !== 'undefined') {
      const ab = activeAltBuff();
      if (ab.mult > 1 && altBuff.label.indexOf('ЖАТВА') >= 0) txt = '🗿 ×' + ab.mult + ' ' + Math.max(0, Math.ceil(altBuff.until - gameTime)) + 'с';
      else txt = '🗿 ' + Math.max(0, Math.ceil(30 - bldMoundTimer)) + 'с';
    } else if (el.dataset.cd === 'balr' && mech === 'chaos') {
      txt = '🌋 ' + Math.max(0, Math.ceil(20 - balrTimer)) + 'с';
    } else if (el.dataset.cd === 'gor' && mech === 'chaos') {
      txt = '♨️ ' + Math.max(0, Math.ceil(15 - gorTimer)) + 'с';
    } else if (el.dataset.cd === 'zav' && mech === 'chaos') {
      txt = '🎭 ' + Math.max(0, Math.ceil(30 - zavTimer)) + 'с';
    } else if (el.dataset.cd === 'trub' && mech === 'chaos') {
      txt = '📯 ' + Math.max(0, Math.ceil(45 - trubTimer)) + 'с';
    } else if (el.dataset.cd === 'grow') {
      /* Зомби (u1): накопленный рост + время до следующей ступени */
      const r = +el.dataset.r, c = +el.dataset.c2;
      const it = grid[r] && grid[r][c];
      if (it && it.cardId === 'u1') {
        const pct = Math.round((it.growBuff || 0) * 100);
        txt = '🧟 +' + pct + '% · ' + Math.max(0, Math.ceil(GROW_STEP - (it.growT || 0))) + 'с';
      }
    } else if (el.dataset.cd === 'grave' && typeof bldGraveTimer !== 'undefined') {
      txt = '🪦 ' + Math.max(0, Math.ceil(12 - bldGraveTimer)) + 'с';
    } else if (el.dataset.cd === 'gates' && typeof bldGatesTimer !== 'undefined') {
      txt = '🚪 ' + Math.max(0, Math.ceil(25 - bldGatesTimer)) + 'с';
    }
    if (el.textContent !== txt) el.textContent = txt;
  });
}
