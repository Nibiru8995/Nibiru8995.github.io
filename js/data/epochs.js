'use strict';
/*
ДАННЫЕ: ЭПОХИ (data/epochs.js) — v1.8.0 «Вечная Эпоха»
ЭПОХИ БЕСКОНЕЧНЫ и больше НИЧЕГО НЕ ОТКРЫВАЮТ: ни фич, ни поля,
ни редкостей, ни фракций (всё это — покупки за Души в «Улучшениях»,
js/data/upgrades.js). Эпоха — это ИМЯ-ТЕМА и ПОРОГ: сколько Тёмной
энергии нужно ЗАРАБОТАТЬ ЗА ТЕКУЩИЙ ЗАБЕГ (runEarned), чтобы
вознестись в следующую. После последней темы таблицы порог растёт
МНОЖИТЕЛЕМ ×4 за Эпоху — до бесконечности. Награда Вознесения —
+1 Душа (v1.6.0). Печати 🔱 («эссенция») удалены из игры.
 ============================================================*/

const EPOCHS = [
  { name: 'Пробуждение',       threshold: 0 },
  { name: 'Колыбель Войны',    threshold: 9000 },
  { name: 'Кровавые Звёзды',   threshold: 32000 },
  { name: 'Дьявольская Забава', threshold: 120000 },
  { name: 'Пустые Глаза',      threshold: 450000 },
  { name: 'Пятая Печать',      threshold: 1600000 },
  { name: 'Дикие Земли',       threshold: 6000000 },
  { name: 'Красный Клык',      threshold: 24000000 },
  { name: 'Девять Кругов',     threshold: 90000000 },
  { name: 'Кровавый Хаос',     threshold: 360000000 },
  { name: 'Сумерки Владык',    threshold: 1400000000 }
];

/* Имя-тема Эпохи. За пределами таблицы — «За Гранью N» (бесконечность). */
function epochName(e) {
  if (e <= EPOCHS.length) return EPOCHS[e - 1].name;
  return 'За Гранью ' + (e - EPOCHS.length + 1);
}
/* Порог перехода ИЗ эпохи e в e+1; после последней темы — множитель ×4. */
function epochThreshold(e) {
  if (e < EPOCHS.length) return EPOCHS[e].threshold;
  const last = EPOCHS[EPOCHS.length - 1].threshold;
  let t = last, extra = e - EPOCHS.length + 1;
  for (let i = 0; i < extra; i++) t *= 4;
  return t;
}
