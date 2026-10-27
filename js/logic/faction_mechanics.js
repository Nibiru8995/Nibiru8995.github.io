'use strict';
/* ============================================================
   ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
   Тиковые события, зависящие от выбранной фракции:
   - Нежить: пассивные цепи/армия (economy.js); Жнец (★4) — «Жатва»
     (периодический буст всему доходу)
   - Культисты: пассивные формации (economy.js)
   - Звери: цикл «хищник поедает добычу», Древень лечит, Василиск
     (★4) окаменяет добычу, Гидра (★4) растёт от укусов вокруг,
     Грифон (★5) кормится сам, щадя добычу
   - Демоны: мутации при скоплении 3+, Рыцарь (★4) дисциплинирует
     соседей, Князь Тьмы (★5) делает мутации только баффами,
     Балрог (★4) раз в 20с форсит бафф соседу
   ============================================================ */

let beastTimer = 0, demonTimer = 0, harvTimer = 0, balrTimer = 0;

function tickFactionMechanics(dt) {
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'cycle') {
    beastTimer += dt;
    if (beastTimer >= 9) { beastTimer = 0; beastCycleTick(); }
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 10) { demonTimer = 0; demonMutationTick(); }
    balrTimer += dt;
    if (balrTimer >= 20) { balrTimer = 0; balrogTick(); }
  } else if (mech === 'chain') {
    harvTimer += dt;
    if (harvTimer >= 30) { harvTimer = 0; harvesterTick(); }
  }
}

/* ---------------- НЕЖИТЬ: Жнец Душ (★4) — «Жатва» ---------------- */
function hasCard(id) {
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && grid[r][c].cardId === id) return true;
  return false;
}
function harvesterTick() {
  if (!hasCard('u9')) return;
  altBuff.mult = 2; altBuff.until = gameTime + 5; /* игровых секунд — единое время с ускорением ×2/×4 */
  altBuff.label = '⚔ ЖАТВА ×2';
  toast('⚔ Жнец Душ срезает урожай: доход ×2 на 5 секунд!');
  updateHUD();
}

/* ---------------- ДЕМОНЫ: Балрог (★4) — «Кузня Хаоса» ---------------- */
function balrogTick() {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'd9') continue;
    const targets = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon');
    if (!targets.length) continue;
    const t = pick(targets);
    t.item.mutBuff = Math.min(4, (t.item.mutBuff || 1) * 1.3);
    t.item.lastMut = gameTime; /* игровое время (сек) */
    it.balrBuff = Math.min(3, (it.balrBuff || 1) + 0.05);
    toast('🌋 Балрог поджёг ' + CARDS[t.item.cardId].name + ': гарантированный бафф ×' + t.item.mutBuff.toFixed(2));
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
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
    /* Древень рядом с добычей защищает её (бафф хищнику поменьше) */
    const guarded = getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b7');
    /* «Василиск» (★4): добыча рядом с ним окаменела — укус невозможен */
    const petrified = getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8');
    bites.push({ predator: { r, c, it, card }, prey, guarded, petrified });
  }
  bites.forEach(b => {
    if (b.petrified) return; /* окаменевшую добычу не трогают */
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
      const gain = b.predator.card.id === 'b11' ? 0.75 : 0.5;      /* «Хищник» (★5) жирнее */
      const cap = b.predator.card.id === 'b11' ? 3 : 2;
      b.predator.it.predBuff = Math.min(cap, (b.predator.it.predBuff || 0) + gain);
      toast('🦁 ' + b.predator.card.name + ' сожрал ' + eaten + ': +' + Math.round(gain * 100) + '% дохода хищнику');
    }
    /* «Гидра» (★4): растёт от укусов в радиусе 2 (чужая охота ей на пользу) */
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = b.prey.r + dr, nc = b.prey.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const hit = grid[nr] && grid[nr][nc];
      if (hit && hit.cardId === 'b9') { hit.hydraBuff = Math.min(3, (hit.hydraBuff || 1) + 0.15); }
    }
  });
  /* 3. «Королевский Грифон» (★5): царская охота — кусает сам, но щадит (1 HP) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'b10') continue;
    const prey = getNeighbors(r, c).find(n => {
      const pc = CARDS[n.item.cardId];
      return pc.faction === 'beast' && pc.rarity < 5;
    });
    if (!prey) continue;
    if (getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8')) continue; /* окаменела */
    prey.item.hp = Math.max(1, prey.item.hp - prey.item.maxHp * 0.25);
    it.grifBuff = Math.min(3, (it.grifBuff || 1) + 0.25);
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}

/* ---------------- ДЕМОНЫ: мутации ---------------- */
function demonMutationTick() {
  const now = gameTime; /* игровое время (сек) */
  let changed = false;
  /* «Князь Тьмы» (★5) на поле: дебаффы и превращения невозможны */
  const princeHere = hasCard('d10');
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon') continue;
    /* «Адский Рыцарь» (★4): соседи в дисциплине — мутаций нет */
    if (getNeighbors(r, c).some(n => n.item.cardId === 'd8')) continue;
    const crowd = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (crowd < 3) continue;
    if (it.lastMut != null && now - it.lastMut < 25) continue;
    if (Math.random() >= 0.4) continue;
    it.lastMut = now;
    const stabilized = princeHere || getNeighbors(r, c).some(n => n.item.cardId === 'd6');
    if (stabilized) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.3);
      toast(princeHere ? '😈 ' + card.name + ' получил милость Князя: БАФФ ×' + (it.mutBuff).toFixed(2)
        : '🔥 ' + card.name + ' мутировал: БАФФ ×' + (it.mutBuff).toFixed(2));
    } else {
      const roll = Math.random();
      if (roll < 0.45) {
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
    }
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}
