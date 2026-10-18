'use strict';
// 부루마블 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
//
// 보드: 원판처럼 11×11 격자에 40칸(출발이 오른쪽 아래, 무인도 왼쪽 아래, 사회복지기금 왼쪽 위, 우주여행 오른쪽 위).
// 움직임: 서버가 보내 주는 move(주사위와 이동 경로)를 시간에 따라 재생한다. 주사위가 3D로 굴러간 뒤
// 말이 한 칸씩 뛰어간다. 화면을 다시 그려도 "움직임이 시작된 뒤 지난 시간"으로 위치를 계산하므로 끊기지 않는다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>부루마블 규칙 간단 설명</summary>
<p><b>2~6명</b> · 원판 부루마불과 같은 40칸 보드예요. 주사위 2개를 굴려 세계를 돌며 땅을 사고 건물을 지어 통행료를 받아요.</p>
<ul>
<li>3명 이상은 <b>293만원</b>, 2명은 <b>586만원</b>으로 시작해요. 출발을 지나면 월급 <b>20만원</b>.</li>
<li>빈 땅에 도착하면 <b>구입</b>할 수 있어요. 내 도시에 다시 도착하면 <b>별장 1채 → 별장 2채 → 빌딩 → 호텔</b> 순서로 하나씩 지을 수 있어요.</li>
<li>남의 땅에 도착하면 땅 카드에 적힌 <b>통행료</b>를 내요. <b>제주도·부산·서울</b>과 <b>탈것</b>(콩코드·퀸 엘리자베스호·컬럼비아호)은 건물을 못 짓고 통행료가 정해져 있어요.</li>
<li><b>더블</b>이면 한 번 더 굴려요. 3번 연속 더블이면 무인도로 가요.</li>
<li><b>무인도</b>에서는 3턴을 쉬어요. 더블이 나오거나 <b>무전기</b> 카드가 있으면 바로 나와요.</li>
<li><b>사회복지기금 접수처</b>에서 15만원을 내고, <b>수령처</b>에 도착한 사람이 모인 기금을 모두 가져가요.</li>
<li><b>우주여행</b> 칸에 도착하면 다음 차례에 원하는 칸으로 날아가요. 컬럼비아호 주인이 따로 있으면 탑승료 20만원을 내요.</li>
<li><b>황금열쇠</b> 30장: 상금, 세금, 건물 수리비, 여행, 무전기, 우대권(통행료 1번 면제) 등.</li>
<li>돈이 모자라면 땅을 팔아(들인 돈의 절반) 갚고, 못 갚으면 <b>파산</b>. 한 명만 남거나 정한 바퀴 수가 지나면 자산(현금+땅·건물)이 가장 많은 사람이 이겨요.</li>
</ul></details>`;

  // ---- 보드 모양 ----
  const N = 40;
  const CORNER = 1.55; // 모서리 칸은 일반 칸의 1.55배
  const SPAN = 9 + 2 * CORNER; // 보드 한 변 = 12.1칸
  const PCT = 100 / SPAN;

  const BAND = {};
  [[[1, 3, 4], '#e5484d'], [[6, 8, 9], '#f2994a'], [[11, 13, 14], '#f2c230'], [[16, 18, 19], '#5cbf4a'],
    [[21, 23, 24], '#22b5a0'], [[26, 27, 29], '#3b82f6'], [[31, 33, 34], '#8b5cf6'], [[36, 37], '#d9468f']]
    .forEach(([list, c]) => list.forEach((i) => { BAND[i] = c; }));
  const KOREA_BAND = 'linear-gradient(90deg,#d62d3a 0 50%,#1f4fa8 50% 100%)';
  const RIDE_BAND = '#3b4a5e';
  const LABEL = {
    부에노스아이레스: '부에노스<br>아이레스', '콩코드 여객기': '콩코드<br>여객기', '퀸 엘리자베스호': '퀸엘리<br>자베스호',
    컬럼비아호: '컬럼비아호', 황금열쇠: '황금<br>열쇠', '사회복지기금 접수처': '복지기금<br>접수처',
  };
  // 왼쪽·오른쪽 줄은 칸이 낮아서 한 줄 이름을 쓴다
  const SIDE_LABEL = { '콩코드 여객기': '콩코드', 컬럼비아호: '컬럼비아', 황금열쇠: '황금열쇠', '사회복지기금 접수처': '복지기금' };
  const ICON = { 제주도: '🍊', 부산: '🌉', 서울: '🏯', '콩코드 여객기': '✈️', '퀸 엘리자베스호': '🛳️', 컬럼비아호: '🚀' };
  const LEVEL_NAME = ['땅', '별장 1채', '별장 2채', '빌딩', '호텔'];
  const LEVEL_MARK = ['', '🏠', '🏠🏠', '🏢', '🏨'];
  const OWN_TYPES = new Set(['city', 'special', 'ride']);
  const PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };

  // 칸 번호 → [행, 열] (1부터)
  function cell(i) {
    if (i === 0) return [11, 11];
    if (i < 10) return [11, 11 - i];
    if (i === 10) return [11, 1];
    if (i < 20) return [11 - (i - 10), 1];
    if (i === 20) return [1, 1];
    if (i < 30) return [1, 1 + (i - 20)];
    if (i === 30) return [1, 11];
    return [1 + (i - 30), 11];
  }
  const side = (i) => (i % 10 === 0 ? 'c' : i < 10 ? 'b' : i < 20 ? 'l' : i < 30 ? 't' : 'r');
  // 격자 줄 번호 → 칸 단위 중심 좌표
  const axis = (k) => (k === 1 ? CORNER / 2 : k === 11 ? SPAN - CORNER / 2 : CORNER + (k - 2) + 0.5);
  const center = (i) => { const [r, c] = cell(i); return [axis(c), axis(r)]; };

  // ---- 공통 도우미 ----
  const st = () => (ui.mb = ui.mb || { info: null, warp: null });
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const me = () => player(S.me);
  // 돈(천원 단위) → "1만2천"
  function won(k) {
    const a = Math.abs(k);
    const man = Math.floor(a / 10);
    const ch = a % 10;
    const s = a === 0 ? '0' : man && ch ? `${man}만${ch}천` : man ? `${man}만` : `${ch}천`;
    return (k < 0 ? '-' : '') + s;
  }
  const pawnSvg = (color) => `<svg viewBox="0 0 24 30" aria-hidden="true"><ellipse cx="12" cy="27.2" rx="8.5" ry="2.4" fill="#0006"/><path d="M12 2.4a5.3 5.3 0 0 1 3.3 9.4c1.9 1.2 2.7 3 2.7 4.7h-2.2l2.7 7.6c.4 1.1-.3 2.1-1.5 2.1H7c-1.2 0-1.9-1-1.5-2.1l2.7-7.6H6c0-1.7.8-3.5 2.7-4.7A5.3 5.3 0 0 1 12 2.4z" fill="${color}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><ellipse cx="10" cy="6.4" rx="1.7" ry="1.2" fill="#fff9"/></svg>`;

  // ---- 움직임 재생 ----
  const DICE_MS = 1150;
  const STEP_MS = 230;
  const FAST_MS = 75;
  const PAUSE_MS = 420;
  const FLY_MS = 1300;
  const JUMP_MS = 750;
  const A = { inited: false, seq: null, t0: 0, plan: null, keyShown: false, prevCash: {}, prevLog: [], last: null, delta: {}, deltaAt: 0 };
  let raf = 0;

  function planOf(mv) {
    let t = mv.dice ? DICE_MS : 250;
    const frames = [];
    let firstEnd = t;
    mv.segs.forEach((s, k) => {
      if (k) t += PAUSE_MS;
      if (s.k === 'walk') {
        const dir = Math.sign(s.n);
        const n = Math.abs(s.n);
        const ms = n > 14 ? FAST_MS : STEP_MS;
        let pos = s.from;
        for (let j = 0; j < n; j++) {
          const next = (pos + dir + N) % N;
          frames.push({ t0: t, t1: t + ms, from: pos, to: next, kind: 'hop' });
          t += ms;
          pos = next;
        }
      } else {
        const ms = s.k === 'fly' ? FLY_MS : JUMP_MS;
        frames.push({ t0: t, t1: t + ms, from: s.from, to: s.to, kind: s.k });
        t += ms;
      }
      if (k === 0) firstEnd = t;
    });
    return { frames, firstEnd, diceEnd: mv.dice ? DICE_MS : 0, total: t + 200 };
  }
  const elapsed = () => performance.now() - A.t0;
  const animating = () => !!(A.plan && elapsed() < A.plan.total);
  // 움직이는 동안은 움직이는 사람을 '차례'로 보여 준다 (서버는 이미 다음 사람으로 넘겼을 수 있어요)
  const shownTurn = () => (animating() && A.moveWho ? A.moveWho : S.turnId);
  // 한 번만 도는 CSS 효과(열쇠 카드 뒤집기, 더블!)가 다시 그릴 때마다 처음부터 돌지 않게 지난 시간만큼 당겨 둔다
  const sinceMs = (t) => `-${t ? Math.round(performance.now() - t) : 99999}ms`;

  // 움직이는 말의 지금 위치: [x, y(칸 단위), 들림 높이, 크기]
  function moverAt(e) {
    const f = A.plan.frames;
    if (!f.length) return null;
    if (e <= f[0].t0) return [...center(f[0].from), 0, 1];
    for (const fr of f) {
      if (e < fr.t1) {
        if (e < fr.t0) return [...center(fr.from), 0, 1];
        const q = (e - fr.t0) / (fr.t1 - fr.t0);
        const ease = fr.kind === 'hop' ? q : q < 0.5 ? 2 * q * q : 1 - 2 * (1 - q) * (1 - q);
        const [x0, y0] = center(fr.from);
        const [x1, y1] = center(fr.to);
        const arc = Math.sin(Math.PI * q);
        const lift = fr.kind === 'hop' ? 0.5 * arc : fr.kind === 'fly' ? 2.6 * arc : 1.4 * arc;
        const scale = fr.kind === 'fly' ? 1 + 0.7 * arc : 1 + 0.12 * arc;
        return [x0 + (x1 - x0) * ease, y0 + (y1 - y0) * ease, lift, scale];
      }
    }
    return [...center(f[f.length - 1].to), 0, 1];
  }

  // 같은 칸에 여러 명이 있으면 살짝 흩어 놓는다
  const SPREAD = [[[0, 0]], [[-0.24, 0], [0.24, 0]], [[-0.26, 0.12], [0.26, 0.12], [0, -0.2]], [[-0.24, -0.16], [0.24, -0.16], [-0.24, 0.2], [0.24, 0.2]],
    [[-0.3, -0.16], [0.3, -0.16], [0, 0], [-0.3, 0.22], [0.3, 0.22]], [[-0.3, -0.2], [0, -0.2], [0.3, -0.2], [-0.3, 0.2], [0, 0.2], [0.3, 0.2]]];

  function tokenPlaces() {
    const moving = animating() ? A.moveWho : null;
    const e = elapsed();
    const groups = {};
    const live = S.players.filter((p) => !p.bankrupt);
    live.forEach((p) => { if (p.id !== moving) (groups[p.pos] = groups[p.pos] || []).push(p.id); });
    const out = {};
    live.forEach((p) => {
      if (p.id === moving) {
        const at = moverAt(e);
        if (at) { out[p.id] = { x: at[0], y: at[1], lift: at[2], scale: at[3], top: true }; return; }
      }
      const g = groups[p.pos] || [p.id];
      const k = g.indexOf(p.id);
      const off = SPREAD[Math.min(g.length, 6) - 1][Math.max(0, k)] || [0, 0];
      const [x, y] = center(p.pos);
      const big = p.pos % 10 === 0 ? 1.4 : 1;
      out[p.id] = { x: x + off[0] * big, y: y + off[1] * big, lift: 0, scale: 1, top: p.id === S.turnId };
    });
    return out;
  }
  function placeStyle(q) {
    const z = q.top ? 30 : 20 + Math.round(q.y);
    return `left:${(q.x * PCT).toFixed(3)}%;top:${(q.y * PCT).toFixed(3)}%;z-index:${z};transform:translate(-50%,-82%) translateY(${(-q.lift * PCT).toFixed(3)}cqw) scale(${q.scale.toFixed(3)})`;
  }

  function tick() {
    raf = 0;
    if (!S || S.kind !== 'marble' || !A.plan) return;
    const places = tokenPlaces();
    document.querySelectorAll('.mpawn').forEach((el) => {
      const q = places[el.dataset.pid];
      if (q) el.style.cssText = placeStyle(q);
    });
    const e = elapsed();
    const fi = A.plan.frames.findIndex((f) => e < f.t1);
    const done = fi < 0 ? A.plan.frames.length : fi;
    if (done > A.hopCount) {
      const fr = A.plan.frames[done - 1];
      if (fr && fr.kind === 'hop' && typeof sfx === 'function') {
        const fast = fr.t1 - fr.t0 < 100;
        if (!fast || done % 3 === 0) sfx('hop', fast ? 0.6 : 1);
      }
      A.hopCount = done;
    }
    if (!A.diceShown && e >= A.plan.diceEnd) {
      A.diceShown = true;
      A.diceAt = performance.now();
      if (S.move && S.move.dice && S.move.dice[0] === S.move.dice[1]) typeof sfx === 'function' && sfx('double');
      render();
    }
    if (!A.keyShown && e >= A.plan.firstEnd && S.lastKey && S.move && S.lastKey.seq === S.move.seq) { A.keyShown = true; A.keyAt = performance.now(); if (typeof sfxPlan === 'function') sfxPlan(marbleKeyPlan(S.lastKey.id)); render(); }
    if (e < A.plan.total) raf = requestAnimationFrame(tick);
    else finishAnim();
  }
  function finishAnim() {
    if (!A.plan) return;
    A.plan = null;
    if (typeof sfxPlan === 'function' && A.before && !document.hidden) sfxPlan(marbleAfter(A.before, S, S.move));
    A.delta = {};
    S.players.forEach((p) => {
      const before = A.prevCash[p.id];
      if (before !== undefined && before !== p.cash) A.delta[p.id] = p.cash - before;
    });
    A.deltaAt = performance.now();
    render();
  }

  function snapshot() {
    const cash = {};
    const worth = {};
    S.players.forEach((p) => { cash[p.id] = p.cash; worth[p.id] = p.netWorth; });
    // 효과음 비교용으로 이전 상태의 일부도 남긴다 (sfx.js marbleAfter)
    const players = S.players.map((p) => ({ id: p.id, name: p.name, cash: p.cash, bankrupt: p.bankrupt }));
    return { cash, worth, log: S.log.slice(), players, round: S.round, phase: S.phase, me: S.me };
  }

  // 새 상태가 올 때마다: 새 움직임이면 재생을 시작한다
  function sync() {
    if (S.kind !== 'marble') { ui.mb = null; A.inited = false; return; }
    const s = st();
    if (S.mode !== 'warp') s.warp = null;
    const mv = S.move;
    const seq = mv ? mv.seq : null;
    if (!A.inited || A.gameNo !== S.gameNo) {
      // 처음 들어왔거나 새 게임: 지난 움직임은 재생하지 않는다
      Object.assign(A, { inited: true, gameNo: S.gameNo, seq, plan: null, keyShown: true, diceShown: true, delta: {} });
    } else if (seq !== null && seq !== A.seq) {
      const before = A.last || snapshot();
      if (A.plan) finishAnimQuiet();
      A.before = before;
      A.hopCount = 0;
      if (mv.dice) typeof sfx === 'function' && sfx('dice');
      else if (mv.segs.some((x) => x.k === 'fly')) typeof sfx === 'function' && sfx('whoosh');
      Object.assign(A, {
        seq, t0: performance.now(), plan: planOf(mv), moveWho: mv.who, keyShown: false, diceShown: !mv.dice, keyAt: 0, diceAt: 0,
        prevCash: before.cash, prevWorth: before.worth || {}, prevLog: before.log, delta: {},
      });
    }
    A.last = snapshot();
  }
  function finishAnimQuiet() { A.plan = null; }


  // ---- 그리기 ----
  function tileHtml(t, warping) {
    const [row, col] = cell(t.i);
    const sd = side(t.i);
    const owner = t.owner ? player(t.owner) : null;
    const narrow = sd === 'l' || sd === 'r';
    const cls = ['mt', `s-${sd}`, `t-${t.type}`];
    if (warping && !(me() && me().pos === t.i)) cls.push('warpable');
    if (st().warp === t.i) cls.push('picked');
    if (S.pending && S.pending.tile === t.i && !animating()) cls.push('focus');
    let inner;
    if (t.type === 'start') {
      inner = '<b class="cn">출발</b><span class="cbig">⬅</span><small>월급 20만</small>';
    } else if (t.type === 'island') {
      inner = '<span class="cbig">🏝️</span><b class="cn">무인도</b><small>3턴 쉬기</small>';
    } else if (t.type === 'fundcollect') {
      inner = `<span class="cbig">💰</span><b class="cn">사회복지기금</b><small>수령처 · ${won(S.fund)}</small>`;
    } else if (t.type === 'space') {
      inner = '<span class="cbig">🪐</span><b class="cn">우주여행</b><small>원하는 곳으로</small>';
    } else if (t.type === 'key') {
      inner = narrow ? '<span class="nm"><span class="ico">🔑</span>황금열쇠</span>' : `<span class="ico">🔑</span><span class="nm">${LABEL[t.name]}</span>`;
      cls.push('gold');
    } else if (t.type === 'fundpay') {
      inner = narrow ? '<span class="nm"><span class="ico">💸</span>복지기금</span><small class="pr">접수 15만</small>' : `<span class="ico">💸</span><span class="nm">${LABEL[t.name]}</span><small class="pr">15만</small>`;
    } else {
      const band = t.type === 'city' ? BAND[t.i] : t.type === 'special' ? KOREA_BAND : RIDE_BAND;
      const icon = ICON[t.name] ? `<span class="ico">${ICON[t.name]}</span>` : '';
      const sub = owner
        ? (t.level ? `<span class="bld">${LEVEL_MARK[t.level]}</span>` : `<small class="pr">${won(t.toll)}</small>`)
        : `<small class="pr">${won(t.price)}</small>`;
      const label = narrow ? (SIDE_LABEL[t.name] || esc(t.name)) : (LABEL[t.name] || esc(t.name));
      inner = narrow
        ? `<i class="band" style="background:${band}"></i><span class="body"><span class="nm">${icon}${label}</span>${sub}</span>`
        : `<i class="band" style="background:${band}"></i><span class="body">${icon}<span class="nm">${label}</span>${sub}</span>`;
      if (owner) cls.push('owned');
    }
    const ownStyle = owner ? `--own:${owner.color};` : '';
    return `<button class="${cls.join(' ')}" style="${ownStyle}grid-area:${row}/${col}" data-act="mbTile" data-i="${t.i}" aria-label="${esc(t.name)}">${inner}</button>`;
  }

  function dieHtml(v, k, e) {
    const [rx, ry] = FACE_ROT[v];
    const rolling = e < DICE_MS;
    const delay = rolling ? `animation-delay:${-Math.round(e) - k * 60}ms;` : '';
    const faces = [1, 2, 3, 4, 5, 6].map((f) => `<i class="f f${f}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((p) => `<b class="${PIPS[f].includes(p) ? 'on' : ''}"></b>`).join('')}</i>`).join('');
    return `<span class="dwrap ${rolling ? 'toss' : ''} d${k}" style="${delay}"><span class="die ${rolling ? 'spin' : ''}" style="--rx:${rx}deg;--ry:${ry}deg;${delay}">${faces}</span></span>`;
  }

  function centerHtml() {
    const mv = S.move;
    const e = A.plan ? elapsed() : 1e9;
    const dice = mv && mv.dice ? mv.dice : S.dice;
    const rolled = !!dice;
    const showSum = rolled && (!A.plan || A.diceShown);
    const dbl = rolled && dice[0] === dice[1];
    const diceBox = rolled
      ? `<div class="mdice">${dieHtml(dice[0], 0, mv && mv.dice ? e : 1e9)}${dieHtml(dice[1], 1, mv && mv.dice ? e : 1e9)}</div>
         <div class="msum ${showSum ? 'show' : ''}">${showSum ? `${pname(S.diceBy)} · <b>${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}</b>${dbl ? ` <em style="animation-delay:${sinceMs(A.diceAt)}">더블!</em>` : ''}` : '&nbsp;'}</div>`
      : `<div class="mdice idle">${dieHtml(5, 0, 1e9)}${dieHtml(3, 1, 1e9)}</div><div class="msum show dim">${mv && !mv.dice ? '🚀 우주여행 중' : '주사위를 굴려 출발!'}</div>`;
    const rounds = S.maxRounds ? `${Math.min(S.round, S.maxRounds)} / ${S.maxRounds}바퀴` : `${S.round}바퀴째`;
    const turnP = player(shownTurn());
    const keyNow = S.lastKey && mv && S.lastKey.seq === mv.seq && (A.keyShown || !A.plan);
    const key = keyNow ? `<div class="mkey" style="animation-delay:${sinceMs(A.keyAt)}"><span class="kh">🔑 황금열쇠 · ${pname(S.lastKey.by)}님</span><span class="kt">${esc(S.lastKey.text)}</span></div>` : '';
    return `<div class="mcenter ${keyNow ? 'haskey' : ''}">
      <div class="mc-top"><span>🌍 ${rounds}</span><span>💰 기금 <b>${won(S.fund)}</b></span></div>
      <div class="mlogo">부루마블</div>
      ${turnP && S.phase === 'play' ? `<div class="mc-turn"><i class="pdot" style="background:${turnP.color}"></i>${esc(turnP.name)}님 차례</div>` : ''}
      ${diceBox}${key}</div>`;
  }

  function boardHtml() {
    const warping = S.mode === 'warp' && !animating();
    const places = tokenPlaces();
    const pawns = S.players.filter((p) => !p.bankrupt && places[p.id])
      .map((p) => `<i class="mpawn" data-pid="${p.id}" style="${placeStyle(places[p.id])}">${pawnSvg(p.color)}</i>`).join('');
    const tpl = `${CORNER}fr repeat(9, 1fr) ${CORNER}fr`;
    return `<div class="mwrap"><div class="mboard" style="grid-template-columns:${tpl};grid-template-rows:${tpl}">
      ${S.tiles.map((t) => tileHtml(t, warping)).join('')}${centerHtml()}
      <div class="mpawns">${pawns}</div></div></div>`;
  }

  const bandOf = (t) => (t.type === 'city' ? BAND[t.i] : t.type === 'special' ? KOREA_BAND : RIDE_BAND);
  const shortName = (n) => n.replace(' 여객기', '').replace('퀸 엘리자베스호', '퀸엘리자베스').replace('사회복지기금 ', '복지기금 ');
  // 움직이는 동안은 도착 전 값으로 보여 준다 (결과를 미리 알려 주지 않게)
  const shownCash = (p) => (A.plan && A.prevCash[p.id] !== undefined ? A.prevCash[p.id] : p.cash);
  const shownWorth = (p) => (A.plan && A.prevWorth && A.prevWorth[p.id] !== undefined ? A.prevWorth[p.id] : p.netWorth);
  // 공동 순위: 나보다 자산이 많은 사람 수 + 1
  const rankOf = (p) => 1 + S.players.filter((q) => !q.bankrupt && shownWorth(q) > shownWorth(p)).length;
  function ranked() {
    return S.players.slice().sort((a, b) => (a.bankrupt - b.bankrupt) || shownWorth(b) - shownWorth(a));
  }

  // 칸 하나가 지금 무슨 뜻인지 (보는 사람 기준)
  function tileMeaning(t, who) {
    if (OWN_TYPES.has(t.type)) {
      if (!t.owner) return { cls: 'free', text: `빈 땅 · 땅값 <b>${won(t.price)}</b>` };
      const lvl = t.type === 'city' && t.level ? ` ${LEVEL_MARK[t.level]}` : '';
      if (t.owner === S.me) return { cls: 'mine', text: `내 땅${lvl} · 통행료 <b>${won(t.toll)}</b>` };
      return { cls: 'other', text: `${pname(t.owner)}님 땅${lvl} · 통행료 <b>${won(t.toll)}</b>` };
    }
    const wp = who && player(who);
    return {
      start: { cls: 'sp', text: '지나거나 서면 월급 <b>20만</b>' },
      key: { cls: 'key', text: '카드 1장을 뽑아요' },
      island: { cls: 'sp', text: wp && wp.jail ? `쉬는 중 <b>${wp.jailTurns}/3턴</b> · 더블이면 탈출` : '3턴 쉬어요' },
      fundpay: { cls: 'sp', text: '기금 <b>15만</b>을 내요' },
      fundcollect: { cls: 'sp', text: `모인 기금 <b>${won(S.fund)}</b>을 받아요` },
      space: { cls: 'sp', text: '다음 차례에 원하는 칸으로' },
    }[t.type] || { cls: '', text: '' };
  }

  // 판 위 상태판: 누구 차례 · 지금 하는 일 · 그 사람이 선 칸의 뜻 · 내 순위
  function statusHtml() {
    if (S.phase !== 'play') return '';
    const pd = S.pending;
    const whoId = animating() ? A.moveWho : pd ? pd.who : S.turnId;
    const w = player(whoId);
    if (!w) return '';
    const mine = whoId === S.me;
    let doing;
    if (animating()) doing = elapsed() < A.plan.diceEnd ? '🎲 주사위를 굴리는 중…' : (S.move && !S.move.dice ? '🚀 날아가는 중…' : '🚶 이동하는 중…');
    else if (pd) doing = { buy: '땅을 살지 고르는 중', build: '건물을 지을지 고르는 중', debt: `빚 ${won(pd.amount || 0)}을 갚는 중`, warp: '🚀 우주여행 갈 곳을 고르는 중' }[pd.t] || '';
    else if (w.jail) doing = `🏝️ 무인도 탈출 시도 (${w.jailTurns}/3턴)`;
    else doing = S.move && S.move.who === whoId && S.move.dice && S.move.dice[0] === S.move.dice[1] ? '더블! 한 번 더 굴릴 차례' : '주사위를 굴릴 차례';
    const tile = S.tiles[w.pos];
    const here = animating() ? '' : (() => {
      const m = tileMeaning(tile, whoId);
      const band = OWN_TYPES.has(tile.type) ? `<i class="mb-hb" style="background:${bandOf(tile)}"></i>` : '';
      return `<button class="mb-here ${m.cls}" data-act="mbTile" data-i="${tile.i}">${band}<span class="mb-hn">📍 ${esc(tile.name)}</span><span class="mb-ht">${m.text}</span></button>`;
    })();
    const meP0 = me();
    const myRank = meP0 ? rankOf(meP0) - 1 : -1;
    const meP = me();
    const myBox = meP && !meP.bankrupt ? `<span class="mb-my"><small>내 돈 · ${myRank + 1}위</small><b>${won(shownCash(meP))}</b></span>` : '';
    return `<section class="mb-status ${mine ? 'mine' : ''}" style="--pc:${w.color}">
      <div class="mb-st-r"><span class="mb-st-pawn">${pawnSvg(w.color)}</span>
        <span class="mb-st-who"><b>${mine ? '내 차례!' : `${esc(w.name)}님 차례`}</b><small>${doing}</small></span>${myBox}</div>
      ${here}</section>`;
  }

  function playersHtml() {
    const now = performance.now();
    const rows = ranked().map((p) => {
      const turn = p.id === shownTurn() && S.phase === 'play';
      const cash = shownCash(p);
      const d = !A.plan && A.delta[p.id];
      const delta = d ? `<span class="mdelta ${d > 0 ? 'gain' : 'loss'}" style="animation-delay:${-Math.round(now - A.deltaAt)}ms">${d > 0 ? '+' : ''}${won(d)}</span>` : '';
      const moving = A.plan && p.id === A.moveWho;
      const tags = [];
      if (p.bankrupt) tags.push('<span class="mtag bad">파산</span>');
      if (p.jail && !moving) tags.push(`<span class="mtag">🏝️ ${p.jailTurns}/3</span>`);
      if (p.warp && !moving) tags.push('<span class="mtag">🚀 우주여행</span>');
      if (p.escape) tags.push(`<span class="mtag">📻 무전기 ${p.escape}</span>`);
      if (p.pass) tags.push(`<span class="mtag">🎫 우대권 ${p.pass}</span>`);
      const win = S.winnerIds.includes(p.id);
      return `<div class="mpl ${turn ? 'turn' : ''} ${p.bankrupt ? 'out' : ''} ${p.id === S.me ? 'me' : ''} ${win ? 'win' : ''} ${!p.bankrupt && rankOf(p) === 1 ? 'r1' : ''}">
        <span class="mpl-rank">${p.bankrupt ? '–' : win ? '🏆' : rankOf(p)}</span><span class="mpl-pawn">${pawnSvg(p.color)}</span>
        <span class="mpl-mid"><b class="mpl-n">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}<span class="dot ${p.connected ? '' : 'off'}"></span></b>
          <span class="mpl-r">땅 ${p.props.length}곳 · 자산 ${won(shownWorth(p))} ${tags.join('')}</span></span>
        <span class="mpl-cash"><small>현금</small>${won(cash)}${delta}</span>${turn ? '<span class="mpl-turn">차례</span>' : ''}</div>`;
    }).join('');
    return `<section class="mb-rankbox"><div class="mb-sec-h"><b>💰 자산 순위</b><small>자산 = 현금 + 땅·건물에 들인 돈</small></div><div class="mplayers2">${rows}</div></section>`;
  }

  // 내 땅 목록: 단계와 지금 통행료. 누르면 땅 카드
  function myPropsHtml() {
    const m = me();
    if (!m || m.bankrupt || S.phase === 'lobby') return '';
    const mine = S.tiles.filter((t) => t.owner === S.me);
    const body = mine.length
      ? mine.map((t) => `<button class="mb-prop" style="--c:${t.type === 'city' ? BAND[t.i] : t.type === 'special' ? '#d62d3a' : RIDE_BAND}" data-act="mbTile" data-i="${t.i}">
          <span class="mb-pn">${esc(shortName(t.name))}${t.level ? ` <i>${LEVEL_MARK[t.level]}</i>` : ''}</span><small>통행료 <b>${won(t.toll)}</b></small></button>`).join('')
      : '<p class="mb-none">아직 산 땅이 없어요. 빈 땅에 서면 살 수 있어요.</p>';
    return `<section class="mb-mine"><div class="mb-sec-h"><b>🏠 내 땅 ${mine.length}곳</b><small>누르면 땅 카드를 봐요</small></div><div class="mb-props">${body}</div></section>`;
  }

  function logHtml() {
    const src = A.plan ? A.prevLog : S.log;
    const lines = (src || []).filter((l) => !l.startsWith('▶')).slice(-4).reverse();
    return lines.length ? `<div class="ulog mb-log">${lines.map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
  }

  function deedHtml(t, extra = '', compact = false) {
    const band = t.type === 'city' ? BAND[t.i] : t.type === 'special' ? KOREA_BAND : RIDE_BAND;
    let body;
    if (compact) {
      body = t.type === 'city'
        ? `<div class="dfix">통행료 <b>${won(t.tolls[0])}</b> → 호텔이면 <b>${won(t.tolls[4])}</b></div>`
        : `<div class="dfix">통행료 <b>${won(t.baseToll)}</b> <small>건물은 못 지어요</small></div>`;
    } else if (t.type === 'city') {
      const rows = t.tolls.map((toll, l) => `<tr class="${t.owner && t.level === l ? 'now' : ''}"><td>${LEVEL_NAME[l]}</td><td>${won(toll)}</td></tr>`).join('');
      body = `<table class="dtable"><tr><th>통행료</th><th></th></tr>${rows}</table>
        <div class="dcost">건설비 · 별장 <b>${won(t.costs[0])}</b> · 빌딩 <b>${won(t.costs[1])}</b> · 호텔 <b>${won(t.costs[2])}</b></div>`;
    } else {
      body = `<div class="dfix">통행료 <b>${won(t.baseToll)}</b><small>${t.type === 'ride' ? '탈것은 건물을 지을 수 없어요' : '특수지역은 건물을 지을 수 없어요'}${t.name === '컬럼비아호' ? ' · 우주여행 탑승료 20만' : ''}</small></div>`;
    }
    return `<div class="deed"><div class="dhead" style="background:${band}"><small>${esc(t.region || '')}</small><b>${ICON[t.name] || ''} ${esc(t.name)}</b><span>땅값 ${won(t.price)}</span></div>${body}${extra}</div>`;
  }

  function infoSheet() {
    const t = S.tiles[st().info];
    const owner = t.owner ? player(t.owner) : null;
    let body;
    if (t.price) {
      const own = owner
        ? `<p class="center">주인 <b style="color:${owner.color}">${esc(owner.name)}</b>${t.type === 'city' ? ` · ${LEVEL_NAME[t.level]}` : ''} · 지금 통행료 <b>${won(t.toll)}</b></p>`
        : '<p class="center dim">아직 주인이 없어요</p>';
      body = deedHtml(t, own);
    } else {
      const text = {
        start: '지나가거나 도착하면 월급 20만원을 받아요.',
        key: '황금열쇠 카드를 한 장 뽑아요. (상금·세금·여행·무전기·우대권 등 30장)',
        island: '도착하면 3턴을 쉬어요. 더블이 나오거나 무전기 카드가 있으면 바로 나와요.',
        fundpay: '사회복지기금 15만원을 내요. 모인 돈은 수령처에 도착한 사람이 가져가요.',
        fundcollect: `모인 사회복지기금(지금 ${won(S.fund)})을 모두 받아요.`,
        space: '다음 차례에 원하는 칸으로 날아가요. 컬럼비아호 주인이 따로 있으면 탑승료 20만원.',
      }[t.type] || '';
      body = `<h2>${esc(t.name)}</h2><p>${text}</p>`;
    }
    return `<div class="overlay" data-act="closeall"><div class="sheet">${body}<button data-act="closeall">닫기</button></div></div>`;
  }

  function dock() {
    if (animating()) {
      const who = A.moveWho && player(A.moveWho);
      const e = elapsed();
      return `<p class="center mwait">${who ? esc(who.name) : ''}님이 ${e < A.plan.diceEnd ? '🎲 주사위를 굴리는 중…' : S.move && !S.move.dice ? '🚀 날아가는 중…' : '🚶 이동하는 중…'}</p>`;
    }
    const mode = S.mode;
    const pd = S.pending;
    const m = me();
    const tile = pd && pd.tile !== undefined ? S.tiles[pd.tile] : null;
    switch (mode) {
      case 'roll': {
        const out = [];
        const again = S.move && S.move.who === S.me && S.move.dice && S.move.dice[0] === S.move.dice[1] && !m.jail;
        if (m.jail) {
          out.push(`<p class="center">🏝️ 무인도에서 쉬는 중 (${m.jailTurns}/3턴). 더블이 나오면 바로 탈출해요.</p>`);
          if (m.escape) out.push(`<button data-act="mbEscape">📻 무전기 카드 쓰고 나가기 (${m.escape}장)</button>`);
        }
        out.push(`<button class="primary mroll" data-act="mbRoll">🎲 ${again ? '더블! 한 번 더 굴리기' : '주사위 굴리기'}</button>`);
        return out.join('');
      }
      case 'buy': {
        const toll = tile.type === 'city' ? tile.tolls[0] : tile.baseToll;
        const more = tile.type === 'city' ? `호텔까지 지으면 ${won(tile.tolls[4])}` : '건물은 못 지어요';
        return `<div class="mb-offer" style="--band:${bandOf(tile)}">
            <div class="mb-of-h"><small>${esc(tile.region || '')}</small><b>${ICON[tile.name] || '🏳️'} ${esc(tile.name)}</b><span>빈 땅이에요. 살까요?</span></div>
            <div class="mb-of-g"><span><small>땅값</small><b>${won(pd.cost)}</b></span><span><small>산 뒤 내 돈</small><b>${won(m.cash - pd.cost)}</b></span><span><small>받을 통행료</small><b>${won(toll)}</b></span></div>
            <p class="mb-of-n">${more}</p></div>
          <div class="row"><button class="primary" data-act="mbBuy">${won(pd.cost)}에 사기</button><button data-act="mbSkip">사지 않기</button></div>`;
      }
      case 'build': {
        const next = tile.level + 1;
        const steps = [1, 2, 3, 4].map((l) => `<i class="${l <= tile.level ? 'on' : l === next ? 'next' : ''}">${LEVEL_MARK[l].slice(0, 2)}</i>`).join('');
        return `<div class="mb-offer" style="--band:${bandOf(tile)}">
            <div class="mb-of-h"><small>내 땅</small><b>${esc(tile.name)}</b><span><b>${LEVEL_MARK[next]} ${LEVEL_NAME[next]}</b>${['', '를', '를', '을', '을'][next]} 지을까요?</span></div>
            <div class="mb-lv">${steps}</div>
            <div class="mb-of-g"><span><small>건설비</small><b>${won(pd.cost)}</b></span><span><small>지은 뒤 내 돈</small><b>${won(m.cash - pd.cost)}</b></span><span><small>통행료</small><b>${won(tile.tolls[tile.level])} → ${won(tile.tolls[next])}</b></span></div></div>
          <div class="row"><button class="primary" data-act="mbBuild">${won(pd.cost)}에 짓기</button><button data-act="mbSkip">짓지 않기</button></div>`;
      }
      case 'debt': {
        const mine = S.tiles.filter((t) => t.owner === S.me);
        const sells = mine.map((t) => `<button class="mprop-btn" data-act="mbSell" data-i="${t.i}">${esc(t.name)} ${LEVEL_MARK[t.level]} · 팔면 +${won(t.sale)}</button>`).join('');
        return `<div class="mask bad"><b>${won(pd.amount)}</b>을 내야 하는데 내 돈은 <b>${won(m.cash)}</b>이에요. <b>${won(pd.amount - m.cash)}</b>이 모자라요.<small>땅을 팔아(땅값+건물값의 절반) 갚으세요.</small></div>
          <div class="mprops">${sells || '<p class="dim center">팔 땅이 없어요</p>'}</div>
          <button class="no" data-act="mbBankrupt" data-confirm="정말 파산을 선언할까요? 모든 땅이 사라져요.">파산 선언</button>`;
      }
      case 'warp': {
        const picked = st().warp;
        const fare = S.spaceFare && !m.freeWarp ? ` · 컬럼비아호 탑승료 ${won(S.spaceFare)}` : m.freeWarp ? ' · 초청장이라 탑승료 면제' : '';
        return `<div class="mask">🚀 <b>우주여행!</b> 가고 싶은 칸을 보드에서 누르세요.<small>출발을 지나가면 월급을 받아요${fare}</small></div>
          ${picked !== null ? `<p class="mb-pick">📍 ${esc(S.tiles[picked].name)} · ${tileMeaning(S.tiles[picked], S.me).text}</p><button class="primary" data-act="mbWarp">🚀 ${esc(S.tiles[picked].name)}(으)로 날아가기</button>` : '<button disabled>보드에서 칸을 고르세요</button>'}`;
      }
      case 'over':
        return '';
      default: {
        const who = pd ? pd.who : S.turnId;
        const what = pd ? { buy: '땅을 살지 고르는 중', build: '건물을 지을지 고르는 중', debt: '빚을 갚는 중', warp: '우주여행 갈 곳을 고르는 중' }[pd.t] : null;
        return `<p class="center dim mwait">${what ? `${pname(who)}님이 ${what}이에요` : `${pname(who)}님이 주사위를 굴릴 차례예요`}</p>`;
      }
    }
  }

  function renderMarble() {
    const isHost = S.hostId === S.me;
    const over = S.phase === 'over' && !animating()
      ? `<div class="card panel mover"><div class="mover-h">🏁 게임 끝</div><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p><p class="small dim center">${esc((S.log.slice().reverse().find((l) => l.startsWith('게임 끝!')) || '').replace('게임 끝! ', ''))}</p>${genericOverButtons(isHost)}</div>` : '';
    const rounds = S.maxRounds ? `${Math.min(S.round, S.maxRounds)}/${S.maxRounds}바퀴` : `${S.round}바퀴째`;
    return `
    <div class="top"><span>${roomTag()}</span><span class="mb-top">🎲 부루마블 · ${rounds}</span></div>
    ${over}
    ${over ? playersHtml() : ''}
    ${statusHtml()}
    ${boardHtml()}
    <div class="bdock mdock">
      ${dock()}
    </div>
    ${over ? '' : playersHtml()}
    ${myPropsHtml()}
    ${logHtml()}
    ${isHost ? '<div class="foot mb-foot"><button class="sm ghost" data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
    ${st().info !== null ? infoSheet() : ''}
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (굴리기/건너뛰기/파산)', '자리를 비운 사람 대신 진행할까요? (굴리기 / 선택은 건너뛰기 / 빚은 파산 처리)') : ''}`;
  }

  // 화면이 가려져 있으면 requestAnimationFrame이 멈추므로, 중요한 순간(주사위 멈춤/열쇠/도착)은 타이머로도 챙긴다
  let fallback = 0;
  function afterRender() {
    if (!S || S.kind !== 'marble' || S.phase === 'lobby') return;
    if (A.plan && !raf) raf = requestAnimationFrame(tick);
    clearTimeout(fallback);
    if (A.plan) {
      const e = elapsed();
      const next = [A.plan.diceEnd, A.plan.firstEnd, A.plan.total].filter((t) => t > e);
      const wait = next.length ? Math.min(...next) - e + 30 : 30;
      fallback = setTimeout(() => { if (document.hidden) tick(); }, wait);
    }
  }

  function lobbyOptions(isHost) {
    const opts = S.roundChoices.map((n) => `<option value="${n}" ${S.settings.maxRounds === n ? 'selected' : ''}>${n ? `${n}바퀴` : '무제한'}</option>`).join('');
    return `<label class="opt"><span>게임 길이</span>
      <select id="mbRounds" ${isHost ? '' : 'disabled'}>${opts}</select></label>
      <p class="small dim" style="margin:0 0 8px">정한 바퀴가 지나면 자산이 가장 많은 사람이 이겨요.${isHost ? '' : ' (방장이 정해요)'}</p>`;
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'mbRounds') send({ t: 'setting', key: 'maxRounds', value: Number(e.target.value) });
  });

  function click(act, el) {
    const s = st();
    switch (act) {
      case 'mbTile': {
        const i = Number(el.dataset.i);
        if (S.mode === 'warp' && !animating()) {
          if (me() && me().pos === i) {
            showToast('다른 칸을 고르세요.');
            return true;
          }
          s.warp = s.warp === i ? null : i;
        } else s.info = i;
        render();
        return true;
      }
      case 'mbRoll': send({ t: 'roll' }); return true;
      case 'mbEscape': send({ t: 'useEscape' }); return true;
      case 'mbBuy': send({ t: 'buy' }); return true;
      case 'mbBuild': send({ t: 'build' }); return true;
      case 'mbSkip': send({ t: 'skip' }); return true;
      case 'mbSell': send({ t: 'sell', tile: Number(el.dataset.i) }); return true;
      case 'mbBankrupt': send({ t: 'bankrupt' }); return true;
      case 'mbWarp': send({ t: 'warp', tile: s.warp }); s.warp = null; return true;
      default: return false;
    }
  }

  window.GAME_UI.marble = {
    name: '부루마블', label: '🎲 부루마블', range: '2~6명', rules: RULES,
    render: renderMarble, sync, click, lobbyOptions, afterRender, busy: () => animating(),
    closeAll: () => { if (ui.mb) ui.mb.info = null; },
  };
}());
