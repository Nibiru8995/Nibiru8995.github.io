'use strict';
/* ============================================================
   ЛОГИКА: ВЕХИ ЗАБЕГА (logic/milestones.js) — v1.7.0 «Плата Душами»
   Долгий фарм разбит на микрошаги: 25% / 50% / 75% / 90% порога
   Эпохи дают ВРЕМЕННОЕ УСКОРЕНИЕ дохода.
   v1.7.0: бесплатные крутки убраны СОВСЕМ — награды «roll» сняты,
   все четыре вехи платят ускорением. Печать Жадности перепрофилирована:
   «+30 сек к ускорениям вех за уровень» (MIL_BOOST_DUR).
   Счётчик вех (milestoneIdx) живёт в сохранении забега и сбрасывается
   при переходе Эпохи.
   ============================================================ */

const MIL_FRACS = [0.25, 0.5, 0.75, 0.9];
const MIL_REWARDS = ['boost', 'boost', 'boost', 'boost'];
/* Длительность ускорения вехи: базово 120с, Печать Жадности +30с/ур */
const MIL_BOOST_DUR = () => 120 + 30 * sealLv.greed;

function milNext() {
  return milestoneIdx < MIL_FRACS.length ? { pct: MIL_FRACS[milestoneIdx], kind: MIL_REWARDS[milestoneIdx] } : null;
}
function milLabel(kind) {
  return 'доход ×2 на ' + Math.round(MIL_BOOST_DUR() / 60 * 10) / 10 + ' мин';
}

function checkMilestones() {
  if (!gameStarted || gamePaused || noSave) return;
  const thr = epochThreshold(epoch);
  let got = false;
  while (milestoneIdx < MIL_FRACS.length && runEarned >= thr * MIL_FRACS[milestoneIdx]) {
    const kind = MIL_REWARDS[milestoneIdx], pct = MIL_FRACS[milestoneIdx];
    const dur = MIL_BOOST_DUR();
    /* Веха — ускорение: перекрываем только если новый бафф сильнее/дольше */
    if (!altBuff.label || altBuff.until <= gameTime || altBuff.mult <= 2) {
      altBuff = { mult: 2, until: gameTime + dur, label: '🏅 ВЕХА ×2' };
    }
    toast('🏅 <b>Веха ' + (pct * 100) + '%:</b> весь доход ×2 на ' + Math.round(dur / 60 * 10) / 10 + ' мин!');
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
