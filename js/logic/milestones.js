'use strict';
/* ============================================================
   ЛОГИКА: ВЕХИ ЗАБЕГА (logic/milestones.js)
   Долгий фарм разбит на микрошаги: 25% / 50% / 75% порога Эпохи
   дают награду — бесплатную крутку или временный ×2. Счётчик
   вех (milestoneIdx) и бесплатные крутки (freeRolls) живут
   в сохранении забега и сбрасываются при переходе Эпохи.
   ============================================================ */

const MIL_FRACS = [0.25, 0.5, 0.75];
const MIL_REWARDS = ['roll', 'boost', 'roll'];

function milNext() {
  return milestoneIdx < 3 ? { pct: MIL_FRACS[milestoneIdx], kind: MIL_REWARDS[milestoneIdx] } : null;
}
function milLabel(kind) {
  return kind === 'roll' ? 'бесплатная крутка' : 'доход ×2 на минуту';
}

function checkMilestones() {
  if (!gameStarted || gamePaused || noSave) return;
  const thr = epochThreshold(epoch);
  let got = false;
  while (milestoneIdx < 3 && runEarned >= thr * MIL_FRACS[milestoneIdx]) {
    const kind = MIL_REWARDS[milestoneIdx], pct = MIL_FRACS[milestoneIdx];
    if (kind === 'roll') {
      freeRolls++;
      stats.freeRolls = (stats.freeRolls || 0) + 1;
      toast('🏅 <b>Веха ' + (pct * 100) + '%:</b> +1 БЕСПЛАТНАЯ крутка! Кнопка «КРУТКА» — без денег');
    } else {
      altBuff = { mult: 2, until: gameTime + 60, label: '🏅 ВЕХА ×2' }; /* 60 игровых секунд */
      toast('🏅 <b>Веха ' + (pct * 100) + '%:</b> весь доход ×2 на минуту!');
    }
    sfx('milestone');
    const btn = $('epochUpBtn');
    if (btn && btn.getBoundingClientRect) {
      const b = btn.getBoundingClientRect();
      fxFloat(b.left + b.width / 2, b.top + 6, '🏅 ВЕХА ' + (pct * 100) + '%', '#e8c060', 20);
    }
    milestoneIdx++; got = true;
  }
  if (got) { updateHUD(); saveRun(); checkAchievements(); }
}
