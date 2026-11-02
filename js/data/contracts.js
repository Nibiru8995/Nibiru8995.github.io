'use strict';
/* ============================================================
   ДАННЫЕ: КОНТРАКТЫ ЭПОХИ (data/contracts.js) — v1.8.0
   ОБЩИЙ пул для рас, у которых ещё нет своего (культ/звери/демоны).
   Для НЕЖИТИ действует БОЛЬШОЙ пул из 80 контрактов с req-требованиями
   по стартовой колоде — js/data/contracts_undead.js.
   Правила Тёмного Пакта (v1.8.0):
   - на забег предлагается 4 случайных контракта из пула, ВСЕ активны
     сразу; новые взамен исполненных не приходят;
   - награда по сложности: обычный 1 Душа, сложный 2, очень сложный 3
     (CONTRACT_REWARD в contracts_undead.js); общий пул — обычные;
   - за все 4 — «ПАКТ ИСПОЛНЕН»: +2 Души (печати 🔱 удалены);
   - в игре контракты выводятся СПИСКОМ БЛОКОВ ПОД ГРИДОМ
     (#contractsPanel): сверху название, под ним задача,
     справа — награда в душах;
   - прогресс считается дельтами от stats/живых значений.
   ============================================================ */

const CONTRACT_TPL = [
  {
    id: 'rituals', name: 'Ритуалы', icon: '🔥', diff: 1, kind: 'delta', stat: 'surges',
    text: n => 'Проведите ' + n + ' ритуал(ов) до конца',
    val: () => stats.surges || 0,
    target: e => 4 + Math.round(e / 3),
    ok: () => FACTION_INFO[faction].mechanic === 'formation'
  },
  {
    id: 'pairs', name: 'Созвездие пар', icon: '🔗', diff: 1, kind: 'live',
    text: n => 'Держите на Алтаре ' + n + ' уникальных пар(ы)',
    val: () => currentDiversity(),
    target: e => 6 + 2 * Math.min(6, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic !== 'formation'
  },
  {
    id: 'army', name: 'Армия Тьмы', icon: '⛓', diff: 1, kind: 'live',
    text: n => 'Соберите непрерывную армию из ' + n + ' карт',
    val: () => incomeCache.armyBest || 0,
    target: e => 10 + 2 * Math.min(10, e),
    ok: () => FACTION_INFO[faction].mechanic === 'chain'
  },
  {
    id: 'rolls', name: 'Кости Бездны', icon: '🎲', diff: 1, kind: 'delta', stat: 'rolls',
    text: n => 'Сделайте ' + n + ' круток Призыва',
    val: () => stats.rolls || 0,
    target: e => 10 + 2 * Math.min(10, e),
    ok: () => true
  },
  {
    id: 'rooms', name: 'Комнаты Арены', icon: '⚔', diff: 1, kind: 'delta', stat: 'roomsWon',
    text: n => 'Победите в ' + n + ' комнат(ах) Арены',
    val: () => stats.roomsWon || 0,
    target: e => 6 + Math.round(e / 2),
    okf: 'arena'
  },
  {
    id: 'omens', name: 'Знамения', icon: '✨', diff: 1, kind: 'delta', stat: 'omens',
    text: n => 'Соберите ' + n + ' знамени(й) с Алтаря',
    val: () => stats.omens || 0,
    target: e => 3 + Math.min(6, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'deck', name: 'Колода расы', icon: '🃏', diff: 1, kind: 'live',
    text: n => 'Соберите колоду расы из ' + n + ' карт в Гримуаре',
    val: () => deckCountOf(faction),
    target: e => Math.min(64, 16 + 4 * e),
    ok: () => true
  },
  {
    id: 'summons', name: 'Призывы зданий', icon: '🪦', diff: 1, kind: 'delta', stat: 'summons',
    text: n => 'Получите ' + n + ' бесплатных карт от зданий',
    val: () => stats.summons || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'hunts', name: 'Охота', icon: '🦷', diff: 1, kind: 'delta', stat: 'predKills',
    text: n => 'Совершите ' + n + ' убийств на пищевой цепи',
    val: () => stats.predKills || 0,
    target: e => 3 + Math.min(9, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'cycle'
  },
  {
    id: 'booms', name: 'Взрывы Хаоса', icon: '💥', diff: 1, kind: 'delta', stat: 'demonBooms',
    text: n => 'Дождитесь ' + n + ' взрыв(ов) Хаоса',
    val: () => stats.demonBooms || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'chaos'
  },
  {
    id: 'places', name: 'Застройка Алтаря', icon: '⚜', diff: 1, kind: 'delta', stat: 'placed',
    text: n => 'Разместите ' + n + ' карт(ы) на Алтаре',
    val: () => stats.placed || 0,
    target: e => 20 + 4 * Math.min(10, e),
    ok: () => true
  }
];

/* v1.8.0: 4 контракта на забег, все 4 активны сразу (раньше было 6/3 с перевыдачей). */
const CONTRACTS_PER_RUN = 4;
const CONTRACTS_ACTIVE = 4;
