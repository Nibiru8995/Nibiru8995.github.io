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

/* Подгонка сетки под текущий размер: клетки крупнее на малом Алтаре.
   v1.2.7: размер считается от ВЫСОТЫ экрана — интерфейс целиком
   помещается во вьюпорт без прокрутки страницы. */
function applyGridMetrics() {
  const n = playableSize;
  const cap = { 3: 82, 5: 74, 7: 62, 9: 52 }[n] || 52;
  const narrow = window.innerWidth <= 1100;
  const vhPad = narrow ? 9999 : 300, vwPad = narrow ? 40 : 560;
  const sizeExpr = 'min(' + cap + 'px, max(40px, calc((100vh - ' + vhPad + 'px) / ' + n + ')), max(40px, calc((100vw - ' + vwPad + 'px) / ' + n + ')))';
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

/* ================= СЛОТЫ РЕЛИКВИЙ НАД АЛТАРЁМ (v1.2.6) =================
   Отдельная панель слева УБРАНА (перегружала интерфейс). Вместо неё —
   компактный ряд слотов прямо над гридом: столб ↔ слот, клик — вставить/снять.
   Реликвии культистов — глобальные (ритуальные): столб не важен.
   Открывается на Эпохе 2 (applyFeatureLocks). */
function renderRelicSlots() {
  const row = $('relicSlotRow');
  if (!row) return;
  if (epoch < RELIC_SLOT_EPOCH) { if (row.style.display !== 'none') row.style.display = 'none'; return; }
  row.style.display = '';
  const st = gridStart();
  const cultGlobal = FACTION_INFO[faction].mechanic === 'formation';
  let html = '<div class="rsr-title" title="Реликвии живут до конца Эпохи. Клик — вставить/снять">⚒ СТОЛБА</div>';
  for (let dc = 0; dc < playableSize; dc++) {
    const c = st + dc;
    const rel = relicAtCol(c);
    if (rel) {
      html += '<div class="rsr-slot filled" data-col="' + c + '" style="--relicC:' + RELIC_RARITY_COLOR(rel.rarity) + '" title="' + rel.name + ' — клик: снять">' +
        relicArtHTML(rel, 'rsr-img', '') + '</div>';
    } else {
      html += '<div class="rsr-slot empty" data-col="' + c + '" title="Пустой столб — клик: вставить реликвию"><span>+</span></div>';
    }
  }
  if (cultGlobal) html += '<div class="rsr-note">ритуальные — действуют на весь ритуал</div>';
  /* рендер вызывается каждый кадр — перестраиваем только при изменениях */
  if (row.dataset.sig === html) return;
  row.dataset.sig = html;
  row.innerHTML = html;
  row.querySelectorAll('.rsr-slot').forEach(el => { el.onclick = () => onColSlotClick(+el.dataset.col); });
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
  const cultGlobal = FACTION_INFO[faction].mechanic === 'formation';
  mk('relicPick', '<h2>⚒ Реликвия в столб ' + (c + 1) + '</h2>' +
    '<div class="res">' + (cultGlobal
      ? 'Реликвии культистов — РИТУАЛЬНЫЕ: усиливают весь ритуал сразу, столб не важен.'
      : 'Бафф подействует на ВСЮ эту колонку Алтаря.') + '</div>' +
    '<div id="relicPickGrid"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="relicPickX">Отмена</button></div>', 560);
  $('relicPickX').onclick = () => close_('relicPick');
  $('relicPickGrid').innerHTML = avail.map(id => {
    const r = relicById(id);
    return '<div class="relic-pick" data-id="' + id + '" style="border-color:' + RELIC_RARITY_COLOR(r.rarity) + '">' +
      relicArtHTML(r, 'relic-pick-img', '') + '<span><b>' + r.name + '</b> ' + '★'.repeat(r.rarity) +
      '<br><small style="color:#8fc87f">✅ ' + r.buff + '</small></span></div>';
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
    /* ФИДБЕК (раунд 3): аура — подсветка ВСЕХ клеток зоны (вкл. пустые).
       v1.2.7: старый цвет ауры снимаем — иначе клетка «помнит» прошлую ауру. */
    const az = auraMap[r + ',' + c];
    if (az) {
      cell.classList.add('aura-zone');
      if (az.big) cell.classList.add('r2');
      cell.style.setProperty('--auraC', az.color);
    } else cell.style.removeProperty('--auraC');
    /* ФИДБЕК 1 (раунд 3): ЯРКАЯ золотая зона Ауры Власти — видно на любых клетках,
       что соседние с Личем попадают под эффект (первые 2 звена без затухания) */
    if (incomeCache.lichZone && incomeCache.lichZone.indexOf(r + ',' + c) >= 0) cell.classList.add('aura-warded');
    /* РИТУАЛ культистов (фидбек 3): клетки в ритуале, в формациях и ВНЕШНИЙ КРУГ.
       v1.0: живой визуал — мёртвые культисты тускнеют, активный Алтарь
       получает вращающееся кольцо рун, всплеск резонанса — золото. */
    if (INC_CTX.ritual && INC_CTX.ritual.has(r + ',' + c)) cell.classList.add('ritual-cell');
    else if (INC_CTX.ritualOuter && INC_CTX.ritualOuter.has(r + ',' + c)) cell.classList.add('ritual-outer');
    if (INC_CTX.formCell && INC_CTX.formCell[r + ',' + c]) cell.classList.add('ritual-part');

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
      /* v1.2.6: у культистов инкам 0 — бейдж показывает ВКЛАД В РИТУАЛ (⚡) */
      let badgeTxt = income.toFixed(2);
      if (FACTION_INFO[faction].mechanic === 'formation' && card.faction === 'cultist' && !card.isBuilding) {
        const cs = (INC_CTX.ritualCellSpeed && INC_CTX.ritualCellSpeed[r + ',' + c]) || 0;
        badgeTxt = cs > 0 ? '⚡' + cs.toFixed(2) : '· · ·';
      }
      let badges = '<span class="faction-dot" style="background:' + FACTION_INFO[card.faction].color + '"></span>' +
        '<span class="card-name">' + card.name + '</span>' +
        '<span class="income-badge">' + badgeTxt + '</span>';
      /* РЕЛИКВИИ 3.0: маркер реликвии на карте, стоящей в её столбце (спрайт) */
      const colRel = relicAtCol(c);
      if (colRel && epoch >= RELIC_SLOT_EPOCH) badges += '<span class="anchor-badge relic-mini" style="color:' + RELIC_RARITY_COLOR(colRel.rarity) + '" title="Столбец под реликвией: ' + colRel.name + '">' + relicArtHTML(colRel, 'relic-mini-img', '') + '</span>';
      /* ЗДАНИЯ: значок постройки + бейдж якоря для Алтаря */
      if (card.isBuilding) badges += '<span class="anchor-badge" style="color:#e8c060" title="Здание">🏛</span>';
      if (RITUAL_SOURCES[card.id]) badges += '<span class="anchor-badge">🔱</span>';
      /* Уникальная механика (SPECIALS): ✦ светится, когда особенность СЕЙЧАС работает —
         тусклый значок означает, что бонусы карты не задействованы */
      if (SPECIALS[card.id]) {
        const sa = specialActive(card, item, r, c);
        badges += '<span class="anchor-badge sp-badge' + (sa.active ? ' on' : '') + '" title="' +
          (sa.active ? 'Особенность активна' : 'Особенность не задействована') + ': ' + (SPECIALS[card.id] || '').replace(/"/g, '') + '">✦</span>';
      }
      /* Таймерные способности: бейджи перезарядки (v1.2.6: + Зомби-рост, Кладбище, Врата) */
      if (card.id === 'bl_mound') badges += '<span class="cd-badge" data-cd="mound"></span>';
      if (card.id === 'd9') badges += '<span class="cd-badge" data-cd="balr"></span>';
      if (card.id === 'u1') badges += '<span class="cd-badge" data-cd="grow" data-r="' + r + '" data-c2="' + c + '"></span>';
      if (card.id === 'bl_grave') badges += '<span class="cd-badge" data-cd="grave"></span>';
      if (card.id === 'bl_gates') badges += '<span class="cd-badge" data-cd="gates"></span>';
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
      /* v1.2.6: активный источник ритуала — кольцо рун */
      if (FACTION_INFO[faction].mechanic === 'formation' && card.faction === 'cultist') {
        const k = r + ',' + c;
        if (RITUAL_SOURCES[card.id] && INC_CTX.formActive[k]) cardEl.classList.add('altar-active');
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
  renderRelicSlots();
  renderRitualBar();
  lastRenderSig = gridSignature(); /* v1.2.7: после рендера запоминаем состояние */
}

/* ================= v1.2.7: САМОВОССТАНОВЛЕНИЕ ОТОБРАЖЕНИЯ =================
   «То ауры не отображаются, то карты дублируют» — любой рассинхрон DOM и
   состояния теперь чинится сам: раз в 250мс сравниваем дешёвую сигнатуру
   поля с той, что была при последнем рендере; разошлась — перерисовываем. */
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
      ',p' + Math.round(((it.predBuff || 0) + (it.graze || 0) + (it.floraBuff || 0) + (it.scavBuff || 0)) * 100) +
      ',y' + Math.round((it.hunger === undefined ? 1 : it.hunger) * 100) +
      (it.boomUntil > gameTime ? '!' : '');
  }
  return s;
}

/* ---- v1.2.6: АКТИВНОСТЬ ОСОБЕННОСТИ (✦) ----
   Тусклый ✦ = условие особенности не выполнено (карта работает "вхолостую").
   Золотой ✦ = бонус сейчас капает. Проверки простые и точные. */
function specialActive(card, item, r, c) {
  const nb = getNeighbors(r, c), r2 = radius2(r, c);
  switch (card.id) {
    case 'u0': return { active: r2.some(n => CARDS[n.item.cardId].rarity === 5) };
    case 'u1': return { active: (item.growBuff || 0) > 0 };
    case 'u2': return { active: r2.some(n => n.item.hp < n.item.maxHp - 0.01) };
    case 'u3': return { active: nb.some(n => n.item.stacks >= 2) };
    case 'u4': case 'u5': case 'u8': case 'u12':
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId])) };
    case 'u6': return { active: nb.some(n => { const q = CARDS[n.item.cardId]; return q.faction === 'undead' && q.rarity === 3; }) };
    case 'u7': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u9': return { active: r2.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u11': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'c1': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'cultist') };
    case 'c2': return { active: nb.some(n => RITUAL_SOURCES[n.item.cardId]) };
    case 'c3': return { active: radius2(r, c).some(n => INC_CTX.ritual && INC_CTX.ritual.has(n.r + ',' + n.c)) };
    case 'c12': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'cultist' && !INC_CTX.ritual.has(n.r + ',' + n.c)) };
    case 'd0': case 'd12': return { active: nb.some(n => (n.item.embers || 0) >= 3) };
    case 'd1': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd2': return { active: (item.harmBuff || 0) > 0 };
    case 'd6': case 'd8': case 'd10': case 'd14':
      return { active: (card.id === 'd10' || card.id === 'd14' ? r2 : nb).some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd9': return { active: (item.balrBuff || 1) > 1 || nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd11': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'd13': return { active: (item.tyrBuff || 1) > 1 };
    case 'd15': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'demon') };
    case 'b0': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'beast') };
    case 'b1': return { active: nb.some(n => n.item.cardId === 'b1' || n.item.cardId === 'b4') };
    case 'b12': return { active: nb.some(n => CARDS[n.item.cardId].diet === 'herb') };
    case 'b6': return { active: nb.some(n => isPredator(CARDS[n.item.cardId])) };
    case 'b8': return { active: nb.some(n => CARDS[n.item.cardId].diet === 'herb' || CARDS[n.item.cardId].diet === 'scav') };
    case 'b9': return { active: nb.some(n => isPredator(CARDS[n.item.cardId])) };
    default: return { active: true }; /* здания и остальное — всегда */
  }
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
  const sig = 'gs|' + countLinks() + '|' + currentDiversity() + '|' + inc.toFixed(2) + '|' + extra;
  if (updateGridStats._sig === sig) return; /* v1.2.7: не перерисовываем строку каждый кадр */
  updateGridStats._sig = sig;
  /* Ритуал культистов v1.2.7: участники · внешний круг · скорость · выплата · заряд */
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
  $('gridStats').innerHTML = 'Активных звеньев: <b>' + countLinks() + '</b>' +
    ' · Уникальных пар: <b>' + currentDiversity() + '</b> (+' + Math.round((incomeCache.diversityMult - 1) * 100) + '% дохода)' +
    ' · Доход: <b>+' + inc.toFixed(2) + '/сек</b>' + extra;
  updateCooldownBadges();
}

/* v1.2.6: БОЛЬШАЯ ШКАЛА РИТУАЛА над Алтарём — её невозможно не заметить.
   Золотая полоса, шиммер, пульс на подходе к выплате. */
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
    infoTxt = '⚡ ' + E.speed.toFixed(2) + '%/с' + (E.capped ? ' (макс)' : '') + ' · 💰 +' + fmtShort(E.payout) + ' 💎 за цикл' +
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

/* Живые счётчики перезарядки способностей прямо на картах (пункт 5 ТЗ).
   Патчит текст существующих бейджей каждый кадр — полный рендер поля не нужен.
   v1.2.6: + Зомби-рост (u1), Кладбище (12с) и Врата Ада (25с) — раньше их
   таймеры были невидимы. */
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
