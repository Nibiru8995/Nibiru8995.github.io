'use strict';
/* ============================================================
   ДАННЫЕ: АРЕНА (data/arena.js)
   Арена ВЫГОДНА: награды растут ×1.5 за этаж (HP ×1.6) — стена
   мягкая, а боссы дают трофей (карту ★3). Баланс меняем ТОЛЬКО здесь.
   ============================================================ */

const ARENA = {
  roomsPerFloor: 5,
  /* Базовое HP по номеру комнаты */
  roomHp: [100, 180, 320, 550, 1200],
  bossHpMult: 1.5,
  /* Кривые: HP ×1.6 за этаж, награда ×1.5 (стена мягкая) */
  hpGrowth: 1.6,
  rewardBase: [80, 120, 170, 230, 330],
  rewardGrowth: 1.5,
  bossRewardMult: 3,
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
  if (isBoss) rew = Math.round(rew * ARENA.bossRewardMult);
  return rew;
}
