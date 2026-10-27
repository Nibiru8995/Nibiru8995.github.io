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

/* --- Временный буст Алтаря (Жнец «Жатва», Вехи, Ускорение) --- */
let altBuff = { mult: 1, until: 0, label: '' };

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
  deleted: 0,
  placed: 0,
  omens: 0,       // собранных Знамений
  freeRolls: 0,   // бесплатных круток с вех
  speedUsed: 0    // играл на ускорении > ×1
};

/* --- Достижения --- */
let achDone = {};

/* --- Онбординг фич/фракций (вечный): какие подсказки уже показаны --- */
let guideSeen = {};

/* --- Прочее --- */
let collectionFilter = 'all', rarityFilter = 'all';
let busy = 0; // активный раунд казино (блокирует выход)

/* Кэш расчёта дохода (заполняется logic/economy.js) */
let incomeCache = { total: 0, uniquePairs: 0, perCell: {}, pairUsage: {}, diversityMult: 1 };

/* ================== СОХРАНЕНИЕ ================== */
function buildRunSave() {
  return {
    t: Date.now(), crystals, epoch, faction, grid,
    playableSize, inventory, fighters, fighterHpState,
    arena: { floor: arenaState.floor, room: arenaState.room, cleared: arenaState.cleared, fallen: arenaState.fallen },
    pity4, pity5, runRolls, runEarned, runTime, sealLv,
    milestoneIdx, freeRolls
  };
}
function saveRun() {
  if (noSave || !gameStarted) return;
  try { localStorage.setItem(SAVE_RUN, JSON.stringify(buildRunSave())); } catch (e) { console.error('saveRun fail:', e); }
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
    pity4 = d.pity4 ?? 0; pity5 = d.pity5 ?? 0;
    runRolls = d.runRolls ?? 0; runEarned = d.runEarned ?? 0; runTime = d.runTime ?? 0;
    if (d.sealLv) Object.assign(sealLv, d.sealLv);
    milestoneIdx = d.milestoneIdx ?? 0; freeRolls = d.freeRolls ?? 0;
    let need = 3;
    for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++)
      if (grid[r][c]) need = Math.max(need, 2 * Math.max(Math.abs(4 - r), Math.abs(4 - c)) + 1);
    playableSize = clamp(Math.max(playableSize, need), 3, 9);
    rebuildPlayableMask();
    /* Оффлайн-доход: 50% за время до 1 часа (Реликвия «Часы Времени»: 75% до 2 часов) */
    const capS = hasRelic('hourglass') ? 7200 : 3600;
    const rate = hasRelic('hourglass') ? 0.75 : 0.5;
    const gain = calculateIncome() * Math.min((Date.now() - (d.t || Date.now())) / 1000, capS) * rate;
    if (gain >= 1) {
      crystals += gain; runEarned += gain;
      setTimeout(() => toast('Пока вас не было: +' + fmt(gain) + ' 💎'), 600);
    }
    return true;
  } catch (e) { return false; }
}

function buildMetaSave() {
  return { seals, sealsTotal, maxEpoch, disc: [...discovered], achDone, stats, totalTime: gameTime, guide: guideSeen,
    relics: [...RELICS_OWNED], sfx: soundOn, music: musicOn, fx: fxOn, speedMult };
}
function saveMeta() {
  try { localStorage.setItem(SAVE_META, JSON.stringify(buildMetaSave())); } catch (e) { console.error('saveMeta fail:', e); }
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
    RELICS_OWNED = new Set(d.relics || []);
    soundOn = d.sfx ?? true; musicOn = d.music ?? true;
    fxOn = d.fx ?? true; speedMult = d.speedMult ?? 1;
  } catch (e) { }
}

function hasRunSave() { try { return !!localStorage.getItem(SAVE_RUN); } catch (e) { return false; } }
function wipeAll() {
  try { localStorage.removeItem(SAVE_RUN); localStorage.removeItem(SAVE_META); } catch (e) { }
}
