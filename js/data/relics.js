'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js) — РЕЛИКВИИ 2.0 (фидбек 7-8)
   Старая система «вечных пассивок» снесена. Теперь реликвия —
   артефакт, который ДОБЫВАЕТСЯ ИЗ ГАЧИ (наряду с картами, с Э2)
   и СТАВИТСЯ В СЛОТ СТОЛБЦА грида. Слоты появляются у столбцов
   и открываются на Эпохе 2.
   Каждая реликвия: МОЩНЫЙ бафф + равноценный ДЕБАФФ на столбик.
   Реликвии ВЕЧНЫЕ (не сбрасываются с Эпохой), расстановка —
   часть забега (сбрасывается). Дубликат из гачи → 💎 компенсация.
   Новую реликвию добавляем ТОЛЬКО в этот список.
   ============================================================ */

const RELICS = [
  { id: 'forge', icon: '🔥', name: 'Кузня Бездны',   rarity: 3,
    buff:  '+60% дохода столбца',
    debuff: '−15% дохода ДВУМ соседним столбцам',
    lore: 'Столб раскалён добела: свои куют, соседи плавятся.' },
  { id: 'chain', icon: '⛓️', name: 'Цепь Владыки',    rarity: 3,
    buff:  'Звенья столбца не затухают (×1.0)',
    debuff: '−20% дохода самого столбца',
    lore: 'Цепь держит звенья крепко, но вес её давит на владельцев.' },
  { id: 'chor',  icon: '🎵', name: 'Хор Забвения',    rarity: 4,
    buff:  'Пары столбца дают двойной вклад в Хор',
    debuff: '−25% дохода самого столбца',
    lore: 'Пой, пока соседи не оглохли — или не разорили тебя.' },
  { id: 'titan', icon: '🗿', name: 'Кровь Титана',    rarity: 4,
    buff:  '+150% дохода столбца',
    debuff: 'Затухание повторов в столбце вдвое жёстче (фактор²)',
    lore: 'Титан платит за мощь кровью — и повторами.' },
  { id: 'voidr', icon: '🕳️', name: 'Сердце Пустоты',  rarity: 5,
    buff:  'Доход столбца ×3',
    debuff: 'Пары столбца ВЫПАДАЮТ из Хора (нет бонуса за разнообразие)',
    lore: 'Пустота жиреет, а песни вокруг неё замолкают.' },
  { id: 'sun',   icon: '☀️', name: 'Корона Полдня',   rarity: 5,
    buff:  'Доход столбца ×2.5 и звенья без затухания',
    debuff: '−30% дохода ДВУМ соседним столбцам',
    lore: 'Полдень слепит: столбцу — всё, соседям — тень.' }
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

function hasRelic(id) { return RELICS_OWNED.has(id); }
function relicById(id) { return RELICS.find(r => r.id === id); }
function relicAtCol(c) { return relicSlots[c] ? relicById(relicSlots[c]) : null; }
function unassignedRelics() { const used = {}; Object.keys(relicSlots).forEach(c => used[relicSlots[c]] = 1); return RELICS.filter(r => RELICS_OWNED.has(r.id) && !used[r.id]).map(r => r.id); }

/* Выпадение из гачи: шанс 2% + гарантия за 30 круток (только с Э2) */
function relicRollDue() {
  if (epoch < RELIC_DROP_EPOCH) return false;
  return Math.random() < RELIC_DROP_CHANCE || relicPity >= RELIC_PITY_MAX;
}
function rollRelicId() {
  relicPity = 0;
  const tier = weightedPick(RELIC_TIER_W);
  for (let t = tier; t >= 3; t--) {
    const pool = RELICS.filter(r => r.rarity === t);
    if (pool.length) return pick(pool).id;
  }
  return RELICS[0].id;
}
/* Выдать реликвию (гача). Дубликат → компенсация 💎 */
function grantRelic(id, silent) {
  const r = relicById(id); if (!r) return;
  if (RELICS_OWNED.has(id)) {
    const comp = Math.max(1500, Math.round(calculateIncome() * 25));
    crystals += comp; runEarned += Math.round(comp * 0.5);
    toast(r.icon + ' <b>ДУБЛИКАТ:</b> «' + r.name + '» → компенсация ' + fmtShort(comp) + ' 💎');
    sfx('relic');
    return;
  }
  RELICS_OWNED.add(id);
  saveMeta();
  if (!silent) {
    toast(r.icon + ' <b>РЕЛИКВИЯ:</b> «' + r.name + '» — поставьте её в слот столбца');
    sfx('relic'); fxConfetti(40);
  }
  updateHUD(); checkAchievements();
}

/* Подсветка, что реликвия в столбце (для тултипов/рендера) */
function columnEffects(c) {
  const r = relicAtCol(c);
  return r ? { relic: r, col: +c } : null;
}
