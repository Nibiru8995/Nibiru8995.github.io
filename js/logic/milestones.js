'use strict';
/* ============================================================
   ЛОГИКА: ВЕХИ ЗАБЕГА (logic/milestones.js)
   Долгий фарм разбит на микрошаги: 25% / 50% / 75% / 90% порога
   Эпохи дают награду — пачку бесплатных круток или временный ×2.
   Счётчик вех (milestoneIdx) и бесплатные крутки (freeRolls)
   живут в сохранении забега и сбрасываются при переходе Эпохи.
   ============================================================ */

const MIL_FRACS = [0.25, 0.5, 0.75, 0.9];
const MIL_REWARDS = ['roll', 'boost', 'roll', 'boost'];
const MIL_ROLLS = 10; /* круток за веху «roll» */

function milNext() {
  return milestoneIdx < MIL_FRACS.length ? { pct: MIL_FRACS[milestoneIdx], kind: MIL_REWARDS[milestoneIdx] } : null;
}
function milLabel(kind) {
  if (kind === 'roll') return '+' + MIL_ROLLS + ' бесплатных круток';
  return 'доход ×2 на 2 минуты';
}

function checkMilestones() {
  if (!gameStarted || gamePaused || noSave) return;
  const thr = epochThreshold(epoch);
  let got = false;
  while (milestoneIdx < MIL_FRACS.length && runEarned >= thr * MIL_FRACS[milestoneIdx]) {
    const kind = MIL_REWARDS[milestoneIdx], pct = MIL_FRACS[milestoneIdx];
    if (kind === 'roll') {
      freeRolls += MIL_ROLLS;
      stats.freeRolls = (stats.freeRolls || 0) + MIL_ROLLS;
      toast('🏅 <b>Веха ' + (pct * 100) + '%:</b> +' + MIL_ROLLS + ' БЕСПЛАТНЫХ круток! Кнопка «КРУТКА» — без денег');
    } else {
      altBuff = { mult: 2, until: gameTime + 120, label: '🏅 ВЕХА ×2' }; /* 120 игровых секунд */
      toast('🏅 <b>Веха ' + (pct * 100) + '%:</b> весь доход ×2 на две минуты!');
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
