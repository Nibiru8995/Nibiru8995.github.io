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
      '<span class="er-icon">' + icon + '</span><span class="er-txt"><b>Эпоха ' + e + ' «' + epochName(e) + '»:</b> ' + txt +
      '<br><small>' + thr + (unlockedNow ? '' : ' · впереди') + '</small></span></div>';
  }
  const sizeNote = playableSize >= GRID_SIZE ? 'Поле максимального размера (9×9).'
    : 'Размер поля сейчас ' + playableSize + '×' + playableSize + ' · вырастет до ' + epochMaxSize(epoch + 1) + '×' + epochMaxSize(epoch + 1) + ' при переходе в Эпоху ' + (epoch + 1) + ' (бесплатно).';
  $('epochBody').innerHTML =
    '<div class="res">Текущая Эпоха: <b>' + epoch + ' «' + epochName(epoch) + '»</b> · ' + FACTION_INFO[faction].epochTitle + ' · фракция: <b>' + FACTION_INFO[faction].name + '</b></div>' +
    '<div class="goal"><span>Прогресс: ' + fmtShort(p.earned) + ' / ' + fmtShort(p.threshold) + ' 💎</span><i style="width:' + Math.floor(p.pct * 100) + '%"></i><em>' + Math.floor(p.pct * 100) + '%</em></div>' +
    '<div class="up"><b>🧱 Поле Алтаря: ' + playableSize + '×' + playableSize + '</b><br><small>' + sizeNote + '</small></div>' +
    milHtml() +
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
    (canEpochUp() ? '⚔ НАЧАТЬ ЭПОХУ ' + (epoch + 1) + ' «' + epochName(epoch + 1) + '» → +' + epochSealsGain(epoch) + ' 🔱' : 'Порог не достигнут (' + Math.floor(p.pct * 100) + '%)') + '</button></div>';

  $('epochBody').querySelectorAll('[data-seal]').forEach(b => b.onclick = () => { buySeal(b.dataset.seal); renderEpochMenu(); });
  const go = $('epochGoBtn');
  if (go && canEpochUp()) go.onclick = () => { close_('epochModal'); confirmEpochUp(); };
}

/* Вехи забега в Меню Эпохи */
function milHtml() {
  let rows = '';
  MIL_FRACS.forEach((f, i) => {
    const done = i < milestoneIdx, cur = i === milestoneIdx;
    rows += '<div class="epoch-row ' + (done ? 'on' : 'off') + (cur ? ' cur' : '') + '">' +
      '<span class="er-icon">' + (done ? '🏅' : cur ? '⏳' : '▫️') + '</span><span class="er-txt"><b>Веха ' + (f * 100) + '%</b> — ' + milLabel(MIL_REWARDS[i]) +
      (done ? ' · выполнена' : cur ? ' · <b>текущая</b>' : '') + '</span></div>';
  });
  return '<h3>🏅 Вехи забега</h3>' + rows;
}

/* ---------------- Реликвии v1.2.5: живут в коллекции (вкладка «⚒ РЕЛИКВИИ»)
   и в панели слева от неё. Отдельного модала больше нет. ---------------- */

/* Окно-предупреждение перед сбросом (пункт 1 ТЗ).
   ФИДБЕК (раунд 4): никакого «начать новую» — только Вознесение
   в КОНКРЕТНУЮ Эпоху с именем.
   v1.4.3: mkFresh — окно может открываться много раз за сессию,
   содержимое должно обновляться КАЖДЫЙ показ. */
function confirmEpochUp() {
  const s = epochResetSummary();
  const gain = epochSealsGain(epoch);
  mkFresh('epochWarn',
    '<h2>⚜ Вознесение: ЭПОХА ' + (epoch + 1) + ' «' + epochName(epoch + 1) + '»</h2>' +
    '<div class="res">Награда: <b>+' + gain + ' 🔱</b> печатей' +
    (EPOCHS[Math.min(epoch, EPOCHS.length - 1)] ? ' · откроется: ' + epochUnlockText(epoch + 1) : '') + '</div>' +
    '<div class="warn-cols"><div class="warn-col bad"><b>СБРОСИТСЯ:</b><ul>' + s.reset.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="warn-col good"><b>ОСТАНЕТСЯ:</b><ul>' + s.keep.map(x => '<li>' + x + '</li>').join('') + '</ul></div></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="ewNo">Отмена</button><button class="btn btn-take" id="ewYes" style="background:#4a1010">⚔ НАЧАТЬ ЭПОХУ ' + (epoch + 1) + '</button></div>', 600);
  $('ewNo').onclick = () => close_('epochWarn');
  $('ewYes').onclick = () => { close_('epochWarn'); pickFactionAndAscend(); };
  open_('epochWarn');
}

/* Выбор фракции на новую Эпоху (пункты 3 и 11 ТЗ) */
function pickFactionAndAscend() {
  /* Фикс (пункт 9 ТЗ): фракции доступны по НОВОЙ эпохе (epoch + 1).
     Раньше список считался по старой — фракцию нельзя было выбрать
     ровно в ту Эпоху, в которую она разблокировалась (4→5 и т.д.). */
  const avail = epochFactions(epoch + 1);
  if (avail.length <= 1) { doEpochUp(avail[0]); return; }
  mkFresh('factionModal',
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

/* ---------------- v1.4.3 «Второй Круг»: РЕСТАРТ ЭПОХИ ----------------
   Кнопка над «Меню». Тык → ОБЯЗАТЕЛЬНОЕ подтверждение → выбор фракции
   ТЕКУЩЕЙ Эпохи → забег начинается с нуля. Печатей 🔱 НЕ даёт. */
function confirmEpochRestart() {
  const s = epochResetSummary();
  mkFresh('epochWarn',
    '<h2>⟲ Рестарт ЭПОХИ ' + epoch + ' «' + epochName(epoch) + '»</h2>' +
    '<div class="res">Эпоха НЕ вырастет — вы начинаете её <b>с самого начала</b>. ' +
    'Печатей 🔱 рестарт не даёт. Фракцию можно выбрать заново.</div>' +
    '<div class="warn-cols"><div class="warn-col bad"><b>СГОРИТ:</b><ul>' + s.reset.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="warn-col good"><b>ОСТАНЕТСЯ:</b><ul>' + s.keep.map(x => '<li>' + x + '</li>').join('') + '</ul></div></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="ewNo">Отмена</button><button class="btn btn-take" id="ewYes" style="background:#4a1010">⟲ НАЧАТЬ ЭПОХУ ' + epoch + ' ЗАНОВО</button></div>', 600);
  $('ewNo').onclick = () => close_('epochWarn');
  $('ewYes').onclick = () => { close_('epochWarn'); pickFactionForRestart(); };
  open_('epochWarn');
}

/* Выбор фракции на рестарт: по ТЕКУЩЕЙ эпохе (в отличие от Вознесения — epoch + 1) */
function pickFactionForRestart() {
  const avail = epochFactions(epoch);
  if (avail.length <= 1) { doEpochRestart(avail[0]); return; }
  mkFresh('factionModal',
    '<h2>Выберите фракцию Эпохи ' + epoch + '</h2>' +
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
    fc.onclick = () => { const f = fc.dataset.f; close_('factionModal'); doEpochRestart(f); };
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
    '<h2>🏅 Достижения</h2><div class="res" id="achvCnt"></div><div id="chronBox"></div><div id="achvBody"></div>' +
    '<div class="flavor">Способ получения всегда известен заранее. Наград нет — только слава и коллекция.</div>' +
    '<div id="statsBox"></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="achvX">Закрыть</button></div>', 550);
  $('achvX').onclick = () => close_('achvModal');
  renderAchvList();
  open_('achvModal');
}
function renderAchvList() {
  $('achvCnt').innerHTML = 'Получено: <b>' + achvCount() + ' / ' + ACHIEVEMENTS.length + '</b>';
  renderChronicles(); /* v1.2.9: Хроники Тьмы — вершины коллекции */
  $('achvBody').innerHTML = ACHIEVEMENTS.map(a => {
    const done = !!achDone[a.id];
    return '<div class="achv-row ' + (done ? 'done' : '') + '"><span class="achv-icon">' + (done ? '🏅' : '▫️') + '</span>' +
      '<span><b>' + a.name + '</b><br><small>' + a.desc + '</small></span></div>';
  }).join('');
  renderStats();
}

/* ---------------- v1.2.9: ХРОНИКИ ТЬМЫ — блок в окне достижений ----------------
   На фракцию: ★3-набор (+2 🔱), здания (+2), ★4 (+3), ★5 (+5). Разовые. */
function renderChronicles() {
  const box = $('chronBox'); if (!box) return;
  let rows = '';
  FACTION_KEYS.forEach(f => {
    const parts = CHRON_TIERS.map(t => {
      const list = chronCards(f, t.r);
      const have = list.filter(id => discovered.has(id)).length;
      const done = !!chron[f + t.r];
      return '<div class="chron-tier' + (done ? ' done' : '') + '" title="' + FACTION_INFO[f].name + ' · ' + t.name + ': ' + have + '/' + list.length + '">' +
        '<span class="chron-r">' + (t.r === 'B' ? '🏛' : '★'.repeat(+t.r)) + '</span>' +
        '<span class="chron-bar"><i style="width:' + (list.length ? Math.floor(have / list.length * 100) : 0) + '%"></i></span>' +
        '<span class="chron-val">' + have + '/' + list.length + '</span>' +
        '<span class="chron-rw">' + (done ? '✔ +' + t.reward + ' 🔱' : '+' + t.reward + ' 🔱') + '</span></div>';
    }).join('');
    rows += '<div class="chron-fac"><span class="chron-name" style="color:' + FACTION_INFO[f].color + '">' + FACTION_INFO[f].name + '</span>' + parts + '</div>';
  });
  box.innerHTML = '<h3>📖 Хроники Тьмы — вершины коллекции</h3>' +
    '<div class="res">За ПОЛНОЕ открытие набора фракции — разовые печати. Награды уже полученные отмечены ✔.</div>' +
    '<div class="chron-grid">' + rows + '</div>';
}

/* ---------------- Статистика (внутри Достижений, пункт 5 ТЗ) ---------------- */
const GAME_NAMES = { slots: '🎰 Слоты', aviator: '✈ Авиатор', roulette: '🎡 Рулетка', blackjack: '🂡 Блэкджек' };
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
