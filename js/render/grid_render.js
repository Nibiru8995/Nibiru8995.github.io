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
  /* Резец Тьмы: слоты столбов — ровно те же квадраты, что клетки грида */
  const rsr = $('relicSlotRow');
  if (rsr) rsr.style.setProperty('--cell-size', sizeExpr);
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
    /* v1.5.0 «если активно — дышит»: туман ауры оживает (aura-live), только
       когда особенность источника реально работает (✦ активна) или таймерная
       способность только что сработала (fxUntil). Спящий источник — тихая дымка. */
    /* у ЗДАНИЙ specialActive всегда true (пассивка) — они оживают только
       в момент срабатывания (fxUntil); «дышат» лишь карты с живой особенность */
    const live = (!CARDS[it.cardId].isBuilding && !!SPECIALS[it.cardId] && specialActive(CARDS[it.cardId], it, r, c).active) || it.fxUntil > gameTime;
    for (let dr = -R; dr <= R; dr++) for (let dc = -R; dc <= R; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) > R) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      if (!playableMask[nr] || !playableMask[nr][nc]) continue; /* закрытые клетки не подсвечиваем */
      const k = nr + ',' + nc;
      const prev = map[k];
      map[k] = { color: prev ? prev.color : color, big: R >= 2 || (prev && prev.big), live: live || (prev && prev.live) };
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
   Резец Тьмы: подпись вынесена ИЗ ряда, клетки — строгие квадраты того же
   размера, что и клетки грида (1:1 по колонкам Алтаря).
   Реликвии культистов — глобальные (ритуальные): столб не важен.
   Открывается на Эпохе 2 (applyFeatureLocks). */
function renderRelicSlots() {
  const row = $('relicSlotRow');
  if (!row) return;
  if (epoch < RELIC_SLOT_EPOCH) { if (row.style.display !== 'none') row.style.display = 'none'; return; }
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
  /* v1.3.1 ТЗ: надпись «Столбы — реликвии до конца Эпохи…» убрана — бред */
  row.innerHTML = '<div class="rsr-grid">' + slots + '</div>';
  const g = row.querySelector('.rsr-grid');
  g.style.gridTemplateColumns = 'repeat(' + playableSize + ', var(--cell-size))';
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
      if (az.live) cell.classList.add('aura-live'); /* v1.5.0: дышит, когда работает */
      cell.style.setProperty('--auraC', az.color);
    } else cell.style.removeProperty('--auraC');
    /* ФИДБЕК 1 (раунд 3): ЯРКАЯ золотая зона Ауры Власти — видно на любых клетках,
       что соседние с Личем попадают под эффект (первые 2 звена без затухания).
       v1.4.0: зона Пакта Тишины Лича — зелено-золотая (звенья на длине 2 не слабеют). */
    if (incomeCache.lichZone && incomeCache.lichZone.indexOf(r + ',' + c) >= 0) cell.classList.add('aura-lich');
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
      if (colRel && epoch >= RELIC_SLOT_EPOCH) badges += '<span class="anchor-badge relic-mini" style="color:' + RELIC_RARITY_COLOR(colRel.rarity) + '" title="Столбец под реликвией: ' + colRel.name + '\n✅ ' + colRel.rule + '\n❌ ' + (colRel.curse || '') + '">' + relicArtHTML(colRel, 'relic-mini-img', '') + '</span>';
      /* v1.4.0: ⛓ ПРИКОВАННОЕ ЗДАНИЕ (Скованным Цепью) */
      if (card.isBuilding && INC_CTX.bld && INC_CTX.bld.chainedAt && INC_CTX.bld.chainedAt.has(r + ',' + c))
        badges += '<span class="anchor-badge" style="color:#b8c4d4" title="⛓ Приковано Скованным Цепью: кулдаун абилки вдвое короче, аура ×1.5, звено с любой соседней картой">⛓</span>';
      /* v1.4.0: ⛓ сам Скованный — маркер, когда его цепь работает */
      if (card.id === 'u11' && getNeighbors(r, c).some(n => CARDS[n.item.cardId].isBuilding))
        badges += '<span class="anchor-badge" style="color:#b8c4d4" title="Цепь здания захвачена">⛓</span>';
      /* ЗДАНИЯ: значок постройки + бейдж якоря для Алтаря */
      if (card.isBuilding) badges += '<span class="anchor-badge" style="color:#e8c060" title="Здание">🏛</span>';
      if (RITUAL_SOURCES[card.id]) badges += '<span class="anchor-badge">🔱</span>';
      /* Уникальная механика (SPECIALS): ✦ светится, когда особенность СЕЙЧАС работает —
         тусклый значок означает, что бонусы карты не задействованы */
      if (SPECIALS[card.id]) {
        const sa = specialActive(card, item, r, c);
        badges += '<span class="anchor-badge sp-badge' + (sa.active ? ' on' : '') + '" title="' +
          (sa.active ? 'Особенность активна' : 'Особенность не задействована') + ': ' + (SPECIALS[card.id] || '').replace(/"/g, '') + '">✦</span>';
        /* v1.5.0 «если активно — дышит»: работающая особенность мерцает,
           спящая — стоит тихо. Здания исключены: их пассивка «активна» всегда,
           вспышка-каст они получают в момент срабатывания (fx-live) */
        if (sa.active && !card.isBuilding) cardEl.classList.add('sp-live');
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
      /* v1.5.0: таймерная способность сработала (fxUntil от fxMarkBuildings) — вспышка-каст */
      if (item.fxUntil > gameTime) cardEl.classList.add('fx-live');
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
      (it.boomUntil > gameTime ? '!' : ''); /* v1.5.1: fxUntil НЕ в сигнатуре — вспышки обновляет updateFxLive (дёшево), поле не стирается */
  }
  return s;
}

/* v1.5.1: вспышки способностей (fxUntil) и живой туман аур обновляются
   классами РАЗ в 250мс — без стирания DOM. Прежний вариант (флаг F в
   сигнатуре) перерисовывал всё поле 2 раза за цикл Кладбища: игрок видел
   мигание, а все анимации перезапускались строем. classList.toggle не
   перезапускает анимацию, пока класс не изменился — «дышит» только то,
   что начало/кончило работать. В харнесе gridEl === null — выходим тихо. */
function updateFxLive() {
  if (!gridEl) return;
  const n = playableSize, st = gridStart();
  const cells = gridEl.children;
  if (cells.length !== n * n) return;
  const auraMap = buildAuraMap();
  for (let dr = 0; dr < n; dr++) for (let dc = 0; dc < n; dc++) {
    const r = st + dr, c = st + dc;
    const cell = cells[dr * n + dc];
    const it = grid[r][c];
    if (cell.firstElementChild) cell.firstElementChild.classList.toggle('fx-live', !!(it && it.fxUntil > gameTime));
    const az = auraMap[r + ',' + c];
    cell.classList.toggle('aura-live', !!(az && az.live));
  }
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
    case 'u4': case 'u12':
      return { active: nb.some(n => !!findPair(card, CARDS[n.item.cardId])) };
    case 'u8':
      /* Пакт Тишины: активен при звеньях и со Склепом, и с Некромантом */
      return { active: nb.some(n => n.item.cardId === 'bl_crypt') && nb.some(n => n.item.cardId === 'u5') };
    case 'u6': return { active: nb.some(n => { const q = CARDS[n.item.cardId]; return q.faction === 'undead' && q.rarity === 3; }) };
    case 'u7': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u9': return { active: r2.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u10': return { active: nb.some(n => CARDS[n.item.cardId].faction === 'undead') };
    case 'u11': return { active: nb.some(n => CARDS[n.item.cardId].isBuilding) };
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
   v1.5.0: у НЕЖИТИ все связи — цепи. v1.5.6: связь — банда из пяти тёмных
   цепочек между самыми кромками карт (центры карт свободны).
   Светится и бежит только свет по металлу: холодный проблеск по всем цепям,
   яркий фиолетовый — по особым связям. Прочие фракции — прежний вид. */
function mkLine(cls, coords) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', coords.x1); l.setAttribute('y1', coords.y1);
  l.setAttribute('x2', coords.x2); l.setAttribute('y2', coords.y2);
  l.setAttribute('class', cls);
  synergySvg.appendChild(l);
  return l;
}

function drawSynergies() {
  synergySvg.innerHTML = '';
  const ug = FACTION_INFO[faction].mechanic === 'chain'; /* v1.5.0: цепи — тема нежити */
  /* v1.5.6: связь рисуют спрайты chains_h/chains_v + проблески glint_* */
  const n = playableSize, st = gridStart();
  const sr = synergySvg.getBoundingClientRect();
  const cellAt = (r, c) => gridEl.children[(r - st) * n + (c - st)];
  const cx = (c) => { const b = cellAt(st, c).getBoundingClientRect(); return b.left - sr.left + b.width / 2; };
  const cy = (r) => { const b = cellAt(r, st).getBoundingClientRect(); return b.top - sr.top + b.height / 2; };
  /* v1.5.7: геометрия цепи — ВО ВСЮ КРОМКУ: связь идёт вдоль ОБЩЕГО края
     карт по всей его высоте/ширине. Горизонтальные соседи — вертикальный
     шов (вся высота карты), вертикальные соседи — горизонтальный шов
     (вся ширина карты). Центры карт свободны: банда лежит только на
     стыке клеток. Координаты — из прямоугольников самих карт. */
  const ugLinkCoords = !ug ? null : (r, c, nr, nc) => {
    const ca = cellAt(r, c), cb = cellAt(nr, nc);
    const ea = ca.querySelector('.card') || ca, eb = cb.querySelector('.card') || cb;
    const ra = ea.getBoundingClientRect(), rb = eb.getBoundingClientRect();
    if (r === nr) {
      const mx = (ra.right + rb.left) / 2 - sr.left;
      return { x1: mx, y1: ra.top - sr.top, x2: mx, y2: ra.bottom - sr.top };
    }
    const my = (ra.bottom + rb.top) / 2 - sr.top;
    return { x1: ra.left - sr.left, y1: my, x2: ra.right - sr.left, y2: my };
  };
  for (let r = st; r < st + n; r++) for (let c = st; c < st + n; c++) {
    const item = grid[r][c]; if (!item) continue;
    const card = CARDS[item.cardId];
    getNeighbors(r, c).forEach(nb => {
      const isForward = (r < nb.r) || (r === nb.r && c < nb.c);
      if (!isForward) return;
      const nCard = CARDS[nb.item.cardId];
      const coords = { x1: cx(c), y1: cy(r), x2: cx(nb.c), y2: cy(nb.r) };
      const pair = findPair(card, nCard);
      if (!pair) {
        /* Цепь нежити: соседство без пары всё равно даёт бонус */
        if (ug && card.faction === 'undead' && nCard.faction === 'undead') drawUgLink(ugLinkCoords(r, c, nb.r, nb.c), 'plain', undefined, false);
        return;
      }
      const kind = pair.kind === 'mult' ? 'mult' : pair.kind === 'chain' ? 'chain' : pair.kind === 'royal' ? 'royal' : 'good';
      const lk = linkKey(r, c, nb.r, nb.c);
      const lf = incomeCache.linkFactors && incomeCache.linkFactors[lk] !== undefined ? incomeCache.linkFactors[lk] : 1;
      const royal = !!(incomeCache.linkRoyal && incomeCache.linkRoyal[lk]);
      const lichW = !!(incomeCache.linkLich && incomeCache.linkLich[lk]);
      if (ug) {
        /* вся связь нежити = тёмная банда цепей; особые связи получают фиолетовый отблеск */
        const mode = royal ? 'royal' : lichW ? 'lich' : kind === 'chain' ? 'big' : 'plain';
        drawUgLink(ugLinkCoords(r, c, nb.r, nb.c), mode, lf, kind === 'mult');
        return;
      }
      /* прежний вид (культисты/звери/демоны): линия синергии + бегущий поток.
         faded — реальное затухание из экономики; royal — Знамение Владыки;
         lich — Пакт Тишины Лича; dead — мёртвое звено */
      mkLine(kind === 'mult' ? 'base-mult' : kind === 'chain' ? 'base-chain' : kind === 'royal' ? 'base-royal' : 'base-good', coords);
      mkLine('syn-flow' + (kind === 'mult' ? ' mult' : kind === 'chain' ? ' chainflow' : '') +
        (lf === 0 ? ' dead' : lf < 1 ? ' faded' : '') +
        (lichW ? ' lich' : royal ? ' royal' : ''), coords);
    });
  }
}

/* ============================================================
   v1.5.8 «ПОПЕРЕЧНЫЕ ОКОВЫ» — цепь СКРЕПЛЯЕТ карты.
   УРОК v1.5.7 (фидбек): «как цепи, которые держат два объекта,
   могут идти ВДОЛЬ этих объектов?» — никак. Цепь, которая держит,
   идёт ПОПЕРЁК шва, от карты к карте — как скоба/стежок.
   ГЕОМЕТРИЯ: банда лежит на ОБЩЕМ крае карт во всю его высоту
   (соседи в ряду — вертикальный шов) / ширину (соседи в столбце —
   горизонтальный шов), толщина 36px (18px на каждую карту, центры
   свободны). Внутри — цепочки-скобы ПОПЕРЁК шва: горизонтальные
   (chains_x) на вертикальном шве, вертикальные (chains_y) на
   горизонтальном, распределены по всей длине кромки; концы цепей
   растворяются альфой — «ныряют» под кромку карты.
   СПРАЙТ: 4 по-разному натянутых цепи в плитке 36x24: тугая мелкая,
   тяжёлые кольца с дырой, провисшая с костяной бусиной, тонкая нить;
   холодное кладбищенское железо, патина (генератор
   scripts/gen_chains_sprite.py). Стопка/ряд плиток с периодом 24px
   внутри клипа звена (уроки v1.5.2/3: растяжение = каша; ни
   pattern'ов, ни transform).
   ПРОБЛЕСКИ: свет бежит ВДОЛЬ ЦЕПИ — поперёк шва, от карты к карте;
   плитки света стоят по всей кромке и едут синхронно, накрывая всю
   связку. Свечение — ТА ЖЕ геометрия цепей в яркой палитре с
   колокольным окном, поэтому оно ВСЕГДА лежит ровно на звеньях.
   ОСОБЫЕ СВЯЗИ (royal — Владыка, lich — Пакт Тишины, big — Скованный,
   mult — пары-множители) вместо тихого проблеска получают ЯРКИЙ
   ФИОЛЕТОВЫЙ отблеск (glint_royal) — шире, ярче и быстрее.
   Состояние звена из экономики (faded/dead) гасит всю банду (CSS
   .ug-band); мёртвое звено не светится вовсе.
   ============================================================ */
const UG_TILE = 24, UG_BAND = 36; /* 24 — период стопки вдоль шва, 36 — толщина банды поперёк */
/* v1.5.6.1: ASSET_VER_Q (utils.js) — анти-кэш суффикс на спрайтах звена */
const UG_IMG = {
  /* _x — плитки для ВЕРТИКАЛЬНОГО шва (цепи поперёк идут горизонтально),
     _y — для ГОРИЗОНТАЛЬНОГО шва (цепи поперёк идут вертикально) */
  bandX: 'assets/fx/chains_x.png' + ASSET_VER_Q, bandY: 'assets/fx/chains_y.png' + ASSET_VER_Q,
  paleX: 'assets/fx/glint_pale_x.png' + ASSET_VER_Q, paleY: 'assets/fx/glint_pale_y.png' + ASSET_VER_Q,
  royalX: 'assets/fx/glint_royal_x.png' + ASSET_VER_Q, royalY: 'assets/fx/glint_royal_y.png' + ASSET_VER_Q
};
/* SMIL-анимация атрибута (x/y) с отрицательным begin — детерминированная
   фаза у каждой связи, без «строя» проблесков после перерисовки поля */
function ugAnim(attr, from, to, dur, phase) {
  const a = document.createElementNS('http://www.w3.org/2000/svg', 'animate');
  a.setAttribute('attributeName', attr);
  a.setAttribute('from', from.toFixed(1));
  a.setAttribute('to', to.toFixed(1));
  a.setAttribute('dur', dur + 's');
  a.setAttribute('begin', (-(phase * dur)).toFixed(2) + 's');
  a.setAttribute('repeatCount', 'indefinite');
  return a;
}
function drawUgLink(coords, mode, lf, isMult) {
  const NS = 'http://www.w3.org/2000/svg';
  const faded = lf !== undefined && lf > 0 && lf < 1, dead = lf === 0;
  const st = (faded ? ' faded' : dead ? ' dead' : '');
  /* v1.5.8: цепь-скоба ПОПЕРЁК шва: у соседей в ряду шов вертикальный
     (x1===x2) — цепи chains_x идут горизонтально, от левой карты к
     правой; у соседей в столбце шов горизонтальный (y1===y2) — цепи
     chains_y идут вертикально, от верхней карты к нижней. */
  const horiz = coords.x1 !== coords.x2;
  const L = Math.hypot(coords.x2 - coords.x1, coords.y2 - coords.y1);
  /* 1) тень-подложка вдоль шва: читаемость тёмного металла на пёстрых картах */
  mkLine('ug-shadow' + st, coords);
  /* 2) банда цепей: клип по звену + плитки на глобальной сетке.
     v1.5.8: скобы поперёк шва, распределены по всей кромке.
     Горизонтальный шов (соседи в столбце) — chains_y (24x36) в ряд
     слева направо; вертикальный (соседи в ряду) — chains_x (36x24)
     стопкой сверху вниз. */
  let defs = synergySvg.querySelector('defs');
  if (!defs) {
    defs = document.createElementNS(NS, 'defs');
    synergySvg.appendChild(defs);
  }
  const n = drawUgLink._n = (drawUgLink._n || 0) + 1;
  const half = UG_BAND / 2;
  /* горизонтальная банда: длина по X от левого края карты, толщина по Y
     вокруг средней линии шва; вертикальная — зеркально */
  const bx = horiz ? coords.x1 : coords.x1 - half;
  const by = horiz ? coords.y1 - half : coords.y1;
  const bw = horiz ? L : UG_BAND, bh = horiz ? UG_BAND : L;
  const cp = document.createElementNS(NS, 'clipPath');
  cp.setAttribute('id', 'ugc' + n);
  const cr = document.createElementNS(NS, 'rect');
  cr.setAttribute('x', bx.toFixed(1)); cr.setAttribute('y', by.toFixed(1));
  cr.setAttribute('width', bw.toFixed(1)); cr.setAttribute('height', bh.toFixed(1));
  cp.appendChild(cr);
  defs.appendChild(cp);
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('clip-path', 'url(#ugc' + n + ')');
  g.setAttribute('class', 'ug-band' + st);
  const mkIm = (href, x, y, w, h) => {
    const im = document.createElementNS(NS, 'image');
    im.setAttribute('href', href); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
    im.setAttribute('x', x.toFixed(1)); im.setAttribute('y', y.toFixed(1));
    im.setAttribute('width', String(w)); im.setAttribute('height', String(h));
    im.setAttribute('style', 'image-rendering:pixelated');
    return im;
  };
  const bandHref = horiz ? UG_IMG.bandY : UG_IMG.bandX;
  if (horiz) {
    for (let x = coords.x1; x < coords.x2; x += UG_TILE)
      g.appendChild(mkIm(bandHref, x, by, UG_TILE, UG_BAND));
  } else {
    for (let y = coords.y1; y < coords.y2; y += UG_TILE)
      g.appendChild(mkIm(bandHref, bx, y, UG_BAND, UG_TILE));
  }
  synergySvg.appendChild(g);
  /* 3) проблеск: свет бежит ВДОЛЬ ЦЕПИ — ПОПЕРЁК шва, от карты к карте;
     плитки света стоят по всей кромке (те же позиции, что у банды) и
     едут синхронно — волна накрывает всю связку разом; мёртвое звено
     не светится вовсе */
  if (!dead) {
    const special = mode === 'royal' || mode === 'lich' || mode === 'big' || isMult;
    const href = special ? (horiz ? UG_IMG.royalY : UG_IMG.royalX)
                         : (horiz ? UG_IMG.paleY : UG_IMG.paleX);
    const dur = special ? 2.6 : 4.2;
    const phase = (Math.abs(Math.round(coords.x1 * 7 + coords.y1 * 13)) % 97) / 97;
    const gw = horiz ? UG_TILE : UG_BAND, gh = horiz ? UG_BAND : UG_TILE;
    const mkGlint = (x, y, attr, from, to) => {
      const q = mkIm(href, x, y, gw, gh);
      q.setAttribute('class', 'ug-glint');
      q.appendChild(ugAnim(attr, from, to, dur, phase));
      g.appendChild(q);
    };
    if (horiz) {
      /* плитка света 24x36 въезжает сверху шва и выезжает снизу:
         y от (by - 36) до (by + 36) — окно проходит всю толщу банды */
      for (let x = coords.x1; x < coords.x2; x += UG_TILE)
        mkGlint(x, by - UG_BAND, 'y', by - UG_BAND, by + UG_BAND);
    } else {
      for (let y = coords.y1; y < coords.y2; y += UG_TILE)
        mkGlint(bx - UG_BAND, y, 'x', bx - UG_BAND, bx + UG_BAND);
    }
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
  /* v1.3.1 ТЗ: из статов убраны «Активных звеньев» и «Уникальных пар» —
     надбавки за разнообразие больше нет, строки не вводят в заблуждение */
  $('gridStats').innerHTML = 'Доход: <b>+' + inc.toFixed(2) + '/сек</b>' + extra;
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
