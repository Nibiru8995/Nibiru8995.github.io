'use strict';
/* ============================================================
   ЛОГИКА: ОНБОРДИНГ НОВЫХ ФИЧ И ФРАКЦИЙ (logic/guide.js)
   Автоматические подсказки-карточки при ПОЯВЛЕНИИ новой фичи:
   - Арена (Э2): выдать карту -> отправить в бой -> атаковать -> авто;
   - Казино (Э4): открыть хаб -> слоты -> дёрнуть рычаг 1 раз;
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

/* Автопометка: собрал знамение — гайд больше не нужен */
(function () {
  const origCheck = checkAchievements;
  checkAchievements = function () { if ((stats.omens || 0) >= 1 && !guideSeen.omen) guideMarkSeen('omen'); origCheck(); };
})();

/* ---------------- Определения гайдов ---------------- */
function guideArenaDef() {
  const pool = POOL_B.filter(id => CARDS[id].faction === faction); /* v1.2.6: POOL_1 больше нет — здания */
  const cid = pool.length ? pick(pool) : 'u0';
  const nm = CARDS[cid].name;
  return [
    { pre: () => { inventory[cid] = (inventory[cid] || 0) + 1; discovered.add(cid); renderCollection(); },
      t: '⚔ <b>КОЛЫБЕЛЬ ВОЙНЫ ОТКРЫТА!</b> Это АВТОБАТЛЕР: отряды карт сами маршируют к врагам и дерутся, терпя потери. Мы выдали <b>«' + nm + '»</b>: выберите её в коллекции и нажмите <b>«⚔ ×1»</b> над картой (или ПКМ по карте).',
      hl: '#collectGrid', ok: () => Object.keys(fighters).length > 0 },
    { t: 'Отряд готов! Жмите <b>«⚔ В БОЙ»</b> — он выйдет на поле и сам выберет цель. Смотрите на поле: отряды идут навстречу друг другу.',
      hl: '#arenaFightBtn', ok: () => arenaState.fighting || arenaState.cleared[arenaState.room - 1] },
    { t: '⚡ <b>Автобой.</b> Поставьте галочку «Авто» — волны будут разбираться сами, комната за комнатой. Отлично фармит, пока вы строите Алтарь.',
      hl: '#arenaAutoChk', n: 1 },
    { t: '🏆 Павшие бойцы ВСЕГДА возвращаются после боя. За боссов — двойная награда и трофей ★3. «Отступить» прерывает бой без потерь. Мощь Алтаря (звенья и разнообразие) умножает урон отрядов!', n: 1, last: 1 }
  ];
}

function guideCasinoDef() {
  return [
    { t: '🎰 <b>КАЗИНО ОТКРЫТО!</b> Слоты, Авиатор, Рулетка и Блэкджек — быстрые игры на 💎. Это риск: проигранное не возвращается. Загляните внутрь.',
      hl: '#casinoBtn', ok: () => $('hub') && $('hub').classList.contains('show') },
    { t: 'Начнём со <b>СЛОТОВ</b> — выберите их в казино.',
      hl: '#hub [data-g="slots"]', ok: () => $('casinoModal') && $('casinoModal').classList.contains('show') },
    { pre: () => { if (crystals >= MIN_BET && casinoBet < MIN_BET) { casinoBet = MIN_BET; updateCasinoUI(); } },
      t: 'Дёрните <b>РЫЧАГ</b> один раз — дальше разберётесь сами. Ставку можно менять кнопками под барабанами.',
      hl: '#slotLeverBtn', ok: () => stats.g.slots && (stats.g.slots.w + stats.g.slots.l) > 0 },
    { t: '🎲 Важно: выигрыши казино НЕ засчитываются в порог Эпохи — это отдельное развлечение, а не способ прогресса.', n: 1, last: 1 }
  ];
}

function guideOmenDef() {
  return [
    { t: '✨ <b>ЗНАМЕНИЕ!</b> На Алтаре вспыхнула пульсирующая иконка. Кликни по ней, пока она не погасла (18 сек) — за это дают 💠 кристаллы, ⏱ ускорение дохода или 🔮 Реликвию. Знамения появляются каждые пару минут.',
      hl: '.omen', ok: () => (stats.omens || 0) >= 1, last: 1 }
  ];
}

/* Фракционный онбординг: КОРОТКО и наглядно.
   Детали — в тултипах карт; для культистов там схемы формаций. */
function guideFactionDef(f) {
  const i = FACTION_INFO[f];
  const steps = [
    { t: '⚜ <b>ЭПОХА «' + i.epochTitle.replace('Эпоха ', '') + '»</b> — механика: <b>' + i.mechanicName + '</b>. ' + i.mechanicDesc, n: 1 }
  ];
  if (f === 'undead') {
    steps.push({ t: '🪦 <b>Здание «Кладбище» уже в коллекции:</b> раз в 12с поднимает бесплатную нежить и усиливает соседей. Ставьте её в центр армии — мёртвые работают сами.', n: 1 });
  }
  if (f === 'cultist') {
    steps.push({ t: '🔯 <b>У культистов НЕТ дохода — есть РИТУАЛ.</b> «Ритуальный Алтарь» (уже в коллекции) — в центр, культистов — в цепочку от него ПРЯМО: каждый участник ускоряет ЗАРЯД шкалы (⚡), усилители (Маг/Инквизитор/Жрец) умножают ВЫПЛАТУ (💰). СТАКИ усиливают вклад клетки. Большая шкала — НАД Алтарём. На 100% ритуал платит 💎 — и шкала НИКОГДА не тает, фейл невозможен. Формации (Крест/Кольцо/Ромб) ускоряют заряд — пустые клетки не нужны. Культисты ПО ДИАГОНАЛИ от цепи — ВНЕШНИЙ КРУГ: +5% выплаты за каждого служителя. Схемы — в тултипе.', n: 1 });
  }
  if (f === 'beast') {
    steps.push({ t: '🐾 <b>У зверей нет синергий — есть РАЦИОН.</b> Со старта готовая цепь: <b>Волк</b> (хищник) + <b>Кабан</b> (травоядный) + <b>Древень</b> (флора) + <b>Вольер</b> (здание). Тики охоты быстрые: хищники кусают часто, а без добычи ДЕРУТСЯ друг с другом — Вольер защищает стадо.', n: 1 });
  }
  if (f === 'demon') {
    steps.push({ t: '🔥 <b>Угли:</b> демоны копят угли только в ТОЛПЕ (2+ рядом). <b>Кровавый Жрец</b> (уже в коллекции) делает взрывы соседей безопасными, <b>Жертвенная Яма</b> (здание) ускоряет раскалку. Ставьте Жреца в центр кучки.', n: 1 });
  }
  steps.push({ t: '💡 Наводитесь на карты — тултип сам расскажет про звенья, рационы и здания.', n: 1, last: 1 });
  return steps;
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
  else if (id === 'omen') def = guideOmenDef();
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
  queueFeatureGuides();
}

/* Кнопки панели (разметка в index.html) */
(function wireGuides() {
  const nx = $('guideNext'), sk = $('guideSkip');
  if (nx) nx.onclick = () => guideAdvance();
  if (sk) sk.onclick = () => guideFinish();
})();
