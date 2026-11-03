'use strict';
/*
ДАННЫЕ: ДОСТИЖЕНИЯ (data/achievements.js)
Юмор, способ получения известен заранее (описание),
без наград — только коллекция. Новые ачивки добавляем ТОЛЬКО сюда.
check вычисляется лениво, поэтому может ссылаться на глобальное
состояние игры, объявленное в state.js.
 ============================================================*/

const ACHIEVEMENTS = [
  { id: 'first_roll',   name: 'Кости в кости',            desc: 'Сделать первую крутку',                 check: () => stats.rolls >= 1 },
  { id: 'roll_100',     name: 'Испытатель судьбы',        desc: 'Сделать 100 круток за Эпоху',           check: () => runRolls >= 100 },
  { id: 'roll_1000',    name: 'Палец Тьмы',           desc: 'Сделать 1000 круток за Эпоху',          check: () => runRolls >= 1000 },
  { id: 'place_15',     name: 'Гид по могилам',           desc: 'Поставить 15 карт на Алтарь за Эпоху',  check: () => stats.placed >= 15 },
  { id: 'grid_25',      name: 'Застройщик',               desc: 'Иметь 25 карт на Алтаре одновременно',  check: () => cardsOnGrid() >= 25 },
  { id: 'altar_5',      name: 'Расширитель',              desc: 'Расширить Алтарь до 5×5 (Улучшения)',   check: () => fieldLv >= 1 },
  { id: 'rich_1m',      name: 'Магнат Тьмы',       desc: 'Иметь 1 000 000 Тёмной энергии разом',              check: () => crystals >= 1e6 },
  { id: 'rich_100m',    name: 'Скупой рыцарь',            desc: 'Иметь 100 000 000 Тёмной энергии разом',            check: () => crystals >= 1e8 },
  { id: 'first_death',  name: 'Первый в очереди на смерть', desc: 'Потерять бойца на Арене',             check: () => stats.arenaDeaths >= 1 },
  { id: 'floor_5',      name: 'Этаж — не приговор',       desc: 'Достичь 5 этажа Арены',                 check: () => stats.floorMax >= 5 },
  { id: 'boss_kill',    name: 'Убийца владык',            desc: 'Победить босса Арены',                  check: () => stats.bossKills >= 1 },
  { id: 'legend_5',     name: 'Легенда в коллекции',      desc: 'Получить карту ★5',                     check: () => [...discovered].some(id => CARDS[id] && CARDS[id].rarity === 5) },
  { id: 'subraces_3',   name: 'Три рода ночи',           desc: 'Иметь на Алтаре нежить всех трёх подрас одновременно', check: () => { const s = new Set(); for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) { const it = grid[r][c]; if (it && CARDS[it.cardId] && CARDS[it.cardId].faction === 'undead' && CARDS[it.cardId].subrace) s.add(CARDS[it.cardId].subrace); } return s.size >= 3; } },
  { id: 'orders_3',     name: 'Три ордена',              desc: 'Иметь на поле культистов Хора, Ложи и Внешнего одновременно (Хтонь — тоже Внешний)', check: () => { const s = new Set(); for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) { const it = grid[r][c]; if (it && CARDS[it.cardId] && CARDS[it.cardId].faction === 'cultist' && CARDS[it.cardId].subrace) s.add(CARDS[it.cardId].subrace); } return s.size >= 3; } },
  { id: 'theo_1',       name: 'Гость из-за Стены',        desc: 'Дождаться теофании — нисхождения Внешнего на Алтарь', check: () => (stats.theos || 0) >= 1 },
  { id: 'mut_1',        name: 'Свои среди чужих',         desc: 'Получить Одержимого — мутацию участника ритуала', check: () => [...discovered].some(id => CARDS[id] && CARDS[id].mut) },
  { id: 'inc_100',      name: 'Маховик экономики',        desc: 'Достичь дохода +100/сек',               check: () => stats.maxInc >= 100 },
  { id: 'epoch_2',      name: 'Новая глава',              desc: 'Начать Эпоху 2',                        check: () => epoch >= 2 },
  { id: 'epoch_5',      name: 'Хронист',                  desc: 'Начать Эпоху 5',                        check: () => epoch >= 5 },
  { id: 'seals_10',     name: 'Копилка Душ',              desc: 'Заработать 100 Душ за всё время',        check: () => (stats.soulsEarned || 0) >= 100 },
  { id: 'casino_lose',  name: 'Казино всегда в плюсе',    desc: 'Проиграть 100 000 ТЭ в казино суммарно', check: () => stats.casinoLost >= 100000 },
  { id: 'casino_jack',  name: 'Джекпот! Почти',           desc: 'Выиграть ≥10× ставки в казино',         check: () => stats.casinoBest >= 10 },
  { id: 'syn_12',       name: 'Синергетик-теоретик',      desc: 'Активировать 12 уникальных пар синергий одновременно', check: () => currentDiversity() >= 12 },
  { id: 'hour_1',       name: 'Зачем мы это делаем?',     desc: 'Играть 1 час суммарно',                 check: () => gameTime >= 3600 },
  { id: 'cleaner',      name: 'Чистильщик',               desc: 'Удалить 10 карт с Алтаря',              check: () => stats.deleted >= 10 },
  { id: 'floor_10',     name: 'Ветеран этажей',           desc: 'Достичь 10 этажа Арены',                check: () => stats.floorMax >= 10 },
  { id: 'relic_1',      name: 'Первый артефакт',          desc: 'Получить Реликвию',                     check: () => RELICS_OWNED.size >= 1 },
  { id: 'relic_5',      name: 'Коллекционер древностей',  desc: 'Собрать 5 Реликвий',                    check: () => RELICS_OWNED.size >= 5 },
  { id: 'omen_10',      name: 'Ловец знамений',           desc: 'Собрать 10 Знамений на Алтаре',         check: () => (stats.omens || 0) >= 10 },
  { id: 'omen_50',      name: 'Око Бездны',               desc: 'Собрать 50 Знамений на Алтаре',         check: () => (stats.omens || 0) >= 50 },
  { id: 'mil_3',        name: 'Веха за вехой',            desc: 'Выполнить 3 вехи за один забег',        check: () => milestoneIdx >= 3 },
  { id: 'roll_50',      name: 'Плати Душой',              desc: 'Сделать 50 круток Призыва за всё время', check: () => stats.rolls >= 50 },
  { id: 'speed_4',      name: 'Скользящее время',         desc: 'Поиграть на ускорении ×4',              check: () => stats.speedUsed >= 1 },

  /* --- Пакет «Больше ачивок» --- */
  { id: 'stack_2',      name: 'Начало стопки',            desc: 'Иметь стак ×2 на Алтаре',                check: () => grid.some(row => row.some(it => it && it.stacks >= 2)) },
  { id: 'stack_5',      name: 'Небоскрёб',                desc: 'Довести стак до ×5',                     check: () => grid.some(row => row.some(it => it && it.stacks >= 5)) },
  { id: 'grid_full',    name: 'Квадратный метр',          desc: 'Заполнить весь Алтарь картами',          check: () => cardsOnGrid() >= playableSize * playableSize },
  { id: 'roll_25k',     name: 'Рука не устала',           desc: 'Сделать 25 000 круток за всё время',     check: () => stats.rolls >= 25000 },
  { id: 'rich_1b',      name: 'Тёмный Биллингс',      desc: 'Иметь 1 000 000 000 Тёмной энергии разом',           check: () => crystals >= 1e9 },
  { id: 'inc_1k',       name: 'Экономика Бездны',         desc: 'Достичь дохода +1000/сек',               check: () => stats.maxInc >= 1000 },
  { id: 'inc_10k',      name: 'Вечный двигатель',         desc: 'Достичь дохода +10 000/сек',             check: () => stats.maxInc >= 10000 },
  { id: 'epoch_7',      name: 'Смена тысячелетий',        desc: 'Начать Эпоху 7',                         check: () => epoch >= 7 },
  { id: 'epoch_10',     name: 'По ту сторону',            desc: 'Начать Эпоху 10',                        check: () => epoch >= 10 },
  { id: 'seals_100',    name: 'Души под замком',          desc: 'Заработать 500 Душ за всё время',        check: () => (stats.soulsEarned || 0) >= 500 },
  { id: 'relic_all',    name: 'Полный арсенал',           desc: 'Собрать все Реликвии',                   check: () => RELICS_OWNED.size >= RELICS.length },
  { id: 'coll_25',      name: 'Знаток могил',             desc: 'Открыть 25 разных карт',                 check: () => discovered.size >= 25 },
  { id: 'coll_all',     name: 'Архивариус Бездны',        desc: 'Открыть все карты коллекции',            check: () => discovered.size >= Object.keys(CARDS).length },
  { id: 'omen_100',     name: 'Провидец',                 desc: 'Собрать 100 Знамений на Алтаре',         check: () => (stats.omens || 0) >= 100 },
  { id: 'mil_all',      name: 'Вершитель вех',            desc: 'Выполнить все 4 вехи за один забег',     check: () => milestoneIdx >= 4 },
  { id: 'roll_250',     name: 'Жнец Душ',                 desc: 'Сделать 250 круток Призыва за всё время', check: () => stats.rolls >= 250 },
  { id: 'floor_20',     name: 'Легенда Арены',            desc: 'Достичь 20 этажа Арены',                 check: () => stats.floorMax >= 20 },
  { id: 'boss_10',      name: 'Гроза владык',             desc: 'Победить 10 боссов Арены',               check: () => stats.bossKills >= 10 },
  { id: 'casino_net',   name: 'Дом НЕ всегда в плюсе',    desc: 'Выйти из казино в суммарном плюсе +100 000 ТЭ', check: () => Object.values(stats.g || {}).reduce((s, x) => s + (x.net || 0), 0) >= 100000 },
  { id: 'syn_20',       name: 'Симфония синергий',        desc: 'Активировать 20 уникальных пар синергий одновременно', check: () => currentDiversity() >= 20 },
  { id: 'time_10h',     name: 'Бездна смотрит в ответ',   desc: 'Играть 10 часов суммарно',               check: () => gameTime >= 36000 },

  /* --- Пакет – --- */
  { id: 'surge_10',     name: 'Камертон Бездны',          desc: 'Провести 10 ритуалов культистов', check: () => (stats.surges || 0) >= 10 },
  { id: 'diamond_rit',  name: 'Геометр тьмы',             desc: 'Собрать формацию «Ромб» вокруг Алтаря',  check: () => Object.values(INC_CTX.formActive || {}).some(f => f.kind === 'diamond') },
  { id: 'hunt_big',     name: 'Великая Охота',           desc: 'Хищники Алтаря накопили 300 актов охоты за Эпоху (Дикие Угодья)', check: () => (stats.huntActs || 0) >= 300 },
  { id: 'beast_kinds',  name: 'Три рода леса',           desc: 'Иметь на поле зверей Стаи, Стада и Чащи одновременно', check: () => { const s = new Set(); for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) { const it = grid[r][c]; if (it && CARDS[it.cardId] && CARDS[it.cardId].faction === 'beast' && CARDS[it.cardId].subrace && !CARDS[it.cardId].isBuilding) s.add(CARDS[it.cardId].subrace); } return s.size >= 3; } },
  { id: 'alpha_5',      name: 'Корона',                  desc: 'Собрать стаю из 5+ хищников под одной короной альфы', check: () => typeof BEAST_GROUNDS !== 'undefined' && BEAST_GROUNDS && BEAST_GROUNDS.packBest >= 5 },
  { id: 'spirit_1',     name: 'Дух Леса',                desc: 'Дождаться Ухода в Чащу — получить Духа Леса', check: () => [...discovered].some(id => CARDS[id] && CARDS[id].spirit) },
  { id: 'boom_50',      name: 'Пиротехник легиона',       desc: '50 взрывов Хаоса на Алтаре',             check: () => (stats.demonBooms || 0) >= 50 },
  { id: 'elite_10',     name: 'Гроза элит',               desc: 'Разбить 10 элитных отрядов Колыбели Войны', check: () => (stats.eliteKills || 0) >= 10 },
  { id: 'streak_8',     name: 'Серия без промаха',        desc: '8 побед Колыбели Войны подряд',          check: () => (stats.streakMax || 0) >= 8 },

  /* --- v1.11.0: реворк демонов — подрасы Пепел/Мрак/Легион --- */
  { id: 'courts_3',     name: 'Три двора Пекла',          desc: 'Иметь на Алтаре демонов Пепла, Мрака и Легиона одновременно', check: () => { const s = new Set(); for (let r = 0; r < GRID_SIZE; r++) for (let c = 0; c < GRID_SIZE; c++) { const it = grid[r][c]; if (it && CARDS[it.cardId] && CARDS[it.cardId].faction === 'demon' && CARDS[it.cardId].subrace) s.add(CARDS[it.cardId].subrace); } return s.size >= 3; } },
  { id: 'chainfire_25', name: 'Вечный пожар',             desc: 'Цепной пожар поджёг 25 демонов',         check: () => (stats.chainfire || 0) >= 25 },
  { id: 'feast_25',     name: 'Дегустатор хаоса',         desc: 'Пир хаоса накормил 25 мраков чужими взрывами', check: () => (stats.feasts || 0) >= 25 },
  { id: 'form_6',       name: 'Строй не рассыпается',     desc: 'Держать 6 легионеров в строю одновременно', check: () => Object.keys((INC_CTX && INC_CTX.legionForm) || {}).length >= 6 }
];
