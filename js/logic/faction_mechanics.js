'use strict';
/*
ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
Тиковые события, зависящие от фракции:
- Нежить: цепи/армия (economy.js) + «Медленный рост» Зомби (u1)
- Культисты : РИТУАЛЬНАЯ ЭКОНОМИКА — участники в цепи от
Алтаря заряжают шкалу (шкала НЕ тает), на 100% ритуал платит Тёмную энергию;
роли: скорость (⚡) и усиление выплаты (💰); формации ускоряют
- Звери : ДИКИЕ УГОДЬЯ (v1.12.0) — зоны/трофеи/выпас/стаи/ауры,
расчёт мгновенный (computeGrounds при каждом пересчёте дохода);
тиков нет — Уход в Чащу (Духи Леса) копится от актов охоты
- Демоны: УГЛИ — толпа → взрыв; здания Яма/Ледник
- ЗДАНИЯ: призыв Кладбища/Врат, ЖАТВА Горы костей (tickBuildings)
 ============================================================*/

let demonTimer = 0, balrTimer = 0, groundsAcc = 0;
let gorTimer = 0, zavTimer = 0, trubTimer = 0; /* v1.11.0: Горнило d22 · Заводила d31 · Трубач d41 */

function tickFactionMechanics(dt) {
  const mech = FACTION_INFO[faction].mechanic;
  /* тихий тик кар-запретов (Карона Тлена и др.) — изгоняет запрещённые карты */
  if (typeof tickRelicBans === 'function') tickRelicBans(dt);
  /* Здания тикают у ВСЕХ фракций (у каждой — свои 3 постройки) */
  tickBuildings(dt);
  if (mech === 'chain') {
    tickUndeadGrowth(dt); /* «Медленный рост» Зомби (u1) */
    tickUndeadRework(dt); /* v1.9.0: пульс Поднятия, лечение, Дань крови, Звон/Ноктюрн/Полночь */
  } else if (mech === 'grounds') {
    /* v1.12.0 ДИКИЕ УГОДЬЯ: тиков нет — считаем только накопление актов
охоты (сек за сек) и Уход в Чащу (Духи Леса) */
    tickGroundsAccum(dt);
  } else if (mech === 'chaos') {
    demonTimer += dt;
    if (demonTimer >= 8) { demonTimer = 0; demonEmberTick(); }
    balrTimer += dt;
    if (balrTimer >= 20) { balrTimer = 0; balrogTick(); }
    gorTimer += dt;                                              /* v1.11.0 Кузнецы/поджигатели */
    if (gorTimer >= 15) { gorTimer = 0; crucibleTick(); }
    zavTimer += dt;
    if (zavTimer >= 30) { zavTimer = 0; instigatorTick(); }
    trubTimer += dt;
    if (trubTimer >= 45) { trubTimer = 0; trumpeterTick(); }
  } else if (mech === 'formation') {
    /* РИТУАЛЬНАЯ ЭКОНОМИКА — заряд + выплата */
    ritualChargeTick(dt);
  }
}

/* ---------------- НЕЖИТЬ: «Медленный рост» Зомби (u1) ----------------
каждые 20с +6% дохода
 НАВСЕГДА (до +60%). Прогресс виден на бейдже карты.*/
const GROW_STEP = 20, GROW_GAIN = 0.06, GROW_CAP = 0.6;
function tickUndeadGrowth(dt) {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it || it.cardId !== 'u1') continue;
    it.growT = (it.growT || 0) + dt;
    if (it.growT >= GROW_STEP) {
      it.growT -= GROW_STEP;
      const before = it.growBuff || 0;
      /* v1.9.0: кап ДИНАМИЧЕСКИЙ — живое звено u1-u3 поднимает потолок
         с +60% до +90% (решение В4, zombieGrowCap в economy.js);
         «Тумандело» (u19) удваивает СКОРОСТЬ роста, кап не меняет. */
      const gain = GROW_GAIN * (livePartners(r, c, CARDS.u1).some(p => p.card.id === 'u19') ? 2 : 1);
      it.growBuff = Math.min(zombieGrowCap(r, c), before + gain);
      if (it.growBuff > before) {
        fxAtCell(r, c, ['#7ec97e', '#c0ffb0'], 6);
        fxFloatFromCell(r, c, 'РОСТ +' + Math.round(it.growBuff * 100) + '%', '#8fc87f');
      }
      changed = true;
    }
  }
  if (changed) { computeIncome(); updateHUD(); }
}

/* ================= v1.9.0 РЕВОРК: ТИКИ ПОДРАС =================
   Все таймеры живут на item и читаются с дефолтом (item.x || 0) —
   старые сейвы (карты уже на поле) не ломаются.
   • u5 «Поднятие»: каждые 60с щит одной Скованной в радиусе 1 —
     её следующее звено ×1.0 (не стакается, Д.2; расход — economy.js).
   • Лечение: u6 3%/30с соседям-Скованным, u14 5%/30с связанной,
     u22 5%/30с связанной + её соседям, u34 20%/45с связанной,
     u37 5%/30с связанным. В ауре «Кровавого обета» (u35) лечение ×2.
   • Кровоток: Дань крови u31 — −5% maxHp/30с связанной, ПОЛ 25% maxHp
     (раны не убивают), в ауре Обета дань не берёт.
   • Пульсы: Звон u21 (45с → связанная ×1.5 на 10с), Ноктюрн u24
     (90с → все Призраки ×1.5 на 10с, окно глобальное — не стакается),
     Полночь u36 (60с → его звенья ×1.5 на 8с, фактор — economy.js). */
let nocturneUntil = 0;
function healAmpAt(r, c) { /* «Кровавый обет» (u35): лечение в ауре вдвое быстрее */
  return INC_CTX.necro && INC_CTX.necro.oath.has(r + ',' + c) ? 2 : 1;
}
function healCell(item, r, c, pct, showFloat) {
  if (item.hp >= item.maxHp - 0.01) return false;
  const amp = healAmpAt(r, c);
  item.hp = Math.min(item.maxHp, item.hp + item.maxHp * pct * amp);
  fxAtCell(r, c, ['#5ab08a', '#a0e0c0'], 5);
  if (showFloat) fxFloatFromCell(r, c, '+' + Math.round(pct * amp * 100) + '% HP', '#8fc8a8');
  return true;
}
function linkedThralls(r, c, card) {
  return livePartners(r, c, card).filter(p => p.card.cat === 'thrall');
}
function tickUndeadRework(dt) {
  let changed = false;
  const timers = (it, key, secs) => { it[key] = (it[key] || 0) + dt; if (it[key] < secs) return false; it[key] = 0; return true; };
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'undead' || card.isBuilding) continue;
    const id = it.cardId;
    if (id === 'u5' && timers(it, 'pulseT', 60)) {
      const targets = getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].cat === 'thrall' && !(n.item.shieldLinks > 0));
      if (targets.length) {
        const t = pick(targets);
        t.item.shieldLinks = 1;
        fxAtCell(t.r, t.c, ['#a0e0b8', '#d8f8e0'], 8);
        fxFloatFromCell(t.r, t.c, 'ПОДНЯТИЕ · щит звена', '#9fd8b0');
        changed = true;
      }
    }
    if (id === 'u6' && timers(it, 'healT', 30)) {
      let served = 0;
      getNeighbors(r, c).forEach(n => {
        if (CARDS[n.item.cardId].cat === 'thrall' && healCell(n.item, n.r, n.c, 0.03, false)) served++;
      });
      if (served) { fxFloatFromCell(r, c, 'слёзы утолили жажду', '#8fc8d8'); changed = true; }
    }
    if (id === 'u14' && timers(it, 'healT', 30)) {
      linkedThralls(r, c, card).forEach(p => { if (healCell(p.item, p.r, p.c, 0.05, true)) changed = true; });
    }
    if (id === 'u22' && timers(it, 'healT', 30)) {
      const seen = {};
      linkedThralls(r, c, card).forEach(p => {
        if (healCell(p.item, p.r, p.c, 0.05, true)) changed = true;
        seen[p.r + ',' + p.c] = 1;
        getNeighbors(p.r, p.c).forEach(n => {
          const nk = n.r + ',' + n.c;
          if (seen[nk]) return;
          seen[nk] = 1;
          if (CARDS[n.item.cardId].cat === 'thrall' && healCell(n.item, n.r, n.c, 0.05, true)) changed = true;
        });
      });
    }
    if (id === 'u34' && timers(it, 'healT', 45)) {
      linkedThralls(r, c, card).forEach(p => { if (healCell(p.item, p.r, p.c, 0.20, true)) changed = true; });
    }
    if (id === 'u37' && timers(it, 'healT', 30)) {
      linkedThralls(r, c, card).forEach(p => { if (healCell(p.item, p.r, p.c, 0.05, true)) changed = true; });
    }
    if (id === 'u31' && timers(it, 'tributeT', 30)) { /* Дань крови — цена баффа +18% */
      linkedThralls(r, c, card).forEach(p => {
        if (INC_CTX.necro && INC_CTX.necro.oath.has(p.r + ',' + p.c)) return; /* Обет: дань не берёт */
        p.item.hp = Math.max(p.item.maxHp * 0.25, p.item.hp - p.item.maxHp * 0.05);
        fxAtCell(p.r, p.c, ['#c03050', '#ff6080'], 5);
        fxFloatFromCell(p.r, p.c, 'ДАНЬ −5% HP', '#ff9080');
        changed = true;
      });
    }
    if (id === 'u21' && timers(it, 'bellT', 45)) {
      it.bellUntil = gameTime + 10;
      fxAtCell(r, c, ['#e8d090', '#fff0c0'], 8);
      changed = true;
    }
    if (id === 'u24' && timers(it, 'noctT', 90) && nocturneUntil < gameTime) {
      nocturneUntil = gameTime + 10; /* окно одно на поле — аура одной карты не стакается */
      fxAtCell(r, c, ['#90a8d8', '#d0e0ff'], 10);
      toast('🎻 <b>Ноктюрн:</b> все Призраки ×1.5 на 10с', 'noct', 25);
    }
    if (id === 'u36' && timers(it, 'midnT', 60)) {
      it.midnightUntil = gameTime + 8;
      fxAtCell(r, c, ['#c090e0', '#f0e0ff'], 8);
      changed = true;
    }
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}

/* ============ КУЛЬТИСТЫ: РИТУАЛЬНАЯ ЭКОНОМИКА ============
У культистов НЕТ дохода — есть РИТУАЛ:
1) Каждый культист в цепи от Алтаря/Хтони — УЧАСТНИК.
2) Роль «скорость»: даёт +N к скорости заряда (⚡); роль «усилитель»
почти не заряжает, но усиливает ВЫПЛАТУ (💰).
3) : СТАКИ усиливают вклад клетки — заряд ×(1+0.35/стак),
выплата +10%/стак (до +50%). Застаканные карты = сильный ритуал.
4) Формации вокруг источника (без пустых клеток): Крест ×1.7 /
Кольцо ×2.0 / Ромб ×2.6; у нескольких Алтарей множители складываются.
5) : ВНЕШНИЙ КРУГ — культисты рядом с ритуалом (но вне цепи)
работают «служителями»: +5% выплаты и +заряд каждый (стаки ×1.5).
6) Обелиск — участникам в его зоне заряд ×1.25; Колодец — выплата +30%.
7) Шкала НИКОГДА не тает — зафейлить до конца нельзя.
8) БАЛАНС: базовые вклады 0.25-0.33%/с, суммарная
скорость растёт через КОРЕНЬ (каждый новый участник даёт меньше) и
ограничена потолком 15%/с — ритуал больше не «пулемёт».
9) Выплата = порог Эпохи × 0.80% × (0.7 + 0.03×участников) × бонусы
(: инкам ритуалов чуть приподнят — 0.72% → 0.80%).
10) ХРАНИТЕЛИ ЖАРА: часть культистов (Послушник/Фанатик/Шептун/
Верховный Жрец/Служка) сохраняет часть заряда после выплаты
следующий ритуал начинается уже заряженным (кап 33%).
11) ЗАКОНЫ РЕЛИКВИЙ (rkeep/rcap/rpaycap/rchain/router/rform/
 rfirst) — только правила, ни одного множителя.*/
const RITUAL_AMPS = { c5: 0.2, c8: 0.3, c9: 0.45, c13: 0.25, c21: 0.2, c10: 0.6, c11: 0.45, c43: 0.2, c44: 0.15 };
const RITUAL_CELL_SPEED = {
  c0: 0.25, c1: 0.25, c2: 0.30, c3: 0.25, c6: 0.27, c7: 0.33, c12: 0.25,
  /* v1.10.0: новые Певчие Хора и Ложи */
  c14: 0.25, c15: 0.26, c16: 0.27, c17: 0.25, c18: 0.28, c19: 0.25,
  c20: 0.25, c21: 0.25, c22: 0, c23: 0,                       /* Сущности Хора сами не заряжают */
  c24: 0.26, c25: 0.25, c26: 0.25, c27: 0.25, c28: 0.25, c29: 0.25, c30: 0.25, c31: 0.25,
  c32: 0, c33: 0,                                              /* Сущности Ложи сами не заряжают */
  /* Бездна: Внешние платят, а не заряжают */
  c34: 0.15, c35: 0.15, c36: 0.15, c37: 0.15, c38: 0.15, c39: 0.15,
  c40: 0.38, c41: 0.35, c42: 0.35, c45: 0.40
};
const RITUAL_AMP_CHARGE = 0.12; /* усилители заряжают чуть-чуть */
/* (автор — Ян Ковач): капы внешнего круга подняты — большие
 постройки служителей не должны становиться бесполезными*/
const RITUAL_OUTER_SPEED = 0.03, RITUAL_OUTER_SPEED_CAP = 0.20;
const RITUAL_OUTER_PAY = 0.05, RITUAL_OUTER_PAY_CAP = 0.45;
let RITUAL_ENGINE = { speed: 0, pay: 1, payout: 0, participants: 0, outer: 0, outerPay: 0, retain: 0, cellSpeed: {}, banner: '', capped: false };

/* ХРАНИТЕЛИ ЖАРА — какие-то карты культистов «сохраняют» часть
заряда после прока ритуала, вплоть до капа в 33%: ритуал начинается
 уже немного заряженным. Проценты скрыты в движке — на картах правило.*/
const RITUAL_RETAIN = { c0: 5, c2: 8, c6: 6, c9: 10, c12: 7, c16: 6, c19: 5 };  // % заряда за участника
const RITUAL_RETAIN_CAP = 33;  // % — потолок сохраняемого жара

/* ======== v1.15.0 «КРУГ»: ХОР / ЛОЖА / БЕЗДНА ========
 Ядро: Алтарь → цепь культистов вокруг него → шкала ритуала → выплата.
 Три рода, у каждого одно правило:
  • ХОР — быстрый заряд и жар (часть заряда остаётся после ритуала);
  • ЛОЖА — «линия»: карты Ложи в колонке Алтаря платят +8% к выплате
    каждая (до +40%);
  • БЕЗДНА — щедрая выплата: каждая карта Бездны в круге даёт +15%
    (★5 — +25%) к выплате.
 Убраны: Сомнение, зеркальные пары и углы Ложи, теофании, мутации,
 Одержимые с изъянами. */
function cultistCardsOf(pred) {
  const out = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'cultist' || card.isBuilding) continue;
    if (pred(card)) out.push({ r, c, item: it, card });
  }
  return out;
}
function chthonsOnBoard() { return cultistCardsOf(cd => !!RITUAL_SOURCES[cd.id]).length; }
function outerOnBoard() { return cultistCardsOf(cd => cd.subrace === 'outer').length; }
function hasBoard(id) { return cultistCardsOf(cd => cd.id === id).length > 0; }

/* ЛИНИЯ ЛОЖИ: колонка Алтаря (+ колонка Тени Основателя c32, + строка
   Алтаря с Геометром c27). Карта Ложи на линии платит +8% (+12% с
   Хранителем Чертежа c28 / Столпом c33). */
function lodgeGeometry() {
  const G = { axes: [], axisSet: {}, rowSet: {}, axisCount: 0, axisPay: 0 };
  if (FACTION_INFO[faction].mechanic !== 'formation') return G;
  const lodge = cultistCardsOf(cd => cd.subrace === 'lodge');
  if (!lodge.length || !INC_CTX.ritualSrc) return G;
  const [sr, sc] = INC_CTX.ritualSrc.split(',').map(Number);
  G.axisSet[sc] = 1; G.axes.push(sc);
  cultistCardsOf(cd => cd.id === 'c32').forEach(t => { if (!G.axisSet[t.c]) { G.axisSet[t.c] = 1; G.axes.push(t.c); } });
  if (hasBoard('c27')) G.rowSet[sr] = 1;
  const axisRate = (hasBoard('c28') || hasBoard('c33')) ? 0.12 : 0.08;
  lodge.forEach(L => { if (G.axisSet[L.c] || G.rowSet[L.r]) { G.axisCount++; G.axisPay += axisRate; } });
  return G;
}

function computeRitualEngine() {
  const E = { speed: 0, pay: 1, payout: 0, participants: 0, outer: 0, outerPay: 0, retain: 0, cellSpeed: {}, banner: '', ready: false, capped: false };
  if (FACTION_INFO[faction].mechanic !== 'formation') return E;
  const B = INC_CTX.bld || { obelisk: {}, wells: 0 };
  /* ЗАКОНЫ реликвий — потолки/насыщение/жар (ни одного множителя) */
  const rel = ritualRuleMods();
  /* v1.10.0: геометрия Ложи + аура Духа Хора + присутствие внешних */
  const G = lodgeGeometry();
  const extOn = outerOnBoard() > 0;
  const aura22 = new Set();
  cultistCardsOf(cd => cd.id === 'c22').forEach(h => {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) aura22.add((h.r + dr) + ',' + (h.c + dc));
  });
  let payBonus = 0, bannerParts = [];
  let has34 = false, has35 = false, has38 = false, has39 = false, abyssN = 0;
  /* Формационный множитель: 1 + Σ(множитель−1) по всем активным формациям.
 КАРА «Вериг Пустоты» (rcNoForm): формации не ускоряют заряд.*/
  let formMult = 1, forms = 0;
  for (const k in INC_CTX.formActive) { formMult += INC_CTX.formActive[k].formMult - 1; forms++; }
  /* v1.10.0: Хормастер (c20) — формации +0.5; Архитектор Круга (c30) — формация с ним в клетке +0.3 */
  if (forms && hasBoard('c20')) formMult += 0.5 * forms;
  if (hasBoard('c30')) for (const fk in INC_CTX.formActive) {
    const F = INC_CTX.formActive[fk];
    if ((F.cells || []).some(cell => grid[cell[0]] && grid[cell[0]][cell[1]] && grid[cell[0]][cell[1]].cardId === 'c30')) formMult += 0.3;
  }
  if (rel.formFree) { if (forms) bannerParts.push('формации без предела'); }
  else if (rel.rcNoForm) { formMult = 1; if (forms) bannerParts.push('вериги сковывают формации'); }
  else formMult = Math.min(hasBoard('c20') ? 3.7 : 3.2, formMult);
  if (forms && !rel.formFree && !rel.rcNoForm) bannerParts.push('формации ×' + formMult.toFixed(2));
  /* Участники: культисты в цепи ритуала (здания — не участники) */
  let rawSum = 0;
  const rawCell = {};
  const c18Cells = []; /* v1.12.2: клетки Дьячков — пост-правка по внешним кругам */
  /* v1.12.2: предсчёт участников ритуала (для «Канона в 900 строк» Стихаря) */
  let totalParticipants = 0;
  INC_CTX.ritual.forEach(k => {
    const [r0, c0] = k.split(',').map(Number);
    const it0 = grid[r0] && grid[r0][c0];
    if (it0 && !CARDS[it0.cardId].isBuilding && it0.cardId !== 'bl_altar') totalParticipants++;
  });
  INC_CTX.ritual.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const it = grid[r][c]; if (!it) return;
    const card = CARDS[it.cardId];
    if (card.isBuilding || card.id === 'bl_altar') return;
    E.participants++;
    const st = it.stacks || 1;
    const stSpeed = rel.rcFlat ? 1 : (1 + 0.35 * (st - 1)); /* кара Кадила: стаки не усиливают заряд */
    let raw = 0;
    if (RITUAL_AMPS[card.id]) {
      raw = RITUAL_AMP_CHARGE * stSpeed;
      /* КАРА «Зрачка Бездны» (rcAmpHalf): усилители выплаты дают вдвое меньше */
      payBonus += (RITUAL_AMPS[card.id] + 0.10 * Math.min(5, st - 1)) * (rel.rcAmpHalf ? 0.5 : 1);
    } else {
      raw = (RITUAL_CELL_SPEED[card.id] || 0.25) * stSpeed;
      if (card.id === 'c1') { /* Сектант: +бонус за соседа в ритуале */
        const ns = getNeighbors(r, c).filter(n => INC_CTX.ritual.has(n.r + ',' + n.c) && !CARDS[n.item.cardId].isBuilding).length;
        raw += 0.04 * ns;
      }
      payBonus += 0.10 * Math.min(5, st - 1); /* стаки участника = +10% выплаты каждый (до +50%) */
    }
    /* v1.10.0: личные правила новых Певчих и Одержимых */
    if (card.id === 'c14') raw += 0.05 * getNeighbors8(r, c).filter(n => CARDS[n.item.cardId].faction === 'cultist' && CARDS[n.item.cardId].cat === 'chanter').length;
    if (card.id === 'c15' && st >= 2) raw *= 1.2;
    /* v1.12.2: Канон Стихаря (c17) — паства кормит проповедь; Дьячков собираем на пост-правку */
    if (card.id === 'c17') raw *= 1 + 0.02 * Math.min(10, totalParticipants);
    if (card.id === 'c18') c18Cells.push(k);
    if (card.id === 'c19') raw *= 1 + 0.06 * radius2(r, c).filter(n => n.item && CARDS[n.item.cardId].isBuilding).length;
    if (card.id === 'c24' && (G.axisSet[c] || G.rowSet[r])) raw *= 1.10;
    if (card.id === 'c25' && getNeighbors(r, c).some(n => CARDS[n.item.cardId].subrace === 'lodge' && INC_CTX.ritual.has(n.r + ',' + n.c))) raw *= 1.12;
    if (card.id === 'c42' && outerOnBoard() > 1) raw *= 1.10;
    /* БЕЗДНА: каждая карта Бездны в круге платит +15% (★5 — +25%) */
    if (card.subrace === 'outer' && !RITUAL_SOURCES[card.id]) { payBonus += card.rarity === 5 ? 0.25 : 0.15; abyssN++; }
    if (card.id === 'c34') has34 = true;
    if (card.id === 'c35') { has35 = true; payBonus += 0.30; }
    if (card.id === 'c36') payBonus += 0.03 * Math.min(10, totalParticipants);
    if (card.id === 'c37') payBonus += 0.10;
    if (card.id === 'c38') has38 = true;
    if (card.id === 'c39') has39 = true;
    if (card.cat === 'chanter' && aura22.has(r + ',' + c)) raw *= 1.3; /* Дух Хора (c22): аура скорости */
    /* ХРАНИТЕЛИ ЖАРА: участник сохранит часть заряда после выплаты.
 КАРА «Многоликой Маски» (rcNoRetain): хранители не хранят ничего.
 v1.10.0: Шепчущая Плоть (c41, изъян) — соседи-Хор не хранят жар.*/
    if (RITUAL_RETAIN[card.id] && !rel.rcNoRetain) {
      E.retain += RITUAL_RETAIN[card.id] * (1 + 0.5 * (st - 1));
      /* v1.12.2 Кадильный дым (c16): Хранители Жара в его дыму хранят ещё +3% */
      if (card.id !== 'c16' && radius2(r, c).some(n => n.item && n.item.cardId === 'c16')) {
        E.retain += 3 * (1 + 0.5 * (st - 1));
      }
    }
    /* Обелиск: заряд участника в его зоне ×1.25 (кап ×1.5); прикованный Обелиск — ×1.375 */
    const ob = B.obelisk[k] || 0;
    if (ob) raw *= Math.min(1.5, 1 + (B.obeliskM && B.obeliskM[k] ? 0.375 : 0.25) * ob);
    rawCell[k] = raw; rawSum += raw;
  });
  /* ВНЕШНИЙ КРУГ : служители вне цепи, но рядом с ней.
 КАРА «Ока Ритуала» (outerDead): внешний круг глух и слеп.*/
  let outerRaw = 0;
  if (!rel.outerDead) INC_CTX.ritualOuter.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const it = grid[r][c]; if (!it) return;
    if (CARDS[it.cardId].isBuilding) return;
    E.outer++;
    const st = it.stacks || 1;
    const stMult = rel.rcFlat ? 1 : (1 + 0.5 * (st - 1));
    outerRaw += RITUAL_OUTER_SPEED * stMult;
    E.outerPay += RITUAL_OUTER_PAY * stMult;
    rawCell[k] = RITUAL_OUTER_SPEED * stMult;
  });
  if (has39) E.outerPay *= 2; /* Шёпот За Стеной: служители платят вдвое */
  if (!rel.outerFree) {
    outerRaw = Math.min(RITUAL_OUTER_SPEED_CAP, outerRaw);
    E.outerPay = Math.min(RITUAL_OUTER_PAY_CAP, E.outerPay);
  } else if (E.outer) bannerParts.push('круг без предела');
  if (E.outer) bannerParts.push('внешний круг +' + Math.round(E.outerPay * 100) + '%');
  payBonus += E.outerPay;
  /* Служка (c12): культисты ВНЕ ритуала рядом с ней дают ещё заряд */
  if (!rel.outerDead) for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
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
  /* ===== ЛОЖА: линия Алтаря ===== */
  if (G.axisCount) {
    const ap = Math.min(hasBoard('c29') ? 0.60 : 0.40, G.axisPay);
    payBonus += ap +
      (hasBoard('c26') ? Math.min(0.30, 0.06 * G.axisCount) : 0) +
      (hasBoard('c33') ? 0.10 * Math.min(5, G.axisCount) : 0);
    bannerParts.push('линия Ложи +' + Math.round(ap * 100) + '%');
  }
  if (hasBoard('c31')) payBonus += 0.10; /* Хранительница Очага */
  if (abyssN) bannerParts.push('Бездна ×' + abyssN);
  /* v1.12.2 Правки Дьячка (c18): внешние круги подсчитаны — каждый даёт +2% к его вкладу */
  if (E.outer && c18Cells.length) {
    c18Cells.forEach(k => {
      const d = rawCell[k] * 0.02 * E.outer;
      rawCell[k] += d;
      rawSum += d;
    });
  }
  /* ИТОГОВАЯ СКОРОСТЬ: корень из суммы вкладов — мягкое насыщение
(каждый новый участник даёт меньше прежнего), потолок 15%/с.
ЗАКОНЫ: «Вериги Пустоты» снимают насыщение (вклад линейный),
 «Око Ритуала» отодвигает потолок.*/
  const heat = rel.noSatur ? (rawSum + outerRaw) : Math.sqrt(rawSum + outerRaw);
  /* КАРА «Свечи Мученика» (rcSlow): ритуал заряжается на 20% медленнее */
  E.speed = Math.min(rel.capSpeed, 1.2 * heat * formMult * bannerMult * (rel.rcSlow ? 0.8 : 1));
  if (has34) E.speed = Math.min(rel.capSpeed, E.speed * 1.25); /* Спящий между Мирами */
  E.capped = rawSum + outerRaw > 0 && E.speed >= rel.capSpeed;
  if (E.capped) bannerParts.push('потолок ⚡');
  /* Раскладка скорости по клеткам (для бейджей ⚡ на картах) */
  if (rawSum + outerRaw > 0 && E.speed > 0) {
    const tot = rawSum + outerRaw;
    for (const k in rawCell) E.cellSpeed[k] = E.speed * (rawCell[k] / tot);
  }
  /* Колодец: выплата +30% (кап +60%); ⛓ прикованный Колодец: +45% (кап +90%) */
  const wells = B.wells || 0;
  if (wells) {
    const wPay = B.wellsChained ? 0.45 : 0.3, wCap = B.wellsChained ? 0.9 : 0.6;
    payBonus += Math.min(wCap, wPay * wells);
    bannerParts.push('колодцы +' + Math.round(Math.min(wCap * 100, wPay * 100 * wells)) + '%');
  }
  /* потолок выплаты — закон «Зрачка Бездны» (×4 → ×7); Пустотелый (c40) может просадить ниже 1 */
  E.pay = Math.min(rel.capPay, Math.max(1, 1 + Math.min(2.5, payBonus)));
  /* Выплата: привязана к порогу Эпохи — растёт вместе с игрой.
коэффициент 0.80% — инкам ритуалов чуть приподнят.*/
  E.payout = Math.round(epochThreshold(epoch) * 0.0080 * (0.7 + 0.03 * Math.min(24, E.participants)) * E.pay);
  /* ЖАР: сохраняемый заряд = хранители + закон «Свечи Мученика»;
 v1.10.0: Пустотный Серафим (c23) поднимает кап до 50% */
  const heatCap = (hasBoard('c23') ? 50 : RITUAL_RETAIN_CAP) + (has38 ? 15 : 0); /* Хор Угасших Звёзд: +15% жара */
  E.heatCap = heatCap;
  E.retain = Math.min(heatCap, Math.round(E.retain) + (rel.keep || 0));
  if (E.retain < 0) E.retain = 0;
  if (E.retain > 0) bannerParts.push('жар: +' + E.retain + '% к следующему');
  if (has35) E.retain = 0; /* Пожиратель Формул съедает жар */
  E.banner = bannerParts.join(' · ');
  E.ready = INC_CTX.ritual.size > 0;
  return E;
}

/* движок ритуала пересчитывается 10 раз/с вместо каждого
кадра (он сканирует цепь, стаки, здания). Скорость заряда между
 пересчётами неизменна — шкала и цифры на экране те же самые.*/
let _ritualEngineAt = -1;
function ritualChargeTick(dt) {
  if (_ritualEngineAt < 0 || gameTime - _ritualEngineAt >= 0.1) {
    RITUAL_ENGINE = computeRitualEngine();
    INC_CTX.ritualCellSpeed = RITUAL_ENGINE.cellSpeed;
    _ritualEngineAt = gameTime;
  }
  if (RITUAL_ENGINE.speed <= 0) return;
  const before = ritualResonance;
  ritualResonance = Math.min(100, ritualResonance + dt * RITUAL_ENGINE.speed);
  if (before < 100 && ritualResonance >= 100) ritualPayout();
}

/* РИТУАЛ ЗАВЕРШЁН: гарантированная выплата Тёмной энергии. Шкала НЕ тает
полный фейл невозможен, худший случай — медленный цикл.
шкала после выплаты НЕ ОБНУЛЯЕТСЯ — хранители жара
(и закон «Свечи Мученика») оставляют до 33% заряда следующему ритуалу.
закон «Кровавой Чаши» продлевает двойную выплату на первые ритуалы.*/
function ritualPayout() {
  const E = RITUAL_ENGINE.speed > 0 ? RITUAL_ENGINE : computeRitualEngine();
  const relPay = ritualRuleMods();
  let pay = E.payout;
  const first = runRituals < (relPay.firstN || 1);
  if (first) pay = Math.round(pay * 2);
  /* КАРА «Кровавой Чаши» (rcPost3): ритуалы после третьего платят вдвое меньше */
  let bloodDry = false;
  if (relPay.rcPost3 && runRituals + 1 > 3) { pay = Math.round(pay * 0.5); bloodDry = true; }
  crystals += pay;
  runRituals++; /* счётчик для Сводки Эпохи */
  const keep = Math.min(E.heatCap || RITUAL_RETAIN_CAP, Math.round(E.retain || 0));
  ritualResonance = keep; /* вместо обнуления — сохранённый жар */
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
    fxFloatFromCell(ar, ac, '🔥 РИТУАЛ: +' + fmtShort(pay) + ' ТЭ' + (first ? ' ×2' : '') + (bloodDry ? ' ×0.5' : '') + (keep ? ' · жар +' + keep + '%' : ''), '#ffe080', 22);
  }
  if (toast('🔥 <b>Ритуал завершён:</b> +' + fmtShort(pay) + ' ' + DE_IMG + (first ? ' <b>· ПРОСЫПЛЕН КРОВЬЮ — ×2!</b>' : '') +
    (bloodDry ? ' <b>· КРОВЬ КОНЧИЛАСЬ — ×0.5</b>' : '') +
    (keep ? ' · сохранён жар: +' + keep + '%' : '') +
    (E.banner ? ' <small>(' + E.banner + ')</small>' : ''), 'ritual', 30)) sfx('relic');
  saveRun(); updateHUD(); checkAchievements();
}

/* ---------------- НЕЖИТЬ ---------------- */
function hasCard(id) {
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
    if (grid[r][c] && grid[r][c].cardId === id) return true;
  return false;
}

/* ---------------- ДЕМОНЫ: Балрог (★4) — «Кузня» ----------------
   v1.11.0: Кузнец бьёт в РАДИУСЕ 2 (было — только соседи). */
function balrogTick() {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'd9') continue;
    const targets = radius2(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding);
    if (!targets.length) continue;
    const t = pick(targets);
    t.item.embers = Math.min(5, (t.item.embers || 0) + 2);
    t.item.lastMut = gameTime;
    it.balrBuff = Math.min(3, (it.balrBuff || 1) + 0.05);
    fxAtCell(t.r, t.c, ['#ff8030', '#ffd34d', '#ff4010'], 10);
    toast('🌋 Балрог поджёг ' + CARDS[t.item.cardId].name + ': +2 угля (' + t.item.embers + '/5)', 'balrog', 30);
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}

/* ---------------- ДЕМОНЫ v1.11.0: КУЗНЕЦЫ И ПОДЖИГАТЕЛИ ----------------
   Горнило (d22, 15с): ДВА соседа получают +1 уголёк.
   Тёмный Заводила (d31, 30с): соседу +2 угля и метку «подкуражен» —
   взорвётся за 15с → Заводила получает +20% на 30с.
   Трубач Пекла (d41, 45с): весь строй в радиусе 3 — +1 уголёк.
   Поджоги суммируются с Цепным пожаром, кап 5 углей общий (Т.4.1). */
function crucibleTick() {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'd22') continue;
    const targets = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding);
    if (!targets.length) continue;
    const chosen = targets.slice().sort(() => Math.random() - 0.5).slice(0, 2);
    chosen.forEach(t => {
      t.item.embers = Math.min(5, (t.item.embers || 0) + 1);
      fxAtCell(t.r, t.c, ['#ff8030', '#ffd34d'], 8);
    });
    fxAtCell(r, c, ['#ff8030', '#fff'], 6);
    toast('♨️ Горнило подожгло ' + chosen.map(t => CARDS[t.item.cardId].name).join(' и ') + ': +1 уголёк', 'gornc', 30);
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}
function instigatorTick() {
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'd31') continue;
    const targets = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding);
    if (!targets.length) continue;
    const t = pick(targets);
    t.item.embers = Math.min(5, (t.item.embers || 0) + 2);
    fxAtCell(t.r, t.c, ['#c060ff', '#ff8030'], 8);
    toast('🎭 Заводила подкинул ' + CARDS[t.item.cardId].name + ' 2 угля', 'zavod', 30);
    changed = true;
  }
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}
function trumpeterTick() {
  const LEGF = buildLegionFormation();
  INC_CTX.legionForm = LEGF.map;
  INC_CTX.legionGroups = LEGF.groups;
  const FORM = LEGF.map;
  let changed = false;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c];
    if (!it || it.cardId !== 'd41') continue;
    let fed = 0;
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      if (Math.max(Math.abs(dr), Math.abs(dc)) > 3) continue;
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const nb = grid[nr] && grid[nr][nc]; if (!nb) continue;
      const q = CARDS[nb.cardId];
      if (q.faction !== 'demon' || q.isBuilding) continue;
      if (!FORM[nr + ',' + nc]) continue; /* только строй */
      nb.embers = Math.min(5, (nb.embers || 0) + 1);
      fxAtCell(nr, nc, ['#ff8030', '#ffd34d'], 6);
      fed++;
    }
    if (fed) { fxAtCell(r, c, ['#ffd34d', '#fff'], 8); changed = true; }
  }
  if (changed) { toast('📯 Трубач Пекла: строй раскалился — по угольку каждому', 'trump', 30); computeIncome(); renderGrid(); updateHUD(); }
}

/* ================= ЗВЕРИ: «ЛЕС» (v1.18.0) =================
 Каждый зверь очерчивает УГОДЬЯ (радиус 1; ★4/★5 — 2; Жадный прыжок — 3).
 Всё держится на трёх простых связях и трёх родах:
  • СТАЯ (хищники, падальщики): ТРОФЕЙ — +12% за каждую дичь в угодьях
    (кап +36%); хищники с пересекающимися угодьями — союзники, +4% за каждого;
    падальщики идут за охотой: +10% за каждого охотящегося хищника рядом;
  • СТАДО (дичь): ВЫПАС — +8% за каждую зелень в угодьях (кап +32%);
    без зелени — вольный луг, +12%;
  • ЧАЩА (флора): РОСТ — +4% за каждую дичь в угодьях и +8% за соседнюю
    зелень.
 Убраны: укрытие дичи, твёрдая дичь, хитрецы, штрафы от шипов и колючек,
 короны альф, случайный «Уход в Чащу». Реликвии закрыты, законов нет. */
const GROUNDS_RULES = {
  TROPHY_PCT: 0.12, TROPHY_CAP: 0.36,
  GRAZE_PCT: 0.08, GRAZE_CAP: 0.32,
  FEED_PCT: 0.04, FEED_CAP: 0.40,
  POR_PCT: 0.08, POR_CAP: 0.24,
  PACK_PCT: 0.04, PACK_CAP: 0.20,
  SCAV_PCT: 0.10, SCAV_CAP: 0.40,
  PEN_GRAZE: 1.5, POLE_TROPHY: 1.5, POLE_SCAV: 1.5, SPRING_POR: 2
};
/* Ауры Тотемов (радиусы) — от угодий не зависят */
const AURA_TOTEM = { b8: 2, b38: 2, b49: 2, b51: 3, b52: 2 };

/* Радиус угодий карты: ★4/★5 — 2, рядовые — 1; Жадный прыжок — 3.
Здания зон не имеют (их ауры — BUILDING_AURA). Хозяин Троп и Солончик
добавляют +1 уже в computeGrounds. */
function groundRadius(card) {
  if (card.isBuilding || !card.diet) return 0;
  if (card.id === 'b4') return 3;
  return rarityRank(card.rarity) >= 4 ? 2 : 1;
}

/* Результат последнего расчёта угодий (читают экономика, рендер, тултипы) */
let BEAST_GROUNDS = { mults: {}, active: {}, acts: 0, packs: 0, packBest: 0, alpha: {}, packEdges: [], zones: [] };

function computeGrounds() {
  const R = GROUNDS_RULES;
  const out = { mults: {}, active: {}, acts: 0, packs: 0, packBest: 0, alpha: {}, packEdges: [], zones: [] };
  const B = INC_CTX.bld || { pen: {}, pole: {}, spring: {} };

  /* --- сбор зверей на поле --- */
  const beasts = [];
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'beast' || card.isBuilding) continue;
    beasts.push({ r, c, it, card, rad: groundRadius(card),
      pred: card.diet === 'pred' && card.id !== 'b59',   /* Хозяин Троп сам не охотит */
      herb: card.diet === 'herb',
      flora: card.diet === 'flora',
      scav: card.diet === 'scav' });
  }
  /* b59 Хозяин Троп: угодья ВСЕХ зверей поля +1 радиус; Солончик: флоре в его зоне +1 */
  if (beasts.some(x => x.card.id === 'b59')) beasts.forEach(x => { if (x.rad) x.rad++; });
  beasts.forEach(x => { if (x.rad && x.flora && (B.spring[x.r + ',' + x.c] || 0) > 0) x.rad++; });
  const dist = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c));
  const overlap = (a, b) => dist(a, b) <= Math.max(a.rad, b.rad);
  const covered = (p, srcId) => beasts.some(x => x.card.id === srcId && x !== p && dist(x, p) <= x.rad);
  beasts.forEach(x => { if (x.rad) out.zones.push({ r: x.r, c: x.c, rad: x.rad }); });

  /* --- ауры Тотемов --- */
  const auras = {};
  beasts.forEach(x => {
    const ar = AURA_TOTEM[x.card.id]; if (!ar) return;
    const s = auras[x.card.id] = auras[x.card.id] || new Set();
    for (let dr = -ar; dr <= ar; dr++) for (let dc = -ar; dc <= ar; dc++) {
      const nr = x.r + dr, nc = x.c + dc;
      if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) s.add(nr + ',' + nc);
    }
  });
  const inAura = (id, r, c) => !!(auras[id] && auras[id].has(r + ',' + c));

  const floraList = beasts.filter(x => x.flora);
  const herbList = beasts.filter(x => x.herb);
  const preds = beasts.filter(x => x.pred);

  /* --- СТАЯ: хищники с пересекающимися угодьями (для линий и счёта) --- */
  const comp = preds.map((_, i) => i);
  const find = i => comp[i] === i ? i : (comp[i] = find(comp[i]));
  preds.forEach((a, i) => preds.forEach((b, j) => {
    if (j <= i || !overlap(a, b)) return;
    comp[find(i)] = find(j);
    out.packEdges.push([a.r, a.c, b.r, b.c]);
  }));
  const packs = {};
  preds.forEach((x, i) => { const r0 = find(i); (packs[r0] = packs[r0] || []).push(x); });
  Object.values(packs).forEach(g => { if (g.length > 1) out.packs++; if (g.length > out.packBest) out.packBest = g.length; });

  /* --- ФАЗА 1: хищники — трофеи --- */
  const actsList = [];
  beasts.forEach(p => {
    const key = p.r + ',' + p.c;
    let bonus = 0, m = 1;
    if (p.pred) {
      const id = p.card.id;
      let preyVal = 0, preyCount = 0; const species = {};
      if (id !== 'b9') herbList.forEach(q => {                  /* Гидра сама не охотит */
        if (dist(p, q) > p.rad) return;                           /* дичь только в СВОИХ угодьях */
        let val = 1;
        if (q.card.id === 'b0') val = 2;                          /* Крыса: домашняя дичь Стаи */
        else if (q.card.id === 'b25') val = 1.5;                  /* Кролик: сытная добыча */
        preyVal += val; preyCount++; species[q.card.id] = 1;
      });
      if (preyCount > 0) actsList.push(p);
      p.trophyN = preyCount;
      const pct = id === 'b22' ? 0.15 : R.TROPHY_PCT;
      const cap = id === 'b11' ? 9.99 : (id === 'b22' ? 0.45 : R.TROPHY_CAP);
      bonus += Math.min(cap, preyVal * pct);
      if (id === 'b10') bonus += Math.min(1.0, 0.25 * Object.keys(species).length);          /* Лев: за каждый ВИД дичи */
      if (id === 'b8') bonus += Math.min(0.40, 0.10 * herbList.filter(q => dist(p, q) <= 2).length); /* Взгляд */
      if (id === 'b6') bonus += 0.05 * getNeighbors(p.r, p.c).filter(n => { const k = CARDS[n.item.cardId]; return k.faction === 'beast' && k.diet === 'pred'; }).length;
      if (id === 'b1') {
        const wolfs = preds.filter(x => x !== p && (x.card.id === 'b1' || x.card.id === 'b4') && overlap(x, p)).length;
        bonus += Math.min(0.30, 0.10 * wolfs);
        if (wolfs > 0) m *= 1.5;                                  /* сородич в общей зоне */
      }
      if (id === 'b18' && !preds.some(x => x !== p && dist(x, p) <= Math.max(p.rad, x.rad))) bonus += 0.15; /* Одиночка */
      if (id === 'b5') m *= 1.25;                                 /* Токсичный надел */
      if (id === 'b23') m *= 1.25;                                /* Вожак */
      if ((B.pole[key] || 0) > 0) m *= R.POLE_TROPHY;
      /* стая: союзники в общих угодьях */
      const allies = preds.filter(x => x !== p && overlap(x, p)).length;
      bonus += Math.min(R.PACK_CAP, R.PACK_PCT * allies);
      if (covered(p, 'b23')) bonus += 0.10;                       /* Вожак: стая в его угодьях */
      if (covered(p, 'b24')) bonus += 0.12;                       /* Зима */
      if (covered(p, 'b54')) bonus += 0.12;                       /* Серый Предок */
      if (beasts.some(x => x.card.id === 'b58')) m *= 1.2;        /* Полуночный Гон: все хищники поля */
    }
    out.mults[key] = m * (1 + bonus);
    if (bonus > 0 || p.trophyN > 0) out.active[key] = 1;
  });

  /* --- ФАЗА 2: дичь, флора, падальщики --- */
  beasts.forEach(p => {
    const key = p.r + ',' + p.c, id = p.card.id;
    let bonus = 0, m = 1;

    if (p.herb) {
      if (id === 'b0') {
        bonus += Math.min(0.24, 0.08 * beasts.filter(x => x !== p && overlap(x, p)).length); /* Крыса: за каждого зверя рядом */
      } else {
        /* ВЫПАС: зелень в своих угодьях */
        let g = floraList.filter(f => dist(p, f) <= p.rad).length * R.GRAZE_PCT * (id === 'b29' ? 2 : 1);
        if (covered(p, 'b43')) g += 0.04;
        if (covered(p, 'b44')) g += 0.06;
        if (covered(p, 'b45')) g += 0.08;
        if (covered(p, 'b35')) g += 0.10;                         /* Пастырь */
        if (covered(p, 'b55')) g += 0.12;                         /* Рогатая Мать */
        if (covered(p, 'b39')) g += 0.08;                         /* Плотный подлесок */
        if (!g) g = 0.12;                                         /* вольный луг: стадо живёт и без Чащи */
        let cap = R.GRAZE_CAP;
        if (covered(p, 'b17') || id === 'b55') cap = 9.99;        /* Колосс / Рогатая Мать: кап снят */
        bonus += Math.min(cap, g);
        if (bonus > 0) {
          if (floraList.some(f => f.card.id === 'b15' && dist(p, f) <= p.rad)) m *= 1.5; /* Споры */
          if ((B.pen[key] || 0) > 0) m *= R.PEN_GRAZE;            /* Вольер */
        }
      }
      if (id === 'b26') bonus += beasts.some(x => x.pred && dist(x, p) <= Math.max(p.rad, x.rad)) ? 0 : 0.12; /* Косуля: пока нет хищника */
      if (id === 'b28' && beasts.some(x => x.pred && dist(x, p) <= p.rad)) bonus += 0.12;   /* держит удар */
      if (id === 'b2') {                                          /* Кабан роется у построек */
        let bldNear = 0;
        for (let dr = -p.rad; dr <= p.rad; dr++) for (let dc = -p.rad; dc <= p.rad; dc++) {
          const nr2 = p.r + dr, nc2 = p.c + dc;
          if (nr2 < 0 || nr2 >= GRID_SIZE || nc2 < 0 || nc2 >= GRID_SIZE) continue;
          const gi = grid[nr2][nc2];
          if (gi && CARDS[gi.cardId].isBuilding) bldNear++;
        }
        bonus += Math.min(0.24, 0.08 * bldNear);
      }
      if (covered(p, 'b37')) m *= 1.25;                           /* Мамонт: стадо в его угодьях ×1.25 */
      if (covered(p, 'b33')) bonus += 0.10;                       /* Круг обороны */
      if (id === 'b32') bonus += Math.min(0.24, 0.08 * beasts.filter(x => x.pred && dist(x, p) <= 2).length);
      if (id === 'b36') bonus += Math.min(0.30, 0.10 * beasts.filter(x => x.pred && dist(x, p) <= p.rad).length);
      if (id === 'b12') bonus += Math.min(0.20, 0.05 * beasts.filter(x => x.herb && x !== p && overlap(x, p)).length);
      if (id === 'b27') bonus += Math.min(0.24, 0.08 * beasts.filter(x => x.herb && x !== p && overlap(x, p)).length);
      if (id === 'b34') {                                         /* Неприручённый: ни флоры, ни зданий рядом */
        let free = true;
        for (let dr = -p.rad; dr <= p.rad && free; dr++) for (let dc = -p.rad; dc <= p.rad; dc++) {
          const nr = p.r + dr, nc = p.c + dc;
          if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE || !grid[nr][nc]) continue;
          const cd2 = CARDS[grid[nr][nc].cardId];
          if (cd2.isBuilding || cd2.diet === 'flora') { free = false; break; }
        }
        if (free) bonus += 0.12;
      }
      if (inAura('b38', p.r, p.c)) bonus += 0.12;                 /* Сияние */
      if (covered(p, 'b53')) bonus *= 1.25;                       /* Дурман: выпас ×1.25 */
    }

    if (p.flora) {
      /* РОСТ: +4% за каждую дичь в угодьях (Шипы и Токсины кормят вдвое) */
      const feedPct = (id === 'b14' || id === 'b42') ? R.FEED_PCT * 2 : R.FEED_PCT;
      bonus += Math.min(R.FEED_CAP, herbList.filter(h => dist(p, h) <= p.rad).length * feedPct);
      /* ПОРОСЛЬ: другая зелень в общих угодьях */
      let porPct = R.POR_PCT, porCap = R.POR_CAP, porN;
      if (id === 'b40') {                                         /* Оплетает: радиус 2 */
        porN = floraList.filter(f => f !== p && dist(p, f) <= 2).length; porPct = 0.06; porCap = 0.18;
      } else {
        if (id === 'b46') { porPct = 0.12; porCap = 0.36; }       /* Паразит */
        porN = floraList.filter(f => f !== p && dist(p, f) <= Math.max(p.rad, f.rad)).length;
      }
      let por = Math.min(porCap, porN * porPct);
      if ((B.spring[key] || 0) > 0) por *= R.SPRING_POR;          /* Солончик */
      bonus += por;
      /* Покровители и Тотемы Чащи подкармливают зелень */
      if (covered(p, 'b7')) bonus += 0.10;
      if (covered(p, 'b47')) bonus += 0.12;
      if (covered(p, 'b48')) bonus += 0.10;
      if (covered(p, 'b56')) bonus += 0.12;
      if (covered(p, 'b31')) bonus += 0.10;                       /* Запруда Бобра */
      if (inAura('b51', p.r, p.c)) bonus += 0.10;
      if (beasts.some(x => x.card.id === 'b50')) bonus += 0.10;   /* Прародитель: вся Чаща поля */
      if (id === 'b41') bonus += Math.min(0.36, 0.12 * beasts.filter(x => x.herb && x !== p && overlap(x, p)).length);
    }

    if (p.scav) {
      let sense = id === 'b16' ? 3 : 2, sm = 1;
      if ((B.pole[key] || 0) > 0) { sense += 1; sm *= R.POLE_SCAV; }
      if (inAura('b52', p.r, p.c)) { sense += 1; sm *= 1.25; }    /* Шёпот */
      if (id === 'b57') {
        bonus += Math.min(0.60, 0.15 * actsList.length);          /* Пожиратель: чует весь лес */
      } else {
        const n = actsList.filter(a => dist(a, p) <= sense).length;
        if (id === 'b20') bonus += Math.min(0.40, 0.08 * n);
        else bonus += Math.min(R.SCAV_CAP, R.SCAV_PCT * n * sm);
      }
      if (id === 'b19') bonus += Math.min(0.30, 0.05 * beasts.filter(x => x.scav && x !== p && overlap(x, p)).length); /* Гиена: компания */
    }

    /* хищники, питающиеся чужой охотой */
    if (id === 'b9') bonus += Math.min(2.0, 0.15 * actsList.filter(a => dist(a, p) <= 2).length);    /* Гидра */
    if (id === 'b11') bonus += Math.min(0.40, 0.10 * actsList.filter(a => a !== p && dist(a, p) <= 3).length); /* Вершина */
    if (id === 'b20') bonus += Math.min(0.24, 0.08 * preds.filter(x => x !== p && overlap(x, p)).length);     /* Оппортунист: союзники */

    if (inAura('b49', p.r, p.c) && bonus > 0) bonus *= 1.08;      /* Лунный свет */
    if (bonus < -0.5) bonus = -0.5;
    out.mults[key] = (out.mults[key] || 1) * m * (1 + bonus);
    if (bonus > 0 || actsList.some(a => a === p) || AURA_TOTEM[id] || id === 'b33' || id === 'b39' || id === 'b43' || id === 'b44' || id === 'b45') out.active[key] = 1;
  });

  out.acts = actsList.length;
  BEAST_GROUNDS = out;
  return out;
}

/* Счётчик охот для достижения «Великая Охота» (1 раз/с, транзиентно) */
function tickGroundsAccum(dt) {
  groundsAcc += dt;
  if (groundsAcc < 1) return;
  groundsAcc = 0;
  const acts = BEAST_GROUNDS ? (BEAST_GROUNDS.acts || 0) : 0;
  if (acts) stats.huntActs = (stats.huntActs || 0) + acts;
}

/* ================= ДЕМОНЫ: «ЖАР» (v1.19.0) =================
 В толпе (2+ демона рядом; Дьяволёнок и Ночной Шёпот — достаточно одного)
 демон копит угли: +1 каждые 8 секунд, каждый уголёк даёт +10% дохода.
 На 5 углях — ВЗРЫВ. Исход всегда один и тот же, без броска кубика:
  • ПЕПЕЛ — перегрев ×2 на 12 с и ЦЕПНОЙ ПОЖАР: поджигает соседей (+2 угля,
    в радиусе 2 — +1);
  • МРАК — закалка: +10% дохода НАВСЕГДА (до ×2.5); ПИР: чужой взрыв рядом
    даёт +10% на 12 с (до +50%);
  • ЛЕГИОН — перегрев ×2 на 12 с; в СТРОЮ (2+ легионера рядом) угли
    копятся на 25% быстрее.
 Венцы и поджигатели (Кузнецы) работают как раньше, но проще: они
 ускоряют угли, поджигают соседей или питаются чужими взрывами.
 Убраны: бросок кубика при взрыве, превращение карты в другого демона,
 «гасители» перегрева, дисциплина, тление, штрафы и законы реликвий. */
const DEMON_FEEDERS = { d2: 3, d5: 1, d13: 2, d23: 3, d33: 3, d35: 99 }; /* радиус, в котором взрыв другого демона их подкармливает */
let demonTickN = 0; /* счётчик тиков: поджог Цепного пожара не каскадирует в тот же тик */
function demonEmberTick() {
  let changed = false;
  demonTickN++;
  const doomHere = hasCard('d36'); /* Сумрак: Мраки копят угли ×1.2 */
  const B = INC_CTX.bld || { pit: {}, glacier: {} };
  /* СТРОЙ ЛЕГИОНА: свежий расчёт на каждый тик */
  const LEGF = buildLegionFormation();
  INC_CTX.legionForm = LEGF.map;
  INC_CTX.legionGroups = LEGF.groups;
  const FORM = LEGF.map;
  const isDemonCell = n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon' || card.isBuilding) continue; /* здания не раскаляются */
    if (it.cfTick === demonTickN) continue; /* поджог этого тика не каскадирует мгновенно */
    const crowd = getNeighbors8(r, c).filter(isDemonCell).length;
    const needCrowd = (card.id === 'd1' || card.id === 'd27') ? 1 : 2;
    if (crowd < needCrowd) continue;
    const key = r + ',' + c;
    const inForm = !!FORM[key];
    const inPit = (B.pit[key] || 0) > 0; /* Жертвенная Яма */
    const gain = inPit ? (B.pitChained ? 3 : 2) : 1;
    /* ускорители раскалки */
    const nb1 = getNeighbors(r, c), r2d = radius2(r, c);
    let accel = 1;
    if (nb1.some(n => n.item.cardId === 'd26')) accel *= 1.2;                          /* Подначка: сосед ×1.2 */
    if (card.subrace === 'legion' && nb1.some(n => n.item.cardId === 'd39')) accel *= 1.3; /* Устав: сосед-Легион ×1.3 */
    if (card.subrace === 'ash' && r2d.some(n => n.item.cardId === 'd22')) accel *= 1.3;     /* Горн: Пеплы рад.2 ×1.3 */
    if (r2d.some(n => n.item.cardId === 'd32')) accel *= 1.25;                          /* Кошмарный разгон */
    if (r2d.some(n => n.item.cardId === 'd14')) accel *= 1.2;                           /* Око Бури */
    if (doomHere && card.subrace === 'dark') accel *= 1.2;                              /* Сумрак */
    if (inForm && r2d.some(n => n.item.cardId === 'd44')) accel *= 1.2;                 /* Знамя */
    if (inForm) accel *= 1.25;                                                          /* Строй */
    if ((it.embers || 0) >= 3 && r2d.some(n => n.item.cardId === 'd17')) accel *= 1.2; /* Дым */
    it.emberAcc = (it.emberAcc || 0) + gain * accel;
    const whole = Math.floor(it.emberAcc);
    if (whole > 0) { it.emberAcc -= whole; it.embers = Math.min(5, (it.embers || 0) + whole); }
    fxAtCell(r, c, ['#ff9030', '#ffd34d'], 4); changed = true;
    if ((it.embers || 0) < 5) continue;

    /* ВЗРЫВ — исход определяет подраса */
    it.embers = 0;
    it.lastBoom = gameTime;
    stats.demonBooms = (stats.demonBooms || 0) + 1;
    if (card.subrace === 'dark') {
      it.mutBuff = Math.min(2.5, (it.mutBuff || 1) * 1.10);
      fxAtCell(r, c, ['#c030c0', '#ff8030', '#fff'], 16, 'big');
      fxFloatFromCell(r, c, 'ЗАКАЛКА ×' + it.mutBuff.toFixed(2), '#d080ff');
      toast('🔥 ' + card.name + ' закалился: ×' + it.mutBuff.toFixed(2) + ' навсегда', 'demon', 25);
    } else {
      it.boomUntil = gameTime + 12;
      it.boomMult = r2d.some(n => n.item.cardId === 'd32') ? 2.5 : 2; /* под Кошмаром ×2.5 */
      fxAtCell(r, c, ['#ff4010', '#ffb060', '#fff'], 22, 'big');
      fxFloatFromCell(r, c, 'ПЕРЕГРЕВ ×' + it.boomMult, '#ff5030');
      toast('🔥 ' + card.name + ' перегрелся: ×' + it.boomMult + ' на 12 секунд!', 'demon', 25);
    }
    /* после взрыва: Престол держит 2 угля, Феникс встаёт с 3 */
    if (card.id === 'd24') it.embers = 2;
    if (card.id === 'd25') it.embers = 3;
    /* ЦЕПНОЙ ПОЖАР (Пепел): соседи +2, остальные в радиусе 2 — +1; поджог — не взрыв */
    if (card.subrace === 'ash') {
      const rad1 = {};
      let ignited = 0;
      nb1.forEach(n => {
        if (!isDemonCell(n)) return;
        n.item.embers = Math.min(5, (n.item.embers || 0) + 2);
        n.item.cfTick = demonTickN;
        rad1[n.r + ',' + n.c] = 1;
        fxAtCell(n.r, n.c, ['#ff8030', '#ffd34d'], 8);
        ignited++;
      });
      r2d.forEach(n => {
        if (rad1[n.r + ',' + n.c] || !isDemonCell(n)) return;
        n.item.embers = Math.min(5, (n.item.embers || 0) + 1);
        n.item.cfTick = demonTickN;
        fxAtCell(n.r, n.c, ['#ff8030', '#ffd34d'], 5);
        ignited++;
      });
      if (ignited) {
        stats.chainfire = (stats.chainfire || 0) + ignited; /* ачивка «Вечный пожар» */
        toast('🔥 Цепной пожар: ' + card.name + ' поджёг ' + ignited + ' сосед' + (ignited === 1 ? 'а' : 'ей'), 'chainfire', 30);
      }
    }
    /* ПИР (Мрак): чужой взрыв в радиусе 2 — +10% на 12 с (до +50%) */
    let feasted = 0;
    r2d.forEach(n => {
      const q = CARDS[n.item.cardId];
      if (q.faction !== 'demon' || q.isBuilding || q.subrace !== 'dark') return;
      if ((n.item.feastUntil || 0) < gameTime) n.item.feastBuff = 1;
      n.item.feastBuff = Math.min(1.5, (n.item.feastBuff || 1) + 0.10);
      n.item.feastUntil = gameTime + 12;
      fxAtCell(n.r, n.c, ['#9040c0', '#ff8030'], 6);
      feasted++;
    });
    if (feasted) {
      stats.feasts = (stats.feasts || 0) + feasted; /* ачивка «Дегустатор хаоса» */
      toast('🍖 Пир: ' + feasted + (feasted === 1 ? ' мрак кормится' : ' мраков кормятся') + ' взрывом ' + card.name, 'feast', 30);
    }
    /* ПИТАЮЩИЕСЯ ВЗРЫВАМИ: +10% на 20 с за каждый чужой взрыв в их радиусе (до +50%) */
    for (let rr2 = 0; rr2 < GRID_SIZE; rr2++) for (let cc2 = 0; cc2 < GRID_SIZE; cc2++) {
      const fIt = grid[rr2][cc2]; if (!fIt || (rr2 === r && cc2 === c)) continue;
      const fr = DEMON_FEEDERS[fIt.cardId]; if (!fr) continue;
      if (Math.max(Math.abs(rr2 - r), Math.abs(cc2 - c)) > fr) continue;
      if ((fIt.feedUntil || 0) < gameTime) fIt.feedStacks = 0;
      fIt.feedStacks = Math.min(5, (fIt.feedStacks || 0) + 1);
      fIt.feedUntil = gameTime + 20;
      fxAtCell(rr2, cc2, ['#c060ff', '#ffd34d'], 5);
    }
    /* Липкая Тень (d29): чужой взрыв в радиусе 1 — +1 уголёк */
    nb1.forEach(n => {
      if (n.item.cardId === 'd29') { n.item.embers = Math.min(5, (n.item.embers || 0) + 1); fxAtCell(n.r, n.c, ['#ff8030', '#ffd34d'], 5); }
    });
  }
  /* renderCollection здесь не нужен: превращений больше нет */
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}
