'use strict';
/* ============================================================
   ЛОГИКА: АРЕНА (logic/arena.js)
   Арена ВЫГОДНА: награды ×1.5/этаж (data/arena.js), боссы дают
   ТРОФЕЙ (карту ★3), а павшие бойцы ВСЕГДА возвращаются после
   боя — карты больше не теряются навсегда.
   ============================================================ */

/* Вернуть павших в бой и восстановить HP (победа/поражение/отступ) */
function reviveFighters() {
  Object.keys(arenaState.fallen || {}).forEach(id => {
    const n = arenaState.fallen[id];
    if (n && CARDS[id]) fighters[id] = (fighters[id] || 0) + n;
    delete arenaState.fallen[id];
  });
  Object.keys(fighters).forEach(id => { fighterHpState[id] = fighterHp(CARDS[id].rarity) * fighters[id]; });
}

function arenaDmg() {
  let d = 0;
  for (const id in fighters) {
    const c = CARDS[id];
    const n = Math.ceil((fighterHpState[id] || 0) / fighterHp(c.rarity));
    d += fighterDmg(c.rarity) * n;
  }
  return Math.round(d * altarPower());
}
function calcTotalDamage() { return arenaDmg(); }
function calcTotalHp() {
  let hp = 0;
  Object.keys(fighters).forEach(id => { hp += fighterHpState[id] || 0; });
  return hp;
}

function generateArenaEnemy(floor, room) {
  const isBoss = room === ARENA.roomsPerFloor;
  const f = FACTION_KEYS[(floor * 2 + room + (isBoss ? 1 : 0)) % 4];
  const hp = arenaEnemyHp(floor, room);
  const name = isBoss ? '👑 ' + ARENA.bossNames[(floor - 1) % ARENA.bossNames.length]
    : ARENA.enemyNames[f];
  return { hp, maxHp: hp, faction: f, name, glyph: isBoss ? '👑' : ARENA.enemyGlyphs[f], isBoss };
}

function addFighter(cardId, cnt = 1) {
  /* Арена закрыта до своей Эпохи (пункты 2 и 9 ТЗ) — бойцов не набираем */
  if (!epochHasArena(epoch)) { toast('⚔ Арена откроется в Эпохе ' + ARENA_EPOCH); return; }
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
  if (arenaAuto) setTimeout(tryStartAutoBattle, 200);
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

function advanceArenaRoom() {
  if (arenaState.room < ARENA.roomsPerFloor) {
    arenaState.room++;
    arenaState.status = 'Комната ' + arenaState.room + ': приготовьтесь.';
  } else {
    arenaState.floor++;
    stats.floorMax = Math.max(stats.floorMax, arenaState.floor);
    arenaState.room = 1;
    arenaState.cleared = Array(ARENA.roomsPerFloor).fill(false);
    arenaState.status = 'Этаж ' + arenaState.floor + '. Новые противники!';
  }
  arenaState.enemy = generateArenaEnemy(arenaState.floor, arenaState.room);
  updateArenaUI();
}

function tryStartAutoBattle() {
  if (!arenaAuto || arenaState.fighting) return;
  if (Object.keys(fighters).length === 0) {
    arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false;
    return;
  }
  if (arenaState.cleared[arenaState.room - 1]) { advanceArenaRoom(); setTimeout(tryStartAutoBattle, 400); return; }
  if (!arenaState.enemy) arenaState.enemy = generateArenaEnemy(arenaState.floor, arenaState.room);
  arenaState.fighting = true; arenaState.status = 'Бой начался!';
  updateArenaUI(); runArenaCombat();
}

function arenaFightClick() {
  if (arenaState.fighting) return;
  if (arenaState.cleared[arenaState.room - 1]) {
    advanceArenaRoom();
    if (arenaAuto) setTimeout(tryStartAutoBattle, 400);
    return;
  }
  if (calcTotalHp() <= 0) {
    arenaState.status = 'Нет живых бойцов! Добавьте карты в список.';
    updateArenaUI(); return;
  }
  if (!arenaState.enemy) arenaState.enemy = generateArenaEnemy(arenaState.floor, arenaState.room);
  arenaState.fighting = true; arenaState.status = 'Бой начался!';
  updateArenaUI(); runArenaCombat();
}

function arenaRetreat() {
  if (!arenaState.fighting) return;
  arenaState.fighting = false;
  reviveFighters();
  arenaState.status = 'Вы отступили. Враг сохранил HP, бойцы полностью восстановлены.';
  updateArenaUI(); renderFighters();
}

function runArenaCombat() {
  const enemy = arenaState.enemy;
  if (!enemy) { arenaState.fighting = false; updateArenaUI(); return; }
  const enemyDmg = Math.max(10, Math.round(enemy.maxHp * 0.015));
  let heroCd = 0.5, enemyCd = 1.0, last = performance.now();

  function tick(now) {
    if (!arenaState.fighting) return;
    const dt = Math.min((now - last) / 1000, 0.2); last = now;
    if (!gamePaused) {
      heroCd -= dt; enemyCd -= dt;
      if (heroCd <= 0) {
        enemy.hp -= arenaDmg();
        const ic = $('arenaMonsterIcon');
        if (ic) { ic.style.transform = 'scale(1.25)'; setTimeout(() => { ic.style.transform = ''; }, 90); }
        heroCd = 0.7; updateArenaUI();
      }
      if (enemyCd <= 0 && enemy.hp > 0) {
        const aliveIds = Object.keys(fighters).filter(id => (fighterHpState[id] || 0) > 0);
        if (aliveIds.length > 0) {
          const targetId = pick(aliveIds);
          stats.arenaDeaths = stats.arenaDeaths || 0;
          fighterHpState[targetId] = Math.max(0, (fighterHpState[targetId] || 0) - enemyDmg);
          const per = fighterHp(CARDS[targetId].rarity);
          const u = Math.ceil(fighterHpState[targetId] / per);
          if (u < fighters[targetId]) {
            const lost = fighters[targetId] - u;
            /* Павшие юниты вернутся после боя (reviveFighters) — карты не теряются */
            arenaState.fallen = arenaState.fallen || {};
            arenaState.fallen[targetId] = (arenaState.fallen[targetId] || 0) + lost;
            arenaState.status = CARDS[targetId].name + ': выбыло ' + lost + ' (вернутся после боя)';
            stats.arenaDeaths += lost;
            fighters[targetId] = u;
          }
          if (u <= 0) { delete fighters[targetId]; delete fighterHpState[targetId]; }
          renderFighters();
        }
        enemyCd = 1.2; updateArenaUI();
      }
      if (enemy.hp <= 0) {
        arenaState.fighting = false; enemy.hp = 0;
        const reward = Math.round(arenaReward(arenaState.floor, arenaState.room));
        crystals += reward; runEarned += reward;
        sfx(enemy.isBoss ? 'boss' : 'win');
        fxFxAt($('arenaPanel'), enemy.isBoss ? ['#c9a227', '#fff', '#ff6b6b'] : ['#80e060', '#fff'], enemy.isBoss ? 40 : 18);
        if (enemy.isBoss) {
          stats.bossKills++;
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
        arenaState.status = enemy.isBoss ? '🏆 БОСС ПОВЕРЖЕН! +' + fmt(reward) + ' 💎 + трофей!' : 'Победа! +' + fmt(reward) + ' 💎';
        reviveFighters();
        updateArenaUI(); updateHUD(); renderFighters(); renderCollection(); checkAchievements();
        if (arenaAuto) setTimeout(tryStartAutoBattle, 600);
        return;
      }
      if (calcTotalHp() <= 0) {
        arenaState.fighting = false;
        arenaState.status = 'Поражение, но армия цела: бойцы восстановлены. Усильтесь и повторите!';
        sfx('lose');
        enemy.hp = enemy.maxHp;
        reviveFighters();
        if (arenaAuto) { arenaAuto = false; const chk = $('arenaAutoChk'); if (chk) chk.checked = false; }
        updateArenaUI(); renderFighters();
        return;
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function initArena() {
  arenaState.enemy = generateArenaEnemy(arenaState.floor, arenaState.room);
  updateArenaUI();
}
