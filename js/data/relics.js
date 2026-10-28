'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js) — v1.2.5 ПЕРЕРАБОТКА
   Реликвия — артефакт из гачи (с Э2), ставится в слот столбца.
   v1.2.5: реликвии БОЛЬШЕ НЕ ЖИВУТ ВЕЧНО — вся коллекция
   сбрасывается при смене Эпохи (расходник забега), зато эффекты
   заметно мощнее и падают чаще (5%, гарантия за 18 круток).
   У КАЖДОЙ фракции — свой набор; баффы и дебаффы описаны
   простым языком. Спрайты — assets/relics/<id>.png (дарк-фэнтези).
   Новую реликвию добавляем ТОЛЬКО в этот список.
   ============================================================ */

const RELICS = [
  /* ---------------- НЕЖИТЬ: кости, цепи, могилы ---------------- */
  { id: 'rb_nail',   faction: 'undead', kind: 'col',    rarity: 3, icon: '⚰',
    name: 'Гробовой Гвоздь',
    buff: '+100% дохода столбца',
    debuff: '−25% дохода ДВУМ соседним столбцам',
    lore: 'Забит в крышку каждого саркофага Владыки. Соседи платят за тишину.' },
  { id: 'rb_skull',  faction: 'undead', kind: 'chain',  rarity: 3, icon: '💀',
    name: 'Череп Владыки',
    buff: 'Повторы пар в столбце не слабеют',
    debuff: '−10% дохода самого столбца',
    lore: 'Он помнит каждое звено каждой цепи. Цепи держатся — кости скрипят.' },
  { id: 'rb_stone',  faction: 'undead', kind: 'chor',   rarity: 4, icon: '🪦',
    name: 'Плачущий Камень',
    buff: 'Пары столбца дают ТРОЙНОЙ вклад в бонус за разнообразие',
    debuff: '−30% дохода самого столбца',
    lore: 'Надгробие, с которого сутки течёт вода. Никто не видел, чтобы кто-то плакал.' },
  { id: 'rb_urn',    faction: 'undead', kind: 'titan',  rarity: 4, icon: '⚱',
    name: 'Урна Владык',
    buff: '+220% дохода столбца',
    debuff: 'Повторы пар в столбце слабеют КВАДРАТично',
    lore: 'Прах пяти династий. Мощь велика, но повторять династии не советуем.' },
  { id: 'rb_heart',  faction: 'undead', kind: 'voidr',  rarity: 5, icon: '🖤',
    name: 'Сердце Пустоты',
    buff: 'Доход столбца ×3.5',
    debuff: 'Пары столбца не дают бонус за разнообразие',
    lore: 'Оно не бьётся. Оно ждёт. Песни вокруг него замолкают.' },
  { id: 'rb_crown',  faction: 'undead', kind: 'sun',    rarity: 5, icon: '👑',
    name: 'Корона Тлена',
    buff: 'Доход столбца ×3 и повторы пар не слабеют',
    debuff: '−40% дохода ДВУМ соседним столбцам',
    lore: 'Ржавая, тяжёлая, вечная. Свет её видят только соседние могилы.' },

  /* ---------------- КУЛЬТИСТЫ: глаза, свечи, маски ---------------- */
  { id: 'rc_eye',    faction: 'cultist', kind: 'form',   rarity: 3, icon: '🔯',
    name: 'Око Ритуала',
    buff: 'Члены формаций в столбце: +0.8 к множителю ритуала',
    debuff: '−15% дохода самого столбца',
    lore: 'Ритуал видит себя со стороны. Со стороны он страшнее.' },
  { id: 'rc_candle', faction: 'cultist', kind: 'col',    rarity: 3, icon: '🕯',
    name: 'Свеча Мученика',
    buff: '+100% дохода столбца',
    debuff: '−25% дохода ДВУМ соседним столбцам',
    lore: 'Горит ровно столько, сколько осталось молиться. Не спрашивайте.' },
  { id: 'rc_chains', faction: 'cultist', kind: 'chain',  rarity: 4, icon: '⛓',
    name: 'Вериги Пустоты',
    buff: 'Повторы пар в столбце не слабеют',
    debuff: '−10% дохода самого столбца',
    lore: 'Самобичевание, доведённое до инженерного совершенства.' },
  { id: 'rc_mask',   faction: 'cultist', kind: 'chor',   rarity: 4, icon: '🎭',
    name: 'Многоликая Маска',
    buff: 'Пары столбца дают ТРОЙНОЙ вклад в бонус за разнообразие',
    debuff: '−30% дохода самого столбца',
    lore: 'Масок тридцать, голос один. Поют всегда вразнобой, но громко.' },
  { id: 'rc_pupil',  faction: 'cultist', kind: 'voidr',  rarity: 5, icon: '👁',
    name: 'Зрачок Бездны',
    buff: 'Доход столбца ×3.5',
    debuff: 'Пары столбца не дают бонус за разнообразие',
    lore: 'Смотрит в ответ. Песни вокруг него стихают сами.' },
  { id: 'rc_chalice', faction: 'cultist', kind: 'titan', rarity: 5, icon: '🍷',
    name: 'Кровавая Чаша',
    buff: '+250% дохода столбца',
    debuff: 'Повторы пар в столбце слабеют КВАДРАТично',
    lore: 'Наполняется сама. Это не радует никого, кто понимает, из чего.' },

  /* ---------------- ЗВЕРИ: клыки, тотемы, рога ---------------- */
  { id: 'rw_fang',   faction: 'beast', kind: 'hunt',    rarity: 3, icon: '🦷',
    name: 'Клык Альфы',
    buff: 'Баффы охоты и выпаса карт столбца ×2',
    debuff: '−10% дохода самого столбца',
    lore: 'Вырван в честном бою за право называться обедом кого-то ещё.' },
  { id: 'rw_totem',  faction: 'beast', kind: 'col',     rarity: 3, icon: '🗿',
    name: 'Мшистый Тотем',
    buff: '+100% дохода столбца',
    debuff: '−25% дохода ДВУМ соседним столбцам',
    lore: 'Лес ставит их сам. Табличек не вешает, но место помечено.' },
  { id: 'rw_bough',  faction: 'beast', kind: 'fertile', rarity: 4, icon: '🌿',
    name: 'Ветвь Древеня',
    buff: 'ФЛОРА столбца: +200% к баффам кормления и лечения',
    debuff: '−15% дохода самого столбца',
    lore: 'Отломил — посади. Лес всё видит, лес всё помнит.' },
  { id: 'rw_collar', faction: 'beast', kind: 'apex',    rarity: 4, icon: '🥷',
    name: 'Ошейник Господства',
    buff: 'Хищники столбца НЕ ГОЛОДАЮТ',
    debuff: '−15% дохода самого столбца',
    lore: 'Носит не тот, кого охраняют. Носит тот, кого боятся соседи.' },
  { id: 'rw_crown',  faction: 'beast', kind: 'king',    rarity: 5, icon: '🐾',
    name: 'Корона Зверя',
    buff: 'Убийства хищников столбца дают двойной бафф',
    debuff: 'Травоядные столбца: −20% дохода',
    lore: 'Корона не делает тебя королём. Она делает всех остальных — обедами.' },
  { id: 'rw_bone',   faction: 'beast', kind: 'titan',   rarity: 5, icon: '🍖',
    name: 'Кость Голода',
    buff: '+220% дохода столбца',
    debuff: 'Хищники столбца голодают вдвое быстрее',
    lore: 'Отметины зубов всех поколений. Грызут до сих пор.' },

  /* ---------------- ДЕМОНЫ: печати, монеты, венцы ---------------- */
  { id: 'rd_pent',   faction: 'demon', kind: 'chaos',   rarity: 3, icon: '✟',
    name: 'Пентакль Алчности',
    buff: 'Взрывы демонов столбца — ТОЛЬКО баффы',
    debuff: '−15% дохода самого столбца',
    lore: 'Контракт подписан кровью. Пункт 13: неудобий не предусмотрено.' },
  { id: 'rd_coin',   faction: 'demon', kind: 'col',     rarity: 3, icon: '🪙',
    name: 'Обол Ада',
    buff: '+100% дохода столбца',
    debuff: '−25% дохода ДВУМ соседним столбцам',
    lore: 'Плата лодочнику. Соседи, впрочем, тоже считают её платой.' },
  { id: 'rd_chain',  faction: 'demon', kind: 'chain',   rarity: 4, icon: '⛓',
    name: 'Кандалы Легиона',
    buff: 'Повторы пар в столбце не слабеют',
    debuff: '−10% дохода самого столбца',
    lore: 'Легион шагает в ногу, потому что кандалы у них общие.' },
  { id: 'rd_mask',   faction: 'demon', kind: 'chor',    rarity: 4, icon: '😈',
    name: 'Личина Легиона',
    buff: 'Пары столбца дают ТРОЙНОЙ вклад в бонус за разнообразие',
    debuff: '−30% дохода самого столбца',
    lore: 'Взгляд под личину выдержал один демон. Теперь он её носит.' },
  { id: 'rd_rift',   faction: 'demon', kind: 'voidr',   rarity: 5, icon: '🕳',
    name: 'Разлом Ада',
    buff: 'Доход столбца ×3.5',
    debuff: 'Пары столбца не дают бонус за разнообразие',
    lore: 'Оттуда дует. Демоны говорят «сквозняк». Демоны врут.' },
  { id: 'rd_crown',  faction: 'demon', kind: 'sun',     rarity: 5, icon: '👑',
    name: 'Венец Владыки Роя',
    buff: 'Доход столбца ×3 и повторы пар не слабеют',
    debuff: '−40% дохода ДВУМ соседним столбцам',
    lore: 'Рой не нуждается в короле. Рой просто согласился его носить.' },

  /* ---------------- ПРОКЛЯТЫЕ АРТЕФАКТЫ (по одному на фракцию) ---------------- */
  { id: 'rx_banner', faction: 'undead', kind: 'legion',  rarity: 4, icon: '🏴',
    name: 'Штандарт Легиона',
    buff: 'Кап бонуса Армии ×2 → ×3.2 (для всей нежити)',
    debuff: '−10% дохода самого столбца',
    lore: 'Под ним шли в атаку все, кто уже умер. Дважды.' },
  { id: 'rx_censer', faction: 'cultist', kind: 'medic',   rarity: 4, icon: '🪔',
    name: 'Кадило Успокоения',
    buff: 'Культисты столбца вне ритуала дают ×0.6 (вместо ×0.15)',
    debuff: '−15% дохода самого столбца',
    lore: 'Дым помнит слова утешения для тех, кто остался за кругом.' },
  { id: 'rx_horn',   faction: 'beast',  kind: 'savage',  rarity: 4, icon: '📯',
    name: 'Рог Бешенства',
    buff: 'Укусы хищников столбца в 2 раза больнее',
    debuff: '−10% дохода самого столбца',
    lore: 'Один вдох — и лес перестаёт быть домом. Он становится войной.' },
  { id: 'rx_heart',  faction: 'demon',  kind: 'forge',   rarity: 4, icon: '🫀',
    name: 'Сердце Вулкана',
    buff: 'Демоны столбца копят угли быстрее (+1 за тик)',
    debuff: '−15% дохода самого столбца',
    lore: 'Оно не бьётся — оно качает магму. Держите крепче.' }
];

const RELIC_RARITY_COLOR = r => r === 3 ? '#7080a0' : r === 4 ? '#a070b0' : '#d4b050';

/* --- Состояние: владение + расстановка — ОБА в забеге (v1.2.5):
   реликвии не переживают смену Эпохи — расходник забега --- */
let RELICS_OWNED = new Set();   // run: собранные реликвии
let relicSlots = {};            // run: {colIndex(абсолютный 0..8): relicId}
let relicPity = 0;              // run: круток без реликвии (гарантия за 18)

const RELIC_SLOT_EPOCH = 2;     // слоты столбцов открываются на Эпохе 2
const RELIC_DROP_EPOCH = 2;     // и из гачи падают с Эпохи 2
const RELIC_DROP_CHANCE = 0.05; // v1.2.5: 5% за крутку (было 2%) — расходник должен капать
const RELIC_PITY_MAX = 18;      // гарантия: не дольше 18 круток без реликвии
const RELIC_TIER_W = { 3: 65, 4: 28, 5: 7 };

/* --- ДВИЖОК ВИДОВ ЭФФЕКТОВ (по столбцам, читается economy.js) ---
   v1.2.5: эффекты СИЛЬНЕЕ (расходник забега должен быть жирным) */
const RELIC_KIND_ENGINE = {
  col:     { colMult: 2.0,  nei: 0.75 },
  chain:   { colMult: 0.9,  noDecay: 1 },
  chor:    { colMult: 0.70, choir: 3 },
  titan:   { colMult: 3.2,  decaySq: 1 },
  voidr:   { colMult: 3.5,  noChoir: 1 },
  sun:     { colMult: 3.0,  noDecay: 1, nei: 0.6 },
  form:    { colMult: 0.85, formAdd: 0.8 },
  hunt:    { colMult: 0.9,  hunt: 2 },
  fertile: { colMult: 1.0,  fertile: 3 },
  apex:    { colMult: 0.85, apex: 1 },
  king:    { colMult: 1.25, king: 1, herbPenalty: 0.8 },
  chaos:   { colMult: 0.85, chaosLock: 1 },
  legion:  { colMult: 0.9,  armyCap: 1 },
  medic:   { colMult: 0.85, medic: 1 },
  savage:  { colMult: 0.9,  savage: 2 },
  forge:   { colMult: 0.85, forge: 1 }
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
  saveRun();
  if (!silent) {
    toast(relicArtHTML(r, 'relic-inline-art', '') + ' <b>РЕЛИКВИЯ:</b> «' + r.name + '» — поставьте её в слот столбца');
    sfx('relic'); fxConfetti(40);
  }
  updateHUD(); checkAchievements(); renderRelicPanel && renderRelicPanel();
}

/* Подсветка, что реликвия в столбце (для тултипов/рендера) */
function columnEffects(c) {
  const r = relicAtCol(c);
  return r ? { relic: r, col: +c } : null;
}

/* ================= СПРАЙТЫ РЕЛИКВИЙ (assets/relics) ================= */
const RELIC_ART_DIR = 'assets/relics/';
function relicArtHTML(relic, imgCls, fbCls) {
  return '<img class="' + imgCls + '" src="' + RELIC_ART_DIR + relic.id + '.png" alt="" ' +
    'onerror="cardArtFail(this,\'' + (fbCls || '') + '\',\'' + relic.icon + '\')">';
}
