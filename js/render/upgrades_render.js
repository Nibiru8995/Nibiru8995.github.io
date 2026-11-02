'use strict';
/* ============================================================
   РЕНДЕР: УЛУЧШЕНИЯ (render/upgrades_render.js) — v1.8.0
   Окно «✦ Улучшения» (Меню → Улучшения): все мета-покупки за ДУШИ.
   Разделы: Фичи / Поле / Призыв / Фракции / Бонусы / Реликвии.
   Реликвии — заглушка: способа получить их пока нет (позже).
   ============================================================ */

function openUpgrades() {
  mk('upgModal',
    '<h2>✦ УЛУЧШЕНИЯ</h2>' +
    '<div class="res upg-res">Мастерская Тьмы. Всё покупается <b>Душами</b> ' + SOUL_IMG +
    ' — источники: старт 30, смена Эпохи, каждые 5 этажей Арены, контракты. <span class="upg-souls">В наличии: <b id="upgSouls">0</b></span></div>' +
    '<div id="upgList" style="width:100%"></div>' +
    '<div class="flavor">Эпохи больше ничего не открывают — только порог (растёт ×4). Всё остальное — здесь, за Души.</div>' +
    '<div class="btn-row"><button class="btn btn-take" id="upgX">Закрыть</button></div>', 560);
  $('upgX').onclick = () => close_('upgModal');
  renderUpgrades();
  open_('upgModal');
}

function upgRowHTML(icon, name, desc, rightHTML, cls) {
  return '<div class="epoch-row upg-row ' + (cls || 'on') + '">' +
    '<span class="er-icon">' + icon + '</span>' +
    '<span class="er-txt"><b>' + name + '</b><br><small>' + desc + '</small></span>' +
    '<span class="upg-buy">' + rightHTML + '</span></div>';
}

function renderUpgrades() {
  const list = $('upgList');
  if (!list) return;
  const soulsLbl = $('upgSouls');
  if (soulsLbl) soulsLbl.textContent = fmt(souls);
  let html = '';

  /* ---- Фичи ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[0].title + '</h3>';
  ['arena', 'casino'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = featOwned(k);
    html += upgRowHTML(u.icon, u.name, u.desc,
      owned ? '<span class="upg-owned">✔ куплено</span>'
            : '<button class="mini" data-upg="' + k + '" ' + (souls < u.cost ? 'disabled' : '') + '>' + u.cost + ' Душ</button>',
      owned ? 'on' : (souls >= u.cost ? 'on' : 'off'));
  });

  /* ---- Поле ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[1].title + '</h3>';
  if (fieldLv >= UPG_FIELD.length) {
    html += upgRowHTML('🧱', 'Поле ' + fieldSize() + '×' + fieldSize(), 'Максимальный размер Алтаря.', '<span class="upg-owned">✔ максимум</span>');
  } else {
    const f = UPG_FIELD[fieldLv];
    html += upgRowHTML('🧱', f.name + ' <small>(сейчас ' + fieldSize() + '×' + fieldSize() + ')</small>', f.desc,
      '<button class="mini" data-upg="field" ' + (souls < f.cost ? 'disabled' : '') + '>' + f.cost + ' Душ</button>');
  }

  /* ---- Призыв (редкости) ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[2].title + '</h3>';
  ['r4', 'r5'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = featOwned(k);
    const locked = u.need && !featOwned(u.need);
    html += upgRowHTML(u.icon, u.name, u.desc + (locked ? ' <i style="color:#a08860">— сперва ' + UPG_ONCE[u.need].name + '</i>' : ''),
      owned ? '<span class="upg-owned">✔ куплено</span>'
            : locked ? '<span class="upg-locked">🔒</span>'
            : '<button class="mini" data-upg="' + k + '" ' + (souls < u.cost ? 'disabled' : '') + '>' + u.cost + ' Душ</button>',
      owned ? 'on' : 'off');
  });

  /* ---- Фракции ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[3].title + '</h3>';
  ['f_cultist', 'f_beast', 'f_demon'].forEach(k => {
    const u = UPG_ONCE[k];
    const owned = factionOwned(k.slice(2));
    html += upgRowHTML(u.icon, u.name, u.desc,
      owned ? '<span class="upg-owned">✔ открыта</span>'
            : '<button class="mini" data-upg="' + k + '" ' + (souls < u.cost ? 'disabled' : '') + '>' + u.cost + ' Душ</button>',
      owned ? 'on' : 'off');
  });

  /* ---- Бонусы (бывшие печати) ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[4].title + '</h3>';
  html += '<div class="ups">' + UPG_BONUS.map(s => {
    const l = upgLv[s.id] || 0, maxed = l >= s.max;
    const cost = maxed ? null : s.cost(l);
    return '<div class="up"><b>' + s.icon + ' ' + s.name + '</b> ур.' + l + '/' + s.max + '<br><small>' + s.desc + '</small>' +
      '<button class="mini" data-upgb="' + s.id + '" ' + (maxed || souls < cost ? 'disabled' : '') + '>' + (maxed ? 'МАКС' : cost + ' Душ') + '</button></div>';
  }).join('') + '</div>';

  /* ---- Реликвии (заглушка) ---- */
  html += '<h3 class="upg-cat">' + UPG_CATS[5].title + '</h3>';
  html += upgRowHTML('⚒', 'Реликвии — Схрон Тьмы',
    'Источник реликвий появится в будущих итерациях: слоты столбов, законы и кары столбов уже ждут в коде. Пока реликвию получить НЕЛЬЗЯ — так и задумано.',
    '<span class="upg-locked" title="Доработаем позже">🔒 скоро</span>', 'off');

  list.innerHTML = html;
  list.querySelectorAll('[data-upg]').forEach(b => b.onclick = () => {
    if (b.dataset.upg === 'field') buyUpgradeField();
    else buyUpgradeOnce(b.dataset.upg);
  });
  list.querySelectorAll('[data-upgb]').forEach(b => b.onclick = () => buyUpgradeBonus(b.dataset.upgb));
}
