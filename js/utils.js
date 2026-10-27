'use strict';
/* ============================================================
   УТИЛИТЫ (utils.js)
   Вспомогательные функции: DOM-шорткаты, рандом, форматирование,
   модальные диалоги. Ничего не знает об игровом состоянии.
   ============================================================ */

const $ = id => document.getElementById(id);
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = n => Math.floor(Math.random() * n);
const pick = arr => arr[rand(arr.length)];

function fmt(n) { return Math.floor(n).toLocaleString('ru-RU'); }
function fmtSigned(n) { return (n >= 0 ? '+' : '−') + Math.round(Math.abs(n)).toLocaleString('ru-RU'); }
function fmtShort(n) {
  n = Math.floor(n);
  if (n >= 1e12) return (n / 1e12).toFixed(2) + ' трлн';
  if (n >= 1e9) return (n / 1e9).toFixed(2) + ' млрд';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + ' млн';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + ' тыс';
  return n.toLocaleString('ru-RU');
}

/* Взвешенный выбор из карты {ключ: вес} */
function weightedPick(map) {
  let total = 0;
  for (const k in map) total += map[k];
  let r = Math.random() * total;
  for (const k in map) { r -= map[k]; if (r <= 0) return k; }
  return Object.keys(map)[0];
}

/* n различных элементов из пула (без повторов, если пул позволяет) */
function drawDistinct(pool, n) {
  const copy = pool.slice();
  const out = [];
  while (out.length < n && copy.length) out.push(copy.splice(rand(copy.length), 1)[0]);
  while (out.length < n) out.push(pick(pool));
  return out;
}

let toastT = null;
function toast(t) {
  const e = $('toast'); if (!e) return;
  e.innerHTML = t; /* допускает <b> и эмодзи-разметку из внутренних тостов игры */
  e.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => e.classList.remove('show'), 2400);
}

/* Динамическое создание модального окна (как в старом v3) */
function mk(id, html, z) {
  if ($(id)) return $(id);
  const d = document.createElement('div');
  d.className = 'modal'; d.id = id;
  d.innerHTML = '<div class="modal-card" style="max-width:580px;align-items:stretch;max-height:92vh;overflow:auto">' + html + '</div>';
  if (z) d.style.zIndex = z;
  document.body.appendChild(d);
  return d;
}
const open_ = id => $(id).classList.add('show');
const close_ = id => $(id).classList.remove('show');

/* Диалог подтверждения */
function ask(text, onYes) {
  mk('dlg', '<div id="dlgT" style="font-size:15px;text-align:center;margin:10px;line-height:1.5"></div><div class="btn-row"><button class="btn btn-take" id="dlgNo">Отмена</button><button class="btn btn-take" id="dlgYes">Да</button></div>', 600);
  $('dlgT').textContent = text; open_('dlg');
  $('dlgYes').onclick = () => { close_('dlg'); onYes(); };
  $('dlgNo').onclick = () => close_('dlg');
}

/* Позиционирование тултипа у курсора */
function moveTooltip(e) {
  const tt = $('tooltip'); if (!tt) return;
  tt.style.left = Math.min(e.clientX + 14, window.innerWidth - 330) + 'px';
  tt.style.top = Math.min(e.clientY + 14, window.innerHeight - 240) + 'px';
}
function hideTooltip() { const tt = $('tooltip'); if (tt) tt.classList.remove('show'); }

/* Экспоненциальная кривая: base * growth^n (для цен и наград) */
function curve(base, growth, n) { return base * Math.pow(growth, n); }

/* ================= СПРАЙТЫ КАРТ (assets/cards) =================
   Пиксель-арт спрайты карт лежат в assets/cards/<id>.png.
   Если файл отсутствует (папка assets не скопирована), картинка
   автоматически заменяется на эмодзи-фолбэк через onerror. */
const CARD_ART_DIR = 'assets/cards/';

/* img-тег спрайта; fbCls — класс фолбэк-спана с эмодзи */
function cardArtHTML(card, imgCls, fbCls) {
  return '<img class="' + imgCls + '" src="' + CARD_ART_DIR + card.id + '.png" alt="" ' +
    'onerror="cardArtFail(this,\'' + (fbCls || '') + '\',\'' + card.symbol + '\')">';
}
function cardArtFail(img, fbCls, symbol) {
  const s = document.createElement('span');
  s.className = fbCls || '';
  s.textContent = symbol || '🃏';
  img.replaceWith(s);
}
