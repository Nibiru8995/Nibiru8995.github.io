'use strict';
/* ============================================================
   ЛОГИКА: ГАЧА / ГРИМУАР (logic/gacha.js) — v1.8.0 «Вечная Эпоха»
   Пити-система 20/80 — ВЕЧНАЯ (мета). Крутки (Призыв) происходят
   в Гримуаре МЕЖДУ забегами и ВСЕГДА стоят ДУШИ (1 Душа = 1 крутка).
   Выпавшие карты ложатся в ВЕЧНУЮ коллекцию (collection).
   Расу Призыва выбирает игрок (среди купленных в «Улучшениях»).
   РЕЛИКВИИ (v1.8.0): из Призыва больше НЕ выпадают — способа
   получить реликвии пока нет, это доработаем позже (заглушка —
   в «Улучшениях»).
   КОЛОДЫ: decks [{id, name, race, cards: [{id, n}]}], лимит 64 КОПИИ,
   дубликаты разрешены. v1.8.0: каждая копия — ОТДЕЛЬНАЯ запись-блок:
   - клик по карте коллекции ГРИМУАРА добавляет её в колоду как
     дубликат (новая запись ×1);
   - клик по ФИОЛЕТОВОЙ СТРЕЛКЕ ▲ у записи стакаает ИМЕННО ТУ запись,
     на которую кликнули: +1 копия из коллекции, до deckStackMax() (5);
   - застакованная запись на старте забега становится юнитом ×N
     (очередь deckStacks в state.js / logic/epochs.js, logic/grid.js).
   ============================================================ */

/* Шансы: 32% ЗДАНИЕ, 63% ★3, 4% ★4 (куплено), 1% ★5 (куплено). */
function pity4Max() { return 20; }

function rollRarity() {
  const unlocked = unlockedRarities();
  const has4 = unlocked.includes(4), has5 = unlocked.includes(5);
  const best = has5 ? 5 : has4 ? 4 : 3; /* старшая ДОСТУПНАЯ редкость */
  const fateBonus = upgLv.fate || 0;
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

/* Пул редкости t из карт ЗАДАННОЙ расы (расу Призыва выбирает игрок;
   по умолчанию — фракция текущего забега) */
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
   Каждая крутка стоит GRIM_ROLL_COST Душ. Карты — в вечную коллекцию.
   Возвращает {cards, paid} или null. */
const GRIM_ROLL_COST = 1; /* Душ за крутку */

function performGrimRolls(count) {
  count = Math.max(1, Math.min(count | 0, 1000));
  if (souls < count * GRIM_ROLL_COST) return null;
  souls -= count * GRIM_ROLL_COST;
  const cards = [];
  for (let i = 0; i < count; i++) cards.push(rollOne(gachaRace));
  const newTypes = cards.filter(id => !collection[id]); /* впервые полученные типы — для метки «НОВАЯ» */
  cards.forEach(id => collectionAdd(id, 1));
  saveMeta(); saveRun();
  return { cards, paid: count, newTypes };
}

/* ---------------- ВЕЧНАЯ КОЛЛЕКЦИЯ ---------------- */
function collectionAdd(id, n) {
  collection[id] = (collection[id] || 0) + (n || 1);
  discovered.add(id);
}
/* Сколько копий карты требуется колодам (для честного учёта):
   в колоде может лежать не больше копий, чем есть в коллекции */
function collectionFree(id) {
  return (collection[id] || 0);
}

/* ---------------- КОЛОДЫ (записи {id, n}) ---------------- */
const DECK_SIZE = 64; /* копий, суммарно */
/* Суммарное число копий в колоде */
function deckTotal(deck) { return deck ? deck.cards.reduce((s, e) => s + (e.n || 1), 0) : 0; }
function deckById(id) { return decks.find(k => k.id === id) || null; }
function activeDeckFor(race) {
  const d = deckById(activeDeck[race]);
  return (d && d.race === race) ? d : null;
}
/* Сколько копий карты лежит в колоде (по всем записям) */
function deckUsedCount(deck, cardId) {
  return deck.cards.reduce((s, e) => s + (e.id === cardId ? (e.n || 1) : 0), 0);
}
/* v1.8.0: можно ли поднять стак записи idx (+1 копия из коллекции):
   стак записи не полон и в коллекции есть свободные копии */
function canStackEntry(deck, idx) {
  if (!deck || !deck.cards[idx]) return false;
  const id = deck.cards[idx].id;
  return (deck.cards[idx].n || 1) < deckStackMax() &&
    deckTotal(deck) < DECK_SIZE &&
    deckUsedCount(deck, id) < collectionFree(id);
}
/* Клик по карте коллекции ГРИМУАРА → добавить копию как ДУБЛИКАТ
   (новая запись-блок ×1 в списке колоды) */
function addToDeck(deck, cardId) {
  if (!deck || !CARDS[cardId]) return false;
  if (CARDS[cardId].faction !== deck.race) return false;      /* колода принадлежит расе */
  if (deckTotal(deck) >= DECK_SIZE) return false;             /* лимит 64 копий */
  if (deckUsedCount(deck, cardId) >= collectionFree(cardId)) return false; /* копий нет */
  deck.cards.push({ id: cardId, n: 1 });
  saveMeta();
  return true;
}
/* Клик по ▲ у записи: стакает ИМЕННО ЭТУ запись (+1 копия из коллекции) */
function stackUpEntry(deck, idx) {
  if (!canStackEntry(deck, idx)) return false;
  deck.cards[idx].n = (deck.cards[idx].n || 1) + 1;
  saveMeta();
  return true;
}
/* Клик по записи: убрать ОДНУ копию (запись с нулём — удаляется) */
function removeFromDeck(deck, idx) {
  if (!deck || !deck.cards[idx]) return false;
  const e = deck.cards[idx];
  if ((e.n || 1) > 1) e.n--;
  else deck.cards.splice(idx, 1);
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
  drawDistinct(startR1, 2).concat(startKitFor(race)).forEach(id => { collectionAdd(id, 1); d.cards.push({ id, n: 1 }); });
  if (!activeDeck[race]) activeDeck[race] = d.id;
  saveMeta();
  return d;
}
