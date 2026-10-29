'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js) — v1.3.0 «Закон Тьмы»
   ПЕРЕРАБОТКА ПО ТЗ: НИКАКИХ ЦИФР И МНОЖИТЕЛЕЙ — ТОЛЬКО ПРАВИЛА.
   Реликвия больше не «+70% к строке» — она ВНОСИТ ЗАКОН в Алтарь:
   меняет правила игры для своего столба (или всего ритуала),
   часто — при активации триггера (стопка, взрыв, голод, смерть).
   Пример: было «Доход столба +70%» → стало «Пока в столбе стоит
   стопка ×3 — звенья столба не затухают».
   РЕЛИКВИИ КУЛЬТИСТОВ — ГЛОБАЛЬНЫЕ ЗАКОНЫ РИТУАЛА: отодвигают
   потолки, снимают насыщение, хранят жар. Столб не важен.
   Спрайты — assets/relics/<id>.png (дарк-фэнтези).
   ============================================================ */

const RELICS = [
  /* ---------------- НЕЖИТЬ: кости, цепи, могилы ---------------- */
  { id: 'rb_nail',   faction: 'undead', kind: 'nail',   rarity: 3, icon: '⚰',
    name: 'Гробовой Гвоздь',
    rule: 'ПОКА В СТОЛБЕ СТОИТ СТОПКА ×3 — звенья столба не затухают',
    lore: 'Забит в крышку каждого саркофага Владыки. Пока помнят тройку — помнят всех.' },
  { id: 'rb_skull',  faction: 'undead', kind: 'skull',  rarity: 3, icon: '💀',
    name: 'Череп Владыки',
    rule: 'Первое звено КАЖДОЙ пары столба не слабеет от повторов',
    lore: 'Он помнит каждое звено каждой цепи. Первая связь — нерушима.' },
  { id: 'rb_stone',  faction: 'undead', kind: 'stone',  rarity: 4, icon: '🪦',
    name: 'Плачущий Камень',
    rule: 'ЗАТУХАНИЕ ПАР СТОЛБА НЕ УГЛУБЛЯЕТСЯ — слабеют лишь раз, дальше держат силу',
    lore: 'Надгробие, с которого сутки течёт вода. Камень впитал слёзы — и больше не отдаст.' },
  { id: 'rb_urn',    faction: 'undead', kind: 'urn',    rarity: 4, icon: '⚱',
    name: 'Урна Владык',
    rule: 'Звено, касающееся СТОПКИ, не затухает никогда',
    lore: 'Прах пяти династий держится друг за друга. Стопка — это семья.' },
  { id: 'rb_heart',  faction: 'undead', kind: 'heart',  rarity: 5, icon: '🖤',
    name: 'Сердце Пустоты',
    rule: 'Повторы НЕ ГЛОШАТ звенья столба до конца — цепь выживает',
    lore: 'Оно не бьётся. Оно ждёт. Поэтому вокруг него всё живёт вечно.' },
  { id: 'rb_crown',  faction: 'undead', kind: 'sun',    rarity: 5, icon: '👑',
    name: 'Корона Тлена',
    rule: 'ЗВЕНЬЯ СТОЛБА НЕ ЗАТУХАЮТ. Никогда. Без условий.',
    lore: 'Ржавая, тяжёлая, вечная. Свет её видят только соседние могилы.' },

  /* ---------------- КУЛЬТИСТЫ: ГЛОБАЛЬНЫЕ ЗАКОНЫ РИТУАЛА ----------------
     Столб не важен — закон действует на весь ритуал Алтаря. */
  { id: 'rc_eye',    faction: 'cultist', kind: 'rcap', rarity: 3, icon: '🔯',
    name: 'Око Ритуала',
    rule: 'ПОТОЛОК СКОРОСТИ заряда отодвигается — ритуал может гореть ярче',
    lore: 'Ритуал видит себя со стороны. Со стороны потолка нет.' },
  { id: 'rc_candle', faction: 'cultist', kind: 'rkeep', rarity: 3, icon: '🕯',
    name: 'Свеча Мученика',
    rule: 'ПОСЛЕ ВЫПЛАТЫ ритуал не остывает — в шкале всегда остаётся жар',
    lore: 'Гаснет ровно тогда, когда догорает молитва. Молитва не догорает.' },
  { id: 'rc_chains', faction: 'cultist', kind: 'rchain', rarity: 4, icon: '⛓',
    name: 'Вериги Пустоты',
    rule: 'Вклад участников СКЛАДЫВАЕТСЯ БЕЗ НАСЫЩЕНИЯ — каждый несёт свой жар',
    lore: 'Самобичевание, доведённое до инженерного совершенства. Усталость — для чужих.' },
  { id: 'rc_mask',   faction: 'cultist', kind: 'router', rarity: 4, icon: '🎭',
    name: 'Многоликая Маска',
    rule: 'СЛУЖИТЕЛИ ВНЕШНЕГО КРУГА работают без предела',
    lore: 'Масок тридцать, и каждая служит. Кругу служителей нет счёта.' },
  { id: 'rc_pupil',  faction: 'cultist', kind: 'rpaycap', rarity: 5, icon: '👁',
    name: 'Зрачок Бездны',
    rule: 'ПОТОЛОК ВЫПЛАТЫ отодвигается — Бездна платит столько, сколько видит',
    lore: 'Смотрит в ответ. В его взгляде нет потолка.' },
  { id: 'rc_chalice', faction: 'cultist', kind: 'rfirst', rarity: 5, icon: '🍷',
    name: 'Кровавая Чаша',
    rule: 'ДВОЙНАЯ ВЫПЛАТА касается НЕ ТОЛЬКО первого ритуала — первые просыплены кровью',
    lore: 'Наполняется сама. Первые глотки — всегда за счёт Тьмы.' },

  /* ---------------- ЗВЕРИ: клыки, тотемы, рога ---------------- */
  { id: 'rw_fang',   faction: 'beast', kind: 'fang',    rarity: 3, icon: '🦷',
    name: 'Клык Альфы',
    rule: 'СОЖРАННОЕ В СТОЛБЕ кормит ВСЮ СТАЮ: убийца делится трапезой со всеми хищниками поля',
    lore: 'Вырван в честном бою за право называться обедом кого-то ещё. Альфа ест первым — но не один.' },
  { id: 'rw_totem',  faction: 'beast', kind: 'range',   rarity: 3, icon: '🗿',
    name: 'Мшистый Тотем',
    rule: 'ТРАВОЯДНЫЕ СТОЛБА находят флору ЧЕРЕЗ КЛЕТКУ',
    lore: 'Лес ставит их сам. Тропы от тотема помнят все пастбища.' },
  { id: 'rw_bough',  faction: 'beast', kind: 'bough',   rarity: 4, icon: '🌿',
    name: 'Ветвь Древеня',
    rule: 'ФЛОРА СТОЛБА усмиряет голод: хищники рядом с ней НЕ ГОЛОДАЮТ',
    lore: 'Отломил — посади. Лес всё видит, лес всех сытит.' },
  { id: 'rw_collar', faction: 'beast', kind: 'apex',    rarity: 4, icon: '🥷',
    name: 'Ошейник Господства',
    rule: 'ХИЩНИКИ СТОЛБА НЕ ГОЛОДАЮТ',
    lore: 'Носит не тот, кого охраняют. Носит тот, кого боятся соседи.' },
  { id: 'rw_crown',  faction: 'beast', kind: 'kcap',    rarity: 5, icon: '🐾',
    name: 'Корона Зверя',
    rule: 'ТРОФЕИ СТОЛБА кормят БЕЗ ПРЕДЕЛА — рост от убийств не останавливается',
    lore: 'Корона не делает тебя королём. Она делает всех остальных — обедами. Бесконечными.' },
  { id: 'rw_bone',   faction: 'beast', kind: 'hungerFlip', rarity: 5, icon: '🍖',
    name: 'Кость Голода',
    rule: 'ГОЛОД ДЕЛАЕТ ЗЛЕЕ: голодный хищник столба КУСАЕТ БОЛЬНЕЕ и не слабеет',
    lore: 'Отметины зубов всех поколений. Голодные грызут злее сытых.' },

  /* ---------------- ДЕМОНЫ: печати, монеты, венцы ---------------- */
  { id: 'rd_pent',   faction: 'demon', kind: 'chaos',   rarity: 3, icon: '✟',
    name: 'Пентакль Алчности',
    rule: 'ВЗРЫВЫ ДЕМОНОВ СТОЛБА — ТОЛЬКО БАФФЫ',
    lore: 'Контракт подписан кровью. Пункт 13: неудобий не предусмотрено.' },
  { id: 'rd_coin',   faction: 'demon', kind: 'coin',    rarity: 3, icon: '🪙',
    name: 'Обол Ада',
    rule: 'ВЗРЫВ В СТОЛБЕ ПОДЖИГАЕТ СОСЕДА — огонь не гаснет сам',
    lore: 'Плата лодочнику ходит по кругу. Долг всегда находит следующего.' },
  { id: 'rd_chain',  faction: 'demon', kind: 'march',   rarity: 4, icon: '⛓',
    name: 'Кандалы Легиона',
    rule: 'ДЕМОНЫ СТОЛБА копят угли ДАЖЕ В ОДИНОЧЕСТВЕ — толпа не нужна',
    lore: 'Легион шагает в ногу. Даже когда шагает один.' },
  { id: 'rd_mask',   faction: 'demon', kind: 'face',    rarity: 4, icon: '😈',
    name: 'Личина Легиона',
    rule: 'ВЗРЫВЫ СТОЛБА НЕ ПЕРЕГРЕВАЮТСЯ. Никогда.',
    lore: 'Взгляд под личину выдержал один демон. Жар остался внутри.' },
  { id: 'rd_rift',   faction: 'demon', kind: 'rift',    rarity: 5, icon: '🕳',
    name: 'Разлом Ада',
    rule: 'ПОСЛЕ ВЗРЫВА демон столба просыпается УЖЕ РАСКАЛЁННЫМ',
    lore: 'Оттуда дует. Демоны говорят «сквозняк». Демоны врут.' },
  { id: 'rd_crown',  faction: 'demon', kind: 'crownD',  rarity: 5, icon: '👑',
    name: 'Венец Владыки Роя',
    rule: 'КАЖДЫЙ ВЗРЫВ НА ПОЛЕ подкидывает уголёк демонам столба',
    lore: 'Рой не нуждается в короле. Рой просто делит с ним каждый пожар.' },

  /* ---------------- ПРОКЛЯТЫЕ АРТЕФАКТЫ (по одному на фракцию) ---------------- */
  { id: 'rx_banner', faction: 'undead', kind: 'legion',  rarity: 4, icon: '🏴',
    name: 'Штандарт Легиона',
    rule: 'БОНУС АРМИИ нежити растёт ДАЛЬШЕ СВОЕГО ПРЕДЕЛА',
    lore: 'Под ним шли в атаку все, кто уже умер. Дважды.' },
  { id: 'rx_censer', faction: 'cultist', kind: 'rform', rarity: 4, icon: '🪔',
    name: 'Кадило Успокоения',
    rule: 'ФОРМАЦИИ СРАСТАЮТСЯ БЕЗ ПРЕДЕЛА — множители складываются свободно',
    lore: 'Дым помнит слова утешения для тех, кто остался за кругом.' },
  { id: 'rx_horn',   faction: 'beast',  kind: 'savage',  rarity: 4, icon: '📯',
    name: 'Рог Бешенства',
    rule: 'УКУСЫ ХИЩНИКОВ СТОЛБА много больнее',
    lore: 'Один вдох — и лес перестаёт быть домом. Он становится войной.' },
  { id: 'rx_heart',  faction: 'demon',  kind: 'forge',   rarity: 4, icon: '🫀',
    name: 'Сердце Вулкана',
    rule: 'ДЕМОНЫ СТОЛБА ТЛЕЮТ ЖАРЧЕ — угли копятся охотнее',
    lore: 'Оно не бьётся — оно качает магму. Держите крепче.' }
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

/* --- ДВИЖОК ЗАКОНОВ (v1.3.0): по столбам, читается economy.js / faction_mechanics.js.
   Ни одного множителя дохода — только флаги правил. Триггеры
   (стопка, взрыв, голод, стопки) проверяются в момент расчёта/тика. --- */
const RELIC_KIND_ENGINE = {
  /* НЕЖИТЬ — законы затухания (v1.3.1: Хор разнообразия убран из игры) */
  nail:    { nailHold: 1 },     // триггер: стопка ×3 в столбе → звенья не затухают
  skull:   { firstHold: 1 },    // первое звено каждой пары столба держится
  stone:   { slowfade: 1 },     // затухание пар столба не углубляется (макс — 1 шаг)
  urn:     { stackHold: 1 },    // звено у стопки не затухает
  heart:   { revive: 1 },       // повторы не глушат звено до конца
  sun:     { noDecay: 1 },      // безусловное не-затухание
  legion:  { armyCap: 1 },      // Армия растёт дальше предела
  /* КУЛЬТИСТЫ — законы ритуала (глобальные, через ritualRuleMods) */
  rcap:    { rcap: 1 },         // потолок скорости выше
  rkeep:   { rkeep: 1 },        // ритуал хранит жар после выплаты
  rchain:  { rchain: 1 },       // вклад без насыщения
  router:  { router: 1 },       // внешний круг без предела
  rpaycap: { rpaycap: 1 },      // потолок выплаты выше
  rfirst:  { rfirst: 1 },       // первые ритуалы — двойная плата
  rform:   { rform: 1 },        // формации без предела
  /* ЗВЕРИ — законы пищевой цепи */
  fang:    { fang: 1 },         // добыча из столба кормит всю стаю
  range:   { range: 1 },        // выпас через клетку
  bough:   { bough: 1 },        // флора столба усмиряет голод
  apex:    { apex: 1 },         // не голодают
  kcap:    { kcap: 1 },         // трофеи без предела
  hungerFlip: { hungerFlip: 1 },// голодный кусает больнее
  savage:  { savage: 1 },       // укусы больнее
  /* ДЕМОНЫ — законы Хаоса */
  chaos:   { chaosLock: 1 },    // взрывы — только баффы
  coin:    { coin: 1 },         // взрыв поджигает соседа
  march:   { march: 1 },        // угли без толпы
  face:    { face: 1 },         // нет перегрева
  rift:    { rift: 1 },         // просыпается раскалённым
  crownD:  { crownD: 1 },       // чужие взрывы кормят
  forge:   { forge: 1 }         // угли охотнее
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
       у них нет собственного закона. */
    if (blessedRelics.has(r.id)) {
      const spread = Object.assign({}, RELIC_KIND_ENGINE[r.kind], { _spread: 1 });
      put(+k - 1, spread); put(+k + 1, spread);
    }
  }
}
function colEngine(c) { return RELIC_COL_ENGINE[c] || null; }

/* ================= ОСВЯЩЕНИЕ РЕЛИКВИЙ (v1.2.10, смысл v1.3.0) =================
   Автор идеи — иерей Алексий (приоритет директора). Тьма платит свету:
   за кристаллы (МИМО порога Эпохи — оплата, а не доход) полученная реликвия
   получает благословение: её ЗАКОН распространяется на соседние столбы
   (для законов ритуала — закон усиливается). Не больше 3 за забег.
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
  /* Сцена: золотая вспышка + перезвон */
  fxConfetti(36); fxShockwave(window.innerWidth / 2, Math.min(260, window.innerHeight / 3), '#d4b050');
  sfx('milestone');
  toast('🕯 <b>ОСВЯЩЕНИЕ:</b> «' + r.name + '» — закон распространяется ШИРЕ' +
    (r.faction === 'cultist' ? ' (закон ритуала усилен)' : ' (на соседние столбы)') +
    ' <small>(' + blessedRelics.size + '/' + BLESS_MAX + ' за забег)</small>');
  fxFloat(window.innerWidth / 2, window.innerHeight / 3, '🕯 ОСВЯЩЕНИЕ', '#ffe9b0', 20);
  updateHUD(); checkAchievements();
}

/* ГЛОБАЛЬНЫЕ ЗАКОНЫ РИТУАЛА (культисты): столб не важен.
   v1.3.0: вместо множителей — флаги правил. Освящённый закон
   ритуала усиливается (параметр растёт на шаг внутри движка). */
function ritualRuleMods() {
  const m = { capSpeed: 15, capPay: 4, keep: 0, firstN: 1, noSatur: 0, outerFree: 0, formFree: 0 };
  if (epoch < RELIC_SLOT_EPOCH) return m;
  for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (!r || r.faction !== 'cultist') continue;
    const b = blessedRelics.has(r.id) ? BLESS_MULT : 1;
    switch (r.kind) {
      case 'rcap':    m.capSpeed = Math.round(21 * b); break;   // потолок скорости: 15 → 21 (освящ. 25)
      case 'rpaycap': m.capPay = Math.round(7 * b); break;      // потолок выплаты: ×4 → ×7 (освящ. ×8)
      case 'rkeep':   m.keep = Math.round(12 * b); break;       // гарантированный жар: +12% (освящ. +14%)
      case 'rfirst':  m.firstN = Math.max(m.firstN, b > 1 ? 4 : 3); break; // двойная плата: 1-й → 1-3-й ритуал (освящ. 1-4-й)
      case 'rchain':  m.noSatur = 1; break;
      case 'router':  m.outerFree = 1; break;
      case 'rform':   m.formFree = 1; break;
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
