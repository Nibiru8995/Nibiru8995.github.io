'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js) — v1.4.0 «Закон и Кара»
   ПЕРЕРАБОТКА ПО ТЗ: каждая реликвия — СИЛЬНЫЙ БАФФ + ОЩУТИМЫЙ
   ДЕБАФФ. v1.3.1 интегрирован: Хор разнообразия убран из игры,
   «Плачущий Камень» — slowfade (kind stone). Реликвия ВНОСИТ ЗАКОН В СТОЛБ (или весь ритуал):
   бафф резко усиливает игру в узком русле, кара («curse»)
   ломает привычные схемы и требует перестроить столб.
   Пример: «Корона Тлена» — прибыль Некроманта/Лича/Владыки
   столба ×2, НО другие карты (кроме зданий) в столбе
   ЗАПРЕЩЕНЫ, уже стоящие — УНИЧТОЖАЮТСЯ.
   Механика запретов: RELIC_BANS + cardAllowedInCol() +
   enforceRelicBans() (тик раз в 0.5с + мгновенно при установке).
   Спрайты — assets/relics/<id>.png (дарк-фэнтези).
   ============================================================ */

const RELICS = [
  /* ---------------- НЕЖИТЬ: кости, цепи, могилы ---------------- */
  { id: 'rb_nail',   faction: 'undead', kind: 'nail',   rarity: 3, icon: '⚰',
    name: 'Гробовой Гвоздь',
    rule: 'ПОКА В СТОЛБЕ СТОИТ СТОПКА ×3 — звенья столба не затухают',
    curse: 'ПОКА СТОПКИ ×3 НЕТ — звенья столба слабеют ВДВОЕ ЖЕСТЧЕ',
    lore: 'Забит в крышку каждого саркофага Владыки. Тройка помнит всех — тройка держит всех.' },
  { id: 'rb_skull',  faction: 'undead', kind: 'skull',  rarity: 3, icon: '💀',
    name: 'Череп Владыки',
    rule: 'Первые ДВА звена КАЖДОЙ пары столба не слабеют от повторов',
    curse: 'ТРЕТЬЕ И ДАЛЬНЕЙШИЕ звенья пары в столбе — МЕРТВЫ: не дают ничего',
    lore: 'Он помнит каждое звено каждой цепи. Но память его конечна — четвёртую связь он не признаёт.' },
  { id: 'rb_stone',  faction: 'undead', kind: 'stone',  rarity: 4, icon: '🪦',
    name: 'Плачущий Камень',
    rule: 'ЗАТУХАНИЕ ПАР СТОЛБА НЕ УГЛУБЛЯЕТСЯ — слабеют лишь раз, дальше держат силу',
    curse: 'Карты столба без единого звена ПЛАЧУТ: −50% дохода',
    lore: 'Надгробие, с которого сутки течёт вода. Камень впитал слёзы — и больше не отдаст.' },
  { id: 'rb_urn',    faction: 'undead', kind: 'urn',    rarity: 4, icon: '⚱',
    name: 'Урна Владык',
    rule: 'Звено, касающееся СТОПКИ ×2+, не затухает никогда; стопки столба дают +30%',
    curse: 'Одиночные карты (не в стопке) в столбе дают ВДВОЕ МЕНЬШЕ',
    lore: 'Прах пяти династий держится друг за друга. Одиночек прах не признаёт.' },
  { id: 'rb_heart',  faction: 'undead', kind: 'heart',  rarity: 5, icon: '🖤',
    name: 'Сердце Пустоты',
    rule: 'Повторы НЕ ГЛОШАТ звенья столба до конца (не ниже ×0.35) — цепь выживает',
    curse: 'Сердце высасывает силу: затухание звеньев ВНЕ столба Сердца ВДВОЕ ЖЕСТЧЕ',
    lore: 'Оно не бьётся. Оно ждёт. Свой столб оно бережёт — за счёт всех остальных.' },
  { id: 'rb_crown',  faction: 'undead', kind: 'sun',    rarity: 5, icon: '👑',
    name: 'Корона Тлена',
    rule: 'Прибыль карт «Некромант», «Лич» и «Владыка Тлена» в столбе УДВАИВАЕТСЯ',
    curse: 'Другие карты (кроме зданий) в столб ЗАПРЕЩЕНЫ: уже стоящие — УНИЧТОЖАЮТСЯ',
    lore: 'Ржавая, тяжёлая, вечная. Носить её дозволено лишь мёртвой знати — чернь корона испепеляет.' },

  /* ---------------- КУЛЬТИСТЫ: ГЛОБАЛЬНЫЕ ЗАКОНЫ РИТУАЛА ----------------
     Столб не важен — закон и кара действуют на весь ритуал Алтаря. */
  { id: 'rc_eye',    faction: 'cultist', kind: 'rcap', rarity: 3, icon: '🔯',
    name: 'Око Ритуала',
    rule: 'ПОТОЛОК СКОРОСТИ заряда отодвигается: 15% → 21%/с',
    curse: 'Око видит только цепь: ВНЕШНИЙ КРУГ не даёт ни заряда, ни выплаты',
    lore: 'Ритуал видит себя со стороны. Со стороны потолка нет. Бокового зрения — тоже.' },
  { id: 'rc_candle', faction: 'cultist', kind: 'rkeep', rarity: 3, icon: '🕯',
    name: 'Свеча Мученика',
    rule: 'ПОСЛЕ ВЫПЛАТЫ ритуал не остывает: +12% заряда сохраняется',
    curse: 'Свеча горит неторопливо: ритуал заряжается на 20% МЕДЛЕННЕЕ',
    lore: 'Гаснет ровно тогда, когда догорает молитва. Но молитва при свечах — долгая.' },
  { id: 'rc_chains', faction: 'cultist', kind: 'rchain', rarity: 4, icon: '⛓',
    name: 'Вериги Пустоты',
    rule: 'Вклад участников СКЛАДЫВАЕТСЯ БЕЗ НАСЫЩЕНИЯ — каждый несёт свой жар',
    curse: 'Вериги равняют всех: ФОРМАЦИИ больше не ускоряют заряд',
    lore: 'Самобичевание, доведённое до инженерного совершенства. Строй и шеренга — для чужих.' },
  { id: 'rc_mask',   faction: 'cultist', kind: 'router', rarity: 4, icon: '🎭',
    name: 'Многоликая Маска',
    rule: 'СЛУЖИТЕЛИ ВНЕШНЕГО КРУГА работают без предела',
    curse: 'Маски скрывают верность: ХРАНИТЕЛИ ЖАРА не хранят ничего',
    lore: 'Масок тридцать, и каждая служит. Ни одной нельзя узнать — и ни одной не согреться.' },
  { id: 'rc_pupil',  faction: 'cultist', kind: 'rpaycap', rarity: 5, icon: '👁',
    name: 'Зрачок Бездны',
    rule: 'ПОТОЛОК ВЫПЛАТЫ отодвигается: ×4 → ×7',
    curse: 'Бездна утомляет: усилители выплаты дают ВДВОЕ МЕНЬШЕ',
    lore: 'Смотрит в ответ. В его взгляде нет потолка — только усталость глядящих в него.' },
  { id: 'rc_chalice', faction: 'cultist', kind: 'rfirst', rarity: 5, icon: '🍷',
    name: 'Кровавая Чаша',
    rule: 'Первые ТРИ ритуала Эпохи просыплены кровью — ДВОЙНАЯ ВЫПЛАТА',
    curse: 'Потом кровь кончается: ритуалы после третьего платят ВДВОЕ МЕНЬШЕ',
    lore: 'Наполняется сама. Первые глотки — за счёт Тьмы. Остальные — за твой счёт.' },

  /* ---------------- ЗВЕРИ: клыки, тотемы, рога ---------------- */
  { id: 'rw_fang',   faction: 'beast', kind: 'fang',    rarity: 3, icon: '🦷',
    name: 'Клык Альфы',
    rule: 'СОЖРАННОЕ В СТОЛБЕ кормит ВСЮ СТАЮ: убийца делится трапезой со всеми хищниками поля',
    curse: 'Но альфа кусает вполсилы: укусы хищников столба ВДВОЕ СЛАБЕЕ',
    lore: 'Вырван в честном бою за право называться обедом кого-то ещё. Альфа ест первым — но жуёт лениво.' },
  { id: 'rw_totem',  faction: 'beast', kind: 'range',   rarity: 3, icon: '🗿',
    name: 'Мшистый Тотем',
    rule: 'ТРАВОЯДНЫЕ СТОЛБА находят флору ЧЕРЕЗ КЛЕТКУ и пасутся ВДВОЕ СЫТЕЕ',
    curse: 'Тотем — святилище: ХИЩНИКОВ в столбе ставить ЗАПРЕЩЕНО (уже стоящие уничтожаются)',
    lore: 'Лес ставит их сам. Тропы от тотема помнят все пастбища — и потому без клыков.' },
  { id: 'rw_bough',  faction: 'beast', kind: 'bough',   rarity: 4, icon: '🌿',
    name: 'Ветвь Древеня',
    rule: 'ФЛОРА СТОЛБА усмиряет голод: хищники рядом с ней НЕ ГОЛОДАЮТ и лечатся вдвое лучше',
    curse: 'Сытые ветвью ленятся: баффы убийств хищников столба ВДВОЕ МЕНЬШЕ',
    lore: 'Отломил — посади. Лес всё видит, лес всех сытит — и отучает охотиться.' },
  { id: 'rw_collar', faction: 'beast', kind: 'apex',    rarity: 4, icon: '🥷',
    name: 'Ошейник Господства',
    rule: 'ХИЩНИКИ СТОЛБА НЕ ГОЛОДАЮТ никогда',
    curse: 'Столб господ: ТРАВОЯДНЫМ и ПАДАЛЬЩИКАМ вход ЗАПРЕЩЁН (уже стоящие уничтожаются)',
    lore: 'Носит не тот, кого охраняют. Носит тот, кого боятся соседи. Мелочь он не терпит.' },
  { id: 'rw_crown',  faction: 'beast', kind: 'kcap',    rarity: 5, icon: '🐾',
    name: 'Корона Зверя',
    rule: 'ТРОФЕИ СТОЛБА кормят БЕЗ ПРЕДЕЛА — рост от убийств не останавливается',
    curse: 'Корона держит арену голодной: ТРАВОЯДНЫЕ столба НЕ ПАСУТСЯ вовсе',
    lore: 'Корона не делает тебя королём. Она делает всех остальных — обедами. Но обеды должны прийти сами.' },
  { id: 'rw_bone',   faction: 'beast', kind: 'hungerFlip', rarity: 5, icon: '🍖',
    name: 'Кость Голода',
    rule: 'ГОЛОД ДЕЛАЕТ ЗЛЕЕ: голодный хищник столба КУСАЕТ БОЛЬНЕЕ (×1.5) и НЕ СЛАБЕЕТ',
    curse: 'Сытость — слабость: сытые хищники столба дают НА 25% МЕНЬШЕ',
    lore: 'Отметины зубов всех поколений. Голодные грызут злее сытых — сытым здесь не место.' },

  /* ---------------- ДЕМОНЫ: печати, монеты, венцы ---------------- */
  { id: 'rd_pent',   faction: 'demon', kind: 'chaos',   rarity: 3, icon: '✟',
    name: 'Пентакль Алчности',
    rule: 'ВЗРЫВЫ ДЕМОНОВ СТОЛБА — ТОЛЬКО БАФФЫ',
    curse: 'Пентакль жаден до жара: угли демонов столба копятся ВДВОЕ МЕДЛЕННЕЕ',
    lore: 'Контракт подписан кровью. Пункт 13: неудобий не предусмотрено. Пункт 14: спешка оплачивается.' },
  { id: 'rd_coin',   faction: 'demon', kind: 'coin',    rarity: 3, icon: '🪙',
    name: 'Обол Ада',
    rule: 'ВЗРЫВ В СТОЛБЕ ПОДЖИГАЕТ СОСЕДА (+2 угля) — огонь не гаснет сам',
    curse: 'Долг возвращается: при каждом взрыве демон столба ТЕРЯЕТ накопленный ХАОС',
    lore: 'Плата лодочнику ходит по кругу. Долг всегда находит следующего — и забирает своё.' },
  { id: 'rd_chain',  faction: 'demon', kind: 'march',   rarity: 4, icon: '⛓',
    name: 'Кандалы Легиона',
    rule: 'ДЕМОНЫ СТОЛБА копят угли ДАЖЕ В ОДИНОЧЕСТВЕ — толпа не нужна',
    curse: 'Кандалы одинокого позора: демон столба без соседей-демонов даёт НА 30% МЕНЬШЕ',
    lore: 'Легион шагает в ногу. Даже когда шагает один — но один шаг всегда короче.' },
  { id: 'rd_mask',   faction: 'demon', kind: 'face',    rarity: 4, icon: '😈',
    name: 'Личина Легиона',
    rule: 'ВЗРЫВЫ СТОЛБА НЕ ПЕРЕГРЕВАЮТСЯ. Никогда.',
    curse: 'Под маской нет лиц: ПРЕВРАЩЕНИЯ в столбе невозможны — только тихий бафф ×1.05',
    lore: 'Взгляд под личину выдержал один демон. Второго лица у него больше не было.' },
  { id: 'rd_rift',   faction: 'demon', kind: 'rift',    rarity: 5, icon: '🕳',
    name: 'Разлом Ада',
    rule: 'ПОСЛЕ ВЗРЫВА демон столба просыпается УЖЕ РАСКАЛЁННЫМ (2 угля)',
    curse: 'Разлом вытягивает силу: каждый взрыв — НАВСЕГДА −5% дохода демону столба (до −50%)',
    lore: 'Оттуда дует. Демоны говорят «сквозняк». Демоны врут: это оно пьёт их жар.' },
  { id: 'rd_crown',  faction: 'demon', kind: 'crownD',  rarity: 5, icon: '👑',
    name: 'Венец Владыки Роя',
    rule: 'КАЖДЫЙ ВЗРЫВ НА ПОЛЕ подкидывает уголёк демонам столба',
    curse: 'Рой нетерпелив: демоны столба ВЗРЫВАЮТСЯ уже на 4 углях — чаще и рискованнее',
    lore: 'Рой не нуждается в короле. Рой просто не умеет ждать.' },

  /* ---------------- ПРОКЛЯТЫЕ АРТЕФАКТЫ (по одному на фракцию) ---------------- */
  { id: 'rx_banner', faction: 'undead', kind: 'legion',  rarity: 4, icon: '🏴',
    name: 'Штандарт Легиона',
    rule: 'БОНУС АРМИИ нежити растёт ДАЛЬШЕ СВОЕГО ПРЕДЕЛА (×2 → ×2.6)',
    curse: 'Штандарт требует строя: нежить ВНЕ крупнейшей армии даёт НА 20% МЕНЬШЕ',
    lore: 'Под ним шли в атаку все, кто уже умер. Дважды. Отставших знамя не признаёт.' },
  { id: 'rx_censer', faction: 'cultist', kind: 'rform', rarity: 4, icon: '🪔',
    name: 'Кадило Успокоения',
    rule: 'ФОРМАЦИИ СРАСТАЮТСЯ БЕЗ ПРЕДЕЛА — множители складываются свободно',
    curse: 'Дым ровняет всех: СТАКИ больше не усиливают вклад в ритуал',
    lore: 'Дым помнит слова утешения для тех, кто остался за кругом. И стирает различия.' },
  { id: 'rx_horn',   faction: 'beast',  kind: 'savage',  rarity: 4, icon: '📯',
    name: 'Рог Бешенства',
    rule: 'УКУСЫ ХИЩНИКОВ СТОЛБА много больнее (×1.5)',
    curse: 'Бешенство жжёт своих: каждый укус РАНИТ самого хищника столба (−5% макс. HP)',
    lore: 'Один вдох — и лес перестаёт быть домом. Он становится войной, где режут всех.' },
  { id: 'rx_heart',  faction: 'demon',  kind: 'forge',   rarity: 4, icon: '🫀',
    name: 'Сердце Вулкана',
    rule: 'ДЕМОНЫ СТОЛБА ТЛЕЮТ ЖАРЧЕ — угли копятся охотнее (+1 за тик)',
    curse: 'Вулкан не прощает: шанс ПЕРЕГРЕВА при взрыве у демонов столба ВТРОЕ ВЫШЕ',
    lore: 'Оно не бьётся — оно качает магму. Держите крепче. Или не держите вовсе.' }
];

const RELIC_RARITY_COLOR = r => r === 3 ? '#7080a0' : r === 4 ? '#a070b0' : '#d4b050';

/* --- Состояние: владение + расстановка — ОБА в забеге (v1.2.5):
   реликвии не переживают смену Эпохи — расходник забега --- */
let RELICS_OWNED = new Set();   // run: собранные реликвии
let relicSlots = {};            // run: {colIndex(абсолютный 0..8): relicId}
let relicPity = 0;              // run: круток без реликвии (гарантия за 18)

const RELIC_SLOT_EPOCH = 2;     // слоты столбов открываются на Эпохе 2
const RELIC_DROP_EPOCH = 2;     // и из гачи падают с Эпохи 2
const RELIC_DROP_CHANCE = 0.05; // 5% за крутку
const RELIC_PITY_MAX = 18;      // гарантия: не дольше 18 круток без реликвии
const RELIC_TIER_W = { 3: 65, 4: 28, 5: 7 };

/* --- ДВИЖОК ЗАКОНОВ И КАР (v1.4.0): по столбам, читается economy.js /
   faction_mechanics.js. Бафф — флаги правил; кара — флаги pain.
   Триггеры (стопка, взрыв, голод, стопки) проверяются в момент расчёта. --- */
const RELIC_KIND_ENGINE = {
  /* НЕЖИТЬ — законы и кары затухания, Хора и столба */
  nail:    { nailHold: 1, nailPain: 1 },   // стопка ×3 → звенья не затухают; без неё — затухают вдвое жёстче
  skull:   { firstHold: 2, skullDeath: 1 },// первые 2 звена пары держатся; третьи и далее — МЕРТВЫ
  stone:   { slowfade: 1, chorSorrow: 1 }, // затухание пар столба не углубляется; карты без звеньев −50%
  urn:     { stackHold: 1, urnGreed: 1 },  // звено у стопки не затухает; стопки +30%, одиночки −50%
  heart:   { revive: 1, heartDrain: 1 },   // повторы не глушат звено столба; вне столба затухание вдвое жёстче
  sun:     { crownLord: 1, banCrown: 1 },  // Корона Тлена: u5/u8/u10 ×2; запрет остальных карт в столб
  legion:  { armyCap: 1, bannerDiscipline: 1 }, // Армия ×2.6; вне крупнейшей армии −20%
  /* КУЛЬТИСТЫ — законы и кары ритуала (глобальные, через ritualRuleMods) */
  rcap:    { rcap: 1, rcEye: 1 },          // потолок скорости 21; внешний круг глух
  rkeep:   { rkeep: 1, rcSlow: 1 },        // жар +12%; заряд медленнее на 20%
  rchain:  { rchain: 1, rcNoForm: 1 },     // вклад без насыщения; формации не ускоряют
  router:  { router: 1, rcNoRetain: 1 },   // внешний круг без предела; хранители жара не хранят
  rpaycap: { rpaycap: 1, rcAmpHalf: 1 },   // потолок выплаты ×7; усилители дают вдвое меньше
  rfirst:  { rfirst: 1, rcPost3: 1 },      // первые 3 ритуала ×2; после третьего — ×0.5
  rform:   { rform: 1, rcFlat: 1 },        // формации без предела; стаки не усиливают вклад
  /* ЗВЕРИ — законы и кары пищевой цепи */
  fang:    { fang: 1, fangTax: 1 },        // добыча кормит стаю; укусы столба вдвое слабее
  range:   { range: 1, rangeFat: 1, banPred: 1 }, // выпас через клетку + вдвое сытее; хищникам вход воспрещён
  bough:   { bough: 1, boughLazy: 1 },     // флора усмиряет голод; баффы убийств столба вдвое меньше
  apex:    { apex: 1, banPrey: 1 },        // не голодают; травоядным и падальщикам вход воспрещён
  kcap:    { kcap: 1, kcapFamine: 1 },     // трофеи без предела; травоядные столба не пасутся
  hungerFlip: { hungerFlip: 1, hungerSated: 1 }, // голодный кусает больнее; сытые −25%
  savage:  { savage: 1, savagePain: 1 },   // укусы больнее; каждый укус ранит хищника
  /* ДЕМОНЫ — законы и кары Хаоса */
  chaos:   { chaosLock: 1, chaosSlow: 1 }, // взрывы — только баффы; угли вдвое медленнее
  coin:    { coin: 1, coinDebt: 1 },       // взрыв поджигает соседа; взрыв сбрасывает ХАОС
  march:   { march: 1, marchLoner: 1 },    // угли без толпы; одиночка −30%
  face:    { face: 1, faceNoMut: 1 },      // нет перегрева; нет превращений
  rift:    { rift: 1, riftDrain: 1 },      // просыпается раскалённым; −5% дохода за каждый взрыв
  crownD:  { crownD: 1, crownDImpatient: 1 }, // чужие взрывы кормят; взрыв на 4 углях
  forge:   { forge: 1, forgeRisky: 1 }     // угли охотнее; перегрев втрое вероятнее
};
/* Кэш: столбец -> движок закона реликвии (культ-реликвии сюда НЕ попадают) */
let RELIC_COL_ENGINE = {};
function rebuildRelicEngine() {
  RELIC_COL_ENGINE = {};
  if (epoch < RELIC_SLOT_EPOCH) return;
  const put = (c, eng) => {
    if (c < 0 || c >= GRID_SIZE) return;
    /* своё правило в столбе не перебивается чужим благословением */
    if (RELIC_COL_ENGINE[c] && RELIC_COL_ENGINE[c]._own) return;
    RELIC_COL_ENGINE[c] = eng;
  };
  for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r || r.faction === 'cultist' || !RELIC_KIND_ENGINE[r.kind]) continue;
    const eng = Object.assign({ _own: 1 }, RELIC_KIND_ENGINE[r.kind]);
    RELIC_COL_ENGINE[+k] = eng;
    /* v1.3.0 ОСВЯЩЕНИЕ: благословённый ЗАКОН распространяется на соседние
       столбы (правило шире, а не «число больше»). Соседям — только если
       у них нет собственного закона. v1.4.0: кары тоже распространяются. */
    if (blessedRelics.has(r.id)) {
      const spread = Object.assign({}, RELIC_KIND_ENGINE[r.kind], { _spread: 1 });
      put(+k - 1, spread); put(+k + 1, spread);
    }
  }
}
function colEngine(c) { return RELIC_COL_ENGINE[c] || null; }

/* ================= ЗАПРЕТЫ СТОЛБОВ (v1.4.0 «Закон и Кара») =================
   «Корона Тлена» и другие кары-запреты: в столб нельзя ставить
   перечисленные карты, уже стоящие — УНИЧТОЖАЮТСЯ (навсегда, не
   возвращаются в коллекцию). Запрет читается из движка столба,
   поэтому Освящение распространяет и его. */
function cardAllowedInCol(cardId, col) {
  if (epoch < RELIC_SLOT_EPOCH) return true;
  const eng = RELIC_COL_ENGINE[col];
  if (!eng) return true;
  if (eng.banCrown) {
    /* «Корона Тлена»: только Некромант, Лич, Владыка Тлена и здания */
    if (cardId === 'u5' || cardId === 'u8' || cardId === 'u10') return true;
    if (CARDS[cardId] && CARDS[cardId].isBuilding) return true;
    return false;
  }
  const card = CARDS[cardId];
  if (!card) return true;
  if (eng.banPred && card.diet === 'pred') return false;      /* «Мшистый Тотем»: хищникам вход запрещён */
  if (eng.banPrey && (card.diet === 'herb' || card.diet === 'scav')) return false; /* «Ошейник Господства» */
  return true;
}
function banRelicAtCol(c) {
  if (epoch < RELIC_SLOT_EPOCH) return null;
  const eng = RELIC_COL_ENGINE[c];
  if (!eng) return null;
  if (eng.banCrown || eng.banPred || eng.banPrey) return relicAtCol(c);
  return null;
}
/* Изгнание запрещённых карт из столбов с карой-запретом.
   silent=true — без эффектов (служебный прогрев движка). */
function enforceRelicBans(silent) {
  if (epoch < RELIC_SLOT_EPOCH) return 0;
  rebuildRelicEngine();
  let destroyed = 0;
  for (const k in relicSlots) {
    const c = +k;
    for (let r = 0; r < GRID_SIZE; r++) {
      const it = grid[r][c]; if (!it) continue;
      if (cardAllowedInCol(it.cardId, c)) continue;
      const card = CARDS[it.cardId];
      const rel = relicAtCol(c);
      grid[r][c] = null;
      destroyed++; stats.deleted = (stats.deleted || 0) + 1;
      if (!silent) {
        fxAtCell(r, c, ['#ff5030', '#802020', '#ffd34d'], 16, 'big');
        fxFloatFromCell(r, c, 'ИЗГНАНА ИЗ СТОЛБА', '#ff6050');
        toast(rel.icon + ' <b>КАРА СТОЛБА:</b> «' + card.name + '» уничтожена — «' + rel.name + '» её не терпит', 'relicban', 8);
      }
    }
  }
  if (destroyed) { computeIncome(); renderGrid(); renderCollection(); updateHUD(); saveRun(); }
  return destroyed;
}
/* Тихий тик кары: раз в 0.5с — ловит карты, ПОСТАВЛЕННЫЕ/ПЕРЕМЕЩЁННЫЕ в столб */
let relicBanSweepT = 0;
function tickRelicBans(dt) {
  relicBanSweepT += dt;
  if (relicBanSweepT < 0.5) return;
  relicBanSweepT = 0;
  enforceRelicBans(false);
}

/* ================= ОСВЯЩЕНИЕ РЕЛИКВИЙ (v1.2.10, смысл v1.3.0) =================
   Автор идеи — иерей Алексий (приоритет директора). Тьма платит свету:
   за кристаллы (МИМО порога Эпохи — оплата, а не доход) полученная реликвия
   получает благословение: её ЗАКОН (и КАРА) распространяется на соседние
   столбы (для законов ритуала — закон усиливается). Не больше 3 за забег.
   Благословение живёт до конца Эпохи (вместе с реликвией). */
function blessCost() { return Math.max(5000, Math.round(calculateIncome() * 60)); }
function isBlessed(id) { return blessedRelics.has(id); }
function blessRelic(id) {
  const r = relicById(id);
  if (!r || !hasRelic(id)) { toast('🕯 Освящать можно только полученную реликвию'); return; }
  if (blessedRelics.has(id)) { toast('🕯 «' + r.name + '» уже освящена'); return; }
  if (blessedRelics.size >= BLESS_MAX) { toast('🕯 За забег можно осветить не больше ' + BLESS_MAX + ' реликвий'); return; }
  const cost = blessCost();
  if (crystals < cost) { toast('🕯 Не хватает 💎: Освящение стоит ' + fmtShort(cost)); return; }
  crystals -= cost;
  blessedRelics.add(id);
  computeIncome(); saveRun();
  enforceRelicBans(false); /* благословённая кара распространяется немедленно */
  /* Сцена: золотая вспышка + перезвон */
  fxConfetti(36); fxShockwave(window.innerWidth / 2, Math.min(260, window.innerHeight / 3), '#d4b050');
  sfx('milestone');
  toast('🕯 <b>ОСВЯЩЕНИЕ:</b> «' + r.name + '» — закон и кара распространяются ШИРЕ' +
    (r.faction === 'cultist' ? ' (закон ритуала усилен)' : ' (на соседние столбы)') +
    ' <small>(' + blessedRelics.size + '/' + BLESS_MAX + ' за забег)</small>');
  fxFloat(window.innerWidth / 2, window.innerHeight / 3, '🕯 ОСВЯЩЕНИЕ', '#ffe9b0', 20);
  updateHUD(); checkAchievements();
}

/* ГЛОБАЛЬНЫЕ ЗАКОНЫ И КАРЫ РИТУАЛА (культисты): столб не важен.
   v1.4.0: к каждой молитве — расплата (поля pain читает computeRitualEngine). */
function ritualRuleMods() {
  const m = { capSpeed: 15, capPay: 4, keep: 0, firstN: 1, noSatur: 0, outerFree: 0, formFree: 0,
    outerDead: 0, rcSlow: 0, rcNoForm: 0, rcNoRetain: 0, rcAmpHalf: 0, rcPost3: 0, rcFlat: 0 };
  if (epoch < RELIC_SLOT_EPOCH) return m;
  for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r || r.faction !== 'cultist') continue;
    const b = blessedRelics.has(r.id) ? BLESS_MULT : 1;
    switch (r.kind) {
      case 'rcap':    m.capSpeed = Math.round(21 * b); m.outerDead = 1; break;  // потолок 15 → 21 (освящ. 25); кара: внешний круг глух
      case 'rpaycap': m.capPay = Math.round(7 * b); m.rcAmpHalf = 1; break;     // потолок ×4 → ×7 (освящ. ×8); кара: усилители вдвое слабее
      case 'rkeep':   m.keep = Math.round(12 * b); m.rcSlow = 1; break;         // жар +12%; кара: заряд −20%
      case 'rfirst':  m.firstN = Math.max(m.firstN, b > 1 ? 4 : 3); m.rcPost3 = 1; break; // 1-3-й ×2 (освящ. 1-4); кара: после третьего ×0.5
      case 'rchain':  m.noSatur = 1; m.rcNoForm = 1; break;                     // вклад без насыщения; кара: формации мертвы
      case 'router':  m.outerFree = 1; m.rcNoRetain = 1; break;                 // внешний круг без предела; кара: жар не хранится
      case 'rform':   m.formFree = 1; m.rcFlat = 1; break;                      // формации без предела; кара: стаки не усиливают
    }
  }
  return m;
}

function hasRelic(id) { return RELICS_OWNED.has(id); }
function relicById(id) { return RELICS.find(r => r.id === id); }
function relicAtCol(c) { return relicSlots[c] ? relicById(relicSlots[c]) : null; }
/* Реликвии, свободные и пригодные для ТЕКУЩЕЙ фракции */
function unassignedRelics() {
  const used = {};
  Object.keys(relicSlots).forEach(c => used[relicSlots[c]] = 1);
  return RELICS.filter(r => RELICS_OWNED.has(r.id) && !used[r.id] && r.faction === faction).map(r => r.id);
}
function relicsOfFaction(f) { return RELICS.filter(r => r.faction === f); }

/* Выпадение из гачи: шанс 5% + гарантия за 18 круток (только с Э2) */
function relicRollDue() {
  if (epoch < RELIC_DROP_EPOCH) return false;
  return Math.random() < RELIC_DROP_CHANCE || relicPity >= RELIC_PITY_MAX;
}
function rollRelicId() {
  relicPity = 0;
  const tier = weightedPick(RELIC_TIER_W);
  for (let t = tier; t >= 3; t--) {
    const pool = RELICS.filter(r => r.rarity === t && r.faction === faction);
    if (pool.length) return pick(pool).id;
  }
  const any = RELICS.filter(r => r.faction === faction);
  return (any.length ? pick(any) : RELICS[0]).id;
}
/* Выдать реликвию (гача). Дубликат → компенсация 💎 (НЕ в прогресс Эпохи) */
function grantRelic(id, silent) {
  const r = relicById(id); if (!r) return;
  if (RELICS_OWNED.has(id)) {
    const comp = Math.max(1500, Math.round(calculateIncome() * 25));
    crystals += comp; incomeExempt += comp;
    toast(relicArtHTML(r, 'relic-inline-art', '') + ' <b>ДУБЛИКАТ:</b> «' + r.name + '» → компенсация ' + fmtShort(comp) + ' 💎');
    sfx('relic');
    return;
  }
  RELICS_OWNED.add(id);
  saveRun();
  if (!silent) {
    toast(relicArtHTML(r, 'relic-inline-art', '') + ' <b>РЕЛИКВИЯ:</b> «' + r.name + '» — поставьте её в слот столба');
    sfx('relic'); fxConfetti(40);
  }
  updateHUD(); checkAchievements(); renderRelicSlots && renderRelicSlots();
}

/* Подсветка, что реликвия в столбце (для тултипов/рендера) */
function columnEffects(c) {
  const r = relicAtCol(c);
  return r ? { relic: r, col: +c, blessed: blessedRelics.has(r.id) } : null;
}

/* ================= СПРАЙТЫ РЕЛИКВИЙ (assets/relics) ================= */
const RELIC_ART_DIR = 'assets/relics/';
function relicArtHTML(relic, imgCls, fbCls) {
  return '<img class="' + imgCls + '" src="' + RELIC_ART_DIR + relic.id + '.png" alt="" ' +
    'onerror="cardArtFail(this,\'' + (fbCls || '') + '\',\'' + relic.icon + '\')">';
}
