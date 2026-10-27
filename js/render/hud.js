'use strict';
/* ============================================================
   РЕНДЕР: HUD (render/hud.js)
   Верхняя панель, кнопки круток (под Алтарём), большая кнопка
   Эпохи (над Алтарём), скрытие заблокированных фич (пункт 9 ТЗ),
   баннер режимов, тултип карт.
   ============================================================ */

/* Скрытие недоступных фич: до разблокировки их ВООБЩЕ НЕ ВИДНО (пункт 9 ТЗ) */
function applyFeatureLocks() {
  const arenaOn = epochHasArena(epoch);
  const casinoOn = epochHasCasino(epoch);
  const arenaCol = $('arenaCol');
  if (arenaCol) arenaCol.style.display = arenaOn ? '' : 'none';
  ['bulkDup', 'bulk1', 'bulkAll'].forEach(id => { const b = $(id); if (b) b.style.display = arenaOn ? '' : 'none'; });
  const cb = $('casinoBtn');
  if (cb) cb.style.display = casinoOn ? '' : 'none';
}

function updateHUD() {
  $('crystals').textContent = fmt(crystals);
  $('sealsTop').textContent = fmt(seals);
  $('rate').textContent = '+' + calculateIncome().toFixed(2) + '/сек';
  applyFeatureLocks();

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
  [1, 10, 100, 1000].forEach(n => {
    const el = $('roll' + n);
    el.disabled = false;
    const cost = el.querySelector('.cost');
    if (n === 1 && freeRolls > 0) {
      cost.textContent = 'БЕСПЛАТНО ×' + freeRolls;
      el.classList.add('free-roll');
      el.disabled = false;
      return;
    }
    el.classList.remove('free-roll');
    el.disabled = crystals < n * rc;
    if (cost) cost.textContent = fmt(n * rc);
  });
  $('rollAll').disabled = crystals < rc;
  $('rollAll').querySelector('.cost').textContent = 'макс. круток';

  /* Большая кнопка ЭПОХИ над Алтарём: всегда кликабельна —
     порог достигнут → Вознесение, нет → открыть Меню Эпохи.
     ФИДБЕК (раунд 4): у Эпох есть имена-темы, кнопка показывает
     прогресс порога ЗАЛИВКОЙ фона (--pct) и честный текст
     «НАЧАТЬ ЭПОХУ N» вместо прежнего «начать новую». */
  const p = epochProgress();
  const upBtn = $('epochUpBtn');
  const label = $('epochBtnLabel');
  if (label) label.innerHTML = '⚜ ЭПОХА ' + epoch + ' <small class="ep-name">· ' + epochName(epoch) + '</small>';
  if (canEpochUp()) {
    upBtn.disabled = false;
    upBtn.classList.remove('notready');
    upBtn.classList.add('ready');
    upBtn.style.setProperty('--pct', '100%');
    upBtn.querySelector('.cost').textContent = '⚔ НАЧАТЬ ЭПОХУ ' + (epoch + 1) + ' «' + epochName(epoch + 1) + '» → +' + epochSealsGain(epoch) + ' 🔱';
  } else {
    upBtn.disabled = false;
    upBtn.classList.remove('ready');
    upBtn.classList.add('notready');
    upBtn.style.setProperty('--pct', (Math.floor(p.pct * 100)) + '%');
    upBtn.querySelector('.cost').textContent = fmtShort(p.earned) + ' / ' + fmtShort(p.threshold) + ' 💎 · ' + Math.floor(p.pct * 100) + '%';
  }
  const achvBtnCost = $('achvBtn') && $('achvBtn').querySelector('.cost');
  if (achvBtnCost) achvBtnCost.textContent = achvCount() + ' / ' + ACHIEVEMENTS.length;
  const relicCost = $('relicsBtn') && $('relicsBtn').querySelector('.cost');
  if (relicCost) relicCost.textContent = RELICS_OWNED.size + ' / ' + RELICS.length;
  /* живой индикатор армии/бафов в строке над Алтарём */
  if (typeof updateGridStats === 'function') updateGridStats();
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
           0 = мёртвое звено (культ вне ритуала), <1 = затухание */
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
  /* Уникальная механика ★4/★5 (SPECIALS в data/cards.js) */
  const sp = SPECIALS[card.id];
  if (sp) mechLine += '<div class="tt-synergy"><div class="tt-synergy-title">✦ Особенность</div><span style="color:#e8c060">' + sp + '</span></div>';
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
    '<div class="tt-stars">' + '★'.repeat(card.rarity) + ' · ' + FACTION_INFO[card.faction].name + '</div>' +
    '<div class="tt-income">Прирост: +' + (income !== undefined ? income.toFixed(2) : card.baseRate.toFixed(2)) + '/сек</div>' +
    mechLine + linksHtml +
    '<div class="tt-flavor">«' + card.flavor + '»</div>';
  tooltip.classList.add('show');
  moveTooltip(e);
}

/* ------- ФИДБЕК 6: графические формации ритуала в тултипе культистов -------
   Схема — мини-грид: 🔶 алтарь (золотой), фиолетовый — культист,
   тёмный — пустая клетка. Активная формация подсвечена. */
function formationDiagram(kind, activeKind) {
  const cellsDef = {
    cross:  { size: 3, cult: [[0, 1], [1, 0], [2, 1], [1, 2]], empty: [[0, 0], [0, 2], [2, 0], [2, 2]] },
    square: { size: 3, cult: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]], empty: [] },
    ring:   { size: 5, cult: [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,4],[2,0],[2,4],[3,0],[3,4],[4,0],[4,1],[4,2],[4,3],[4,4]], empty: [[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]] },
    great:  { size: 5, cult: [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[1,1],[1,2],[1,3],[1,4],[2,0],[2,4],[3,0],[3,1],[3,2],[3,3],[3,4],[4,0],[4,1],[4,2],[4,3],[4,4]], empty: [] }
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
    { kind: 'cross', label: 'Крест ×2.0', hint: '4 по сторонам, диагонали пусты' },
    { kind: 'square', label: 'Квадрат ×2.2', hint: 'все 8 соседей' },
    { kind: 'ring', label: 'Кольцо ×3.0', hint: 'пустой центр, 16 по кругу' },
    { kind: 'great', label: 'Великий Круг ×4.0', hint: '24 карты вокруг Алтаря' }
  ];
  let status = '';
  if (r !== undefined && c !== undefined && FACTION_INFO[faction].mechanic === 'formation') {
    if (card.id === 'c4') {
      const f = INC_CTX.formActive[r + ',' + c];
      status = '<div class="tt-synergy"><div class="tt-synergy-title">Ритуал</div>' +
        (f ? '<span style="color:#8fc87f">АКТИВНА ФОРМАЦИЯ: ' + f.label + ' ×' + f.mult.toFixed(1) +
          (f.keyBonus > 0 ? ' + ключевые +' + f.keyBonus.toFixed(2) + ' = ×' + f.formMult.toFixed(2) : '') + '</span>' +
          (f.keysUsed && f.keysUsed.length ? '<br><small style="color:#e8c060">Усиливают: ' + f.keysUsed.join(', ') + '</small>' : '')
           : '<span style="color:#e8c060">Формации нет — обложите Алтарь культистами</span>') + '</div>';
    } else {
      const inR = INC_CTX.ritual.has(r + ',' + c);
      const form = INC_CTX.formCell[r + ',' + c];
      let inner;
      if (form) inner = '<span style="color:#8fc87f">✔ В ФОРМАЦИИ «' + form.label + '» — множитель ×' + form.formMult.toFixed(2) + ' (усиливает ритуал' + (RITUAL_KEYS[card.id] ? ' +БОНУС КЛЮЧА' : '') + ')</span>';
      else if (inR) inner = '<span style="color:#e8c060">В РИТУАЛЕ (вне формации) — множитель ×1.0' + (getNeighbors(r, c).some(n => n.item.cardId === 'c4') ? ' +15% за соседство с Алтарём' : '') + '</span>';
      else if (INC_CTX.ritualOuter.has(r + ',' + c)) inner = '<span style="color:#a08860">Второй круг (×1.075)</span>';
      else inner = '<span style="color:#e08a8a">✖ ВНЕ РИТУАЛА — доход почти нулевой (×0.15). Соедините цепочку культистов с Алтарём и постройте формацию</span>';
      status = '<div class="tt-synergy"><div class="tt-synergy-title">Ритуал</div>' + inner + '</div>';
    }
  }
  const activeKind = card.id === 'c4' && r !== undefined && INC_CTX.formActive[r + ',' + c] ? INC_CTX.formActive[r + ',' + c].kind : null;
  return status + '<div class="tt-synergy"><div class="tt-synergy-title">🔯 Формации ритуала</div>' +
    '<div class="rt-row">' + defs.map(d => '<div class="rt-item" title="' + d.hint + '">' + formationDiagram(d.kind, activeKind) + '<small>' + d.label + '</small></div>').join('') + '</div>' +
    '<small style="color:#a08860">🔶 Алтарь · фиолетовый — культист · тёмный — пусто · КЛЮЧЕВЫЕ КАРТЫ (★3 Кровавый Маг, ★4 Жрец/Инквизитор, ★5 Око/Голос) в формации усиливают её множитель</small></div>';
}
function roleText(card) {
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
