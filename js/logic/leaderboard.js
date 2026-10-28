'use strict';
/* ============================================================
   ЛОГИКА: ТАБЛИЦА ТЬМЫ (logic/leaderboard.js) — v1.2.9.2
   Облачный топ инкама по Эпохам + счётчик игроков за день
   (Supabase, Free-план).

   КОГДА ПИШЕМ В БАЗУ (v1.2.9.2 — договорённость с Гриндером):
   1) открытие страницы → пинг (день + устройство): счётчик «за день»;
   2) Вознесение → рекорд забега (force — Эпоха выросла всегда);
   3) уход со страницы → рекорд ТОЛЬКО если вырос с прошлой отправки.
   Периодических «сердцебиений» нет. UPDATE-политик в базе нет:
   повторов не бывает, потому что пишем только рост score, а
   лучшие результаты игроков дедуплицируются при показе топа.

   В коде сайта — только publishable-ключ (его и так видно в F12);
   RLS базы разрешает INSERT и SELECT, обновлять/удалять нельзя.
   При отсутствии базы (SQL ещё не выполнен) игра живёт как раньше.
   ============================================================ */

const SUPA_URL = 'https://gtxutfpdfknpttrkjzhq.supabase.co';
const SUPA_KEY = 'sb_publishable_3pAfzOXNPB8k4yPnlTd3bQ_c7ul-Fsk';
const LB_TOP = 5; /* размер показываемого топа */

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
  return n;
}

/* Лучшая Легендарность, уже отправленная в базу с этого устройства */
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

/* ---------------- ЗАПИСЬ РЕКОРДА ----------------
   force=true — «Вознесение» (новая Эпоха → писать гарантированно).
   silent=true — без тоста (фон при уходе со страницы). */
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
      if (!silent) toast('🏆 <b>Рекорд записан в Табличку Тьмы!</b> Смотри 🏆 РЕЙТИНГ');
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

/* ---------------- ПРИГЛАШЕНИЕ ВВЕСТИ НИК ----------------
   Показывается один раз, пока в памяти нет имени. */
function maybeAskNick() {
  try { if (localStorage.getItem('gg3_player')) return; } catch (e) { }
  mk('nickModal',
    '<h2>👑 КАК ТЕБЯ ЗОВУТ, ГРИНДЕР?</h2>' +
    '<div class="desc">Тьма ведёт <b>Табличку Тьмы</b> — топ инкама по Эпохам. ' +
    'Записываются твои Вознесения. Имя меняется когда угодно в 🏆 РЕЙТИНГ.</div>' +
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

/* ---------------- ОКНО РЕЙТИНГА (топ-5) ---------------- */
function lbFactionIcon(f) {
  const F = { undead: '⛓', cultist: '🔯', beast: '🐾', demon: '🔥' };
  return F[f] || '⚜';
}

function leaderboardOpen() {
  mk('lbModal',
    '<h2>🏆 ТАБЛИЦА ТЬМЫ</h2>' +
    '<div class="desc" id="lbInfo">Читаем в Тьму…</div>' +
    '<div id="lbRows" style="min-height:100px"></div>' +
    '<div class="btn-row" style="gap:8px">' +
    '<input id="lbNickIn" maxlength="20" placeholder="Псевдоним" style="flex:1;padding:8px 10px;background:#0d0a0f;border:1px solid #3a3040;color:#e8dcc8;border-radius:8px;font-family:inherit">' +
    '<button class="btn btn-take" id="lbNickSave">Записать имя</button>' +
    '<button class="btn btn-take" id="lbResend">Отправить рекорд</button>' +
    '<button class="btn btn-take" id="lbX">Закрыть</button>' +
    '</div>', 620);
  open_('lbModal');
  $('lbNickIn').value = supaPlayerName();
  $('lbX').onclick = () => close_('lbModal');
  $('lbNickSave').onclick = () => {
    const saved = setSupaPlayerName($('lbNickIn').value);
    $('lbNickIn').value = saved;
    toast('🏆 Имя записано: <b>' + saved + '</b>. Рекорд перепишется при следующем Вознесении или росте.');
  };
  $('lbResend').onclick = () => {
    const before = lbBestSent();
    supaSubmit(runTime).then(() => {
      if (lbBestSent() === before) toast('⏳ Тьма уже знает этот рекорд — он пишется только при новом пике дохода или Вознесении.');
    });
  };
  renderLeaderboard();
}

async function renderLeaderboard() {
  const rows = $('lbRows'), info = $('lbInfo');
  if (!rows) return;
  rows.innerHTML = '<div style="opacity:.6;padding:14px 0">Читаем в Тьму…</div>';
  try {
    /* Топ по инкаму: берём 40 свежайших строк и дедупим игрока-Лучший,
       потому что UPDATE-ов в базе нет — история роста живёт строками. */
    const resPromise = fetch(
      SUPA_URL + '/rest/v1/leaderboard?order=max_inc.desc&limit=40' +
      '&select=player,max_inc,epoch,faction,created_at',
      { headers: supaHeaders() });
    const [res, daily] = await Promise.all([resPromise, supaDailyCount()]);
    if (info) {
      info.innerHTML = (daily !== null ? '👥 Игроков за день: <b>' + daily + '</b> · ' : '') +
        'Топ по инкаму (рекорд дохода/сек) · Легендарность = Эпоха × 1 млрд + инкам';
    }
    if (!res.ok) throw 0;
    const data = await res.json();
    if (!data.length) {
      rows.innerHTML = '<div style="opacity:.7;padding:14px 0">Табличка пуста. Вознесись — и стань первым гриндером в Тьме!</div>';
      return;
    }
    const best = {};
    data.forEach(r => {
      const k = (r.player || 'Аноним').toLowerCase();
      if (!best[k] || r.max_inc > best[k].max_inc) best[k] = r;
    });
    const top = Object.values(best).sort((a, b) => b.max_inc - a.max_inc).slice(0, LB_TOP);
    let html = '';
    top.forEach((r, i) => {
      const d = new Date(r.created_at);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1) + '.';
      const me = (r.player || 'Аноним') === supaPlayerName();
      html += '<div style="display:flex;gap:10px;padding:8px;border-bottom:1px solid rgba(255,255,255,.06);align-items:baseline">' +
        '<span style="min-width:36px">' + medal + '</span>' +
        '<span style="flex:1">' + lbFactionIcon(r.faction) + ' <b style="color:#e8c060">' +
        (me ? '<u>' + r.player + '</u>' : r.player) + '</b> ' +
        '<span style="opacity:.5;font-size:11px">«' + (d.getMonth() + 1) + '.' + d.getDate() + '»</span></span>' +
        '<span>⚜' + r.epoch + ' · <b style="color:#7fd4ff">' + fmtShort(r.max_inc) + '</b>/с</span>' +
        '</div>';
    });
    html += '<div style="opacity:.5;padding:8px 2px 0;font-size:12px">Топ-' + LB_TOP + ' по рекорду дохода/сек. ' +
      'Место — за твоим лучшим результатом: он переписывается при Вознесении или росте пика.</div>';
    rows.innerHTML = html;
  } catch (e) {
    rows.innerHTML = '<div style="opacity:.75;padding:14px 0">Тьма молчит: связь с базой не установлена. ' +
      'Если SQL для таблиц ещё не выполнен — выполни его в Supabase (SQL Editor), всё оживёт без пересохранений.</div>';
  }
}

/* Уход со страницы: вкладка спрятана/закрыта → тихая досылка роста */
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') supaLeave(); });
addEventListener('pagehide', supaLeave, true);
addEventListener('beforeunload', supaLeave);