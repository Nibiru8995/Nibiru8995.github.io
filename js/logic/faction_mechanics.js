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
    if (beastTimer >= 7) { beastTimer = 0; beastCycleTick(); } /* v1.1: тик 9с → 7с — лес живёт быстрее */
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 8) { demonTimer = 0; demonEmberTick(); }
    balrTimer += dt;
    if (balrTimer >= 20) { balrTimer = 0; balrogTick(); }
  } else if (mech === 'chain') {
    harvTimer += dt;
    if (harvTimer >= 30) { harvTimer = 0; harvesterTick(); }
  } else if (mech === 'formation') {
    /* v1.0: РЕЗОНАНС РИТУАЛА — живая шкала культистов */
    ritualResonanceTick(dt);
  }
}

/* ---------------- КУЛЬТИСТЫ: РЕЗОНАНС РИТУАЛА (v1.0) ----------------
   Пока на поле стоит хотя бы одна формация Алтаря — шкала резонанса
   полнеет (полная за 75 игровых секунд). На 100% — ВСПЛЕСК:
   весь доход ×1.5 на 20 секунд, золотая волна по ритуалу.
   Разрушил формацию — резонанс тает (~40с от полноты). Это делает
   ритуал ЖИВОЙ системой поддержания, а не статичной геометрией. */
const RESONANCE_FILL_TIME = 75;   /* игровых секунд до полного резонанса */
const RESONANCE_DECAY_RATE = 2.5; /* %/сек таяния без формации */
const SURGE_TIME = 20;            /* секунд всплеска ×1.5 */
function ritualResonanceTick(dt) {
  const hasForm = Object.keys(INC_CTX.formActive).length > 0;
  if (hasForm) {
    const before = ritualResonance;
    ritualResonance = Math.min(100, ritualResonance + dt * (100 / RESONANCE_FILL_TIME));
    if (before < 100 && ritualResonance >= 100) ritualSurge();
  } else if (ritualResonance > 0 && surgeUntil <= gameTime) {
    ritualResonance = Math.max(0, ritualResonance - dt * RESONANCE_DECAY_RATE);
  }
}
function ritualSurge() {
  surgeUntil = gameTime + SURGE_TIME;
  ritualResonance = 0;
  stats.surges = (stats.surges || 0) + 1; /* v1.2: счётчик всплесков */
  /* Шоу: золотая волна по всем клеткам ритуала + текст над Алтарём */
  let altarKey = null;
  INC_CTX.ritual.forEach(k => {
    if (!altarKey) altarKey = k;
    const [r, c] = k.split(',').map(Number);
    fxAtCell(r, c, ['#e8c060', '#fff8d0', '#c9a227'], 5, 'wave');
  });
  if (altarKey) {
    const [ar, ac] = altarKey.split(',').map(Number);
    fxFloatFromCell(ar, ac, 'РЕЗОНАНС ×1.5', '#ffe080', 20);
  }
  toast('🔯 <b>РЕЗОНАНС РИТУАЛА:</b> весь доход ×1.5 на ' + SURGE_TIME + ' секунд!');
  updateHUD();
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

/* ================= ЗВЕРИ: ПИЩЕВАЯ ЦЕПЬ v1.1 «Кровавый Клык» =================
   ФЛОРА (b7, b14, b15) → ТРАВОЯДНЫЕ (b0, b2, b12, b13, b17) → ХИЩНИКИ,
   ПАДАЛЬЩИКИ (b3, b16) жиреют с чужих смертей.
   v1.1 — ХИЩНИКИ СИЛЬНО ЛЕТАЛЬНЕЕ:
   - укус 50% maxHp (было 35%), охота в РАДИУСЕ 2 (прыжок через клетку);
   - убийство даёт +75% (было +50%); «Хищник» ★5 — +100% (кап ×4);
   - стая Волк/Лютоволк: рядом другой волк — укус ×1.5;
   - голод без добычи −8%/тик (пол ×0.5);
   - «Толстая Шкура» Буйвола и Колосса режет укус вдвое, Колосс жиреет от укусов;
   - «Шипы» Лозы жалят кусавшего (−8% HP), Гриб-Фонарь кормит травоядных ×1.5. */
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
  /* v1.2: «Рог Бешенства» (savage) — укусы хищников столбца ×1.5 */
  const savageCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'savage') savageCols[+k] = 1;
  }

  /* 1. ФЛОРА v1.1: Древень/Гриб лечат ХИЩНИКОВ (+12% HP); Кровавая Лоза (b14) НАОБОРОТ —
     жжёт соседних хищников (−8% HP/тик, насмерть не убивает) и лечит травоядных (+8%) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const fc = CARDS[it.cardId];
    if (fc.diet !== 'flora') continue;
    let served = 0;
    getNeighbors(r, c).forEach(n => {
      const nc = CARDS[n.item.cardId];
      if (nc.diet === 'pred') {
        if (fc.id === 'b14') {
          /* Шипы: хищникам рядом с Лозой больно */
          n.item.hp = Math.max(1, n.item.hp - n.item.maxHp * 0.08);
          fxAtCell(n.r, n.c, ['#c03050', '#ff6080'], 5);
          changed = true;
        } else if (n.item.hp < n.item.maxHp - 0.01) {
          n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * 0.12);
          fxAtCell(n.r, n.c, ['#5ab05a', '#a0e080'], 5);
          served++; changed = true;
        }
      } else if (nc.diet === 'herb' && fc.id === 'b14' && n.item.hp < n.item.maxHp - 0.01) {
        n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * 0.08);
        fxAtCell(n.r, n.c, ['#5ab05a', '#a0e080'], 5);
        served++; changed = true;
      }
    });
    if (served > 0) {
      it.floraBuff = Math.min(1.5, (it.floraBuff || 0) + 0.08 * served);
      it.lastFed = gameTime;
    }
  }

  /* 2. ВЫПАС: травоядные едят соседнюю флору; Гриб-Фонарь (b15) — сытнее (18%),
     Колосс (b17) подкармливает стадо (+15% сверху) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (CARDS[it.cardId].diet !== 'herb') continue;
    const floraN = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].diet === 'flora');
    if (!floraN.length) continue;
    const hasLantern = floraN.some(n => n.item.cardId === 'b15');
    const colossusNear = getNeighbors(r, c).some(n => n.item.cardId === 'b17');
    it.graze = Math.min(1.5, (it.graze || 0) + (hasLantern ? 0.18 : 0.12) + (colossusNear ? 0.15 : 0));
    it.lastFed = gameTime;
    floraN[0].item.floraBuff = Math.min(1.5, (floraN[0].item.floraBuff || 0) + 0.06);
    fxAtCell(r, c, ['#8fc87f', '#c0e0a0'], 5);
    changed = true;
  }

  /* 3. ОХОТА v1.1: хищник кусает добычу РЯДОМ, а если её нет — ПРЫГАЕТ через клетку (радиус 2) */
  const bites = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9') continue; /* Гидра не охотится сама */
    let prey = getNeighbors(r, c).find(n => {
      const pc = CARDS[n.item.cardId];
      return pc.faction === 'beast' && isPrey(pc);
    });
    let lunge = false;
    if (!prey) { prey = radius2(r, c).find(n => CARDS[n.item.cardId].faction === 'beast' && isPrey(CARDS[n.item.cardId])); lunge = true; }
    if (!prey) continue;
    /* Василиск (b8) рядом с добычей: та окаменела — укус невозможен */
    const petrified = getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8');
    bites.push({ predator: { r, c, it, card }, prey, petrified, lunge });
  }
  /* Василиск: пересчёт счётчика окаменевших соседей (для его +10%) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'b8') continue;
    it.petrCount = radius2(r, c).concat(getNeighbors(r, c)).filter(n => isPrey(CARDS[n.item.cardId])).length;
  }
  bites.forEach(b => {
    if (b.petrified) return; /* окаменевшую добычу не трогают */
    const preyCard = CARDS[b.prey.item.cardId];
    /* Толстая Шкура (b13) и Живая Крепость (b17): укусы по ним вдвое слабее */
    const thickHide = preyCard.id === 'b13' || preyCard.id === 'b17';
    const biteDmg = 0.5 * (thickHide ? 0.5 : 1) * (savageCols[b.predator.c] ? 1.5 : 1); /* Рог Бешенства */
    /* Стая: Волк и Лютоволк бьют ×1.5, если рядом другой волк */
    const pack = (b.predator.card.id === 'b1' || b.predator.card.id === 'b4') &&
      getNeighbors(b.predator.r, b.predator.c).some(n => n.item.cardId === 'b1' || n.item.cardId === 'b4');
    b.prey.item.hp -= b.prey.item.maxHp * biteDmg * (pack ? 1.5 : 1);
    fxAtCell(b.prey.r, b.prey.c, ['#e05a5a', '#ffd34d'], 6);
    fxFloatFromCell(b.prey.r, b.prey.c, '−' + Math.round(biteDmg * (pack ? 75 : 50)) + '%', '#ff9080');
    changed = true;
    /* Шипы Кровавой Лозы (b14): кусавший хищник теряет 8% HP (не умирает) */
    if (preyCard.id === 'b14') {
      b.predator.it.hp = Math.max(1, b.predator.it.hp - b.predator.it.maxHp * 0.08);
      fxAtCell(b.predator.r, b.predator.c, ['#c03050', '#ff6080'], 5);
    }
    /* Живая Крепость (b17): жиреет от каждого укуса (+10%, до +100%) */
    if (preyCard.id === 'b17') {
      b.prey.item.fleshyBuff = Math.min(1.0, (b.prey.item.fleshyBuff || 0) + 0.10);
    }
    if (b.prey.item.hp <= 0) {
      const eaten = preyCard.name;
      deaths.push([b.prey.r, b.prey.c]);
      grid[b.prey.r][b.prey.c] = null;
      stats.predKills = (stats.predKills || 0) + 1; /* v1.2: счётчик охоты */
      const dbl = kingCols[b.predator.c] ? 2 : 1;               /* «Корона Зверя» */
      const base = b.predator.card.id === 'b11' ? 1.0 : 0.75;   /* v1.1: +75% базово, Хищник ★5 +100% */
      const cap = (b.predator.card.id === 'b11' ? 4 : 3) * dbl;
      const gain = base * (preyCard.id === 'b13' ? 1.5 : 1) * dbl; /* Буйвол — жирная добыча */
      b.predator.it.predBuff = Math.min(cap, (b.predator.it.predBuff || 0) + gain);
      b.predator.it.hunger = 1;
      fxFloatFromCell(b.predator.r, b.predator.c, '+' + Math.round(gain * 100) + '% СЫТ', '#ffd34d');
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

  /* 5. ГОЛОД v1.1: хищник без добычи рядом слабеет быстрее (−8%/тик, пол ×0.5) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9') continue; /* гидра не голодает */
    if (apexCols[c]) { it.hunger = 1; continue; }        /* «Ошейник Господства»: сыт всегда */
    const hasPrey = radius2(r, c).some(n => isPrey(CARDS[n.item.cardId])); /* радиус 2 — прыжок */
    if (hasPrey) { it.hunger = 1; continue; }
    const fast = hungerFastCols[c] ? 2 : 1;              /* «Кость Голода»: голод ×2 */
    it.hunger = Math.max(0.5, (it.hunger === undefined ? 1 : it.hunger) - 0.08 * fast);
    changed = true;
  }

  /* 6. ПАДАЛЬЩИКИ v1.1: +25% за смерть в радиусе 2 (Стервятник b16 — радиус 3, кап ×2) */
  deaths.forEach(([dr, dc]) => {
    for (let r = dr - 3; r <= dr + 3; r++) for (let c = dc - 3; c <= dc + 3; c++) {
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      const it = grid[r] && grid[r][c];
      if (!it || CARDS[it.cardId].diet !== 'scav') continue;
      const dist = Math.max(Math.abs(r - dr), Math.abs(c - dc));
      const range = it.cardId === 'b16' ? 3 : 2;
      if (dist <= range) {
        it.scavBuff = Math.min(1.0, (it.scavBuff || 0) + 0.25);
        fxAtCell(r, c, ['#b0a060', '#e0d0a0'], 6);
      }
    }
  });

  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}

/* ================= ДЕМОНЫ: УГЛИ ХАОСА v1.1 (доделаны) =================
   В толпе (2+ демона рядом; Дьяволёнок d1 — хватает и одного) демон копит
   угли (макс 5, +10% за уголёк). Мучитель (d12) ускоряет соседей вдвое.
   При 5 углях — ВЗРЫВ: стабилизаторы (Жрец/Князь/Пентакль/Кулак Пекла d14
   в радиусе 2) дают гарантированный бафф (d14 — усиленный ×1.35); иначе
   65% бафф / 25% превращение / 10% «Перегрев» ×2 — но Иссушитель (d15)
   рядом запрещает перегрев. Пепельный Тиран (d13) кормится взрывами
   в радиусе 2, Гончая Ада (d2) чует их в радиусе 3. */
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
    const needCrowd = card.id === 'd1' ? 1 : 2;          /* Дьяволёнок злится рано */
    if (crowd < needCrowd) continue;
    const tutored = getNeighbors8(r, c).some(n => n.item.cardId === 'd12') || (function(){ const ef = colEngine(c); return !!(ef && ef.forge); })(); /* Мучитель или Сердце Вулкана */
    it.embers = Math.min(5, (it.embers || 0) + (tutored ? 2 : 1));
    fxAtCell(r, c, ['#ff9030', '#ffd34d'], 4);
    changed = true;
    if (it.embers < 5) continue;

    /* ВЗРЫВ ХАОСА */
    it.embers = 0;
    it.lastBoom = gameTime;
    stats.demonBooms = (stats.demonBooms || 0) + 1; /* v1.2: счётчик взрывов */
    const eng = colEngine(c);
    let buffVal = 1.25;
    let stabilized = princeHere || getNeighbors(r, c).some(n => n.item.cardId === 'd6') ||
      (eng && eng.chaosLock);
    if (radius2(r, c).some(n => n.item.cardId === 'd14')) { stabilized = true; buffVal = 1.35; } /* Око Бури */
    const silenced = getNeighbors8(r, c).some(n => n.item.cardId === 'd15');     /* Пелена Тишины */
    const disciplined = getNeighbors(r, c).some(n => n.item.cardId === 'd8');
    if (stabilized) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * buffVal);
      fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
      fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
      toast('🔥 ' + card.name + ' взорвался под контролем: БАФФ ×' + it.mutBuff.toFixed(2));
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
      } else if (!silenced) {
        /* Перегрев: угли сгорают в чистую мощь — ×2 на 12 сек */
        it.boomUntil = gameTime + 12;
        fxAtCell(r, c, ['#ff4010', '#ffb060', '#fff'], 22, 'big');
        fxFloatFromCell(r, c, 'ПЕРЕГРЕВ ×2', '#ff5030');
        toast('🔥 ' + card.name + ' перегрелся: ×2 на 12 секунд!');
      } else {
        /* Иссушитель рядом: перегрев запрещён — взрыв гаснет в тихий бафф */
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.15);
        fxFloatFromCell(r, c, 'ТИХИЙ БАФФ ×' + it.mutBuff.toFixed(2), '#c0e0ff');
        toast('🕯 Пелена Иссушителя смягчила взрыв ' + card.name + ': ×' + it.mutBuff.toFixed(2));
      }
    }
    /* v1.1: взрыв кормит соседей — Пепельный Тиран (радиус 2), Гончая Ада (радиус 3) */
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const nb = grid[nr] && grid[nr][nc]; if (!nb) continue;
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      if (nb.cardId === 'd13' && dist <= 2) nb.tyrBuff = Math.min(3, (nb.tyrBuff || 1) * 1.2);
      if (nb.cardId === 'd2' && dist <= 3) nb.harmBuff = Math.min(1.0, (nb.harmBuff || 0) + 0.05);
    }
  }
  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}
