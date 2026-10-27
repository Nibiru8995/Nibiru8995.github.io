'use strict';
/* ============================================================
   ДАННЫЕ: ЭПОХИ (data/epochs.js)
   Пороги, имена-темы, разблокировки, печати, магазин печатей
   и стоимости расширений Алтаря. Новую эпоху добавляем ТОЛЬКО здесь.
   ============================================================ */

/*
  ЭПОХИ (пункт 1 ТЗ + фидбек «распредели эпохи, чтоб было интересно»).
  У каждой Эпохи есть ИМЯ-ТЕМА (атмосфера) и КОНКРЕТНАЯ награда-разблокировка
  в каждом переходе — никаких «пустых» Эпох:
  грид/гача/старт-фракция → арена → ★4+поле → казино → культисты → ★5 →
  поле 7×7 → звери → поле 9×9 → демоны → бесконечность.
  ★5 поднят с Э7 на Э6 (крутки становятся вкусными раньше),
  Поле 7×7 сдвинуто на Э7 (размер поля — менее яркий подарок, чем ★5).
  threshold — сколько 💎 нужно ЗАРАБОТАТЬ ЗА ТЕКУЩИЙ ЗАБЕГ (runEarned),
  чтобы открыть следующую эпоху. Кривая — ровно ×5 с Эпохи 2.
  seals — сколько ПЕЧАТЕЙ даёт переход.
  ПОЛЕ растёт АВТОМАТИЧЕСКИ при переходе (бесплатно) — докупать не нужно.
*/
const EPOCHS = [
  { name: 'Пробуждение',       unlock: 'Алтарь 3×3 + Гача ★1/★3 + фракция «Нежить»',  threshold: 0,             seals: 0 },
  { name: 'Колыбель Войны',    unlock: '⚔ Колыбель Войны — автобатлер + слоты реликвий', threshold: 12000,      seals: 4 },
  { name: 'Кровавые Звёзды',   unlock: 'Поле 5×5 + ★4 в пуле гачи',                    threshold: 60000,         seals: 5 },
  { name: 'Дьявольская Забава', unlock: '🎰 Казино',                                   threshold: 300000,        seals: 6 },
  { name: 'Пустые Глаза',      unlock: 'Фракция «Культисты»',                          threshold: 1500000,       seals: 7 },
  { name: 'Пятая Печать',      unlock: '★5 в пуле гачи — гача становятся вкусной',     threshold: 7500000,       seals: 8 },
  { name: 'Дикие Земли',       unlock: 'Поле 7×7',                                     threshold: 40000000,      seals: 9 },
  { name: 'Красный Клык',      unlock: 'Фракция «Звери»',                              threshold: 200000000,     seals: 10 },
  { name: 'Девять Кругов',     unlock: 'Поле 9×9 (максимум)',                          threshold: 1000000000,    seals: 11 },
  { name: 'Кровавый Хаос',     unlock: 'Фракция «Демоны»',                             threshold: 5000000000,    seals: 12 },
  { name: 'Сумерки Владык',    unlock: 'Эпохи Бесконечности: пороги растут ×5',        threshold: 25000000000,   seals: 14 }
];

function epochUnlockText(e) { return EPOCHS[Math.min(e, EPOCHS.length) - 1].unlock; }
/* Имя-тема Эпохи. За пределами таблицы — «За Гранью N» */
function epochName(e) {
  if (e <= EPOCHS.length) return EPOCHS[e - 1].name;
  return 'За Гранью ' + (e - EPOCHS.length + 1);
}
function epochThreshold(e) {
  /* Порог перехода ИЗ эпохи e в e+1; после последней — ×5 каждый раз */
  if (e < EPOCHS.length) return EPOCHS[e].threshold;
  const last = EPOCHS[EPOCHS.length - 1].threshold;
  let t = last, extra = e - EPOCHS.length + 1;
  for (let i = 0; i < extra; i++) t *= 5;
  return t;
}
function epochSealsGain(e) {
  if (e < EPOCHS.length) return EPOCHS[e].seals;
  return EPOCHS[EPOCHS.length - 1].seals + (e - EPOCHS.length + 1);
}

/* ---- РАЗМЕР ПОЛЯ (пункт 8 ТЗ): ТОЛЬКО НЕЧЁТНЫЕ 3×3 → 5×5 → 7×7 → 9×9 ----
   Размер растёт АВТОМАТИЧЕСКИ (и бесплатно) при переходе Эпохи:
   doEpochUp в logic/epochs.js ставит playableSize = epochMaxSize(epoch).
   7×7 теперь с Эпохи 7 (★5 заняла Эпоху 6). */
function epochMaxSize(e) {
  if (e >= 9) return 9;
  if (e >= 7) return 7;
  if (e >= 3) return 5;
  return 3;
}
/* Лимит стака карт на клетке (расширяется Печатью Зодчего) */
function maxStacks() { return 5 + sealLv.arch; }

/* ---- Казино и Колыбель Войны открываются в РАЗНЫХ Эпохах ----
   Арена — Эпоха 2 (бой), Казино — Эпоха 4 (после Алтаря 5×5 и ★4). */
const CASINO_EPOCH = 4;
const ARENA_EPOCH = 2;
function epochHasCasino(e) { return e >= CASINO_EPOCH; }
function epochHasArena(e) { return e >= ARENA_EPOCH; }

function epochRarities(e) {
  const r = [1, 3];
  if (e >= 3) r.push(4); /* ★4 заметно раньше: уже в Эпохе 3 */
  if (e >= 6) r.push(5); /* ★5 поднят с Э7 на Э6 — гача оживает раньше */
  return r;
}
function epochFactions(e) {
  const f = ['undead'];
  if (e >= 5) f.push('cultist');
  if (e >= 8) f.push('beast');
  if (e >= 10) f.push('demon');
  return f;
}

/*
  МАГАЗИН ПЕЧАТЕЙ (пункт 1 ТЗ): печати тратятся на бонусы,
  ускоряющие следующий забег. Печати НЕ сбрасываются никогда.
*/
const SEALS_SHOP = [
  { id: 'rich',    icon: '📈', name: 'Печать Изобилия',   desc: '+25% дохода за уровень',          max: 5, cost: l => 4 + 3 * l },
  { id: 'greed',   icon: '🎲', name: 'Печать Жадности',   desc: '−10% цена круток за уровень',     max: 3, cost: l => 5 + 4 * l },
  { id: 'impulse', icon: '🎁', name: 'Печать Импульса',   desc: 'Старт забега: +2500×2^ур. 💎',    max: 4, cost: l => 3 + 3 * l },
  { id: 'arch',    icon: '🧱', name: 'Печать Зодчего',    desc: '+1 к максимальному стеку карт на клетке за уровень', max: 2, cost: l => 5 + 4 * l },
  { id: 'fate',    icon: '🔮', name: 'Печать Судьбы',     desc: 'Pity-счётчики крутятся в +1/ур. быстрее', max: 3, cost: l => 6 + 5 * l }
];
