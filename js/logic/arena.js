'use strict';
/* ============================================================
   ЛОГИКА: АРЕНА «КОЛЫБЕЛЬ ВОЙНЫ» — АВТОБАТЛЕР (logic/arena.js)
   ФИДБЕК 10 (раунд 3): вместо кликера — живой бой. Отряды игрока
   (из карт-бойцов) маршируют вправо, волны врагов — влево; юниты
   сами выбирают цели, бьют с откатами, терпят потери. Всё анимировано
   (canvas, render/arena_render.js). Павшие бойцы, как и раньше,
   ВСЕГДА возвращаются после боя — карты не теряются.
   Состояние боя (battle) — мгновенное, в сохранение не пишется.
   ============================================================ */

let battle = { units: [], floats: [], projs: [], sparks: [], active: false, t: 0, last: 0, shake: 0, over: false, banner: null };

/* ---------------- Бойцы: состав армии ---------------- */
function reviveFighters() {
  Object.keys(arenaState.fallen || {}).forEach(id => {
    const n = arenaState.fallen[id];
    if (n && CARDS[id]) fighters[id] = (fighters[id] || 0) + n;
    delete arenaState.fallen[id];
  });
  Object.keys(fighters).forEach(id => { fighterHpState[id] = fighterHp(CARDS[id].rarity) * fighters[id]; });
}

/* Статистика ростера для панели (не сам бой) */
function calcTotalDamage() {
  let d = 0;
  for (const id in fighters) d += fighterDmg(CARDS[id].rarity) * fighters[id];
  return Math.round(d * altarPower());
}
function calcTotalHp() {
  let hp = 0;
  Object.keys(fighters).forEach(id => { hp += fighterHpState[id] || 0; });
  return hp;
}

/* ---------------- ВОЛНА ВРАГОВ ---------------- */
function generateWave(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  const f = waveFaction(floor, room);
  const defs = [];
  if (isBoss) {
    defs.push({ rarity: 5, k: 1, faction: f, boss: true });
    for (let i = 0; i < ARENA.bossEscort; i++) {
      const r = Math.random() < 0.5 ? 3 : 1;
      defs.push({ rarity: r, k: 1 + rand(2), faction: f, boss: false });
    }
  } else {
    const n = ARENA.count(floor, room);
    const w = ARENA.tierW(floor);
    /* отряды врага растут с этажом: f1 — по 1 копии, f2 — до 2, f3+ — до 3 */
    const kMax = Math.min(3, Math.max(1, floor));
    for (let i = 0; i < n; i++) {
      const t = +weightedPick(w);
      defs.push({ rarity: t, k: 1 + rand(kMax), faction: f, boss: false });
    }
  }
  const name = isBoss ? ARENA.bossNames[(floor - 1) % ARENA.bossNames.length]
    : 'Волна «' + ARENA.enemyNames[f] + '» · ' + defs.length + ' отрядов';
  return { name, faction: f, isBoss, units: defs, floor, room };
}

function waveMaxHp(wave) {
  const hm = ARENA.hpMult(wave.floor);
  const bm = 1 + 0.35 * wave.floor;
  return wave.units.reduce((s, u) => s + fighterHp(u.rarity) * u.k * (u.boss ? bm : hm), 0);
}

/* ---------------- НАБОР БОЙЦОВ ---------------- */
function addFighter(cardId, cnt = 1) {
  /* Арена закрыта до своей Эпохи — бойцов не набираем */
  if (!epochHasArena(epoch)) { toast('⚔ Колыбель Войны откроется в Эпохе ' + ARENA_EPOCH); return; }
  const have = inventory[cardId] || 0;
  cnt = Math.min(cnt, have);
  if (cnt <= 0) return;
  inventory[cardId] = have - cnt;
  if (inventory[cardId] <= 0) {
    delete inventory[cardId];
    if (pendingCard === cardId) { placingMode = false; pendingCard = null; }
  }
  fighters[cardId] = (fighters[cardId] || 0) + cnt;
  fighterHpState[cardId] = (fighterHpState[cardId] || 0) + fighterHp(CARDS[cardId].rarity) * cnt;
  renderFighters(); renderCollection(); renderGrid(); updateArenaUI(); updateBanner();
}

function bulkFight(mode) {
  let n = 0;
  Object.keys(inventory).forEach(id => {
    const c = inventory[id];
    const k = mode === 'dup' ? c - 1 : mode === 'one' ? (CARDS[id].rarity === 1 ? c : 0) : c;
    if (k > 0) { addFighter(id, k); n += k; }
  });
  toast(n ? 'В бой отправлено: ' + n : 'Нечего отправлять');
}

/* ---------------- ПОСТРОЕНИЕ ОТРЯДОВ ИГРОКА ----------------
   Каждая карта → отряды по ≤3 копии (HP/урон умножаются), макс 8 отрядов.
   Остаток сверх лимита «сливается» в последний отряд (знаменосец). */
function buildHeroSquads() {
  const ids = Object.keys(fighters).sort((a, b) => CARDS[b].rarity - CARDS[a].rarity);
  const squads = [];
  ids.forEach(id => {
    let left = fighters[id];
    while (left > 0 && squads.length < ARENA.heroSquadsMax) {
      const k = Math.min(ARENA.squadSize, left);
      squads.push({ cardId: id, k });
      left -= k;
    }
    if (left > 0 && squads.length) squads[squads.length - 1].k += left; /* остаток в знаменосца */
  });
  return squads;
}

/* ---------------- СПАВН БОЯ ---------------- */
function laneY(i) { return [96, 160, 224][i % 3]; }

function spawnBattle() {
  const W = ARENA.FIELD_W, H = ARENA.FIELD_H;
  battle.units = []; battle.floats = []; battle.projs = []; battle.sparks = [];
  battle.t = 0; battle.shake = 0; battle.over = false; battle.banner = null;
  const heroSquads = buildHeroSquads();
  const wave = arenaState.enemy;
  const hm = ARENA.hpMult(arenaState.floor), dm = ARENA.dmgMult(arenaState.floor);
  const bm = 1 + 0.35 * arenaState.floor, bdm = 0.5 + 0.1 * arenaState.floor;
  heroSquads.forEach((s, i) => {
    const c = CARDS[s.cardId];
    const r = c.rarity;
    battle.units.push({
      side: 'hero', cardId: s.cardId, k: s.k, rarity: r, boss: false,
      name: c.name, img: CARD_ART_DIR + s.cardId + '.png',
      /* ФИДБЕК «не затянуто»: армии стартуют БЛИЗКО (марш ~3-5с, а не ~15с) */
      x: 140 + Math.floor(i / 3) * 46 + rand(8), y: laneY(i) + rand(14) - 7,
      hp: fighterHp(r) * s.k, maxHp: fighterHp(r) * s.k,
      dmg: fighterDmg(r) * s.k, range: r >= 5 ? 100 : r === 4 ? 70 : 34,
      speed: r >= 4 ? 42 : 60, cd: 0.4 + Math.random() * 0.4,
      cdMax: { 1: 1.2, 3: 1.4, 4: 1.7, 5: 2.0 }[r] || 1.4,
      flash: 0, lunge: 0, slash: 0, dead: false, deadT: 0, bob: Math.random() * 6.28
    });
  });
  (wave ? wave.units : []).forEach((d, i) => {
    const r = d.rarity;
    const hpM = d.boss ? bm : hm, dmM = d.boss ? bdm : dm;
    battle.units.push({
      side: 'foe', rarity: r, k: d.k, boss: !!d.boss, name: d.boss ? wave.name : ARENA.enemyNames[d.faction],
      img: foeSprite(d.faction, d.boss),
      x: ARENA.FIELD_W - 140 - Math.floor(i / 3) * 46 - rand(8), y: laneY(i) + rand(14) - 7,
      hp: fighterHp(r) * d.k * hpM, maxHp: fighterHp(r) * d.k * hpM,
      dmg: fighterDmg(r) * d.k * dmM, range: d.boss ? 100 : r >= 4 ? 70 : 34,
      speed: r >= 4 ? 42 : 60, cd: 0.6 + Math.random() * 0.4,
      cdMax: { 1: 1.2, 3: 1.4, 4: 1.7, 5: 2.0 }[r] || 1.4,
      flash: 0, lunge: 0, slash: 0, dead: false, deadT: 0, bob: Math.random() * 6.28
    });
  });
  battle.active = true;
}

/* --------------- УРОН, СНАРЯДЫ, ЭФФЕКТЫ УДАРА ---------------
   ФИДБЕК (раунд 4, «доработай визуал»): стрелки (★4/★5 и боссы)
   ПАЛЯТ снарядами (болты летят по дуге-трассе), ближний бей —
   с взмахом (слэш-арка). Попадания сыпят искры, смерти трясут
   экран и поднимают «душу». Урон считается в одном месте. */
function applyHit(attacker, tgt, dmgOut) {
  tgt.hp -= dmgOut;
  tgt.flash = 1;
  for (let i = 0; i < 5; i++) {
    battle.sparks.push({
      x: tgt.x + rand(18) - 9, y: tgt.y + rand(14) - 7,
      vx: (Math.random() - 0.5) * 3.2, vy: (Math.random() - 0.5) * 3.2 - 0.6,
      life: 14 + rand(8), maxLife: 22,
      color: attacker.side === 'hero' ? '#ffe080' : '#ff9080'
    });
  }
  battle.floats.push({ x: tgt.x + rand(16) - 8, y: tgt.y - 26, text: '-' + fmt(dmgOut), color: attacker.side === 'hero' ? '#ffe080' : '#ff9090', life: 50, maxLife: 50 });
  if (tgt.hp <= 0) {
    tgt.hp = 0; tgt.dead = true; tgt.deadT = 0;
    /* Тряска + «душа» павшего */
    battle.shake = Math.max(battle.shake, tgt.boss ? 7 : 3);
    for (let i = 0; i < 10; i++) {
      battle.sparks.push({
        x: tgt.x + rand(14) - 7, y: tgt.y,
        vx: (Math.random() - 0.5) * 1.2, vy: -1.4 - Math.random() * 1.6,
        life: 26 + rand(14), maxLife: 40,
        color: tgt.side === 'foe' ? '#a0e0ff' : '#ffd0a0', soul: true
      });
    }
    battle.floats.push({ x: tgt.x, y: tgt.y - 30, text: tgt.side === 'foe' ? 'ПОВЕРЖЕН' : 'ПАЛ', color: tgt.side === 'foe' ? '#a0e080' : '#ff8080', life: 60, maxLife: 60 });
    if (tgt.side === 'hero') {
      /* павшие вернутся после боя (reviveFighters) */
      arenaState.fallen = arenaState.fallen || {};
      arenaState.fallen[tgt.cardId] = (arenaState.fallen[tgt.cardId] || 0) + tgt.k;
      stats.arenaDeaths = (stats.arenaDeaths || 0) + tgt.k;
    }
  }
}

/* ---------------- ХОД БОЯ ---------------- */
function battleStep(dt) {
  battle.t += dt;
  battle.shake = Math.max(0, battle.shake - dt * 9);
  if (battle.banner) battle.banner.life = Math.max(0, battle.banner.life - dt / 1.8);
  const ap = altarPower();
  const alive = side => battle.units.filter(u => !u.dead && u.side === side);
  const heroes = alive('hero'), foes = alive('foe');
  battle.units.forEach(u => {
    if (u.dead) { u.deadT += dt; return; }
    u.flash = Math.max(0, u.flash - dt * 4);
    u.lunge = Math.max(0, u.lunge - dt * 6);
    u.slash = Math.max(0, (u.slash || 0) - dt * 5);
    /* Баннер боя: после конца анимации добивания бои не продолжаются */
    if (battle.over) return;
    const enemies = u.side === 'hero' ? foes : heroes;
    if (!enemies.length) return;
    /* ближайший живой враг */
    let tgt = null, best = 1e9;
    enemies.forEach(e => {
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < best) { best = d; tgt = e; }
    });
    if (!tgt) return;
    if (best > u.range * 0.92) {
      /* маршируем к цели */
      const dx = tgt.x - u.x, dy = tgt.y - u.y, l = Math.hypot(dx, dy) || 1;
      u.x += (dx / l) * u.speed * dt;
      u.y += (dy / l) * u.speed * dt;
    } else {
      u.cd -= dt;
      if (u.cd <= 0) {
        u.cd = u.cdMax * (0.9 + Math.random() * 0.2);
        const dmgOut = Math.max(1, Math.round(u.dmg * (u.side === 'hero' ? ap : 1) * (0.9 + Math.random() * 0.2)));
        if (u.range >= 70) {
          /* СТРЕЛОК: болт летит к цели — урон придёт с прилётом */
          u.lunge = 0.6;
          battle.projs.push({
            x: u.x, y: u.y - 10, side: u.side,
            tgt, speed: 260 + Math.random() * 60,
            dmg: dmgOut, life: 2.2,
            color: u.side === 'hero' ? (u.boss ? '#ffcf60' : '#a0d8ff') : (u.boss ? '#ff6040' : '#ff9a60')
          });
        } else {
          /* БЛИЖНИЙ БОЙ: взмах + мгновенный урон */
          u.lunge = 1; u.slash = 1;
          applyHit(u, tgt, dmgOut);
        }
      }
    }
  });
  /* Полёт снарядов */
  for (let i = battle.projs.length - 1; i >= 0; i--) {
    const p = battle.projs[i];
    p.life -= dt;
    const t2 = p.tgt;
    const tx = t2.x, ty = t2.y - 10;
    const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy) || 1;
    const step = p.speed * dt;
    if (l <= step || p.life <= 0) {
      if (!t2.dead && p.life > 0 && !battle.over) applyHit({ side: p.side }, t2, p.dmg);
      battle.projs.splice(i, 1);
      continue;
    }
    p.x += (dx / l) * step; p.y += (dy / l) * step;
  }
  /* Искры */
  for (let i = battle.sparks.length - 1; i >= 0; i--) {
    const s = battle.sparks[i];
    s.life -= dt * 60;
    s.x += s.vx; s.y += s.vy;
    if (s.soul) s.vy -= dt * 2; else s.vy += dt * 6;
    if (s.life <= 0) battle.sparks.splice(i, 1);
  }
  /* всплывающие цифры */
  for (let i = battle.floats.length - 1; i >= 0; i--) {
    const f = battle.floats[i];
    f.life -= dt * 60; f.y -= dt * 26;
    if (f.life <= 0) battle.floats.splice(i, 1);
  }
  if (battle.over) return;
  /* контроль завершения */
  if (!foes.length) { endBattle(true); return; }
  if (!heroes.length) { endBattle(false); return; }
}

function endBattle(win) {
  if (battle.over) return;
  battle.over = true;
  arenaState.fighting = false;
  /* Баннер «ПОБЕДА / ПОРАЖЕНИЕ» — поле доигрывает анимацию добивания */
  battle.banner = { text: win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ', win, life: 1, maxLife: 1 };
  battle.shake = Math.max(battle.shake, win ? 6 : 4);
  const enemy = arenaState.enemy;
  if (win) {
    const reward = Math.round(arenaReward(arenaState.floor, arenaState.room));
    crystals += reward; runEarned += reward;
    sfx(enemy && enemy.isBoss ? 'boss' : 'win');
    fxFxAt($('arenaPanel'), enemy && enemy.isBoss ? ['#c9a227', '#fff', '#ff6b6b'] : ['#80e060', '#fff'], enemy && enemy.isBoss ? 40 : 18);
    if (enemy && enemy.isBoss) {
      stats.bossKills = (stats.bossKills || 0) + 1;
      /* ТРОФЕЙ БОССА: бесплатная карта ★3 текущей фракции */
      const pool = POOL_3.filter(id => CARDS[id].faction === faction);
      if (pool.length) {
        const gid = pick(pool);
        inventory[gid] = (inventory[gid] || 0) + 1;
        discovered.add(gid);
        setTimeout(() => toast('👑 Трофей босса: «' + CARDS[gid].name + '» добавлена в коллекцию!'), 400);
      }
    }
    arenaState.cleared[arenaState.room - 1] = true;
    arenaState.status = enemy && enemy.isBoss ? '🏆 БОСС ПОВЕРЖЕН! +' + fmt(reward) + ' 💎 + трофей!' : 'Победа! +' + fmt(reward) + ' 💎';
    reviveFighters();
    updateArenaUI(); updateHUD(); renderFighters(); renderCollection(); checkAchievements();
    if (arenaAuto) setTimeout(tryStartAutoBattle, 600);
  } else {
    arenaState.status = 'Поражение, но армия цела: павшие вернулись. Усильтесь и повторите!';
    sfx('lose');
    reviveFighters();
    if (arenaAuto) { arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false; }
    updateArenaUI(); renderFighters();
  }
  /* Чуть позже поле очищается — дать баннеру и гибели доиграть.
     ЗАЩИТА: если в это время уже начался НОВЫЙ бой (авторежим) —
     поле не трогаем. */
  setTimeout(() => {
    if (!battle.over) return; /* пошёл новый бой — очистка отменяется */
    battle.units = []; battle.floats = []; battle.projs = []; battle.sparks = [];
    battle.active = false; battle.over = false; battle.banner = null; battle.last = 0;
    renderBattle();
  }, 2000);
}

/* Цикл отрисовки+симуляции: живёт, пока идёт бой (или доигрывает баннер) */
function battleLoop(now) {
  if (!battle.active) { battle.last = 0; return; }
  if (!battle.last) battle.last = now;
  let dt = Math.min((now - battle.last) / 1000, 0.05) * speedMult;
  battle.last = now;
  if (gamePaused) dt = 0;
  if (dt > 0) battleStep(dt);
  renderBattle();
  requestAnimationFrame(battleLoop);
}

/* ---------------- СТАРТ БОЯ / ПРОДВИЖЕНИЕ ---------------- */
function advanceArenaRoom() {
  if (arenaState.room < ARENA.roomsPerFloor) {
    arenaState.room++;
    arenaState.status = 'Комната ' + arenaState.room + ': волна на подходе.';
  } else {
    arenaState.floor++;
    stats.floorMax = Math.max(stats.floorMax, arenaState.floor);
    arenaState.room = 1;
    arenaState.cleared = Array(ARENA.roomsPerFloor).fill(false);
    arenaState.status = 'Этаж ' + arenaState.floor + '. Новые волны!';
  }
  arenaState.enemy = generateWave(arenaState.floor, arenaState.room);
  updateArenaUI();
}

function tryStartAutoBattle() {
  if (!arenaAuto || arenaState.fighting) return;
  if (Object.keys(fighters).length === 0) {
    arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
    return;
  }
  if (arenaState.cleared[arenaState.room - 1]) { advanceArenaRoom(); setTimeout(tryStartAutoBattle, 400); return; }
  if (!arenaState.enemy) arenaState.enemy = generateWave(arenaState.floor, arenaState.room);
  startBattle();
}

function startBattle() {
  if (!arenaState.enemy) arenaState.enemy = generateWave(arenaState.floor, arenaState.room);
  arenaState.fighting = true;
  arenaState.status = 'Отряды выдвинулись!';
  updateArenaUI();
  spawnBattle();
  renderBattle();
  requestAnimationFrame(battleLoop);
}

function arenaFightClick() {
  if (arenaState.fighting) return;
  if (arenaState.cleared[arenaState.room - 1]) {
    advanceArenaRoom();
    if (arenaAuto) setTimeout(tryStartAutoBattle, 400);
    return;
  }
  if (Object.keys(fighters).length === 0) {
    arenaState.status = 'Нет бойцов! Добавьте карты в список.';
    updateArenaUI(); return;
  }
  startBattle();
}

function arenaRetreat() {
  if (!arenaState.fighting) return;
  battle.active = false; battle.over = false; battle.banner = null;
  battle.units = []; battle.floats = []; battle.projs = []; battle.sparks = [];
  arenaState.fighting = false;
  reviveFighters();
  arenaState.status = 'Вы отступили. Отряды восстановлены, волна соберётся заново.';
  updateArenaUI(); renderFighters();
}

function initArena() {
  arenaState.enemy = generateWave(arenaState.floor, arenaState.room);
  battle = { units: [], floats: [], projs: [], sparks: [], active: false, t: 0, last: 0, shake: 0, over: false, banner: null };
  updateArenaUI();
}
