'use strict';
/*
ЛОГИКА: ФРАКЦИОННЫЕ МЕХАНИКИ (logic/faction_mechanics.js)
Тиковые события, зависящие от фракции:
- Нежить: цепи/армия (economy.js) + «Медленный рост» Зомби (u1)
- Культисты : РИТУАЛЬНАЯ ЭКОНОМИКА — участники в цепи от
Алтаря заряжают шкалу (шкала НЕ тает), на 100% ритуал платит Тёмную энергию;
роли: скорость (⚡) и усиление выплаты (💰); формации ускоряют
- Звери : тик 2.5с, укус 20%, драки хищников, здания
- Демоны: УГЛИ — толпа → взрыв; здания Яма/Ледник
- ЗДАНИЯ: призыв Кладбища/Врат, ЖАТВА Горы костей (tickBuildings)
 ============================================================*/

let beastTimer = 0, demonTimer = 0, balrTimer = 0;
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
  } else if (mech === 'cycle') {
    beastTimer += dt;
    if (beastTimer >= 2.5) { beastTimer = 0; beastCycleTick(); } /* тик 2.5с — лес живёт быстро */
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
    tickCultistRework(dt); /* v1.10.0: теофании, мутации, кровопускание Оракула */
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
const RITUAL_AMPS = { c5: 0.2, c8: 0.3, c9: 0.45, c13: 0.25, c10: 0.6, c11: 0.45, c43: 0.35, c44: 0.3 };
const RITUAL_CELL_SPEED = {
  c0: 0.25, c1: 0.25, c2: 0.30, c3: 0.25, c6: 0.27, c7: 0.33, c12: 0.25,
  /* v1.10.0: новые Певчие Хора и Ложи */
  c14: 0.25, c15: 0.26, c16: 0.27, c17: 0.25, c18: 0.28, c19: 0.25,
  c20: 0.25, c21: 0.25, c22: 0, c23: 0,                       /* Сущности Хора сами не заряжают */
  c24: 0.26, c25: 0.25, c26: 0.25, c27: 0.25, c28: 0.25, c29: 0.25, c30: 0.25, c31: 0.25,
  c32: 0, c33: 0,                                              /* Сущности Ложи сами не заряжают */
  /* Одержимые */
  c40: 0.45, c41: 0.40, c42: 0.40, c45: 0.50
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

/* ======== v1.10.0 РЕВОРК КУЛЬТИСТОВ: ЛОЖА / СОМНЕНИЕ / ТЕОФАНИИ ========
ХОР — масса участников (заряд/выплата/жар). ЛОЖА — геометрия: оси,
зеркальные пары, углы — но без медиумов Ложа разваливается (СОМНЕНИЕ).
ВНЕШНИЕ не ставятся: нисходят теофанией вместо алтаря и мутируют
участников в Одержимых. Медиумы — стабилизаторы всего этого. */
let RITUAL_DOUBT = 0;                       /* 0..5 — без медиумов растёт */
let THEO = { id: null, until: 0, cell: null, heat: 0 };  /* активная теофания */
let THEO_DOUBT_FREEZE = 0;                  /* «Шёпот За Стеной» (c39) */
let cultReworkTimer = 0;                    /* накопитель тика Одержимых */

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
function mediumsOnBoard() { return cultistCardsOf(cd => cd.cat === 'medium').length; }
function chthonsOnBoard() { return cultistCardsOf(cd => !!RITUAL_SOURCES[cd.id]).length; }
function hasBoard(id) { return cultistCardsOf(cd => cd.id === id).length > 0; }
function anyFlawed(id) { return cultistCardsOf(cd => cd.id === id).some(h => possessedFlawActive(h.r, h.c)); }
/* ИЗЪЯН Одержимого: выключен медиумом в радиусе 2 или благословением мутации */
function possessedFlawActive(r, c) {
  const it = grid[r] && grid[r][c];
  if (!it || it.blessed) return false;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    const n = grid[r + dr] && grid[r + dr][c + dc];
    if (n && CARDS[n.cardId].faction === 'cultist' && CARDS[n.cardId].cat === 'medium') return false;
  }
  return true;
}

/* Геометрия Ложи: оси (колонка источника; Знаменосец переносит; Тень
Основателя добавляет вторую), зеркальные пары (одна строка, поровну
от оси по разные стороны), углы (диагональ от источника). */
function lodgeGeometry() {
  const G = { axes: [], axisSet: {}, blocked: {}, pairCells: {},
    axisCount: 0, axisPay: 0, pairCount: 0, pairPay: 0, pairRaw: 0, cornerCount: 0, cornerPay: 0 };
  if (FACTION_INFO[faction].mechanic !== 'formation') return G;
  const lodge = cultistCardsOf(cd => cd.subrace === 'lodge');
  /* Слепой Пророк (c44, изъян): соседи теряют оси/пары/углы */
  cultistCardsOf(cd => cd.id === 'c44').forEach(h => {
    if (!possessedFlawActive(h.r, h.c)) return;
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++)
      G.blocked[(h.r + dr) + ',' + (h.c + dc)] = 1;
  });
  if (!lodge.length) return G;
  const axes = [];
  cultistCardsOf(cd => cd.id === 'c3').forEach(b => axes.push(b.c));
  if (INC_CTX.ritualSrc) axes.push(+INC_CTX.ritualSrc.split(',')[1]);
  cultistCardsOf(cd => cd.id === 'c32').forEach(t => axes.push(t.c));
  if (!axes.length) return G;
  G.axes = [...new Set(axes)];
  G.axes.forEach(a => { G.axisSet[a] = 1; });
  const axisRate = (hasBoard('c28') || hasBoard('c33')) ? 0.12 : 0.08;
  const free = L => !G.blocked[L.r + ',' + L.c];
  /* ОСЕВЫЕ: карта Ложи в колонке оси */
  lodge.forEach(L => { if (G.axisSet[L.c] && free(L)) { G.axisCount++; G.axisPay += axisRate; } });
  /* ЗЕРКАЛЬНЫЕ ПАРЫ: одна строка, поровну от оси, по разные стороны (до 3 пар) */
  const pairMult = hasBoard('c27') ? 2 : 1, pairExtra = hasBoard('c31') ? 0.10 : 0;
  const byRow = {};
  lodge.forEach(L => { if (free(L)) (byRow[L.r] = byRow[L.r] || []).push(L); });
  Object.keys(byRow).forEach(r => {
    const list = byRow[r];
    for (let i = 0; i < list.length && G.pairCount < 3; i++) for (let j = i + 1; j < list.length && G.pairCount < 3; j++) {
      const A = list[i], B = list[j];
      if (A.c === B.c) continue;
      const axis = G.axes.find(a => (A.c - a) * (B.c - a) < 0 && Math.abs(A.c - a) === Math.abs(B.c - a));
      if (axis === undefined) continue;
      G.pairCount++; G.pairPay += 0.08 * pairMult + pairExtra; G.pairRaw += 0.05 * pairMult;
      G.pairCells[A.r + ',' + A.c] = 1; G.pairCells[B.r + ',' + B.c] = 1;
    }
  });
  /* УГЛЫ: диагональ от источника (Наугольник чует дальше и платит больше) */
  if (INC_CTX.ritualSrc) {
    const [sr, sc] = INC_CTX.ritualSrc.split(',').map(Number);
    const cornerR = hasBoard('c29') ? 3 : 2, cornerRate = hasBoard('c29') ? 0.12 : 0.06;
    lodge.forEach(L => {
      const dr = Math.abs(L.r - sr), dc = Math.abs(L.c - sc);
      if (dr === dc && dr >= 1 && dr <= cornerR && free(L)) { G.cornerCount++; G.cornerPay += cornerRate; }
    });
  }
  return G;
}

/* ТЕОФАНИЯ: шанс при завершении ритуала — нисходит OWNED внешний
на клетку источника на 18с; протокол считается в движке; по истечении
— мутация участника (ritualMutation). */
function maybeTheophany(meds) {
  if (THEO.id || !INC_CTX.ritualSrc) return;
  const externals = ['c10', 'c11', 'c34', 'c35', 'c36', 'c37', 'c38', 'c39'].filter(id => (collection[id] || 0) > 0);
  if (!externals.length) return;
  let chance = 0.08 + 0.05 * Math.min(4, meds || 0) + 0.03 * chthonsOnBoard();
  chance = Math.min(0.30, chance);
  if (Math.random() >= chance) return;
  const id = externals[Math.floor(Math.random() * externals.length)];
  THEO = { id, until: gameTime + 18, cell: INC_CTX.ritualSrc, heat: id === 'c38' ? 2 : 0 };
  stats.theos = (stats.theos || 0) + 1; /* для ачивки «Гость из-за Стены» */
  if (id === 'c39') THEO_DOUBT_FREEZE = gameTime + 78;
  const [ar, ac] = INC_CTX.ritualSrc.split(',').map(Number);
  fxAtCell(ar, ac, ['#7030a0', '#c030c0', '#fff0ff'], 10, 'wave');
  fxFloatFromCell(ar, ac, '🌑 ' + CARDS[id].name.toUpperCase(), '#d0a0ff', 22);
  toast('🌑 <b>ТЕОФАНИЯ:</b> ' + CARDS[id].name + ' нисходит на алтарь!', 'theo', 30);
  sfx('relic');
}

/* МУТАЦИЯ: участник в радиусе 2 от источника становится Одержимым.
С медиумом — лучший участник и без изъяна (blessed); без — случайный с изъяном. */
function ritualMutation(srcKey, theoId) {
  if (!srcKey) return;
  const [sr, sc] = srcKey.split(',').map(Number);
  const cands = [];
  INC_CTX.ritual.forEach(k => {
    const [r, c] = k.split(',').map(Number);
    const it = grid[r][c]; if (!it) return;
    const card = CARDS[it.cardId];
    if (card.isBuilding || RITUAL_SOURCES[it.cardId] || card.cat === 'medium') return;
    if (Math.max(Math.abs(r - sr), Math.abs(c - sc)) > 2) return;
    cands.push({ r, c, it, card });
  });
  if (!cands.length) { toast('Нисшедший уходит, не коснувшись никого…', 'theo', 12); return; }
  const med = mediumsOnBoard() > 0;
  let chance = 0.25 + (med ? 0.15 : 0);
  if (theoId === 'c37') chance = Math.min(1, chance * 2);
  if (Math.random() >= chance) { toast('Нисшедший растворяется — все целы.', 'theo', 12); return; }
  const victim = med ? cands.slice().sort((a, b) => (b.it.stacks || 1) - (a.it.stacks || 1))[0]
                     : cands[Math.floor(Math.random() * cands.length)];
  const MUTANTS = ['c40', 'c41', 'c42', 'c43', 'c44', 'c45'];
  const nid = MUTANTS[Math.floor(Math.random() * MUTANTS.length)];
  const oldName = CARDS[victim.it.cardId].name;
  victim.it.cardId = nid;
  if (med || theoId === 'c37') victim.it.blessed = 1;
  const hp = cardHp(CARDS[nid].rarity) * (victim.it.stacks || 1);
  victim.it.hp = hp; victim.it.maxHp = hp;
  collectionAdd(nid, 1);
  fxAtCell(victim.r, victim.c, ['#c030c0', '#700070', '#fff'], 8, 'wave');
  fxFloatFromCell(victim.r, victim.c, '🩸 МУТАЦИЯ', '#e070e0', 20);
  toast('🩸 <b>МУТАЦИЯ:</b> ' + oldName + ' → <b>' + CARDS[nid].name + '</b>' +
    (victim.it.blessed ? ' <small>(медиум направил мутацию — без изъяна)</small>' : ' <small>(без медиума — изъян пробудился)</small>'), 'theo', 30);
  sfx('relic');
  computeIncome(); renderGrid(); saveRun();
}

/* Тик культистов: истечение теофании + кровопускание Оракула (c43) */
function tickCultistRework(dt) {
  if (THEO.id && gameTime >= THEO.until) {
    const id = THEO.id, cell = THEO.cell;
    THEO.id = null; THEO.cell = null;
    ritualMutation(cell, id);
  }
  cultReworkTimer += dt;
  if (cultReworkTimer >= 30) {
    cultReworkTimer = 0;
    cultistCardsOf(cd => cd.id === 'c43').forEach(h => {
      if (possessedFlawActive(h.r, h.c) && h.item.maxHp) {
        h.item.hp = Math.max(h.item.maxHp * 0.25, h.item.hp - h.item.maxHp * 0.05);
        fxAtCell(h.r, h.c, ['#c03030', '#700000'], 3, 'wave');
      }
    });
  }
}

function computeRitualEngine() {
  const E = { speed: 0, pay: 1, payout: 0, participants: 0, outer: 0, outerPay: 0, retain: 0, cellSpeed: {}, banner: '', ready: false, capped: false };
  if (FACTION_INFO[faction].mechanic !== 'formation') return E;
  const B = INC_CTX.bld || { obelisk: {}, wells: 0 };
  /* ЗАКОНЫ реликвий — потолки/насыщение/жар (ни одного множителя) */
  const rel = ritualRuleMods();
  /* v1.10.0: геометрия Ложи + аура Духа Хора + присутствие внешних */
  const G = lodgeGeometry();
  const theoOn = !!THEO.id, extOn = theoOn || chthonsOnBoard() > 0;
  const aura22 = new Set();
  cultistCardsOf(cd => cd.id === 'c22').forEach(h => {
    for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) aura22.add((h.r + dr) + ',' + (h.c + dc));
  });
  let payBonus = 0, bannerParts = [];
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
    if (card.id === 'c17' && INC_CTX.ritualSrc) {
      const sr17 = +INC_CTX.ritualSrc.split(',')[0], sc17 = +INC_CTX.ritualSrc.split(',')[1];
      if (Math.max(Math.abs(r - sr17), Math.abs(c - sc17)) <= 3) raw *= 1.08;
    }
    if (card.id === 'c19') raw *= 1 + 0.06 * radius2(r, c).filter(n => n.item && CARDS[n.item.cardId].isBuilding).length;
    if (card.id === 'c24' && G.axisSet[c] && !G.blocked[r + ',' + c]) raw *= 1.10;
    if (card.id === 'c25' && G.pairCells[r + ',' + c] && !G.blocked[r + ',' + c]) raw *= 1.12;
    if (card.id === 'c42' && extOn) raw *= 1.10;
    if (card.id === 'c40' && possessedFlawActive(r, c)) payBonus -= 0.10; /* Пустотелый: соседям хуже */
    if (card.id === 'c45' && runRituals % 4 === 0) raw = 0; /* Дитя Бездны: каждый 4-й ритуал спит */
    if (card.cat === 'chanter' && aura22.has(r + ',' + c)) raw *= 1.3; /* Дух Хора (c22): аура скорости */
    /* ХРАНИТЕЛИ ЖАРА: участник сохранит часть заряда после выплаты.
 КАРА «Многоликой Маски» (rcNoRetain): хранители не хранят ничего.
 v1.10.0: Шепчущая Плоть (c41, изъян) — соседи-Хор не хранят жар.*/
    const silenced41 = card.subrace === 'choir' && getNeighbors8(r, c).some(n => n.item.cardId === 'c41' && possessedFlawActive(n.r, n.c));
    if (RITUAL_RETAIN[card.id] && !rel.rcNoRetain && !silenced41) E.retain += RITUAL_RETAIN[card.id] * (1 + 0.5 * (st - 1));
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
  /* ===== v1.10.0 ЛОЖА: оси / зеркальные пары / углы; Сомнение гасит геометрию ===== */
  const lm = Math.max(0.25, 1 - 0.15 * RITUAL_DOUBT);
  const axisImmune = hasBoard('c28') || hasBoard('c33');
  const lodgeBits = [];
  if (G.axisCount) {
    let ap = Math.min(0.40, G.axisPay);
    if (!axisImmune) ap *= lm;
    payBonus += ap +
      (hasBoard('c26') ? Math.min(0.30, 0.06 * G.axisCount) * lm : 0) +
      (hasBoard('c33') ? 0.10 * Math.min(5, G.axisCount) : 0);
    lodgeBits.push('осевые +' + Math.round(ap * 100) + '%');
  }
  if (G.pairCount) {
    payBonus += G.pairPay * lm;
    rawSum += G.pairRaw * lm;
    lodgeBits.push('пары +' + Math.round(G.pairPay * lm * 100) + '%');
  }
  if (G.cornerCount) {
    payBonus += G.cornerPay * lm;
    lodgeBits.push('углы +' + Math.round(G.cornerPay * lm * 100) + '%');
  }
  if (lodgeBits.length) bannerParts.push('Ложа: ' + lodgeBits.join(' · ') + (RITUAL_DOUBT > 0 ? ' · сомнение ×' + lm.toFixed(2) : ''));
  /* ИТОГОВАЯ СКОРОСТЬ: корень из суммы вкладов — мягкое насыщение
(каждый новый участник даёт меньше прежнего), потолок 15%/с.
ЗАКОНЫ: «Вериги Пустоты» снимают насыщение (вклад линейный),
 «Око Ритуала» отодвигает потолок.*/
  const heat = rel.noSatur ? (rawSum + outerRaw) : Math.sqrt(rawSum + outerRaw);
  /* КАРА «Свечи Мученика» (rcSlow): ритуал заряжается на 20% медленнее */
  E.speed = Math.min(rel.capSpeed, 1.2 * heat * formMult * bannerMult * (rel.rcSlow ? 0.8 : 1));
  if (theoOn && THEO.id === 'c34') E.speed *= 1.6; /* протокол «Спящего между Мирами» */
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
  E.pay = Math.min(rel.capPay, Math.max(0.5, 1 + Math.min(2.5, payBonus)));
  /* Выплата: привязана к порогу Эпохи — растёт вместе с игрой.
коэффициент 0.80% — инкам ритуалов чуть приподнят.*/
  E.payout = Math.round(epochThreshold(epoch) * 0.0080 * (0.7 + 0.03 * Math.min(24, E.participants)) * E.pay);
  /* ЖАР: сохраняемый заряд = хранители + закон «Свечи Мученика»;
 v1.10.0: Пустотный Серафим (c23) поднимает кап до 50% */
  const heatCap = hasBoard('c23') ? 50 : RITUAL_RETAIN_CAP;
  E.retain = Math.min(heatCap, Math.round(E.retain) + (rel.keep || 0));
  if (E.retain < 0) E.retain = 0;
  if (E.retain > 0) bannerParts.push('жар: +' + E.retain + '% к следующему');
  /* v1.10.0: протоколы теофании — Пожиратель Формул и Тот, Кто Считает */
  if (theoOn && (THEO.id === 'c35' || THEO.id === 'c36')) {
    E.pay = Math.min(rel.capPay * 2, E.pay * (THEO.id === 'c35' ? 2 : 1.6));
    E.payout = Math.round(epochThreshold(epoch) * 0.0080 * (0.7 + 0.03 * Math.min(24, E.participants)) * E.pay);
    if (THEO.id === 'c35') E.retain = 0; /* жар съеден */
  }
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
  /* v1.10.0: СОМНЕНИЕ — ритуал без медиумов расшатывает Ложу;
 Хранительница Очага (c31) блокирует рост, Многоглазый (c42) ускоряет */
  const meds = mediumsOnBoard();
  if (meds > 0) RITUAL_DOUBT = Math.max(0, RITUAL_DOUBT - 1);
  else if (gameTime >= THEO_DOUBT_FREEZE && !hasBoard('c31')) {
    RITUAL_DOUBT = Math.min(5, RITUAL_DOUBT + (anyFlawed('c42') ? 1.5 : 1));
  }
  let keep = Math.round(E.retain || 0);
  if (THEO.id === 'c38' && THEO.heat > 0) { keep = Math.min((hasBoard('c23') ? 50 : RITUAL_RETAIN_CAP) + 15, keep + 15); THEO.heat--; } /* «Хор Угасших Звёзд»: жар сверх капа */
  else keep = Math.min(hasBoard('c23') ? 50 : RITUAL_RETAIN_CAP, keep);
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
  maybeTheophany(meds); /* v1.10.0: шанс нисхождения Внешнего */
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
    t.item.zavFedUntil = gameTime + 15; /* взорвётся за 15с → Заводила +20% */
    fxAtCell(t.r, t.c, ['#c060ff', '#ff8030'], 8);
    toast('🎭 Заводила подкинул ' + CARDS[t.item.cardId].name + ' 2 угля — взорвись, не стесняйся', 'zavod', 30);
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

/* ================= ЗВЕРИ: ПИЩЕВАЯ ЦЕПЬ =================
Тик 2.5с. Укус 20% maxHp добычи (стая ×1.5). Убийство: +120%
хищнику навсегда (Хищник ★5 +160%, Буйвол ×1.5 добыча).
ГОЛОД: без добычи хищник слабеет −5%/тик — и ДЕРЁТСЯ с соседями-
хищниками за территорию (−6% HP), поэтому ЛЕЧЕНИЕ флорой ценно.
 Кабан жиреет от укусов (Щетина), Мантикора травит Ядом.*/
function isPredator(card) { return card.diet === 'pred'; }
function isPrey(card) { return card.diet === 'herb' || card.diet === 'scav'; }
/* Радиус охоты карты: Лютоволк (b4) — 3, остальные 2 */
function huntRadius(card) { return card.id === 'b4' ? 3 : 2; }

function beastCycleTick() {
  let changed = false;
  const deaths = [];  // клетки погибших — для падальщиков
  /* ЗАКОНЫ звериных реликвий (только правила, без множителей):
fang — добыча кормит всю стаю; range — выпас через клетку;
bough — флора усмиряет голод; apex — не голодают;
kcap — трофеи без предела; hungerFlip — голодный кусает больнее;
 savage — укусы больнее*/
  const fangCols = {}, rangeCols = {}, boughCols = {}, kcapCols = {}, hungerFlipCols = {}, apexCols = {}, savageCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r || r.faction !== 'beast') continue;
    const eng = RELIC_KIND_ENGINE[r.kind]; if (!eng) continue;
    if (eng.fang) fangCols[+k] = 1;
    if (eng.range) rangeCols[+k] = 1;
    if (eng.bough) boughCols[+k] = 1;
    if (eng.kcap) kcapCols[+k] = 1;
    if (eng.hungerFlip) hungerFlipCols[+k] = 1;
    if (eng.apex) apexCols[+k] = 1;
    if (eng.savage) savageCols[+k] = 1;
  }
  const B = INC_CTX.bld || { pen: {}, pole: {}, spring: {} };

  /* 1. ФЛОРА: лечит хищников (+5% HP/тик), кормится их лечением.
Кровавая Лоза (b14) наоборот жжёт хищников (−3%) и лечит травоядных.
СОЛОНЧИК (bl_spring): флора в его зоне лечит/кормит ×2 и действует
 на радиус +1 (через клетку).*/
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const fc = CARDS[it.cardId];
    if (fc.diet !== 'flora') continue;
    const boosted = (B.spring[r + ',' + c] || 0) > 0; /* Солончик усиливает флору */
    const heal = boosted ? (B.springChained ? 0.125 : 0.10) : 0.05; /* ⛓ прикованный Солончик */
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
      it.floraBuff = Math.min(1.5, (it.floraBuff || 0) + 0.03 * served * (boosted ? (B.springChained ? 2.5 : 2) : 1));
      it.lastFed = gameTime;
    }
  }

  /* 2. ВЫПАС: травоядные едят соседнюю флору (+5%/тик, Гриб-Фонарь +7.5%,
 Колосс подкармливает стадо). ВОЛЬЕР: выпас ×1.5.*/
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    if (CARDS[it.cardId].diet !== 'herb') continue;
    /* КАРА «Короны Зверя» (kcapFamine): травоядные столба НЕ ПАСУТСЯ вовсе */
    if (kcapCols[c]) continue;
    let floraN = getNeighbors(r, c).filter(n => CARDS[n.item.cardId].diet === 'flora');
    /* Солончик: флора кормит через клетку дальше */
    if (!floraN.length && INC_CTX.bld) {
      for (const n of radius2(r, c)) {
        if (CARDS[n.item.cardId].diet === 'flora' && (INC_CTX.bld.spring[n.r + ',' + n.c] || 0) > 0) { floraN.push(n); break; }
      }
    }
    /* (range): травоядные столба находят флору через клетку */
    if (!floraN.length && rangeCols[c]) {
      for (const n of radius2(r, c)) {
        if (CARDS[n.item.cardId].diet === 'flora') { floraN.push(n); break; }
      }
    }
    if (!floraN.length) continue;
    const hasLantern = floraN.some(n => n.item.cardId === 'b15');
    const colossusNear = getNeighbors(r, c).some(n => n.item.cardId === 'b17');
    const inPen = (B.pen[r + ',' + c] || 0) > 0;
    let gain = (hasLantern ? 0.075 : 0.05) + (colossusNear ? 0.05 : 0);
    /* (rangeFat): травоядные столба пасутся ВДВОЕ СЫТЕЕ */
    if (rangeCols[c]) gain *= 2;
    if (inPen) gain *= (B.penChained ? 1.75 : 1.5); /* ⛓ прикованный Вольер */
    it.graze = Math.min(1.5, (it.graze || 0) + gain);
    it.lastFed = gameTime;
    floraN[0].item.floraBuff = Math.min(1.5, (floraN[0].item.floraBuff || 0) + 0.025);
    fxAtCell(r, c, ['#8fc87f', '#c0e0a0'], 5);
    changed = true;
  }

  /* 3. ОХОТА: хищник кусает добычу рядом или через клетку (радиус 2,
Лютоволк — 3). ВОЛЬЕР защищает травоядных. ТРОФЕЙНЫЙ СТОЛБ
 умножает баффы охоты ×1.5.*/
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
        if ((B.pen[nk] || 0) > 0) continue; /* Вольер защищает */
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
    /* (hungerFlip): голодный хищник столба КУСАЕТ БОЛЬНЕЕ */
    const hungryFang = hungerFlipCols[b.predator.c] && b.predator.it.hunger !== undefined && b.predator.it.hunger < 1;
    /* КАРА «Клыка Альфы» (fangTax): альфа кусает вполсилы */
    const biteDmg = 0.20 * (thickHide ? 0.5 : 1) * (savageCols[b.predator.c] ? 1.5 : 1) * (hungryFang ? 1.5 : 1) * (fangCols[b.predator.c] ? 0.5 : 1);
    /* Стая: Волк и Лютоволк бьют ×1.5, если рядом другой волк */
    const pack = (b.predator.card.id === 'b1' || b.predator.card.id === 'b4') &&
      getNeighbors(b.predator.r, b.predator.c).some(n => n.item.cardId === 'b1' || n.item.cardId === 'b4');
    b.prey.item.hp -= b.prey.item.maxHp * biteDmg * (pack ? 1.5 : 1);
    /* КАРА «Рога Бешенства» (savagePain): каждый укус РАНИТ самого хищника */
    if (savageCols[b.predator.c]) {
      b.predator.it.hp = Math.max(1, b.predator.it.hp - b.predator.it.maxHp * 0.05);
      fxAtCell(b.predator.r, b.predator.c, ['#ff5030', '#ffd34d'], 5);
    }
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
      /* (kcap): трофеи столба кормят БЕЗ ПРЕДЕЛА */
      const pole = (INC_CTX.bld && (INC_CTX.bld.pole[b.predator.r + ',' + b.predator.c] || 0) > 0) ? (INC_CTX.bld.poleChained ? 1.75 : 1.5) : 1; /* Столб (⛓ прикованный ×1.75) */
      const base = b.predator.card.id === 'b11' ? 1.6 : 1.2; /* +120% / Хищник +160% */
      const cap = kcapCols[b.predator.c] ? 99 : (b.predator.card.id === 'b11' ? 4 : 3);
      /* КАРА «Ветви Древеня» (boughLazy): сытые ветвью ленятся — баффы убийств вдвое меньше */
      const gain = base * (preyCard.id === 'b13' ? 1.5 : 1) * pole * (boughCols[b.predator.c] ? 0.5 : 1);
      b.predator.it.predBuff = Math.min(cap, (b.predator.it.predBuff || 0) + gain);
      b.predator.it.hunger = 1;
      fxFloatFromCell(b.predator.r, b.predator.c, '+' + Math.round(gain * 100) + '% СЫТ', '#ffd34d');
      toast(b.predator.card.name + ' сожрал ' + eaten + ': +' + Math.round(gain * 100) + '% дохода хищнику', 'pred', 20);
      /* (fang): сожранное в столбе кормит ВСЮ СТАЮ поля */
      if (fangCols[b.predator.c]) {
        for (let fr = 0; fr < GRID_SIZE; fr++) for (let fc = 0; fc < GRID_SIZE; fc++) {
          const fIt = grid[fr][fc];
          if (!fIt || (fr === b.predator.r && fc === b.predator.c)) continue;
          const fCard = CARDS[fIt.cardId];
          if (!isPredator(fCard) || fCard.id === 'b9') continue; /* Гидра растёт сама */
          const fCap = kcapCols[fc] ? 99 : (fCard.id === 'b11' ? 4 : 3);
          fIt.predBuff = Math.min(fCap, (fIt.predBuff || 0) + gain);
          fxFloatFromCell(fr, fc, '+' + Math.round(gain * 100) + '% СТАЯ', '#ffd34d');
        }
        toast('🦷 Альфа делится трапезой — вся стая поля жиреет', 'pred', 20);
      }
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
 кусает СОСЕДА-ХИЩНИКА (−6% HP). Теперь лечение флорой решает.*/
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
    it.predBuff = Math.min(3, (it.predBuff || 0) + 0.10 * (kcapCols[c] ? 2 : 1));
    it.hunger = 1;
    changed = true;
  }

  /* 5. ГОЛОД: хищник без добычи слабеет −5%/тик (пол ×0.5).
Теневой Кот (b6) не голодает никогда.
(bough): флора столба с законом усмиряет голод
соседних хищников. «Кость Голода» (hungerFlip) голод НЕ снимает
 но голодный хищник кусает больнее (см. блок укусов), а не слабеет.*/
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (!isPredator(card) || card.id === 'b9' || card.id === 'b6') continue;
    if (apexCols[c]) { it.hunger = 1; continue; } /* Ошейник: сыт всегда */
    /* «Ветвь Древеня»: рядом стоит флора, у которой есть этот закон */
    if (getNeighbors(r, c).some(n => CARDS[n.item.cardId].diet === 'flora' && boughCols[n.c])) { it.hunger = 1; continue; }
    const R = huntRadius(card);
    const hasPrey = (R >= 3 ? radius2(r, c).concat(getNeighbors(r, c)) : getNeighbors(r, c))
      .some(n => isPrey(CARDS[n.item.cardId]));
    if (hasPrey) { it.hunger = 1; continue; }
    it.hunger = Math.max(0.5, (it.hunger === undefined ? 1 : it.hunger) - 0.05);
    changed = true;
  }

  /* 6. ПАДАЛЬЩИКИ: +25% за смерть в радиусе 2 (Стервятник — 3).
 ТРОФЕЙНЫЙ СТОЛБ: падальщики чуют дальше (+1) и жиреют ×1.5.*/
  deaths.forEach(([dr, dc]) => {
    for (let r = dr - 4; r <= dr + 4; r++) for (let c = dc - 4; c <= dc + 4; c++) {
      if (r < 0 || r >= GRID_SIZE || c < 0 || c >= GRID_SIZE) continue;
      const it = grid[r] && grid[r][c];
      if (!it || CARDS[it.cardId].diet !== 'scav') continue;
      const dist = Math.max(Math.abs(r - dr), Math.abs(c - dc));
      const poleHere = (INC_CTX.bld && (INC_CTX.bld.pole[r + ',' + c] || 0) > 0) ? (INC_CTX.bld.poleChained ? 1.75 : 1.5) : 1;
      const range = (it.cardId === 'b16' ? 3 : 2) + (poleHere > 1 ? 1 : 0);
      if (dist <= range) {
        it.scavBuff = Math.min(1.0, (it.scavBuff || 0) + 0.25 * poleHere);
        fxAtCell(r, c, ['#b0a060', '#e0d0a0'], 6);
      }
    }
  });

  /* renderCollection не нужен — тик зверей меняет поле,
 но не инвентарь (укусы/смерти не трогают коллекцию)*/
  if (changed) { computeIncome(); renderGrid(); updateHUD(); }
}

/* ================= ДЕМОНЫ: УГЛИ (v1.11.0) =================
В толпе (2+ демона рядом; Дьяволёнок и Ночной Шёпот — хватает одного)
демон копит угли (макс 5, +10% дохода за уголёк; Сажевик — +12%).
ЯМА удваивает накопление и делает взрывы баффами.
ТРИ ВЕТКИ ПОДРАС (Т.4 дизайн-дока):
• ПЕПЕЛ «Цепной пожар»: взрыв пепельника ЛЮБОГО исхода поджигает
  соседей (+2 угля) и остальных в рад.2 (+1); поджог не каскадирует
  мгновенно; 8с после взрыва пепельник тлеет — себе ×1.1 (Тлетень ×1.2).
• МРАК «Пир хаоса»: чужой взрыв в рад.2 кормит мракового (не Венца):
  +1 уголёк и +10% на 12с (стак до ×1.5); СВОЙ взрыв мракового —
  всегда тихий бафф ×1.15 без ролла.
• ЛЕГИОН «Строй»: 2+ легионеров-соседей (Центурион рад.2, Маршал —
  весь Легион). В строю угли ×1.25 и взрыв — бафф ×1.25 без ролла.
ПРИОРИТЕТЫ ИСХОДА (Т.4.5): Кулак ×1.35 → Претор (строй в рад.2) ×1.35 →
Князь/Жрец/Яма/закон chaos ×1.25 → строй ×1.25 → Мрак ×1.15 →
Глушитель ×1.1 → ролл 65/25/10. Гасят перегрев: Ледник, Золовка (рад.2),
Вздох (соседи), Погибель Света (всех), закон face. Запрет превращения:
Рыцарь (рад.1 — и весь ВЕСЬ строй защищённого), закон face.
ЗАКОНЫ (только правила): march — угли без толпы; face — нет перегрева;
rift — просыпается раскалённым; coin — взрыв поджигает соседа;
crownD — чужие взрывы кормят. (Т.7.1) Поджог Цепного пожара — НЕ взрыв:
Пир на него не отвечает. (Т.7.2) Кандалы дают угли, но не строй. */
let demonTickN = 0; /* счётчик тиков: поджог Цепного пожара не каскадирует в тот же тик */
function demonEmberTick() {
  let changed = false;
  let mutated = false; /* коллекция перестраивается только при превращении */
  demonTickN++;
  const chaosCols = {}, marchCols = {}, faceCols = {}, riftCols = {}, coinCols = {}, crownDCols = {};
  if (epoch >= RELIC_SLOT_EPOCH) for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r || r.faction !== 'demon') continue;
    const eng = RELIC_KIND_ENGINE[r.kind]; if (!eng) continue;
    if (eng.chaosLock) chaosCols[+k] = 1;
    if (eng.march) marchCols[+k] = 1;
    if (eng.face) faceCols[+k] = 1;
    if (eng.rift) riftCols[+k] = 1;
    if (eng.coin) coinCols[+k] = 1;
    if (eng.crownD) crownDCols[+k] = 1;
  }
  const princeHere = hasCard('d10');
  const doomHere = hasCard('d36'); /* Погибель Света: перегрев невозможен ВСЕМ */
  const B = INC_CTX.bld || { pit: {}, glacier: {} };
  /* СТРОЙ ЛЕГИОНА (Т.4.3): свежий расчёт на каждый тик */
  const LEGF = buildLegionFormation();
  INC_CTX.legionForm = LEGF.map;
  INC_CTX.legionGroups = LEGF.groups;
  const FORM = LEGF.map, FGROUPS = LEGF.groups;
  const isDemonCell = n => CARDS[n.item.cardId].faction === 'demon' && !CARDS[n.item.cardId].isBuilding;
  for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) {
    const it = grid[r][c]; if (!it) continue;
    const card = CARDS[it.cardId];
    if (card.faction !== 'demon' || card.isBuilding) continue; /* здания не раскаляются */
    /* Поджог Цепного пожара этого тика — не каскадирует мгновенно (Т.4.1) */
    if (it.cfTick === demonTickN) continue;
    let crowd = getNeighbors8(r, c).filter(isDemonCell).length;
    /* (march): угли копятся даже в одиночестве; Дьяволёнок и Ночной Шёпот злятся рано */
    const needCrowd = marchCols[c] ? 0 : (card.id === 'd1' || card.id === 'd27') ? 1 : 2;
    if (crowd < needCrowd) continue;
    const key = r + ',' + c;
    const inForm = !!FORM[key];
    const inPit = (B.pit[key] || 0) > 0; /* Жертвенная Яма */
    const eng = colEngine(c);
    const tutored = (eng && eng.forge) ? 1 : 0; /* Сердце Вулкана */
    /* (crownDImpatient): рой нетерпелив — взрыв на 4 углях */
    const emberCap = (eng && eng.crownDImpatient) ? 4 : 5;
    let gain = (inPit ? (B.pitChained ? 3 : 2) : 1) + tutored;
    /* АКСЕЛЕРАТОРЫ РАСКАЛКИ (Кузнецы меняют темп — Т.1): */
    const nb1 = getNeighbors(r, c), r2d = radius2(r, c);
    let accel = 1;
    if (nb1.some(n => n.item.cardId === 'd26')) accel *= 1.2;                     /* Подстрекатель: сосед-демон ×1.2 */
    if (card.subrace === 'legion' && nb1.some(n => n.item.cardId === 'd39')) accel *= 1.3;  /* Кадровик: сосед-Легион ×1.3 */
    if (card.subrace === 'ash' && r2d.some(n => n.item.cardId === 'd22')) accel *= 1.3;     /* Горнило: Пеплы рад.2 ×1.3 */
    if (r2d.some(n => n.item.cardId === 'd32')) accel *= 1.25;                    /* Кошмар: демоны рад.2 ×1.25 */
    if (doomHere && card.subrace === 'dark') accel *= 1.2;                        /* Погибель Света: Мраки ×1.2 */
    if (inForm && r2d.some(n => n.item.cardId === 'd44')) accel *= 1.2;           /* Знаменосец: строй рад.2 ×1.2 */
    if (inForm) accel *= 1.25;                                                    /* Строй: угли ×1.25 */
    /* КАРА «Пентакля Алчности» (chaosSlow): угли копятся ВДВОЕ МЕДЛЕННЕЕ.
       Дробный прирост копится в emberAcc — целые угли уходят на карту. */
    let fgain = gain * accel * (eng && eng.chaosSlow ? 0.5 : 1);
    it.emberAcc = (it.emberAcc || 0) + fgain;
    const whole = Math.floor(it.emberAcc);
    if (whole > 0) { it.emberAcc -= whole; it.embers = Math.min(emberCap, (it.embers || 0) + whole); }
    if (fgain > 0) { fxAtCell(r, c, ['#ff9030', '#ffd34d'], 4); changed = true; }
    if ((it.embers || 0) < emberCap) continue;

    /* ВЗРЫВ */
    it.embers = 0;
    it.lastBoom = gameTime;
    stats.demonBooms = (stats.demonBooms || 0) + 1;
    /* --- ИСХОД по приоритетам Т.4.5 (buffVal = null → ролл) --- */
    let buffVal = null;
    if (r2d.some(n => n.item.cardId === 'd14')) buffVal = 1.35;                          /* 1 Око Бури */
    else if (inForm && r2d.some(n => n.item.cardId === 'd46')) buffVal = 1.35;           /* 2 Претор: строй в его рад.2 */
    else if (princeHere || inPit || nb1.some(n => n.item.cardId === 'd6') || (eng && eng.chaosLock)) buffVal = 1.25; /* 3 */
    else if (inForm) buffVal = 1.25;                                                     /* 4 Легион в строю */
    else if (card.subrace === 'dark' && card.cat !== 'crown') buffVal = 1.15;            /* 5 Мрак: тихий бафф без ролла */
    else if (r2d.some(n => n.item.cardId === 'd34')) buffVal = 1.1;                      /* 6 Глушитель */
    const chilled = nb1.some(n => n.item.cardId === 'd15'); /* Иссушитель: бафф соседа сильнее */
    if (buffVal !== null && chilled) buffVal = Math.max(buffVal, 1.35);
    /* Дисциплина Рыцаря (Т.2 d8): в рад.1 от Рыцаря не превращается ВЕСЬ строй */
    let disciplined = nb1.some(n => n.item.cardId === 'd8');
    if (!disciplined && inForm && FGROUPS[key]) {
      disciplined = FGROUPS[key].some(gk => {
        const gr = +gk.split(',')[0], gc = +gk.split(',')[1];
        return getNeighbors(gr, gc).some(n => n.item.cardId === 'd8');
      });
    }
    if (buffVal !== null) {
      it.mutBuff = Math.min(4, (it.mutBuff || 1) * buffVal);
      fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
      fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
      toast('🔥 ' + card.name + ' взорвался под контролем: БАФФ ×' + it.mutBuff.toFixed(2), 'demon', 25);
      /* КАРА «Обола Ада» (coinDebt): контролируемый взрыв тоже стоит ХАОСа */
      if (coinCols[c]) {
        it.mutBuff = 1;
        fxFloatFromCell(r, c, 'ДОЛГ ЗАБРАЛ ХАОС', '#c09040');
      }
    } else {
      /* КАРА «Сердца Вулкана» (forgeRisky): шанс перегрева ВТРОЕ выше */
      const risky = eng && eng.forgeRisky;
      const pBuff = risky ? 0.45 : 0.65, pTrans = risky ? 0.70 : 0.90;
      const roll = Math.random();
      if (roll < pBuff || disciplined) {
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.25);
        fxAtCell(r, c, ['#ffd34d', '#ff8030', '#fff'], 16, 'big');
        fxFloatFromCell(r, c, 'ХАОС ×' + it.mutBuff.toFixed(2), '#ff9030');
        toast('🔥 ' + card.name + ' взорвался Хаосом: БАФФ ×' + it.mutBuff.toFixed(2), 'demon', 25);
        /* КАРА «Обола Ада» (coinDebt): долг возвращается — накопленный ХАОС теряется */
        if (coinCols[c]) {
          it.mutBuff = 1;
          fxFloatFromCell(r, c, 'ДОЛГ ЗАБРАЛ ХАОС', '#c09040');
          toast('🪙 Обол Ада забрал долг: ХАОС ' + card.name + ' сброшен', 'demon', 25);
        }
      } else if (roll < pTrans && !disciplined && !(eng && eng.faceNoMut)) {
        /* Превращение в другого демона той же редкости (пул ×3 = 48 карт) */
        const sameRarity = POOLS[card.rarity].filter(id => CARDS[id].faction === 'demon' && !CARDS[id].isBuilding && id !== card.id);
        const newId = pick(sameRarity.length ? sameRarity : POOLS[card.rarity]);
        const oldName = card.name;
        it.cardId = newId; it.mutBuff = 1; it.embers = 0;
        discovered.add(newId);
        mutated = true; /* открыта новая карта — коллекцию обновим */
        fxAtCell(r, c, ['#c030c0', '#ff40ff', '#fff'], 18, 'big');
        fxFloatFromCell(r, c, 'ПРЕВРАЩЕНИЕ', '#ff60ff');
        toast('🔥 ' + oldName + ' превратился в ' + CARDS[newId].name + '!', 'demon', 25);
      } else if (eng && eng.faceNoMut) {
        /* КАРА «Личины Легиона» (faceNoMut): превращения в столбе невозможны */
        it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.05);
        fxFloatFromCell(r, c, 'ЛИЧИНА СКРЫЛА ЛИЦО ×' + it.mutBuff.toFixed(2), '#c0e0ff');
        toast('😈 Под личиной нет лиц: превращение отменено — тихий бафф ×' + it.mutBuff.toFixed(2), 'demon', 25);
      } else {
        /* ГАСИТЕЛИ перегрева: Ледник, Золовка (рад.2), Вздох (соседи),
           Погибель Света (все), закон face → тихий бафф ×1.15 */
        const glacier = getNeighbors8(r, c).some(n => n.item.cardId === 'bl_glacier') || (B.glacier[key] || 0) > 0;
        const zephyr = r2d.some(n => n.item.cardId === 'd20');
        const sigh = nb1.some(n => n.item.cardId === 'd30');
        if (glacier || zephyr || sigh || doomHere || faceCols[c]) {
          it.mutBuff = Math.min(4, (it.mutBuff || 1) * 1.15);
          fxFloatFromCell(r, c, 'ТИХИЙ БАФФ ×' + it.mutBuff.toFixed(2), '#c0e0ff');
          const why = glacier ? '❄️ Ледник остудил взрыв' : zephyr ? '🌬️ Золовка остудила взрыв' :
            sigh ? '💭 Вздох погасил взрыв' : doomHere ? '🌚 Сумрак погасил взрыв' : '😈 Личина удержала жар';
          toast(why + ' ' + card.name + ': ×' + it.mutBuff.toFixed(2), 'demon', 25);
        } else {
          /* Перегрев: угли сгорают в чистую мощь (под Кошмаром — ×2.5) */
          it.boomUntil = gameTime + 12;
          it.boomMult = r2d.some(n => n.item.cardId === 'd32') ? 2.5 : 2;
          fxAtCell(r, c, ['#ff4010', '#ffb060', '#fff'], 22, 'big');
          fxFloatFromCell(r, c, 'ПЕРЕГРЕВ ×' + it.boomMult, '#ff5030');
          toast('🔥 ' + card.name + ' перегрелся: ×' + it.boomMult + ' на 12 секунд!', 'demon', 25);
        }
      }
    }
    /* --- ПОСЛЕ ВЗРЫВА (ЛЮБОЙ исход, Т.4.5) --- */
    /* ВЕНЦЫ Пепла: Престол держит 2 угля (Т.7.3 — фича ★5), Феникс встаёт с 3 */
    if (card.id === 'd24') it.embers = Math.min(5, 2);
    if (card.id === 'd25') { it.embers = Math.min(5, 3); it.phxBuff = Math.min(2, (it.phxBuff || 1) + 0.10); }
    /* ЦЕПНОЙ ПОЖАР (Т.4.1): взрыв пепельника поджигает соседей +2, остальных в рад.2 +1.
       (Т.7.1) поджог — НЕ взрыв: Пир на него не отвечает; каскад — со следующего тика. */
    if (card.subrace === 'ash') {
      it.tleVal = card.id === 'd19' ? 1.2 : 1.1;   /* ТЛЕНИЕ: себе ×1.1/8с (Тлетень ×1.2/20с) */
      it.tleUntil = gameTime + (card.id === 'd19' ? 20 : 8);
      const rad1 = {};
      let ignited = 0;
      getNeighbors(r, c).forEach(n => {
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
      if (ignited) { toast('🔥 Цепной пожар: ' + card.name + ' поджёг ' + ignited + ' сосед' + (ignited === 1 ? 'а' : 'ей'), 'chainfire', 30); changed = true; }
    }
    /* ПИР ХАОСА (Т.4.2): чужой взрыв кормит мраковых (не Венцов) в рад.2 */
    let feasted = 0;
    r2d.forEach(n => {
      if (n.r === r && n.c === c) return; /* чужой взрыв — себя не кормим */
      const q = CARDS[n.item.cardId];
      if (q.faction !== 'demon' || q.isBuilding || q.subrace !== 'dark' || q.cat === 'crown') return;
      if ((n.item.feastUntil || 0) < gameTime) n.item.feastBuff = 1;
      n.item.feastBuff = Math.min(1.5, (n.item.feastBuff || 1) + 0.10);
      n.item.feastUntil = gameTime + 12;
      n.item.embers = Math.min(5, (n.item.embers || 0) + 1);
      fxAtCell(n.r, n.c, ['#9040c0', '#ff8030'], 6);
      feasted++;
    });
    if (feasted) { toast('🍖 Пир хаоса: ' + feasted + ' мраков' + (feasted === 1 ? ' кормится' : ' кормятся') + ' взрывом ' + card.name, 'feast', 30); changed = true; }
    /* ШЁПОТ Сукуба (d5) и Липкая Тень (d29): чужой взрыв в рад.1 */
    nb1.forEach(n => {
      if (n.r === r && n.c === c) return;
      if (n.item.cardId === 'd5') n.item.whisperUntil = gameTime + 15;
      if (n.item.cardId === 'd29') { n.item.embers = Math.min(5, (n.item.embers || 0) + 1); fxAtCell(n.r, n.c, ['#ff8030', '#ffd34d'], 5); }
    });
    /* Взрыв кормит соседей — Пепельный Тиран (рад.2), Гончая Ада (рад.3),
       Пирокласт (рад.3, только взрывы Пепла), Пустотный Вельможа (рад.3) */
    for (let dr = -3; dr <= 3; dr++) for (let dc = -3; dc <= 3; dc++) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nr >= GRID_SIZE || nc < 0 || nc >= GRID_SIZE) continue;
      const nb = grid[nr] && grid[nr][nc]; if (!nb) continue;
      const dist = Math.max(Math.abs(dr), Math.abs(dc));
      if (nb.cardId === 'd13' && dist <= 2) nb.tyrBuff = Math.min(3, (nb.tyrBuff || 1) * 1.2);
      if (nb.cardId === 'd2' && dist <= 3) nb.harmBuff = Math.min(1.0, (nb.harmBuff || 0) + 0.05);
      if (nb.cardId === 'd23' && dist <= 3 && card.subrace === 'ash') nb.pyroBuff = Math.min(2.5, (nb.pyroBuff || 1) * 1.15);
      /* Пустотный Вельможа: только ЧУЖОЙ взрыв (свой — уже был его результатом) */
      if (nb.cardId === 'd33' && dist > 0 && dist <= 3) {
        if (!(nb.voidUntil > gameTime)) nb.voidBuff = 1;
        nb.voidBuff = Math.min(2, (nb.voidBuff || 1) + 0.20);
        nb.voidUntil = gameTime + 20;
      }
    }
    /* Внемлющий (d35): КАЖДЫЙ взрыв на поле — +10% НАВСЕГДА (до ×3) */
    for (let rr2 = 0; rr2 < GRID_SIZE; rr2++) for (let cc2 = 0; cc2 < GRID_SIZE; cc2++) {
      const hIt = grid[rr2] && grid[rr2][cc2];
      if (hIt && hIt.cardId === 'd35') hIt.harkBuff = Math.min(3, (hIt.harkBuff || 1) + 0.10);
    }
    /* Заводила (d31): подкинутый сосед взорвался за 15с → +20% на 30с */
    if ((it.zavFedUntil || 0) > gameTime) {
      r2d.forEach(n => {
        if (n.item.cardId === 'd31') {
          n.item.zavUntil = gameTime + 30;
          fxAtCell(n.r, n.c, ['#c060ff', '#ffd34d'], 8);
          toast('🎭 ' + card.name + ' взорвался по заварке — Заводила доволен: +20%', 'zavod', 30);
        }
      });
      it.zavFedUntil = 0;
    }
    /* (rift): демон просыпается УЖЕ РАСКАЛЁННЫМ.
       КАРА (riftDrain): каждый взрыв — НАВСЕГДА −5% дохода (до −50%)*/
    if (riftCols[c]) {
      it.embers = Math.min(5, 2);
      it.riftTax = Math.min(0.5, (it.riftTax || 0) + 0.05);
      fxAtCell(r, c, ['#ff9030', '#ffd34d'], 5);
      fxFloatFromCell(r, c, 'РАЗЛОМ ПЬЁТ ЖАР −5%', '#a080ff');
    }
    /* (coin): взрыв столба ПОДЖИГАЕТ СОСЕДА */
    if (coinCols[c]) {
      const nb2 = getNeighbors8(r, c).filter(isDemonCell);
      if (nb2.length) {
        const t = pick(nb2);
        t.item.embers = Math.min(5, (t.item.embers || 0) + 2);
        fxAtCell(t.r, t.c, ['#ff8030', '#ffd34d'], 8);
        toast('🪙 Обол Ада перешёл к ' + CARDS[t.item.cardId].name + ': +2 угля', 'demon', 25);
        changed = true;
      }
    }
    /* (crownD): КАЖДЫЙ ВЗРЫВ НА ПОЛЕ кормит демонов столба */
    const crownList = Object.keys(crownDCols).map(Number);
    for (const cc of crownList) {
      for (let rr2 = 0; rr2 < GRID_SIZE; rr2++) {
        const cIt = grid[rr2][cc];
        if (!cIt) continue;
        const cCard = CARDS[cIt.cardId];
        if (cCard.faction !== 'demon' || cCard.isBuilding) continue;
        cIt.embers = Math.min(5, (cIt.embers || 0) + 1);
        fxAtCell(rr2, cc, ['#ff8030', '#ffd34d'], 5);
        changed = true;
      }
    }
  }
  /* renderCollection здесь не нужен — тик углей не меняет
инвентарь (полный ребилд коллекции с картинками каждые 8с давал
 заметный фриз). Перестраиваем только при превращении (discovered).*/
  if (changed) { computeIncome(); renderGrid(); if (mutated) renderCollection(); updateHUD(); }
}
