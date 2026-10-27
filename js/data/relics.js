'use strict';
/* ============================================================
   ДАННЫЕ: РЕЛИКВИИ (data/relics.js)
   Вечные артефакты (НЕ сбрасываются с Эпохами) с уникальными
   пассивками. Источники: Арена (этажи 3/6/9), боссы и крупный
   выигрыш в казино, ★5 из гачи, Эпохи 3/5/7, Знамения.
   Новую реликвию добавляем ТОЛЬКО в этот список.
   ============================================================ */

const RELICS = [
  { id: 'candle',    icon: '🕯', name: 'Свеча Забвения',  desc: '+10% дохода Алтаря',                    src: 'Арена: этажи 3 / 6 / 9' },
  { id: 'ring',      icon: '💍', name: 'Кольцо Пепла',    desc: '+15% наград Арены',                     src: 'Арена: этажи 3 / 6 / 9' },
  { id: 'dice',      icon: '🎲', name: 'Кости Игрока',    desc: 'Выигрыши в казино +10%',                src: 'Казино: крупный выигрыш' },
  { id: 'hourglass', icon: '⏳', name: 'Часы Времени',    desc: 'Оффлайн-доход 75% и до 2 часов',        src: 'Казино: крупный выигрыш' },
  { id: 'skull',     icon: '💀', name: 'Череп Владыки',   desc: 'Pity ★4 срабатывает на 2 крутки раньше', src: 'Гача: гарантия ★5' },
  { id: 'heart',     icon: '🖤', name: 'Сердце Бездны',   desc: 'Знамения появляются на 25% чаще',       src: 'Гача: гарантия ★5' },
  { id: 'bag',       icon: '💰', name: 'Мешок Костей',    desc: 'Старт забега: кристаллы ×2',            src: 'Эпохи 3 / 5 / 7' },
  { id: 'eye',       icon: '👁', name: 'Око Культиста',   desc: 'Хор синергий: +2% за уникальную пару',  src: 'Эпохи 3 / 5 / 7' },
  { id: 'fang',      icon: '🦷', name: 'Клык Тирана',     desc: 'Атака Арены +15%',                      src: 'Знамения на Алтаре' },
  { id: 'crown',     icon: '👑', name: 'Корона Забытых',  desc: '+25% печатей за переход Эпохи',         src: 'Знамения на Алтаре' }
];

let RELICS_OWNED = new Set();

function hasRelic(id) { return RELICS_OWNED.has(id); }
function unownedRelics() { return RELICS.filter(r => !RELICS_OWNED.has(r.id)).map(r => r.id); }

function grantRelic(id) {
  if (noSave || !id || RELICS_OWNED.has(id)) return false;
  RELICS_OWNED.add(id);
  saveMeta();
  const r = RELICS.find(x => x.id === id);
  if (r) {
    toast(r.icon + ' <b>РЕЛИКВИЯ:</b> «' + r.name + '» — ' + r.desc);
    sfx('relic');
    fxConfetti(45);
  }
  computeIncome();
  updateHUD();
  checkAchievements();
  return true;
}
function grantRandomRelic() {
  const u = unownedRelics();
  return u.length ? grantRelic(pick(u)) : false;
}
