'use strict';
/* ============================================================
   РЕНДЕР: КАЗИНО (render/casino_render.js)
   Хаб, слоты, авиатор, рулетка, блэкджек (v1.3.0 — покер заменён по ТЗ). Математика — logic/casino_logic.js.
   Минимальная ставка MIN_BET (data/casino.js). Казино открывается
   в Эпохе 4 (CASINO_EPOCH, проверка ниже).
   ============================================================ */

/* ---------------- Хаб ---------------- */
mk('hub', '<h2>🎰 Казино</h2><div class="hubg"><button data-g="slots">🎰<br>Слоты</button><button data-g="aviator">✈<br>Авиатор</button><button data-g="roulette">🎡<br>Рулетка</button><button data-g="blackjack">🂡<br>Блэкджек</button></div><button class="btn btn-take" style="align-self:center" id="hubX">Закрыть</button>');
mk('cgModal', '<div id="cgBody"></div><button class="btn btn-take" id="cgClose" style="align-self:center">Назад</button>');

function openCasino() {
  if (!epochHasCasino(epoch)) { toast('🎰 Казино откроется в Эпохе ' + CASINO_EPOCH); return; }
  open_('hub');
}

/* ---------------- Слоты ---------------- */
function renderSlotGrid(sg, winLines = []) {
  const container = $('slotGrid'), svg = $('paylinesSvg');
  Array.from(container.querySelectorAll('.slot-cell')).forEach(c => c.remove());
  svg.innerHTML = '';
  for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
    const cell = document.createElement('div');
    cell.className = 'slot-cell'; cell.id = 'cell-' + r + '-' + c;
    cell.textContent = sg[r][c];
    container.appendChild(cell);
  }
  const cellSize = 72, gap = 8, padding = 10;
  const cx = (c) => padding + c * (cellSize + gap) + cellSize / 2;
  const cy = (r) => padding + r * (cellSize + gap) + cellSize / 2;
  const lineColors = ['#ff4040', '#40ff40', '#4080ff', '#ff40ff', '#ffff40', '#40ffff', '#ff8040', '#8040ff', '#ff4040'];
  winLines.forEach(win => {
    if (win.type === 'scatter') return;
    const coords = PAYLINES[win.line];
    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', coords.map((r, c) => cx(c) + ',' + cy(r)).join(' '));
    polyline.setAttribute('stroke', lineColors[win.line % lineColors.length]);
    polyline.setAttribute('class', 'active');
    svg.appendChild(polyline);
  });
}
function openSlots() {
  if (casinoSpinning) return;
  if (crystals < MIN_BET) { toast('Минимальная ставка ' + fmt(MIN_BET) + ' 💎'); return; }
  casinoBet = Math.max(MIN_BET, Math.min(casinoBet, Math.floor(crystals)));
  updateCasinoUI();
  renderSlotGrid(generateSlotGrid());
  open_('casinoModal');
  $('slotResult').textContent = ''; $('slotResult').className = '';
}
function updateCasinoUI() {
  $('slotBetAmount').textContent = fmt(casinoBet);
  const addBtns = ['betAdd1000', 'betAdd10000'], vals = [1000, 10000];
  addBtns.forEach((id, i) => { $(id).disabled = casinoSpinning || casinoBet + vals[i] > Math.floor(crystals); });
  $('betAll').disabled = casinoSpinning || Math.floor(crystals) <= casinoBet;
  $('betReset').disabled = casinoSpinning || casinoBet === 0;
  const lever = $('slotLeverBtn');
  lever.disabled = casinoSpinning || casinoBet < MIN_BET || casinoBet > Math.floor(crystals);
}
function addBet(amount) {
  if (casinoSpinning) return;
  casinoBet = Math.min(Math.floor(crystals), casinoBet + amount);
  updateCasinoUI();
}
function slotsSpin() {
  if (casinoSpinning || casinoBet < MIN_BET || casinoBet > Math.floor(crystals)) return;
  casinoSpinning = true;
  crystals -= casinoBet;
  updateHUD(); updateCasinoUI();
  $('slotResult').textContent = ''; $('slotResult').className = '';
  const finalGrid = generateSlotGrid();
  const cells = document.querySelectorAll('.slot-cell');
  const startTime = performance.now(), spinDuration = 1600;
  let lastSymbolTime = 0;
  function spinFrame(now) {
    const elapsed = now - startTime;
    if (elapsed < spinDuration) {
      if (now - lastSymbolTime > 60) {
        lastSymbolTime = now;
        cells.forEach(cell => { cell.textContent = getSlotSymbol(); });
      }
      requestAnimationFrame(spinFrame);
    } else {
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
        const cell = $('cell-' + r + '-' + c);
        if (cell) cell.textContent = finalGrid[r][c];
      }
      const winData = checkGridWin(finalGrid);
      renderSlotGrid(finalGrid, winData.results);
      if (winData.totalWin > 0) {
        const winAmount = Math.round(casinoBet * winData.totalWin * SLOT_WIN_FACTOR);
        crystals += winAmount;
        rec('slots', winAmount - casinoBet);
        stats.casinoBest = Math.max(stats.casinoBest, winData.totalWin * SLOT_WIN_FACTOR);
        updateHUD();
        winData.results.forEach(res => {
          if (res.type === 'scatter') {
            for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++)
              if (finalGrid[r][c] === SCATTER_SYMBOL) { const el = $('cell-' + r + '-' + c); if (el) el.classList.add('win'); }
          } else {
            PAYLINES[res.line].slice(0, res.len).forEach((r, c) => { const el = $('cell-' + r + '-' + c); if (el) el.classList.add('win'); });
          }
        });
        const resEl = $('slotResult');
        let text = '';
        if (winData.totalWin >= 50) { text = '🎉 ДЖЕКПОТ! Выигрыш: ' + fmt(winAmount) + ' 💎 (x' + (winData.totalWin * SLOT_WIN_FACTOR).toFixed(1) + ')'; resEl.className = 'jackpot'; }
        else if (winData.totalWin >= 10) { text = '✨ Крупный выигрыш: ' + fmt(winAmount) + ' 💎 (x' + (winData.totalWin * SLOT_WIN_FACTOR).toFixed(1) + ')'; resEl.className = 'win'; }
        else { text = 'Выигрыш: ' + fmt(winAmount) + ' 💎 (x' + (winData.totalWin * SLOT_WIN_FACTOR).toFixed(1) + ')'; resEl.className = 'win'; }
        resEl.textContent = text;
      } else {
        rec('slots', -casinoBet);
        const resEl = $('slotResult');
        resEl.textContent = 'Нет совпадений. Вы проиграли ' + fmt(casinoBet) + ' 💎.';
        resEl.className = 'lose';
      }
      casinoSpinning = false;
      casinoBet = Math.max(MIN_BET, Math.min(casinoBet, Math.floor(crystals)));
      updateCasinoUI(); checkAchievements();
    }
  }
  requestAnimationFrame(spinFrame);
}

/* ---------------- Авиатор ---------------- */
let av = null, avH = [];
function gAviator() {
  $('cgBody').innerHTML = '<h2>✈ Авиатор</h2><canvas id="avC" width="520" height="220"></canvas><div id="avM">1.00×</div>' +
    betUI('avBet', MIN_BET) +
    '<div class="bet">Авто-вывод на: <input type="number" id="avAuto" value="2" step="0.1" min="1.1" style="width:70px"> ×</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="avGo">СТАРТ</button></div><div id="avH" class="hist"></div>' +
    '<div id="avR" class="res">Заберите выигрыш до того, как самолёт улетит!</div>';
  $('avGo').onclick = avClick; avDraw(1, 0); avHist();
}
function avHist() {
  $('avH').innerHTML = avH.slice(-12).map(x => '<span style="color:' + (x >= 2 ? '#8f8' : '#f88') + '">' + x.toFixed(2) + '×</span>').join(' ');
}
function avDraw(m, t, boom) {
  const c = $('avC').getContext('2d'), W = 520, H = 220;
  c.clearRect(0, 0, W, H);
  c.strokeStyle = '#223';
  for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(0, H * i / 5); c.lineTo(W, H * i / 5); c.stroke(); }
  const xm = Math.max(10, t * 1.1), ym = Math.max(2, m * 1.15);
  const X = s => s / xm * (W - 40) + 10, Y = v => H - 10 - (v - 1) / (ym - 1) * (H - 30);
  c.strokeStyle = boom ? '#f44' : '#ffd34d'; c.lineWidth = 3;
  c.beginPath();
  for (let s = 0; s <= t; s += t / 60 || 1) { const v = Math.exp(.1 * s); c.lineTo(X(s), Y(v)); }
  c.lineTo(X(t), Y(m)); c.stroke();
  c.font = '26px serif'; c.fillText(boom ? '💥' : '✈', X(t) - 10, Y(m) - 6);
}
function avClick() {
  if (av && av.on) return avCash();
  const bet = validateBet(Math.floor(+$('avBet').value));
  if (!bet) return;
  crystals -= bet; updateHUD();
  av = { on: 1, bet, crash: Math.max(1, Math.floor(96 / (1 - Math.random())) / 100), t0: performance.now(), auto: +$('avAuto').value || 0 };
  busy = 1; $('avGo').textContent = 'ЗАБРАТЬ'; $('avR').textContent = '';
  requestAnimationFrame(avTick);
}
function avEnd(win, m) {
  av.on = 0; busy = 0;
  const net = win ? Math.floor(av.bet * m) - av.bet : -av.bet;
  if (win) crystals += Math.floor(av.bet * m);
  rec('aviator', net);
  if (win) stats.casinoBest = Math.max(stats.casinoBest, m);
  updateHUD(); avH.push(av.crash); avHist();
  $('avGo').textContent = 'СТАРТ';
  $('avR').textContent = win ? '✔ Забрали на ' + m.toFixed(2) + '× → +' + fmt(net) + ' 💎 (самолёт улетел бы на ' + av.crash.toFixed(2) + '×)'
    : '💥 Улетел на ' + av.crash.toFixed(2) + '× — ставка потеряна';
  $('avR').className = 'res ' + (win ? 'w' : 'l');
  checkAchievements();
}
function avCash() {
  const m = Math.min(av.crash, Math.exp(.1 * (performance.now() - av.t0) / 1000));
  avEnd(true, Math.floor(m * 100) / 100);
}
function avTick(now) {
  if (!av || !av.on || !$('avC')) return;
  const t = (now - av.t0) / 1000, m = Math.exp(.1 * t);
  if (m >= av.crash) { avDraw(av.crash, t, 1); $('avM').textContent = av.crash.toFixed(2) + '×'; return avEnd(false, 0); }
  if (av.auto >= 1.1 && m >= av.auto) return avEnd(true, av.auto);
  $('avM').textContent = m.toFixed(2) + '×';
  avDraw(m, t);
  requestAnimationFrame(avTick);
}

/* ---------------- Рулетка ---------------- */
let rb = {}, chip = ROULETTE_CHIPS[0], rrot = 0;
const rcol = n => n === 0 ? '#0a7a2a' : ROULETTE_RED.has(n) ? '#b01818' : '#1a1a1a';
function gRoulette() {
  rb = {};
  const seg = 360 / 37;
  const grad = ROULETTE_WHEEL.map((n, i) => rcol(n) + ' ' + i * seg + 'deg ' + (i + 1) * seg + 'deg').join(',');
  let g = '<div class="rg"><div data-k="n:0" style="grid-row:span 3;background:#0a7a2a">0</div>';
  for (let c = 0; c < 12; c++) for (let r = 0; r < 3; r++) {
    const n = c * 3 + (3 - r);
    g += '<div data-k="n:' + n + '" style="background:' + rcol(n) + '">' + n + '</div>';
  }
  g += '<div data-k="c3">2:1</div><div data-k="c2">2:1</div><div data-k="c1">2:1</div></div><div class="ro">' +
    [['d1', '1-12'], ['d2', '13-24'], ['d3', '25-36'], ['low', '1-18'], ['even', 'Чёт'], ['red', '🔴'], ['black', '⚫'], ['odd', 'Нечёт'], ['high', '19-36']]
      .map(([k, t]) => '<div data-k="' + k + '">' + t + '</div>').join('') + '</div>';
  $('cgBody').innerHTML = '<h2>🎡 Рулетка</h2><div id="rw" style="background:conic-gradient(' + grad + ')"><b id="rn">?</b></div>' +
    '<div class="chips">' + ROULETTE_CHIPS.map(v => '<button class="mini ' + (v === chip ? 'on' : '') + '" data-chip="' + v + '">' + fmtShort(v) + '</button>').join('') +
    ' <button class="mini" id="rClr">Очистить</button></div>' + g +
    '<div class="res" id="rR">Выберите фишку и кликайте по полю. Число 35:1, цвет/чёт/диапазон 1:1, дюжины и колонки 2:1.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="rGo">КРУТИТЬ</button></div>';
  $('rGo').onclick = rSpin;
  $('rClr').onclick = () => { if (busy) return; rb = {}; rMark(); };
}
function rMark() {
  qsa('#cgBody [data-k]').forEach(e => {
    const v = rb[e.dataset.k];
    v ? e.setAttribute('data-amt', fmtShort(v)) : e.removeAttribute('data-amt');
  });
}
function rouletteBoardClick(e) {
  const ch = e.target.dataset.chip;
  if (ch) {
    chip = +ch;
    qsa('[data-chip]').forEach(b => b.classList.toggle('on', b === e.target));
    return;
  }
  const k = e.target.dataset.k;
  if (!k || busy) return;
  const tot = Object.values(rb).reduce((a, b) => a + b, 0);
  if (tot + chip > crystals) return toast('Не хватает 💎');
  rb[k] = (rb[k] || 0) + chip;
  rMark();
}
function rSpin() {
  if (busy) return;
  const tot = Object.values(rb).reduce((a, b) => a + b, 0);
  if (!tot) return toast('Сделайте ставку');
  if (tot < MIN_BET) return toast('Минимальная ставка ' + fmt(MIN_BET) + ' 💎');
  if (tot > crystals) return toast('Не хватает 💎');
  crystals -= tot; updateHUD(); busy = 1;
  const n = Math.floor(Math.random() * 37), k = ROULETTE_WHEEL.indexOf(n), seg = 360 / 37;
  rrot = (Math.floor(rrot / 360) + 7) * 360 - (k + .5) * seg;
  $('rw').style.transform = 'rotate(' + rrot + 'deg)';
  $('rR').textContent = 'Шарик катится…';
  setTimeout(() => {
    let pay = 0;
    for (const q in rb) pay += rb[q] * roulettePay(q, n);
    crystals += pay;
    rec('roulette', pay - tot);
    updateHUD(); busy = 0;
    $('rn').textContent = n;
    $('rn').style.color = n === 0 ? '#6f6' : ROULETTE_RED.has(n) ? '#f66' : '#fff';
    $('rR').className = 'res ' + (pay > tot ? 'w' : 'l');
    $('rR').textContent = 'Выпало ' + n + ' ' + (n === 0 ? '🟢' : ROULETTE_RED.has(n) ? '🔴' : '⚫') + ' · ' +
      (pay > tot ? '+' + fmt(pay - tot) : pay === tot ? 'в ноль' : '−' + fmt(tot - pay)) + ' 💎';
    rb = {}; rMark(); checkAchievements();
  }, 4300);
}

/* ---------------- БЛЭКДЖЕК (v1.3.0 — вместо покера) ----------------
   Стол 1 на 1, шуе из 4 колод. Блэкджек платит 3:2, дилер добирает до 17.
   Кнопки: ЕЩЁ / ХВАТИТ / УДВОИТЬ (только первый ход) / НОВАЯ РАЗДАЧА.
   Математика — logic/casino_logic.js (bjShoe/bjHandVal...). */
let bj = null, bjLast = '';
function gBlackjack() { $('cgBody').innerHTML = '<h2>🂡 Блэкджек</h2><div id="bjT"></div>'; bjIdle(); }
function bjIdle() {
  $('bjT').innerHTML = '<div class="res">Стол 1 на 1 против дилера. Цель — набрать ближе к 21, не перебрав. ' +
    'Блэкджек (21 с двух карт) платит 3:2, ничья возвращает ставку, перебор проигрывает сразу. ' +
    'Дилер добирает до 17 включительно.</div>' +
    betUI('bjBet', MIN_BET) + '<div class="btn-row"><button class="btn btn-take" data-p="deal">РАЗДАТЬ</button></div>' +
    '<div class="res">' + bjLast + '</div>';
}
function bjMoney(c) { return '<span class="pc ' + (bjRed(c) ? 'r' : '') + '">' + bjCard(c) + '</span>'; }
function bjScore(hand) {
  const v = bjHandVal(hand);
  return '<b style="color:' + (v > 21 ? '#ff8080' : v === 21 ? '#ffd34d' : '#e8dcc8') + '">' + v + '</b>';
}
function bjRender(showDealer, note) {
  const dh = bj.dHand, ph = bj.pHand;
  const hideHole = !showDealer && dh.length;
  const dTxt = hideHole
    ? bjMoney(dh[0]) + '<span class="pc back">?</span>'
    : dh.map(bjMoney).join(' ');
  const dVal = hideHole ? bjRankVal(dh[0]) : bjHandVal(dh);
  $('bjT').innerHTML =
    '<div>Дилер: ' + dTxt + ' ' + (hideHole ? '' : '· ' + bjScore(dh)) + (bj.dBust ? ' · <span style="color:#ff8080">ПЕРЕБОР</span>' : '') + '</div>' +
    '<div class="pkb"><small>Шуе: ' + bj.shoe.length + ' карт · Банк: ' + fmt(bj.pot) + ' 💎</small></div>' +
    '<div>Вы: ' + ph.map(bjMoney).join(' ') + ' · ' + bjScore(ph) + (bj.pBust ? ' · <span style="color:#ff8080">ПЕРЕБОР</span>' : '') + '</div>' +
    '<div class="res">' + (note || bj.msg) + '</div><div class="btn-row">' +
    (bj.phase === 'play'
      ? '<button class="btn btn-take" data-p="hit">ЕЩЁ</button><button class="btn btn-take" data-p="stand">ХВАТИТ</button>' +
        (bj.first ? '<button class="btn btn-take" data-p="double">УДВОИТЬ</button>' : '') +
        '<button class="btn btn-take" data-p="surrender">Сдаться</button>'
      : '<button class="btn btn-take" data-p="again">НОВАЯ РАЗДАЧА</button>') + '</div>';
}
function bjSettle(msg) {
  let p = 0;
  if (bj.outcome === 'win') p = bj.pot * 2;              // ставка + выигрыш 1:1
  else if (bj.outcome === 'bj') p = bj.pot + Math.floor(bj.pot * BJ_PAY); // 3:2
  else if (bj.outcome === 'push') p = bj.pot;            // ничья — возврат
  else if (bj.outcome === 'surr') p = Math.floor(bj.pot / 2); // сдача — половина
  crystals += p; updateHUD();
  const net = p - bj.pot;
  rec('blackjack', net);
  if (net > 0) stats.casinoBest = Math.max(stats.casinoBest, p / bj.pot);
  bj.phase = 'end';
  bj.msg = msg + (net > 0 ? ' <b>(+' + fmt(net) + ' 💎)</b>' : net === 0 ? ' (возврат)' : ' (−' + fmt(-net) + ' 💎)');
  bjLast = 'Итог прошлой раздачи: ' + (net >= 0 ? '+' : '−') + fmt(Math.abs(net)) + ' 💎';
  busy = 0; bjRender(true); checkAchievements();
}
function bjDeal() {
  const bet = validateBet(Math.floor(+$('bjBet').value));
  if (!bet) return;
  crystals -= bet; updateHUD();
  if (!bj || !bj.shoe || bj.shoe.length < 15) bj = { shoe: bjShoe(BJ_DECKS) };
  bj.pot = bet; bj.pHand = []; bj.dHand = []; bj.pBust = false; bj.dBust = false;
  bj.phase = 'play'; bj.first = true; bj.msg = 'Ваш ход'; bj.outcome = null;
  bj.pHand.push(bj.shoe.pop(), bj.shoe.pop());
  bj.dHand.push(bj.shoe.pop(), bj.shoe.pop());
  busy = 1;
  const pBJ = bjIsBlackjack(bj.pHand), dBJ = bjIsBlackjack(bj.dHand);
  if (pBJ || dBJ) { bj.pBust = false; bj.dBust = false; bj.phase = 'end';
    if (pBJ && dBJ) { bj.outcome = 'push'; return bjSettle('У обоих БЛЭКДЖЕК — ничья.'); }
    if (pBJ) { bj.outcome = 'bj'; return bjSettle('🂡 БЛЭКДЖЕК! Платит 3:2.'); }
    bj.outcome = 'lose'; return bjSettle('У дилера блэкджек. Ставка потеряна.');
  }
  bjRender(false);
}
function bjHit() {
  if (!bj || bj.phase !== 'play') return;
  bj.pHand.push(bj.shoe.pop());
  bj.first = false;
  if (bjBusted(bj.pHand)) { bj.pBust = true; bj.outcome = 'lose'; return bjSettle('Перебор — ' + bjHandVal(bj.pHand) + '. Ставка уходит Тьме.'); }
  bj.msg = 'Ваш ход'; bjRender(false);
}
function bjDouble() {
  if (!bj || bj.phase !== 'play' || !bj.first) return;
  if (bj.pot > crystals) { toast('Не хватает 💎 для удвоения'); return; }
  crystals -= bj.pot; bj.pot *= 2; updateHUD();
  bj.pHand.push(bj.shoe.pop());
  bj.first = false;
  if (bjBusted(bj.pHand)) { bj.pBust = true; bj.outcome = 'lose'; return bjSettle('Перебор после удвоения — ' + bjHandVal(bj.pHand) + '.'); }
  return bjStand();
}
function bjSurrender() {
  if (!bj || bj.phase !== 'play' || !bj.first) return;
  bj.outcome = 'surr';
  bjSettle('Вы сдались — половина ставки возвращается.');
}
function bjStand() {
  if (!bj || bj.phase !== 'play') return;
  bj.first = false;
  /* Дилер добирает до 17 включительно (мягкие 17 — тоже останавливается) */
  while (bjHandVal(bj.dHand) < BJ_DEALER_HIT) bj.dHand.push(bj.shoe.pop());
  const dv = bjHandVal(bj.dHand), pv = bjHandVal(bj.pHand);
  bj.dBust = dv > 21;
  if (bj.dBust) { bj.outcome = 'win'; return bjSettle('Дилер перебрал (' + dv + ') — победа!'); }
  if (pv > dv) { bj.outcome = 'win'; return bjSettle(pv + ' против ' + dv + ' — победа!'); }
  if (pv < dv) { bj.outcome = 'lose'; return bjSettle(dv + ' против ' + pv + ' — дилер сильнее.'); }
  bj.outcome = 'push'; return bjSettle('Ничья ' + pv + ':' + dv + ' — ставка возвращается.');
}
function bjAct(a) {
  if (!bj && a !== 'deal') return;
  if (a === 'deal') return bjDeal();
  if (a === 'again') return bjIdle();
  if (a === 'hit') return bjHit();
  if (a === 'stand') return bjStand();
  if (a === 'double') return bjDouble();
  if (a === 'surrender') return bjSurrender();
}

/* Общая строка ставки */
const betUI = (id, d) => '<div class="bet">Ставка: <input type="number" id="' + id + '" value="' + d + '" min="' + MIN_BET + '" step="100"> ' +
  '<button class="mini" data-b="' + id + ':h">½</button><button class="mini" data-b="' + id + ':d">×2</button><button class="mini" data-b="' + id + ':m">МАКС</button></div>';
