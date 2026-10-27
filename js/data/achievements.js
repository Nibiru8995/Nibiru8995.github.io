'use strict';
/* ============================================================
   ДАННЫЕ: ДОСТИЖЕНИЯ (data/achievements.js)
   Пункт 8 ТЗ: юмор, способ получения известен заранее (описание),
   без наград — только коллекция. Новые ачивки добавляем ТОЛЬКО сюда.
   check() вычисляется лениво, поэтому может ссылаться на глобальное
   состояние игры, объявленное в state.js.
   ============================================================ */

const ACHIEVEMENTS = [
  { id: 'first_roll',   name: 'Кости в кости',            desc: 'Сделать первую крутку',                 check: () => stats.rolls >= 1 },
  { id: 'roll_100',     name: 'Испытатель судьбы',        desc: 'Сделать 100 круток за Эпоху',           check: () => runRolls >= 100 },
  { id: 'roll_1000',    name: 'Палец-кристалл',           desc: 'Сделать 1000 круток за Эпоху',          check: () => runRolls >= 1000 },
  { id: 'place_15',     name: 'Гид по могилам',           desc: 'Поставить 15 карт на Алтарь за Эпоху',  check: () => stats.placed >= 15 },
  { id: 'grid_25',      name: 'Застройщик',               desc: 'Иметь 25 карт на Алтаре одновременно',  check: () => cardsOnGrid() >= 25 },
  { id: 'altar_5',      name: 'Расширитель',              desc: 'Расширить Алтарь до 5×5',               check: () => playableSize >= 5 },
  { id: 'rich_1m',      name: 'Кристальный магнат',       desc: 'Иметь 1 000 000 💎 разом',              check: () => crystals >= 1e6 },
  { id: 'rich_100m',    name: 'Скупой рыцарь',            desc: 'Иметь 100 000 000 💎 разом',            check: () => crystals >= 1e8 },
  { id: 'first_death',  name: 'Первый в очереди на смерть', desc: 'Потерять бойца на Арене',             check: () => stats.arenaDeaths >= 1 },
  { id: 'floor_5',      name: 'Этаж — не приговор',       desc: 'Достичь 5 этажа Арены',                 check: () => stats.floorMax >= 5 },
  { id: 'boss_kill',    name: 'Убийца владык',            desc: 'Победить босса Арены',                  check: () => stats.bossKills >= 1 },
  { id: 'legend_5',     name: 'Легенда в коллекции',      desc: 'Получить карту ★5',                     check: () => [...discovered].some(id => CARDS[id] && CARDS[id].rarity === 5) },
  { id: 'inc_100',      name: 'Маховик экономики',        desc: 'Достичь дохода +100/сек',               check: () => stats.maxInc >= 100 },
  { id: 'epoch_2',      name: 'Новая глава',              desc: 'Начать Эпоху 2',                        check: () => epoch >= 2 },
  { id: 'epoch_5',      name: 'Хронист',                  desc: 'Начать Эпоху 5',                        check: () => epoch >= 5 },
  { id: 'seals_10',     name: 'Печати на печати',         desc: 'Иметь 10 печатей за всё время',         check: () => sealsTotal >= 10 },
  { id: 'casino_lose',  name: 'Казино всегда в плюсе',    desc: 'Проиграть 100 000 💎 в казино суммарно', check: () => stats.casinoLost >= 100000 },
  { id: 'casino_jack',  name: 'Джекпот! Почти',           desc: 'Выиграть ≥10× ставки в казино',         check: () => stats.casinoBest >= 10 },
  { id: 'syn_12',       name: 'Синергетик-теоретик',      desc: 'Активировать 12 уникальных пар синергий одновременно', check: () => currentDiversity() >= 12 },
  { id: 'hour_1',       name: 'Зачем мы это делаем?',     desc: 'Играть 1 час суммарно',                 check: () => gameTime >= 3600 },
  { id: 'cleaner',      name: 'Чистильщик',               desc: 'Удалить 10 карт с Алтаря',              check: () => stats.deleted >= 10 },
  { id: 'floor_10',     name: 'Ветеран этажей',           desc: 'Достичь 10 этажа Арены',                check: () => stats.floorMax >= 10 }
];
