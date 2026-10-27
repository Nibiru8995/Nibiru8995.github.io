'use strict';
/* ============================================================
   ЛОГИКА: ДОСТИЖЕНИЯ (logic/achievements_logic.js)
   Пункт 8 ТЗ. Проверка условий по данным из data/achievements.js.
   Без наград — только коллекция и уведомления.
   ============================================================ */

function checkAchievements() {
  let unlocked = 0;
  ACHIEVEMENTS.forEach(a => {
    if (achDone[a.id]) return;
    let ok = false;
    try { ok = !!a.check(); } catch (e) { ok = false; }
    if (ok) { achDone[a.id] = 1; unlocked++; toast('🏅 Достижение: «' + a.name + '»'); }
  });
  if (unlocked > 0) { saveMeta(); if ($('achvModal') && $('achvModal').classList.contains('show')) renderAchvList(); }
}
function achvCount() { return ACHIEVEMENTS.filter(a => achDone[a.id]).length; }
