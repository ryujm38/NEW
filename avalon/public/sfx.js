'use strict';
// 효과음: 소리 파일 없이 브라우저(Web Audio)로 그 자리에서 만들어 낸다. 내려받는 데이터가 0이라 사이트가 가볍다.
//
//   sfx('dice') 처럼 부르면 소리가 난다. 켜기/끄기는 기기마다 저장(localStorage 'sfx' = 'off').
//   폰은 사용자가 화면을 한 번 눌러야 소리를 낼 수 있어서, 첫 터치 때 오디오를 깨운다.
//   새 상태가 오면 sfxOnState(prev, S)가 게임별 규칙(SFX_GAME)으로 어떤 소리를 언제 낼지 정한다.
//
// ★ 비밀 보호 원칙: 다 같이 한자리에서 하므로 옆 사람 폰 소리도 들린다.
//   소리는 "그 자리의 모두가 이미 아는 정보"로만 정한다. 내 역할·내 손패·내가 낸 카드/표·밤 행동·
//   경찰 조사 결과·마피아끼리의 채팅처럼 나만 아는 정보로는 소리를 내거나 바꾸지 않는다.
//   (예: 뱅!은 대응 카드가 있을 때만 대응 창이 뜨므로 "대응하세요" 소리 대신, 표적이 되면 누구든 같은 경고음)

const SFX = { ctx: null, master: null, noiseBuf: null, last: {}, lastStateAt: 0 };

const sfxOn = () => { try { return localStorage.getItem('sfx') !== 'off'; } catch { return true; } };
function setSfx(on) { try { localStorage.setItem('sfx', on ? 'on' : 'off'); } catch { /* noop */ } }

function sfxCtx() {
  if (SFX.ctx) return SFX.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  SFX.ctx = new AC();
  SFX.master = SFX.ctx.createGain();
  SFX.master.gain.value = 0.55;
  const comp = SFX.ctx.createDynamicsCompressor(); // 여러 소리가 겹쳐도 찢어지지 않게
  SFX.master.connect(comp);
  comp.connect(SFX.ctx.destination);
  const len = SFX.ctx.sampleRate;
  SFX.noiseBuf = SFX.ctx.createBuffer(1, len, SFX.ctx.sampleRate);
  const d = SFX.noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return SFX.ctx;
}
// 첫 터치/클릭에 오디오를 깨운다 (iOS·안드로이드 자동 재생 제한)
['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, () => {
  const c = sfxCtx();
  if (c && c.state === 'suspended') c.resume();
}, { capture: true, passive: true }));

// ---- 소리 재료 ----
function env(g, t, vol, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}
function tone(freq, { at = 0, dur = 0.15, type = 'sine', vol = 0.3, to = null, attack = 0.005 } = {}) {
  const c = SFX.ctx;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, vol, attack, dur);
  o.connect(g).connect(SFX.master);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}
function noise({ at = 0, dur = 0.1, vol = 0.3, freq = 2000, q = 1, type = 'bandpass', to = null, attack = 0.002 } = {}) {
  const c = SFX.ctx;
  const t = c.currentTime + at;
  const s = c.createBufferSource();
  s.buffer = SFX.noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, vol, attack, dur);
  s.connect(f).connect(g).connect(SFX.master);
  s.start(t, Math.random() * 0.5);
  s.stop(t + attack + dur + 0.05);
}
const chord = (notes, opts) => notes.forEach((n, i) => tone(n, { ...opts, at: (opts.at || 0) + (opts.step || 0) * i }));
const melody = (notes, { gap = 0.14, dur = 0.12, type = 'triangle', vol = 0.2, at = 0 } = {}) => notes.forEach((n, i) => { if (n) tone(n, { at: at + i * gap, dur, type, vol }); });
const coins = (n, at = 0) => { for (let i = 0; i < n; i++) { tone(1318.5 + (i % 3) * 120, { at: at + i * 0.07, dur: 0.07, type: 'square', vol: 0.06 }); tone(1975.5 + (i % 2) * 90, { at: at + i * 0.07 + 0.05, dur: 0.18, type: 'square', vol: 0.06 }); } };
const thud = (at = 0, f = 150) => { tone(f, { at, dur: 0.12, vol: 0.4, to: f * 0.5 }); noise({ at, dur: 0.05, vol: 0.15, freq: 900 }); };

// ---- 소리 목록 ----
const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, F5: 698.5, G5: 784, A5: 880, B5: 987.8, C6: 1046.5, E6: 1318.5, G6: 1568 };
const SOUNDS = {
  // 공통
  turn() { tone(880, { dur: 0.25, type: 'triangle', vol: 0.25 }); tone(1318.5, { at: 0.12, dur: 0.4, type: 'triangle', vol: 0.25 }); },
  start() { chord([N.C5, N.E5, N.G5, N.C6], { step: 0.09, dur: 0.3, type: 'triangle', vol: 0.2 }); },
  win() { chord([N.C5, N.E5, N.G5], { step: 0.12, dur: 0.25, type: 'square', vol: 0.09 }); chord([N.C6, N.E6, N.G6], { at: 0.4, dur: 0.7, type: 'triangle', vol: 0.18 }); noise({ at: 0.4, dur: 0.6, vol: 0.06, freq: 6000, type: 'highpass' }); },
  lose() { [392, 370, 349.2, 329.6].forEach((f, i) => tone(f, { at: i * 0.28, dur: i === 3 ? 0.7 : 0.25, type: 'sawtooth', vol: 0.08, to: i === 3 ? 300 : null })); },
  end() { chord([N.E5, N.G5, N.C6], { step: 0.1, dur: 0.5, type: 'triangle', vol: 0.18 }); },
  tick() { tone(1500, { dur: 0.03, vol: 0.1 }); },
  coin() { tone(1318.5, { dur: 0.08, type: 'square', vol: 0.07 }); tone(1975.5, { at: 0.07, dur: 0.3, type: 'square', vol: 0.07 }); },
  pay() { tone(988, { dur: 0.08, type: 'square', vol: 0.06 }); tone(740, { at: 0.08, dur: 0.22, type: 'square', vol: 0.06 }); },
  heavyPay() { tone(740, { dur: 0.1, type: 'square', vol: 0.06 }); tone(554, { at: 0.1, dur: 0.1, type: 'square', vol: 0.06 }); tone(370, { at: 0.2, dur: 0.3, type: 'square', vol: 0.06 }); },
  jackpot() { coins(7); chord([N.C6, N.E6, N.G6], { at: 0.5, dur: 0.4, type: 'triangle', vol: 0.1 }); },
  sparkle() { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.25, vol: 0.09 })); },
  deflate() { tone(392, { dur: 0.45, type: 'sawtooth', vol: 0.07, to: 196 }); },
  warn() { tone(660, { dur: 0.12, type: 'square', vol: 0.06 }); tone(523, { at: 0.16, dur: 0.18, type: 'square', vol: 0.06 }); },
  alarm() { for (let i = 0; i < 2; i++) { tone(880, { at: i * 0.32, dur: 0.13, type: 'square', vol: 0.07 }); tone(660, { at: i * 0.32 + 0.15, dur: 0.13, type: 'square', vol: 0.07 }); } },
  siren() { tone(700, { dur: 0.35, type: 'sawtooth', vol: 0.05, to: 1100 }); tone(1100, { at: 0.35, dur: 0.35, type: 'sawtooth', vol: 0.05, to: 700 }); },
  tense() { tone(110, { dur: 1.0, type: 'sawtooth', vol: 0.06 }); tone(116.5, { dur: 1.0, type: 'sawtooth', vol: 0.06 }); },
  heartbeat() { [0, 0.18, 0.75, 0.93].forEach((at, i) => tone(i % 2 ? 55 : 65, { at, dur: 0.14, vol: 0.5, to: 40 })); },
  bell() { [0, 0.7].forEach((at) => { tone(784, { at, dur: 1.0, vol: 0.15 }); tone(1568, { at, dur: 0.6, vol: 0.05 }); tone(1175, { at, dur: 0.8, vol: 0.06 }); }); },
  gong() { tone(98, { dur: 2.0, vol: 0.25 }); tone(147, { dur: 1.6, vol: 0.12 }); tone(233, { dur: 1.2, vol: 0.06 }); noise({ dur: 0.3, vol: 0.08, freq: 400 }); },
  fanfare() { melody([N.G4, N.C5, N.E5, N.G5, 0, N.E5, N.G5], { gap: 0.1, dur: 0.12, type: 'square', vol: 0.07 }); },
  again() { melody([N.E5, N.G5, N.C6], { gap: 0.08, dur: 0.12, vol: 0.18 }); },
  blipUp() { tone(600, { dur: 0.08, vol: 0.12, to: 900 }); tone(900, { at: 0.09, dur: 0.1, vol: 0.12 }); },
  blipDown() { tone(500, { dur: 0.1, vol: 0.1, to: 300 }); },
  pop() { tone(900, { dur: 0.06, vol: 0.15, to: 1400 }); },
  swoosh() { noise({ dur: 0.25, vol: 0.12, freq: 600, to: 2500, q: 0.8, attack: 0.05 }); },
  relief() { tone(440, { dur: 0.2, vol: 0.15 }); tone(659, { at: 0.18, dur: 0.4, vol: 0.15 }); },
  mystic() { chord([N.A4, N.C5, N.E5, N.B5], { step: 0.12, dur: 0.9, type: 'sine', vol: 0.09 }); },
  discovery() { melody([N.C5, N.E5, N.G5, N.C6, N.E6], { gap: 0.07, dur: 0.25, type: 'sine', vol: 0.12 }); },

  // 주사위·말 (부루마블)
  dice() { // 컵 안에서 달그락 → 판 위로 굴러 멈춤
    let t = 0;
    for (let i = 0; i < 11; i++) {
      t += 0.035 + i * i * 0.0028;
      noise({ at: t, dur: 0.025, vol: 0.32 - i * 0.018, freq: 2200 + Math.random() * 1800, q: 4 });
      tone(380 + Math.random() * 140, { at: t, dur: 0.03, vol: 0.05, type: 'triangle' });
    }
  },
  hop() { tone(620, { dur: 0.06, type: 'sine', vol: 0.22, to: 420 }); noise({ dur: 0.02, vol: 0.1, freq: 3000, q: 2 }); },
  land() { tone(300, { dur: 0.12, vol: 0.25, to: 180 }); noise({ dur: 0.05, vol: 0.12, freq: 1200, q: 1 }); },
  whoosh() { noise({ dur: 0.9, vol: 0.18, freq: 300, to: 3500, q: 1.2, attack: 0.2 }); tone(220, { dur: 0.9, vol: 0.08, to: 880, attack: 0.2 }); },
  island() { tone(660, { dur: 0.7, type: 'triangle', vol: 0.15, to: 180 }); noise({ at: 0.1, dur: 0.6, vol: 0.06, freq: 500, type: 'lowpass' }); },
  wave() { noise({ dur: 0.9, vol: 0.1, freq: 500, to: 1500, type: 'lowpass', attack: 0.4 }); },
  build() { [0, 0.16].forEach((at) => { tone(130, { at, dur: 0.1, vol: 0.35, to: 70 }); noise({ at, dur: 0.05, vol: 0.2, freq: 1500, q: 1 }); }); tone(1046.5, { at: 0.36, dur: 0.25, type: 'triangle', vol: 0.12 }); },
  double() { chord([784, 988, 1175, 1568], { step: 0.07, dur: 0.18, type: 'square', vol: 0.06 }); },
  salary() { coins(3); tone(N.C6, { at: 0.25, dur: 0.3, type: 'triangle', vol: 0.1 }); },
  crumble() { noise({ dur: 1.1, vol: 0.3, freq: 2500, to: 120, type: 'lowpass' }); for (let i = 0; i < 6; i++) thud(i * 0.13, 120 - i * 10); },
  countdown() { [0, 0.3, 0.6].forEach((at) => tone(1200, { at, dur: 0.08, type: 'square', vol: 0.06 })); tone(1800, { at: 0.9, dur: 0.3, type: 'square', vol: 0.07 }); },
  horn() { tone(110, { dur: 0.9, type: 'sawtooth', vol: 0.12, attack: 0.08 }); tone(165, { dur: 0.9, type: 'sawtooth', vol: 0.06, attack: 0.08 }); },
  jet() { noise({ dur: 1.2, vol: 0.2, freq: 400, to: 4000, q: 0.7, attack: 0.3 }); tone(300, { dur: 1.2, type: 'sawtooth', vol: 0.03, to: 900, attack: 0.3 }); },
  car() { tone(70, { dur: 0.25, type: 'sawtooth', vol: 0.12, to: 140 }); tone(140, { at: 0.25, dur: 0.5, type: 'sawtooth', vol: 0.12, to: 220 }); tone(880, { at: 0.8, dur: 0.12, type: 'square', vol: 0.05 }); tone(880, { at: 0.98, dur: 0.12, type: 'square', vol: 0.05 }); },
  birthday() { melody([N.G4, N.G4, N.A4, N.G4, N.C5, N.B4], { gap: 0.2, dur: 0.18, vol: 0.16 }); },
  travel() { melody([N.C5, N.E5, N.G5, N.E5, N.C6], { gap: 0.11, dur: 0.12, vol: 0.14 }); },
  radio() { noise({ dur: 0.3, vol: 0.08, freq: 3000, q: 0.5 }); tone(1600, { at: 0.32, dur: 0.07, type: 'square', vol: 0.06 }); tone(1600, { at: 0.44, dur: 0.07, type: 'square', vol: 0.06 }); },

  // 카드 (우노 등)
  card() { noise({ dur: 0.07, vol: 0.22, freq: 2500, to: 900, q: 0.8 }); tone(180, { at: 0.04, dur: 0.05, vol: 0.12 }); },
  draw() { noise({ dur: 0.12, vol: 0.12, freq: 1200, to: 3500, q: 0.7, attack: 0.03 }); },
  drawMany() { for (let i = 0; i < 4; i++) noise({ at: i * 0.09, dur: 0.1, vol: 0.12, freq: 1200, to: 3500, q: 0.7, attack: 0.02 }); },
  shuffle() { for (let i = 0; i < 8; i++) noise({ at: i * 0.04, dur: 0.03, vol: 0.1, freq: 3000, q: 2 }); },
  flip() { noise({ dur: 0.05, vol: 0.2, freq: 3200, q: 1.5 }); },
  uno() { tone(659.3, { dur: 0.12, type: 'square', vol: 0.08 }); tone(987.8, { at: 0.12, dur: 0.3, type: 'square', vol: 0.08 }); },
  skip() { tone(1400, { dur: 0.18, type: 'triangle', vol: 0.1, to: 500 }); },
  buzzer() { tone(150, { dur: 0.4, type: 'sawtooth', vol: 0.09 }); tone(155, { dur: 0.4, type: 'sawtooth', vol: 0.09 }); },
  reverse() { tone(400, { dur: 0.18, vol: 0.15, to: 1200 }); tone(1200, { at: 0.2, dur: 0.18, vol: 0.15, to: 400 }); },
  penalty() { tone(523, { dur: 0.1, type: 'square', vol: 0.06 }); tone(392, { at: 0.1, dur: 0.2, type: 'square', vol: 0.06 }); },
  penalty4() { tone(523, { dur: 0.1, type: 'square', vol: 0.07 }); tone(392, { at: 0.1, dur: 0.1, type: 'square', vol: 0.07 }); tone(262, { at: 0.2, dur: 0.35, type: 'square', vol: 0.07 }); },
  hit() { tone(330, { dur: 0.3, type: 'square', vol: 0.09, to: 120 }); },
  pulse3() { [0, 0.15, 0.3].forEach((at) => tone(1046.5, { at, dur: 0.07, type: 'square', vol: 0.07 })); },
  colorR() { tone(N.C5, { dur: 0.3, type: 'triangle', vol: 0.2 }); },
  colorY() { tone(N.E5, { dur: 0.3, type: 'triangle', vol: 0.2 }); },
  colorG() { tone(N.G5, { dur: 0.3, type: 'triangle', vol: 0.2 }); },
  colorB() { tone(N.C6, { dur: 0.3, type: 'triangle', vol: 0.2 }); },

  // 뱅!
  bang() { noise({ dur: 0.35, vol: 0.6, freq: 7000, to: 300, type: 'lowpass', q: 0.5, attack: 0.001 }); tone(140, { dur: 0.3, vol: 0.5, to: 40, attack: 0.001 }); },
  bangSoft() { noise({ dur: 0.2, vol: 0.3, freq: 5000, to: 300, type: 'lowpass', attack: 0.001 }); tone(130, { dur: 0.18, vol: 0.25, to: 50, attack: 0.001 }); },
  miss() { tone(2600, { dur: 0.4, vol: 0.12, to: 700 }); noise({ dur: 0.05, vol: 0.15, freq: 4000, q: 3 }); },
  alert() { tone(1760, { dur: 0.08, type: 'square', vol: 0.07 }); tone(2349, { at: 0.09, dur: 0.12, type: 'square', vol: 0.07 }); tone(3000, { at: 0.25, dur: 0.35, vol: 0.06, to: 800 }); },
  hurt() { tone(200, { dur: 0.25, type: 'square', vol: 0.12, to: 90 }); },
  heal() { [0, 0.12, 0.24].forEach((at, i) => tone(300 + i * 90, { at, dur: 0.1, vol: 0.18, to: 380 + i * 90 })); },
  saloon() { melody([N.C5, N.E5, N.G5, N.E5, N.F5, N.A5, N.G5], { gap: 0.1, dur: 0.09, type: 'square', vol: 0.05 }); },
  death() { tone(110, { dur: 1.4, vol: 0.3 }); tone(164.8, { dur: 1.2, vol: 0.15 }); tone(98, { at: 0.05, dur: 1.5, type: 'triangle', vol: 0.12 }); },
  gatling() { for (let i = 0; i < 5; i++) { noise({ at: i * 0.09, dur: 0.12, vol: 0.35, freq: 5000, to: 400, type: 'lowpass' }); tone(120, { at: i * 0.09, dur: 0.1, vol: 0.25, to: 50 }); } },
  drum() { for (let i = 0; i < 4; i++) tone(i % 2 ? 140 : 100, { at: i * 0.16, dur: 0.15, vol: 0.4, to: 60 }); },
  jail() { noise({ dur: 0.15, vol: 0.25, freq: 800, q: 6 }); tone(196, { at: 0.02, dur: 0.4, type: 'square', vol: 0.06 }); },
  boom() { noise({ dur: 1.0, vol: 0.6, freq: 1800, to: 80, type: 'lowpass', attack: 0.001 }); tone(70, { dur: 0.9, vol: 0.5, to: 30 }); },
  fuse() { noise({ dur: 0.7, vol: 0.12, freq: 5000, q: 0.6, type: 'highpass' }); [0.2, 0.45].forEach((at) => tone(2000, { at, dur: 0.03, vol: 0.08 })); },
  whistle() { tone(1200, { dur: 0.25, vol: 0.12, to: 1500 }); tone(1500, { at: 0.3, dur: 0.5, vol: 0.12, to: 900 }); },
  cock() { noise({ dur: 0.03, vol: 0.3, freq: 2500, q: 3 }); noise({ at: 0.12, dur: 0.04, vol: 0.35, freq: 1800, q: 3 }); },
  hooves() { [0, 0.12, 0.3, 0.42].forEach((at) => thud(at, 260)); },
  barrel() { tone(110, { dur: 0.3, vol: 0.4, to: 80 }); noise({ dur: 0.1, vol: 0.12, freq: 400 }); },
  scope() { tone(2400, { dur: 0.04, vol: 0.12 }); tone(3000, { at: 0.06, dur: 0.05, vol: 0.1 }); },
  snatch() { noise({ dur: 0.15, vol: 0.2, freq: 900, to: 4000, q: 1, attack: 0.01 }); },
  crumple() { for (let i = 0; i < 7; i++) noise({ at: i * 0.03 + Math.random() * 0.02, dur: 0.03, vol: 0.12, freq: 2500 + Math.random() * 2000, q: 2 }); },
  storeBell() { tone(2093, { dur: 0.5, vol: 0.1 }); tone(2637, { at: 0.08, dur: 0.6, vol: 0.08 }); },
  trombone() { [392, 370, 349.2, 311.1].forEach((f, i) => tone(f, { at: i * 0.32, dur: i === 3 ? 0.8 : 0.28, type: 'sawtooth', vol: 0.07, to: i === 3 ? 260 : null })); },
  flipGood() { noise({ dur: 0.05, vol: 0.2, freq: 3200, q: 1.5 }); tone(N.E5, { at: 0.1, dur: 0.15, vol: 0.16 }); tone(N.A5, { at: 0.22, dur: 0.3, vol: 0.16 }); },
  flipBad() { noise({ dur: 0.05, vol: 0.2, freq: 3200, q: 1.5 }); tone(196, { at: 0.12, dur: 0.3, vol: 0.2, to: 150 }); },

  // 아발론·마피아
  vote() { tone(160, { dur: 0.12, vol: 0.35, to: 90 }); noise({ dur: 0.06, vol: 0.15, freq: 900 }); },
  seal() { tone(900, { dur: 0.04, vol: 0.08 }); noise({ dur: 0.03, vol: 0.06, freq: 2000 }); },
  crown() { tone(N.G5, { dur: 0.3, type: 'triangle', vol: 0.12 }); tone(N.D5 * 2, { at: 0.1, dur: 0.4, type: 'triangle', vol: 0.08 }); },
  reveal() { for (let i = 0; i < 6; i++) tone(1200 + i * 120, { at: i * 0.11, dur: 0.06, type: 'square', vol: 0.04 }); },
  approve() { chord([N.C5, N.E5, N.G5], { dur: 0.5, type: 'triangle', vol: 0.12 }); tone(N.C6, { at: 0.18, dur: 0.5, type: 'triangle', vol: 0.12 }); },
  reject() { thud(0, 110); tone(155, { at: 0.05, dur: 0.5, type: 'sawtooth', vol: 0.05, to: 110 }); },
  march() { [0, 0.22, 0.44, 0.55].forEach((at) => thud(at, 120)); },
  success() { chord([N.C5, N.E5, N.G5, N.C6], { dur: 0.6, type: 'triangle', vol: 0.12 }); },
  narrow() { chord([N.C5, N.E5, N.G5], { dur: 0.5, type: 'triangle', vol: 0.12 }); tone(277, { at: 0.35, dur: 0.5, type: 'sawtooth', vol: 0.04 }); },
  fail() { chord([233.1, 246.9, 349.2], { dur: 0.8, type: 'sawtooth', vol: 0.06 }); },
  clang() { tone(1800, { dur: 0.5, vol: 0.1 }); tone(2690, { dur: 0.35, vol: 0.06 }); noise({ dur: 0.08, vol: 0.25, freq: 5000, q: 2 }); },
  stab() { noise({ dur: 0.2, vol: 0.3, freq: 900, to: 4000, q: 1, attack: 0.01 }); thud(0.2, 90); },
  night() { tone(392, { dur: 0.5, type: 'triangle', vol: 0.12 }); tone(329.6, { at: 0.35, dur: 0.9, type: 'triangle', vol: 0.12 }); noise({ dur: 1.2, vol: 0.04, freq: 400, type: 'lowpass', attack: 0.3 }); },
  day() { chord([N.C5, N.E5, N.G5, N.C6], { step: 0.08, dur: 0.4, type: 'triangle', vol: 0.12 }); },
  dawn() { tone(220, { dur: 1.2, vol: 0.12, attack: 0.4 }); tone(330, { at: 0.3, dur: 1.0, vol: 0.08, attack: 0.3 }); },
  birds() { [0, 0.25, 0.6].forEach((at, i) => tone(2600 + i * 200, { at, dur: 0.09, vol: 0.06, to: 3400 })); },
  drumroll() { for (let i = 0; i < 14; i++) tone(180, { at: i * 0.05, dur: 0.05, vol: 0.12 + i * 0.012, to: 120 }); thud(0.75, 90); },

  // 보석·코인·주사위 놓기·심기·건설
  gem() { tone(2637, { dur: 0.25, vol: 0.12 }); tone(3520, { at: 0.03, dur: 0.3, vol: 0.08 }); },
  gems3() { [2093, 2349, 2637].forEach((f, i) => { tone(f, { at: i * 0.09, dur: 0.22, vol: 0.1 }); tone(f * 1.5, { at: i * 0.09 + 0.02, dur: 0.2, vol: 0.05 }); }); },
  gems2() { [0, 0.12].forEach((at) => { tone(2637, { at, dur: 0.22, vol: 0.12 }); tone(3951, { at: at + 0.02, dur: 0.2, vol: 0.05 }); }); thud(0.26, 400); },
  gold() { coins(2); tone(3136, { at: 0.1, dur: 0.4, vol: 0.06 }); },
  buyCard() { noise({ dur: 0.07, vol: 0.2, freq: 2500, to: 900 }); for (let i = 0; i < 4; i++) noise({ at: 0.1 + i * 0.05, dur: 0.03, vol: 0.15, freq: 1700 + i * 300, q: 5 }); },
  trumpet() { melody([N.G4, N.C5, N.E5, N.G5], { gap: 0.13, dur: 0.16, type: 'sawtooth', vol: 0.06 }); tone(N.C6, { at: 0.55, dur: 0.6, type: 'sawtooth', vol: 0.06 }); },
  harp() { [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6].forEach((f, i) => tone(f, { at: i * 0.05, dur: 0.5, vol: 0.07 })); },
  chips() { for (let i = 0; i < 3; i++) noise({ at: i * 0.05, dur: 0.03, vol: 0.2, freq: 1700 + i * 300, q: 5 }); },
  bills() { for (let i = 0; i < 6; i++) noise({ at: i * 0.06, dur: 0.06, vol: 0.1, freq: 1800, to: 3500, q: 0.8 }); },
  receipt() { for (let i = 0; i < 6; i++) tone(1046.5 + i * 60, { at: i * 0.16, dur: 0.1, type: 'triangle', vol: 0.12 }); },
  tieWarn() { tone(880, { dur: 0.15, vol: 0.12, to: 600 }); tone(880, { at: 0.18, dur: 0.15, vol: 0.12, to: 600 }); },
  plant() { tone(320, { dur: 0.1, vol: 0.2, to: 640 }); noise({ dur: 0.06, vol: 0.08, freq: 600, type: 'lowpass' }); },
  knock() { thud(0, 320); thud(0.14, 320); },
  handshake() { noise({ dur: 0.05, vol: 0.3, freq: 1500, q: 1 }); noise({ at: 0.1, dur: 0.08, vol: 0.12, freq: 2500, to: 1200 }); noise({ at: 0.18, dur: 0.08, vol: 0.12, freq: 2500, to: 1200 }); },
  clock() { for (let i = 0; i < 6; i++) tone(i % 2 ? 1400 : 1700, { at: i * 0.25, dur: 0.03, type: 'square', vol: 0.05 }); },
  wonder() { chord([N.G4, N.C5, N.E5, N.G5], { step: 0.06, dur: 0.8, type: 'triangle', vol: 0.12 }); },
  stone() { tone(90, { dur: 0.3, vol: 0.45, to: 60 }); noise({ dur: 0.15, vol: 0.2, freq: 500 }); },
  door() { tone(70, { dur: 0.5, vol: 0.5, to: 40 }); noise({ dur: 0.2, vol: 0.3, freq: 300 }); },
  clash() { noise({ dur: 0.3, vol: 0.3, freq: 5000, q: 2 }); tone(2200, { dur: 0.4, vol: 0.08 }); coins(3, 0.3); },
  paper() { noise({ dur: 0.08, vol: 0.15, freq: 1800, to: 3500, q: 0.8 }); },
};

// 소리마다 크기를 맞추는 배율 (실제로 만들어 측정해서 최대 음량이 비슷해지게 맞춘 값)
const BOOST = {
  turn: 1.8, start: 2, win: 0.9, lose: 5.5, end: 2, tick: 6, coin: 8.2, pay: 9, heavyPay: 8, jackpot: 4, sparkle: 4, deflate: 8, warn: 7,
  alarm: 6, siren: 7, tense: 12, heartbeat: 1.2, bell: 3, gong: 2, fanfare: 6, again: 3, blipUp: 4, blipDown: 5, pop: 4, swoosh: 5,
  relief: 3, mystic: 4, discovery: 3, dice: 5.7, hop: 5.2, land: 5.7, whoosh: 3.7, island: 10.5, wave: 5, build: 1.1, double: 6.6,
  salary: 4, crumble: 1, countdown: 6, horn: 4, jet: 3, car: 4, birthday: 3, travel: 3, radio: 6, card: 6.6, draw: 9, drawMany: 7,
  shuffle: 9.3, flip: 6, uno: 5.6, skip: 14, buzzer: 6, reverse: 4, penalty: 7, penalty4: 6, hit: 6, pulse3: 6, colorR: 3, colorY: 3,
  colorG: 3, colorB: 3, bang: 2.8, bangSoft: 2.5, miss: 12.1, alert: 6, hurt: 14, heal: 2.5, saloon: 7, death: 1.7, gatling: 1.2, drum: 1,
  jail: 14, boom: 2.4, fuse: 6, whistle: 5, cock: 3, hooves: 1.5, barrel: 1.5, scope: 5, snatch: 5, crumple: 6, storeBell: 5, trombone: 5,
  flipGood: 3, flipBad: 3, vote: 5.3, seal: 6, crown: 4, reveal: 8, approve: 4, reject: 2.5, march: 1.3, success: 4.2, narrow: 4, fail: 8.8,
  clang: 4, stab: 2, night: 3.5, day: 3.2, dawn: 4, birds: 6, drumroll: 2, gem: 8.1, gems3: 5, gems2: 4, gold: 6, buyCard: 5, trumpet: 6,
  harp: 5, chips: 6.4, bills: 6, receipt: 4, tieWarn: 4, plant: 6, knock: 1.5, handshake: 4, clock: 7, wonder: 2.2, stone: 1.2, door: 1,
  clash: 3, paper: 6,
};

function sfx(name, vol = 1) {
  if (!sfxOn() || !SOUNDS[name]) return;
  if (name === 'turn') speakMyTurn();
  const c = sfxCtx();
  if (!c || c.state !== 'running') return;
  const now = performance.now();
  if (SFX.last[name] && now - SFX.last[name] < 60) return; // 같은 소리가 한꺼번에 겹치지 않게
  SFX.last[name] = now;
  // 이 소리만 따로 크기를 맞추는 통로를 잠깐 끼운다
  const bus = SFX.master;
  const g = c.createGain();
  g.gain.value = (BOOST[name] || 1) * vol;
  g.connect(bus);
  SFX.master = g;
  try { SOUNDS[name](); } catch (e) { console.error('sfx', e); } finally { SFX.master = bus; }
}

// ---- 내 차례에 내 닉네임 불러주기: "삼촌 차례!" ----
// 폰에 들어 있는 음성 읽기(speechSynthesis)를 쓰므로 받는 데이터가 없다. 내 폰에서만 말한다.
const voiceOn = () => { try { return localStorage.getItem('voice') !== 'off'; } catch { return true; } };
function setVoice(on) { try { localStorage.setItem('voice', on ? 'on' : 'off'); } catch { /* noop */ } }
const canSpeak = () => 'speechSynthesis' in window && typeof SpeechSynthesisUtterance === 'function';
let koVoice = null;
function pickVoice() {
  const vs = window.speechSynthesis.getVoices();
  const ko = vs.filter((v) => /^ko/i.test(v.lang));
  koVoice = ko.find((v) => /google|yuna|heami|sunhi|injoon|neural/i.test(v.name)) || ko[0] || null;
}
if (canSpeak()) {
  pickVoice();
  if (window.speechSynthesis.addEventListener) window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
}
let lastSpeak = 0;
function speak(text) {
  if (!canSpeak() || !sfxOn() || !voiceOn()) return;
  const now = Date.now();
  if (now - lastSpeak < 1500) return;
  lastSpeak = now;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR';
  if (koVoice) u.voice = koVoice;
  u.rate = 1.05;
  u.pitch = 1.1;
  u.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function myName() {
  const me = S && S.players && S.players.find((p) => p.id === S.me);
  return me ? String(me.name).replace(/[^\p{L}\p{N} ]/gu, '').trim() : '';
}
// 차례 알림 "띵-동"이 끝날 즈음 이름을 부른다
function speakMyTurn() {
  const name = myName();
  if (name) setTimeout(() => speak(`${name} 차례!`), 520);
}
// 아이폰은 처음 한 번은 터치 중에 말을 시켜야 그 뒤로도 말할 수 있다
let voiceUnlocked = false;
document.addEventListener('pointerdown', () => {
  if (voiceUnlocked || !canSpeak()) return;
  voiceUnlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}, { capture: true, passive: true });

// ---- 재생 계획: [[소리, 늦출 초, 크기], ...] ----
function sfxPlan(list) {
  (list || []).forEach(([name, at = 0, vol = 1]) => {
    if (at <= 0) sfx(name, vol);
    else setTimeout(() => sfx(name, vol), at * 1000);
  });
}
// 예전 방식 호환: 여러 소리를 조금씩 간격을 두고
function sfxSeq(names, gap = 0.22) {
  sfxPlan(names.map((n, i) => [n, i * gap]));
}

// ---- 상태 비교 도우미 ----

const logText = (l) => (typeof l === 'string' ? l : (l && l.text) || '');
// 새로 생긴 기록 줄만 골라낸다 (기록은 앞쪽이 잘려 나가며 뒤에 붙는다). 마피아처럼 {text} 객체여도 된다.
function newLogLines(prev, cur) {
  const a = ((prev && prev.log) || []).map(logText);
  const b = ((cur && cur.log) || []).map(logText);
  for (let s = 0; s <= a.length; s++) {
    const tail = a.slice(s);
    if (tail.length <= b.length && tail.every((x, j) => x === b[j])) return b.slice(tail.length);
  }
  return b;
}
const meOf = (S) => S.players && S.players.find((p) => p.id === S.me);
const pById = (S, id) => S.players && S.players.find((p) => p.id === id);
const nameStarts = (line, name) => !!name && line.startsWith(`${name}님`);

// 게임이 끝났을 때 내가 이겼는지 (모르면 null)
function iWon(S) {
  if (Array.isArray(S.winnerIds) && S.winnerIds.length) return S.winnerIds.includes(S.me);
  if (S.winnerId) return S.winnerId === S.me;
  const me = meOf(S);
  if (S.kind === 'avalon' && S.roleInfo && S.winner) return S.roleInfo.team === S.winner;
  if (S.kind === 'mafia' && me && me.role && S.winner) return (me.role === 'mafia' ? 'mafia' : 'citizen') === S.winner;
  if (S.kind === 'bang' && me && me.role && S.winner) {
    const side = { sheriff: 'law', deputy: 'law', outlaw: 'outlaw', renegade: 'renegade' }[me.role];
    return side === S.winner;
  }
  return null;
}
const endSound = (S) => { const w = iWon(S); return w === true ? 'win' : w === false ? 'lose' : 'end'; };

// 내 차례가 새로 왔는지 (모두에게 공개된 차례만. 마피아는 차례 소리가 없다)
function myTurnNow(S) {
  if (S.phase === 'over' || S.phase === 'lobby') return false;
  switch (S.kind) {
    case 'avalon': return S.phase === 'propose' && S.leaderId === S.me;
    case 'mafia': return false;
    case 'duel': return S.turnId === S.me || ['draft', 'chooseStart'].includes(S.mode);
    case 'bohnanza': return S.turnId === S.me || S.mode === 'plantAll';
    default: return S.turnId === S.me;
  }
}

// ---- 게임별 규칙: (prev, cur, out, ctx) → out.push([소리, 늦출 초, 크기]) ----
// ctx: { lines(새 기록 줄), mine(이 줄이 내 행동인지), over(이번에 끝났는지), my(이름) }
const SFX_GAME = {};
// 기록 줄 하나에 처음 맞는 규칙의 소리. 규칙: [정규식, 소리 | (match, line) => 소리|[소리...]]
function byLines(lines, table, out, opts = {}) {
  let t = 0;
  lines.forEach((line) => {
    const rule = table.find(([re]) => re.test(line));
    if (!rule) return;
    const r = typeof rule[1] === 'function' ? rule[1](line.match(rule[0]), line) : rule[1];
    [].concat(r || []).forEach((name) => {
      const mineLine = opts.my && nameStarts(line, opts.my);
      out.push([name, t, opts.soft && !mineLine ? 0.6 : 1]);
      t += 0.18;
    });
  });
  return t;
}

// 부루마블: 말 움직임이 있는 상태는 marble.js가 도착 뒤에 marbleAfter()로 낸다
const MARBLE_LINES = [
  [/님이 파산(했어요|을 선언했어요)/, 'crumble'],
  [/파산했어요!$/, 'crumble'],
  [/출발을 지나 월급 .*받았어요\.$/, 'salary'],
  [/우대권으로 .*면제받았어요!$/, 'sparkle'],
  [/통행료 .*을 내요\.$/, 'pay'],
  [/탑승료 .*을 .*내요\.$/, 'pay'],
  [/무인도에 (도착했어요|갇혔어요)/, 'island'],
  [/무인도에서 쉬어요/, 'wave'],
  [/(더블로 무인도를 탈출했어요|3턴을 쉬고 무인도에서 나왔어요)/, 'success'],
  [/무전기로 구조를 요청해/, 'radio'],
  [/모자라요\. 땅을 팔아 갚아야 해요\.$/, 'alarm'],
  [/호텔을\(를\) 지었어요/, 'fanfare'],
  [/을\(를\) 지었어요\./, 'build'],
  [/을\(를\) .*샀어요\.$/, 'coin'],
  [/을\(를\) .*팔았어요\.$/, 'pay'],
  [/사회복지기금 .*을 모두 받았어요!$/, 'jackpot'],
  [/사회복지기금 .*을 내요\.$/, 'pay'],
  [/우주여행 칸에 도착!/, 'countdown'],
  [/(돈이 모자라 살 수 없어요|사회복지기금이 비어 있어요)/, 'deflate'],
];
// 황금열쇠 카드 → 소리 (카드 내용은 모두에게 공개된다)
const MARBLE_KEY = {
  nobel: 'jackpot', lottery: 'jackpot', race: 'coin', scholar: 'coin', pension: 'coin', abroad: 'pay', hospital: 'pay', speeding: 'pay',
  incomeTax: 'heavyPay', repair: 'heavyPay', security: 'heavyPay', halfSale: 'deflate', escape: 'radio', escape2: 'radio', pass: 'sparkle',
  pass2: 'sparkle', jeju: 'travel', busan: 'travel', seoul: 'travel', world: 'whoosh', space: 'countdown', cruise: 'horn', flight: 'jet',
  highway: 'car', highway2: 'car', birthday: 'birthday',
};
function marbleKeyPlan(id) { return [['sparkle', 0], [MARBLE_KEY[id] || 'tick', 0.4]]; }
function marbleLines(prev, cur, out, at = 0) {
  const lines = newLogLines(prev, cur).filter((l) => !/^🔑/.test(l)); // 열쇠 카드 줄은 공개 순간에 따로
  const me = meOf(cur);
  const before = prev.players && pById(prev, cur.me);
  const t = byLines(lines, MARBLE_LINES, out, { my: me && me.name, soft: true });
  out.forEach((o) => { o[1] += at; });
  // 남의 통행료가 내 주머니로 들어오면 짤랑
  if (me && before && me.cash > before.cash && lines.some((l) => /통행료|탑승료/.test(l))) out.push(['coin', at + t + 0.1]);
  // 내가 파산하면 패배 멜로디 (남이 파산하면 와르르만)
  if (me && me.bankrupt && before && !before.bankrupt) out.push(['lose', at + t + 0.3]);
  if (cur.maxRounds && cur.round !== prev.round && cur.round === cur.maxRounds) out.push(['bell', at + t + 0.3]);
}
// marble.js가 말이 도착한 뒤 부른다: 도착 소리 → 결과 소리 → (끝났으면 승패) → 내 차례
function marbleAfter(before, cur, mv) {
  const out = [['land', 0]];
  if (cur.phase !== 'over') marbleLines(before, cur, out, 0.25);
  else out.push([endSound(cur), 0.9]);
  if (cur.phase !== 'over' && myTurnNow(cur)) {
    // 내가 방금 움직였으면 "내 차례"를 다시 알리지 않는다 (더블로 한 번 더 굴릴 때만 따로)
    const mine = mv && mv.who === cur.me;
    const again = mine && mv.dice && mv.dice[0] === mv.dice[1] && cur.mode === 'roll';
    if (again) out.push(['again', 0.9]);
    else if (!mine) out.push(['turn', 0.9]);
  }
  return out;
}
SFX_GAME.marble = (p, c, out) => {
  // 새 움직임이면 marble.js가 애니메이션에 맞춰 직접 낸다
  if (c.move && (!p.move || p.move.seq !== c.move.seq)) return 'handled';
  marbleLines(p, c, out);
  return null;
};

// 뱅!
const BANG_EQUIP = (m) => {
  const n = m[1];
  if (/볼캐닉|스코필드|레밍턴|카빈|윈체스터/.test(n)) return 'cock';
  if (/머스탱/.test(n)) return 'hooves';
  if (/배럴/.test(n)) return 'barrel';
  if (/스코프/.test(n)) return 'scope';
  if (/다이너마이트/.test(n)) return 'fuse';
  return 'card';
};
const BANG_LINES = [
  [/님 (배럴|감옥 탈출|다이너마이트): .* → (성공|실패)$/, (m) => (m[1] === '다이너마이트' ? 'flip' : m[2] === '성공' ? 'flipGood' : 'flipBad')],
  [/^💥 다이너마이트 폭발!$/, 'boom'],
  [/^다이너마이트가 .*님에게 넘어갔어요\.$/, 'fuse'],
  [/^💀 .*님 탈락! 정체는/, 'death'],
  [/^보안관이 부보안관을 쓰러뜨려/, 'trombone'],
  [/님이 무법자를 쓰러뜨려 카드 3장을/, 'coin'],
  [/님에게 뱅!$/, 'bang'],
  [/님이 개틀링!$/, 'gatling'],
  [/님이 인디언!$/, 'drum'],
  [/님에게 결투를 신청했어요!$/, 'whistle'],
  [/님이 막았어요!$/, 'miss'],
  [/님이 빗나감!을\(를\) 냈어요\.$/, 'miss'],
  [/님이 뱅!을\(를\) 냈어요\.$/, 'bangSoft'],
  [/체력 \d+을 잃었어요/, 'hurt'],
  [/살롱을 열었어요/, 'saloon'],
  [/(맥주를 마셨어요|체력을 회복했)/, 'heal'],
  [/님을 감옥에 가뒀어요\.$/, 'jail'],
  [/감옥에 갇혀 차례를 건너뛰어요\.$/, 'jail'],
  [/님이 (.+)을\(를\) 장착했어요\.$/, BANG_EQUIP],
  [/가져왔어요\.?$/, 'snatch'],
  [/버리게 했어요\.$/, 'crumple'],
  [/님이 잡화점을 열었어요\.$/, 'storeBell'],
  [/(잡화점에서 카드를 골랐어요|역마차로|웰스 파고로)/, 'draw'],
];
SFX_GAME.bang = (p, c, out, ctx) => {
  byLines(ctx.lines, BANG_LINES, out, { my: ctx.my, soft: true });
  const me = meOf(c);
  const mePrev = pById(p, c.me);
  if (!me || !me.alive) return null;
  // 내가 표적이 됨: 기록에 공개된 사실만 보고, 대응 카드가 있든 없든 똑같은 경고음
  const targeted = ctx.lines.some((l) => (l.includes(`${ctx.my}님에게 뱅!`) || l.includes(`${ctx.my}님에게 결투`))
    || ((/님이 (개틀링|인디언)!$/.test(l)) && !nameStarts(l, ctx.my)));
  if (targeted) out.push(['alert', 0.15]);
  // 내 체력이 1이 됨 (체력은 모두에게 보인다)
  if (mePrev && me.life === 1 && mePrev.life > 1) out.push(['heartbeat', 0.5]);
  return null;
};

// 우노
const UNO_LINES = [
  [/우노 안 외침을 잡았어요!/, ['siren', 'drawMany']],
  [/: 우노!$/, 'uno'],
  [/카드를 냈어요/, (m, l) => {
    const r = ['card'];
    if (/\+4/.test(l)) r.push('penalty4'); else if (/\+2/.test(l)) r.push('penalty');
    const col = (l.match(/\(색: (빨강|노랑|초록|파랑)\)/) || [])[1];
    if (col) r.push({ 빨강: 'colorR', 노랑: 'colorY', 초록: 'colorG', 파랑: 'colorB' }[col]);
    return r;
  }],
  [/장을 뽑고 차례를 건너뛰어요\.$/, 'drawMany'],
  [/님은 차례를 건너뛰어요\.$/, 'skip'],
  [/내지 않고 넘겼어요\.$/, 'swoosh'],
  [/(카드를 1장 뽑았어요|1장 뽑고 넘겼어요)\.$/, 'draw'],
];
SFX_GAME.uno = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, UNO_LINES, out, { my: ctx.my, soft: true });
  if (p.dir !== undefined && c.dir !== p.dir) out.push(['reverse', t]);
  // 내가 맞음: +2/+4로 뽑고 건너뜀, 또는 그냥 건너뜀 (기록에 공개)
  if (ctx.lines.some((l) => nameStarts(l, ctx.my) && /장을 뽑고 차례를 건너뛰어요\.$/.test(l))) out.push(['hit', t + 0.1]);
  else if (ctx.lines.some((l) => nameStarts(l, ctx.my) && /님은 차례를 건너뛰어요\.$/.test(l))) out.push(['buzzer', t + 0.1]);
  // 우노 고발 창: 1장 남았는데 외치지 않았음 (모두에게 공개된 정보)
  const w = c.unoWindow;
  const wp = p.unoWindow;
  if (w && !w.called && !(wp && wp.id === w.id && !wp.called)) out.push([w.id === c.me ? 'pulse3' : 'siren', t + 0.2, w.id === c.me ? 1 : 0.6]);
  return null;
};

// 아발론: 기록이 없어서 단계 변화로. 원정 카드·투표는 누가 무엇을 냈든 항상 같은 소리.
SFX_GAME.avalon = (p, c, out) => {
  const ph = c.phase;
  const was = p.phase;
  if (ph === 'roles' && was !== 'roles') out.push(['flip', 0], ['mystic', 0.2]);
  if (ph === 'propose' && was !== 'propose') out.push(['crown', 0]);
  if (ph === 'propose' && was === 'propose' && (c.draft || []).length !== (p.draft || []).length) out.push(['tick', 0, 0.7]);
  if (ph === 'vote' && was !== 'vote') {
    out.push(['vote', 0]);
    if (c.rejects === c.maxRejects - 1) out.push(['tense', 0.3]);
  }
  const votes = (s) => (s.players || []).filter((x) => x.voted).length;
  if (ph === 'vote' && was === 'vote' && votes(c) > votes(p)) out.push(['seal', 0]);
  if (ph === 'voteResult' && was !== 'voteResult' && c.lastVote) {
    out.push(['reveal', 0], [c.lastVote.approved ? 'approve' : 'reject', 0.95]);
    if (!c.lastVote.approved && c.rejects === c.maxRejects - 1) out.push(['siren', 1.5]);
  }
  if (ph === 'quest' && was !== 'quest') {
    out.push(['march', 0]);
    if ((c.failsNeeded || [])[c.round] > 1) out.push(['warn', 0.7]);
  }
  if (ph === 'quest' && was === 'quest' && (c.cardsIn || 0) > (p.cardsIn || 0)) out.push(['card', 0]);
  if (ph === 'questResult' && was !== 'questResult' && c.lastQuest) {
    const q = c.lastQuest;
    out.push(['reveal', 0]);
    for (let i = 0; i < Math.min(q.fails || 0, 3); i++) out.push(['clang', 1.0 + i * 0.25]);
    out.push([q.ok ? (q.fails ? 'narrow' : 'success') : 'fail', 1.7]);
  }
  if (ph === 'assassin' && was !== 'assassin') out.push(['tense', 0]);
  // 원정대원(공개)은 카드를 낼 차례
  if (ph === 'quest' && was !== 'quest' && (c.team || []).includes(c.me)) out.push(['turn', 1.0]);
  return null;
};
SFX_GAME.avalonOver = (p, c, out) => {
  if (p.phase === 'assassin') out.push(['stab', 0]);
  else if (c.reason === 'rejects') out.push(['bell', 0]);
  else if (c.reason === 'quests') out.push(['clang', 0]);
  else if (p.phase === 'questResult' || p.phase === 'quest') out.push(['reveal', 0]);
};

// 마피아: 밤에는 "밤이 됐어요" 소리 하나뿐. 밤 행동·조사 결과·마피아 채팅에는 절대 소리를 내지 않는다.
SFX_GAME.mafia = (p, c, out) => {
  const ph = c.phase;
  const was = p.phase;
  if (ph === 'roles' && was !== 'roles') out.push(['flip', 0], ['mystic', 0.2]);
  if (ph === 'night' && was !== 'night') out.push(['night', 0]);
  if (ph === 'day' && was === 'night') mafiaDawn(c, out);
  if (ph === 'vote' && was !== 'vote') out.push(['vote', 0]);
  const voted = (s) => (s.players || []).filter((x) => x.voted).length;
  if ((ph === 'vote' || ph === 'trial') && ph === was && voted(c) > voted(p)) out.push(['seal', 0, 0.7]);
  if (ph === 'trial' && was !== 'trial') out.push(['drumroll', 0], ['tense', 0.8, c.accusedId === c.me ? 1 : 0.6]);
  if (ph === 'voteResult' && was === 'vote' && c.lastVote && !c.lastVote.accused) out.push(['deflate', 0]);
  if (ph === 'voteResult' && was === 'trial' && c.lastVote) {
    if (c.lastVote.executed) out.push(['drumroll', 0], ['death', 0.85]);
    else out.push(['relief', 0]);
  }
  // 낮 채팅 (모두가 보는 채널만, 내가 보낸 건 빼고)
  const chatOk = ['day', 'vote', 'trial'].includes(ph);
  const pc = (p.chat || []).length;
  const cc = (c.chat || []).length;
  if (chatOk && cc > pc) {
    const last = c.chat[cc - 1];
    if (last && last.ch === 'all' && last.id !== c.me && Date.now() - (SFX.lastChat || 0) > 1500) {
      SFX.lastChat = Date.now();
      out.push(['pop', 0, 0.7]);
    }
  }
  return null;
};
function mafiaDawn(c, out) {
  const ln = c.lastNight;
  out.push(['dawn', 0]);
  if (ln && ln.victim) out.push(['death', 0.9, ln.victim === c.me ? 1 : 0.85]);
  else if (ln && ln.saved) out.push(['heal', 0.9]);
  else out.push(['birds', 0.9]);
}
SFX_GAME.mafiaOver = (p, c, out) => {
  if (p.phase === 'night') mafiaDawn(c, out);
  else if (p.phase === 'trial' && c.lastVote && c.lastVote.executed) out.push(['drumroll', 0], ['death', 0.85]);
};

// 라스베가스 (모든 정보가 공개)
const VEGAS_LINES = [
  [/^🎰 \d+라운드 시작!/, ['bills']],
  [/님이 굴렸어요: [\d ]+$/, (m, l) => {
    const ds = (l.match(/: ([\d ]+)$/) || [])[1].trim().split(/\s+/);
    const most = Math.max(...Object.values(ds.reduce((a, d) => { a[d] = (a[d] || 0) + 1; return a; }, {})));
    return most >= 4 ? ['dice', 'sparkle'] : ['dice'];
  }],
  [/번 카지노에 주사위 (\d+)개를 놓/, (m) => Array(Math.min(Number(m[1]) || 1, 4)).fill('chips')],
];
SFX_GAME.vegas = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, VEGAS_LINES, out, { my: ctx.my, soft: true });
  // 놓고 나니 같은 개수가 생겨 상쇄될 위기
  // 내 주사위가 낀 동점만 센다 (공개 정보)
  const ties = (s) => (s.casinos || []).reduce((n, cs) => { const d = cs.dice || {}; const mine = d[s.me] || 0; return n + (mine > 0 && Object.entries(d).some(([id, x]) => id !== s.me && x === mine) ? 1 : 0); }, 0);
  if (ties(c) > ties(p)) out.push(['tieWarn', t + 0.1, 0.8]);
  if (c.phase === 'roundEnd' && p.phase !== 'roundEnd') {
    out.push(['receipt', 0.1]);
    const won = (c.results || []).reduce((sum, r) => sum + (r.rows || []).filter((x) => x.id === c.me && x.bill).reduce((a, x) => a + x.bill, 0), 0);
    if (won >= 90) out.push(['jackpot', 1.2]);
    else if (won > 0) out.push(['coin', 1.2]);
  }
  // 혼자 남아 연달아 굴리는 차례 (turnId가 그대로라 공통 규칙이 못 잡는다)
  if (c.turnId === c.me && p.turnId === c.me && c.step === 'roll' && p.step === 'place') out.push(['turn', t + 0.4, 0.7]);
  return null;
};

// 스플렌더
const SPLENDOR_LINES = [
  [/찾아왔어요!/, 'trumpet'],
  [/점에 도달했어요!/, ['drumroll', 'alarm']],
  [/님이 보석을 가져왔어요: (.+)$/, (m) => { const g = m[1].split(/,\s*/); return g.length === 2 && g[0] === g[1] ? 'gems2' : 'gems3'; }],
  [/카드를 샀어요\.(\s*\(\+(\d)점\))?/, (m) => (Number(m[2]) >= 3 ? ['buyCard', 'fanfare'] : 'buyCard')],
  [/예약했어요\.$/, 'draw'],
  [/반납했어요\.$/, 'chips'],
  [/차례를 넘겼어요\.$/, 'skip'],
];
SFX_GAME.splendor = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, SPLENDOR_LINES, out, { my: ctx.my, soft: true });
  if (ctx.lines.some((l) => /예약했어요\.$/.test(l)) && c.bank && p.bank && c.bank.y < p.bank.y) out.push(['gold', t]);
  if (c.mode === 'discard' && p.mode !== 'discard') out.push(['warn', t + 0.2]);
  if (c.mode === 'noble' && p.mode !== 'noble') out.push(['harp', t + 0.2]);
  return null;
};

// 클루 (보여 준 카드가 무엇인지는 소리로 절대 구분하지 않는다: 누구에게 보여 줬는지는 모두 아는 정보)
const CLUE_LINES = [
  [/^🔍 .*님의 질문:/, ['paper', 'tick']],
  [/^🙅 .*보여 줄 카드가 없어요\.$/, 'deflate'],
  [/^🃏 .*카드 1장을 몰래 보여 줬어요\.$/, 'card'],
  [/^😮 아무도 카드를 보여 주지 못했어요!$/, 'mystic'],
  [/^❌ .*님의 고발: .* → 틀렸어요!/, ['drumroll', 'fail']],
  [/^💤 .*질문 없이 차례를 넘겼어요\.$/, 'skip'],
];
SFX_GAME.clue = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, CLUE_LINES, out, { my: ctx.my, soft: true });
  // 내가 카드를 보여 줄 차례 (보여 줄 사람은 모두 아는 정보)
  if (c.mode === 'respond' && p.mode !== 'respond') out.push(['knock', t + 0.2]);
  return null;
};
SFX_GAME.clueOver = (p, c, out) => { out.push(['drumroll', 0]); };

// 다빈치 코드 (뽑은 타일·놓는 시간처럼 나만 아는 정보로는 소리를 내지 않는다)
const DAVINCI_LINES = [
  [/^🔢 타일을 \d+개씩 나눠 가졌어요/, 'shuffle'],
  [/^🎯 .* — 맞았어요!/, 'flipGood'],
  [/^❌ .* — 틀렸어요\./, 'flipBad'],
  [/^✋ .*그만 맞히기로 했어요/, 'swoosh'],
  [/^📢 .*(공개해서 놓았어요|자기 타일 하나를 공개했어요)/, 'flip'],
  [/^🤫 .*숨겨서 놓았어요\./, 'tick'],
  [/^💀 .*탈락!$/, 'crumble'],
  [/타일을 1개 뽑았어요/, 'draw'],
];
SFX_GAME.davinci = (p, c, out, ctx) => { byLines(ctx.lines, DAVINCI_LINES, out, { my: ctx.my, soft: true }); return null; };
SFX_GAME.davinciOver = (p, c, out) => { out.push(['flipGood', 0]); };

// 더 크루 (협동. 손패 내용으로는 소리를 바꾸지 않고, 낸 카드·딴 트릭처럼 공개된 것만)
const CREW_LINES = [
  [/^🎉 임무 \d+ 성공!/, 'win'],
  [/^💥 임무 \d+ 실패/, 'lose'],
  [/^🚀 임무 \d+ /, 'whoosh'],
  [/^✅ 과제 완료/, 'success'],
  [/^🏆 .*트릭을 가져갔어요 \(로켓/, ['bang', 'chips']],
  [/^🏆 .*트릭을 가져갔어요/, 'chips'],
  [/^📡 .*님이 통신했어요/, 'radio'],
  [/^📡 사령관이 /, 'crown'],
  [/^🧑‍🚀 사령관이/, 'crown'],
  [/^📋 /, 'paper'],
  [/^🃏 .*님: /, 'card'],
];
SFX_GAME.crew = (p, c, out, ctx) => { byLines(ctx.lines, CREW_LINES, out, { my: ctx.my, soft: true }); return null; };
SFX_GAME.crewOver = (p, c, out) => { out.push(['fanfare', 0]); };

// 보난자 (손패 내용으로는 소리를 바꾸지 않는다)
const BOHN_LINES = [
  [/🤝 .*거래했어요/, 'handshake'],
  [/수확해 코인 (\d+)개를 받았어요/, (m) => (Number(m[1]) === 0 ? 'deflate' : Number(m[1]) >= 3 ? 'jackpot' : 'coin')],
  [/세 번째 밭을 샀어요/, ['pay', 'build']],
  [/버린 카드를 섞었어요/, 'shuffle'],
  [/카드 2장을 펼쳤어요/, ['flip', 'storeBell']],
  [/을\(를\) 심었어요\.$/, 'plant'],
];
SFX_GAME.bohnanza = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, BOHN_LINES, out, { my: ctx.my, soft: true });
  // 내가 차례인 사람: 새 거래 제안이 도착
  const props = (s) => (s.proposals || []).map((x) => x.from || x.id).filter(Boolean);
  if (c.turnId === c.me && c.mode === 'tradeA') {
    const before = new Set(props(p));
    if (props(c).some((f) => !before.has(f))) out.push(['knock', t]);
  }
  // 내 제안이 거래 없이 사라짐 (거절/자동 취소)
  if (c.step === 'trade' && p.step === 'trade' && props(p).includes(c.me) && !props(c).includes(c.me) && !ctx.lines.some((l) => /거래했어요/.test(l)) && !SFX.selfWithdraw) out.push(['deflate', t, 0.7]);
  // 마지막 덱이 거의 바닥
  if (c.deckRuns === c.maxRuns && c.deckCount <= 10 && p.deckCount > 10) out.push(['clock', t + 0.2]);
  if (ctx.lines.some((l) => /버린 카드를 섞었어요/.test(l)) && c.deckRuns === c.maxRuns) out.push(['clock', t + 0.4]);
  return null;
};

// 세븐 원더스 듀얼
const DUEL_LINES = [
  [/시대 시작!/, 'gong'],
  [/파괴됐어요/, 'boom'],
  [/군사 토큰!/, 'clash'],
  [/밀었어요\.$/, 'march'],
  [/불가사의 .*완성/, 'wonder'],
  [/더 지을 수 없어요\.$/, 'door'],
  [/진보 토큰 .*얻었어요/, 'sparkle'],
  [/을\(를\) 지었어요\./, 'build'],
  [/버리고 동전/, 'coin'],
  [/한 번 더 해요\.$/, 'again'],
];
SFX_GAME.duel = (p, c, out, ctx) => {
  const t = byLines(ctx.lines, DUEL_LINES, out, { my: ctx.my, soft: true });
  if (c.phase === 'draft' && p.draft && c.draft && c.draft.pool.length < p.draft.pool.length) out.push(['stone', 0]);
  if (c.phase === 'chooseStart' && p.phase !== 'chooseStart') out.push(['gong', 0]);
  // 군사 말이 내 쪽으로 밀려오면 낮은 북, 6칸을 넘으면 심장박동
  const me = (c.players || []).findIndex((x) => x.id === c.me);
  const side = me >= 0 ? c.players[me].shieldSide : 1;
  if (typeof c.military === 'number' && typeof p.military === 'number' && c.military !== p.military) {
    const towardMe = (c.military - p.military) * side < 0;
    if (towardMe) out.push(['drum', t, 0.8]);
    if (Math.abs(c.military) >= 6 && Math.abs(p.military) < 6) out.push(['heartbeat', t + 0.4]);
  }
  // 과학 기호 5개 (승리 직전)
  (c.players || []).forEach((x, i) => { const y = (p.players || [])[i]; if (y && x.sci.length >= 5 && y.sci.length < 5) out.push(['mystic', t + 0.3]); });
  // 진보 토큰을 고를 차례 (내 폰)
  if (c.pend && c.pend.playerId === c.me && (!p.pend || p.pend.type !== c.pend.type) && ['token', 'library'].includes(c.pend.type)) out.push(['discovery', t + 0.2]);
  if (c.pend && c.pend.type === 'destroy' && c.pend.playerId !== c.me && (!p.pend || p.pend.type !== 'destroy')) out.push(['tense', t + 0.2, 0.7]);
  // 동전이 크게 늘거나 줄면 (공개)
  const mine = me >= 0 ? c.players[me] : null;
  const was = me >= 0 && p.players ? p.players[me] : null;
  if (mine && was) {
    if (mine.coins - was.coins >= 6) out.push(['jackpot', t + 0.2]);
    else if (was.coins - mine.coins >= 3 && !ctx.lines.some((l) => /군사 토큰/.test(l))) out.push(['pay', t + 0.2]);
  }
  // 가려졌던 카드가 뒤집힘 (같은 시대 안에서)
  const ups = (s) => (s.slots || []).filter((x) => x.up && !x.taken).length;
  if (c.age === p.age && c.slots && p.slots && c.slots.some((x, i) => x.up && p.slots[i] && !p.slots[i].up)) out.push(['paper', t + 0.15, 0.7]);
  void ups;
  return null;
};
SFX_GAME.duelOver = (p, c, out) => {
  if (c.reason === 'military') out.push(['boom', 0]);
  else if (c.reason === 'science') out.push(['discovery', 0]);
};

// ---- 새 상태가 올 때 ----
function sfxOnState(prev, cur) {
  const now = Date.now();
  const gap = now - SFX.lastStateAt;
  SFX.lastStateAt = now;
  if (!cur || cur.kind === undefined || !prev || prev.kind !== cur.kind || prev.code !== cur.code) return;
  if (cur.phase === 'lobby') return;
  if (document.hidden) return; // 화면이 꺼져 있으면 조용히
  const out = [];
  const my = meOf(cur) && meOf(cur).name;
  const startTurn = () => { if (myTurnNow(cur)) out.push(['turn', 0.8]); };

  // 새 판 시작 (대기실에서 시작 / 같은 멤버로 다시 하기)
  if (prev.phase === 'lobby' || prev.gameNo !== cur.gameNo) {
    if (prev.gameNo !== cur.gameNo && prev.phase !== 'lobby') out.push(['shuffle', 0]);
    out.push(['start', prev.phase === 'lobby' ? 0 : 0.35]);
    startTurn();
    sfxPlan(out);
    return;
  }
  const lines = newLogLines(prev, cur);
  // 오래 끊겼다가 한꺼번에 밀려온 기록이면(재접속) 소리를 몰아서 내지 않는다
  const catchUp = lines.length > 6 || (gap > 15000 && lines.length > 3);
  const ctx = { lines: catchUp ? [] : lines, my };

  // 게임 끝: 마지막 장면 소리 → 0.9초 뒤 승패
  if (cur.phase === 'over' && prev.phase !== 'over') {
    if (cur.kind === 'marble' && SFX_GAME.marble(prev, cur, [], ctx) === 'handled') return; // 말이 도착한 뒤 marble.js가 낸다
    const over = SFX_GAME[`${cur.kind}Over`];
    if (over) over(prev, cur, out, ctx);
    else if (SFX_GAME[cur.kind] && !catchUp) SFX_GAME[cur.kind](prev, cur, out, ctx);
    const last = out.reduce((m, o) => Math.max(m, o[1] || 0), 0);
    sfxPlan(out.slice(0, 5).concat([[endSound(cur), out.length ? last + 0.9 : 0]]));
    return;
  }

  const rule = SFX_GAME[cur.kind];
  if (rule && rule(prev, cur, out, ctx) === 'handled') return;
  // 접속이 끊기거나 돌아온 사람
  (cur.players || []).forEach((x) => {
    const y = pById(prev, x.id);
    if (y && x.id !== cur.me && y.connected !== x.connected) out.push([x.connected ? 'blipUp' : 'blipDown', 0, 0.6]);
  });
  // 결과 소리는 최대 5개까지, 내 차례 알림은 잘리지 않게 따로
  const main = out.filter((o) => o[0] !== 'turn').slice(0, 5);
  const turnItem = out.find((o) => o[0] === 'turn');
  if (turnItem) main.push(turnItem);
  else if (myTurnNow(cur) && !myTurnNow(prev)) {
    const last = main.reduce((m, o) => Math.max(m, o[1] || 0), 0);
    main.push(['turn', main.length ? last + 0.35 : 0]);
  }
  sfxPlan(main);
}

// 맨 위 줄에 넣는 소리 켜기/끄기 버튼
function sfxButtonHtml() {
  const on = sfxOn();
  return `<button class="sfx-btn" data-act="sfxToggle" aria-label="효과음 ${on ? '끄기' : '켜기'}" title="효과음 ${on ? '끄기' : '켜기'}">${on ? '🔊' : '🔇'}</button>`;
}
function sfxClick(act) {
  if (act === 'voiceToggle') {
    const on = !voiceOn();
    setVoice(on);
    if (on) { voiceUnlocked = true; lastSpeak = 0; speak(`${myName() || '나'} 차례!`); }
    showToast(on ? '내 차례가 오면 닉네임을 불러 줄게요 🗣️' : '닉네임 불러주기를 껐어요');
    return true;
  }
  // 보난자: 내가 직접 제안을 거둔 건 "거절" 소리를 내지 않게 표시
  if (act === 'bzWithdraw') { SFX.selfWithdraw = true; setTimeout(() => { SFX.selfWithdraw = false; }, 2500); return false; }
  if (act !== 'sfxToggle') return false;
  const on = !sfxOn();
  setSfx(on);
  if (on) { sfxCtx(); if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume(); setTimeout(() => sfx('coin'), 50); }
  showToast(on ? '효과음을 켰어요 🔊' : '효과음을 껐어요 🔇');
  return true;
}
