'use strict';
/* ============================================================
   ЛОГИКА: ГРИД / АЛТАРЬ (logic/grid.js) — v1.7.0 «Плата Душами»
   Установка, перемещение, удаление. Врагов на гриде НЕТ — грид это
   чистая экономика. Покупки клеток нет — поле растёт само при Эпохе.
   v1.7.0: РУЧНОЙ СТАК НА ГРИДЕ ОТКЛЮЧЁН (клик по занятой клетке больше
   НЕ докладывает копию) и кнопка «Стак» снята. Стопки собираются В
   КОЛОДЕ Гримуара (дубликаты, фиолетовая стрелка ▲, до ×5): на старте
   забега стек копий приходит в deckStacks, и постановка такой карты
   ставит на грид ГОТОВЫЙ юнит ×N — «как если бы N раз карта была
   стакнута на гриде».
   ============================================================ */

function linked(a, b) { return SYNERGY_PAIRS.some(p => pairApplies(a, b, p)); }

/* Подсветка клеток при выборе карты.
   У культистов (фидбек 3) звено живо только в ритуале — подсвечиваем
   клетки рядом с Алтарём/ритуалом, иначе игрок поставит «в пустоту».
   У зверей (фидбек 4) синергий нет — подсвечиваем клетки по РАЦИОНУ:
   хищнику — рядом с добычей, травоядному — рядом с флорой и т.д.
   У демонов — клетки в «толпе» (рядом 2+ демона), где копятся угли. */
function hintClass(r, c) {
  if (!placingMode || !pendingCard) return '';
  const p = CARDS[pendingCard]; const it = grid[r][c];
  const mech = FACTION_INFO[faction].mechanic;
  if (it) {
    /* ХТОНЬ (c10/c11) может встать НА МЕСТО Ритуального Алтаря.
       v1.7.0: остальные занятые клетки НЕ подсвечиваем — стаков
       на гриде больше нет, карта туда не встанет. */
    if ((p.id === 'c10' || p.id === 'c11') && it.cardId === 'bl_altar') return 'syn-hint';
    return '';
  }
  /* v1.4.0 КАРА СТОЛБА: карту, запрещённую реликвией, ставить нельзя — красная штриховка */
  if (!cardAllowedInCol(pendingCard, c)) return 'dead-spot';
  const ns = getNeighbors(r, c);
  /* Здание: подсветка — клетки его будущей ауры уже содержат полезное */
  if (p.isBuilding) {
    if (p.id === 'bl_altar' && mech === 'formation') return 'good-spot';
    if (ns.length) return 'good-spot';
    return '';
  }
  if (mech === 'grounds' && p.faction === 'beast' && p.diet) {
    /* Угодья: где эта зверюга будет сытa (радиус её будущих угодий) */
    const R = (typeof groundRadius === 'function') ? groundRadius(p) : (rarityRank(p.rarity) >= 4 ? 2 : 1);
    const inR = R >= 3 ? radius2(r, c).concat(getNeighbors(r, c)) : (R === 2 ? radius2(r, c) : ns);
    if (p.diet === 'pred') return inR.some(n => CARDS[n.item.cardId].diet === 'herb') ? 'good-spot' : '';
    if (p.diet === 'herb') return inR.some(n => CARDS[n.item.cardId].diet === 'flora') ? 'good-spot' : '';
    if (p.diet === 'flora') return inR.some(n => CARDS[n.item.cardId].diet === 'herb') ? 'good-spot' : '';
    if (p.diet === 'scav') return ''; /* падальщик чует широко — подсказку не рисуем */
    return '';
  }
  if (mech === 'chaos' && p.faction === 'demon') {
    /* Толпа: 2+ демона в 8-соседстве — угли будут копиться */
    const nearDemons = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    return nearDemons >= 2 ? 'good-spot' : '';
  }
  if (!ns.some(n => linked(p, CARDS[n.item.cardId]))) {
    /* v1.9.0 Призраки: ФАЗОВЫЕ звенья дотягиваются на расстояние 2 —
       подсвечиваем и их (умеренно — только реальные пары). */
    if (mech !== 'chain' || p.faction !== 'undead' || p.isBuilding) return '';
    const inFog = INC_CTX.necro && INC_CTX.necro.fog.has(r + ',' + c);
    if (p.subrace !== 'ghost' && !inFog) {
      /* не-призраку фаза открывается только парой с Призраком или Туманом */
      const ghostAt2 = [[0, 2], [0, -2], [2, 0], [-2, 0]].some(([dr, dc]) => {
        const nr = r + dr, nc = c + dc;
        return nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE && grid[nr][nc] &&
          CARDS[grid[nr][nc].cardId].subrace === 'ghost' && linked(p, CARDS[grid[nr][nc].cardId]);
      });
      if (!ghostAt2) return '';
    }
    const phaseHit = [[0, 2], [0, -2], [2, 0], [-2, 0]].some(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || !grid[nr][nc]) return false;
      const oc = CARDS[grid[nr][nc].cardId];
      if (!linked(p, oc)) return false;
      return p.subrace === 'ghost' || oc.subrace === 'ghost' || (inFog && p.cat === 'thrall');
    });
    return phaseHit ? 'good-spot' : '';
  }
  if (mech === 'formation' && p.faction === 'cultist') {
    /* рядом с ритуалом (в т.ч. с самим Алтарём) — живое звено; иначе звено будет мертво */
    if (INC_CTX.ritual.size === 0) return 'syn-hint'; /* Алтаря на поле нет ещё — не пугаем игрока */
    const nearRitual = ns.some(n => INC_CTX.ritual.has(n.r + ',' + n.c));
    return nearRitual ? 'good-spot' : 'dead-spot';
  }
  return 'good-spot';
}

function cancelSelection() {
  placingMode = false; pendingCard = null; deleteMode = false; moveMode = false; moveSource = null;
  const d = $('deleteToolBtn'), m = $('moveToolBtn');
  if (d) d.classList.remove('active');
  if (m) m.classList.remove('active');
  renderGrid(); renderCollection(); updateBanner();
}

function onCellClick(r, c) {
  hideTooltip();
  const item = grid[r][c];

  if (moveMode) {
    if (!moveSource) {
      if (item) { moveSource = { r, c }; renderGrid(); updateBanner(); }
      return;
    }
    if (moveSource.r === r && moveSource.c === c) { moveSource = null; renderGrid(); updateBanner(); return; }
    if (!playableMask[r][c]) return;
    const src = grid[moveSource.r][moveSource.c];
    if (!src) { moveSource = null; renderGrid(); updateBanner(); return; }
    /* v1.4.0 КАРА СТОЛБА: запрещённую реликвией карту нельзя тащить в её столб */
    if (!cardAllowedInCol(src.cardId, c)) {
      const rel = banRelicAtCol(c);
      toast('⛔ ' + (rel ? '«' + rel.name + '»' : 'Кара столба') + ': «' + CARDS[src.cardId].name + '» не примут в столб ' + (c + 1));
      return;
    }
    grid[r][c] = src; grid[moveSource.r][moveSource.c] = item || null;
    moveSource = null;
    computeIncome(); renderGrid(); renderCollection(); updateHUD(); updateBanner();
    return;
  }

  if (deleteMode) {
    if (item) {
      const doDelete = () => {
        /* Тёмное сохранение: карта возвращается в Гримуар, а не стирается */
        if (featOwned('darksave')) inventory[item.cardId] = (inventory[item.cardId] || 0) + item.stacks;
        grid[r][c] = null; stats.deleted++;
        computeIncome(); renderGrid(); renderCollection(); updateHUD();
      };
      if (rarityRank(CARDS[item.cardId].rarity) >= 4 || item.stacks > 1) {
        ask('Удалить навсегда: ' + CARDS[item.cardId].name + ' ×' + item.stacks + '?', doDelete);
      } else doDelete();
      cancelSelection();
    }
    return;
  }

  if (placingMode && pendingCard) {
    if (!playableMask[r][c] || (inventory[pendingCard] || 0) <= 0) return;
    const card = CARDS[pendingCard];
    /* v1.4.0 КАРА СТОЛБА: реликвия запрещает ставить эту карту в её столб */
    if (!cardAllowedInCol(pendingCard, c)) {
      const rel = banRelicAtCol(c);
      toast('⛔ ' + (rel ? '«' + rel.name + '»' : 'Кара столба') + ': «' + card.name + '» запрещена в столбе ' + (c + 1));
      sfx('click');
      return;
    }
    const hp = cardHp(card.rarity);
    /* v1.8.0: ЗАСТАКАННАЯ КАРТА КОЛОДЫ — ставим готовым юнитом ×N.
       Очередь deckStacks[id]: берём ПЕРВЫЙ (старший) стак; сколько
       копий реально есть в инвентаре — не больше. Ставится «как
       если бы N раз карта была стакнута на гриде»: суммарный HP,
       суммарный доход клетки, особенности — как у стака. */
    const q = deckStacks[pendingCard];
    const stackN = Math.min((q && q.length ? q[0] : 1), inventory[pendingCard] || 1);
    /* Списываем стак из очереди: постановка «тратит» первый элемент */
    const consumeStack = () => {
      if (q && q.length) { q.shift(); if (!q.length || (q.length === 1 && q[0] <= 1)) delete deckStacks[pendingCard]; }
    };
    /* ХТОНЬ (★5) встаёт НА МЕСТО Ритуального Алтаря: Алтарь вернётся в коллекцию */
    if (item && (card.id === 'c10' || card.id === 'c11') && item.cardId === 'bl_altar') {
      if (item.stacks > 1) { inventory.bl_altar = (inventory.bl_altar || 0) + item.stacks; }
      else inventory.bl_altar = (inventory.bl_altar || 0) + 1;
      grid[r][c] = { cardId: pendingCard, stacks: stackN, hp: hp * stackN, maxHp: hp * stackN,
        predBuff: 0, mutBuff: 1, embers: 0, hunger: 1, graze: 0, floraBuff: 0, scavBuff: 0, boomUntil: 0, petrCount: 0 };
      if (pendingCard === 'd3') grid[r][c].embers = 1;
      inventory[pendingCard] -= stackN;
      consumeStack();
      stats.placed++;
      sfx('epoch');
      fxAtCell(r, c, ['#c030c0', '#ff40ff', '#fff'], 20, 'big');
      fxFloatFromCell(r, c, 'ХТОНЬ НА МЕСТЕ АЛТАРЯ' + (stackN > 1 ? ' ×' + stackN : ''), '#ff60ff');
      toast('👁 <b>Хтонь заняла место Алтаря:</b> ритуал от неё сильнее!');
      computeIncome();
      if (inventory[pendingCard] <= 0) { delete inventory[pendingCard]; cancelSelection(); }
      else { renderGrid(); renderCollection(); updateHUD(); }
      return;
    }
    /* v1.7.0: РУЧНОЙ СТАК НА ГРИДЕ ОТКЛЮЧЁН — занятая клетка не принимает карту.
       Стопки собираются в колоде Гримуара (стрелка ▲ у карты). */
    if (item) return;
    grid[r][c] = { cardId: pendingCard, stacks: stackN, hp: hp * stackN, maxHp: hp * stackN,
      predBuff: 0, mutBuff: 1, embers: 0, hunger: 1, graze: 0, floraBuff: 0, scavBuff: 0, boomUntil: 0, petrCount: 0 };
    /* v1.1: «Уголёк» (d3) — вечно тлеет: появляется уже с 1 углём */
    if (pendingCard === 'd3') grid[r][c].embers = 1;
    stats.placed++;
    sfx('place');
    fxAtCell(r, c, [FACTION_INFO[card.faction].color, '#fff', '#e8c060'], 12);
    if (stackN > 1) fxFloatFromCell(r, c, 'СТАК ×' + stackN, '#b070ff');
    inventory[pendingCard] -= stackN;
    consumeStack();
    computeIncome();
    if (inventory[pendingCard] <= 0) { delete inventory[pendingCard]; cancelSelection(); }
    else { renderGrid(); renderCollection(); updateHUD(); }
  }
}

/* v1.7.0: АВТО-СТАК СНЯТ (кнопка «Стак») вместе с ручными стаками на гриде.
   Стопки теперь собираются в колоде Гримуара и приходят в забег через
   deckStacks — постановка такой карты сразу даёт юнит ×N. */
