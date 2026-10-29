'use strict';
/* ============================================================
   ЛОГИКА: СТЕНА ТЬМЫ (logic/wall.js) — v1.3.1
   Облачный чат в ГЛАВНОМ МЕНЮ. База — Supabase (Free-план),
   простенькая таблица wall_messages.

   v1.3.0 ТЗ: чат хранит ДО 15 СООБЩЕНИЙ — потолок держит
   триггер в самой базе (каждая вставка подчищает старьё),
   клиент дополнительно читает только последние 15.

   Имя — то же, что для Таблички Тьмы (gg3_player): анонимно,
   без регистрации; сменить — клик по имени под стеной.
   RLS базы разрешает только INSERT и SELECT. При отсутствии
   базы меню живёт как раньше — Тьма молчит.
   ============================================================ */

const WALL_LIMIT = 15;     // сколько сообщений живёт на Стене
const WALL_COOLDOWN = 5;   // сек между сообщениями с одного устройства

function wallEscape(s) {
  return String(s || '').replace(/[<>&"]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
function wallUrl() { return SUPA_URL + '/rest/v1/wall_messages'; }

let wallBusy = false, wallLastSent = 0, wallTimer = null;

/* --- Читаем последние 15 сообщений (новые внизу, как в чате) --- */
function wallFetch() {
  const rows = $('wallRows');
  if (!rows) return;
  fetch(wallUrl() + '?order=created_at.desc,id.desc&limit=' + WALL_LIMIT + '&select=id,name,text,created_at',
    { headers: supaHeaders() })
    .then(r => { if (!r.ok) throw 0; return r.json(); })
    .then(data => {
      const box = $('wallRows');
      if (!box) return;
      if (!data.length) {
        box.innerHTML = '<div class="wall-empty">Стена пуста. Оставь первое слово во Тьму.</div>';
        return;
      }
      box.innerHTML = data.slice().reverse().map(m => {
        const d = new Date(m.created_at);
        const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return '<div class="wall-msg"><span class="wall-name">' + wallEscape(m.name || 'Аноним') + '</span>' +
          '<span class="wall-text">' + wallEscape(m.text) + '</span>' +
          '<span class="wall-time">' + hh + '</span></div>';
      }).join('');
      box.scrollTop = box.scrollHeight;
    })
    .catch(() => {
      const box = $('wallRows');
      if (box) box.innerHTML = '<div class="wall-empty">Тьма молчит: Стена ещё не высечена.</div>';
    });
}

/* --- Отправить сообщение (дедуп по имени из Таблички Тьмы) --- */
function wallSend() {
  const inp = $('wallIn');
  if (!inp) return;
  const text = inp.value.replace(/[<>&"]/g, '').trim().slice(0, 200);
  if (!text) return;
  const now = Date.now();
  if (now - wallLastSent < WALL_COOLDOWN * 1000) {
    toast('✋ Тьма слышит и так: не чаще раза в ' + WALL_COOLDOWN + ' сек');
    return;
  }
  if (wallBusy) return;
  wallBusy = true;
  const go = $('wallGo');
  if (go) go.disabled = true;
  fetch(wallUrl(), {
    method: 'POST',
    headers: supaHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify({ name: supaPlayerName(), text: text })
  }).then(r => {
    if (!r.ok) throw 0;
    wallLastSent = now;
    inp.value = '';
    wallFetch();
  }).catch(() => {
    toast('🕯 Стена молчит: сообщение не ушло.');
  }).finally(() => {
    wallBusy = false;
    const g = $('wallGo');
    if (g) g.disabled = false;
  });
}

/* --- Смена имени (тот же ник, что и в Табличке Тьмы) --- */
function wallAskName() {
  mk('wallNameModal',
    '<h2>✒ ИМЯ НА СТЕНЕ</h2>' +
    '<div class="desc">Подпись под сообщениями Стены Тьмы. Она же — в Табличке Тьмы.</div>' +
    '<input id="wallNameIn" maxlength="20" placeholder="Псевдоним до 20 символов" ' +
    'style="width:100%;padding:9px 11px;background:#0d0a0f;border:1px solid #3a3040;color:#e8dcc8;border-radius:8px;font-family:inherit;margin:6px 0 4px">' +
    '<div class="btn-row" style="gap:8px">' +
    '<button class="btn btn-take" id="wallNameOk">Записать</button>' +
    '<button class="btn btn-take" id="wallNameX">Отмена</button>' +
    '</div>', 480);
  open_('wallNameModal');
  $('wallNameIn').value = supaPlayerName() === 'Аноним' ? '' : supaPlayerName();
  $('wallNameOk').onclick = () => {
    const n = setSupaPlayerName($('wallNameIn').value);
    const chip = $('wallName');
    if (chip) chip.textContent = n;
    close_('wallNameModal');
    toast('✒ Имя записано: <b>' + n + '</b>');
  };
  $('wallNameX').onclick = () => close_('wallNameModal');
}

/* --- Привязка + лёгкий поллинг, пока меню открыто --- */
function wallInit() {
  if (!$('wallRows')) return;
  $('wallGo').onclick = wallSend;
  $('wallIn').addEventListener('keydown', e => { if (e.key === 'Enter') wallSend(); });
  $('wallRefresh').onclick = wallFetch;
  $('wallName').textContent = supaPlayerName();
  $('wallName').onclick = wallAskName;
  wallFetch();
  /* v1.3.1 ТЗ: поллинг каждые 10 секунд — новые сообщения приходят сами,
     пока меню открыто; при закрытии фетч замирает */
  wallTimer = setInterval(() => {
    const menu = $('menu');
    if (menu && menu.classList.contains('show')) wallFetch();
  }, 10000);
}
