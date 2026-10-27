'use strict';
/* ============================================================
   ЛОГИКА: ГАЧА (logic/gacha.js)
   Пункт 6 ТЗ: пул зависит от Эпохи (старт — только ★1/★3),
   pity-система 10/80. Пункт 11 ТЗ: моно-фракция — гача выдаёт
   ТОЛЬКО карты текущей фракции. Спрайтов нет — только эмодзи.
   ============================================================ */

/* Шансы: 44% ★1, 46% ★3, 9% ★4, 1% ★5 (если редкость открыта) */
function unlockedRarities() { return epochRarities(epoch); }

function rollRarity() {
  const unlocked = unlockedRarities();
  const has4 = unlocked.includes(4), has5 = unlocked.includes(5);
  const best = has5 ? 5 : has4 ? 4 : 3; /* старшая ДОСТУПНАЯ редкость */
  const fateBonus = sealLv.fate;
  pity4 += 1 + fateBonus; pity5 += 1 + fateBonus;
  const hitSmallPity = pity4 >= 10, hitBigPity = pity5 >= 80;

  let t;
  const r = Math.random() * 100;
  if (has5 && (hitBigPity || r >= 99)) t = 5;
  else if (has4 && (hitSmallPity || r >= 90)) t = 4;
  else if (hitBigPity) t = best;  /* большой pity: лучшая доступная */
  else if (hitSmallPity) t = best; /* малый pity на ранних Эпохах даёт ★3 */
  else t = r < 45 ? 1 : 3;

  /* Счётчики сбрасываются, когда гарантия сработала по своей шкале */
  if (t >= 4 || hitSmallPity) pity4 = 0;
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

/* Сыграть count круток. Возвращает {cards: [id, ...]} */
function performRolls(count) {
  const cost = rollCost() * count;
  if (crystals < cost) return null;
  crystals -= cost;
  const cards = [];
  for (let i = 0; i < count; i++) cards.push(rollOne());
  return { cards };
}
