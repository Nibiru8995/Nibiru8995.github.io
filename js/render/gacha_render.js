'use strict';
/*
РЕНДЕР: ГАЧА (render/gacha_render.js)
Внутри-забеговых окон дропа НЕТ: крутки живут в Гримуаре
(render/grimuar_render.js), карты выдаются колодой на старте.
Здесь остались визуальные примитивы, которыми пользуется
Гримуар: эффекты редкости и искры.
 ============================================================*/
function playRarityEffect(modalCardEl, bannerEl, rarity) {
  bannerEl.className = 'rarity-banner'; bannerEl.textContent = '';
  if (rarity === 'B' || rarity === 1) {
    bannerEl.textContent = 'ЗДАНИЕ'; bannerEl.classList.add('r4', 'show');
    modalCardEl.classList.add('rarity4'); spawnSparks(modalCardEl, 'r4', 6);
  } else if (rarity === 4) {
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
