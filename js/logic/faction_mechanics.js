'use strict';
/* ============================================================
   ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
   Пункт 3 ТЗ. Тиковые события, зависящие от выбранной фракции:
   - Нежить: пассивные цепи (множители считаются в economy.js)
   - Культисты: пассивные формации вокруг Алтаря (economy.js)
   - Звери: цикл «хищник поедает добычу», Древень лечит
   - Демоны: мутации при скоплении 3+ (бафф/дебафф/превращение)
   ============================================================ */

let beastTimer = 0, demonTimer = 0;

function tickFactionMechanics(dt) {
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'cycle') {
    beastTimer += dt;
    if (beastTimer >= 9) { beastTimer = 0; beastCycleTick(); }
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 10) { demonTimer = 0; demonMutationTick(); }
  }
}

/* ---------------- ЗВЕРИ: круговорот ---------------- */
function isPredator(card) { return card.role === 'predator' && card.rarity >= 3; }

function beastCycleTick() {
  let changed = false;
  /* 1. Лечение от Древеня: соседние звери восстанавливают 10% HP */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (it.cardId === 'b7') {
      getNeighbors(r, c).forEach(n => {
        if (n.item.hp < n.item.maxHp) { n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * 0.1); changed = true; }
      });
    }
  }
  /* 2. Охота: каждый хищник кусает одного соседнего зверя ниже редкостью */
  const bites = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card)) continue;
    const prey = getNeighbors(r, c).find(n => {
      const pc = CARDS[n.item.cardId];
      return pc.faction === 'beast' && pc.rarity < card.rarity;
    });
    if (!prey) continue;
    /* Древень рядом с добычей защищает её */
    const guarded = getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b7');
    bites.push({ predator: { r, c, it, card }, prey, guarded });
  }
  bites.forEach(b => {
    if (b.guarded) {
      /* Древень сыт хищника: бафф поменьше, но добыча жива */
      b.predator.it.predBuff = Math.min(2, (b.predator.it.predBuff || 0) + 0.1);
      b.prey.item.hp = Math.min(b.prey.item.maxHp, b.prey.item.hp + b.prey.item.maxHp * 0.05);
      changed = true;
      return;
    }
    b.prey.item.hp -= b.prey.item.maxHp * 0.4;
    changed = true;
    if (b.prey.item.hp <= 0) {
      const eaten = CARDS[b.prey.item.cardId].name;
      grid[b.prey.r][b.prey.c] = null;
      b.predator.it.predBuff = Math.min(2, (b.predator.it.predBuff || 0) + 0.5);
      toast('🦁 ' + b.predator.card.name + ' сожрал ' + eaten + ': +50% дохода хищнику');
    }
  });
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}

/* ---------------- ДЕМОНЫ: мутации ---------------- */
function demonMutationTick() {
  const now = performance.now();
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon') continue;
    const crowd = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (crowd < 3) continue;
    if (it.lastMut && now - it.lastMut < 25000) continue;
    if (Math.random() >= 0.4) continue;
    it.lastMut = now;
    const stabilized = getNeighbors(r, c).some(n => n.item.cardId === 'd6');
    const roll = Math.random();
    if (roll < 0.45 || stabilized) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.3);
      toast('🔥 ' + card.name + ' мутировал: БАФФ ×' + (it.mutBuff).toFixed(2));
    } else if (roll < 0.8) {
      it.mutBuff = Math.max(0.3, (it.mutBuff || 1) * 0.8);
      toast('🔥 ' + card.name + ' мутировал: дебафф ×' + (it.mutBuff).toFixed(2));
    } else {
      const sameRarity = POOLS[card.rarity].filter(id => CARDS[id].faction === 'demon' && id !== card.id);
      const newId = pick(sameRarity.length ? sameRarity : POOLS[card.rarity]);
      it.cardId = newId; it.mutBuff = 1;
      discovered.add(newId);
      toast('🔥 ' + card.name + ' превратился в ' + CARDS[newId].name + '!');
    }
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}
