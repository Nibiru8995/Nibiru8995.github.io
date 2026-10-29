'use strict';
/* ============================================================
   ЛОГИКА: ТАБЛИЦА ТЬМЫ (logic/leaderboard.js) — v1.4.1
   Облачный топ инкама по Эпохам + счётчик игроков за день
   (Supabase, Free-план).

   v1.4.1 ТЗ: рейтинг переехал из кнопки в игре в ГЛАВНОЕ МЕНЮ,
   в блок НАД чатом (Стеной Тьмы). 10 вкладок по Эпохам:
   1..9 и «10+» (Эпоха 10 и выше). Запись игрока чёткая:
   ИГРОК — МАКСИМАЛЬНЫЙ ДОХОД (за выбранную Эпоху).
   Запросы с базы — по вкладке: epoch=eq.N, для «10+» — epoch=gte.10.

   КОГДА ПИШЕМ В БАЗУ (проверено v1.4.1 — три точки записи):
   1) открытие страницы → пинг (день + устройство): счётчик «за день»;
   2) Вознесение (конец Эпохи) → рекорд забега (force — Эпоха выросла);
   3) выход в меню (showMenu) → тихая запись, если рекорд вырос;
   4) уход со страницы (pagehide/visibilitychange/beforeunload) →
      тихая запись, только если рекорд вырос с прошлой отправки.
   Периодических «сердцебиений» нет. UPDATE-политик в базе нет:
   повторов не бывает, потому что пишем только рост score, а
   лучшие результаты игроков дедуплицируются при показе топа.

   В коде сайта — только publishable-ключ (его и так видно в F12);
   RLS базы разрешает INSERT и SELECT, обновлять/удалять нельзя.
   При отсутствии базы (SQL ещё не выполнен) игра живёт как раньше.
   ============================================================ */

const SUPA_URL = 'https://gtxutfpdfknpttrkjzhq.supabase.co';
const SUPA_KEY = 'sb_publishable_3pAfzOXNPB8k4yPnlTd3bQ_c7ul-Fsk';
const LB_TOP = 6;          /* строк в топе одной вкладки */
const LB_EPOCH_TABS = 10;  /* вкладки 1..9 + «10+» */

function supaHeaders(extra) {
  return Object.assign({
    apikey: SUPA_KEY,
    Authorization: 'Bearer ' + SUPA_KEY,
    'Content-Type': 'application/json'
  }, extra || {});
}

/* Идентификатор устройства (ник анонимен связке ник↔устройство) */
function supaVisitor() {
  let v = null;
  try { v = localStorage.getItem('gg3_visitor'); } catch (e) { }
  if (!v) {
    v = 'v' + Math.random().toString(36).slice(2, 12) +
      Math.random().toString(36).slice(2, 12) + (+new Date()).toString(36);
    try { localStorage.setItem('gg3_visitor', v); } catch (e) { }
  }
  return v;
}

/* Псевдоним (локальный, без регистрации) */
function supaPlayerName() {
  try { return localStorage.getItem('gg3_player') || 'Аноним'; } catch (e) { return 'Аноним'; }
}
function setSupaPlayerName(n) {
  n = String(n || '').replace(/[<>&"]/g, '').trim().slice(0, 20);
  if (!n) n = 'Аноним';
  try { localStorage.setItem('gg3_player', n); } catch (e) { }
  /* v1.3.1 ТЗ: ник меняется НА МЕСТЕ, а не после обновления страницы —
     чип Стены Тьмы перерисовывается сразу */
  const chip = $('wallName');
  if (chip) chip.textContent = n;
  return n;
}

/* Лучшая запись, уже отправленная в базу с этого устройства
   (score = Эпоха × 1 млрд + инкам) */
function lbBestSent() {
  try { return +localStorage.getItem('gg3_lbBest') || 0; } catch (e) { return 0; }
}
function lbSetBestSent(s) {
  try { localStorage.setItem('gg3_lbBest', String(s)); } catch (e) { }
}

/* Текущая Легендарность: Эпоха × 1 млрд + рекорд дохода/сек.
   Эпоха — главный ранжир (дальность забега), инкам — тайбрейкер. */
function lbCurrentScore() {
  const inc = Math.max(0, Math.floor(stats.maxInc || 0));
  return epoch * 1000000000 + Math.min(999999999, inc);
}

/* UTC-день: один на весь мир, «игроков за день» считается одинаково у всех */
function supaToday() { return new Date().toISOString().slice(0, 10); }

/* ---------------- ПИНГ ОТКРЫТИЯ (уникальный игрок за день) ---------------- */
function supaPing() {
  try {
    fetch(SUPA_URL + '/rest/v1/daily_visitors', {
      method: 'POST',
      headers: supaHeaders({ Prefer: 'resolution=ignore-duplicates,return=minimal' }),
      body: JSON.stringify({ day: supaToday(), visitor: supaVisitor() })
    }).catch(() => { });
  } catch (e) { }
}

function supaDailyCount() {
  return fetch(SUPA_URL + '/rest/v1/daily_visitors?day=eq.' + supaToday() + '&select=day',
    { headers: supaHeaders({ Prefer: 'count=exact' }) })
    .then(res => {
      const cr = res.headers.get('content-range'); /* '0-12/13' */
      if (cr) { const n = parseInt(cr.split('/')[1], 10); if (!isNaN(n)) return n; }
      return null;
    }).catch(() => null);
}

/* v1.4.1: «Активных игроков за день : N» — скромная строка ПОД чатом */
function renderDailyCount() {
  const el = $('wallDaily');
  if (!el) return;
  supaDailyCount().then(n => {
    if (!el) return;
    if (n === null) { el.style.display = 'none'; return; } /* база молчит — строка не мешает */
    el.textContent = 'Активных игроков за день : ' + n;
    el.style.display = '';
  });
}

/* ---------------- ЗАПИСЬ РЕКОРДА ----------------
   force=true — «Вознесение» (новая Эпоха → писать гарантированно).
   silent=true — без тоста (фон при выходе в меню / уходе со страницы). */
function supaSubmit(runSecs, force, silent) {
  if (typeof noSave !== 'undefined' && noSave) return Promise.resolve(); /* обучение/чит-режим не пишутся */
  const score = lbCurrentScore();
  if (!force && score <= lbBestSent()) return Promise.resolve(); /* нет роста — нет строки */
  const inc = Math.max(0, Math.floor(stats.maxInc || 0));
  return fetch(SUPA_URL + '/rest/v1/leaderboard', {
    method: 'POST',
    keepalive: true, /* переживает закрытие вкладки */
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({
      player: supaPlayerName(),
      score: score,
      epoch: Math.max(1, Math.min(999, epoch)),
      max_inc: inc,
      run_secs: Math.max(0, Math.round(runSecs || 0)),
      faction: String(faction).slice(0, 16)
    })
  }).then(res => {
    if (res.ok) {
      lbSetBestSent(score);
      if (!silent) toast('🏆 <b>Рекорд записан в Табличку Тьмы!</b> Смотри меню — блок над Стеной.');
    }
  }).catch(() => { /* оффлайн — не страшно */ });
}

/* Уход со страницы: вкладка спрятана/закрыта → тихая досылка роста */
let lbLeftGuard = 0;
function supaLeave() {
  if (!gameStarted || (typeof noSave !== 'undefined' && noSave)) return;
  const now = Date.now();
  if (now - lbLeftGuard < 1500) return; /* visibilitychange+pagehide+beforeunload сыпятся пачкой */
  lbLeftGuard = now;
  supaSubmit(runTime, false, true);
}

/* v1.4.1: выход в ГЛАВНОЕ МЕНЮ — та же тихая запись роста */
function supaMenuSave() {
  if (!gameStarted || (typeof noSave !== 'undefined' && noSave)) return;
  supaSubmit(runTime, false, true);
}

/* ---------------- ПРИГЛАШЕНИЕ ВВЕСТИ НИК ----------------
   Показывается один раз, пока в памяти нет имени. */
function maybeAskNick() {
  try { if (localStorage.getItem('gg3_player')) return; } catch (e) { }
  mk('nickModal',
    '<h2>👑 КАК ТЕБЯ ЗОВУТ, ГРИНДЕР?</h2>' +
    '<div class="desc">Тьма ведёт <b>Табличку Тьмы</b> — топ инкама по Эпохам, теперь в главном меню. ' +
    'Записываются твои Вознесения. Имя меняется когда угодно под Стеной Тьмы.</div>' +
    '<input id="nickIn" maxlength="20" placeholder="Псевдоним до 20 символов" ' +
    'style="width:100%;padding:10px 12px;background:#0d0a0f;border:1px solid #3a3040;color:#e8dcc8;border-radius:8px;font-family:inherit;margin:6px 0 4px">' +
    '<div class="btn-row" style="gap:8px">' +
    '<button class="btn btn-take" id="nickOk">Записать в Тьму</button>' +
    '<button class="btn btn-take" id="nickSkip">Остаться Анонимом</button>' +
    '</div>', 700);
  open_('nickModal');
  $('nickOk').onclick = () => {
    setSupaPlayerName($('nickIn').value);
    close_('nickModal');
  };
  $('nickSkip').onclick = () => { setSupaPlayerName(''); close_('nickModal'); };
}

/* ================= БЛОК РЕЙТИНГА В ГЛАВНОМ МЕНЮ =================
   10 вкладок по Эпохам: 1..9 и «10+». Строка рейтинга — чётко:
   ИГРОК — МАКСИМАЛЬНЫЙ ДОХОД (рекорд дохода/сек в этой Эпохе). */

function lbFactionIcon(f) {
  const F = { undead: '⛓', cultist: '🔯', beast: '🐾', demon: '🔥' };
  return F[f] || '⚜';
}
function lbEscape(s) {
  return String(s || '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
function lbTabLabel(n) { return n >= LB_EPOCH_TABS ? '10+' : String(n); }
function lbTabFilter(n) { return n >= LB_EPOCH_TABS ? 'epoch=gte.10' : 'epoch=eq.' + n; }

let lbTab = 1;

function lbBuildTabs() {
  const box = $('lbTabs');
  if (!box) return;
  box.innerHTML = '';
  for (let n = 1; n <= LB_EPOCH_TABS; n++) {
    const b = document.createElement('button');
    b.className = 'lb-tab' + (n === lbTab ? ' active' : '');
    b.textContent = lbTabLabel(n);
    b.title = n >= LB_EPOCH_TABS ? 'Эпоха 10 и выше' : 'Эпоха ' + n;
    b.onclick = () => lbSetTab(n);
    box.appendChild(b);
  }
}

function lbSetTab(n) {
  lbTab = n;
  lbBuildTabs();
  lbFetch();
}

function lbInit() {
  if (!$('lbRows')) return;
  /* открываем вкладку текущей Эпохи (для «10+» — последняя вкладка) */
  lbTab = Math.max(1, Math.min(LB_EPOCH_TABS, Math.floor(epoch || 1)));
  lbBuildTabs();
  const rf = $('lbRefresh');
  if (rf) rf.onclick = lbFetch;
  lbFetch();
}

async function lbFetch() {
  const rows = $('lbRows');
  if (!rows) return;
  rows.innerHTML = '<div class="wall-empty">Читаем в Тьму…</div>';
  try {
    /* Топ Эпохи по инкаму: берём 40 свежайших строк вкладки и дедупим
       игрока-Лучший, потому что UPDATE-ов в базе нет — история роста
       живёт строками. */
    const res = await fetch(
      SUPA_URL + '/rest/v1/leaderboard?' + lbTabFilter(lbTab) +
      '&order=max_inc.desc&limit=40&select=player,max_inc,epoch,faction,created_at',
      { headers: supaHeaders() });
    if (!res.ok) throw 0;
    const data = await res.json();
    const best = {};
    (data || []).forEach(r => {
      const k = String(r.player || 'Аноним').toLowerCase();
      if (!best[k] || r.max_inc > best[k].max_inc) best[k] = r;
    });
    const top = Object.values(best).sort((a, b) => b.max_inc - a.max_inc).slice(0, LB_TOP);
    if (!top.length) {
      rows.innerHTML = '<div class="wall-empty">В Эпохе «' + lbTabLabel(lbTab) +
        '» пока пусто. Вознесись — и впиши себя первым!</div>';
      return;
    }
    let html = '';
    top.forEach((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      const me = (r.player || 'Аноним') === supaPlayerName();
      const epTag = lbTab >= LB_EPOCH_TABS ? '<span class="lb-ep">Э' + r.epoch + '</span>' : '';
      html += '<div class="lb-row">' +
        '<span class="lb-place">' + medal + '</span>' +
        '<span class="lb-player">' + lbFactionIcon(r.faction) + ' <b' + (me ? ' class="lb-me"' : '') + '>' +
        lbEscape(r.player || 'Аноним') + '</b></span>' +
        '<span class="lb-score">⚜<b>' + fmtShort(r.max_inc) + '</b>/с ' + epTag + '</span>' +
        '</div>';
    });
    rows.innerHTML = html;
  } catch (e) {
    rows.innerHTML = '<div class="wall-empty">Тьма молчит: связь с базой не установлена. ' +
      'Если SQL для таблиц ещё не выполнен — выполни его в Supabase (SQL Editor), всё оживёт без пересохранений.</div>';
  }
}

/* Уход со страницы: вкладка спрятана/закрыта → тихая досылка роста */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') supaLeave(); });
addEventListener('pagehide', supaLeave, true);
addEventListener('beforeunload', supaLeave);
