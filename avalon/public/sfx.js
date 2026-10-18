'use strict';
// 효과음: 소리 파일 없이 브라우저(Web Audio)로 그 자리에서 만들어 낸다. 내려받는 데이터가 0이라 사이트가 가볍다.
//
//   sfx('dice') 처럼 부르면 소리가 난다. 켜기/끄기는 기기마다 저장(localStorage 'sfx' = 'off').
//   폰은 사용자가 화면을 한 번 눌러야 소리를 낼 수 있어서, 첫 터치 때 오디오를 깨운다.
//   새 상태가 오면 sfxOnState(prev, S)가 게임별 규칙(SFX_RULES)으로 어떤 소리를 낼지 정한다.

const SFX = { ctx: null, master: null, noiseBuf: null, last: {} };

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

// ---- 소리 목록 ----
const SOUNDS = {
  // 공통
  turn() { tone(880, { dur: 0.25, type: 'triangle', vol: 0.25 }); tone(1318.5, { at: 0.12, dur: 0.4, type: 'triangle', vol: 0.25 }); },
  start() { chord([523.3, 659.3, 784, 1046.5], { step: 0.09, dur: 0.3, type: 'triangle', vol: 0.2 }); },
  win() { chord([523.3, 659.3, 784], { step: 0.12, dur: 0.25, type: 'square', vol: 0.09 }); chord([1046.5, 1318.5, 1568], { at: 0.4, dur: 0.7, type: 'triangle', vol: 0.18 }); noise({ at: 0.4, dur: 0.6, vol: 0.06, freq: 6000, type: 'highpass' }); },
  lose() { [392, 370, 349.2, 329.6].forEach((f, i) => tone(f, { at: i * 0.28, dur: i === 3 ? 0.7 : 0.25, type: 'sawtooth', vol: 0.08, to: i === 3 ? 300 : null })); },
  end() { chord([659.3, 784, 1046.5], { step: 0.1, dur: 0.5, type: 'triangle', vol: 0.18 }); },
  tap() { tone(1200, { dur: 0.04, vol: 0.08 }); },
  coin() { tone(1318.5, { dur: 0.08, type: 'square', vol: 0.07 }); tone(1975.5, { at: 0.07, dur: 0.3, type: 'square', vol: 0.07 }); },
  pay() { tone(988, { dur: 0.08, type: 'square', vol: 0.06 }); tone(740, { at: 0.08, dur: 0.22, type: 'square', vol: 0.06 }); },
  sparkle() { [1568, 2093, 2637, 3136].forEach((f, i) => tone(f, { at: i * 0.06, dur: 0.25, vol: 0.09 })); },
  bad() { tone(220, { dur: 0.35, type: 'sawtooth', vol: 0.09, to: 160 }); },

  // 주사위·말
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
  build() { [0, 0.16].forEach((at) => { tone(130, { at, dur: 0.1, vol: 0.35, to: 70 }); noise({ at, dur: 0.05, vol: 0.2, freq: 1500, q: 1 }); }); tone(1046.5, { at: 0.36, dur: 0.25, type: 'triangle', vol: 0.12 }); },
  double() { chord([784, 988, 1175, 1568], { step: 0.07, dur: 0.18, type: 'square', vol: 0.06 }); },

  // 카드
  card() { noise({ dur: 0.07, vol: 0.22, freq: 2500, to: 900, q: 0.8 }); tone(180, { at: 0.04, dur: 0.05, vol: 0.12 }); },
  draw() { noise({ dur: 0.12, vol: 0.12, freq: 1200, to: 3500, q: 0.7, attack: 0.03 }); },
  shuffle() { for (let i = 0; i < 8; i++) noise({ at: i * 0.04, dur: 0.03, vol: 0.1, freq: 3000, q: 2 }); },
  uno() { tone(659.3, { dur: 0.12, type: 'square', vol: 0.08 }); tone(987.8, { at: 0.12, dur: 0.3, type: 'square', vol: 0.08 }); },
  skip() { tone(1400, { dur: 0.18, type: 'triangle', vol: 0.1, to: 500 }); },

  // 뱅!
  bang() { noise({ dur: 0.35, vol: 0.6, freq: 7000, to: 300, type: 'lowpass', q: 0.5, attack: 0.001 }); tone(140, { dur: 0.3, vol: 0.5, to: 40, attack: 0.001 }); },
  miss() { tone(2600, { dur: 0.4, vol: 0.12, to: 700 }); noise({ dur: 0.05, vol: 0.15, freq: 4000, q: 3 }); },
  hurt() { tone(200, { dur: 0.25, type: 'square', vol: 0.12, to: 90 }); },
  heal() { [0, 0.12, 0.24].forEach((at, i) => tone(300 + i * 90, { at, dur: 0.1, vol: 0.18, to: 380 + i * 90 })); },
  death() { tone(110, { dur: 1.4, vol: 0.3 }); tone(164.8, { dur: 1.2, vol: 0.15 }); tone(98, { at: 0.05, dur: 1.5, type: 'triangle', vol: 0.12 }); },
  gatling() { for (let i = 0; i < 6; i++) { noise({ at: i * 0.09, dur: 0.12, vol: 0.35, freq: 5000, to: 400, type: 'lowpass' }); tone(120, { at: i * 0.09, dur: 0.1, vol: 0.25, to: 50 }); } },
  drum() { for (let i = 0; i < 4; i++) tone(i % 2 ? 140 : 100, { at: i * 0.16, dur: 0.15, vol: 0.4, to: 60 }); },
  jail() { noise({ dur: 0.15, vol: 0.25, freq: 800, q: 6 }); tone(196, { at: 0.02, dur: 0.4, type: 'square', vol: 0.06 }); },
  boom() { noise({ dur: 1.0, vol: 0.6, freq: 1800, to: 80, type: 'lowpass', attack: 0.001 }); tone(70, { dur: 0.9, vol: 0.5, to: 30 }); },

  // 아발론·마피아
  vote() { tone(160, { dur: 0.12, vol: 0.35, to: 90 }); noise({ dur: 0.06, vol: 0.15, freq: 900 }); },
  success() { chord([523.3, 659.3, 784, 1046.5], { dur: 0.6, type: 'triangle', vol: 0.12 }); },
  fail() { chord([233.1, 246.9, 349.2], { dur: 0.8, type: 'sawtooth', vol: 0.06 }); },
  night() { tone(392, { dur: 0.5, type: 'triangle', vol: 0.12 }); tone(329.6, { at: 0.35, dur: 0.9, type: 'triangle', vol: 0.12 }); noise({ dur: 1.2, vol: 0.04, freq: 400, type: 'lowpass', attack: 0.3 }); },
  day() { chord([523.3, 659.3, 784, 1046.5], { step: 0.08, dur: 0.4, type: 'triangle', vol: 0.12 }); },
  tense() { tone(110, { dur: 1.0, type: 'sawtooth', vol: 0.06 }); tone(116.5, { dur: 1.0, type: 'sawtooth', vol: 0.06 }); },

  // 보석·코인·주사위 놓기·심기
  gem() { tone(2637, { dur: 0.25, vol: 0.12 }); tone(3520, { at: 0.03, dur: 0.3, vol: 0.08 }); },
  chips() { for (let i = 0; i < 3; i++) noise({ at: i * 0.05, dur: 0.03, vol: 0.2, freq: 1700 + i * 300, q: 5 }); },
  plant() { tone(320, { dur: 0.1, vol: 0.2, to: 640 }); noise({ dur: 0.06, vol: 0.08, freq: 600, type: 'lowpass' }); },
  wonder() { chord([392, 523.3, 659.3, 784], { step: 0.06, dur: 0.8, type: 'triangle', vol: 0.12 }); },
};

// 소리마다 크기를 맞추는 배율 (실제로 만들어 측정해서 최대 음량이 비슷해지게 맞춘 값)
const BOOST = {
  turn: 1.8, start: 2, win: 0.9, lose: 5.5, end: 2, tap: 10.9, coin: 8.2, pay: 9, sparkle: 4, bad: 14, dice: 5.7, hop: 5.2, land: 5.7,
  whoosh: 3.7, island: 10.5, build: 1.1, double: 6.6, card: 6.6, draw: 9, shuffle: 9.3, uno: 5.6, skip: 14, bang: 2.8, miss: 12.1,
  hurt: 14, heal: 2.5, death: 1.7, gatling: 1.2, drum: 1, jail: 14, boom: 2.4, vote: 5.3, success: 4.2, fail: 8.8, night: 3.5,
  day: 3.2, tense: 12, gem: 8.1, chips: 6.4, plant: 6, wonder: 2.2,
};

function sfx(name) {
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
  g.gain.value = BOOST[name] || 1;
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

// 여러 소리를 조금씩 간격을 두고
function sfxSeq(names, gap = 0.22) {
  names.forEach((n, i) => setTimeout(() => sfx(n), i * gap * 1000));
}

// ---- 상태가 바뀔 때 어떤 소리를 낼지 ----

// 새로 생긴 기록 줄만 골라낸다 (기록은 앞쪽이 잘려 나가며 뒤에 붙는다)
function newLogLines(prev, cur) {
  const a = (prev && prev.log) || [];
  const b = (cur && cur.log) || [];
  for (let s = 0; s <= a.length; s++) {
    const tail = a.slice(s);
    if (tail.length <= b.length && tail.every((x, j) => x === b[j])) return b.slice(tail.length);
  }
  return b;
}
// 기록 줄 → 소리: [[정규식, 소리], ...] 중 처음 맞는 것
function soundsFromLines(lines, table) {
  const out = [];
  lines.forEach((l) => {
    const hit = table.find(([re]) => re.test(l));
    if (hit && hit[1] && !out.includes(hit[1])) out.push(hit[1]);
  });
  return out;
}

const meOf = (S) => S.players && S.players.find((p) => p.id === S.me);

// 게임이 끝났을 때 내가 이겼는지 (모르면 null)
function iWon(S) {
  if (Array.isArray(S.winnerIds) && S.winnerIds.length) return S.winnerIds.includes(S.me);
  const me = meOf(S);
  if (S.kind === 'avalon' && S.roleInfo && S.winner) return S.roleInfo.team === S.winner;
  if (S.kind === 'mafia' && me && me.role && S.winner) return (me.role === 'mafia' ? 'mafia' : 'citizen') === S.winner;
  if (S.kind === 'bang' && me && me.role && S.winner) {
    const side = { sheriff: 'law', deputy: 'law', outlaw: 'outlaw', renegade: 'renegade' }[me.role];
    return side === S.winner;
  }
  return null;
}

window.SFX_RULES = window.SFX_RULES || {};
const LOG_SOUNDS = {
  uno: [[/우노!/, 'uno'], [/이겼어요/, null], [/\+4|\+2|뽑고 차례를 건너/, 'draw'], [/건너뛰어요|방향/, 'skip'], [/카드를 냈어요/, 'card'], [/뽑았어요|뽑고 넘겼어요/, 'draw']],
  bang: [[/개틀링/, 'gatling'], [/인디언/, 'drum'], [/다이너마이트.*(터|폭발)/, 'boom'], [/탈락/, 'death'], [/에게 뱅!|결투/, 'bang'], [/막았어요|빗나/, 'miss'], [/체력 \d+을 잃었어요|잃었어요/, 'hurt'], [/맥주|살롱|회복/, 'heal'], [/감옥/, 'jail'], [/장착/, 'build'], [/잡화점|역마차|웰스 파고|뽑았어요|가져왔/, 'draw'], [/냈어요/, 'card']],
  mafia: [[/밤이 되었어요/, 'night'], [/낮이 밝았어요/, 'day'], [/살해|처형됐어/, 'death'], [/의사가/, 'heal'], [/처형 후보/, 'tense'], [/처형되지/, 'miss']],
  splendor: [[/귀족/, 'win'], [/점에 도달/, 'double'], [/보석을 가져왔어요/, 'gem'], [/예약/, 'draw'], [/카드를 샀|단계 .* 카드/, 'coin'], [/반납/, 'chips']],
  bohnanza: [[/수확/, 'coin'], [/세 번째 밭/, 'build'], [/거래했어요/, 'coin'], [/펼쳤어요/, 'draw'], [/심었어요/, 'plant'], [/섞었어요/, 'shuffle']],
  vegas: [[/라운드 끝/, 'coin'], [/라운드 시작/, 'start'], [/굴렸어요/, 'dice'], [/카지노에 주사위/, 'chips']],
  duel: [[/승리!/, null], [/파괴/, 'boom'], [/군사 토큰|밀었어요/, 'drum'], [/불가사의 .*완성/, 'wonder'], [/진보 토큰/, 'sparkle'], [/지었어요/, 'build'], [/버리고 동전/, 'coin'], [/시대 시작/, 'start'], [/한 번 더/, 'double']],
  marble: [[/파산/, 'lose'], [/무인도에 (도착|갇혔)/, 'island'], [/우주여행 칸에 도착/, 'whoosh'], [/우대권/, 'sparkle'], [/통행료/, 'pay'], [/사회복지기금 .*받았어요/, 'coin'], [/샀어요/, 'coin'], [/지었어요/, 'build'], [/무인도.*나왔어요|탈출/, 'success'], [/팔았어요/, 'pay']],
};

function sfxOnState(prev, cur) {
  if (!cur || cur.kind === undefined || !prev || prev.kind !== cur.kind || prev.code !== cur.code) return;
  if (cur.phase === 'lobby') return;
  if (prev.phase === 'lobby') { sfx('start'); return; }
  if (cur.phase === 'over' && prev.phase !== 'over') {
    const w = iWon(cur);
    sfx(w === true ? 'win' : w === false ? 'lose' : 'end');
    return;
  }
  if (prev.gameNo !== cur.gameNo) return;
  const custom = SFX_RULES[cur.kind];
  if (custom && custom(prev, cur) === true) return; // 게임 파일이 직접 처리했다
  const sounds = soundsFromLines(newLogLines(prev, cur), LOG_SOUNDS[cur.kind] || []);
  // 아발론은 기록이 없어서 단계 변화로
  if (cur.kind === 'avalon') {
    const r0 = (prev.results || []).length;
    const r1 = (cur.results || []).length;
    if (r1 > r0) sounds.push(cur.results[r1 - 1].ok ? 'success' : 'fail');
    else if (cur.phase === 'vote' && prev.phase !== 'vote') sounds.push('vote');
    else if (cur.phase === 'assassin' && prev.phase !== 'assassin') sounds.push('tense');
  }
  const myTurn = (S) => (S.kind === 'avalon' ? S.phase === 'propose' && S.leaderId === S.me : S.turnId === S.me);
  if (myTurn(cur) && !myTurn(prev)) sounds.push('turn');
  sfxSeq(sounds.slice(0, 3));
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
  if (act !== 'sfxToggle') return false;
  const on = !sfxOn();
  setSfx(on);
  if (on) { sfxCtx(); if (SFX.ctx && SFX.ctx.state === 'suspended') SFX.ctx.resume(); setTimeout(() => sfx('coin'), 50); }
  showToast(on ? '효과음을 켰어요 🔊' : '효과음을 껐어요 🔇');
  return true;
}
