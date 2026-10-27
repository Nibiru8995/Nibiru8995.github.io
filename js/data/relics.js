'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js) — РЕЛИКВИИ 3.0 (фидбек 8-9)
   Реликвия — артефакт из гачи (с Э2), ставится в СЛОТ СТОЛБЦА.
   ФИДБЕК 8: у КАЖДОЙ фракции — СВОЙ набор из 6 реликвий, и баффы
   часто СЛАБЕЕ дебаффов: артефакт требует умной расстановки
   (усильте свой столбец, а цену пусть платят пустые соседи).
   Спрайты — assets/relics/<id>.png (дарк-фэнтези, фолбэк — эмодзи).
   Эффекты работают только у реликвий ТЕКУЩЕЙ фракции (слоты
   сбрасываются при переходе Эпохи, набор фракционный).
   Новую реликвию добавляем ТОЛЬКО в этот список.
   ============================================================ */

const RELICS = [
  /* ---------------- НЕЖИТЬ: кости, цепи, могилы ---------------- */
  { id: 'rb_nail',   faction: 'undead', kind: 'col',    rarity: 3, icon: '⚰',
    name: 'Гробовой Гвоздь',
    buff: '+50% дохода столбца',
    debuff: '−20% дохода ДВУМ соседним столбцам',
    lore: 'Забит в крышку каждого саркофага Владыки. Соседи платят за тишину.' },
  { id: 'rb_skull',  faction: 'undead', kind: 'chain',  rarity: 3, icon: '💀',
    name: 'Череп Владыки',
    buff: 'Звенья столбца не затухают (×1.0)',
    debuff: '−25% дохода самого столбца',
    lore: 'Он помнит каждое звено каждой цепи. Цепи держатся — кости скрипят.' },
  { id: 'rb_stone',  faction: 'undead', kind: 'chor',   rarity: 4, icon: '🪦',
    name: 'Плачущий Камень',
    buff: 'Пары столбца дают двойной вклад в Хор',
    debuff: '−30% дохода самого столбца',
    lore: 'Надгробие, с которого сутки текёт вода. Никто не видел, чтобы кто-то плакал.' },
  { id: 'rb_urn',    faction: 'undead', kind: 'titan',  rarity: 4, icon: '⚱',
    name: 'Урна Владык',
    buff: '+120% дохода столбца',
    debuff: 'Затухание повторов в столбце вдвое жёстче (фактор²)',
    lore: 'Прах пяти династий. Мощь велика, но повторять династии не советуем.' },
  { id: 'rb_heart',  faction: 'undead', kind: 'voidr',  rarity: 5, icon: '🖤',
    name: 'Сердце Пустоты',
    buff: 'Доход столбца ×2.5',
    debuff: 'Пары столбца ВЫПАДАЮТ из Хора (нет бонуса за разнообразие)',
    lore: 'Оно не бьётся. Оно ждёт. Песни вокруг него замолкают.' },
  { id: 'rb_crown',  faction: 'undead', kind: 'sun',    rarity: 5, icon: '👑',
    name: 'Корона Тлена',
    buff: 'Доход столбца ×2 и звенья без затухания',
    debuff: '−35% дохода ДВУМ соседним столбцам',
    lore: 'Ржавая, тяжёлая, вечная. Свет её видят только соседние могилы.' },

  /* ---------------- КУЛЬТИСТЫ: глаза, свечи, хоры ---------------- */
  { id: 'rc_eye',    faction: 'cultist', kind: 'form',   rarity: 3, icon: '🔯',
    name: 'Око Ритуала',
    buff: 'Члены формаций в столбце: +0.5 к множителю ритуала',
    debuff: '−25% дохода самого столбца',
    lore: 'Ритуал видит себя со стороны. Со стороны он страшнее.' },
  { id: 'rc_candle', faction: 'cultist', kind: 'col',    rarity: 3, icon: '🕯',
    name: 'Свеча Мученика',
    buff: '+50% дохода столбца',
    debuff: '−20% дохода ДВУМ соседним столбцам',
    lore: 'Горит ровно столько, сколько осталось молиться. Не спрашивайте.' },
  { id: 'rc_chains', faction: 'cultist', kind: 'chain',  rarity: 4, icon: '⛓',
    name: 'Вериги Пустоты',
    buff: 'Звенья столбца не затухают (×1.0)',
    debuff: '−25% дохода самого столбца',
    lore: 'Самобичевание, доведённое до инженерного совершенства.' },
  { id: 'rc_mask',   faction: 'cultist', kind: 'chor',   rarity: 4, icon: '🎭',
    name: 'Личина Хора',
    buff: 'Пары столбца дают двойной вклад в Хор',
    debuff: '−30% дохода самого столбца',
    lore: 'Масок тридцать, голос один. Поют всегда вразнобой, но громко.' },
  { id: 'rc_pupil',  faction: 'cultist', kind: 'voidr',  rarity: 5, icon: '👁',
    name: 'Зрачок Бездны',
    buff: 'Доход столбца ×2.5',
    debuff: 'Пары столбца ВЫПАДАЮТ из Хора (нет бонуса за разнообразие)',
    lore: 'Смотрит в ответ. Хору вокруг него не поётся.' },
  { id: 'rc_chalice', faction: 'cultist', kind: 'titan', rarity: 5, icon: '🍷',
    name: 'Кровавая Чаша',
    buff: '+150% дохода столбца',
    debuff: 'Затухание повторов в столбце вдвое жёстче (фактор²)',
    lore: 'Наполняется сама. Это не радует никого, кто понимает, из чего.' },

  /* ---------------- ЗВЕРИ: клыки, тотемы, рога ---------------- */
  { id: 'rw_fang',   faction: 'beast', kind: 'hunt',    rarity: 3, icon: '🦷',
    name: 'Клык Альфы',
    buff: 'Баффы охоты и выпаса карт столбца ×1.5',
    debuff: '−20% дохода самого столбца',
    lore: 'Вырван в честном бою за право называться обедом кого-то ещё.' },
  { id: 'rw_totem',  faction: 'beast', kind: 'col',     rarity: 3, icon: '🗿',
    name: 'Мшистый Тотем',
    buff: '+50% дохода столбца',
    debuff: '−20% дохода ДВУМ соседним столбцам',
    lore: 'Лес ставит их сам. Табличек не вешает, но место помечено.' },
  { id: 'rw_bough',  faction: 'beast', kind: 'fertile', rarity: 4, icon: '🌿',
    name: 'Ветвь Древеня',
    buff: 'ФЛОРА столбца: +100% к баффам кормления и лечения',
    debuff: '−15% дохода самого столбца',
    lore: 'Отломил — посади. Лес всё видит, лес всё помнит.' },
  { id: 'rw_collar', faction: 'beast', kind: 'apex',    rarity: 4, icon: '🥷',
    name: 'Ошейник Господства',
    buff: 'Хищники столбца НЕ ГОЛОДАЮТ',
    debuff: '−25% дохода самого столбца',
    lore: 'Носит не тот, кого охраняют. Носит тот, кого боятся соседи.' },
  { id: 'rw_crown',  faction: 'beast', kind: 'king',    rarity: 5, icon: '🐾',
    name: 'Корона Зверя',
    buff: 'Убийства хищников столбца дают двойной бафф',
    debuff: 'Травоядные столбца: −25% дохода',
    lore: 'Корона не делает тебя королём. Она делает всех остальных — обедами.' },
  { id: 'rw_bone',   faction: 'beast', kind: 'titan',   rarity: 5, icon: '🍖',
    name: 'Кость Голода',
    buff: '+120% дохода столбца',
    debuff: 'Хищники столбца голодают вдвое быстрее',
    lore: 'Отметины зубов всех поколений. Грызут до сих пор.' },

  /* ---------------- ДЕМОНЫ: печати, монеты, венцы ---------------- */
  { id: 'rd_pent',   faction: 'demon', kind: 'chaos',   rarity: 3, icon: '✟',
    name: 'Пентакль Алчности',
    buff: 'Взрывы Хаоса демонов столбца — ТОЛЬКО баффы',
    debuff: '−25% дохода самого столбца',
    lore: 'Контракт подписан кровью. Пункт 13: неудобий не предусмотрено.' },
  { id: 'rd_coin',   faction: 'demon', kind: 'col',     rarity: 3, icon: '🪙',
    name: 'Обол Ада',
    buff: '+50% дохода столбца',
    debuff: '−20% дохода ДВУМ соседним столбцам',
    lore: 'Плата лодочнику. Соседи, впрочем, тоже считают её платой.' },
  { id: 'rd_chain',  faction: 'demon', kind: 'chain',   rarity: 4, icon: '⛓',
    name: 'Кандалы Легиона',
    buff: 'Звенья столбца не затухают (×1.0)',
    debuff: '−25% дохода самого столбца',
    lore: 'Легион шагает в ногу, потому что кандалы у них общие.' },
  { id: 'rd_mask',   faction: 'demon', kind: 'chor',    rarity: 4, icon: '😈',
    name: 'Личина Легиона',
    buff: 'Пары столбца дают двойной вклад в Хор',
    debuff: '−30% дохода самого столбца',
    lore: 'Взгляд под личину выдержал один демон. Теперь он её носит.' },
  { id: 'rd_rift',   faction: 'demon', kind: 'voidr',   rarity: 5, icon: '🕳',
    name: 'Разлом Ада',
    buff: 'Доход столбца ×2.5',
    debuff: 'Пары столбца ВЫПАДАЮТ из Хора (нет бонуса за разнообразие)',
    lore: 'Оттуда дует. Демоны говорят «сквозняк». Демоны врут.' },
  { id: 'rd_crown',  faction: 'demon', kind: 'sun',     rarity: 5, icon: '👑',
    name: 'Венец Владыки Роя',
    buff: 'Доход столбца ×2 и звенья без затухания',
    debuff: '−35% дохода ДВУМ соседним столбцам',
    lore: 'Рой не нуждается в короле. Рой просто согласился его носить.' }
];

const RELIC_RARITY_COLOR = r => r === 3 ? '#7080a0' : r === 4 ? '#a070b0' : '#d4b050';

/* --- Состояние: владение (вечное, meta) + расстановка (забег, run) --- */
let RELICS_OWNED = new Set();   // meta: собранные реликвии
let relicSlots = {};            // run: {colIndex(абсолютный 0..8): relicId}
let relicPity = 0;              // run: круток без реликвии (гарантия за 30)

const RELIC_SLOT_EPOCH = 2;     // слоты столбцов открываются на Эпохе 2
const RELIC_DROP_EPOCH = 2;     // и из гачи падают с Эпохи 2
const RELIC_DROP_CHANCE = 0.02; // 2% за крутку
const RELIC_PITY_MAX = 30;      // гарантия: не дольше 30 круток без реликвии
const RELIC_TIER_W = { 3: 70, 4: 25, 5: 5 }; // редкость выпавшей реликвии

/* --- ДВИЖОК ВИДОВ ЭФФЕКТОВ (по столбцам, читается economy.js) ---
   colMult  — множитель дохода СВОЕГО столбца (может быть debuff < 1)
   nei      — штраф двум соседним столбцам
   noDecay  — звенья столбца не затухают
   choir    — двойной вклад пар столбца в Хор
   noChoir  — пары столбца выпадают из Хора
   decaySq  — затухание² в столбце
   formAdd  — +к множителю формаций в столбце (культисты)
   hunt     — баффы охоты/выпаса столбца ×1.5 (звери)
   fertile  — флора столбца: баффы кормления ×2 (звери)
   apex     — хищники столбца не голодают (звери)
   king     — убийства столбца дают двойной бафф; травоядные столбца ×0.75 (звери)
   chaosLock — взрывы Хаоса столбца всегда баффы (демоны)
   hungerFast — хищники столбца голодают ×2 (звери) */
const RELIC_KIND_ENGINE = {
  col:     { colMult: 1.5,  nei: 0.8 },
  chain:   { colMult: 0.75, noDecay: 1 },
  chor:    { colMult: 0.70, choir: 2 },
  titan:   { colMult: 2.2,  decaySq: 1 },
  voidr:   { colMult: 2.5,  noChoir: 1 },
  sun:     { colMult: 2.0,  noDecay: 1, nei: 0.65 },
  form:    { colMult: 0.75, formAdd: 0.5 },
  hunt:    { colMult: 0.80, hunt: 1 },
  fertile: { colMult: 0.85, fertile: 1 },
  apex:    { colMult: 0.75, apex: 1 },
  king:    { colMult: 1.0,  king: 1, herbPenalty: 0.75 },
  chaos:   { colMult: 0.75, chaosLock: 1 }
};
/* Кэш: столбец -> движок вида реликвии */
let RELIC_COL_ENGINE = {};
function rebuildRelicEngine() {
  RELIC_COL_ENGINE = {};
  if (epoch < RELIC_SLOT_EPOCH) return;
  for (const k in relicSlots) {
    const r = relicById(relicSlots[k]);
    if (r && RELIC_KIND_ENGINE[r.kind]) RELIC_COL_ENGINE[+k] = RELIC_KIND_ENGINE[r.kind];
  }
}
function colEngine(c) { return RELIC_COL_ENGINE[c] || null; }

function hasRelic(id) { return RELICS_OWNED.has(id); }
function relicById(id) { return RELICS.find(r => r.id === id); }
function relicAtCol(c) { return relicSlots[c] ? relicById(relicSlots[c]) : null; }
/* Реликвии, свободные и пригодные для ТЕКУЩЕЙ фракции (набор фракционный — фидбек 8) */
function unassignedRelics() {
  const used = {};
  Object.keys(relicSlots).forEach(c => used[relicSlots[c]] = 1);
  return RELICS.filter(r => RELICS_OWNED.has(r.id) && !used[r.id] && r.faction === faction).map(r => r.id);
}
function relicsOfFaction(f) { return RELICS.filter(r => r.faction === f); }

/* Выпадение из гачи: шанс 2% + гарантия за 30 круток (только с Э2) */
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
/* Выдать реликвию (гача). Дубликат → компенсация 💎 */
function grantRelic(id, silent) {
  const r = relicById(id); if (!r) return;
  if (RELICS_OWNED.has(id)) {
    const comp = Math.max(1500, Math.round(calculateIncome() * 25));
    crystals += comp; runEarned += Math.round(comp * 0.5);
    toast(relicArtHTML(r, 'relic-inline-art', '') + ' <b>ДУБЛИКАТ:</b> «' + r.name + '» → компенсация ' + fmtShort(comp) + ' 💎');
    sfx('relic');
    return;
  }
  RELICS_OWNED.add(id);
  saveMeta();
  if (!silent) {
    toast(relicArtHTML(r, 'relic-inline-art', '') + ' <b>РЕЛИКВИЯ:</b> «' + r.name + '» — поставьте её в слот столбца');
    sfx('relic'); fxConfetti(40);
  }
  updateHUD(); checkAchievements();
}

/* Подсветка, что реликвия в столбце (для тултипов/рендера) */
function columnEffects(c) {
  const r = relicAtCol(c);
  return r ? { relic: r, col: +c } : null;
}

/* ================= СПРАЙТЫ РЕЛИКВИЙ (assets/relics) =================
   Дарк-фэнтези пиксель-арт, тот же стиль, что карты (фидбек 9).
   Фолбэк — эмодзи-иконка, если ассет не найден. */
const RELIC_ART_DIR = 'assets/relics/';
function relicArtHTML(relic, imgCls, fbCls) {
  return '<img class="' + imgCls + '" src="' + RELIC_ART_DIR + relic.id + '.png" alt="" ' +
    'onerror="cardArtFail(this,\'' + (fbCls || '') + '\',\'' + relic.icon + '\')">';
}
