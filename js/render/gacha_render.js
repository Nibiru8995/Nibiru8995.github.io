'use strict';
/* ============================================================
   РЕНДЕР: ГАЧА (render/gacha_render.js)
   Окна выпадения карт, эффекты редкости, сводка больших круток
   и ПУНКТ 12 ТЗ — визуальный «перелёт» карты из окна гачи
   в коллекцию или в список бойцов (CSS transition).
   ============================================================ */
function playRarityEffect(modalCardEl, bannerEl, rarity) {
  bannerEl.className = 'rarity-banner'; bannerEl.textContent = '';
  if (rarity === 4) {
    bannerEl.textContent = 'РЕДКАЯ КАРТА'; bannerEl.classList.add('r4', 'show');
    modalCardEl.classList.add('rarity4'); spawnSparks(modalCardEl, 'r4', 10);
  } else if (rarity === 5) {
    bannerEl.textContent = 'ЛЕГЕНДАРНАЯ КАРТА'; bannerEl.classList.add('r5', 'show');
    modalCardEl.classList.add('rarity5'); spawnSparks(modalCardEl, 'r5', 18);
  } else modalCardEl.classList.remove('rarity4', 'rarity5');
}
function spawnSparks(container, cls, count) {
  for (let i = 0; i < count; i++) {
    const s = document.createElement('div');
    s.className = 'spark ' + cls;
    const angle = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 60;
    s.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    s.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
    s.style.left = '50%'; s.style.top = '50%';
    container.appendChild(s);
    setTimeout(() => s.classList.add('go'), 10 + i * 20);
    setTimeout(() => s.remove(), 1400);
  }
}

/* ================== ЭФФЕКТ «ПЕРЕЛЁТ КАРТЫ» (пункт 12 ТЗ) ==================
   Клонируем круглую карту, позиционируем на месте исходного элемента
   и CSS-transition двигаем к целевой панели (коллекция / бойцы). */
function flyCard(fromEl, targetSel, card, rarity, delay = 0) {
  const target = $(targetSel) || document.querySelector(targetSel);
  if (!fromEl || !target) return;
  setTimeout(() => {
    const fr = fromEl.getBoundingClientRect();
    const tr = target.getBoundingClientRect();
    const fl = document.createElement('div');
    fl.className = 'fly-card star' + rarity;
    fl.style.setProperty('--glow', rarityColor(rarity));
    fl.style.setProperty('--cardBg', rarityBg(rarity));
    fl.innerHTML = cardArtHTML(card, 'fly-art', '');
    fl.style.left = (fr.left + fr.width / 2 - 26) + 'px';
    fl.style.top = (fr.top + fr.height / 2 - 26) + 'px';
    fl.style.width = '52px'; fl.style.height = '52px';
    document.body.appendChild(fl);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      fl.style.transform = 'translate(' + (tr.left + tr.width / 2 - (fr.left + fr.width / 2)) + 'px,' +
        (tr.top + tr.height / 2 - (fr.top + fr.height / 2)) + 'px) scale(0.25) rotate(360deg)';
      fl.style.opacity = '0.15';
    }));
    setTimeout(() => {
      fl.remove();
      target.classList.remove('land-pulse');
      void target.offsetWidth;
      target.classList.add('land-pulse');
      setTimeout(() => target.classList.remove('land-pulse'), 500);
    }, 700);
  }, delay);
}

/* ---------------- Одиночный дроп ---------------- */
function showDrop(cardId) {
  pendingCard = cardId;
  const card = CARDS[cardId];
  gamePaused = true;
  const modalCard = $('dropModalCard'), bannerEl = $('dropRarityBanner'), el = $('dropCard');
  el.className = 'big-card';
  el.style.setProperty('--glow', rarityColor(card.rarity));
  el.style.setProperty('--cardBg', rarityBg(card.rarity));
  el.innerHTML = cardArtHTML(card, 'drop-art', '');
  $('dropStars').textContent = '★'.repeat(card.rarity) + ' · ' + FACTION_INFO[card.faction].name;
  $('dropName').textContent = card.name;
  $('dropEffect').innerHTML = pairsForCard(card).map(p => p.text).join('<br>') || 'Нет особых синергий.';
  $('dropFlavor').textContent = '«' + card.flavor + '»';
  modalCard.classList.remove('rarity4', 'rarity5');
  playRarityEffect(modalCard, bannerEl, card.rarity);
  /* Звук + canvas-FX по редкости */
  sfx(card.rarity === 5 ? 'drop5' : card.rarity === 4 ? 'drop4' : 'drop3');
  if (card.rarity === 5) { const b = $('dropModalCard').getBoundingClientRect(); fxBeams(b.left + b.width / 2, b.top + b.height / 2); fxConfetti(70); }
  else if (card.rarity === 4) fxFxAt($('dropModalCard'), ['#a070b0', '#e8c060', '#fff'], 26);
  else fxFxAt($('dropModalCard'), ['#7080a0', '#fff'], 12);
  if (card.rarity === 4) { el.classList.add('pop4'); setTimeout(() => el.classList.remove('pop4'), 1000); }
  if (card.rarity === 5) { el.classList.add('pop5'); setTimeout(() => el.classList.remove('pop5'), 1400); }
  $('dropModal').classList.add('show');

  $('placeBtn').onclick = () => {
    const id = pendingCard;
    inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
    $('dropModal').classList.remove('show');
    flyCard($('dropCard'), 'collection', card, card.rarity);
    pendingCard = id; placingMode = true; deleteMode = false; moveMode = false;
    renderGrid(); renderCollection(); updateBanner();
    gamePaused = false;
  };
  $('takeBtn').onclick = () => {
    const id = pendingCard;
    $('dropModal').classList.remove('show');
    if (id) {
      inventory[id] = (inventory[id] || 0) + 1; discovered.add(id);
      flyCard($('dropCard'), 'collection', CARDS[id], CARDS[id].rarity);
      renderCollection(); pendingCard = null;
    }
    gamePaused = false;
  };
}
$('dropCard').addEventListener('mouseenter', e => { if (pendingCard && CARDS[pendingCard]) showCardTooltip(e, CARDS[pendingCard], CARDS[pendingCard].baseRate); });
$('dropCard').addEventListener('mousemove', moveTooltip);
$('dropCard').addEventListener('mouseleave', hideTooltip);

/* ---------------- Мультикрутка ---------------- */
function showMulti(cardIds, count) {
  gamePaused = true;
  const rev = $('multiReveal');
  rev.innerHTML = '';
  const modalCard = $('multiModalCard'), bannerEl = $('multiRarityBanner');
  modalCard.classList.remove('rarity4', 'rarity5');
  let has4 = false, has5 = false;
  const my = cardIds;
  my.forEach(id => { const c = CARDS[id].rarity; if (c === 4) has4 = true; if (c === 5) has5 = true; });

  const SUMMARY_LIMIT = 60;
  if (my.length > SUMMARY_LIMIT) {
    /* Сводка для больших круток: группировка по картам */
    const counts = {};
    my.forEach(id => counts[id] = (counts[id] || 0) + 1);
    const rows = Object.keys(counts).sort((a, b) => CARDS[b].rarity - CARDS[a].rarity || counts[b] - counts[a])
      .map(id => {
        const c = CARDS[id];
        return '<div class="multi-row">' + cardArtHTML(c, 'mr-art', 'mr-glyph') +
          '<span class="mr-name">' + c.name + ' <i>' + '★'.repeat(c.rarity) + '</i></span>' +
          '<span class="mr-count">×' + counts[id] + '</span></div>';
      }).join('');
    rev.innerHTML = '<div class="multi-summary">' + rows + '</div>';
  } else {
    my.forEach((id, i) => {
      const card = CARDS[id];
      const el = document.createElement('div');
      el.className = 'multi-item';
      el.style.setProperty('--glow', rarityColor(card.rarity));
      el.style.setProperty('--cardBg', rarityBg(card.rarity));
      el.innerHTML = cardArtHTML(card, 'multi-art', '') + '<span class="multi-name">' + card.name + '</span>';
      el.addEventListener('mouseenter', e => showCardTooltip(e, card, card.baseRate));
      el.addEventListener('mousemove', moveTooltip);
      el.addEventListener('mouseleave', hideTooltip);
      rev.appendChild(el);
      setTimeout(() => { if (card.rarity === 4) el.classList.add('rare4'); else if (card.rarity === 5) el.classList.add('rare5'); }, Math.min(i * 15, 500));
    });
  }

  if (has5) playRarityEffect(modalCard, bannerEl, 5);
  else if (has4) playRarityEffect(modalCard, bannerEl, 4);
  $('multiTitle').textContent = (count || my.length) + ' круток';
  $('multiModal').classList.add('show');
  /* «Сразу в бой» имеет смысл только с открытой Ареной (пункт 9 ТЗ) */
  $('multiFight').style.display = epochHasArena(epoch) ? '' : 'none';

  $('multiOk').onclick = () => {
    $('multiModal').classList.remove('show');
    my.forEach((id, i) => {
      inventory[id] = (inventory[id] || 0) + 1;
      discovered.add(id);
      if (i < 6) flyCard($('multiModalCard'), 'collection', CARDS[id], CARDS[id].rarity, i * 90);
    });
    renderCollection(); gamePaused = false;
  };
  $('multiFight').onclick = () => {
    $('multiModal').classList.remove('show');
    my.forEach(id => { inventory[id] = (inventory[id] || 0) + 1; discovered.add(id); });
    renderCollection();
    const ones = my.filter(id => CARDS[id].rarity === 1);
    if (ones.length) flyCard($('multiModalCard'), 'fightersPanel', CARDS[ones[0]], 1);
    ones.forEach(id => addFighter(id, 1));
    gamePaused = false;
  };
}
