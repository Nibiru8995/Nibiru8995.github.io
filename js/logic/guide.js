'use strict';
/* ============================================================
   ЛОГИКА: ОНБОРДИНГ НОВЫХ ФИЧ И ФРАКЦИЙ (logic/guide.js)
   Автоматические подсказки-карточки при ПОЯВЛЕНИИ новой фичи:
   - Арена (Э2): выдать карту -> отправить в бой -> атаковать -> авто;
   - Казино (Э4): открыть хаб -> слоты -> дёрнуть рычаг 1 раз;
   - Расширение Алтаря (Э3): открыть Меню Эпохи -> купить 5×5;
   - Первая Эпоха за фракцию: краткое обучение её механике.
   Гайды одноразовые (guideSeen в мета-сохранении), шаги по действию
   продвигаются сами, есть «Пропустить». В учебном режиме (noSave)
   гайды не работают. Визуал: #guidePanel + .guide-hl в style.css.
   ============================================================ */

let guideQueue = [], guideCur = null, guideSteps = [], guideStep = -1, guideTimer = null;

function guideMarkSeen(id) {
  if (noSave || !id) return;
  guideSeen[id] = 1;
  saveMeta();
}

/* ---------------- Определения гайдов ---------------- */
function guideArenaDef() {
  const pool = POOL_1.filter(id => CARDS[id].faction === faction);
  const cid = pool.length ? pick(pool) : 'u0';
  const nm = CARDS[cid].name;
  return [
    { pre: () => { inventory[cid] = (inventory[cid] || 0) + 1; discovered.add(cid); renderCollection(); },
      t: '⚔ <b>АРЕНА ОТКРЫТА!</b> Карты, отправленные в бой, сражаются с врагами этажей и приносят 💎 в порог Эпохи. Мы выдали <b>«' + nm + '»</b>: выберите её в коллекции и нажмите <b>«⚔ ×1»</b> над картой (или ПКМ по карте).',
      hl: '#collectGrid', ok: () => Object.keys(fighters).length > 0 },
    { t: 'Боец готов! Теперь жмите <b>«⚔ АТАКОВАТЬ»</b> — бойцы сокрушат врага комнаты.',
      hl: '#arenaFightBtn', ok: () => arenaState.fighting || arenaState.cleared[arenaState.room - 1] },
    { t: '⚡ <b>Автобой.</b> Поставьте галочку «Авто» рядом с кнопкой атаки — бойцы будут драться сами, комната за комнатой. Отлично фармит, пока вы строите Алтарь.',
      hl: '#arenaAutoChk', n: 1 },
    { t: '🏆 Побеждайте комнаты и этажи: за боссов — двойная награда. «Отступить» прерывает бой без потерь. Состав бойцов и этажи сбрасываются в новой Эпохе.', n: 1, last: 1 }
  ];
}

function guideCasinoDef() {
  return [
    { t: '🎰 <b>КАЗИНО ОТКРЫТО!</b> Слоты, Авиатор, Рулетка и Покер — быстрые игры на 💎. Это риск: проигранное не возвращается. Загляните внутрь.',
      hl: '#casinoBtn', ok: () => $('hub') && $('hub').classList.contains('show') },
    { t: 'Начнём со <b>СЛОТОВ</b> — выберите их в казино.',
      hl: '#hub [data-g="slots"]', ok: () => $('casinoModal') && $('casinoModal').classList.contains('show') },
    { pre: () => { if (crystals >= MIN_BET && casinoBet < MIN_BET) { casinoBet = MIN_BET; updateCasinoUI(); } },
      t: 'Дёрните <b>РЫЧАГ</b> один раз — дальше разберётесь сами. Ставку можно менять кнопками под барабанами.',
      hl: '#slotLeverBtn', ok: () => stats.g.slots && (stats.g.slots.w + stats.g.slots.l) > 0 },
    { t: '🎲 Важно: выигрыши казино НЕ засчитываются в порог Эпохи — это отдельное развлечение, а не способ прогресса.', n: 1, last: 1 }
  ];
}

function guideAltarDef() {
  const cost = altarUpgradeCost();
  return [
    { t: '🧱 <b>АЛТАРЬ МОЖНО РАСШИРИТЬ до 5×5!</b> Больше клеток — больше карт и дохода. Откройте <b>Меню Эпохи</b>: нажмите большую кнопку ЭПОХИ над Алтарём (или ☰ Меню → «Меню Эпохи»).',
      hl: '#epochUpBtn', ok: () => $('epochModal') && $('epochModal').classList.contains('show') },
    { t: 'В секции «🧱 Алтарь» купите расширение' + (crystals >= cost ? '.' : ' (пока не хватает ' + fmtShort(cost) + ' 💎 — пропустите и вернитесь, когда накопите).'),
      hl: '#altarUpBtn', ok: () => playableSize >= 5 },
    { t: '🧱 Новые клетки появляются по краям, карты сохраняют позиции. Дальше: 7×7 в Эпохе 6, 9×9 в Эпохе 9. Печать Зодчего 🔱 удешевляет расширения на 15% за уровень.', n: 1, last: 1 }
  ];
}

function guideFactionDef(f) {
  const i = FACTION_INFO[f];
  return [
    { t: '⚜ <b>ПЕРВАЯ ЭПОХА ЗА «' + i.name.toUpperCase() + '»!</b> Всю Эпоху гача выдаёт только карты этой фракции. Уникальная механика — <b>' + i.mechanicName + '</b>: ' + i.memo, n: 1 },
    { t: '💡 <b>Как играть:</b> ' + i.guideTip, n: 1, last: 1 }
  ];
}

/* ---------------- Движок ---------------- */
function guideStart(id, def) {
  guideCur = id; guideSteps = def; guideStep = -1;
  $('guidePanel').classList.add('show');
  guideAdvance();
  if (!guideTimer) guideTimer = setInterval(guideTick, 350);
}
function guideAdvance() {
  guideStep++;
  if (guideStep >= guideSteps.length) { guideFinish(); return; }
  const st = guideSteps[guideStep];
  if (st.pre) st.pre();
  $('guideText').innerHTML = st.t;
  $('guideNext').style.display = st.n ? '' : 'none';
  $('guideStepLbl').textContent = (guideStep + 1) + ' / ' + guideSteps.length;
  guideApplyHl();
}
function guideApplyHl() {
  qsa('.guide-hl').forEach(e => e.classList.remove('guide-hl'));
  const st = guideSteps[guideStep];
  if (st && st.hl) {
    const t = document.querySelector(st.hl);
    if (t) { t.classList.add('guide-hl'); if (st.scroll) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
}
function guideFinish() {
  guideMarkSeen(guideCur);
  guideCur = null; guideSteps = []; guideStep = -1;
  const p = $('guidePanel');
  if (p) p.classList.remove('show');
  qsa('.guide-hl').forEach(e => e.classList.remove('guide-hl'));
  if (guideTimer) { clearInterval(guideTimer); guideTimer = null; }
  /* В очереди есть ещё гайды — запускаем следующий */
  if (guideQueue.length) setTimeout(guideQueueRun, 700);
}
function guideTick() {
  if (!guideCur || !guideSteps.length) return;
  const st = guideSteps[guideStep];
  if (st && st.ok && st.ok()) { guideAdvance(); return; }
  guideApplyHl(); /* подсветку нужно переприменять: рендер пересоздаёт узлы */
}

/* Очередь: фракция -> фичи. Запускается после смены Эпохи/старта забега. */
function guideQueueRun() {
  if (guideCur || !guideQueue.length) return;
  const id = guideQueue.shift();
  if (guideSeen[id] || noSave || !gameStarted) return guideQueueRun();
  let def = null;
  if (id === 'arena') def = guideArenaDef();
  else if (id === 'casino') def = guideCasinoDef();
  else if (id === 'altar') def = guideAltarDef();
  else if (id.indexOf('faction_') === 0) def = guideFactionDef(id.slice(8));
  if (def) guideStart(id, def); else guideQueueRun();
}

function queueFeatureGuides() {
  if (noSave || !gameStarted) return;
  const q = [];
  const f = 'faction_' + faction;
  if (!guideSeen[f]) q.push(f);
  if (epochHasArena(epoch) && !guideSeen.arena) q.push('arena');
  if (epochHasCasino(epoch) && !guideSeen.casino) q.push('casino');
  if (epochMaxSize(epoch) >= 5 && !guideSeen.altar) q.push('altar');
  if (q.length) {
    q.forEach(x => { if (!guideQueue.includes(x)) guideQueue.push(x); });
    setTimeout(guideQueueRun, 900); /* дать интерфейсу перерисоваться после Эпохи */
  }
}

/* Старые сохранения: уже открытые фичи не объясняем задним числом,
   но незнакомую фракцию текущей Эпохи показываем один раз. */
function initGuidesForSave() {
  if (epochHasArena(epoch)) guideMarkSeen('arena');
  if (epochHasCasino(epoch)) guideMarkSeen('casino');
  if (epochMaxSize(epoch) >= 5) guideMarkSeen('altar');
  queueFeatureGuides();
}

/* Кнопки панели (разметка в index.html) */
(function wireGuides() {
  const nx = $('guideNext'), sk = $('guideSkip');
  if (nx) nx.onclick = () => guideAdvance();
  if (sk) sk.onclick = () => guideFinish();
})();
