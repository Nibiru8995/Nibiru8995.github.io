'use strict';
/* ============================================================
   РЕНДЕР: ГРИД / АЛТАРЬ (render/grid_render.js)
   Отрисовка ТОЛЬКО открытых клеток (пункт 9 ТЗ): закрытая зона
   не существует для игрока, пока не куплено расширение Алтаря.
   Размер сетки — только нечётный (3×3 → 5×5 → 7×7 → 9×9).
   Карты (эмодзи), бейджи дохода, SVG-линии синергий и цепей.
   ============================================================ */

const gridEl = document.getElementById('grid');
const synergySvg = document.getElementById('synergySvg');
const tooltip = document.getElementById('tooltip');
const banner = document.getElementById('selectionBanner');

/* Смещение открытого квадрата внутри 9×9-матрицы данных */
function gridStart() { return Math.floor((GRID_SIZE - playableSize) / 2); }

/* Подгонка сетки под текущий размер: клетки крупнее на малом Алтаре */
function applyGridMetrics() {
  const n = playableSize;
  const cap = { 3: 78, 5: 62, 7: 52, 9: 46 }[n] || 46;
  const sizeExpr = 'min(' + cap + 'px, calc(52vh / ' + n + '), calc((100vw - 120px) / ' + n + '))';
  const wrap = $('gridWrap');
  if (wrap) wrap.style.setProperty('--cell-size', sizeExpr);
  gridEl.style.gridTemplateColumns = 'repeat(' + n + ', var(--cell-size))';
  gridEl.style.gridTemplateRows = 'repeat(' + n + ', var(--cell-size))';
}

/* Карты/здания, чья механика действует на ОКРУЖЕНИЕ: радиус ауры.
   Радиусы зданий — BUILDING_AURA (data/buildings.js), карт — здесь.
   Аура подсвечивает ВСЕ клетки зоны — включая пустые. */
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
  return map;
}

function buildGrid() {
  applyGridMetrics();
  gridEl.innerHTML = '';
  const n = playableSize;
  for (let i = 0; i < n * n; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    gridEl.appendChild(cell);
  }
  renderGrid();
}

/* ================= ПАНЕЛЬ РЕЛИКВИЙ (слева от коллекции, v1.2.5) =================
   Список столбцов Алтаря: клик по строке — вставить/снять реликвию.
   Открывается на Эпохе 2 (applyFeatureLocks). */
function renderRelicPanel() {
  const panel = $('relicPanel'), list = $('relicPanelList');
  if (!panel || !list) return;
  if (epoch < RELIC_SLOT_EPOCH) { panel.style.display = 'none'; return; }
  panel.style.display = '';
  const st = gridStart();
  let html = '';
  for (let dc = 0; dc < playableSize; dc++) {
    const c = st + dc;
    const rel = relicAtCol(c);
    if (rel) {
      html += '<div class="rp-row filled" data-col="' + c + '" style="--relicC:' + RELIC_RARITY_COLOR(rel.rarity) + '">' +
        '<span class="rp-num">Столб ' + (c + 1) + '</span>' +
        '<span class="rp-ic">' + relicArtHTML(rel, 'rp-img', '') + '</span>' +
        '<span class="rp-name">' + rel.name + '</span></div>';
    } else {
      html += '<div class="rp-row empty" data-col="' + c + '">' +
        '<span class="rp-num">Столб ' + (c + 1) + '</span>' +
        '<span class="rp-ic"><span class="rp-plus">+</span></span>' +
        '<span class="rp-name">пусто — вставить</span></div>';
    }
  }
  const owned = RELICS_OWNED.size;
  list.innerHTML = html;
  list.querySelectorAll('.rp-row').forEach(row => {
    row.onclick = () => onColSlotClick(+row.dataset.col);
  });
  /* Заголовок панели: счётчик собранных */
  panel.querySelector('.relic-panel-sub').textContent =
    'собрано ' + owned + ' · клик — вставить/снять';
}

function onColSlotClick(c) {
  if (epoch < RELIC_SLOT_EPOCH) return;
  if (relicSlots[c]) {
    const r = relicById(relicSlots[c]);
    delete relicSlots[c];
    computeIncome(); renderGrid(); updateHUD(); saveRun();
    toast(r.icon + ' «' + r.name + '» снята со столбца ' + (c + 1));
    return;
  }
  const avail = unassignedRelics();
  if (!avail.length) { toast('Свободных реликвий нет — они добываются из гачи (с Эпохи ' + RELIC_DROP_EPOCH + ')'); return; }
  mk('relicPick', '<h2>⚒ Реликвия в столбец ' + (c + 1) + '</h2>' +
    '<div class="res">Бафф и дебафф подействуют на ВСЮ эту колонку Алтаря.</div>' +
    '<div id="relicPickGrid"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="relicPickX">Отмена</button></div>', 560);
  $('relicPickX').onclick = () => close_('relicPick');
  $('relicPickGrid').innerHTML = avail.map(id => {
    const r = relicById(id);
    return '<div class="relic-pick" data-id="' + id + '" style="border-color:' + RELIC_RARITY_COLOR(r.rarity) + '">' +
      relicArtHTML(r, 'relic-pick-img', '') + '<span><b>' + r.name + '</b> ' + '★'.repeat(r.rarity) +
      '<br><small style="color:#8fc87f">✅ ' + r.buff + '</small>' +
      '<br><small style="color:#e08a8a">❌ ' + r.debuff + '</small></span></div>';
  }).join('');
  $('relicPickGrid').querySelectorAll('.relic-pick').forEach(el => {
    el.onclick = () => {
      relicSlots[c] = el.dataset.id;
      close_('relicPick');
      const r = relicById(el.dataset.id);
      toast(r.icon + ' «' + r.name + '» встала в столбец ' + (c + 1));
      sfx('place');
      computeIncome(); renderGrid(); updateHUD(); saveRun();
    };
  });
  open_('relicPick');
}

function renderGrid() {
  /* Защита: при смене размера Алтаря клетки пересоздаются автоматически */
  if (gridEl.children.length !== playableSize * playableSize) { buildGrid(); return; }
  const n = playableSize, st = gridStart();
  const cells = gridEl.children;
  const auraMap = buildAuraMap();
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = cells[dr * n + dc];
    const item = grid[r][c];
    cell.innerHTML = ''; cell.className = 'cell playable';
    cell.dataset.r = r; cell.dataset.c = c;
    cell.onclick = () => onCellClick(r, c);
    if (r === 4 && c === 4) cell.classList.add('center-cell');
    /* ФИДБЕК (раунд 3): аура — подсветка ВСЕХ клеток зоны (вкл. пустые) */
    const az = auraMap[r + ',' + c];
    if (az) {
      cell.classList.add('aura-zone');
      if (az.big) cell.classList.add('r2');
      cell.style.setProperty('--auraC', az.color);
    }
    /* ФИДБЕК 1 (раунд 3): ЯРКАЯ золотая зона Ауры Власти — видно на любых клетках,
       что соседние с Личем попадают под эффект (первые 2 звена без затухания) */
    if (incomeCache.lichZone && incomeCache.lichZone.indexOf(r + ',' + c) >= 0) cell.classList.add('aura-warded');
    /* РИТУАЛ культистов (фидбек 3): клетки в ритуале и участники формаций.
       v1.0: живой визуал — мёртвые культисты тускнеют, активный Алтарь
       получает вращающееся кольцо рун, всплеск резонанса — золото. */
    if (INC_CTX.ritual && INC_CTX.ritual.has(r + ',' + c)) cell.classList.add('ritual-cell');
    if (INC_CTX.formCell && INC_CTX.formCell[r + ',' + c]) cell.classList.add('ritual-part');
    if (surgeUntil > gameTime && INC_CTX.ritual && INC_CTX.ritual.has(r + ',' + c)) cell.classList.add('ritual-surge');

    if (moveMode && moveSource && moveSource.r === r && moveSource.c === c) cell.classList.add('move-source');
    else if (moveMode && moveSource && !item) cell.classList.add('move-target');
    else if (placingMode && pendingCard && !item) cell.classList.add('place-target');

    const hc = hintClass(r, c);
    if (hc) cell.classList.add(hc);

    if (item) {
      const card = CARDS[item.cardId];
      const cardEl = document.createElement('div');
      cardEl.className = 'card star' + card.rarity + ' f-' + card.faction;
      cardEl.style.setProperty('--glow', rarityColor(card.rarity));
      cardEl.style.setProperty('--cardBg', rarityBg(card.rarity));
      const income = calcCardIncome(r, c);
      const damaged = item.hp < item.maxHp - 0.01;
      const hpPct = damaged ? Math.max(0, (item.hp / item.maxHp) * 100) : 100;
      const hpColor = hpPct > 50 ? '#40d040' : hpPct > 20 ? '#e0c040' : '#ff3030';
      let badges = '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
        '<span class="card-name">' + card.name + '</span>' +
        '<span class="income-badge">' + income.toFixed(2) + '</span>';
      /* РЕЛИКВИИ 3.0: маркер реликвии на карте, стоящей в её столбце (спрайт) */
      const colRel = relicAtCol(c);
      if (colRel && epoch >= RELIC_SLOT_EPOCH) badges += '<span class="anchor-badge relic-mini" style="color:' + RELIC_RARITY_COLOR(colRel.rarity) + '" title="Столбец под реликвией: ' + colRel.name + '">' + relicArtHTML(colRel, 'relic-mini-img', '') + '</span>';
      /* ЗДАНИЯ: значок постройки + бейдж якоря для Алтаря */
      if (card.isBuilding) badges += '<span class="anchor-badge" style="color:#e8c060" title="Здание">🏛</span>';
      if (RITUAL_SOURCES[card.id] !== undefined) badges += '<span class="anchor-badge">🔱</span>';
      /* Уникальная механика ★4/★5 — золотой значок ✦ */
      if (SPECIALS[card.id]) badges += '<span class="anchor-badge" style="color:#e8c060">✦</span>';
      /* Счётчик перезарядки периодических зданий: ЖАТВА (Гора костей, 30с) и Кузня Хаоса (d9, 20с) */
      if (card.id === 'bl_mound') badges += '<span class="cd-badge" data-cd="mound"></span>';
      if (card.id === 'd9') badges += '<span class="cd-badge" data-cd="balr"></span>';
      /* ДЕМОНЫ: угли Хаоса (0..5) — оранжевые ромбы */
      if (FACTION_INFO[faction].mechanic === 'chaos' && item.embers > 0)
        badges += '<span class="ember-badge">' + '◆'.repeat(item.embers) + '</span>';
      /* ДЕМОНЫ: перегрев (×2) */
      if (FACTION_INFO[faction].mechanic === 'chaos' && item.boomUntil > gameTime)
        badges += '<span class="mut-badge" style="color:#ff6040">×2</span>';
      /* ДЕМОНЫ: накопленный бафф мутаций */
      if (item.mutBuff && item.mutBuff !== 1 && FACTION_INFO[faction].mechanic === 'chaos')
        badges += '<span class="mut-badge">▲</span>';
      /* ЗВЕРИ: сытость (▲) и голод (▼) по рациону */
      if (FACTION_INFO[faction].mechanic === 'cycle') {
        const fed = (item.predBuff || 0) + (item.graze || 0) + (item.floraBuff || 0) + (item.scavBuff || 0);
        if (fed > 0) badges += '<span class="mut-badge" style="color:#8fc87f">▲</span>';
        if (item.hunger !== undefined && item.hunger < 1) badges += '<span class="mut-badge" style="color:#e05a5a">▼</span>';
      }
      if (item.stacks > 1) badges += '<span class="stack-badge">x' + item.stacks + '</span>';
      cardEl.innerHTML = (damaged ? '<div class="hp-bar" style="width:' + hpPct + '%;background:' + hpColor + ';color:' + hpColor + ';"></div>' : '') +
        cardArtHTML(card, 'card-art', 'glyph') + badges;
      if (formation(r, c) > 1) cardEl.classList.add('in-formation');
      /* v1.0: состояние культиста в ритуале — живое/мёртвое, Алтарь в формации */
      if (FACTION_INFO[faction].mechanic === 'formation' && card.faction === 'cultist') {
        const k = r + ',' + c;
        if (RITUAL_SOURCES[card.id] !== undefined && INC_CTX.formActive[k]) cardEl.classList.add('altar-active');
        else if (!INC_CTX.ritual.has(k) && !INC_CTX.formCell[k] && !INC_CTX.ritualOuter.has(k)) cardEl.classList.add('cult-dead');
      }
      cardEl.addEventListener('mouseenter', e => showCardTooltip(e, card, income, r, c));
      cardEl.addEventListener('mousemove', moveTooltip);
      cardEl.addEventListener('mouseleave', hideTooltip);
      cell.appendChild(cardEl);
    }
  }
  drawSynergies();
  updateGridStats();
  renderOmens();
  renderRelicPanel();
}

/* SVG-линии: парные синергии + цепи нежити (координаты — по открытым клеткам).
   Фидбек 1: кольца аур УДАЛЕНЫ — ауры теперь подсвечивают области клеток. */
function drawSynergies() {
  synergySvg.innerHTML = '';
  const n = playableSize, st = gridStart();
  const sr = synergySvg.getBoundingClientRect();
  const cellAt = (r, c) => gridEl.children[(r - st) * n + (c - st)];
  const cx = (c) => { const b = cellAt(st, c).getBoundingClientRect(); return b.left - sr.left + b.width / 2; };
  const cy = (r) => { const b = cellAt(r, st).getBoundingClientRect(); return b.top - sr.top + b.height / 2; };
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    const item = grid[r][c]; if (!item) continue;
    const card = CARDS[item.cardId];
    getNeighbors(r, c).forEach(nb => {
      const isForward = (r < nb.r) || (r === nb.r && c < nb.c);
      if (!isForward) return;
      const nCard = CARDS[nb.item.cardId];
      const x1 = cx(c), y1 = cy(r), x2 = cx(nb.c), y2 = cy(nb.r);
      const pair = findPair(card, nCard);
      if (!pair) {
        /* Цепь нежити: соседство без пары всё равно даёт бонус */
        if (FACTION_INFO[faction].mechanic === 'chain' && card.faction === 'undead' && nCard.faction === 'undead') {
          const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1);
          line.setAttribute('x2', x2); line.setAttribute('y2', y2);
          line.setAttribute('class', 'chain-line');
          synergySvg.appendChild(line);
        }
        return;
      }
      const kind = pair.kind === 'mult' ? 'mult' : 'good';
      const base = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      base.setAttribute('x1', x1); base.setAttribute('y1', y1);
      base.setAttribute('x2', x2); base.setAttribute('y2', y2);
      base.setAttribute('class', kind === 'mult' ? 'base-mult' : 'base-good');
      synergySvg.appendChild(base);
      const lk = linkKey(r, c, nb.r, nb.c);
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      const warded = !!(incomeCache.linkWarded && incomeCache.linkWarded[lk]);
      const flow = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      flow.setAttribute('x1', x1); flow.setAttribute('y1', y1);
      flow.setAttribute('x2', x2); flow.setAttribute('y2', y2);
      /* faded — реальное затухание из экономики; warded — Аура Власти (Лич);
         dead — мёртвое звено культистов вне ритуала (фидбек 3) */
      flow.setAttribute('class', 'syn-flow' + (kind === 'mult' ? ' mult' : '') + (lf === 0 ? ' dead' : lf < 1 ? ' faded' : '') + (warded ? ' warded' : ''));
      synergySvg.appendChild(flow);
    });
  }
}

function updateGridStats() {
  const inc = calculateIncome();
  let extra = '';
  /* Активный буст «ЖАТВА» (Гора костей) */
  const b = activeAltBuff();
  if (b.mult > 1) extra += ' · <b style="color:#ffd34d">' + b.label + '</b> (' + Math.max(0, Math.ceil(b.until - gameTime)) + 'с)';
  /* Армия нежити (крупнейшая непрерывная цепь) */
  if (FACTION_INFO[faction].mechanic === 'chain' && incomeCache.armyBest > 1) {
    const am = Math.min(2, 1 + 0.015 * (incomeCache.armyBest - 1));
    extra += ' · Армия: <b>' + incomeCache.armyBest + '</b> (×' + am.toFixed(2) + ')';
  }
  /* Ритуал культистов: размер + активная формация + ЗАРЯД (v1.2.5) */
  if (FACTION_INFO[faction].mechanic === 'formation') {
    const inRitual = INC_CTX.ritual ? INC_CTX.ritual.size : 0;
    let fLabel = '—', formCount = 0;
    for (const k in INC_CTX.formActive) {
      const f = INC_CTX.formActive[k];
      fLabel = f.label + ' ×' + f.formMult.toFixed(2);
      formCount++;
    }
    if (formCount > 1) fLabel += ' ×' + formCount;
    const rpct = Math.floor(ritualResonance);
    const surgeLeft = Math.max(0, Math.ceil(surgeUntil - gameTime));
    extra += ' · Ритуал: <b style="color:' + (inRitual ? '#c9a227' : '#e08a8a') + '">' + inRitual + '</b> · Формация: <b>' + fLabel + '</b>' +
      ' · Заряд: <span class="res-bar"><i style="width:' + rpct + '%"></i></span> <b>' + rpct + '%</b>' +
      (surgeLeft ? ' · <b style="color:#ffe080">ВСПЛЕСК ×1.5 (' + surgeLeft + 'с)</b>' : '');
  }
  $('gridStats').innerHTML = 'Активных звеньев: <b>' + countLinks() + '</b>' +
    ' · Уникальных пар: <b>' + currentDiversity() + '</b> (+' + Math.round((incomeCache.diversityMult - 1) * 100) + '% дохода)' +
    ' · Доход: <b>+' + inc.toFixed(2) + '/сек</b>' + extra;
  updateCooldownBadges();
}

/* Живые счётчики перезарядки способностей прямо на картах (пункт 5 ТЗ).
   Патчит текст существующих бейджей каждый кадр — полный рендер поля не нужен. */
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
    }
    if (el.textContent !== txt) el.textContent = txt;
  });
}
