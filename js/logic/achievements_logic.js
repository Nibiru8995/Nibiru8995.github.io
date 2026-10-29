'use strict';
/* ============================================================
   ЛОГИКА: ДОСТИЖЕНИЯ (logic/achievements_logic.js)
   Проверка условий по данным из data/achievements.js.
   Выдача — торжественная анимация (пункт 7 ТЗ): золотой баннер
   с лучами, конфетти и собственным звуком, несколько ачивок
   подряд показываются по очереди.
   ============================================================ */

function checkAchievements() {
  let unlocked = [];
  ACHIEVEMENTS.forEach(a => {
    if (achDone[a.id]) return;
    let ok = false;
    try { ok = !!a.check(); } catch (e) { ok = false; }
    if (ok) { achDone[a.id] = 1; unlocked.push(a); }
  });
  if (unlocked.length) {
    saveMeta();
    achvQueue.push(...unlocked);
    pumpAchvQueue();
    if ($('achvModal') && $('achvModal').classList.contains('show')) renderAchvList();
  }
}
function achvCount() { return ACHIEVEMENTS.filter(a => achDone[a.id]).length; }

/* ---------------- Анимация получения (пункт 7 ТЗ) ---------------- */
let achvQueue = [], achvShowing = false;
function pumpAchvQueue() {
  if (achvShowing || !achvQueue.length) return;
  const a = achvQueue.shift();
  achvShowing = true;
  const d = document.createElement('div');
  d.className = 'achv-pop';
  d.innerHTML = '<div class="achv-pop-shine"></div>' +
    '<div class="achv-pop-title">🏅 ДОСТИЖЕНИЕ ПОЛУЧЕНО' + (achvQueue.length ? ' · ещё ' + achvQueue.length : '') + '</div>' +
    '<div class="achv-pop-name">«' + a.name + '»</div>' +
    '<div class="achv-pop-desc">' + a.desc + '</div>';
  document.body.appendChild(d);
  const b = d.getBoundingClientRect();
  fxBeams(b.left + b.width / 2, b.top + b.height / 2, ['#ffffff', '#e8c060', '#c9a227']);
  fxConfetti(60);
  sfx('milestone'); /* v1.0: отдельный «achv» убран — общая мягкая награда */
  setTimeout(() => {
    d.classList.add('out');
    setTimeout(() => { d.remove(); achvShowing = false; pumpAchvQueue(); }, 450);
  }, 3400);
}
