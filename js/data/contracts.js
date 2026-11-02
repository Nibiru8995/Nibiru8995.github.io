'use strict';
/* ============================================================
   ДАННЫЕ: КОНТРАКТЫ ЭПОХИ (data/contracts.js) — v1.7.0 «Плата Душами»
   Пакт с Тьмой: серия из 6 заданий на забег, 3 активных сразу.
   Цель — заставить игрока трогать ВСЕ системы (ритуал, арену,
   знамения, колоду, гачу) между вехами, а не только любимую связку.
   Правила (v1.7.0):
   - НАГРАДА КОНТРАКТА — 1 ДУША (бесплатные крутки убраны совсем,
     ТЭ сверх награды снята; души — валюта Призыва в Гримуаре);
   - в игре контракты выводятся СПИСКОМ БЛОКОВ ПОД ГРИДОМ
     (#contractsPanel): сверху название, под ним задача,
     справа — награда в душах;
   - цели фильтруются по механике фракции и открытым фичам;
   - за все 6 — «ПАКТ ИСПОЛНЕН»: +1 печать 🔱 и шоу;
   - прогресс считается дельтами от stats/живых значений,
     в сохранении лежит только плоский массив контрактов.
   ============================================================ */

/* Шаблон контракта:
   id        — ключ (сохраняется в забеге)
   name      — КОРОТКОЕ ИМЯ блока (панель под гридом, v1.7.0)
   icon      — значок блока
   text(n)   — формулировка задачи с подставленной целью
   kind      — 'delta' (накопительный, база вычитается) | 'live' (текущее значение)
   val()     — текущее значение метрики (для live) или накопитель stats (для delta)
   target(e) — цель с масштабированием от Эпохи
   ok()      — фильтр доступности: механика/фича/эпоха               */
const CONTRACT_TPL = [
  {
    id: 'rituals', name: 'Ритуалы', icon: '🔥', kind: 'delta', stat: 'surges',
    text: n => 'Проведите ' + n + ' ритуал(ов) до конца',
    val: () => stats.surges || 0,
    target: e => 4 + Math.round(e / 3),
    ok: () => FACTION_INFO[faction].mechanic === 'formation'
  },
  {
    id: 'pairs', name: 'Созвездие пар', icon: '🔗', kind: 'live',
    text: n => 'Держите на Алтаре ' + n + ' уникальных пар(ы)',
    val: () => currentDiversity(),
    target: e => 6 + 2 * Math.min(6, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic !== 'formation'
  },
  {
    id: 'army', name: 'Армия Тьмы', icon: '⛓', kind: 'live',
    text: n => 'Соберите непрерывную армию из ' + n + ' карт',
    val: () => incomeCache.armyBest || 0,
    target: e => 10 + 2 * Math.min(10, e),
    ok: () => FACTION_INFO[faction].mechanic === 'chain'
  },
  {
    id: 'rolls', name: 'Кости Бездны', icon: '🎲', kind: 'delta', stat: 'rolls',
    text: n => 'Сделайте ' + n + ' круток Призыва',
    val: () => stats.rolls || 0,
    target: e => 10 + 2 * Math.min(10, e),
    ok: () => true
  },
  {
    id: 'rooms', name: 'Комнаты Арены', icon: '⚔', kind: 'delta', stat: 'roomsWon',
    text: n => 'Победите в ' + n + ' комнат(ах) Арены',
    val: () => stats.roomsWon || 0,
    target: e => 6 + Math.round(e / 2),
    ok: () => epochHasArena(epoch)
  },
  {
    id: 'omens', name: 'Знамения', icon: '✨', kind: 'delta', stat: 'omens',
    text: n => 'Соберите ' + n + ' знамени(й) с Алтаря',
    val: () => stats.omens || 0,
    target: e => 3 + Math.min(6, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'stacks', name: 'Стопки', icon: '🧱', kind: 'live',
    text: n => 'Держите на Алтаре ' + n + ' карт(ы) со стаком ×3 и больше',
    val: () => { let k = 0; grid.forEach(row => row.forEach(it => { if (it && it.stacks >= 3) k++; })); return k; },
    target: e => 3 + Math.min(6, Math.floor(e / 3)),
    ok: () => true
  },
  {
    /* v1.6.0: прежний контракт «Продайте дубликаты» умер вместе с продажей
       (коллекция вечная, дубликаты копятся на будущие Улучшения).
       Замена — живая метрика новой системы: размер колоды расы забега. */
    id: 'deck', name: 'Колода расы', icon: '🃏', kind: 'live',
    text: n => 'Соберите колоду расы из ' + n + ' карт(ы) в Гримуаре',
    val: () => { const d = activeDeckFor(faction); return d ? d.cards.length : 0; },
    target: e => Math.min(64, 16 + 4 * e),
    ok: () => true
  },
  {
    id: 'summons', name: 'Призывы зданий', icon: '🪦', kind: 'delta', stat: 'summons',
    text: n => 'Получите ' + n + ' бесплатных карт от зданий',
    val: () => stats.summons || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => true
  },
  {
    id: 'hunts', name: 'Охота', icon: '🦷', kind: 'delta', stat: 'predKills',
    text: n => 'Совершите ' + n + ' убийств на пищевой цепи',
    val: () => stats.predKills || 0,
    target: e => 3 + Math.min(9, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'cycle'
  },
  {
    id: 'booms', name: 'Взрывы Хаоса', icon: '💥', kind: 'delta', stat: 'demonBooms',
    text: n => 'Дождитесь ' + n + ' взрыв(ов) Хаоса',
    val: () => stats.demonBooms || 0,
    target: e => 4 + Math.min(8, Math.floor(e / 2)),
    ok: () => FACTION_INFO[faction].mechanic === 'chaos'
  },
  {
    id: 'places', name: 'Застройка Алтаря', icon: '⚜', kind: 'delta', stat: 'placed',
    text: n => 'Разместите ' + n + ' карт(ы) на Алтаре',
    val: () => stats.placed || 0,
    target: e => 20 + 4 * Math.min(10, e),
    ok: () => true
  }
];

const CONTRACTS_PER_RUN = 6;   // всего контрактов за забег (6-й = «Пакт»)
const CONTRACTS_ACTIVE = 3;    // одновременно активных
const CONTRACT_REROLL_DELAY = 3; // сек до появления следующего

/* v1.7.0: награда контракта — 1 ДУША. Бесплатные крутки убраны совсем,
   ТЭ сверх награды снята (источник инфляции Эпох больше не нужен). */
const CONTRACT_SOUL_REWARD = 1;
