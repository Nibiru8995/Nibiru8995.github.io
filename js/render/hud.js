'use strict';
/* ============================================================
   РЕНДЕР: HUD (render/hud.js)
   Верхняя панель, кнопки круток (под Алтарём), большая кнопка
   Эпохи (над Алтарём), скрытие заблокированных фич (пункт 9 ТЗ),
   баннер режимов, тултип карт.
   ============================================================ */

/* Скрытие недоступных фич: до разблокировки их ВООБЩЕ НЕ ВИДНО */
function applyFeatureLocks() {
  const arenaOn = epochHasArena(epoch);
  const casinoOn = epochHasCasino(epoch);
  /* v1.2.7: арена — компактный док под гридом + оверлей «поле боя» */
  const arenaDock = $('arenaDock'), arenaOverlay = $('arenaOverlay'), fightersPanel = $('fightersPanel');
  if (arenaDock) arenaDock.style.display = arenaOn ? '' : 'none';
  if (arenaOverlay) arenaOverlay.classList.toggle('hidden-feature', !arenaOn);
  if (fightersPanel) fightersPanel.style.display = arenaOn ? '' : 'none';
  ['bulkDup', 'bulk1', 'bulkAll'].forEach(id => { const b = $(id); if (b) b.style.display = arenaOn ? '' : 'none'; });
  const cb = $('casinoBtn');
  if (cb) cb.style.display = casinoOn ? '' : 'none';
  /* v1.2.9: контракты скрыты в обучении/чит-режиме — прогресс там не идёт */
  const ctb = $('contractsBtn');
  if (ctb) ctb.style.display = noSave ? 'none' : '';
}

/* v1.2.9.1 (perf): тяжёлые подрендеры (applyFeatureLocks, строка статистики
   поля, слоты реликвий, шкала ритуала, бейдж контрактов) — раз в 200мс,
   остальное (числа кристаллов/ставки/кнопки Эпохи) — каждый кадр.
   Прямые вызовы updateHUD() (без timestamp) как раньше — всё сразу. */
let hudHeavyLast = 0;

function updateHUD(now) {
  const heavy = now === undefined || (now - hudHeavyLast) >= 200;
  if (heavy) {
    if (now !== undefined) hudHeavyLast = now;
    applyFeatureLocks();
  }
  $('crystals').textContent = fmt(crystals);
  $('sealsTop').textContent = fmt(seals);
  $('rate').textContent = '+' + calculateIncome().toFixed(2) + '/сек';

  /* Pity — гарантия до старшей ДОСТУПНОЙ редкости (показ у кнопок круток).
     «Череп Владыки» (реликвия) приближает ★4-гарантию */
  const unlocked = unlockedRarities();
  const p4m = pity4Max();
  let pity = 'Гарантия: ';
  if (unlocked.includes(5)) pity += 'до ★4: ' + Math.max(0, p4m - pity4) + ' · до ★5: ' + Math.max(0, 80 - pity5);
  else if (unlocked.includes(4)) pity += 'до ★4: ' + Math.max(0, p4m - pity4);
  else pity += 'до ★3: ' + Math.max(0, p4m - pity4);
  $('pity').textContent = pity;

  const rc = rollCost();
  /* v1.2.9.1: бесплатная часть пачки списывается сперва, поэтому
     платной цены хватает «не на все N» — кнопка остаётся живой. */
  [1, 10, 100, 1000].forEach(n => {
    const el = $('roll' + n);
    const freeN = Math.min(freeRolls, n);
    const paidN = n - freeN;
    el.disabled = false;
    const cost = el.querySelector('.cost');
    if (paidN === 0) {
      cost.textContent = n === 1 ? 'Бесплатно ×' + freeRolls : 'Бесплатно';
      el.classList.add('free-roll');
      el.disabled = false;
      return;
    }
    el.classList.remove('free-roll');
    el.disabled = crystals < paidN * rc;
    if (cost) cost.textContent = fmt(paidN * rc) + (freeN ? ' (×' + freeN + ' бесплатные)' : '');
  });
  /* v1.2.9.1: «ВСЕ ДЕНЬГИ» — честный счётчик: платные по текущей цене + бесплатные */
  const allN = Math.floor(Math.max(0, crystals) / rc) + freeRolls;
  $('rollAll').disabled = allN <= 0;
  $('rollAll').querySelector('.cost').textContent = '×' + fmtShort(allN) + ' круток';

  /* Большая кнопка ЭПОХИ над Алтарём: всегда кликабельна —
     порог достигнут → Вознесение, нет → открыть Меню Эпохи.
     ФИДБЕК (раунд 4): у Эпох есть имена-темы, кнопка показывает
     прогресс порога ЗАЛИВКОЙ фона (--pct) и честный текст
     «НАЧАТЬ ЭПОХУ N» вместо прежнего «начать новую». */
  const p = epochProgress();
  const upBtn = $('epochUpBtn');
  const label = $('epochBtnLabel');
  if (label) label.innerHTML = 'Эпоха ' + epoch + ' <small class="ep-name">· ' + epochName(epoch) + '</small>';
  if (canEpochUp()) {
    upBtn.disabled = false;
    upBtn.classList.remove('notready');
    upBtn.classList.add('ready');
    upBtn.style.setProperty('--pct', '100%');
    upBtn.querySelector('.cost').textContent = 'Начать Эпоху ' + (epoch + 1) + ' «' + epochName(epoch + 1) + '» → +' + epochSealsGain(epoch) + ' печатей';
  } else {
    upBtn.disabled = false;
    upBtn.classList.remove('ready');
    upBtn.classList.add('notready');
    upBtn.style.setProperty('--pct', (Math.floor(p.pct * 100)) + '%');
    upBtn.querySelector('.cost').textContent = fmtShort(p.earned) + ' / ' + fmtShort(p.threshold) + ' · ' + Math.floor(p.pct * 100) + '%';
  }
  const achvBtnCost = $('achvBtn') && $('achvBtn').querySelector('.cost');
  if (achvBtnCost) achvBtnCost.textContent = achvCount() + ' / ' + ACHIEVEMENTS.length;
  /* живой индикатор армии/бафов в строке над Алтарём */
  if (heavy) {
    if (typeof updateGridStats === 'function') updateGridStats();
    /* Слоты реликвий над Алтарём + большая шкала ритуала (v1.2.6) */
    if (typeof renderRelicSlots === 'function') renderRelicSlots();
    if (typeof renderRitualBar === 'function') renderRitualBar();
    if (typeof renderContractsBtn === 'function') renderContractsBtn(); /* v1.2.9: бейдж Тёмного Пакта */
    /* Резец Тьмы: живой визуал боя в «Колыбели Войны» */
    if (typeof renderArenaDockVisual === 'function') renderArenaDockVisual();
  }
}

function updateBanner() {
  const b = $('selectionBanner');
  if (placingMode && pendingCard) {
    b.innerHTML = 'Выбрана карта: <b>' + CARDS[pendingCard].name + '</b>. Кликните по подсвеченной клетке. ПКМ/Esc — отмена.';
    b.classList.add('show');
  } else if (deleteMode) {
    b.innerHTML = 'Режим удаления. Кликните по карте — она будет удалена навсегда. Esc — отмена.';
    b.classList.add('show');
  } else if (moveMode) {
    b.innerHTML = moveSource ? 'Перемещение: кликните по свободной подсвеченной клетке. Esc — отмена.' : 'Перемещение: кликните по карте на поле. Esc — отмена.';
    b.classList.add('show');
  } else b.classList.remove('show');
}

/* Тултип карты на гриде / в коллекции */
function showCardTooltip(e, card, income, r, c) {
  let linksHtml = '';
  if (r !== undefined && c !== undefined) {
    const partners = getNeighbors(r, c)
      .filter(n => linked(card, CARDS[n.item.cardId]))
      .map(n => {
        const pair = findPair(card, CARDS[n.item.cardId]);
        if (!pair) return null;
        /* Эффективный фактор звена считает computeIncome (linkFactors) — единая правда.
           0 = мёртвое звено (культ вне ритуала), <1 = повтор */
        const lf = incomeCache.linkFactors ? incomeCache.linkFactors[linkKey(r, c, n.r, n.c)] : undefined;
        const factor = lf === undefined ? 1 : lf;
        if (factor === 0) return '<span class="tt-bad">' + pair.text + ' (с ' + CARDS[n.item.cardId].name + ') — МЕРТВО: вне ритуала</span>';
        return '<span class="tt-good">' + pair.text + ' (с ' + CARDS[n.item.cardId].name + ')' +
          (factor < 1 ? ' <b style="color:#ffd34d">повтор ×' + factor + '</b>' : '') + '</span>';
      }).filter(Boolean);
    linksHtml = '<div class="tt-synergy"><div class="tt-synergy-title">Активные звенья</div>' +
      (partners.length ? partners.join('<br>') : '<span style="color:#8a6a4a;">Нет активных звеньев с соседями.</span>') + '</div>';
  } else {
    const ps = pairsForCard(card);
    if (ps.length) linksHtml = '<div class="tt-synergy"><div class="tt-synergy-title">Возможные звенья</div>' +
      ps.map(p => '<span class="tt-good">' + p.text + '</span>').join('<br>') + '</div>';
  }
  let mechLine = '<div class="tt-synergy"><div class="tt-synergy-title">Роль</div>' + roleText(card) + '</div>';
  /* Здание: эффект строится отдельным блоком (SPECIALS содержит его описание) */
  if (card.isBuilding) {
    mechLine = '<div class="tt-synergy"><div class="tt-synergy-title" style="color:#e8c060">Здание — эффект</div><span style="color:#e8c060">' + (SPECIALS[card.id] || '') + '</span></div>';
  }
  /* Уникальная механика (SPECIALS в data/cards.js) + статус активности */
  const sp = SPECIALS[card.id];
  if (sp && !card.isBuilding) {
    let spStatus = '';
    if (r !== undefined && c !== undefined) {
      const it = grid[r] && grid[r][c];
      const sa = it ? specialActive(card, it, r, c) : { active: true };
      spStatus = sa.active ? ' <span style="color:#8fc87f">· АКТИВНА</span>' : ' <span style="color:#e08a8a">· не задействована</span>';
    }
    mechLine += '<div class="tt-synergy"><div class="tt-synergy-title">✦ Особенность</div><span style="color:#e8c060">' + sp + '</span>' + spStatus + '</div>';
  }
  /* ФИДБЕК 3+6: культисты — статус ритуала + НАГЛЯДНЫЕ схемы формаций */
  mechLine += cultistTooltipHTML(card, r, c);
  /* ФИДБЕК 4: звери — РАЦИОН вместо синергий */
  if (card.diet && DIET_INFO[card.diet]) {
    mechLine += '<div class="tt-synergy"><div class="tt-synergy-title" style="color:' + DIET_INFO[card.diet].color + '">Рацион: ' + DIET_INFO[card.diet].name + '</div>' +
      DIET_INFO[card.diet].desc + '</div>';
  }
  /* ФИДБЕК 5: демоны — текущие угли Хаоса */
  if (card.faction === 'demon' && r !== undefined && FACTION_INFO[faction].mechanic === 'chaos') {
    const it = grid[r][c];
    if (it) {
      const em = it.embers || 0;
      let st = em >= 5 ? '<span style="color:#ff6040">ВЗРЫВ на следующем тике!</span>' :
        '<span style="color:#ff9030">Углей: ' + em + '/5</span>' + (em < 2 ? ' — нужен толпа (2+ демона рядом)' : '');
      if (it.boomUntil > gameTime) st += ' · <span style="color:#ff5030">ПЕРЕГРЕВ ×2 (' + Math.ceil(it.boomUntil - gameTime) + 'с)</span>';
      if (it.mutBuff && it.mutBuff !== 1) st += ' · накоплено ×' + it.mutBuff.toFixed(2);
      mechLine += '<div class="tt-synergy"><div class="tt-synergy-title">Угли Хаоса</div>' + st + '</div>';
    }
  }
  tooltip.innerHTML =
    '<div class="tt-name">' + cardArtHTML(card, 'tt-art', '') + '<span>' + card.name + '</span></div>' +
    '<div class="tt-stars">' + starsOf(card.rarity) + ' · ' + FACTION_INFO[card.faction].name + (card.isBuilding ? ' · постройка' : '') + '</div>' +
    (FACTION_INFO[faction].mechanic === 'formation' && card.faction === 'cultist' && !card.isBuilding
      ? '<div class="tt-income" style="color:#c9a227">Дохода нет — вклад в ритуал: ' + (r !== undefined && INC_CTX.ritualCellSpeed && INC_CTX.ritualCellSpeed[r + ',' + c] ? '⚡ +' + INC_CTX.ritualCellSpeed[r + ',' + c].toFixed(2) + '/с заряда' : 'в ритуале') + (r !== undefined && grid[r] && grid[r][c] && grid[r][c].stacks > 1 ? ' · стак ×' + grid[r][c].stacks : '') + '</div>'
      : '<div class="tt-income">Прирост: +' + (income !== undefined ? income.toFixed(2) : card.baseRate.toFixed(2)) + '/сек</div>') +
    mechLine + linksHtml +
    '<div class="tt-flavor">«' + card.flavor + '»</div>';
  tooltip.classList.add('show');
  moveTooltip(e);
}

/* ------- Ритуал культистов в тултипе (v1.2.7: формации без пустых клеток) -------
   Схема — мини-грид: 🔶 алтарь (золотой), фиолетовый — культист,
   тёмный — пустая клетка. Активная формация подсвечена. */
function formationDiagram(kind, activeKind) {
  const cellsDef = {
    cross:  { size: 3, cult: [[0, 1], [1, 0], [2, 1], [1, 2]], empty: [] },
    square: { size: 3, cult: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]], empty: [] },
    diamond:{ size: 5, cult: [[0, 2], [2, 0], [2, 4], [4, 2], [1, 1], [1, 2], [1, 3], [2, 1], [2, 3], [3, 1], [3, 2], [3, 3]], empty: [] }
  };
  const def = cellsDef[kind];
  const mid = (def.size - 1) / 2;
  const isC = (rr, cc) => def.cult.some(([a, b]) => a === rr && b === cc);
  const isE = (rr, cc) => def.empty.some(([a, b]) => a === rr && b === cc);
  let html = '<div class="rt-diag' + (activeKind === kind ? ' active' : '') + '" style="grid-template-columns:repeat(' + def.size + ',11px)">';
  for (let rr = 0; rr < def.size; rr++) for (let cc = 0; cc < def.size; cc++) {
    if (rr === mid && cc === mid) html += '<i class="rt-c rt-altar"></i>';
    else if (isC(rr, cc)) html += '<i class="rt-c rt-cult"></i>';
    else if (isE(rr, cc)) html += '<i class="rt-c rt-empty"></i>';
    else html += '<i class="rt-c"></i>';
  }
  return html + '</div>';
}
function cultistTooltipHTML(card, r, c) {
  if (card.faction !== 'cultist') return '';
  const defs = [
    { kind: 'cross', label: 'Крест ×1.7', hint: '4 по сторонам Алтаря — скорость ×1.7 (пустые клетки не нужны)' },
    { kind: 'square', label: 'Кольцо ×2.0', hint: 'все 8 соседей Алтаря — скорость ×2.0' },
    { kind: 'diamond', label: 'Ромб ×2.6', hint: 'кольцо + 4 вершины (12 карт) — скорость ×2.6' }
  ];
  let status = '';
  if (r !== undefined && c !== undefined && FACTION_INFO[faction].mechanic === 'formation') {
    const inR = INC_CTX.ritual && INC_CTX.ritual.has(r + ',' + c);
    if (RITUAL_SOURCES[card.id]) {
      const f = INC_CTX.formActive[r + ',' + c];
      status = '<div class="tt-synergy"><div class="tt-synergy-title">Ритуал</div>' +
        (f ? '<span style="color:#8fc87f">АКТИВНАЯ ФОРМАЦИЯ: ' + f.label + ' — скорость ×' + f.formMult.toFixed(2) + '</span>'
           : '<span style="color:#e8c060">Формации нет — обложите Алтарь культистами (шкала копится медленнее, но НЕ тает)</span>') + '</div>' +
        '<small style="color:#a08860">Стаки усиливают вклад клетки: заряд ×(1+0.35/стак), выплата +10%/стак</small>';
    } else {
      const form = INC_CTX.formCell[r + ',' + c];
      const cs = (INC_CTX.ritualCellSpeed && INC_CTX.ritualCellSpeed[r + ',' + c]) || 0;
      const outer = INC_CTX.ritualOuter && INC_CTX.ritualOuter.has(r + ',' + c);
      let inner;
      if (form) inner = '<span style="color:#8fc87f">✔ В ФОРМАЦИИ «' + form.label + '» — вклад ⚡' + cs.toFixed(2) + '/с (умножен формацией)</span>';
      else if (inR) inner = '<span style="color:#e8c060">В РИТУАЛЕ — вклад ⚡' + cs.toFixed(2) + '/с заряда</span>';
      else if (outer) inner = '<span style="color:#80e0c0">ВНЕШНИЙ КРУГ (служитель по диагонали от цепи): +5% выплаты и +заряд ритуалу. Стаки усиливают вдвое</span>';
      else inner = '<span style="color:#a08860">Ждёт: поставьте в цепь от Алтаря (прямо) или по диагонали от неё (внешний круг)</span>';
      status = '<div class="tt-synergy"><div class="tt-synergy-title">Ритуал</div>' + inner + '</div>';
    }
  }
  const activeKind = RITUAL_SOURCES[card.id] && r !== undefined && INC_CTX.formActive[r + ',' + c] ? INC_CTX.formActive[r + ',' + c].kind : null;
  return status + '<div class="tt-synergy"><div class="tt-synergy-title">🔯 Формации ритуала (скорость заряда)</div>' +
    '<div class="rt-row">' + defs.map(d => '<div class="rt-item" title="' + d.hint + '">' + formationDiagram(d.kind, activeKind) + '<small>' + d.label + '</small></div>').join('') + '</div>' +
    '<small style="color:#a08860">🔶 Алтарь · фиолетовый — культист · Несколько формаций складывают множители (до ×3.2) · Пустые клетки больше НЕ нужны · УСИЛИТЕЛИ (Маг/Инквизитор/Жрец/Кости/Хтонь) усиливают ВЫПЛАТУ из любого места ритуала · Цепь растёт ПРЯМО, по диагонали — ВНЕШНИЙ КРУГ: +5% выплаты за каждого служителя</small>' +
    '</div>';
}
function roleText(card) {
  if (card.isBuilding) return '🏛 Здание — постройка с постоянным эффектом. Ставится как карта, эффект не растёт от стаков (доход клетки — растёт)';
  if (card.faction === 'cultist') return '🔥 Участник ритуала: дохода нет — даёт вклад в заряд/выплату ритуала (см. Особенность)';
  return {
    builder: '🧱 Строительный блок — основа композиции',
    amplifier: '📡 Усилитель — усиливает партнёров синергиями',
    anchor: '🔱 Якорь — сердце фракционной механики',
    healer: '💚 Поддержка — лечит и стабилизирует',
    burst: '💥 Взрывной — крупный доход в правильной связке',
    predator: '🦁 Хищник — кусает соседних травоядных/падальщиков, растёт на охоте',
    flora: '🌳 Флора — кормит травоядных и лечит хищников, замыкая круговорот',
    scav: '🦅 Падальщик — жиреет с каждой чужой смерти рядом'
  }[card.role] || '—';
}
