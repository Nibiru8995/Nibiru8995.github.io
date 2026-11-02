'use strict';
/* ============================================================
   ЛОГИКА: ГАЧА / ГРИМУАР (logic/gacha.js) — v1.6.0 «Гримуар»
   Пити-система 20/80 — теперь ВЕЧНАЯ (мета). Крутки (Призыв)
   происходят в Гримуаре МЕЖДУ забегами за ДУШИ (1 душа = 1 крутка),
   бесплатные крутки списываются первыми. Выпавшие карты ложатся
   в ВЕЧНУЮ коллекцию (collection), а не в инвентарь забега.
   Расу Призыва выбирает игрок (среди открытых в Эпохе).
   РЕЛИКВИИ: шанс 2%/пити 30 остался — выпавшие реликвии идут в
   СХРОН (relicStash) и выдаются на старте следующего забега.
   КОЛОДЫ: decks [{id, name, race, cards[]}], лимит 64 карты,
   дубликаты разрешены (копия списывается из коллекции при добавлении).
   Улучшения за дубликаты — в следующей итерации (окно «Улучшения»).
   ============================================================ */

/* Шансы: 32% ЗДАНИЕ, 63% ★3, 4% ★4, 1% ★5 (если открыто). */
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
  else t = r < 32 ? 'B' : 3;

  /* Счётчики сбрасываются, когда гарантия сработала по своей шкале */
  if (t === 4 || t === 5 || hitSmallPity) pity4 = 0;
  if (t === 5 || hitBigPity) pity5 = 0;
  return t;
}

/* Пул редкости t из карт ЗАДАННОЙ расы (v1.6.0: расу Призыва выбирает игрок;
   по умолчанию — фракция текущего забега, как раньше) */
function factionPool(t, race) {
  const f = race || faction;
  const base = POOLS[t] || POOL_3;
  const own = base.filter(id => CARDS[id].faction === f);
  return own.length ? own : base;
}
function rollOne(race) {
  const t = rollRarity();
  const id = pick(factionPool(t, race));
  stats.rolls++; runRolls++;
  stats.pulls[id] = (stats.pulls[id] || 0) + 1;
  return id;
}

/* ---------------- ПРИЗЫВ (Гримуар): крутки за ДУШИ ----------------
   Сначала списываются бесплатные (freeRolls — вехи/контракты/Арена/
   Знамение), остаток — по 1 Душе за крутку. Карты — в вечную коллекцию,
   реликвии — в схрон. Возвращает {cards, relics, free, paid} или null. */
const GRIM_ROLL_COST = 1; /* Душ за крутку */

function performGrimRolls(count) {
  count = Math.max(1, Math.min(count | 0, 1000));
  const freeN = Math.max(0, Math.min(freeRolls, count));
  const paidN = count - freeN;
  if (paidN > 0 && souls < paidN * GRIM_ROLL_COST) return null;
  souls -= paidN * GRIM_ROLL_COST;
  freeRolls -= freeN;
  const cards = [], relics = [];
  for (let i = 0; i < count; i++) {
    if (relicRollDue()) relics.push(rollRelicId(gachaRace));
    else { relicPity++; cards.push(rollOne(gachaRace)); }
  }
  const newTypes = cards.filter(id => !collection[id]); /* впервые полученные типы — для метки «НОВАЯ» */
  cards.forEach(id => collectionAdd(id, 1));
  relics.forEach(id => relicStash.push(id));
  saveMeta(); saveRun();
  return { cards, relics, free: freeN, paid: paidN, newTypes };
}

/* ---------------- ВЕЧНАЯ КОЛЛЕКЦИЯ ---------------- */
function collectionAdd(id, n) {
  collection[id] = (collection[id] || 0) + (n || 1);
  discovered.add(id);
}
/* Сколько копий карты уже лежит в колодах этой расы (для честного учёта) */
function collectionFree(id) {
  return (collection[id] || 0);
}

/* ---------------- КОЛОДЫ ---------------- */
const DECK_SIZE = 64;
function deckById(id) { return decks.find(k => k.id === id) || null; }
function activeDeckFor(race) {
  const d = deckById(activeDeck[race]);
  return (d && d.race === race) ? d : null;
}
function deckUsedCount(deck, cardId) {
  return deck.cards.filter(cid => cid === cardId).length;
}
function addToDeck(deck, cardId) {
  if (!deck || !CARDS[cardId]) return false;
  if (CARDS[cardId].faction !== deck.race) return false;      /* колода принадлежит расе */
  if (deck.cards.length >= DECK_SIZE) return false;           /* лимит 64 */
  if (deckUsedCount(deck, cardId) >= collectionFree(cardId)) return false; /* копий нет */
  deck.cards.push(cardId);
  saveMeta();
  return true;
}
function removeFromDeck(deck, cardId) {
  if (!deck) return false;
  const i = deck.cards.indexOf(cardId);
  if (i < 0) return false;
  deck.cards.splice(i, 1);
  saveMeta();
  return true;
}
function createDeck(race, name) {
  if (!FACTION_KEYS.includes(race)) return null;
  const d = { id: 'dk' + Date.now() + '_' + rand(9999), name: (name || '').trim() || 'Колода ' + (decks.length + 1), race, cards: [] };
  decks.push(d);
  saveMeta();
  return d;
}
function deleteDeck(id) {
  const i = decks.findIndex(k => k.id === id);
  if (i < 0) return false;
  const race = decks[i].race;
  decks.splice(i, 1);
  if (activeDeck[race] === id) delete activeDeck[race];
  saveMeta();
  return true;
}
/* Стартовая колода расы: старт-кит (механика + здание + пара ★3).
   Создаётся, если у расы ещё нет ни одной колоды. */
function ensureStarterDeck(race) {
  if (!FACTION_KEYS.includes(race)) return null;
  if (decks.some(k => k.race === race)) return deckById(activeDeck[race]) || decks.find(k => k.race === race);
  const d = createDeck(race, 'Колода ' + FACTION_INFO[race].name);
  const startR1 = POOL_3.filter(id => CARDS[id].faction === race);
  drawDistinct(startR1, 2).concat(startKitFor(race)).forEach(id => { collectionAdd(id, 1); d.cards.push(id); });
  if (!activeDeck[race]) activeDeck[race] = d.id;
  saveMeta();
  return d;
}
