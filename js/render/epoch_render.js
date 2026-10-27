'use strict';
/* ============================================================
   РЕНДЕР: ЭПОХИ, ДОСТИЖЕНИЯ, НАСТРОЙКИ (render/epoch_render.js)
   Меню Эпохи (список разблокировок ✔/🔒), магазин печатей,
   окно предупреждения о сбросе, выбор фракции, список ачивок.
   ============================================================ */

/* ---------------- Меню Эпохи ---------------- */
function openEpochMenu() {
  mk('epochModal',
    '<h2>⚜ Меню Эпохи</h2><div id="epochBody"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="epochX">Закрыть</button></div>', 550);
  $('epochX').onclick = () => close_('epochModal');
  renderEpochMenu();
  open_('epochModal');
}

function renderEpochMenu() {
  const p = epochProgress();
  const maxShow = Math.max(EPOCHS.length, epoch + 3);
  let list = '';
  for (let e = 1; e <= maxShow; e++) {
    const unlockedNow = epoch >= e;
    const icon = unlockedNow ? '✅' : '🔒';
    const txt = epochUnlockText(e);
    const thr = e === 1 ? 'доступно сразу' : 'порог: ' + fmtShort(epochThreshold(e - 1)) + ' 💎 за забег';
    list += '<div class="epoch-row ' + (unlockedNow ? 'on' : 'off') + (e === epoch ? ' cur' : '') + '">' +
      '<span class="er-icon">' + icon + '</span><span class="er-txt"><b>Эпоха ' + e + ':</b> ' + txt +
      '<br><small>' + thr + (unlockedNow ? '' : ' · впереди') + '</small></span></div>';
  }
  /* Секция Алтаря: текущий размер + покупка следующего нечётного шага (пункты 7-8 ТЗ) */
  const nextSize = altarNextSize();
  let altarHtml;
  if (!nextSize) {
    altarHtml = '<div class="up"><b>🧱 Алтарь: ' + playableSize + '×' + playableSize + '</b><br><small>Максимальный размер достигнут.</small></div>';
  } else if (nextSize <= epochMaxSize(epoch)) {
    const cost = altarUpgradeCost();
    altarHtml = '<div class="up"><b>🧱 Алтарь ' + playableSize + '×' + playableSize + ' → ' + nextSize + '×' + nextSize + '</b>' +
      '<br><small>Новые клетки по краям, карты сохранят позиции.</small>' +
      '<button class="mini" id="altarUpBtn" ' + (crystals >= cost ? '' : 'disabled') + '>' + fmtShort(cost) + ' 💎</button></div>';
  } else {
    let ue = 3;
    while (epochMaxSize(ue) < nextSize) ue++;
    altarHtml = '<div class="up"><b>🧱 Алтарь: ' + playableSize + '×' + playableSize + '</b><br><small>Расширение до ' + nextSize + '×' + nextSize + ' откроется в Эпохе ' + ue + '</small></div>';
  }
  $('epochBody').innerHTML =
    '<div class="res">Текущая Эпоха: <b>' + epoch + '</b> · ' + FACTION_INFO[faction].epochTitle + ' · фракция: <b>' + FACTION_INFO[faction].name + '</b></div>' +
    '<div class="goal"><span>Прогресс: ' + fmtShort(p.earned) + ' / ' + fmtShort(p.threshold) + ' 💎</span><i style="width:' + Math.floor(p.pct * 100) + '%"></i><em>' + Math.floor(p.pct * 100) + '%</em></div>' +
    '<h3>🧱 Алтарь</h3><div class="ups">' + altarHtml + '</div>' +
    '<h3>Разблокировки</h3>' + list +
    '<h3>🔱 Печати: ' + fmt(seals) + '</h3>' +
    '<div class="ups">' + SEALS_SHOP.map(s => {
      const l = sealLv[s.id], cost = sealCost(s);
      const maxed = l >= s.max;
      return '<div class="up"><b>' + s.icon + ' ' + s.name + '</b> ур.' + l + '/' + s.max + '<br><small>' + s.desc + '</small>' +
        '<button class="mini" data-seal="' + s.id + '" ' + (maxed || seals < cost ? 'disabled' : '') + '>' + (maxed ? 'МАКС' : cost + ' 🔱') + '</button></div>';
    }).join('') + '</div>' +
    '<div class="flavor">Печати остаются навсегда и ускоряют следующие Эпохи. Кристаллы, грид и карты сбрасываются при переходе.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="epochGoBtn" style="max-width:none" ' + (canEpochUp() ? '' : 'disabled') + '>' +
    (canEpochUp() ? '⚔ НАЧАТЬ НОВУЮ ЭПОХУ → +' + epochSealsGain(epoch) + ' 🔱' : 'Порог не достигнут (' + Math.floor(p.pct * 100) + '%)') + '</button></div>';

  const altarBtn = $('altarUpBtn');
  if (altarBtn) altarBtn.onclick = buyAltarUpgrade;
  $('epochBody').querySelectorAll('[data-seal]').forEach(b => b.onclick = () => { buySeal(b.dataset.seal); renderEpochMenu(); });
  const go = $('epochGoBtn');
  if (go && canEpochUp()) go.onclick = () => { close_('epochModal'); confirmEpochUp(); };
}

/* Окно-предупреждение перед сбросом (пункт 1 ТЗ) */
function confirmEpochUp() {
  const s = epochResetSummary();
  const gain = epochSealsGain(epoch);
  mk('epochWarn',
    '<h2>⚜ Начать новую Эпоху?</h2>' +
    '<div class="res">Награда: <b>+' + gain + ' 🔱</b> печатей</div>' +
    '<div class="warn-cols"><div class="warn-col bad"><b>СБРОСИТСЯ:</b><ul>' + s.reset.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="warn-col good"><b>ОСТАНЕТСЯ:</b><ul>' + s.keep.map(x => '<li>' + x + '</li>').join('') + '</ul></div></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="ewNo">Отмена</button><button class="btn btn-take" id="ewYes" style="background:#4a1010">НАЧАТЬ ЭПОХУ ' + (epoch + 1) + '</button></div>', 600);
  $('ewNo').onclick = () => close_('epochWarn');
  $('ewYes').onclick = () => { close_('epochWarn'); pickFactionAndAscend(); };
  open_('epochWarn');
}

/* Выбор фракции на новую Эпоху (пункты 3 и 11 ТЗ) */
function pickFactionAndAscend() {
  const avail = epochFactions(epoch);
  if (avail.length <= 1) { doEpochUp(avail[0]); return; }
  mk('factionModal',
    '<h2>Выберите фракцию Эпохи ' + (epoch + 1) + '</h2>' +
    '<div class="faction-list">' + avail.map(f => {
      const info = FACTION_INFO[f];
      return '<div class="faction-card" data-f="' + f + '" style="border-color:' + info.color + '">' +
        '<h3 style="color:' + info.color + '">' + info.epochTitle + '</h3>' +
        '<div class="mech-tag">' + info.mechanicName + '</div>' +
        '<p>' + info.mechanicDesc + '</p><small>' + info.hierarchy + '</small></div>';
    }).join('') + '</div>' +
    '<div class="flavor">Всю Эпоху вы играете ТОЛЬКО картами этой фракции — гача выдаёт только её карты.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="fmCancel">Назад</button></div>', 600);
  $('fmCancel').onclick = () => close_('factionModal');
  $('factionModal').querySelectorAll('.faction-card').forEach(fc => {
    fc.onclick = () => { const f = fc.dataset.f; close_('factionModal'); doEpochUp(f); };
  });
  open_('factionModal');
}

function updateEpochUI() {
  if ($('epochModal') && $('epochModal').classList.contains('show')) renderEpochMenu();
  if ($('achvModal') && $('achvModal').classList.contains('show')) renderAchvList();
}

/* ---------------- Достижения + общая статистика ---------------- */
function openAchv() {
  mk('achvModal',
    '<h2>🏅 Достижения</h2><div class="res" id="achvCnt"></div><div id="achvBody"></div>' +
    '<div class="flavor">Способ получения всегда известен заранее. Наград нет — только слава и коллекция.</div>' +
    '<div id="statsBox"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="achvX">Закрыть</button></div>', 550);
  $('achvX').onclick = () => close_('achvModal');
  renderAchvList();
  open_('achvModal');
}
function renderAchvList() {
  $('achvCnt').innerHTML = 'Получено: <b>' + achvCount() + ' / ' + ACHIEVEMENTS.length + '</b>';
  $('achvBody').innerHTML = ACHIEVEMENTS.map(a => {
    const done = !!achDone[a.id];
    return '<div class="achv-row ' + (done ? 'done' : '') + '"><span class="achv-icon">' + (done ? '🏅' : '▫️') + '</span>' +
      '<span><b>' + a.name + '</b><br><small>' + a.desc + '</small></span></div>';
  }).join('');
  renderStats();
}

/* ---------------- Статистика (внутри Достижений, пункт 5 ТЗ) ---------------- */
const GAME_NAMES = { slots: '🎰 Слоты', aviator: '✈ Авиатор', roulette: '🎡 Рулетка', poker: '🃏 Покер' };
function renderStats() {
  const box = $('statsBox');
  if (!box) return;
  const top = Object.entries(stats.pulls).sort((a, b) => b[1] - a[1])[0];
  const fmtN = n => fmtSigned(n);
  box.innerHTML = '<h3>📊 Статистика</h3><div class="stt">' +
    Object.keys(GAME_NAMES).map(k => {
      const o = stats.g[k] || { w: 0, l: 0, net: 0 };
      return '<div>' + GAME_NAMES[k] + '</div><div>✔' + o.w + ' ✖' + o.l + '</div><div style="color:' + (o.net >= 0 ? '#8f8' : '#f88') + '">' + fmtN(o.net) + ' 💎</div>';
    }).join('') + '</div>' +
    '<div>⭐ Любимая карта: <b>' + (top ? cardArtHTML(CARDS[top[0]], 'inline-art', '') + ' ' + CARDS[top[0]].name + ' (×' + top[1] + ')' : '—') + '</b></div>' +
    '<div>📈 Рекорд дохода: <b>' + stats.maxInc.toFixed(1) + '/сек</b></div>' +
    '<div>🎲 Круток всего: <b>' + fmt(stats.rolls) + '</b> (за Эпоху: ' + fmt(runRolls) + ')</div>' +
    '<div>⚜ Эпоха: <b>' + epoch + '</b> · рекорд: <b>' + maxEpoch + '</b> · 🔱 печатей заработано: <b>' + fmt(sealsTotal) + '</b></div>' +
    '<div>🧱 Алтарь: <b>' + playableSize + '×' + playableSize + '</b></div>';
}
