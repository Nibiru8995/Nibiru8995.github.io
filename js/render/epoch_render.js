'use strict';
/*
РЕНДЕР: ЭПОХИ, ДОСТИЖЕНИЯ, НАСТРОЙКИ (render/epoch_render.js) — v1.8.0
Меню Эпохи БЕЗ ГРЕЙДОВ: прогресс порога, вехи забега, кнопка Вознесения.
Эпохи бесконечны (порог ×4), ничего не открывают — все покупки за Души
в «Улучшениях». При выборе расы на Эпоху (Вознесение / Рестарт /
Новая игра) игрок ОБЯЗАН выбрать колоду — окно выбора колоды.
 ============================================================*/

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
  const next = epoch + 1;
  $('epochBody').innerHTML =
    '<div class="res">Текущая Эпоха: <b>' + epoch + ' «' + epochName(epoch) + '»</b> · ' + FACTION_INFO[faction].epochTitle + ' · фракция: <b>' + FACTION_INFO[faction].name + '</b></div>' +
    '<div class="goal"><span>Прогресс: ' + fmtShort(p.earned) + ' / ' + fmtShort(p.threshold) + ' ' + DE_IMG + '</span><i style="width:' + Math.floor(p.pct * 100) + '%"></i><em>' + Math.floor(p.pct * 100) + '%</em></div>' +
    '<div class="up"><b>🧱 Поле Алтаря: ' + playableSize + '×' + playableSize + '</b><br><small>Размер поля задаётся покупками в «Улучшениях» — от Эпохи больше не растёт.</small></div>' +
    milHtml() +
    '<div class="flavor">Эпохи БЕСКОНЕЧНЫ: за переход платим Душой (' + SOUL_IMG + ' +1), пороги растут ×4. Разблокировок больше нет — фичи, поле, ★4/★5 и фракции покупаются Душами в «Улучшениях» (Меню → Улучшения).</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="epochGoBtn" style="max-width:none" ' + (canEpochUp() ? '' : 'disabled') + '>' +
    (canEpochUp() ? '⚔ НАЧАТЬ ЭПОХУ ' + next + ' «' + epochName(next) + '» → +' + SOUL_IMG + ' 1 Душа' : 'Порог не достигнут (' + Math.floor(p.pct * 100) + '%)') + '</button></div>';

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

/* ---------------- Окно-предупреждение перед Вознесением ---------------- */
function confirmEpochUp() {
  const s = epochResetSummary();
  const next = epoch + 1;
  mkFresh('epochWarn',
    '<h2>⚜ Вознесение: ЭПОХА ' + next + ' «' + epochName(next) + '»</h2>' +
    '<div class="res">Награда: ' + SOUL_IMG + ' <b>+1 Душа</b> · Эпоха ' + next + ' из бесконечной череды (порог вырастет)</div>' +
    '<div class="warn-cols"><div class="warn-col bad"><b>СБРОСИТСЯ:</b><ul>' + s.reset.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="warn-col good"><b>ОСТАНЕТСЯ:</b><ul>' + s.keep.map(x => '<li>' + x + '</li>').join('') + '</ul></div></div>' +
    '<div class="flavor">Дальше — ОБЯЗАТЕЛЬНЫЙ выбор колоды: забег получит её целиком.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="ewNo">Отмена</button><button class="btn btn-take" id="ewYes" style="background:#4a1010">⚔ ДАЛЬШЕ</button></div>', 600);
  $('ewNo').onclick = () => close_('epochWarn');
  $('ewYes').onclick = () => { close_('epochWarn'); pickFactionAndAscend(); };
  open_('epochWarn');
}

/* ---------------- Выбор колоды (без выбора фракции: раса остаётся ТЕКУЩЕЙ) ----------------
   Вознесение и рестарт ведут сразу к окну выбора колоды (openDeckPick). */
function pickFactionAndAscend() {
  openDeckPick(null, d => doEpochUp(d.race, d)); /* раса — та, чья колода выбрана */
}

/* ---------------- РЕСТАРТ ЭПОХИ ----------------
   Кнопка над «Меню». Тык → ОБЯЗАТЕЛЬНОЕ подтверждение → выбор колоды
   ТЕКУЩЕЙ фракции → забег начинается с нуля. */
function confirmEpochRestart() {
  const s = epochResetSummary();
  mkFresh('epochWarn',
    '<h2>⟲ Рестарт ЭПОХИ ' + epoch + ' «' + epochName(epoch) + '»</h2>' +
    '<div class="res">Эпоха НЕ вырастет — вы начинаете её <b>с самого начала</b>. ' +
    'Награды Вознесения нет. Колоду можно выбрать заново.</div>' +
    '<div class="warn-cols"><div class="warn-col bad"><b>СГОРИТ:</b><ul>' + s.reset.map(x => '<li>' + x + '</li>').join('') + '</ul></div>' +
    '<div class="warn-col good"><b>ОСТАНЕТСЯ:</b><ul>' + s.keep.map(x => '<li>' + x + '</li>').join('') + '</ul></div></div>' +
    '<div class="btn-row"><button class="btn btn-take" id="ewNo">Отмена</button><button class="btn btn-take" id="ewYes" style="background:#4a1010">⟲ НАЧАТЬ ЭПОХУ ' + epoch + ' ЗАНОВО</button></div>', 600);
  $('ewNo').onclick = () => close_('epochWarn');
  $('ewYes').onclick = () => { close_('epochWarn'); pickFactionForRestart(); };
  open_('epochWarn');
}

/* Рестарт: сразу выбор колоды — фракция остаётся ТЕКУЩЕЙ */
function pickFactionForRestart() {
  openDeckPick(null, d => doEpochRestart(d.race, d)); /* раса — та, чья колода выбрана */
}

/* ---------------- ВЫБОР КОЛОДЫ (обязательный шаг, v1.8.0) ----------------
   При выборе расы на Эпоху игрок обязан выбрать колоду этой расы —
   забег получит её целиком (включая застакованные карты).
   onPick(dek) — что делать дальше (doEpochUp / doEpochRestart / startFreshRun). */
function openDeckPick(race, onPick) {
  /* race == null → показываем колоды ВСЕХ открытых рас (значок расы в строке),
     race != null → только колоды этой расы. */
  const races = race ? [race] : availFactions();
  races.forEach(ensureStarterDeck);
  const list = decks.filter(k => races.indexOf(k.race) >= 0);
  mkFresh('deckPickModal',
    '<h2>ВЫБЕРИТЕ КОЛОДУ</h2>' +
    '<div class="res">Забег выдаст <b>ВСЮ колоду целиком</b> (застакованные карты — стопками ×N). Кликните по колоде, чтобы выбрать её.</div>' +
    '<div class="deckpick-list">' +
    (list.length ? list.map(d =>
      '<div class="deckpick-row" data-dk="' + d.id + '">' +
      '<span class="gdr-fic">' + lbFactionIcon(d.race) + '</span>' +
      '<span class="gdr-div"></span>' +
      '<span class="gdr-name">' + String(d.name || '').replace(/[<>&]/g, '') + '</span>' +
      '<span class="gdr-count">' + deckTotal(d) + '/' + deckCap() + '</span>' +
      '</div>').join('') : '<div class="fighter-empty">Колод нет — соберите их в Гримуаре.</div>') +
    '</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="dpCancel" style="max-width:none;width:auto;min-width:110px">Закрыть</button></div>', 600);
  const pickIt = id => {
    const d = deckById(id);
    if (!d) return;
    if (!deckTotal(d)) {
      ask('Колода «' + d.name + '» пуста — забег получит стартовый набор вместо неё. Продолжить?', () => { close_('deckPickModal'); onPick(d); });
      return;
    }
    close_('deckPickModal');
    onPick(d);
  };
  $('deckPickModal').querySelectorAll('.deckpick-row').forEach(row => {
    row.onclick = () => pickIt(row.dataset.dk);
  });
  $('dpCancel').onclick = () => close_('deckPickModal');
  open_('deckPickModal');
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
  renderChronicles(); /* Хроники Тьмы — вершины коллекции */
  $('achvBody').innerHTML = ACHIEVEMENTS.map(a => {
    const done = !!achDone[a.id];
    return '<div class="achv-row ' + (done ? 'done' : '') + '"><span class="achv-icon">' + (done ? '🏅' : '▫️') + '</span>' +
      '<span><b>' + a.name + '</b><br><small>' + a.desc + '</small></span></div>';
  }).join('');
  renderStats();
}

/* ---------------- : ХРОНИКИ ТЬМЫ — блок в окне достижений ----------------
 На фракцию: ★3-набор (+2 души), здания (+2), ★4 (+3), ★5 (+5). Разовые.
 v1.8.0: вместо печатей 🔱 — ДУШИ (печати удалены из игры). */
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
        '<span class="chron-rw">' + (done ? '✔ +' + t.reward + ' душ' : '+' + t.reward + ' душ') + '</span></div>';
    }).join('');
    rows += '<div class="chron-fac"><span class="chron-name" style="color:' + FACTION_INFO[f].color + '">' + FACTION_INFO[f].name + '</span>' + parts + '</div>';
  });
  box.innerHTML = '<h3>📖 Хроники Тьмы — вершины коллекции</h3>' +
    '<div class="res">За ПОЛНОЕ открытие набора фракции — разовые Души. Награды уже полученные отмечены ✔.</div>' +
    '<div class="chron-grid">' + rows + '</div>';
}

/* ---------------- Статистика (внутри Достижений) ---------------- */
const GAME_NAMES = { slots: '🎰 Слоты', aviator: '🦅 Авиатор', roulette: '🎡 Рулетка', blackjack: '🂡 Блэкджек' };
function renderStats() {
  const box = $('statsBox');
  if (!box) return;
  const top = Object.entries(stats.pulls).sort((a, b) => b[1] - a[1])[0];
  const fmtN = n => fmtSigned(n);
  box.innerHTML = '<h3>📊 Статистика</h3><div class="stt">' +
    Object.keys(GAME_NAMES).map(k => {
      const o = stats.g[k] || { w: 0, l: 0, net: 0 };
      return '<div>' + GAME_NAMES[k] + '</div><div>✔' + o.w + ' ✖' + o.l + '</div><div style="color:' + (o.net >= 0 ? '#8f8' : '#f88') + '">' + fmtN(o.net) + ' ТЭ</div>';
    }).join('') + '</div>' +
    '<div>⭐ Любимая карта: <b>' + (top ? cardArtHTML(CARDS[top[0]], 'inline-art', '') + ' ' + CARDS[top[0]].name + ' (×' + top[1] + ')' : '—') + '</b></div>' +
    '<div>📈 Рекорд дохода: <b>' + stats.maxInc.toFixed(1) + '/сек</b></div>' +
    '<div>🎲 Круток всего: <b>' + fmt(stats.rolls) + '</b> (за Эпоху: ' + fmt(runRolls) + ')</div>' +
    '<div>' + SOUL_IMG + ' Душ заработано за всё время: <b>' + fmt(stats.soulsEarned || 0) + '</b></div>' +
    '<div>⚜ Эпоха: <b>' + epoch + '</b> · рекорд: <b>' + maxEpoch + '</b></div>' +
    '<div>🧱 Алтарь: <b>' + playableSize + '×' + playableSize + '</b></div>';
}
