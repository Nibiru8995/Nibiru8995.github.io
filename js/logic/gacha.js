'use strict';
/* ============================================================
   ЛОГИКА: ГАЧА (logic/gacha.js)
   Пункт 6 ТЗ: пул зависит от Эпохи (старт — только ★1/★3),
   pity-система 20/80. Пункт 11 ТЗ: моно-фракция — гача выдаёт
   ТОЛЬКО карты текущей фракции.
   РЕЛИКВИИ 2.0 (фидбек 7-8): с Эпохи 2 каждая крутка с шансом 2%
   приносит РЕЛИКВИЮ вместо карты (гарантия за 30 круток без неё).
   ============================================================ */

/* Шансы: 45% ЗДАНИЕ, 50% ★3, 4% ★4, 1% ★5 (если открыто).
   Здания (rarity 'B') — эквивалент бывшей ★1, стандартный мелкий дроп. */
function unlockedRarities() { return epochRarities(epoch); }
function pity4Max() { return 20; }

function rollRarity() {
  const unlocked = unlockedRarities();
  const has4 = unlocked.includes(4), has5 = unlocked.includes(5);
  const best = has5 ? 5 : has4 ? 4 : 3; /* старшая ДОСТУПНАЯ редкость */
  const fateBonus = sealLv.fate;
  pity4 += 1 + fateBonus; pity5 += 1 + fateBonus;
  const hitSmallPity = pity4 >= pity4Max(), hitBigPity = pity5 >= 80;

  let t;
  const r = Math.random() * 100;
  if (has5 && (hitBigPity || r >= 99)) t = 5;
  else if (has4 && (hitSmallPity || r >= 95)) t = 4;
  else if (hitBigPity) t = best;  /* большой pity: лучшая доступная */
  else if (hitSmallPity) t = best; /* малый pity на ранних Эпохах даёт ★3 */
  else t = r < 45 ? 'B' : 3;

  /* Счётчики сбрасываются, когда гарантия сработала по своей шкале */
  if (t === 4 || t === 5 || hitSmallPity) pity4 = 0;
  if (t === 5 || hitBigPity) pity5 = 0;
  return t;
}

/* Пул редкости t только из карт ТЕКУЩЕЙ фракции */
function factionPool(t) {
  const base = POOLS[t] || POOL_3;
  const own = base.filter(id => CARDS[id].faction === faction);
  return own.length ? own : base;
}
function rollOne() {
  const t = rollRarity();
  const id = pick(factionPool(t));
  stats.rolls++; runRolls++;
  stats.pulls[id] = (stats.pulls[id] || 0) + 1;
  return id;
}

/* Сыграть count круток. free=true — крутка за счёт вехи (без денег).
   Возвращает {cards: [id, ...], relics: [id, ...]} */
function performRolls(count, free) {
  const cost = free ? 0 : rollCost() * count;
  if (crystals < cost) return null;
  crystals -= cost;
  const cards = [], relics = [];
  for (let i = 0; i < count; i++) {
    if (relicRollDue()) relics.push(rollRelicId());
    else { relicPity++; cards.push(rollOne()); }
  }
  return { cards, relics };
}
