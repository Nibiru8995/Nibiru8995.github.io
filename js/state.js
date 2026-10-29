'use strict';
/* ============================================================
   СОСТОЯНИЕ ИГРЫ (state.js)
   Все изменяемые переменные в одном месте. Логика и рендер
   читают/меняют состояние отсюда. Сохранения:
   - meta (gg3_meta_v1): вечное — печати, ачивки, открытые карты, статистика
   - run  (gg3_run_v1):  текущая Эпоха — кристаллы, грид, инвентарь, бойцы
   ============================================================ */

const SAVE_RUN = 'gg3_run_v1';
const SAVE_META = 'gg3_meta_v1';

/* --- Валюта и ресурсы --- */
let crystals = 2500;         // кристаллы (сбрасываются на Эпохе)
let seals = 0;               // печати (НЕ сбрасываются)
let sealsTotal = 0;          // сколько печатей заработано за всё время

/* --- Эпоха --- */
let epoch = 1;               // текущая Эпоха
let maxEpoch = 1;            // рекорд
let faction = 'undead';      // фракция текущей Эпохи
let sealLv = { rich: 0, greed: 0, impulse: 0, arch: 0, fate: 0 }; // уровни магазина печатей

/* --- Грид (Алтарь) ---
   Открыта только центральная зона playableSize×playableSize (нечётные: 3→5→7→9).
   Размер растёт АВТОМАТИЧЕСКИ при переходе Эпохи (logic/epochs.js, doEpochUp). */
const GRID_SIZE = 9;
let grid = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null));
let playableSize = 3;        // сторона открытого квадрата (3..9)
let playableMask = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));

/* --- Коллекция --- */
let inventory = {};
let discovered = new Set();
let pendingCard = null;

/* --- Режимы поля --- */
let placingMode = false, deleteMode = false, moveMode = false, moveSource = null;

/* --- Арена --- */
let fighters = {};
let fighterHpState = {};
let arenaState = { floor: 1, room: 1, enemy: null, fighting: false, status: '', cleared: [false, false, false, false, false], fallen: {} };
let arenaAuto = false;
let arenaStreak = 0;         // v1.2: серия побед Арены (награда ×1.05 за победу, кап ×1.5)

/* --- Временный буст Алтаря (Жнец «Жатва», Вехи, Ускорение) --- */
let altBuff = { mult: 1, until: 0, label: '' };

/* --- v1.2.10 «Тихий Свет»: ОСВЯЩЕНИЕ реликвий + счётчики Эпохи ---
   blessedRelics — освящённые реликвии ЗАБЕГА (эффект ×1.2, макс 3).
   runRituals — ритуалов проведено за Эпоху (первый — двойная выплата).
   runOffline — сколько 💎 принёс оффлайн-доход за Эпоху (для Сводки). */
let blessedRelics = new Set();
let runRituals = 0;
let runOffline = 0;
const BLESS_MAX = 3;           // Освящений за забег
const BLESS_MULT = 1.2;        // множитель эффекта благословения

/* --- РЕЗОНАНС РИТУАЛА (v1.0): живая шкала культистов ---
   Пока стоит формация — шкала полнеет; на 100% — ВСПЛЕСК ×1.5 на 20с.
   Без формации резонанс медленно тает. Побуждает беречь ритуал. */
let ritualResonance = 0;      // 0..100
let surgeUntil = 0;           // gameTime конца всплеска

/* --- Вехи забега + бесплатные крутки (logic/milestones.js) --- */
let milestoneIdx = 0, freeRolls = 0;

/* --- Скорость игры (настройка, мета): ×1 / ×2 / ×4 --- */
let speedMult = 1;

/* --- Гача --- */
let pity4 = 0, pity5 = 0, runRolls = 0;

/* --- Прогресс забега --- */
let runEarned = 0;           // сколько 💎 заработано за текущую Эпоху (порог Эпохи)
let runTime = 0;             // время текущего забега
let gameTime = 0;            // суммарное время за всё время (для ачивки)
let gamePaused = false, gameStarted = false, noSave = false;
/* v1.2.6: кристаллы, НЕ идущие в порог Эпохи (продажа дубликатов,
   компенсации реликвий, награды Арены, знамения). Прогресс Эпохи
   растёт ТОЛЬКО от дохода Алтаря — иначе Эпохи копились слишком быстро. */
let incomeExempt = 0;

/* --- Статистика (вечная, для ачивок) --- */
let stats = {
  g: {},            // казино: {slots:{w,l,net},...}
  pulls: {},        // {cardId: count}
  rolls: 0,         // круток всего
  maxInc: 0,        // рекорд дохода
  casinoLost: 0,    // суммарный проигрыш в казино
  casinoBest: 0,    // лучший множитель выигрыша
  arenaDeaths: 0,
  floorMax: 1,
  bossKills: 0,
  eliteKills: 0,
  streakMax: 0,
  surges: 0,        // всплесков резонанса ритуала (v1.0)
  mercy: 0,         // пощажённых владык Арены (v1.2.10 «Милосердие»)
  bells: 0,         // Знамений «Колокол» собрано (v1.2.10)
  dailyStreak: 0,   // дней подряд с «Знамением Судьбы» (v1.2.10)
  predKills: 0,     // убийств хищниками на Алтаре (v1.1)
  demonBooms: 0,    // взрывов Хаоса (v1.1)
  deleted: 0,
  placed: 0,
  omens: 0,       // собранных Знамений
  freeRolls: 0,   // бесплатных круток с вех
  speedUsed: 0    // играл на ускорении > ×1
};

/* --- Достижения --- */
let achDone = {};

/* --- v1.2.9: Хроники Тьмы (разовые вершины коллекции) + ежедневный дар ---
   chron: ключи вида 'undead3' / 'undeadB' / 'undead4' / 'undead5' — вечные.
   lastDaily: локальная дата последнего «Знамения Судьбы».
   contracts: серия «Тёмного Пакта» — живёт в сохранении ЗАБЕГА (сброс на Эпохе). */
let chron = {};
let lastDaily = '';
let contracts = { list: [], used: [], done: 0, nextAt: 0, pact: false };

/* --- Онбординг фич/фракций (вечный): какие подсказки уже показаны --- */
let guideSeen = {};

/* --- Прочее --- */
let collectionFilter = 'all', rarityFilter = 'all';
let busy = 0; // активный раунд казино (блокирует выход)

/* Кэш расчёта дохода (заполняется logic/economy.js) */
let incomeCache = { total: 0, uniquePairs: 0, perCell: {}, pairUsage: {}, linkFactors: {}, linkWarded: {}, lichZone: [] };

/* ================== СОХРАНЕНИЕ ================== */
function buildRunSave() {
  return {
    t: Date.now(), crystals, epoch, faction, grid,
    playableSize, inventory, fighters, fighterHpState,
    arena: { floor: arenaState.floor, room: arenaState.room, cleared: arenaState.cleared, fallen: arenaState.fallen },
    arenaStreak,
    pity4, pity5, runRolls, runEarned, runTime, sealLv,
    milestoneIdx, freeRolls, relicSlots, relicPity,
    relics: [...RELICS_OWNED],
    ritualResonance, surgeUntil,
    blessed: [...blessedRelics], rituals: runRituals, offline: runOffline, /* v1.2.10 */
    contracts: { list: contracts.list, used: contracts.used, done: contracts.done, nextAt: contracts.nextAt, pact: contracts.pact } /* v1.2.9: Тёмный Пакт */
  };
}
/* v1.2.10 (QA, Игорь Тёмных): при переполнении localStorage игрок терял
   прогресс МОЛЧА — один тост за сессию сообщает о проблеме записи. */
let saveFailToasted = false;
function saveFailWarn(where) {
  console.error('save fail:', where);
  if (!saveFailToasted && typeof toast === 'function') {
    saveFailToasted = true;
    toast('⚠ Не удаётся сохранить прогресс (хранилище переполнено). Прогресс этой сессии может быть потерян.');
  }
}
function saveRun() {
  if (noSave || !gameStarted) return;
  try { localStorage.setItem(SAVE_RUN, JSON.stringify(buildRunSave())); } catch (e) { saveFailWarn('run'); }
}
function loadRun() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_RUN) || 'null');
    if (!d) return false;
    crystals = d.crystals ?? 2500;
    epoch = d.epoch ?? 1; faction = d.faction ?? 'undead';
    grid = d.grid ?? grid;
    playableSize = clamp(d.playableSize ?? 3, 3, epochMaxSize(epoch));
    inventory = d.inventory ?? {};
    fighters = d.fighters ?? {}; fighterHpState = d.fighterHpState ?? {};
    if (d.arena) Object.assign(arenaState, d.arena);
    arenaStreak = d.arenaStreak ?? 0;
    pity4 = d.pity4 ?? 0; pity5 = d.pity5 ?? 0;
    runRolls = d.runRolls ?? 0; runEarned = d.runEarned ?? 0; runTime = d.runTime ?? 0;
    if (d.sealLv) Object.assign(sealLv, d.sealLv);
    milestoneIdx = d.milestoneIdx ?? 0; freeRolls = d.freeRolls ?? 0;
    ritualResonance = d.ritualResonance ?? 0; surgeUntil = d.surgeUntil ?? 0;
    /* РЕЛИКВИИ v1.2.5: владение живёт В ЗАБЕГЕ (сброс при смене Эпохи) */
    RELICS_OWNED = new Set((d.relics || []).filter(id => relicById(id)));
    /* v1.2.10: Освящение — только реликвий, ЕСТЬ в текущем забеге */
    blessedRelics = new Set((d.blessed || []).filter(id => RELICS_OWNED.has(id)));
    runRituals = d.rituals ?? 0;
    runOffline = d.offline ?? 0;
    if (typeof contractsRestore === 'function') contractsRestore(d.contracts); /* v1.2.9: валидация внутри */
    /* РЕЛИКВИИ 2.0: расстановка по столбцам. v1.2.10 (QA): валидация
       ФРАКЦИИ реликвии в слоте — сейв из чит-режима мог оставить слот
       с реликвией чужой фракции. */
    relicSlots = {};
    if (d.relicSlots) for (const k in d.relicSlots) {
      const c = +k;
      const rr = relicById(d.relicSlots[k]);
      if (c >= 0 && c < GRID_SIZE && rr && rr.faction === faction) relicSlots[c] = d.relicSlots[k];
    }
    relicPity = d.relicPity ?? 0;
    let need = 3;
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
      if (grid[r][c]) need = Math.max(need, 2 * Math.max(Math.abs(4 - r), Math.abs(4 - c)) + 1);
    playableSize = clamp(Math.max(playableSize, need), 3, 9);
    rebuildPlayableMask();
    /* Оффлайн-доход v1.2.10: 75% за время до 2 часов (было 50% / 1 час) */
    const capS = 7200, rate = 0.75;
    const gain = calculateIncome() * Math.min((Date.now() - (d.t || Date.now())) / 1000, capS) * rate;
    if (gain >= 1) {
      crystals += gain; runEarned += gain; runOffline += gain; /* v1.2.10: в Сводку Эпохи */
      setTimeout(() => toast('Пока вас не было: +' + fmt(gain) + ' 💎'), 600);
    }
    return true;
  } catch (e) { return false; }
}

function buildMetaSave() {
  return { seals, sealsTotal, maxEpoch, disc: [...discovered], achDone, stats, totalTime: gameTime, guide: guideSeen,
    chron, lastDaily, /* v1.2.9: Хроники Тьмы + дата ежедневного дара */
    sfx: soundOn, music: musicOn, fx: fxOn, speedMult };
}
function saveMeta() {
  try { localStorage.setItem(SAVE_META, JSON.stringify(buildMetaSave())); } catch (e) { if (typeof saveFailWarn === 'function') saveFailWarn('meta'); }
}
function loadMeta() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_META) || 'null');
    if (!d) return;
    seals = d.seals ?? 0; sealsTotal = d.sealsTotal ?? 0; maxEpoch = d.maxEpoch ?? 1;
    discovered = new Set(d.disc || []); achDone = d.achDone || {};
    if (d.stats) stats = Object.assign(stats, d.stats);
    guideSeen = d.guide || {};
    gameTime = d.totalTime ?? 0;
    chron = (d.chron && typeof d.chron === 'object') ? d.chron : {}; /* v1.2.9 */
    lastDaily = d.lastDaily || '';                                  /* v1.2.9 */
    /* Реликвии больше НЕ хранятся в мета (v1.2.5: расходник забега) */
    soundOn = d.sfx ?? true; musicOn = d.music ?? true;
    fxOn = d.fx ?? true; speedMult = d.speedMult ?? 1;
  } catch (e) { }
}

function hasRunSave() { try { return !!localStorage.getItem(SAVE_RUN); } catch (e) { return false; } }
function wipeAll() {
  try { localStorage.removeItem(SAVE_RUN); localStorage.removeItem(SAVE_META); } catch (e) { }
}
