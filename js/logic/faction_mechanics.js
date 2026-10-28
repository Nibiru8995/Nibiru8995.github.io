'use strict';
/* ============================================================
   ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
   Тиковые события, зависящие от фракции:
   - Нежить: цепи/армия (economy.js) + «Медленный рост» Зомби (u1)
   - Культисты v1.2.6: РИТУАЛЬНАЯ ЭКОНОМИКА — участники в цепи от
     Алтаря заряжают шкалу (шкала НЕ тает), на 100% ритуал платит 💎;
     роли: скорость (⚡) и усиление выплаты (💰); формации ускоряют
   - Звери v1.2.5: тик 2.5с, укус 20%, драки хищников, здания
   - Демоны: УГЛИ — толпа → взрыв; здания Яма/Ледник
   - ЗДАНИЯ: призыв Кладбища/Врат, ЖАТВА Горы костей (tickBuildings)
   ============================================================ */

let beastTimer = 0, demonTimer = 0, balrTimer = 0;

function tickFactionMechanics(dt) {
  const mech = FACTION_INFO[faction].mechanic;
  /* Здания тикают у ВСЕХ фракций (у каждой — свои 3 постройки) */
  tickBuildings(dt);
  if (mech === 'chain') {
    tickUndeadGrowth(dt); /* «Медленный рост» Зомби (u1) */
  } else if (mech === 'cycle') {
    beastTimer += dt;
    if (beastTimer >= 2.5) { beastTimer = 0; beastCycleTick(); } /* v1.2.5: тик 2.5с — лес живёт быстро */
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 8) { demonTimer = 0; demonEmberTick(); }
    balrTimer += dt;
    if (balrTimer >= 20) { balrTimer = 0; balrogTick(); }
  } else if (mech === 'formation') {
    /* v1.2.6: РИТУАЛЬНАЯ ЭКОНОМИКА — заряд + выплата */
    ritualChargeTick(dt);
  }
}

/* ---------------- НЕЖИТЬ: «Медленный рост» Зомби (u1) ----------------
   Раньше описана, но не работала. Теперь: каждые 20с +6% дохода
   НАВСЕГДА (до +60%). Прогресс виден на бейдже карты. */
const GROW_STEP = 20, GROW_GAIN = 0.06, GROW_CAP = 0.6;
function tickUndeadGrowth(dt) {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'u1') continue;
    it.growT = (it.growT || 0) + dt;
    if (it.growT >= GROW_STEP) {
      it.growT -= GROW_STEP;
      const before = it.growBuff || 0;
      it.growBuff = Math.min(GROW_CAP, before + GROW_GAIN);
      if (it.growBuff > before) {
        fxAtCell(r, c, ['#7ec97e', '#c0ffb0'], 6);
        fxFloatFromCell(r, c, 'РОСТ +' + Math.round(it.growBuff * 100) + '%', '#8fc87f');
      }
      changed = true;
    }
  }
  if (changed) { computeIncome(); updateHUD(); }
}

/* ============ КУЛЬТИСТЫ: РИТУАЛЬНАЯ ЭКОНОМИКА v1.2.7 ============
   У культистов НЕТ дохода — есть РИТУАЛ:
   1) Каждый культист в цепи от Алтаря/Хтони — УЧАСТНИК.
   2) Роль «скорость»: даёт +N к скорости заряда (⚡); роль «усилитель»
      почти не заряжает, но усиливает ВЫПЛАТУ (💰).
   3) v1.2.7: СТАКИ усиливают вклад клетки — заряд ×(1+0.35/стак),
      выплата +10%/стак (до +50%). Застаканные карты = сильный ритуал.
   4) Формации вокруг источника (без пустых клеток): Крест ×1.7 /
      Кольцо ×2.0 / Ромб ×2.6; у нескольких Алтарей множители складываются.
   5) v1.2.7: ВНЕШНИЙ КРУГ — культисты рядом с ритуалом (но вне цепи)
      работают «служителями»: +5% выплаты и +заряд каждый (стаки ×1.5).
   6) Обелиск — участникам в его зоне заряд ×1.25; Колодец — выплата +30%.
   7) Шкала НИКОГДА не тает — зафейлить до конца нельзя.
   8) v1.2.7 БАЛАНС: базовые вклады 0.25-0.33%/с (было 1.0-1.3), суммарная
      скорость растёт через КОРЕНЬ (каждый новый участник даёт меньше) и
      ограничена потолком 15%/с — ритуал больше не «пулемёт».
   9) Выплата = порог Эпохи × 0.72% × (0.7 + 0.03×участников) × бонусы. */
const RITUAL_AMPS = { c5: 0.2, c8: 0.3, c9: 0.45, c13: 0.25, c10: 0.6, c11: 0.45 };
const RITUAL_CELL_SPEED = { c0: 0.25, c1: 0.25, c2: 0.30, c3: 0.25, c6: 0.27, c7: 0.33, c12: 0.25 };
const RITUAL_AMP_CHARGE = 0.12;   /* усилители заряжают чуть-чуть */
const RITUAL_SPEED_CAP = 15;      /* %/с — потолок заряда (цикл не короче ~6.7с) */
const RITUAL_OUTER_SPEED = 0.03, RITUAL_OUTER_SPEED_CAP = 0.18;
const RITUAL_OUTER_PAY = 0.05, RITUAL_OUTER_PAY_CAP = 0.40;
let RITUAL_ENGINE = { speed: 0, pay: 1, payout: 0, participants: 0, outer: 0, outerPay: 0, cellSpeed: {}, banner: '', capped: false };

function computeRitualEngine() {
  const E = { speed: 0, pay: 1, payout: 0, participants: 0, outer: 0, outerPay: 0, cellSpeed: {}, banner: '', ready: false, capped: false };
  if (FACTION_INFO[faction].mechanic !== 'formation') return E;
  const B = INC_CTX.bld || { obelisk: {}, wells: 0 };
  /* Формационный множитель: 1 + Σ(множитель−1) по всем активным формациям */
  let formMult = 1, forms = 0;
  for (const k in INC_CTX.formActive) { formMult += INC_CTX.formActive[k].formMult - 1; forms++; }
  formMult = Math.min(3.2, formMult);
  /* Глобальные ритуальные реликвии (культистские) */
  const rel = ritualRelicMods();
  let payBonus = 0, bannerParts = [];
  if (forms) bannerParts.push('формации ×' + formMult.toFixed(2));
  /* Участники: культисты в цепи ритуала (здания — не участники) */
  let rawSum = 0;
  const rawCell = {};
  INC_CTX.ritual.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const it = grid[r][c]; if (!it) return;
    const card = CARDS[it.cardId];
    if (card.isBuilding || card.id === 'bl_altar') return;
    E.participants++;
    const st = it.stacks || 1;
    const stSpeed = 1 + 0.35 * (st - 1);          /* стаки усиливают заряд клетки */
    let raw = 0;
    if (RITUAL_AMPS[card.id]) {
      raw = RITUAL_AMP_CHARGE * stSpeed;
      payBonus += RITUAL_AMPS[card.id] + 0.10 * Math.min(5, st - 1); /* стаки усилителя = +выплата */
    } else {
      raw = (RITUAL_CELL_SPEED[card.id] || 0.25) * stSpeed;
      if (card.id === 'c1') { /* Сектант: +бонус за соседа в ритуале */
        const ns = getNeighbors(r, c).filter(n => INC_CTX.ritual.has(n.r + ',' + n.c) && !CARDS[n.item.cardId].isBuilding).length;
        raw += 0.04 * ns;
      }
      payBonus += 0.10 * Math.min(5, st - 1);      /* стаки участника = +10% выплаты каждый (до +50%) */
    }
    /* Обелиск: заряд участника в его зоне ×1.25 (кап ×1.5) */
    const ob = B.obelisk[k] || 0;
    if (ob) raw *= Math.min(1.5, 1 + 0.25 * ob);
    rawCell[k] = raw; rawSum += raw;
  });
  /* ВНЕШНИЙ КРУГ (v1.2.7): служители вне цепи, но рядом с ней */
  let outerRaw = 0;
  INC_CTX.ritualOuter.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const it = grid[r][c]; if (!it) return;
    if (CARDS[it.cardId].isBuilding) return;
    E.outer++;
    const st = it.stacks || 1;
    const stMult = 1 + 0.5 * (st - 1);
    outerRaw += RITUAL_OUTER_SPEED * stMult;
    E.outerPay += RITUAL_OUTER_PAY * stMult;
    rawCell[k] = RITUAL_OUTER_SPEED * stMult;
  });
  outerRaw = Math.min(RITUAL_OUTER_SPEED_CAP, outerRaw);
  E.outerPay = Math.min(RITUAL_OUTER_PAY_CAP, E.outerPay);
  if (E.outer) bannerParts.push('внешний круг +' + Math.round(E.outerPay * 100) + '%');
  payBonus += E.outerPay;
  /* Служка (c12): культисты ВНЕ ритуала рядом с ней дают ещё заряд */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'cultist' || card.isBuilding) continue;
    if (INC_CTX.ritual.has(r + ',' + c)) continue;
    if (getNeighbors(r, c).some(n => n.item.cardId === 'c12')) { outerRaw += 0.06; }
  }
  /* Знаменосцы (c3): +10% скорости каждый (кап +30%) */
  let banners = 0;
  INC_CTX.ritual.forEach(k => { const it = grid[+k.split(',')[0]][+k.split(',')[1]]; if (it && it.cardId === 'c3') banners++; });
  let bannerMult = 1;
  if (banners) { bannerMult = 1 + Math.min(0.3, 0.10 * banners); bannerParts.push('знамёна +' + Math.round(Math.min(30, 10 * banners)) + '%'); }
  /* ИТОГОВАЯ СКОРОСТЬ: корень из суммы вкладов — мягкое насыщение
     (каждый новый участник даёт меньше прежнего), потолок 15%/с */
  E.speed = Math.min(RITUAL_SPEED_CAP, 1.2 * Math.sqrt(rawSum + outerRaw) * formMult * rel.speed * bannerMult);
  E.capped = rawSum + outerRaw > 0 && E.speed >= RITUAL_SPEED_CAP;
  if (E.capped) bannerParts.push('потолок ⚡');
  /* Раскладка скорости по клеткам (для бейджей ⚡ на картах) */
  if (rawSum + outerRaw > 0 && E.speed > 0) {
    const tot = rawSum + outerRaw;
    for (const k in rawCell) E.cellSpeed[k] = E.speed * (rawCell[k] / tot);
  }
  /* Колодец: выплата +30% (кап +60%) */
  const wells = B.wells || 0;
  if (wells) { payBonus += Math.min(0.6, 0.3 * wells); bannerParts.push('колодцы +' + Math.round(Math.min(60, 30 * wells)) + '%'); }
  E.pay = Math.min(4, (1 + Math.min(2.5, payBonus)) * rel.pay);
  /* Выплата: привязана к порогу Эпохи — растёт вместе с игрой.
     v1.2.7: коэффициент 0.72% (было 0.8%), участники 0.03 (было 0.06),
     кап выплаты ×4 (было ×5) — ритуалы больше не печатают деньги. */
  E.payout = Math.round(epochThreshold(epoch) * 0.0072 * (0.7 + 0.03 * Math.min(24, E.participants)) * E.pay);
  E.banner = bannerParts.join(' · ');
  E.ready = INC_CTX.ritual.size > 0;
  return E;
}

function ritualChargeTick(dt) {
  RITUAL_ENGINE = computeRitualEngine();
  INC_CTX.ritualCellSpeed = RITUAL_ENGINE.cellSpeed;
  if (RITUAL_ENGINE.speed <= 0) return;
  const before = ritualResonance;
  ritualResonance = Math.min(100, ritualResonance + dt * RITUAL_ENGINE.speed);
  if (before < 100 && ritualResonance >= 100) ritualPayout();
}

/* РИТУАЛ ЗАВЕРШЁН: гарантированная выплата 💎. Шкала НЕ тает —
   полный фейл невозможен, худший случай — медленный цикл.
   v1.2.7: тост с ключом (не чаще раза в 30с, подавленные — «ещё ×N»). */
function ritualPayout() {
  const E = RITUAL_ENGINE.speed > 0 ? RITUAL_ENGINE : computeRitualEngine();
  const pay = E.payout;
  crystals += pay;
  ritualResonance = 0;
  stats.surges = (stats.surges || 0) + 1;
  /* Шоу: золотая волна по клеткам ритуала + текст над источником */
  let srcKey = null;
  INC_CTX.ritual.forEach(k => {
    if (!srcKey && RITUAL_SOURCES[grid[+k.split(',')[0]][+k.split(',')[1]]?.cardId]) srcKey = k;
    const [r, c] = k.split(',').map(Number);
    fxAtCell(r, c, ['#e8c060', '#fff8d0', '#c9a227'], 5, 'wave');
  });
  if (srcKey) {
    const [ar, ac] = srcKey.split(',').map(Number);
    fxFloatFromCell(ar, ac, '🔥 РИТУАЛ: +' + fmtShort(pay) + ' 💎', '#ffe080', 22);
  }
  if (toast('🔥 <b>Ритуал завершён:</b> +' + fmtShort(pay) + ' 💎' + (E.banner ? ' <small>(' + E.banner + ')</small>' : ''), 'ritual', 30)) sfx('relic');
  saveRun(); updateHUD(); checkAchievements();
}

/* ---------------- НЕЖИТЬ ---------------- */
function hasCard(id) {
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && grid[r][c].cardId === id) return true;
  return false;
}

/* ---------------- ДЕМОНЫ: Балрог (★4) — «Кузня» ---------------- */
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
    toast('🌋 Балрог поджёг ' + CARDS[t.item.cardId].name + ': +2 угля (' + t.item.embers + '/5)', 'balrog', 20);
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}

/* ================= ЗВЕРИ: ПИЩЕВАЯ ЦЕПЬ v1.2.5 =================
   Тик 2.5с. Укус 20% maxHp добычи (стая ×1.5). Убийство: +120%
   хищнику навсегда (Хищник ★5 +160%, Буйвол ×1.5 добыча).
   ГОЛОД: без добычи хищник слабеет −5%/тик — и ДЕРЁТСЯ с соседями-
   хищниками за территорию (−6% HP), поэтому ЛЕЧЕНИЕ флорой ценно.
   Кабан жиреет от укусов (Щетина), Мантикора травит Ядом. */
function isPredator(card) { return card.diet === 'pred'; }
function isPrey(card) { return card.diet === 'herb' || card.diet === 'scav'; }
/* Радиус охоты карты: Лютоволк (b4) — 3, остальные 2 */
function huntRadius(card) { return card.id === 'b4' ? 3 : 2; }

function beastCycleTick() {
  let changed = false;
  const deaths = [];   // клетки погибших — для падальщиков
  /* Реликвии: Корона Зверя (king), Кость Голода (titan), Ошейник (apex), Рог (savage) */
  const kingCols = {}, hungerFastCols = {}, apexCols = {}, savageCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r) continue;
    if (r.kind === 'king') kingCols[+k] = 1;
    if (r.kind === 'titan' && r.faction === 'beast') hungerFastCols[+k] = 1;
    if (r.kind === 'apex') apexCols[+k] = 1;
    if (r.kind === 'savage') savageCols[+k] = 1;
  }
  const B = INC_CTX.bld || { pen: {}, pole: {}, spring: {} };

  /* 1. ФЛОРА: лечит хищников (+5% HP/тик), кормится их лечением.
     Кровавая Лоза (b14) наоборот жжёт хищников (−3%) и лечит травоядных.
     СОЛОНЧИК (bl_spring): флора в его зоне лечит/кормит ×2 и действует
     на радиус +1 (через клетку). */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const fc = CARDS[it.cardId];
    if (fc.diet !== 'flora') continue;
    const boosted = (B.spring[r + ',' + c] || 0) > 0; /* Солончик усиливает флору */
    const heal = (boosted ? 0.10 : 0.05);
    const targets = boosted ? radius2(r, c).concat(getNeighbors(r, c)) : getNeighbors(r, c);
    const seen = {};
    let served = 0;
    targets.forEach(n => {
      const nk = n.r + ',' + n.c;
      if (seen[nk]) return; seen[nk] = 1;
      const nc = CARDS[n.item.cardId];
      if (nc.diet === 'pred') {
        if (fc.id === 'b14') {
          n.item.hp = Math.max(1, n.item.hp - n.item.maxHp * (boosted ? 0.06 : 0.03));
          fxAtCell(n.r, n.c, ['#c03050', '#ff6080'], 5);
          changed = true;
        } else if (n.item.hp < n.item.maxHp - 0.01) {
          n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * heal);
          fxAtCell(n.r, n.c, ['#5ab05a', '#a0e080'], 5);
          served++; changed = true;
        }
      } else if (nc.diet === 'herb' && fc.id === 'b14' && n.item.hp < n.item.maxHp - 0.01) {
        n.item.hp = Math.min(n.item.maxHp, n.item.hp + n.item.maxHp * (boosted ? 0.10 : 0.05));
        fxAtCell(n.r, n.c, ['#5ab05a', '#a0e080'], 5);
        served++; changed = true;
      }
    });
    if (served > 0) {
      it.floraBuff = Math.min(1.5, (it.floraBuff || 0) + 0.03 * served * (boosted ? 2 : 1));
      it.lastFed = gameTime;
    }
  }

  /* 2. ВЫПАС: травоядные едят соседнюю флору (+5%/тик, Гриб-Фонарь +7.5%,
     Колосс подкармливает стадо). ВОЛЬЕР: выпас ×1.5. */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (CARDS[it.cardId].diet !== 'herb') continue;
    let floraN = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].diet === 'flora');
    /* Солончик: флора кормит через клетку дальше */
    if (!floraN.length && INC_CTX.bld) {
      for (const n of radius2(r, c)) {
        if (CARDS[n.item.cardId].diet === 'flora' && (INC_CTX.bld.spring[n.r + ',' + n.c] || 0) > 0) { floraN.push(n); break; }
      }
    }
    if (!floraN.length) continue;
    const hasLantern = floraN.some(n => n.item.cardId === 'b15');
    const colossusNear = getNeighbors(r, c).some(n => n.item.cardId === 'b17');
    const inPen = (B.pen[r + ',' + c] || 0) > 0;
    let gain = (hasLantern ? 0.075 : 0.05) + (colossusNear ? 0.05 : 0);
    if (inPen) gain *= 1.5;
    it.graze = Math.min(1.5, (it.graze || 0) + gain);
    it.lastFed = gameTime;
    floraN[0].item.floraBuff = Math.min(1.5, (floraN[0].item.floraBuff || 0) + 0.025);
    fxAtCell(r, c, ['#8fc87f', '#c0e0a0'], 5);
    changed = true;
  }

  /* 3. ОХОТА: хищник кусает добычу рядом или через клетку (радиус 2,
     Лютоволк — 3). ВОЛЬЕР защищает травоядных. ТРОФЕЙНЫЙ СТОЛБ
     умножает баффы охоты ×1.5. */
  const bites = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9') continue; /* Гидра не охотится сама */
    const R = huntRadius(card);
    const inRange = R >= 3 ? radius2(r, c).concat(getNeighbors(r, c)) : getNeighbors(r, c);
    const seen = {}; let prey = null;
    for (const n of inRange) {
      const nk = n.r + ',' + n.c;
      if (seen[nk]) continue; seen[nk] = 1;
      const pc = CARDS[n.item.cardId];
      if (pc.faction === 'beast' && isPrey(pc)) {
        if ((B.pen[nk] || 0) > 0) continue;          /* Вольер защищает */
        if (getNeighbors(n.r, n.c).some(m => m.item.cardId === 'b8')) continue; /* Василиск окаменил */
        prey = n; break;
      }
    }
    if (!prey) continue;
    bites.push({ predator: { r, c, it, card }, prey });
  }
  bites.forEach(b => {
    const preyCard = CARDS[b.prey.item.cardId];
    const thickHide = preyCard.id === 'b13' || preyCard.id === 'b17';
    const biteDmg = 0.20 * (thickHide ? 0.5 : 1) * (savageCols[b.predator.c] ? 1.5 : 1);
    /* Стая: Волк и Лютоволк бьют ×1.5, если рядом другой волк */
    const pack = (b.predator.card.id === 'b1' || b.predator.card.id === 'b4') &&
      getNeighbors(b.predator.r, b.predator.c).some(n => n.item.cardId === 'b1' || n.item.cardId === 'b4');
    b.prey.item.hp -= b.prey.item.maxHp * biteDmg * (pack ? 1.5 : 1);
    fxAtCell(b.prey.r, b.prey.c, ['#e05a5a', '#ffd34d'], 6);
    fxFloatFromCell(b.prey.r, b.prey.c, '−' + Math.round(biteDmg * (pack ? 150 : 100)) / 1 + '%', '#ff9080');
    changed = true;
    /* Яд Мантикоры (b5): добыча слабеет ещё 5% за тик */
    if (b.predator.card.id === 'b5') {
      b.prey.item.hp -= b.prey.item.maxHp * 0.05;
      fxAtCell(b.prey.r, b.prey.c, ['#80c040', '#c0ff80'], 4);
    }
    /* Шипы Кровавой Лозы (b14): кусавший хищник теряет 3% HP */
    if (preyCard.id === 'b14') {
      b.predator.it.hp = Math.max(1, b.predator.it.hp - b.predator.it.maxHp * 0.03);
      fxAtCell(b.predator.r, b.predator.c, ['#c03050', '#ff6080'], 5);
    }
    /* Щетина Кабана (b2) и Живая Крепость (b17): жиреют от укусов */
    if (preyCard.id === 'b2') b.prey.item.fleshyBuff = Math.min(0.9, (b.prey.item.fleshyBuff || 0) + 0.06);
    if (preyCard.id === 'b17') b.prey.item.fleshyBuff = Math.min(1.0, (b.prey.item.fleshyBuff || 0) + 0.04);
    if (b.prey.item.hp <= 0) {
      const eaten = preyCard.name;
      deaths.push([b.prey.r, b.prey.c]);
      grid[b.prey.r][b.prey.c] = null;
      stats.predKills = (stats.predKills || 0) + 1;
      const dbl = kingCols[b.predator.c] ? 2 : 1;                 /* Корона Зверя */
      const pole = (INC_CTX.bld && (INC_CTX.bld.pole[b.predator.r + ',' + b.predator.c] || 0) > 0) ? 1.5 : 1; /* Столб */
      const base = b.predator.card.id === 'b11' ? 1.6 : 1.2;      /* v1.2.5: +120% / Хищник +160% */
      const cap = (b.predator.card.id === 'b11' ? 4 : 3) * dbl;
      const gain = base * (preyCard.id === 'b13' ? 1.5 : 1) * dbl * pole;
      b.predator.it.predBuff = Math.min(cap, (b.predator.it.predBuff || 0) + gain);
      b.predator.it.hunger = 1;
      fxFloatFromCell(b.predator.r, b.predator.c, '+' + Math.round(gain * 100) + '% СЫТ', '#ffd34d');
      toast(b.predator.card.name + ' сожрал ' + eaten + ': +' + Math.round(gain * 100) + '% дохода хищнику', 'pred', 12);
    } else {
      b.predator.it.hunger = 1;
    }
    /* Гидра (★4): растёт от укусов вокруг добычи */
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
      const nr = b.prey.r + dr, nc = b.prey.c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const hit = grid[nr] && grid[nr][nc];
      if (hit && hit.cardId === 'b9') { hit.hydraBuff = Math.min(3, (hit.hydraBuff || 1) + 0.06); }
    }
  });

  /* 3.5. ДРАКИ ХИЩНИКОВ ЗА ТЕРРИТОРИЮ: без добычи в радиусе охоты хищник
     кусает СОСЕДА-ХИЩНИКА (−6% HP). Теперь лечение флорой решает. */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9' || card.id === 'b10') continue;
    const R = huntRadius(card);
    const hasPreyNear = (R >= 3 ? radius2(r, c).concat(getNeighbors(r, c)) : getNeighbors(r, c))
      .some(n => CARDS[n.item.cardId].faction === 'beast' && isPrey(CARDS[n.item.cardId]));
    if (hasPreyNear) continue;
    const rival = getNeighbors(r, c).find(n => {
      const rc = CARDS[n.item.cardId];
      return rc.faction === 'beast' && (isPredator(rc) || rc.diet === 'scav') && rc.id !== card.id;
    });
    if (rival) {
      rival.item.hp = Math.max(1, rival.item.hp - rival.item.maxHp * 0.06);
      it.hp = Math.max(1, it.hp - it.maxHp * 0.02); /* драка бьёт обоих */
      fxAtCell(rival.r, rival.c, ['#e06030', '#ffb080'], 5);
      changed = true;
    }
  }

  /* 4. Королевский Грифон (★5): царская охота — кусает, но щадит (1 HP) */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'b10') continue;
    const prey = getNeighbors(r, c).find(n => isPrey(CARDS[n.item.cardId]));
    if (!prey) continue;
    if (getNeighbors(prey.r, prey.c).some(n => n.item.cardId === 'b8')) continue;
    if ((B.pen[prey.r + ',' + prey.c] || 0) > 0) continue; /* Вольер защищает */
    prey.item.hp = Math.max(1, prey.item.hp - prey.item.maxHp * 0.10);
    it.predBuff = Math.min(3, (it.predBuff || 0) + 0.10 * (kingCols[c] ? 2 : 1));
    it.hunger = 1;
    changed = true;
  }

  /* 5. ГОЛОД: хищник без добычи слабеет −5%/тик (пол ×0.5).
     Теневой Кот (b6) не голодает никогда. */
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9' || card.id === 'b6') continue;
    if (apexCols[c]) { it.hunger = 1; continue; }        /* Ошейник: сыт всегда */
    const R = huntRadius(card);
    const hasPrey = (R >= 3 ? radius2(r, c).concat(getNeighbors(r, c)) : getNeighbors(r, c))
      .some(n => isPrey(CARDS[n.item.cardId]));
    if (hasPrey) { it.hunger = 1; continue; }
    const fast = hungerFastCols[c] ? 2 : 1;              /* Кость Голода */
    it.hunger = Math.max(0.5, (it.hunger === undefined ? 1 : it.hunger) - 0.05 * fast);
    changed = true;
  }

  /* 6. ПАДАЛЬЩИКИ: +25% за смерть в радиусе 2 (Стервятник — 3).
     ТРОФЕЙНЫЙ СТОЛБ: падальщики чуют дальше (+1) и жиреют ×1.5. */
  deaths.forEach(([dr, dc]) => {
    for (let r = dr - 4; r <= dr + 4; r++) for (let c = dc - 4; c <= dc + 4; c++) {
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      const it = grid[r] && grid[r][c];
      if (!it || CARDS[it.cardId].diet !== 'scav') continue;
      const dist = Math.max(Math.abs(r - dr), Math.abs(c - dc));
      const poleHere = (INC_CTX.bld && (INC_CTX.bld.pole[r + ',' + c] || 0) > 0) ? 1.5 : 1;
      const range = (it.cardId === 'b16' ? 3 : 2) + (poleHere > 1 ? 1 : 0);
      if (dist <= range) {
        it.scavBuff = Math.min(1.0, (it.scavBuff || 0) + 0.25 * poleHere);
        fxAtCell(r, c, ['#b0a060', '#e0d0a0'], 6);
      }
    }
  });

  if (changed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); }
}

/* ================= ДЕМОНЫ: УГЛИ v1.2.5 =================
   В толпе (2+ демона рядом; Дьяволёнок — хватает и одного) демон копит
   угли (макс 5, +10% за уголёк). ЯМА удваивает накопление и делает
   взрывы баффами. При 5 углях — ВЗРЫВ: стабилизаторы (Жрец/Князь/
   Пентакль/Кулак Пекла/Яма) дают бафф (Кулак ×1.35, Иссушитель рядом —
   усиленный ×1.35), иначе 65% бафф / 25% превращение / 10% перегрев ×2 —
   но ЛЕДНИК рядом запрещает перегрев (тихий бафф ×1.15). */
function demonEmberTick() {
  let changed = false;
  const chaosCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && r.kind === 'chaos') chaosCols[+k] = 1;
  }
  const princeHere = hasCard('d10');
  const B = INC_CTX.bld || { pit: {}, glacier: {} };
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon' || card.isBuilding) continue; /* здания не раскаляются */
    const crowd = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon').length;
    const needCrowd = card.id === 'd1' ? 1 : 2;          /* Дьяволёнок злится рано */
    if (crowd < needCrowd) continue;
    const inPit = (B.pit[r + ',' + c] || 0) > 0;         /* Жертвенная Яма */
    const eng = colEngine(c);
    const tutored = (eng && eng.forge) ? 1 : 0;          /* Сердце Вулкана */
    it.embers = Math.min(5, (it.embers || 0) + (inPit ? 2 : 1) + tutored);
    fxAtCell(r, c, ['#ff9030', '#ffd34d'], 4);
    changed = true;
    if (it.embers < 5) continue;

    /* ВЗРЫВ */
    it.embers = 0;
    it.lastBoom = gameTime;
    stats.demonBooms = (stats.demonBooms || 0) + 1;
    let buffVal = 1.25;
    let stabilized = princeHere || inPit || getNeighbors(r, c).some(n => n.item.cardId === 'd6') ||
      (eng && eng.chaosLock);
    if (radius2(r, c).some(n => n.item.cardId === 'd14')) { stabilized = true; buffVal = 1.35; } /* Око Бури */
    const glacier = getNeighbors8(r, c).some(n => n.item.cardId === 'bl_glacier') ||
      (B.glacier[r + ',' + c] || 0) > 0;                            /* Ледник рядом/в зоне */
    const chilled = getNeighbors(r, c).some(n => n.item.cardId === 'd15'); /* Иссушитель: бафф сильнее */
    if (chilled) buffVal = Math.max(buffVal, 1.35);
    const disciplined = getNeighbors(r, c).some(n => n.item.cardId === 'd8');
    if (stabilized) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * buffVal);
      fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
      fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
      toast('🔥 ' + card.name + ' взорвался под контролем: БАФФ ×' + it.mutBuff.toFixed(2), 'demon', 12);
    } else {
      const roll = Math.random();
      if (roll < 0.65 || disciplined) {
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.25);
        fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
        fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
        toast('🔥 ' + card.name + ' взорвался Хаосом: БАФФ ×' + it.mutBuff.toFixed(2), 'demon', 12);
      } else if (roll < 0.90 && !disciplined) {
        /* Превращение в другого демона той же редкости */
        const sameRarity = POOLS[card.rarity].filter(id => CARDS[id].faction === 'demon' && !CARDS[id].isBuilding && id !== card.id);
        const newId = pick(sameRarity.length ? sameRarity : POOLS[card.rarity]);
        const oldName = card.name;
        it.cardId = newId; it.mutBuff = 1; it.embers = 0;
        discovered.add(newId);
        fxAtCell(r, c, ['#c030c0', '#ff40ff', '#fff'], 18, 'big');
        fxFloatFromCell(r, c, 'ПРЕВРАЩЕНИЕ', '#ff60ff');
        toast('🔥 ' + oldName + ' превратился в ' + CARDS[newId].name + '!', 'demon', 12);
      } else if (glacier) {
        /* Ледник: перегрев невозможен — взрыв гаснет в тихий бафф */
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.15);
        fxFloatFromCell(r, c, 'ТИХИЙ БАФФ ×' + it.mutBuff.toFixed(2), '#c0e0ff');
        toast('❄️ Ледник остудил взрыв ' + card.name + ': ×' + it.mutBuff.toFixed(2), 'demon', 12);
      } else {
        /* Перегрев: угли сгорают в чистую мощь — ×2 на 12 сек */
        it.boomUntil = gameTime + 12;
        fxAtCell(r, c, ['#ff4010', '#ffb060', '#fff'], 22, 'big');
        fxFloatFromCell(r, c, 'ПЕРЕГРЕВ ×2', '#ff5030');
        toast('🔥 ' + card.name + ' перегрелся: ×2 на 12 секунд!', 'demon', 12);
      }
    }
    /* Взрыв кормит соседей — Пепельный Тиран (радиус 2), Гончая Ада (радиус 3) */
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
