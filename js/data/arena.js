'use strict';
/* ============================================================
   ДАННЫЕ: АРЕНА — «КОЛЫБЕЛЬ ВОЙНЫ» v1.2 (data/arena.js)
   Автобатлер: отряды карт маршируют к волнам и дерутся сами.
   v1.2: ЭЛИТНЫЕ ВОЛНЫ (каждая 3-я комната), награды растут
   с ЭПОХОЙ (арена остаётся актуальной весь забег — петля
   баланса арена↔алтарь), имена боссов по фракциям волны.
   Баланс волн меняем ТОЛЬКО здесь.
   ============================================================ */

const ARENA = {
  roomsPerFloor: 5,
  /* Кривые: награда ×1.5 за этаж (стена мягкая), босс — ×3, элита — ×1.6 */
  rewardBase: [80, 120, 170, 230, 330],
  rewardGrowth: 1.5,
  bossRewardMult: 3,
  eliteRewardMult: 1.6,
  eliteRoom: 3,           /* каждая 3-я комната — Элита */
  /* Награды растут с ЭПОХОЙ: с Э2 +40% за Эпоху — арена кормит экономику весь забег */
  epochRewardMult: e => e <= 2 ? 1 : 1 + 0.4 * (e - 2),
  /* Имена боссов по фракции волны */
  bossNamesByFaction: {
    undead:  ['Владыка Легиона Костей', 'Пастырь Мёртвых'],
    cultist: ['Иерофант Пустого Глаза', 'Голос Девятого Хора'],
    beast:   ['Прародитель Стаи', 'Зуб Дикой Чащи'],
    demon:   ['Архонт Девятого Пекла', 'Пожиратель Тронов']
  },
  enemyNames: {
    undead: 'Скелет-стражник', demon: 'Одержимый легионер',
    cultist: 'Кровавый сектант', beast: 'Взбесившийся зверь'
  },
  eliteName: 'Элитный отряд',
  /* --- ВОЛНА АВТОБАТЛЕРА ---
     count(floor,room) — число вражеских отрядов;
     tierW(floor) — веса редкостей врага; hpMult/dmgMult — рост этажа */
  count: (f, rm) => Math.min(8, 2 + Math.ceil((f + rm) / 2)),
  tierW: f => ({ 1: Math.max(0, 60 - 6 * f), 3: 40, 4: Math.min(45, 4 * f + 4), 5: Math.min(30, 2 * f - 2) }),
  /* Элита: младшие редкости выброшены, бойцы закалённые */
  tierWElite: f => ({ 3: 55, 4: Math.min(40, 10 + 5 * f), 5: Math.max(0, Math.min(25, 3 * f - 4)) }),
  hpMult: f => 1 + 0.18 * (f - 1),
  dmgMult: f => 1 + 0.15 * (f - 1),
  eliteHpMult: 1.25,      /* элита крепче обычных волн своего этажа */
  bossHpMult: 2 + 0.25,   /* босс = ★5-статы ×(2 + 0.25·этаж) */
  bossEscort: 2,          /* провожатых у босса */
  /* Поле боя (внутренние координаты канваса) */
  FIELD_W: 560,
  FIELD_H: 320,
  /* Макс отрядов игрока на поле */
  heroSquadsMax: 8,
  squadSize: 3            /* копий карты в одном отряде */
};

/* Награда: база × рост этажа × босс/элита × МНОЖИТЕЛЬ ЭПОХИ (v1.2).
   Серия побед добавляется в logic/arena.js поверх. */
function arenaReward(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  const isElite = room === ARENA.eliteRoom;
  let rew = Math.round(ARENA.rewardBase[room - 1] * Math.pow(ARENA.rewardGrowth, floor - 1));
  if (isBoss) rew = Math.round(rew * ARENA.bossRewardMult);
  else if (isElite) rew = Math.round(rew * ARENA.eliteRewardMult);
  rew = Math.round(rew * ARENA.epochRewardMult(epoch));
  return rew;
}

function isEliteRoom(room) { return room === ARENA.eliteRoom && room !== ARENA.roomsPerFloor; }

/* Фракция волны: цикл по этажам/комнатам */
function waveFaction(floor, room) {
  return FACTION_KEYS[(floor * 2 + room) % 4];
}

/* Спрайт врага: ординарцы и боссы — отдельные дарк-фэнтези ассеты */
function foeSprite(f, isBoss) {
  return 'assets/arena/' + (isBoss ? 'boss_' : 'foe_') + f + '.png';
}
