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
   клетки рядом с Алтарём/ритуалом, иначе игрок поставит «в пустоту». */
function hintClass(r, c) {
  if (!placingMode || !pendingCard) return '';
  const p = CARDS[pendingCard]; const it = grid[r][c];
  if (it) {
    if (it.cardId === pendingCard && it.stacks < maxStacks()) return 'stack-hint';
    if (linked(p, CARDS[it.cardId])) return 'syn-hint';
    return '';
  }
  const ns = getNeighbors(r, c);
  if (!ns.some(n => linked(p, CARDS[n.item.cardId]))) return '';
  if (FACTION_INFO[faction].mechanic === 'formation' && p.faction === 'cultist') {
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
      if (CARDS[item.cardId].rarity >= 4 || item.stacks > 1) {
        ask('Удалить навсегда: ' + CARDS[item.cardId].name + ' ×' + item.stacks + '?', doDelete);
      } else doDelete();
      cancelSelection();
    }
    return;
  }

  if (placingMode && pendingCard) {
    if (!playableMask[r][c] || (inventory[pendingCard] || 0) <= 0) return;
    const card = CARDS[pendingCard];
    const hp = cardHp(card.rarity);
    if (item) {
      if (item.cardId !== pendingCard || item.stacks >= maxStacks()) return;
      item.stacks++; item.maxHp += hp; item.hp += hp;
    } else {
      grid[r][c] = { cardId: pendingCard, stacks: 1, hp, maxHp: hp, predBuff: 0, mutBuff: 1 };
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
  let best = null, bv = -1e9;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== id || it.stacks >= maxStacks()) continue; /* только уже стоящие такие же карты */
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
  invIds.sort((a, b) => CARDS[b].rarity - CARDS[a].rarity).forEach(id => {
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
