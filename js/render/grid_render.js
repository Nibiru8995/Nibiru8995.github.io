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
  gridEl.style.setProperty('--cell-size', 'min(' + cap + 'px, calc(52vh / ' + n + '), calc((100vw - 120px) / ' + n + '))');
  gridEl.style.gridTemplateColumns = 'repeat(' + n + ', var(--cell-size))';
  gridEl.style.gridTemplateRows = 'repeat(' + n + ', var(--cell-size))';
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

function renderGrid() {
  /* Защита: при смене размера Алтаря клетки пересоздаются автоматически */
  if (gridEl.children.length !== playableSize * playableSize) { buildGrid(); return; }
  const n = playableSize, st = gridStart();
  const cells = gridEl.children;
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = cells[dr * n + dc];
    const item = grid[r][c];
    cell.innerHTML = ''; cell.className = 'cell playable';
    cell.onclick = () => onCellClick(r, c);
    if (r === 4 && c === 4) cell.classList.add('center-cell');

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
      if (card.id === 'u10' || card.id === 'c4' || card.id === 'b10' || card.id === 'd10') badges += '<span class="anchor-badge">🔱</span>';
      /* Уникальная механика ★4/★5 — золотой значок ✦ */
      if (SPECIALS[card.id]) badges += '<span class="anchor-badge" style="color:#e8c060">✦</span>';
      if (item.mutBuff && item.mutBuff !== 1 && FACTION_INFO[faction].mechanic === 'chaos')
        badges += '<span class="mut-badge">' + (item.mutBuff > 1 ? '▲' : '▼') + '</span>';
      if (item.predBuff > 0 && FACTION_INFO[faction].mechanic === 'cycle')
        badges += '<span class="mut-badge" style="color:#8f8">🍖</span>';
      if (item.stacks > 1) badges += '<span class="stack-badge">x' + item.stacks + '</span>';
      cardEl.innerHTML = (damaged ? '<div class="hp-bar" style="width:' + hpPct + '%;background:' + hpColor + ';color:' + hpColor + ';"></div>' : '') +
        cardArtHTML(card, 'card-art', 'glyph') + badges;
      if (formation(r, c) > 1) cardEl.classList.add('in-formation');
      cardEl.addEventListener('mouseenter', e => showCardTooltip(e, card, income, r, c));
      cardEl.addEventListener('mousemove', moveTooltip);
      cardEl.addEventListener('mouseleave', hideTooltip);
      cell.appendChild(cardEl);
    }
  }
  drawSynergies();
  updateGridStats();
  renderOmens();
}

/* SVG-линии: парные синергии + цепи нежити (координаты — по открытым клеткам) */
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
      /* faded — реальное затухание из экономики; warded — звено под Аурой Власти (Лич) */
      flow.setAttribute('class', 'syn-flow' + (kind === 'mult' ? ' mult' : '') + (lf < 1 ? ' faded' : '') + (warded ? ' warded' : ''));
      synergySvg.appendChild(flow);
    });
  }
}

function updateGridStats() {
  const inc = calculateIncome();
  let extra = '';
  /* Активный буст «Жатва» (Жнец ★4) */
  const b = activeAltBuff();
  if (b.mult > 1) extra += ' · <b style="color:#ffd34d">' + b.label + '</b> (' + Math.max(0, Math.ceil(b.until - gameTime)) + 'с)';
  /* Армия нежити (крупнейшая непрерывная цепь) */
  if (FACTION_INFO[faction].mechanic === 'chain' && incomeCache.armyBest > 1) {
    const am = Math.min(2, 1 + 0.015 * (incomeCache.armyBest - 1));
    extra += ' · Армия: <b>' + incomeCache.armyBest + '</b> (×' + am.toFixed(2) + ')';
  }
  $('gridStats').innerHTML = 'Активных звеньев: <b>' + countLinks() + '</b>' +
    ' · Уникальных пар: <b>' + currentDiversity() + '</b> (+' + Math.round((incomeCache.diversityMult - 1) * 100) + '%)' +
    ' · Доход: <b>+' + inc.toFixed(2) + '/сек</b>' + extra;
}
