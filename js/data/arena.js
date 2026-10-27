'use strict';
/* ============================================================
   ДАННЫЕ: АРЕНА (data/arena.js)
   Пункт 7 ТЗ: HP растёт быстро (×1.6 за этаж), награды — медленно
   (×1.28). Арена упирается в стену через 5-10 этажей и НЕ является
   бесконечным источником дохода. Баланс меняем ТОЛЬКО здесь.
   ============================================================ */

const ARENA = {
  roomsPerFloor: 5,
  /* Базовое HP по номеру комнаты */
  roomHp: [100, 180, 320, 550, 1200],
  bossHpMult: 1.5,
  /* Кривые: HP ×1.6 за этаж, награда ×1.28 (стена на 5-10 этажах) */
  hpGrowth: 1.6,
  rewardBase: [40, 55, 75, 100, 150],
  rewardGrowth: 1.28,
  bossNames: ['Владыка Бездны', 'Кровавый Титан', 'Древний Ужас', 'Пожиратель Миров', 'Тёмный Владыка', 'Король Мёртвых'],
  enemyNames: {
    undead: 'Скелет-стражник', demon: 'Одержимый легионер',
    cultist: 'Кровавый сектант', beast: 'Взбесившийся зверь'
  },
  enemyGlyphs: { undead: '💀', demon: '👹', cultist: '🩸', beast: '🐕' }
};

function arenaEnemyHp(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  let hp = Math.round(ARENA.roomHp[room - 1] * Math.pow(ARENA.hpGrowth, floor - 1) * (0.85 + Math.random() * 0.3));
  if (isBoss) hp = Math.round(hp * ARENA.bossHpMult);
  return hp;
}
function arenaReward(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  let rew = Math.round(ARENA.rewardBase[room - 1] * Math.pow(ARENA.rewardGrowth, floor - 1));
  if (isBoss) rew = Math.round(rew * 2.2);
  return rew;
}
