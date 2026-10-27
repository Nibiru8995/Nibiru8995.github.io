'use strict';
/* ============================================================
   ДАННЫЕ: АРЕНА — «КОЛЫБЕЛЬ ВОЙНЫ» (data/arena.js)
   ФИДБЕК 10 (раунд 3): арена переделана в АВТОБАТЛЕР — отряды
   карт маршируют к врагам и дерутся сами, с потерями и анимацией.
   Награды сохранены (×1.5/этаж, босс — ×3 + трофей ★3).
   Баланс волн меняем ТОЛЬКО здесь.
   ============================================================ */

const ARENA = {
  roomsPerFloor: 5,
  /* Кривые: награда ×1.5 за этаж (стена мягкая), босс — ×3 */
  rewardBase: [80, 120, 170, 230, 330],
  rewardGrowth: 1.5,
  bossRewardMult: 3,
  bossNames: ['Владыка Бездны', 'Кровавый Титан', 'Древний Ужас', 'Пожиратель Миров', 'Тёмный Владыка', 'Король Мёртвых'],
  enemyNames: {
    undead: 'Скелет-стражник', demon: 'Одержимый легионер',
    cultist: 'Кровавый сектант', beast: 'Взбесившийся зверь'
  },
  /* --- ВОЛНЫ АВТОБАТЛЕРА ---
     count(floor,room) — число вражеских отрядов;
     tierW(floor) — веса редкостей врага; hpMult/dmgMult — рост этажа */
  count: (f, rm) => Math.min(8, 2 + Math.ceil((f + rm) / 2)),
  tierW: f => ({ 1: Math.max(0, 60 - 6 * f), 3: 40, 4: Math.min(45, 4 * f + 4), 5: Math.min(30, 2 * f - 2) }),
  hpMult: f => 1 + 0.18 * (f - 1),
  dmgMult: f => 1 + 0.15 * (f - 1),
  bossHpMult: 2 + 0.25,   /* босс = ★5-статы ×(2 + 0.25·этаж) */
  bossEscort: 2,          /* провожатых у босса */
  /* Поле боя (внутренние координаты канваса) */
  FIELD_W: 560,
  FIELD_H: 320,
  /* Макс отрядов игрока на поле */
  heroSquadsMax: 8,
  squadSize: 3            /* копий карты в одном отряде */
};

function arenaReward(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  let rew = Math.round(ARENA.rewardBase[room - 1] * Math.pow(ARENA.rewardGrowth, floor - 1));
  if (isBoss) rew = Math.round(rew * ARENA.bossRewardMult);
  return rew;
}

/* Фракция волны: цикл по этажам/комнатам */
function waveFaction(floor, room) {
  return FACTION_KEYS[(floor * 2 + room) % 4];
}

/* Спрайт врага: ординарцы и боссы — отдельные дарк-фэнтези ассеты */
function foeSprite(f, isBoss) {
  return 'assets/arena/' + (isBoss ? 'boss_' : 'foe_') + f + '.png';
}
