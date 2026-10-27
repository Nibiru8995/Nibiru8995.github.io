'use strict';
/* ============================================================
   ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
   Тиковые события, зависящие от выбранной фракции:
   - Нежить: пассивные цепи/армия (economy.js); Жнец (★4) — «Жатва»
   - Культисты: пассивные формации/ритуал (economy.js)
   - Звери (фидбек 4): ПИЩЕВАЯ ЦЕПЬ без парных синергий —
     ФЛОРА кормит травоядных и лечит хищников, травоядные пасутся,
     хищники охотятся (инкам ТОЛЬКО от урона/кормления),
     падальщики жиреют с чужих смертей, голод без добычи
   - Демоны (фидбек 5): УГЛИ ХАОСА — накопление в толпе → ВЗРЫВ
     (бафф / превращение / перегрев ×2), дебаффов больше нет;
     визуальный отклик на каждом событии
   ============================================================ */

let beastTimer = 0, demonTimer = 0, harvTimer = 0, balrTimer = 0;

function tickFactionMechanics(dt) {
  const mech = FACTION_INFO[faction].mechanic;
  if (mech === 'cycle') {
    beastTimer += dt;
    if (beastTimer >= 9) { beastTimer = 0; beastCycleTick(); }
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 8) { demonTimer = 0; demonEmberTick(); }
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
    t.item.embers = Math.min(5, (t.item.embers || 0) + 2);
    t.item.lastMut = gameTime;
    it.balrBuff = Math.min(3, (it.balrBuff || 1) + 0.05);
    fxAtCell(t.r, t.c, ['#ff8030', '#ffd34d', '#ff4010'], 10);
    toast('🌋 Балрог поджёг ' + CARDS[t.item.cardId].name + ': +2 угля Хаоса (' + t.item.embers + '/5)');
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}

/* ================= ЗВЕРИ: ПИЩЕВАЯ ЦЕПЬ (фидбек 4) =================
   ФЛОРА (b7) → ТРАВОЯДНЫЕ (b0, b2) → ХИЩНИКИ (b1, b4-b6, b8, b9*, b10, b11),
   ПАДАЛЬЩИК (b3) жиреет с чужих смертей. Инкам — только от кормления.
   Флора ЗАМЫКАЕТ цикл: лечит хищников. Гидра (b9) не охотится — растёт
   от чужих укусов. Василиск (b8) окаменяет добычу. */
function isPredator(card) { return card.diet === 'pred'; }
function isPrey(card) { return card.diet === 'herb' || card.diet === 'scav'; }

function beastCycleTick() {
  let changed = false;
  const deaths = [];   // клетки погибших — для падальщиков
  /* «Корона Зверя» (реликвия king): убийства дают двойной бафф */
  const kingCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'king') kingCols[+k] = 1;
  }
  /* «Кость Голода» (реликвия titan зверей): голод ×2 в столбце */
  const hungerFastCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'titan' && r.faction === 'beast') hungerFastCols[+k] = 1;
  }
  const apexCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'apex') apexCols[+k] = 1;
  }

  /* 1. ФЛОРА: лечит соседних ХИЩНИКОВ (+12% HP) и жиреет от этого */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (CARDS[it.cardId].diet !== 'flora') continue;
    let served = 0;
    getNeighbors(r, c).forEach(n => {
      const nc = CARDS[n.item.cardId];
      if (nc.diet === 'pred' && n.item.hp < n.item.maxHp - 0.01) {
        n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * 0.12);
        fxAtCell(n.r, n.c, ['#5ab05a', '#a0e080'], 5);
        served++; changed = true;
      }
    });
    if (served > 0) {
      it.floraBuff = Math.min(1.5, (it.floraBuff || 0) + 0.08 * served);
      it.lastFed = gameTime;
    }
  }

  /* 2. ВЫПАС: травоядные едят соседнюю флору (+12% себе, флора тоже жиреет) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (CARDS[it.cardId].diet !== 'herb') continue;
    const flora = getNeighbors(r, c).find(n => CARDS[n.item.cardId].diet === 'flora');
    if (!flora) continue;
    it.graze = Math.min(1.5, (it.graze || 0) + 0.12);
    it.lastFed = gameTime;
    flora.item.floraBuff = Math.min(1.5, (flora.item.floraBuff || 0) + 0.06);
    fxAtCell(r, c, ['#8fc87f', '#c0e0a0'], 5);
    changed = true;
  }

  /* 3. ОХОТА: каждый хищник кусает одного соседнего травоядного/падальщика */
  const bites = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    /* Гидра (b9) не охотится сама — растёт от чужих укусов */
    if (!isPredator(card) || card.id === 'b9') continue;
    const prey = getNeighbors(r, c).find(n => {
      const pc = CARDS[n.item.cardId];
      return pc.faction === 'beast' && isPrey(pc);
    });
    if (!prey) continue;
    /* «Василиск» (★4) рядом с добычей: та окаменела — укус невозможен */
    const petrified = getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8');
    bites.push({ predator: { r, c, it, card }, prey, petrified });
  }
  /* Василиск: пересчёт счётчика окаменевших соседей (для его +10%) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'b8') continue;
    it.petrCount = getNeighbors(r, c).filter(n => isPrey(CARDS[n.item.cardId])).length;
  }
  bites.forEach(b => {
    if (b.petrified) return; /* окаменевшую добычу не трогают */
    const preyCard = CARDS[b.prey.item.cardId];
    b.prey.item.hp -= b.prey.item.maxHp * 0.35;
    fxAtCell(b.prey.r, b.prey.c, ['#e05a5a', '#ffd34d'], 6);
    changed = true;
    if (b.prey.item.hp <= 0) {
      const eaten = preyCard.name;
      deaths.push([b.prey.r, b.prey.c]);
      grid[b.prey.r][b.prey.c] = null;
      const dbl = kingCols[b.predator.c] ? 2 : 1;               /* «Корона Зверя» */
      const gain = (b.predator.card.id === 'b11' ? 0.75 : 0.5) * dbl;
      const cap = (b.predator.card.id === 'b11' ? 3 : 2) * dbl;
      b.predator.it.predBuff = Math.min(cap, (b.predator.it.predBuff || 0) + gain);
      b.predator.it.hunger = 1;
      toast(b.predator.card.name + ' сожрал ' + eaten + ': +' + Math.round(gain * 100) + '% дохода хищнику');
    } else {
      b.predator.it.hunger = 1;
    }
    /* «Гидра» (★4): растёт от укусов в радиусе 2 (чужая охота ей на пользу) */
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = b.prey.r + dr, nc = b.prey.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const hit = grid[nr] && grid[nr][nc];
      if (hit && hit.cardId === 'b9') { hit.hydraBuff = Math.min(3, (hit.hydraBuff || 1) + 0.15); }
    }
  });

  /* 4. «Королевский Грифон» (★5): царская охота — кусает, но щадит (1 HP) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'b10') continue;
    const prey = getNeighbors(r, c).find(n => isPrey(CARDS[n.item.cardId]));
    if (!prey) continue;
    if (getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8')) continue; /* окаменела */
    prey.item.hp = Math.max(1, prey.item.hp - prey.item.maxHp * 0.25);
    it.predBuff = Math.min(3, (it.predBuff || 0) + 0.25 * (kingCols[c] ? 2 : 1));
    it.hunger = 1;
    changed = true;
  }

  /* 5. ГОЛОД: хищник без добычи рядом слабеет (−6%/тик, пол ×0.55) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9') continue; /* гидра не голодает */
    if (apexCols[c]) { it.hunger = 1; continue; }        /* «Ошейник Господства»: сыт всегда */
    const hasPrey = getNeighbors(r, c).some(n => isPrey(CARDS[n.item.cardId]));
    if (hasPrey) { it.hunger = 1; continue; }
    const fast = hungerFastCols[c] ? 2 : 1;              /* «Кость Голода»: голод ×2 */
    it.hunger = Math.max(0.55, (it.hunger === undefined ? 1 : it.hunger) - 0.06 * fast);
    changed = true;
  }

  /* 6. ПАДАЛЬЩИКИ: +25% за каждую смерть в радиусе 2 (кап ×2) */
  deaths.forEach(([dr, dc]) => {
    for (let r = dr - 2; r <= dr + 2; r++) for (let c = dc - 2; c <= dc + 2; c++) {
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      const it = grid[r] && grid[r][c];
      if (it && CARDS[it.cardId].diet === 'scav') {
        it.scavBuff = Math.min(1.0, (it.scavBuff || 0) + 0.25);
        fxAtCell(r, c, ['#b0a060', '#e0d0a0'], 6);
      }
    }
  });

  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}

/* ================= ДЕМОНЫ: УГЛИ ХАОСА (фидбек 5) =================
   В толпе (2+ демона рядом) демон копит угли (макс 5, +10% за уголёк).
   При 5 углях — ВЗРЫВ: рядом Жрец/Князь (или реликвия «Пентакль») —
   гарантированный бафф ×1.25; иначе 65% бафф / 25% превращение /
   10% «Перегрев» (×2 на 12 сек). ДЕБАФФОВ БОЛЬШЕ НЕТ.
   Визуальный отклик: искры на накоплении, вспышка на взрыве. */
function demonEmberTick() {
  let changed = false;
  const chaosCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'chaos') chaosCols[+k] = 1;
  }
  const princeHere = hasCard('d10');
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon') continue;
    const crowd = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    if (crowd < 2) continue;                     /* угли копятся только в толпе */
    it.embers = Math.min(5, (it.embers || 0) + 1);
    fxAtCell(r, c, ['#ff9030', '#ffd34d'], 4);
    changed = true;
    if (it.embers < 5) continue;

    /* ВЗРЫВ ХАОСА */
    it.embers = 0;
    it.lastBoom = gameTime;
    const eng = colEngine(c);
    const stabilized = princeHere || getNeighbors(r, c).some(n => n.item.cardId === 'd6') ||
      (eng && eng.chaosLock);
    const disciplined = getNeighbors(r, c).some(n => n.item.cardId === 'd8');
    if (stabilized) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.25);
      fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
      fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
      toast(princeHere ? '😈 ' + card.name + ' получил милость Князя: БАФФ ×' + it.mutBuff.toFixed(2)
        : '🔥 ' + card.name + ' взорвался под контролем Жреца: БАФФ ×' + it.mutBuff.toFixed(2));
    } else {
      const roll = Math.random();
      if (roll < 0.65 || disciplined) {
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.25);
        fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
        fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
        toast('🔥 ' + card.name + ' взорвался Хаосом: БАФФ ×' + it.mutBuff.toFixed(2));
      } else if (roll < 0.90 && !disciplined) {
        /* Превращение в другого демона той же редкости */
        const sameRarity = POOLS[card.rarity].filter(id => CARDS[id].faction === 'demon' && id !== card.id);
        const newId = pick(sameRarity.length ? sameRarity : POOLS[card.rarity]);
        const oldName = card.name;
        it.cardId = newId; it.mutBuff = 1; it.embers = 0;
        discovered.add(newId);
        fxAtCell(r, c, ['#c030c0', '#ff40ff', '#fff'], 18, 'big');
        fxFloatFromCell(r, c, 'ПРЕВРАЩЕНИЕ', '#ff60ff');
        toast('🔥 ' + oldName + ' превратился в ' + CARDS[newId].name + '!');
      } else {
        /* Перегрев: угли сгорают в чистую мощь — ×2 на 12 сек */
        it.boomUntil = gameTime + 12;
        fxAtCell(r, c, ['#ff4010', '#ffb060', '#fff'], 22, 'big');
        fxFloatFromCell(r, c, 'ПЕРЕГРЕВ ×2', '#ff5030');
        toast('🔥 ' + card.name + ' перегрелся: ×2 на 12 секунд!');
      }
    }
  }
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}
