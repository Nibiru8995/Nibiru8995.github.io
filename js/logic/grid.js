'use strict';
/* ============================================================
   ЛОГИКА: ГРИД / АЛТАРЬ (logic/grid.js)
   Установка, перемещение, удаление, авто-расстановка. Врагов на
   гриде НЕТ (пункт 5 ТЗ) — грид это чистая экономика.
   Покупки отдельных клеток НЕТ (пункты 7-8 ТЗ): размер поля растёт
   АВТОМАТИЧЕСКИ при переходе Эпохи (doEpochUp, logic/epochs.js).
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
    /* ХТОНЬ (c10/c11) может встать НА МЕСТО Ритуального Алтаря */
    if ((p.id === 'c10' || p.id === 'c11') && it.cardId === 'bl_altar') return 'syn-hint';
    if (it.cardId === pendingCard && it.stacks < maxStacks()) return 'stack-hint';
    if (linked(p, CARDS[it.cardId])) return 'syn-hint';
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
  if (mech === 'cycle' && p.faction === 'beast' && p.diet) {
    /* Рацион: где эта зверюга будет сытa */
    if (p.diet === 'pred') return ns.some(n => isPrey(CARDS[n.item.cardId])) ? 'good-spot' : '';
    if (p.diet === 'herb') return ns.some(n => CARDS[n.item.cardId].diet === 'flora') ? 'good-spot' : '';
    if (p.diet === 'flora') return ns.some(n => isPrey(CARDS[n.item.cardId]) || isPredator(CARDS[n.item.cardId])) ? 'good-spot' : '';
    if (p.diet === 'scav') return ns.length ? '' : ''; /* падальщику нужен радиус 2 — подсказку не рисуем */
    return '';
  }
  if (mech === 'chaos' && p.faction === 'demon') {
    /* Толпа: 2+ демона в 8-соседстве — угли будут копиться */
    const nearDemons = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    return nearDemons >= 2 ? 'good-spot' : '';
  }
  if (!ns.some(n => linked(p, CARDS[n.item.cardId]))) return '';
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
    /* ХТОНЬ (★5) встаёт НА МЕСТО Ритуального Алтаря: Алтарь вернётся в коллекцию */
    if (item && (card.id === 'c10' || card.id === 'c11') && item.cardId === 'bl_altar') {
      if (item.stacks > 1) { inventory.bl_altar = (inventory.bl_altar || 0) + item.stacks; }
      else inventory.bl_altar = (inventory.bl_altar || 0) + 1;
      grid[r][c] = { cardId: pendingCard, stacks: 1, hp, maxHp: hp,
        predBuff: 0, mutBuff: 1, embers: 0, hunger: 1, graze: 0, floraBuff: 0, scavBuff: 0, boomUntil: 0, petrCount: 0 };
      inventory[pendingCard]--;
      stats.placed++;
      sfx('epoch');
      fxAtCell(r, c, ['#c030c0', '#ff40ff', '#fff'], 20, 'big');
      fxFloatFromCell(r, c, 'ХТОНЬ НА МЕСТЕ АЛТАРЯ', '#ff60ff');
      toast('👁 <b>Хтонь заняла место Алтаря:</b> ритуал от неё сильнее!');
      computeIncome();
      if (inventory[pendingCard] <= 0) { delete inventory[pendingCard]; cancelSelection(); }
      else { renderGrid(); renderCollection(); updateHUD(); }
      return;
    }
    if (item) {
      if (item.cardId !== pendingCard || item.stacks >= maxStacks()) return;
      item.stacks++; item.maxHp += hp; item.hp += hp;
    } else {
      grid[r][c] = { cardId: pendingCard, stacks: 1, hp, maxHp: hp,
        predBuff: 0, mutBuff: 1, embers: 0, hunger: 1, graze: 0, floraBuff: 0, scavBuff: 0, boomUntil: 0, petrCount: 0 };
      /* v1.1: «Уголёк» (d3) — вечно тлеет: появляется уже с 1 углём */
      if (pendingCard === 'd3') grid[r][c].embers = 1;
    }
    stats.placed++;
    sfx('place');
    fxAtCell(r, c, [FACTION_INFO[card.faction].color, '#fff', '#e8c060'], 12);
    inventory[pendingCard]--;
    computeIncome();
    if (inventory[pendingCard] <= 0) { delete inventory[pendingCard]; cancelSelection(); }
    else { renderGrid(); renderCollection(); updateHUD(); }
  }
}

/* «СТАК» (пункт 8 ТЗ): кнопка НЕ размещает карты на пустые клетки — расстановка
   целиком у игрока. Она только докладывает карты из инвентаря В СУЩЕСТВУЮЩИЕ
   стопки таких же карт на поле, выбирая клетку с максимальным приростом дохода. */
function localInc(r, c) {
  let s = calcCardIncome(r, c);
  getNeighbors(r, c).forEach(n => { s += calcCardIncome(n.r, n.c); });
  return s;
}
function bestStackFor(id) {
  const hp = cardHp(CARDS[id].rarity);
  const cultMech = FACTION_INFO[faction].mechanic === 'formation' && CARDS[id].faction === 'cultist' && !CARDS[id].isBuilding;
  let best = null, bv = -1e9;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== id || it.stacks >= maxStacks()) continue; /* только уже стоящие такие же карты */
    /* v1.4.0: в столб с карой-запретом авто-стак не кладёт */
    if (!cardAllowedInCol(id, c)) continue;
    /* v1.2.7: у культистов инкам 0 — приоритет стака = участие в ритуале
       v1.2.9: приоритет уточнён — ЦЕПЬ > ВНЕШНИЙ КРУГ (служители тоже
       дают заряд/выплату, а раньше авто-стак их игнорировал) */
    if (cultMech) {
      let v = 0;
      if (INC_CTX.ritual && INC_CTX.ritual.has(r + ',' + c)) v = 2;
      else if (INC_CTX.ritualOuter && INC_CTX.ritualOuter.has(r + ',' + c)) v = 1;
      if (v > bv) { bv = v; best = { r, c, v }; }
      continue;
    }
    const b0 = localInc(r, c);
    it.stacks++; it.maxHp += hp; it.hp += hp;
    computeIncome();
    const v = localInc(r, c) - b0;
    it.stacks--; it.maxHp -= hp; it.hp -= hp;
    computeIncome();
    if (v > bv) { bv = v; best = { r, c, v }; }
  }
  return best;
}
function autoStack() {
  const invIds = Object.keys(inventory);
  if (!invIds.length) { toast('Инвентарь пуст — крутите карты!'); return; }
  if (!cardsOnGrid()) { toast('На Алтаре нет карт — поставьте первую вручную: клик по карте в коллекции'); return; }
  let n = 0;
  invIds.sort((a, b) => rarityRank(CARDS[b].rarity) - rarityRank(CARDS[a].rarity)).forEach(id => {
    while (inventory[id] > 0) {
      const b = bestStackFor(id);
      if (!b) break;
      const hp = cardHp(CARDS[id].rarity);
      const it = grid[b.r][b.c];
      it.stacks++; it.maxHp += hp; it.hp += hp;
      stats.placed++;
      sfx('place');
      inventory[id]--; n++;
      if (!inventory[id]) delete inventory[id];
    }
  });
  cancelSelection();
  computeIncome(); renderGrid(); renderCollection(); updateHUD();
  toast(n ? '🪄 Уложено в стаки карт: ' + n : 'Подходящих стаков нет: на поле должна стоять ТА ЖЕ карта и не достигнут лимит ×' + maxStacks());
}
