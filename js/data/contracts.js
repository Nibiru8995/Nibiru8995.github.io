'use strict';
/* ============================================================
   ДАННЫЕ: КОНТРАКТЫ ЭПОХИ (data/contracts.js) — v1.2.9
   Пакт с Тьмой: серия из 6 заданий на забег, 3 активных сразу.
   Цель — заставить игрока трогать ВСЕ системы (ритуал, арену,
   знамения, стаки, гачу) между вехами, а не только любимую связку.
   Правила (решение планёрки 1.2.9):
   - награда — крутки + кристаллы СТРОГО мимо порога Эпохи (incomeExempt);
   - цели фильтруются по механике фракции и открытым фичам;
   - за все 6 — «ПАКТ ИСПОЛНЕН»: +1 печать 🔱 и шоу;
   - прогресс считается дельтами от stats/живых значений,
     в сохранении лежит только плоский массив контрактов.
   ============================================================ */

/* Шаблон контракта:
   id        — ключ (сохраняется в забеге)
   icon      — значок в списке
   text(n)   — формулировка с подставленной целью
   kind      — 'delta' (накопительный, база вычитается) | 'live' (текущее значение)
   val()     — текущее значение метрики (для live) или накопитель stats (для delta)
   target(e) — цель с масштабированием от Эпохи
   reward(e) — {rolls, gold} (gold — по цене крутки на момент взятия)
   ok()      — фильтр доступности: механика/фича/эпоха               */
const CONTRACT_TPL = [
  {
    id: 'rituals', icon: '🔥', kind: 'delta', stat: 'surges',
    text: n => 'Проведите ' + n + ' ритуал(ов) до конца',
    val: () => stats.surges || 0,
    target: e => 4 + Math.round(e / 3),
    ok: () => FACTION_INFO[faction].mechanic === 'formation'
  },
  {
    id: 'pairs', icon: '🔗', kind: 'live',
    text: n => 'Держите на Алтаре ' + n + ' уникальных пар(ы)',
    val: () => currentDiversity(),
    target: e => 6 + 2 * Math.min(6, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic !== 'formation'
  },
  {
    id: 'army', icon: '⛓', kind: 'live',
    text: n => 'Соберите непрерывную армию из ' + n + ' карт',
    val: () => incomeCache.armyBest || 0,
    target: e => 10 + 2 * Math.min(10, e),
    ok: () => FACTION_INFO[faction].mechanic === 'chain'
  },
  {
    id: 'rolls', icon: '🎲', kind: 'delta', stat: 'rolls',
    text: n => 'Сделайте ' + n + ' круток гачи',
    val: () => stats.rolls || 0,
    target: e => 25 + 5 * Math.min(9, e),
    ok: () => true
  },
  {
    id: 'rooms', icon: '⚔', kind: 'delta', stat: 'roomsWon',
    text: n => 'Победите в ' + n + ' комнат(ах) Арены',
    val: () => stats.roomsWon || 0,
    target: e => 6 + Math.round(e / 2),
    ok: () => epochHasArena(epoch)
  },
  {
    id: 'omens', icon: '✨', kind: 'delta', stat: 'omens',
    text: n => 'Соберите ' + n + ' знамени(й) с Алтаря',
    val: () => stats.omens || 0,
    target: e => 3 + Math.min(6, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'stacks', icon: '🧱', kind: 'live',
    text: n => 'Доведите ' + n + ' карт(ы) до стака ×3 и больше',
    val: () => { let k = 0; grid.forEach(row => row.forEach(it => { if (it && it.stacks >= 3) k++; })); return k; },
    target: e => 3 + Math.min(6, Math.floor(e / 3)),
    ok: () => true
  },
  {
    id: 'sell', icon: '💰', kind: 'delta', stat: 'soldGold',
    text: n => 'Продайте дубликатов на ' + fmtShort(n) + ' 💎',
    val: () => stats.soldGold || 0,
    target: e => Math.round(rollCost() * (30 + 5 * Math.min(8, e))),
    ok: () => true
  },
  {
    id: 'summons', icon: '🪦', kind: 'delta', stat: 'summons',
    text: n => 'Получите ' + n + ' бесплатных карт от зданий',
    val: () => stats.summons || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'hunts', icon: '🦷', kind: 'delta', stat: 'predKills',
    text: n => 'Совершите ' + n + ' убийств на пищевой цепи',
    val: () => stats.predKills || 0,
    target: e => 3 + Math.min(9, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'cycle'
  },
  {
    id: 'booms', icon: '💥', kind: 'delta', stat: 'demonBooms',
    text: n => 'Дождитесь ' + n + ' взрыв(ов) Хаоса',
    val: () => stats.demonBooms || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'chaos'
  },
  {
    id: 'places', icon: '⚜', kind: 'delta', stat: 'placed',
    text: n => 'Разместите ' + n + ' карт(ы) на Алтаре',
    val: () => stats.placed || 0,
    target: e => 20 + 4 * Math.min(10, e),
    ok: () => true
  }
];

const CONTRACTS_PER_RUN = 6;   // всего контрактов за забег (6-й = «Пакт»)
const CONTRACTS_ACTIVE = 3;    // одновременно активных
const CONTRACT_REROLL_DELAY = 3; // сек до появления следующего

/* Награда контракта: крутки + кристаллы = 10 × цена крутки (мимо порога).
   Поздние Эпохи — чуть щедрее по круткам. */
function contractReward(e) {
  return { rolls: 4 + Math.min(6, Math.floor(e / 3)), goldMult: 10 };
}
