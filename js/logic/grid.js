'use strict';
/* ============================================================
   ЛОГИКА: ГРИД / АЛТАРЬ (logic/grid.js)
   Установка, перемещение, удаление, авто-расстановка. Врагов на
   гриде НЕТ (пункт 5 ТЗ) — грид это чистая экономика.
   Покупки отдельных клеток НЕТ (пункты 7-8 ТЗ): размер Алтаря
   растёт только целыми нечётными шагами через buyAltarUpgrade()
   в logic/epochs.js.
   ============================================================ */

function linked(a, b) { return SYNERGY_PAIRS.some(p => pairApplies(a, b, p)); }

/* Подсветка клеток при выборе карты */
function hintClass(r, c) {
  if (!placingMode || !pendingCard) return '';
  const p = CARDS[pendingCard]; const it = grid[r][c];
  if (it) {
    if (it.cardId === pendingCard && it.stacks < 5) return 'stack-hint';
    if (linked(p, CARDS[it.cardId])) return 'syn-hint';
    return '';
  }
  const ns = getNeighbors(r, c);
  return ns.some(n => linked(p, CARDS[n.item.cardId])) ? 'good-spot' : '';
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
      if (item.cardId !== pendingCard || item.stacks >= 5) return;
      item.stacks++; item.maxHp += hp; item.hp += hp;
    } else {
      grid[r][c] = { cardId: pendingCard, stacks: 1, hp, maxHp: hp, predBuff: 0, mutBuff: 1 };
    }
    stats.placed++;
    inventory[pendingCard]--;
    computeIncome();
    if (inventory[pendingCard] <= 0) { delete inventory[pendingCard]; cancelSelection(); }
    else { renderGrid(); renderCollection(); updateHUD(); }
  }
}

/* Авто-расстановка: в клетку с максимальным приростом дохода */
function localInc(r, c) {
  let s = calcCardIncome(r, c);
  getNeighbors(r, c).forEach(n => { s += calcCardIncome(n.r, n.c); });
  return s;
}
function bestFor(id) {
  const hp = cardHp(CARDS[id].rarity);
  let best = null, bv = -1e9;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    if (!playableMask[r][c] || grid[r][c]) continue;
    const b0 = localInc(r, c);
    grid[r][c] = { cardId: id, stacks: 1, hp, maxHp: hp, predBuff: 0, mutBuff: 1 };
    computeIncome();
    const v = localInc(r, c) - b0;
    grid[r][c] = null;
    if (v > bv) { bv = v; best = { r, c, v }; }
  }
  computeIncome();
  return best;
}
function autoPlace() {
  let n = 0;
  Object.keys(inventory).sort((a, b) => CARDS[b].rarity - CARDS[a].rarity).forEach(id => {
    while (inventory[id] > 0) {
      const b = bestFor(id);
      if (!b || b.v <= 0) break;
      const hp = cardHp(CARDS[id].rarity);
      const existing = grid[b.r][b.c];
      if (existing && existing.cardId === id && existing.stacks < 5) {
        existing.stacks++; existing.maxHp += hp; existing.hp += hp;
      } else if (!existing) {
        grid[b.r][b.c] = { cardId: id, stacks: 1, hp, maxHp: hp, predBuff: 0, mutBuff: 1 };
      } else break;
      stats.placed++;
      inventory[id]--; n++;
      if (!inventory[id]) delete inventory[id];
    }
  });
  cancelSelection();
  computeIncome(); renderGrid(); renderCollection(); updateHUD();
  toast(n ? '🪄 Расставлено карт: ' + n : 'Нет свободных клеток или карт');
}
