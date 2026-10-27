'use strict';
/* ============================================================
   РЕНДЕР: АРЕНА (render/arena_render.js)
   Список бойцов, панель Арены. Логика боя — в logic/arena.js.
   ============================================================ */

function renderFighters() {
  const list = $('fightersList');
  list.innerHTML = '';
  const ids = Object.keys(fighters).sort((a, b) => CARDS[b].rarity - CARDS[a].rarity);
  ids.forEach(id => {
    const c = CARDS[id];
    const count = fighters[id];
    const row = document.createElement('div');
    const currentHp = fighterHpState[id] || fighterHp(c.rarity) * count;
    const maxHp = fighterHp(c.rarity) * count;
    row.className = 'fighter-row';
    row.innerHTML = '<div class="f-hp-bar" style="width:' + (currentHp / maxHp) * 100 + '%"></div>' +
      cardArtHTML(c, 'f-art', 'f-icon') + '<span class="f-name">' + c.name + '</span>' +
      '<span class="f-count">x' + count + '</span><span class="f-dmg">⚔' + fmt(fighterDmg(c.rarity) * count) + '</span>';
    if (currentHp <= 0) row.style.opacity = .4;
    row.title = 'Клик — вернуть в инвентарь';
    row.onclick = () => {
      if (arenaState.fighting) return;
      inventory[id] = (inventory[id] || 0) + fighters[id];
      delete fighters[id]; delete fighterHpState[id];
      renderFighters(); renderCollection(); updateArenaUI();
    };
    list.appendChild(row);
  });
  if (ids.length === 0) list.innerHTML = '<div class="fighter-empty">Нет бойцов.<br>Ctrl+клик или ПКМ по карте в коллекции,<br>чтобы добавить её в бойцы.</div>';
  $('fightersTotalDmg').textContent = 'Σ ' + fmt(calcTotalDamage());
}

function updateArenaUI() {
  const enemy = arenaState.enemy;
  $('arenaFloorNum').textContent = arenaState.floor;
  const ind = $('roomIndicator');
  ind.innerHTML = '';
  for (let i = 1; i <= ARENA.roomsPerFloor; i++) {
    const d = document.createElement('div');
    d.className = 'room-dot';
    if (i === ARENA.roomsPerFloor) d.classList.add('boss');
    if (arenaState.cleared[i - 1]) d.classList.add('cleared');
    if (i === arenaState.room) d.classList.add('current');
    ind.appendChild(d);
  }
  $('arenaRoomText').textContent = '✖ Комната ' + arenaState.room + ' / ' + ARENA.roomsPerFloor;
  if (enemy) {
    $('arenaMonsterName').textContent = enemy.name;
    $('arenaMonsterIcon').textContent = enemy.glyph;
    const pct = Math.max(0, (enemy.hp / enemy.maxHp) * 100);
    $('arenaEnemyBar').style.width = pct + '%';
    $('arenaEnemyHp').textContent = Math.ceil(enemy.hp) + ' / ' + enemy.maxHp;
  }
  $('arenaStatAtk').textContent = fmt(calcTotalDamage());
  $('arenaStatHp').textContent = fmt(calcTotalHp());
  $('arenaStatDmg').textContent = fmt(calcTotalDamage());
  $('altarBuff').textContent = '🔱 Мощь Алтаря: ×' + altarPower().toFixed(2) + ' к урону (звенья, хор синергий и печати)';
  $('arenaStatus').textContent = arenaState.status;
  $('arenaStatus').className = 'arena-status ' + (arenaState.status.includes('Победа') || arenaState.status.includes('БОСС') ? 'win' : arenaState.status.includes('Поражение') ? 'lose' : '');
  const btn = $('arenaFightBtn'), retBtn = $('arenaRetreatBtn');
  /* ФИКС «прыжка» арены (фидбек 9): кнопка всегда занимает место, показывается через visibility */
  if (arenaState.fighting) { btn.disabled = true; btn.textContent = '⚔ БОЙ ИДЁТ...'; retBtn.classList.add('visible'); }
  else {
    btn.disabled = false; retBtn.classList.remove('visible');
    if (arenaState.cleared[arenaState.room - 1]) {
      btn.textContent = arenaState.room < ARENA.roomsPerFloor ? '➡ Следующая комната' : '🏆 Новый этаж';
    } else btn.textContent = '⚔ Атаковать';
  }
}
