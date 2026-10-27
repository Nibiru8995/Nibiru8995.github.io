'use strict';
/* ============================================================
   ЗВУК (sound.js) — версия 1.0 «Шёпот Тьмы».
   ФИДБЕК: «уменьшить количество звуков и убрать резкие».
   Принципы новой библиотеки:
   - МЕНЬШЕ ЗВУКОВ: 10 мягких событий вместо 15 резких;
     Знамения и ачивки больше НЕ озвучиваются (только визуал).
   - НИ ОДНОГО РЕЗКОГО ТЕМБРА: только sine/triangle (никаких
     sawtooth/square), мягкая атака 20-60 мс, низкие громкости,
     шум — только глухой и тихий (lowpass ≤ 900 Гц).
   - ТРОТТЛИНГ: один и тот же звук не чаще раза в 120 мс,
     любые звуки — не чаще раза в 50 мс (никакой «пулемётной» очереди).
   - Музыка: тёплый синусный дрон вместо расстроенных пил.
   Включается после первого жеста пользователя (политика браузера).
   Настройки: sfxOn / musicOn (мета-сохранение).
   ============================================================ */

let soundOn = true, musicOn = true, audioCtx = null, musicNodes = null, musicTimer = null;
let _lastSfx = {}, _lastAny = 0;

function ac() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

/* Мягкий тон: огибающая с ПЛАВНОЙ атакой (без щелчка) */
function sTone(c, o) {
  const t0 = c.currentTime + (o.t || 0), d = o.d || 0.2;
  const atk = o.a || 0.03;                       /* мягкая атака */
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.v || 0.08, t0 + atk);   /* мягкий подъём */
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + d + 0.05);
}

/* Глухой шумовой выдох (только низкие частоты, очень тихо) */
function sNoise(c, o) {
  const d = o.d || 0.3, len = Math.max(1, (c.sampleRate * d) | 0);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const fade = Math.sin((i / len) * Math.PI);  /* мягкий нарастающе-спадающий конверт */
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.freq || 700; f.Q.value = 0.4;
  const g = c.createGain(); g.gain.value = o.v || 0.03;
  s.connect(f); f.connect(g); g.connect(c.destination);
  s.start(c.currentTime + (o.t || 0));
}

/* Библиотека: 10 мягких событий. arg — редкость дропа (для тона) */
function sfx(name, arg) {
  if (!soundOn) return;
  const c = ac(); if (!c) return;
  const now = performance.now();
  if (now - _lastAny < 50) return;               /* глобальный троттлинг */
  if (now - (_lastSfx[name] || 0) < 120) return; /* не спамим один звук */
  _lastSfx[name] = now; _lastAny = now;
  switch (name) {
    case 'click': sTone(c, { f: 520, f2: 420, d: 0.05, type: 'sine', v: 0.03, a: 0.015 }); break;
    case 'roll': sTone(c, { f: 480, f2: 760, d: 0.22, type: 'sine', v: 0.05, a: 0.05 });
      sTone(c, { f: 720, f2: 980, d: 0.26, type: 'sine', v: 0.035, t: 0.06, a: 0.06 }); break;
    case 'drop': {
      /* ОДИН звук дропа; тональность мягко растёт с редкостью */
      const base = arg === 5 ? 392 : arg === 4 ? 349 : 294;
      [0, 4, 7].forEach((st, i) => sTone(c, { f: base * Math.pow(2, st / 12), d: 0.34 + i * 0.05, type: 'sine', v: 0.065 - i * 0.012, t: i * 0.09, a: 0.06 }));
      break;
    }
    case 'place': sTone(c, { f: 180, f2: 120, d: 0.14, type: 'sine', v: 0.06, a: 0.012 }); sNoise(c, { d: 0.1, v: 0.02, freq: 500 }); break;
    case 'win': [392, 494, 587].forEach((f, i) => sTone(c, { f, d: 0.3, type: 'sine', v: 0.055, t: i * 0.1, a: 0.05 })); break;
    case 'lose': sTone(c, { f: 196, f2: 98, d: 0.5, type: 'sine', v: 0.045, a: 0.08 }); break;
    case 'epoch': [131, 165, 196, 262].forEach((f, i) => sTone(c, { f, d: 1.1, type: 'sine', v: 0.06, t: i * 0.12, a: 0.25 }));
      sNoise(c, { d: 1.0, v: 0.025, freq: 420 }); break;
    case 'relic': [659, 831, 988].forEach((f, i) => sTone(c, { f, d: 0.5, type: 'sine', v: 0.05, t: i * 0.13, a: 0.07 })); break;
    case 'milestone': sTone(c, { f: 523, d: 0.2, type: 'sine', v: 0.055, a: 0.04 }); sTone(c, { f: 659, d: 0.3, type: 'sine', v: 0.05, t: 0.14, a: 0.05 }); break;
    case 'boss': sTone(c, { f: 98, f2: 62, d: 0.6, type: 'sine', v: 0.08, a: 0.06 }); sNoise(c, { d: 0.5, v: 0.03, freq: 260 }); break;
  }
}

/* Музыка: тёплый синусный дрон (мягкий, «дышащий» фильтр) */
const MUSIC_CHORDS = [[55, 82.4], [62, 92.5], [49, 73.4], [58, 87.3]];
function musicStart() {
  if (!musicOn || musicNodes) return;
  const c = ac(); if (!c) return;
  const g = c.createGain(); g.gain.value = 0;
  g.gain.linearRampToValueAtTime(0.03, c.currentTime + 3);
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 220; f.Q.value = 0.7;
  const o1 = c.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.4;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination);
  o1.start(); o2.start();
  musicNodes = { o1, o2, g };
  let ci = 0;
  musicTimer = setInterval(() => {
    ci = (ci + 1) % MUSIC_CHORDS.length;
    const t = c.currentTime;
    try {
      o1.frequency.linearRampToValueAtTime(MUSIC_CHORDS[ci][0], t + 3);
      o2.frequency.linearRampToValueAtTime(MUSIC_CHORDS[ci][1], t + 3);
      f.frequency.linearRampToValueAtTime(180 + Math.random() * 140, t + 3);
    } catch (e) { }
  }, 5000);
}
function musicStop() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicNodes) {
    try {
      musicNodes.g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
      const nodes = musicNodes;
      setTimeout(() => { try { nodes.o1.stop(); nodes.o2.stop(); } catch (e) { } }, 700);
    } catch (e) { }
    musicNodes = null;
  }
}
/* Первый жест пользователя — разблокировка аудио */
function soundUnlock() { if (ac() && musicOn) musicStart(); }
