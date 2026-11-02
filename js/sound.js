'use strict';
/*
ЗВУК (sound.js).
Принципы библиотеки:
- МЕНЬШЕ ЗВУКОВ: 10 мягких событий;
Знамения и ачивки НЕ озвучиваются (только визуал).
- НИ ОДНОГО РЕЗКОГО ТЕМБРА: только sine/triangle (никаких
sawtooth/square), мягкая атака 20-60 мс, низкие громкости,
шум — только глухой и тихий (lowpass ≤ 900 Гц).
- ТРОТТЛИНГ: один и тот же звук не чаще раза в 120 мс,
любые звуки — не чаще раза в 50 мс (никакой «пулемётной» очереди).
- Музыка: процедурный dungeon-synth (орган + колокола + саб +
  ветер вместо старого синусного дрона-гула).
Включается после первого жеста пользователя (политика браузера).
Настройки: sfxOn / musicOn (мета-сохранение).
 ============================================================*/

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
  const atk = o.a || 0.03; /* мягкая атака */
  const osc = c.createOscillator(), g = c.createGain();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f, t0);
  if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.v || 0.08, t0 + atk); /* мягкий подъём */
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
    const fade = Math.sin((i / len) * Math.PI); /* мягкий нарастающе-спадающий конверт */
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
  if (now - _lastAny < 50) return; /* глобальный троттлинг */
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

/* Музыка: процедурный dungeon-synth (НЕ дрон). Слои:
   - ОРГАН: минорный «хор» Am-F-Dm-Em в низком регистре, голос =
     треугольник с лёгкой расстройкой + октавный синус через глухой
     lowpass, тихий стерео-разброс; свап аккорда каждые 8 с — старые
     голоса тают 4 с, новые растут 3 с (орган дышит, стыков нет).
   - КОЛОКОЛА: редкая фраза 1-3 нот ля-минора (раз в 8-16 с), бронза
     обертонами 2.4/3.92 (негармонические), хвост 4-7 с; изредка
     глубокий удар октавой ниже — «склеп».
   - САБ: корень аккорда /2 (22-41 Гц) — пол под всем; при свапе
     плавно съезжает к новому корню.
   - ВЕТЕР: глухой луп-шум (lowpass 240 Гц) с медленным LFO.
   - ВОЗДУХ: мастер-шина = мягкий компрессор + lowpass с очень
     медленным фильтровым дыханием; на скрытой вкладке музыка
     присаживается, по возврату нарастает обратно.
   Принципы прежние: только sine/triangle, мягкие атаки (0.03-3 с),
   тихие уровни, старт по первому жесту, тумблер «Музыка» работает. */
const MUSIC_CHORDS = [
  [55.0, 82.41, 110.0, 130.81], /* Am: A1 E2 A2 C3 */
  [43.65, 87.31, 110.0, 130.81], /* F:  F1 F2 A2 C3 */
  [73.42, 87.31, 110.0, 146.83], /* Dm: D2 F2 A2 D3 */
  [82.41, 98.0, 123.47, 164.81]  /* Em: E2 G2 B2 E3 */
];
const MUSIC_BELLS = [220, 261.63, 293.66, 329.63, 392, 440]; /* A3..A4 ля-минор */

/* Один голос аккорда: расстроенный треугольник + октавный синус */
function musicVoice(c, f, dest, lvl, atk) {
  const det = (Math.random() - 0.5) * 7;
  const o1 = c.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f; o1.detune.value = det;
  const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2; o2.detune.value = det + 4;
  const g1 = c.createGain(); g1.gain.value = 0.62;
  const g2 = c.createGain(); g2.gain.value = 0.16;
  const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 550 + Math.random() * 170; fl.Q.value = 0.35;
  const vg = c.createGain(); vg.gain.value = 0.0001;
  o1.connect(g1); o2.connect(g2); g1.connect(fl); g2.connect(fl); fl.connect(vg);
  if (c.createStereoPanner) {
    const pan = c.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 0.7;
    vg.connect(pan); pan.connect(dest);
  } else vg.connect(dest);
  vg.gain.linearRampToValueAtTime(lvl, c.currentTime + atk);
  o1.start(); o2.start();
  return {
    fade(t, d) {
      try {
        vg.gain.cancelScheduledValues(t);
        vg.gain.setValueAtTime(Math.max(0.0001, vg.gain.value), t);
        vg.gain.linearRampToValueAtTime(0.0001, t + (d || 4));
      } catch (e) { }
    },
    kill(t) { try { o1.stop(t); o2.stop(t); } catch (e) { } }
  };
}

/* Постоянный синус (саб) с плавным съездом на новую частоту */
function musicSine(c, f, dest, lvl, atk) {
  const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
  const g = c.createGain(); g.gain.value = 0.0001;
  o.connect(g); g.connect(dest);
  g.gain.linearRampToValueAtTime(lvl, c.currentTime + atk);
  o.start();
  return {
    ramp(f2, t) { try { o.frequency.linearRampToValueAtTime(Math.max(1, f2), c.currentTime + t); } catch (e) { } },
    kill(t) { try { o.stop(t); } catch (e) { } }
  };
}

/* Ветер: луп-шум под глухим lowpass с очень медленным дыханием */
function musicWind(c, dest) {
  const len = (c.sampleRate * 3) | 0;
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  const seam = Math.min(2000, len); /* хвост плавно сводим к началу — луп без щелчка */
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  for (let i = 0; i < seam; i++) {
    const k = 1 - i / seam;
    d[len - 1 - i] = d[len - 1 - i] * k + d[i] * (1 - k);
  }
  const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 0.3;
  const g = c.createGain(); g.gain.value = 0.02;
  const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.03;
  const lg = c.createGain(); lg.gain.value = 0.012;
  lfo.connect(lg); lg.connect(g.gain);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(); lfo.start();
  return { kill(t) { try { s.stop(t); lfo.stop(t); } catch (e) { } } };
}

/* Свап аккорда органа: старые голоса тают, новые растут, саб съезжает */
function musicChord(ci) {
  const c = musicNodes.c;
  musicNodes.ci = ((ci % MUSIC_CHORDS.length) + MUSIC_CHORDS.length) % MUSIC_CHORDS.length;
  const t0 = c.currentTime, root = MUSIC_CHORDS[musicNodes.ci][0];
  musicNodes.voices.forEach(v => { v.fade(t0, 4); v.kill(t0 + 4.5); });
  musicNodes.voices = MUSIC_CHORDS[musicNodes.ci].map(f => musicVoice(c, f, musicNodes.comp, 0.045, 3));
  try { musicNodes.sub.ramp(root / 2, 5); } catch (e) { }
}

/* Колокольная фраза: 1-3 ноты раз в 8-16 с, изредка глубокий удар */
function musicBellPhrase() {
  if (!musicOn || !musicNodes) return;
  const c = musicNodes.c;
  let t = c.currentTime + 0.05;
  const n = 1 + ((Math.random() * 3) | 0); /* 1..3 */
  for (let i = 0; i < n; i++) {
    let f = MUSIC_BELLS[(Math.random() * MUSIC_BELLS.length) | 0];
    const deep = Math.random() < 0.18;
    if (deep) f *= 0.5; else if (Math.random() < 0.2) f *= 2;
    const end = t + (deep ? 7 : 4.5);
    [[1, 0.05], [2.4, 0.017], [3.92, 0.008]].forEach(p => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * p[0];
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(p[1], t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      o.connect(g); g.connect(musicNodes.master);
      o.start(t); o.stop(end + 0.1);
    });
    t += 0.7 + Math.random() * 0.8;
  }
  musicNodes.timers.push(setTimeout(musicBellPhrase, 8000 + Math.random() * 8000));
}

function musicStart() {
  if (!musicOn || musicNodes) return;
  const c = ac(); if (!c) return;

  /* мастер-шина: компрессор + медленно дышащий lowpass */
  const master = c.createGain();
  master.gain.setValueAtTime(0.0001, c.currentTime);
  master.gain.linearRampToValueAtTime(0.3, c.currentTime + 5);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 20; comp.ratio.value = 2.6;
  comp.attack.value = 0.03; comp.release.value = 0.4;
  const airF = c.createBiquadFilter(); airF.type = 'lowpass'; airF.frequency.value = 1250; airF.Q.value = 0.4;
  const airLfo = c.createOscillator(); airLfo.type = 'sine'; airLfo.frequency.value = 0.045;
  const airLfoG = c.createGain(); airLfoG.gain.value = 420;
  airLfo.connect(airLfoG); airLfoG.connect(airF.frequency); airLfo.start();
  master.connect(comp); comp.connect(airF); airF.connect(c.destination);

  musicNodes = { c, master, comp, airLfo, voices: [], timers: [], ci: 0 };
  musicNodes.wind = musicWind(c, comp);
  musicNodes.sub = musicSine(c, MUSIC_CHORDS[0][0] / 2, master, 0.04, 6);
  musicChord(0);
  musicTimer = setInterval(() => musicChord(musicNodes.ci + 1), 8000);
  musicNodes.timers.push(setTimeout(musicBellPhrase, 9000 + Math.random() * 6000));
}
function musicStop() {
  if (!musicNodes) return;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  const n = musicNodes;
  musicNodes = null;
  const t0 = n.c.currentTime;
  try {
    n.master.gain.cancelScheduledValues(t0);
    n.master.gain.setValueAtTime(Math.max(0.0001, n.master.gain.value), t0);
    n.master.gain.linearRampToValueAtTime(0.0001, t0 + 1.2);
  } catch (e) { }
  n.timers.forEach(x => clearTimeout(x));
  n.voices.forEach(v => { v.fade(t0, 1.2); v.kill(t0 + 1.4); });
  try { n.sub.kill(t0 + 1.4); n.wind.kill(t0 + 1.4); n.airLfo.stop(t0 + 1.4); } catch (e) { }
}
/* На скрытой вкладке музыка присаживается — батарейка и тишина */
document.addEventListener('visibilitychange', () => {
  if (!musicNodes) return;
  const m = musicNodes.master, t = musicNodes.c.currentTime;
  try {
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), t);
    m.gain.linearRampToValueAtTime(document.hidden ? 0.05 : 0.3, t + 2.5);
  } catch (e) { }
});
/* Первый жест пользователя — разблокировка аудио */
function soundUnlock() { if (ac() && musicOn) musicStart(); }
