'use strict';
/* ============================================================
   ЗВУК (sound.js) — полный синтез WebAudio, ни одного файла.
   SFX: клики, крутки, дропы по редкости, бой, победы, Эпохи,
   реликвии, знамения. Музыка: тёмный эмбиент-пэд (генерируется).
   Включается после первого жеста пользователя (политика браузера).
   Настройки: sfxOn / musicOn (мета-сохранение).
   ============================================================ */

let soundOn = true, musicOn = true, audioCtx = null, musicNodes = null, musicTimer = null;

function ac() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch (e) { return null; }
}

/* Один тон: осциллятор с огибающей */
function sTone(c, o) {
  const t0 = c.currentTime + (o.t || 0), d = o.d || 0.15;
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(o.v || 0.12, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(g); g.connect(c.destination);
  osc.start(t0); osc.stop(t0 + d + 0.05);
}

/* Шумовой всплеск через фильтр (удары, взрывы, свеллы) */
function sNoise(c, o) {
  const d = o.d || 0.2, len = Math.max(1, (c.sampleRate * d) | 0);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = c.createBufferSource(); s.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.freq || 800;
  const g = c.createGain(); g.gain.value = o.v || 0.1;
  s.connect(f); f.connect(g); g.connect(c.destination);
  s.start(c.currentTime + (o.t || 0));
}

/* Библиотека эффектов — всё играется на лету */
function sfx(name) {
  if (!soundOn) return;
  const c = ac(); if (!c) return;
  switch (name) {
    case 'click': sTone(c, { f: 640, f2: 320, d: 0.06, type: 'triangle', v: 0.05 }); break;
    case 'roll': for (let i = 0; i < 4; i++) sTone(c, { f: 300 + i * 140, d: 0.05, type: 'square', v: 0.04, t: i * 0.05 }); break;
    case 'drop3': [440, 554].forEach((f, i) => sTone(c, { f, d: 0.18, type: 'triangle', v: 0.1, t: i * 0.09 })); break;
    case 'drop4': [440, 554, 659].forEach((f, i) => sTone(c, { f, d: 0.22, type: 'triangle', v: 0.12, t: i * 0.09 })); sNoise(c, { d: 0.35, v: 0.05, freq: 2400 }); break;
    case 'drop5': [523, 659, 784, 1047, 1319].forEach((f, i) => sTone(c, { f, d: 0.32, type: 'sawtooth', v: 0.1, t: i * 0.09 })); sNoise(c, { d: 0.7, v: 0.08, freq: 3000 }); break;
    case 'place': sTone(c, { f: 220, f2: 90, d: 0.12, v: 0.13 }); sNoise(c, { d: 0.08, v: 0.05, freq: 900 }); break;
    case 'win': [523, 659, 784].forEach((f, i) => sTone(c, { f, d: 0.15, type: 'triangle', v: 0.1, t: i * 0.07 })); break;
    case 'lose': sTone(c, { f: 220, f2: 110, d: 0.4, type: 'sawtooth', v: 0.07 }); break;
    case 'epoch': [262, 330, 392, 523, 659, 784].forEach((f, i) => sTone(c, { f, d: 0.5, type: 'sawtooth', v: 0.09, t: i * 0.1 })); sNoise(c, { d: 1.2, v: 0.1, freq: 400 }); break;
    case 'relic': [880, 1109, 1319].forEach((f, i) => sTone(c, { f, d: 0.6, type: 'sine', v: 0.1, t: i * 0.12 })); break;
    case 'milestone': sTone(c, { f: 659, d: 0.15, type: 'triangle', v: 0.1 }); sTone(c, { f: 988, d: 0.25, type: 'triangle', v: 0.1, t: 0.12 }); break;
    case 'achv': [523, 659, 784, 1047].forEach((f, i) => sTone(c, { f, d: 0.3, type: 'triangle', v: 0.11, t: i * 0.11 })); sNoise(c, { d: 0.5, v: 0.04, freq: 2600 }); break;
    case 'omen': sTone(c, { f: 1047, f2: 1568, d: 0.25, v: 0.09 }); break;
    case 'boss': sTone(c, { f: 110, f2: 55, d: 0.5, type: 'sawtooth', v: 0.15 }); sNoise(c, { d: 0.4, v: 0.12, freq: 300 }); break;
  }
}

/* Музыка: медленный тёмный пэд из двух расстроенных пил через LFO-фильтр */
const MUSIC_CHORDS = [[55, 55.7], [62, 62.8], [49, 49.6], [58, 58.7]];
function musicStart() {
  if (!musicOn || musicNodes) return;
  const c = ac(); if (!c) return;
  const g = c.createGain(); g.gain.value = 0.045;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; f.Q.value = 2;
  const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 55;
  const o2 = c.createOscillator(); o2.type = 'sawtooth'; o2.frequency.value = 55.7;
  o1.connect(f); o2.connect(f); f.connect(g); g.connect(c.destination);
  o1.start(); o2.start();
  musicNodes = { o1, o2 };
  let ci = 0;
  musicTimer = setInterval(() => {
    ci = (ci + 1) % MUSIC_CHORDS.length;
    const t = c.currentTime;
    try {
      o1.frequency.linearRampToValueAtTime(MUSIC_CHORDS[ci][0], t + 2.5);
      o2.frequency.linearRampToValueAtTime(MUSIC_CHORDS[ci][1], t + 2.5);
      f.frequency.linearRampToValueAtTime(240 + Math.random() * 220, t + 2.5);
    } catch (e) { }
  }, 4000);
}
function musicStop() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicNodes) { try { musicNodes.o1.stop(); musicNodes.o2.stop(); } catch (e) { } musicNodes = null; }
}
/* Первый жест пользователя — разблокировка аудио */
function soundUnlock() { if (ac() && musicOn) musicStart(); }
