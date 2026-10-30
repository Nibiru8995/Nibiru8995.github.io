'use strict';
/* ============================================================
   FX (render/fx.js) — canvas-слой частиц ПОВЕРХ интерфейса.
   Всплески при установке карт, конфетти Эпох, лучи ★5-дропа,
   всплывающие цифры наград.
   Требует реальный canvas (в тестовой песочнице отключается сам).
   Настройка: fxOn (мета).
   ============================================================ */

let fxCanvas = null, fxCtx = null, fxParts = [], fxTexts = [], fxOn = true;

function fxInit() {
  try {
    fxCanvas = document.getElementById('fxCanvas');
    if (!fxCanvas) return;
    fxCtx = fxCanvas.getContext('2d');
    if (!fxCtx || !fxCtx.setTransform) { fxCanvas = null; fxCtx = null; return; }
    fxResize();
    window.addEventListener('resize', fxResize);
    requestAnimationFrame(fxLoop);
  } catch (e) { fxCanvas = null; fxCtx = null; }
}
function fxResize() {
  if (!fxCanvas) return;
  fxCanvas.width = window.innerWidth || 800;
  fxCanvas.height = window.innerHeight || 600;
}
function fxOK() { return !!fxCtx && fxOn; }

/* Всплеск квадратиков-частиц (пиксель-вайб) */
function fxBurst(x, y, colors, n, speed, life) {
  if (!fxOK()) return;
  n = n || 18; speed = speed || 3.2; life = life || 42;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.9);
    fxParts.push({
      x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.2,
      g: 0.09, life, maxLife: life, s: 2 + Math.random() * 3,
      col: colors[(Math.random() * colors.length) | 0]
    });
  }
}
/* Всплывающий текст (+123 💎) */
function fxFloat(x, y, text, color, size) {
  if (!fxOK()) return;
  fxTexts.push({ x, y, text, color: color || '#ffd34d', size: size || 18, life: 80, maxLife: 80 });
}
/* Конфетти сверху экрана */
function fxConfetti(n) {
  if (!fxOK()) return;
  const cols = ['#c9a227', '#e8c060', '#a070b0', '#80e060', '#80e0ff', '#ff6b6b', '#fff'];
  const W = fxCanvas.width;
  n = n || 90;
  for (let i = 0; i < n; i++) {
    fxParts.push({
      x: Math.random() * W, y: -10 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 2.2, vy: 1.5 + Math.random() * 2.6, g: 0.03,
      life: 160 + Math.random() * 80, maxLife: 220, s: 2.5 + Math.random() * 3.5,
      col: cols[(Math.random() * cols.length) | 0]
    });
  }
}
/* Ударная волна (кольцо) */
function fxShockwave(x, y, color) {
  if (!fxOK()) return;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    fxParts.push({ x, y, vx: Math.cos(a) * 7, vy: Math.sin(a) * 7, g: 0, life: 34, maxLife: 34, s: 3.5, col: color || '#e8c060', ring: true });
  }
}
/* Лучи для ★5-дропа */
function fxBeams(x, y, colors) {
  if (!fxOK()) return;
  colors = colors || ['#fff', '#e8c060', '#c9a227'];
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * Math.PI * 2, v = 5 + Math.random() * 6;
    fxParts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: -0.02, life: 55, maxLife: 55, s: 3 + Math.random() * 4, col: colors[i % colors.length], beam: true });
  }
  fxBurst(x, y, colors, 30, 4, 60);
}
/* Угольки в главном меню — УДАЛЕНЫ (пожелание клиента: убрать летящие снизу частицы) */

/* ============================================================
   v1.5.10 «НЕРОВНЫЕ ОКОВЫ»: ПРОБЛЕСКИ ЦЕПЕЙ — бегущий по нитям свет.
   Геометрию (ломаную вдоль нитей шва) считает drawUgLink и отдаёт
   сюда через fxSetGlints при каждой ФАКТИЧЕСКОЙ перерисовке SVG.
   Позиция света — детерминированная фаза по длине ломаной.
   Почему канва, а не SMIL: замер на поле 9x9 показал, что сотни
   SMIL-анимаций (даже лёгкие animate x/y) просаживали кадр до
   ~27fps, а drawImage на уже идущем fx-канве стоит почти ничего —
   стабильные 60fps в тех же условиях. Визуал тот же: мягкое пятно
   света (glint_pale / фиолетовый glint_royal у особых связей).
   ============================================================ */
let fxGlints = [], fxGlintOx = 0, fxGlintOy = 0;
const fxGlintImgs = {};
function fxSetGlints(list, ox, oy) {
  fxGlintOx = ox || 0; fxGlintOy = oy || 0;
  fxGlints = (list || []).map(g => {
    /* кумулятивные длины — один раз, не каждый кадр */
    const cum = [0];
    for (let i = 1; i < g.pts.length; i++)
      cum.push(cum[i - 1] + Math.hypot(g.pts[i][0] - g.pts[i - 1][0], g.pts[i][1] - g.pts[i - 1][1]));
    return { pts: g.pts, dur: g.dur, phase: g.phase, alpha: g.alpha, royal: g.royal, cum, total: cum[cum.length - 1] || 1 };
  });
  ['pale', 'royal'].forEach(key => {
    if (fxGlintImgs[key]) return;
    const im = new Image();
    im.src = 'assets/fx/glint_' + key + '.png' + ASSET_VER_Q;
    fxGlintImgs[key] = im;
  });
}
function fxGlintPoint(g, d) {
  for (let i = 1; i < g.pts.length; i++) {
    if (d <= g.cum[i]) {
      const k = (d - g.cum[i - 1]) / ((g.cum[i] - g.cum[i - 1]) || 1);
      return [g.pts[i - 1][0] + (g.pts[i][0] - g.pts[i - 1][0]) * k,
              g.pts[i - 1][1] + (g.pts[i][1] - g.pts[i - 1][1]) * k];
    }
  }
  return g.pts[g.pts.length - 1];
}

/* Центр DOM-элемента → всплеск */
function fxFxAt(el, colors, n) {
  if (!fxOK() || !el || !el.getBoundingClientRect) return;
  const b = el.getBoundingClientRect();
  fxBurst(b.left + b.width / 2, b.top + b.height / 2, colors, n);
}
/* Центр клетки грида */
function fxAtCell(r, c, colors, n, kind) {
  if (!fxOK()) return;
  const n0 = playableSize, st = gridStart();
  const cell = gridEl.children[(r - st) * n0 + (c - st)];
  if (!cell) return;
  const b = cell.getBoundingClientRect();
  const x = b.left + b.width / 2, y = b.top + b.height / 2;
  if (kind === 'wave') fxShockwave(x, y, colors && colors[0]);
  else fxBurst(x, y, colors || ['#e8c060', '#c9a227', '#fff'], n, kind === 'big' ? 5 : 3.2);
}

function fxLoop(now) {
  if (fxCtx) {
    fxCtx.clearRect(0, 0, fxCanvas.width, fxCanvas.height);
    for (let i = fxParts.length - 1; i >= 0; i--) {
      const p = fxParts[i];
      p.life--;
      if (p.life <= 0) { fxParts.splice(i, 1); continue; }
      p.x += p.vx; p.y += p.vy; p.vy += p.g;
      const a = Math.min(1, p.life / (p.maxLife * 0.5));
      fxCtx.globalAlpha = a;
      fxCtx.fillStyle = p.col;
      const s = p.ring ? p.s * (p.life / p.maxLife) + 0.5 : p.s;
      fxCtx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    for (let i = fxTexts.length - 1; i >= 0; i--) {
      const t = fxTexts[i];
      t.life--; t.y -= 0.8;
      if (t.life <= 0) { fxTexts.splice(i, 1); continue; }
      fxCtx.globalAlpha = Math.min(1, t.life / (t.maxLife * 0.6));
      fxCtx.font = 'bold ' + t.size + 'px monospace';
      fxCtx.textAlign = 'center';
      fxCtx.strokeStyle = 'rgba(0,0,0,0.8)';
      fxCtx.lineWidth = 3;
      fxCtx.strokeText(t.text, t.x, t.y);
      fxCtx.fillStyle = t.color;
      fxCtx.fillText(t.text, t.x, t.y);
    }
    /* v1.5.10: проблески цепей — свет бежит вдоль нитей от карты к карте */
    if (fxOn && fxGlints.length) {
      const t = (now || 0) / 1000;
      for (let i = 0; i < fxGlints.length; i++) {
        const g = fxGlints[i];
        const im = fxGlintImgs[g.royal ? 'royal' : 'pale'];
        if (!im || !im.complete || !im.naturalWidth) continue;
        const p = fxGlintPoint(g, (((t / g.dur) + g.phase) % 1) * g.total);
        fxCtx.globalAlpha = g.alpha;
        fxCtx.drawImage(im, fxGlintOx + p[0] - 7, fxGlintOy + p[1] - 7, 14, 14);
      }
    }
    fxCtx.globalAlpha = 1;
  }
  requestAnimationFrame(fxLoop);
}
