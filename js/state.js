'use strict';
/* ============================================================
   СОСТОЯНИЕ ИГРЫ (state.js)
   Все изменяемые переменные в одном месте. Логика и рендер
   читают/меняют состояние отсюда. Сохранения:
   - meta (gg3_meta_v2): вечное — ачивки, коллекция Гримуара, Души,
     УЛУЧШЕНИЯ (upgLv/fieldLv/feats/factionsOwned, v1.8.0)
   - run  (gg3_run_v2):  текущая Эпоха — ТЭ, грид, инвентарь (колода),
     deckStacks (очереди стаков), runDeck (снапшот стартовой колоды)
   ============================================================ */

/* v1.7.0 «Плата Душами»: версии сейвов подняты до v2 — ОБНУЛЕНИЕ ВСЕХ УЧЁТОК
   (решение от 03.11: каждый игрок начинает с чистого листа, у новичков 30 Душ).
   Старые ключи v1 вычищаются при загрузке (wipeLegacySaves). */
const SAVE_RUN = 'gg3_run_v2';
const SAVE_META = 'gg3_meta_v2';
const SAVE_LEGACY = ['gg3_run_v1', 'gg3_meta_v1'];

/* --- Валюта и ресурсы --- */
let crystals = 2500;         // ТЁМНАЯ ЭНЕРГИЯ (доход, порог Эпохи, казино)
let souls = 30;              // ДУШИ — валюта Призыва и Улучшений (старт 30)
let stats = {
  g: {},            // казино: {slots:{w,l,net},...}
  pulls: {},        // {cardId: count}
  rolls: 0,         // круток всего
  soulsEarned: 0,   // Душ заработано за всё время (v1.8.0, ачивки)
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
  predKills: 0,     // убийств хищниками на Алтаре (v1.1; с v1.12.0 не пополняется — легаси)
  huntActs: 0,      // актов охоты накоплено за Эпоху (v1.12.0, Дикие Угодья)
  demonBooms: 0,    // взрывов Хаоса (v1.1)
  deleted: 0,
  placed: 0,
  omens: 0,       // собранных Знамений
  speedUsed: 0    // играл на ускорении > ×1
};
/* Единая точка начисления Душ (v1.8.0): заодно копим вечную статистику */
function gainSouls(n) {
  souls += n;
  stats.soulsEarned = (stats.soulsEarned || 0) + n;
}

/* --- v1.8.0 «Вечная Эпоха»: УЛУЧШЕНИЯ (мета, вечные) ---
   upgLv — уровни бонусов (бывшие печати: rich/greed/impulse/arch/fate);
   fieldLv — купленные расширения поля (3×3 → 5×5 → 7×7 → 9×9);
   deckLv — купленные страницы колоды (лимит 9 → 25 → 49 → 81);
   feats — купленные фичи: arena, casino, r4/r5, darkomens, darksave, ground;
   staffLv — купленные улучшения Слуг (stt_<фракция>_<№> = 1);
   staffLv — отредактированные покупки Слуг (fid_...: 1);
   factionsOwned — купленные фракции: cultist, beast, demon.
   Печати 🔱 («эссенция») УДАЛЕНЫ из игры — всё платит Душами. */
let upgLv = { rich: 0, greed: 0, impulse: 0, arch: 0, fate: 0 };
let fieldLv = 0;
let deckLv = 0;
let feats = [];
let factionsOwned = [];
let staffLv = {};

/* Разовое обнуление учёток: ключи прошлых версий + локальный «рекорд,
   отправленный в базу» (иначе после чистки Таблички Тьмы новые рекорды
   не писались бы — score <= lbBestSent). Ник/устройство не трогаем. */
const NUKE_KEY = 'gg3_nuke_2026_11';
function wipeLegacySaves() {
  try {
    if (!localStorage.getItem(NUKE_KEY)) {
      /* v1.8.1 срочный сброс ВСЕХ учёток: сейв, мета, ник, устройство, отправленный рекорд */
      SAVE_LEGACY.forEach(k => localStorage.removeItem(k));
      [SAVE_RUN, SAVE_META, 'gg3_lbBest', 'gg3_player', 'gg3_visitor']
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(NUKE_KEY, '1'); /* один раз на устройство */
    } else {
      SAVE_LEGACY.forEach(k => localStorage.removeItem(k));
      localStorage.removeItem('gg3_lbBest');
    }
  } catch (e) { }
}
/* --- v1.8.0: ПЕЧАТИ 🔱 («эссенция») УДАЛЕНЫ ИЗ ИГРЫ —
   бонусы магазина печатей переехали в «Улучшения» и платят Душами. */

/* --- v1.6.0 «ГРИМУАР»: мета-слой карт ---
   collection — ВЕЧНАЯ коллекция карт Призыва {cardId: количество}.
   decks — колоды [{id, name, race, cards:[{id, n}]}], лимит 64 копии,
   дубликаты разрешены (v1.8.0: каждая копия — отдельный блок-запись,
   стак до deckStackMax() через фиолетовую стрелку ▲).
   activeDeck — {раса: id колоды}, какая колода выдаётся на старте забега этой расы.
   gachaRace — раса, выбранная в Призыве. */
let collection = {};
let decks = [];
let activeDeck = {};
let gachaRace = 'undead';
/* v1.8.0: реликвии больше НЕ выпадают из Призыва (схрон удалён) —
   способа получить реликвии пока нет, это доработаем позже. */

/* --- Эпоха --- */
let epoch = 1;               // текущая Эпоха
let maxEpoch = 1;            // рекорд
let faction = 'undead';      // фракция текущей Эпохи

/* --- Грид (Алтарь) ---
   Открыта только центральная зона playableSize×playableSize (нечётные: 3/5/7/9).
   v1.8.0: размер задаётся купленными расширениями поля («Улучшения»),
   от Эпохи больше НЕ растёт. */
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

/* --- Вехи забега. v1.7.0: БЕСПЛАТНЫЕ КРУТКИ УБРАНЫ СОВСЕМ — каждая крутка
   Призыва платит Душой (Гримуар). Вехи дают только временные ускорения. --- */
let milestoneIdx = 0;

/* --- v1.8.0 «Вечная Эпоха»: ЗАСТАКАННЫЕ КАРТЫ КОЛОДЫ (очереди) ---
   deckStacks — {cardId: [n, n, …]} — стаки, с которыми копии выданы
   из колоды (каждая запись колоды {id, n} со n≥2 кладёт своё N в
   очередь, отсортированную по убыванию). Постановка такой карты на
   грид берёт ПЕРВЫЙ стак очереди и встанет готовым юнитом ×N
   (аналог стака на клетке), а НЕ одной копией. Ручной стак на
   гриде отключён (v1.7.0). --- */
let deckStacks = {};

/* --- v1.8.0: СТАРТОВАЯ КОЛОДА ЗАБЕГА (снапшот) ---
   Плоский список id карт (с дубликатами), выданный на старте Эпохи.
   По нему сверяются req-требования контрактов: задание обязано быть
   выполнимым с той колодой, с которой игрок начал Эпоху. --- */
let runDeck = [];

/* --- Скорость игры (настройка, мета): ×1 / ×2 / ×4 --- */
let speedMult = 1;

/* --- Гача. pity4/pity5 — ВЕЧНЫЕ (мета); крутки идут из Гримуара за Души.
   runRolls — круток за текущую Эпоху (для статистики). --- */
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
let incomeCache = { total: 0, uniquePairs: 0, perCell: {}, pairUsage: {}, linkFactors: {}, linkRoyal: {}, linkLich: {}, lichZone: [] };

/* ================== СОХРАНЕНИЕ ==================
   v1.8.0: deckStacks — очереди стаков, runDeck — снапшот стартовой колоды. */
function buildRunSave() {
  return {
    t: Date.now(), crystals, epoch, faction, grid,
    playableSize, inventory, deckStacks, runDeck, fighters, fighterHpState,
    arena: { floor: arenaState.floor, room: arenaState.room, cleared: arenaState.cleared, fallen: arenaState.fallen },
    arenaStreak,
    runRolls, runEarned, runTime,
    milestoneIdx, relicSlots,
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
    /* v1.8.0: потолок размера поля — купленные расширения (не Эпоха) */
    playableSize = clamp(d.playableSize ?? 3, 3, typeof fieldSize === 'function' ? fieldSize() : 9);
    inventory = d.inventory ?? {};
    /* v1.8.0: снапшот стартовой колоды для req-требований контрактов */
    runDeck = Array.isArray(d.runDeck) ? d.runDeck.filter(id => CARDS[id]) : [];
    /* v1.8.0: deckStacks — ОЧЕРЕДИ стаков {id: [n≥2, …]}, сортировка по убыванию */
    deckStacks = {};
    if (d.deckStacks && typeof d.deckStacks === 'object') for (const k in d.deckStacks) {
      const arr = Array.isArray(d.deckStacks[k])
        ? d.deckStacks[k].map(x => Math.floor(+x || 0)).filter(n => CARDS[k] && n >= 2 && n <= 9)
        : [];
      if (arr.length) { arr.sort((a, b) => b - a); deckStacks[k] = arr; }
    }
    fighters = d.fighters ?? {}; fighterHpState = d.fighterHpState ?? {};
    if (d.arena) Object.assign(arenaState, d.arena);
    arenaStreak = d.arenaStreak ?? 0;
    runRolls = d.runRolls ?? 0; runEarned = d.runEarned ?? 0; runTime = d.runTime ?? 0;
    milestoneIdx = d.milestoneIdx ?? 0;
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
      setTimeout(() => toast('Пока вас не было: +' + fmt(gain) + ' ' + DE_IMG), 600);
    }
    return true;
  } catch (e) { console.error('loadRun fail:', e); return false; }
}

function buildMetaSave() {
  return { maxEpoch, disc: [...discovered], achDone, stats, totalTime: gameTime, guide: guideSeen,
    chron, lastDaily, /* v1.2.9: Хроники Тьмы + дата ежедневного дара */
    /* Гримуар: мета-слой карт + вечные гача-счётчики (v1.7.0: без freeRolls) */
    souls, collection, decks, activeDeck, gachaRace,
    pity4, pity5,
    /* v1.8.0: УЛУЧШЕНИЯ — уровни бонусов, поле, страницы колоды, фичи, фракции (печати удалены) */
    upgLv, fieldLv, deckLv, feats, factionsOwned, staffLv,
    sfx: soundOn, music: musicOn, fx: fxOn, speedMult };
}
function saveMeta() {
  try { localStorage.setItem(SAVE_META, JSON.stringify(buildMetaSave())); } catch (e) { if (typeof saveFailWarn === 'function') saveFailWarn('meta'); }
}
function loadMeta() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_META) || 'null');
    if (!d) return;
    maxEpoch = d.maxEpoch ?? 1;
    discovered = new Set(d.disc || []); achDone = d.achDone || {};
    if (d.stats) stats = Object.assign(stats, d.stats);
    guideSeen = d.guide || {};
    gameTime = d.totalTime ?? 0;
    chron = (d.chron && typeof d.chron === 'object') ? d.chron : {}; /* v1.2.9 */
    lastDaily = d.lastDaily || '';                                  /* v1.2.9 */
    /* Мета-слой Гримуара. Старт 30 Душ у новичка. */
    souls = d.souls ?? 30;
    collection = (d.collection && typeof d.collection === 'object') ? d.collection : {};
    /* v1.8.0: колода — ЗАПИСИ {id, n}. Старый плоский формат [id,…]
       мигрирует: каждая копия становится отдельной записью ×1. */
    const flatToEntries = arr => arr.map(v => typeof v === 'object' && v ? { id: String(v.id), n: clamp(Math.floor(+v.n || 1), 1, 9) } : { id: String(v), n: 1 });
    decks = Array.isArray(d.decks) ? d.decks : [];
    decks = decks.filter(k => k && (Array.isArray(k.cards) || Array.isArray(k.entries)) && FACTION_KEYS.includes(k.race)).map((k, i) => ({
      id: k.id || ('dk' + Date.now() + '_' + i),
      name: String(k.name || 'Колода').slice(0, 24),
      race: k.race,
      cards: flatToEntries((k.cards || []).filter(v => (typeof v === 'object' && v ? CARDS[v.id] : CARDS[v])))
    }));
    activeDeck = (d.activeDeck && typeof d.activeDeck === 'object') ? d.activeDeck : {};
    gachaRace = FACTION_KEYS.includes(d.gachaRace) ? d.gachaRace : 'undead';
    pity4 = d.pity4 ?? 0; pity5 = d.pity5 ?? 0;
    /* v1.8.0: УЛУЧШЕНИЯ. Уровни бонусов читаем и из старых сейвов
       (ключ sealLv — бывший магазин печатей, уровни сохраняются). */
    const lvSrc = d.upgLv || d.sealLv || {};
    upgLv = { rich: lvSrc.rich || 0, greed: lvSrc.greed || 0, impulse: lvSrc.impulse || 0, arch: lvSrc.arch || 0, fate: lvSrc.fate || 0 };
    fieldLv = clamp(Math.floor(d.fieldLv ?? 0), 0, 3);
    deckLv = clamp(Math.floor(d.deckLv ?? 0), 0, (typeof UPG_DECK !== 'undefined' ? UPG_DECK.length : 0));
    feats = Array.isArray(d.feats) ? d.feats.filter(k => UPG_ONCE && UPG_ONCE[k]) : [];
    factionsOwned = Array.isArray(d.factionsOwned) ? d.factionsOwned.filter(f => FACTION_KEYS.includes(f)) : [];
    staffLv = (d.staffLv && typeof d.staffLv === 'object') ? d.staffLv : {};
    soundOn = d.sfx ?? true; musicOn = d.music ?? true;
    fxOn = d.fx ?? true; speedMult = d.speedMult ?? 1;
  } catch (e) { }
}

function hasRunSave() { try { return !!localStorage.getItem(SAVE_RUN); } catch (e) { return false; } }
function wipeAll() {
  try { localStorage.removeItem(SAVE_RUN); localStorage.removeItem(SAVE_META); } catch (e) { }
}
