'use strict';
// 다빈치 코드 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
// 꾸미기는 skin-davinci.css (dv- 로 시작하는 클래스, 화면 전체는 .dv 안).
//
// 타일은 검정/흰색 블록. 남의 숨은 타일은 뒷면만, 공개된 타일은 숫자가 보인다. 내 타일은 숫자가 보이지만
// 숨김/공개를 작은 표시로만 구분한다(옆 사람이 멀리서 알아볼 만한 큰 색 차이를 두지 않음).
// 맞힘/틀림/공개 애니메이션은 사건(S.ev)을 처음 받은 시각을 기억해 두고 음수 animation-delay로 이어서 그린다.
// 메모는 이 기기에만 저장(localStorage)하고 서버로 보내지 않는다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>다빈치 코드 규칙 간단 설명</summary>
<p><b>2~4명</b> · 상대가 숨긴 숫자 타일을 추리해서 맞히는 게임이에요. 내 타일을 끝까지 숨긴 마지막 한 사람이 이겨요.</p>
<ul>
<li>타일은 검은색 0~11, 흰색 0~11에 <b>조커</b>(−) 2개까지 26개예요. (방장이 조커를 뺄 수 있어요)</li>
<li>2~3명은 4개, 4명은 3개씩 가져가요. 내 줄은 왼쪽부터 <b>작은 숫자 순서</b>이고, 같은 숫자면 <b>검은색이 왼쪽</b>이에요. 조커는 원하는 자리에 둬요.</li>
<li>모든 타일의 <b>색과 자리</b>는 모두에게 보이고, 숫자는 공개되기 전까지 주인만 알아요.</li>
<li>내 차례: 가운데에서 타일 1개를 뽑고(나만 봐요), 상대의 숨은 타일 하나를 골라 숫자를 말해요.</li>
<li><b>맞으면</b> 그 타일이 공개되고, 더 맞히거나 멈출 수 있어요. 멈추면 뽑은 타일을 <b>숨겨서</b> 내 줄에 넣어요.</li>
<li><b>틀리면</b> 뽑은 타일을 <b>공개해서</b> 내 줄에 넣고 차례가 끝나요. 가운데가 비어서 뽑은 타일이 없으면 내 숨은 타일 하나를 공개해요.</li>
<li>한 차례에 적어도 한 번은 맞혀 봐야 해요. 타일이 모두 공개되면 탈락, 마지막까지 숨은 타일이 남은 사람이 승리!</li>
</ul></details>`;

  const J = -1;
  const FLIP_MS = 750;
  const SHAKE_MS = 700;
  const DROP_MS = 520;
  const POP_MS = 2800;
  const BANNER_MS = 650;

  const st = () => (ui.dv = ui.dv || { sel: null, val: null, slot: null, rsel: null, memo: null });
  const A = { inited: false, key: null, seq: null, evAt: 0, turnKey: null, turnAt: 0 };
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const me = () => player(S.me);
  const numTxt = (n) => (n === J ? '−' : String(n));
  const numWord = (n) => (n === J ? '조커' : String(n));
  const colorWord = (c) => (c === 'b' ? '검은' : '흰');
  const since = (t) => Math.round(performance.now() - t);
  const initial = (p) => esc([...(p ? p.name : '?')][0] || '?');

  // ---- 이 기기에만 저장하는 것: 메모, 내 숫자 가리기 ----
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 못 해도 게임은 된다 */ } },
  };
  const memoKey = () => `dv-memo:${S.code}:${S.gameNo}`;
  function loadMemo() {
    try { return JSON.parse(store.get(memoKey())) || {}; } catch { return {}; }
  }
  function saveMemo(m) { store.set(memoKey(), JSON.stringify(m)); }
  // 지난 판 메모는 지운다
  function cleanMemos() {
    try {
      const keep = memoKey();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('dv-memo:') && k !== keep) localStorage.removeItem(k);
      }
    } catch { /* noop */ }
  }
  const hideMine = () => store.get('dv-hide') === '1';

  // ---- 새 상태: 새 사건과 차례 바뀜을 기억 ----
  function sync() {
    if (!S || S.kind !== 'davinci') { ui.dv = null; A.inited = false; return; }
    const s = st();
    const key = `${S.code}:${S.gameNo}`;
    const seq = S.ev ? S.ev.seq : null;
    if (!A.inited || A.key !== key) {
      Object.assign(A, { inited: true, key, seq, evAt: 0, turnKey: null, turnAt: 0 });
      Object.assign(s, { sel: null, val: null, slot: null, rsel: null, memo: null });
      cleanMemos();
    } else if (seq !== null && seq !== A.seq) {
      A.seq = seq;
      A.evAt = performance.now();
    }
    const tk = `${S.phase}:${S.turnId}`;
    if (tk !== A.turnKey) {
      A.turnAt = A.turnKey === null ? 0 : performance.now();
      A.turnKey = tk;
    }
    // 고른 것이 더 이상 맞지 않으면 풀기
    if (S.mode !== 'guess') { s.sel = null; s.val = null; }
    if (s.sel) {
      const p = player(s.sel.pid);
      const t = p && p.row.find((x) => x.id === s.sel.tid);
      if (!t || t.open || p.out) { s.sel = null; s.val = null; }
    }
    if (S.mode !== 'reveal') s.rsel = null;
    if (!S.slots) { s.slot = null; s.moving = false; }
    else if (s.slot !== null && (s.slot < S.slots[0] || s.slot > S.slots[1])) s.slot = null;
  }

  // ---- 타일 하나 ----
  function evClass(t) {
    const ev = S.ev;
    if (!ev || ev.tile !== t.id || !A.evAt) return { cls: [], style: '' };
    const e = since(A.evAt);
    const cls = [];
    if (ev.t === 'place' && e < DROP_MS + FLIP_MS) cls.push('drop');
    if (((ev.t === 'guess' && ev.ok) || ev.t === 'reveal' || (ev.t === 'place' && ev.open)) && e < FLIP_MS + (ev.t === 'place' ? DROP_MS : 0)) cls.push('flip');
    if (ev.t === 'guess' && !ev.ok && e < SHAKE_MS) cls.push('shake');
    return { cls, style: cls.length ? `--ad:-${e}ms;` : '' };
  }

  // owner: 타일 주인 id. o: { pick, sel, ghost, act, tag, label }
  function tileHtml(t, owner, o = {}) {
    const mine = owner === S.me;
    const over = S.phase === 'over';
    const known = t.n !== null && t.n !== undefined;
    const showNum = known && (t.open || over || (mine && !hideMine()));
    const cls = ['dv-t', t.c, t.open ? 'open' : 'hid'];
    if (mine) cls.push('mine');
    if (over && !t.open) cls.push('kept');
    if (o.pick) cls.push('pick');
    if (o.sel) cls.push('sel');
    if (o.ghost) cls.push('ghost');
    const an = o.ghost ? { cls: [], style: '' } : evClass(t);
    cls.push(...an.cls);
    let face;
    if (showNum) face = `<b class="dv-n ${t.n === 6 || t.n === 9 ? 'u' : ''} ${t.n === J ? 'jk' : ''}">${numTxt(t.n)}</b>`;
    else if (mine && known) face = '<b class="dv-n mask">•</b>';
    else face = '<i class="dv-back" aria-hidden="true"></i>';
    const mark = mine && !over ? `<i class="dv-mk ${t.open ? 'o' : 'h'}" aria-hidden="true"></i>` : '';
    const label = o.label || `${colorWord(t.c)} 타일${t.open ? ` 공개 ${numWord(t.n)}` : ' 숨김'}`;
    const attrs = o.act ? ` data-act="${o.act}" data-tid="${t.id}"${o.pid ? ` data-pid="${o.pid}"` : ''}` : '';
    const tag = o.act ? 'button' : 'span';
    return `<${tag} class="${cls.join(' ')}" style="${an.style}"${attrs} aria-label="${esc(label)}"><span class="dv-face">${face}</span>${mark}</${tag}>`;
  }

  function bubbleHtml(t) {
    const ev = S.ev;
    if (!ev || ev.t !== 'guess' || ev.tile !== t.id || !A.evAt) return '';
    const e = since(A.evAt);
    if (e > POP_MS) return '';
    return `<span class="dv-bub ${ev.ok ? 'ok' : 'bad'}" style="--ad:-${e}ms">${ev.ok ? '🎯' : '✗'}${numTxt(ev.value)}</span>`;
  }

  // 줄이 길어지면 타일을 작게 (2명이면 한 줄이 13개까지 길어진다). 크기는 CSS에서 --n으로 계산
  // 9개까지는 한 줄, 그보다 많으면 두 줄로 (한 줄에 다 넣으면 타일이 너무 작아져서 누르기 어렵다)
  const rowStyle = (n) => `style="--n:${Math.min(9, Math.max(4, n))}"`;

  // 틀린 숫자·메모 목록: 숫자 중간에서 줄이 바뀌지 않게 하나씩 묶는다
  const chips = (list) => list.map((v) => `<i>${numTxt(v)}</i>`).join('');

  // ---- 상대 줄 ----
  function oppCell(p, t, i, memo) {
    const s = st();
    const canPick = S.mode === 'guess' && !p.out && !t.open;
    const tappable = !t.open && S.phase !== 'over' && !p.out;
    const sel = !!(s.sel && s.sel.tid === t.id);
    const notes = [];
    if (!t.open && t.miss.length) notes.push(`<span class="dv-miss" title="틀린 숫자">✗${chips(t.miss)}</span>`);
    const m = memo[t.id];
    if (!t.open && m && m.length) notes.push(`<span class="dv-memo" title="내 메모">📝${chips(m)}</span>`);
    const label = `${p.name}님 왼쪽 ${i + 1}번째 ${colorWord(t.c)} 타일${t.open ? ` 공개 ${numWord(t.n)}` : ''}`;
    return `<div class="dv-cell">${bubbleHtml(t)}${tileHtml(t, p.id, { pick: canPick, sel, act: tappable ? 'dvTile' : '', pid: p.id, label })}
      <span class="dv-i">${i + 1}</span>${notes.length ? `<span class="dv-notes">${notes.join('')}</span>` : ''}</div>`;
  }

  function rackHtml(p) {
    const turn = S.phase === 'play' && S.turnId === p.id;
    const win = S.winnerIds.includes(p.id);
    const hidden = p.row.filter((t) => !t.open).length;
    const memo = loadMemo();
    let tiles;
    let info;
    if (S.phase === 'setup') {
      tiles = Array.from({ length: S.handSize }, () => '<div class="dv-cell"><span class="dv-t ph"><span class="dv-face"><i class="dv-back"></i></span></span><span class="dv-i">&nbsp;</span></div>').join('');
      info = p.ready ? '<span class="dv-badge ok">준비 완료</span>' : '<span class="dv-badge">타일 확인 중…</span>';
    } else {
      tiles = p.row.map((t, i) => oppCell(p, t, i, memo)).join('');
      info = `<small class="dv-cnt">숨은 <b>${hidden}</b> / ${p.row.length}개</small>`;
    }
    const badges = [];
    if (turn) badges.push('<span class="dv-badge turn">차례</span>');
    if (p.out) badges.push('<span class="dv-badge out">탈락</span>');
    if (win) badges.push('<span class="dv-badge win">🏆 승리</span>');
    return `<section class="dv-rack ${turn ? 'turn' : ''} ${p.out ? 'out' : ''} ${win ? 'win' : ''}">
      <div class="dv-rh"><span class="dv-av">${initial(p)}</span><b class="dv-nm">${esc(p.name)}</b><span class="dot ${p.connected ? '' : 'off'}"></span>${badges.join('')}${info}</div>
      <div class="dv-row" ${rowStyle(p.row.length)}>${tiles}</div></section>`;
  }

  // 내 다음 사람부터 차례 순서대로
  function opponents() {
    const i = S.players.findIndex((p) => p.id === S.me);
    const n = S.players.length;
    return Array.from({ length: n - 1 }, (_, k) => S.players[(i + 1 + k + n) % n]).filter((p) => p && p.id !== S.me);
  }

  // ---- 내 줄 ----
  function pendingTile() {
    if (S.mode === 'place' && S.drawn) return S.drawn;
    if (S.mode === 'setup' && S.slots) return me().pending[0] || null;
    return null;
  }
  const chosenSlot = () => {
    const s = st();
    return s.slot !== null && S.slots && s.slot >= S.slots[0] && s.slot <= S.slots[1] ? s.slot : S.defaultSlot;
  };

  function myRackHtml() {
    const m = me();
    if (!m) return '';
    const s = st();
    const pend = pendingTile();
    const over = S.phase === 'over';
    const revealing = S.mode === 'reveal';
    const cells = [];
    // 놓을 자리 고르기: 처음에는 정해 둔 자리에 타일만 보이고, 그 타일을 눌러야 다른 자리(＋)가 펼쳐진다.
    // 그래서 조커를 받았거나 뽑았을 때도 화면 모양이 다른 사람과 같다(멀리서 ＋가 줄줄이 보이지 않게).
    const many = !!(pend && S.slots && S.slots[1] > S.slots[0]);
    const slotAt = (i) => {
      if (!pend || !S.slots || i < S.slots[0] || i > S.slots[1]) return '';
      if (i === chosenSlot()) {
        const lbl = S.phase === 'setup' ? '' : '<span class="dv-slotlbl">여기</span>';
        const ghost = tileHtml(pend, S.me, { ghost: true, act: many ? 'dvMove' : '', label: many ? '놓을 타일 · 눌러서 자리 옮기기' : '놓을 타일' });
        return `<div class="dv-cell dv-ghostcell ${s.moving ? 'moving' : ''}">${lbl}${ghost}<span class="dv-i">▲</span></div>`;
      }
      if (!s.moving) return '';
      return `<button class="dv-slot" data-act="dvSlot" data-i="${i}" aria-label="${i + 1}번째 자리에 놓기"><i>＋</i></button>`;
    };
    m.row.forEach((t, i) => {
      cells.push(slotAt(i));
      const canPick = revealing && !t.open;
      cells.push(`<div class="dv-cell">${bubbleHtml(t)}${tileHtml(t, S.me, { pick: canPick, sel: s.rsel === t.id, act: canPick ? 'dvMine' : '', label: `내 왼쪽 ${i + 1}번째 ${colorWord(t.c)} 타일${t.open ? ' 공개' : ' 숨김'}` })}<span class="dv-i">${i + 1}</span>${!t.open && t.miss.length ? `<span class="dv-notes"><span class="dv-miss" title="틀린 숫자">✗${chips(t.miss)}</span></span>` : ''}</div>`);
    });
    cells.push(slotAt(m.row.length));
    // 준비 단계에는 아직 안 놓은 조커도 센다(개수가 남과 같게)
    const extra = S.phase === 'setup' ? m.pending.length : 0;
    const hidden = m.row.filter((t) => !t.open).length + extra;
    // 뽑아 둔 타일(아직 맞히는 중): 줄 아래에 작게
    const drawnBox = S.drawn && S.mode === 'guess'
      ? `<div class="dv-drawn">${tileHtml(S.drawn, S.me, { label: '뽑은 타일' })}<small><b>뽑은 타일</b> · 맞히기를 마치면 내 줄에 들어가요 (그만하면 숨긴 채로, 틀리면 공개해서)</small></div>` : '';
    const toggle = over ? '' : `<button class="dv-hide" data-act="dvHide" aria-pressed="${hideMine()}" aria-label="${hideMine() ? '내 숫자 보기' : '내 숫자 가리기'}">${hideMine() ? '👁 <span class="dv-hw">숫자 </span>보기' : '🙈 <span class="dv-hw">숫자 </span>가리기'}</button>`;
    return `<section class="dv-rack dv-me ${m.out ? 'out' : ''} ${S.winnerIds.includes(S.me) ? 'win' : ''} ${pend && S.phase !== 'setup' ? 'placing' : ''}">
      <div class="dv-rh"><span class="dv-av">${initial(m)}</span><b class="dv-nm">내 타일</b>${m.out ? '<span class="dv-badge out">탈락</span>' : ''}${S.winnerIds.includes(S.me) ? '<span class="dv-badge win">🏆 승리</span>' : ''}
        <small class="dv-cnt">숨은 <b>${hidden}</b> / ${m.row.length + extra}개</small>${toggle}</div>
      <div class="dv-mywrap"><div class="dv-row" ${rowStyle(m.row.length + (pend ? 1 : 0))}>${cells.join('')}</div>${drawnBox}</div>
      ${over ? '' : '<p class="dv-legend"><i class="dv-mk h"></i>숨김 <i class="dv-mk o"></i>공개 · 내 숫자는 나만 보여요</p>'}</section>`;
  }

  // ---- 공개된 숫자 표 (모두가 아는 사실만) ----
  function publicHtml() {
    const open = { b: new Set(), w: new Set() };
    S.players.forEach((p) => p.row.forEach((t) => { if (t.open) open[t.c].add(t.n); }));
    const vals = Array.from({ length: 12 }, (_, i) => i);
    if (S.jokers) vals.push(J);
    const row = (c) => `<span class="dv-pl ${c}">${c === 'b' ? '⚫' : '⚪'}</span>${vals.map((v) => `<i class="${c} ${open[c].has(v) ? 'on' : ''}">${numTxt(v)}</i>`).join('')}`;
    return `<section class="dv-pub"><div class="dv-pub-h"><b>📋 공개된 숫자</b><small>모두에게 보이는 타일만 칠해져요</small></div>
      <div class="dv-pub-g" style="--cols:${vals.length}">${row('b')}${row('w')}</div></section>`;
  }

  // ---- 위쪽 차례 띠 ----
  function bannerHtml() {
    if (S.phase === 'over') return ''; // 끝나면 아래 결과 카드가 대신한다
    const chips = [];
    if (S.phase !== 'over') chips.push(`<span class="dv-chip"><i class="dv-pile"></i><span>가운데 <b>${S.pool}</b>개</span></span>`);
    let title;
    let sub;
    let mine = false;
    let who = null;
    if (S.phase === 'setup') {
      const n = S.players.filter((p) => p.ready).length;
      title = '🔍 타일 확인 중';
      sub = `받은 타일을 확인하고 준비 완료를 눌러요 · ${n}/${S.players.length}명 준비`;
    } else if (S.phase === 'over') {
      title = '🏁 게임 끝';
      sub = '모든 타일이 공개됐어요. 누가 무엇을 숨겼는지 확인해 봐요';
    } else {
      who = player(S.turnId);
      mine = S.turnId === S.me;
      title = mine ? '내 차례!' : `${pname(S.turnId)}님 차례`;
      if (S.step === 'guess') {
        sub = mine
          ? (S.guesses ? `🎯 ${S.guesses}번 맞혔어요! 더 맞히거나 멈춰요` : '상대 타일 하나를 골라 숫자를 맞혀요')
          : (S.guesses ? `🎯 ${S.guesses}번 연속 맞힘 · 더 맞히는 중` : '숫자를 맞히는 중이에요');
      } else if (S.step === 'place') {
        sub = mine ? (S.placeOpen ? '틀렸어요! 뽑은 타일을 공개해서 놓아요' : '뽑은 타일을 숨겨서 놓아요') : (S.placeOpen ? '틀려서 뽑은 타일을 공개해서 놓는 중' : '뽑은 타일을 내 줄에 놓는 중');
      } else if (S.step === 'reveal') {
        sub = mine ? '틀렸어요! 내 숨은 타일 하나를 공개해요' : '틀려서 자기 타일 하나를 공개하는 중';
      }
      chips.push(S.hasDrawn ? '<span class="dv-chip">✋ 1개 뽑음</span>' : '<span class="dv-chip dim">뽑은 타일 없음</span>');
    }
    const e = A.turnAt ? since(A.turnAt) : 1e9;
    const enter = e < BANNER_MS ? ` enter" style="--ad:-${e}ms` : '';
    return `<section class="dv-banner ${mine ? 'mine' : ''} ${S.phase}${enter}">
      <span class="dv-bav">${who ? initial(who) : S.phase === 'over' ? '🏆' : '🔍'}</span>
      <span class="dv-bt"><b>${title}</b><small>${sub || ''}</small></span>
      <span class="dv-chips">${chips.join('')}</span>${popHtml()}</section>`;
  }

  // 방금 일어난 맞히기 결과 한 줄 (모두에게 공개된 정보)
  function popHtml() {
    const ev = S.ev;
    if (!ev || ev.t !== 'guess' || !A.evAt) return '';
    const e = since(A.evAt);
    if (e > POP_MS) return '';
    const tp = player(ev.target);
    const t = tp && tp.row.find((x) => x.id === ev.tile);
    const pos = t ? tp.row.indexOf(t) + 1 : '?';
    return `<span class="dv-pop ${ev.ok ? 'ok' : 'bad'}" style="--ad:-${e}ms">${ev.by === S.me ? '내가' : `${pname(ev.by)}님이`} ${ev.target === S.me ? '내' : `${pname(ev.target)}님`} ${pos}번째 타일에 <b>"${numWord(ev.value)}"</b> → ${ev.ok ? '🎯 정답!' : '❌ 땡!'}</span>`;
  }

  // ---- 아래 조작판 ----
  function selectedInfo() {
    const s = st();
    if (!s.sel) return null;
    const p = player(s.sel.pid);
    const t = p && p.row.find((x) => x.id === s.sel.tid);
    if (!t) return null;
    return { p, t, i: p.row.indexOf(t) };
  }

  function padHtml(sel) {
    const s = st();
    const vals = Array.from({ length: 12 }, (_, i) => i);
    const btn = (v) => `<button class="dv-key ${s.val === v ? 'on' : ''} ${sel.t.miss.includes(v) ? 'missed' : ''}" data-act="dvVal" data-v="${v}">${numTxt(v)}</button>`;
    const say = s.val !== null
      ? `<button class="primary dv-say" data-act="dvSay">🎯 "${numWord(s.val)}"라고 말하기</button>`
      : '<button class="dv-say" disabled>숫자를 고르세요</button>';
    return `<div class="dv-pad">${vals.map(btn).join('')}</div>
      <div class="dv-padrow">${S.jokers ? `<button class="dv-key jk ${s.val === J ? 'on' : ''} ${sel.t.miss.includes(J) ? 'missed' : ''}" data-act="dvVal" data-v="${J}">조커 −</button>` : ''}${say}</div>`;
  }

  function dock() {
    const s = st();
    const m = me();
    switch (S.mode) {
      case 'setup':
        // 조커를 받은 사람도 같은 문구·같은 버튼 하나 (조커 자리는 이 버튼을 누를 때 함께 정해진다)
        return `<p class="dv-msg"><b>내 타일을 확인했나요?</b><small>왼쪽부터 작은 숫자 순서예요. 조커(−)는 눌러서 원하는 자리로 옮길 수 있어요.</small></p>
          <button class="primary dv-big" data-act="dvReady">✅ 준비 완료</button>`;
      case 'guess': {
        const sel = selectedInfo();
        const stopBtn = S.guesses
          ? `<button class="dv-stop" data-act="dvStop">✋ 그만하기${S.drawn ? ' · 뽑은 타일 숨겨서 놓기' : ''}</button>` : '';
        if (!sel) {
          return `<p class="dv-msg"><b>${S.guesses ? '🎯 맞혔어요! 한 번 더 맞혀 볼까요?' : '👆 상대의 숨은 타일 하나를 눌러요'}</b>
            <small>${S.guesses ? '또 맞히면 계속, 틀리면 뽑은 타일이 공개돼요. 그만하면 뽑은 타일을 숨긴 채로 놓아요.' : '반짝이는 타일 중 숫자를 알 것 같은 타일을 골라요.'}</small></p>${stopBtn}`;
        }
        const miss = sel.t.miss.length ? `<small class="dv-selmiss">이미 틀린 숫자: ${sel.t.miss.map(numWord).join(', ')}</small>` : '';
        return `<div class="dv-selbar">${tileHtml(sel.t, sel.p.id, { label: '고른 타일' })}
            <span class="dv-selt"><b>${esc(sel.p.name)}님 · 왼쪽 ${sel.i + 1}번째 ${colorWord(sel.t.c)} 타일</b>${miss}</span>
            <button class="dv-ic" data-act="dvMemo" data-tid="${sel.t.id}" aria-label="메모">📝</button><button class="dv-ic" data-act="dvUnsel" aria-label="고르기 취소">✕</button></div>
          ${padHtml(sel)}${stopBtn}`;
      }
      case 'place': {
        const t = S.drawn;
        const many = S.slots && S.slots[1] > S.slots[0];
        return `<p class="dv-msg"><b>${S.placeOpen ? '📢 틀렸어요! 뽑은 타일을 공개해서 놓아요' : '🤫 뽑은 타일을 숨겨서 놓아요'}</b>
            <small>${t && t.n === J ? '조커는 아무 자리에나 둘 수 있어요. 금색 테두리 타일을 눌러 자리를 옮겨요.' : many ? '조커 옆이라 놓을 수 있는 자리가 여러 곳이에요. 금색 테두리 타일을 눌러 옮길 수 있어요.' : '숫자 순서대로 들어갈 자리예요.'}</small></p>
          <button class="primary dv-big" data-act="dvPlace">✔ 여기에 놓기</button>`;
      }
      case 'reveal': {
        const pick = s.rsel && m.row.find((t) => t.id === s.rsel);
        return `<p class="dv-msg"><b>📢 틀렸어요! 내 타일 하나를 공개해요</b><small>가운데 타일이 없어서, 대신 내 숨은 타일 중 하나를 골라 공개해야 해요. 위 내 줄에서 눌러요.</small></p>
          ${pick ? `<button class="primary dv-big" data-act="dvReveal">📢 왼쪽 ${m.row.indexOf(pick) + 1}번째 타일 공개하기</button>` : '<button class="dv-big" disabled>공개할 내 타일을 고르세요</button>'}`;
      }
      case 'out':
        return '<p class="dv-msg"><b>💀 탈락했어요</b><small>내 타일이 모두 공개됐어요. 남은 사람들의 추리를 구경하면서 메모해 봐요.</small></p>';
      case 'over':
        return '';
      default: {
        if (S.phase === 'setup') return `<p class="dv-msg"><b>⏳ 다른 사람이 준비하는 중…</b><small>${S.players.filter((p) => p.ready).length}/${S.players.length}명 준비 완료</small></p>`;
        const what = S.step === 'place' ? '타일을 놓는 중' : S.step === 'reveal' ? '자기 타일을 공개하는 중' : '숫자를 맞히는 중';
        return `<p class="dv-msg"><b>⏳ ${pname(S.turnId)}님이 ${what}…</b><small>상대 타일을 누르면 나만 보는 메모를 쓸 수 있어요.</small></p>`;
      }
    }
  }

  // ---- 메모 시트 ----
  function memoSheet() {
    const s = st();
    let owner = null;
    let tile = null;
    S.players.forEach((p) => p.row.forEach((t) => { if (t.id === s.memo) { owner = p; tile = t; } }));
    if (!tile) return '';
    const memo = loadMemo()[tile.id] || [];
    const vals = Array.from({ length: 12 }, (_, i) => i);
    if (S.jokers) vals.push(J);
    const keys = vals.map((v) => `<button class="dv-mkey ${memo.includes(v) ? 'on' : ''} ${tile.miss.includes(v) ? 'missed' : ''}" data-act="dvMemoVal" data-v="${v}">${numTxt(v)}</button>`).join('');
    return `<div class="overlay" data-act="closeall"><div class="sheet dv-sheet">
      <div class="dv-sh-h">${tileHtml(tile, owner.id, { label: '메모할 타일' })}<span><b>📝 ${esc(owner.name)}님 · 왼쪽 ${owner.row.indexOf(tile) + 1}번째</b><small>나만 보는 메모예요. 이 타일일 것 같은 숫자를 눌러 표시해요. (서버로 보내지 않아요)</small></span></div>
      ${tile.miss.length ? `<p class="dv-selmiss">모두 들은 사실: 이미 틀린 숫자 <b>${tile.miss.map(numWord).join(', ')}</b> (이 숫자들은 아니에요)</p>` : ''}
      <div class="dv-mpad">${keys}</div>
      <div class="row"><button data-act="dvMemoClear">지우기</button><button class="primary" data-act="closeall">닫기</button></div>
    </div></div>`;
  }

  function overHtml(isHost) {
    if (S.phase !== 'over') return '';
    return `<section class="dv-over"><div class="dv-over-h">CODE BROKEN</div>
      <p class="dv-over-win">🏆 ${S.winnerIds.map(pname).join(', ')}님 승리!</p>
      <p class="dv-over-sub">끝까지 숨겨 둔 타일은 점선 테두리로 보여요.</p>
      ${genericOverButtons(isHost)}</section>`;
  }

  function renderDavinci() {
    const isHost = S.hostId === S.me;
    const log = S.log.length ? `<div class="ulog dv-log">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    return `<div class="top"><span>${roomTag()}</span><span class="dv-top">🔢 다빈치 코드</span></div>
    <div class="dv">
      ${bannerHtml()}
      ${overHtml(isHost)}
      ${S.phase === 'setup' ? myRackHtml() : ''}
      <div class="dv-opps">${opponents().map(rackHtml).join('')}</div>
      ${S.phase === 'setup' ? '' : myRackHtml() + publicHtml()}
      ${log}
      ${isHost ? '<div class="foot dv-foot"><button class="sm ghost" data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
      <div class="bdock dv-dock">${dock()}</div>
    </div>
    ${st().memo ? memoSheet() : ''}
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 사람 대신 진행', '자리를 비운 사람 대신 진행할까요? (준비: 조커는 맨 끝 / 맞히기: 한 번 이상 맞혔으면 멈추고, 아니면 아무 숫자 / 놓기: 순서대로 / 공개: 맨 왼쪽)') : ''}`;
  }

  // 내 줄에서 할 일이 생기면(놓기·공개·조커 자리) 내 줄이 보이게 한 번 굴려 준다
  let scrolledFor = null;
  let popTimer = 0;
  function afterRender() {
    if (!S || S.kind !== 'davinci') return;
    // 맞히기 결과 알림·말풍선은 시간이 지나면 지운다 (움직임 줄이기 설정이면 애니메이션 없이 남아 있으므로)
    clearTimeout(popTimer);
    if (S.ev && A.evAt && since(A.evAt) < POP_MS) popTimer = setTimeout(render, POP_MS - since(A.evAt) + 60);
    const need = S.mode === 'place' || S.mode === 'reveal'; // 준비 단계는 내 줄이 맨 위라 굴리지 않는다(조커 받은 사람만 화면이 움직이지 않게)
    const key = need ? `${S.gameNo}:${S.turnId}:${S.mode}:${A.seq}` : null;
    if (!need) { scrolledFor = null; return; }
    if (key === scrolledFor) return;
    scrolledFor = key;
    const el = document.querySelector('.dv-me');
    if (el) setTimeout(() => el.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }), 60);
  }

  function lobbyOptions(isHost) {
    return `<label class="opt ${isHost ? '' : 'ro'}">
      <input type="checkbox" data-act="dvOpt" ${S.settings && S.settings.jokers ? 'checked' : ''} ${isHost ? '' : 'disabled'} />
      <span>조커 사용<small class="dim" style="display:block;font-size:12px">검은 조커·흰 조커(−) 2개를 넣어요. 숫자 순서와 상관없이 아무 자리에나 놓을 수 있어서 추리가 더 어려워져요.</small></span></label>
      ${isHost ? '' : '<p class="small dim" style="margin:0 0 6px">옵션은 방장이 정해요.</p>'}`;
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.dataset && e.target.dataset.act === 'dvOpt') send({ t: 'setting', key: 'jokers', value: e.target.checked });
  });

  function click(act, el) {
    if (!S || S.kind !== 'davinci') return false;
    const s = st();
    switch (act) {
      case 'dvOpt': return true;
      case 'dvTile': {
        const pid = el.dataset.pid;
        const tid = el.dataset.tid;
        if (S.mode === 'guess') {
          if (s.sel && s.sel.tid === tid) s.sel = null;
          else s.sel = { pid, tid };
          s.val = null;
        } else {
          s.memo = tid;
        }
        render();
        return true;
      }
      case 'dvUnsel': s.sel = null; s.val = null; render(); return true;
      case 'dvVal': {
        const v = Number(el.dataset.v);
        s.val = s.val === v ? null : v;
        render();
        return true;
      }
      case 'dvSay': {
        if (!s.sel || s.val === null) return true;
        send({ t: 'guess', target: s.sel.pid, tile: s.sel.tid, value: s.val });
        s.sel = null;
        s.val = null;
        return true;
      }
      case 'dvStop': send({ t: 'stop' }); s.sel = null; s.val = null; return true;
      case 'dvSlot': s.slot = Number(el.dataset.i); s.moving = false; render(); return true;
      case 'dvMove': s.moving = !s.moving; render(); return true;
      case 'dvPlace': send({ t: 'place', pos: chosenSlot() }); s.slot = null; s.moving = false; return true;
      case 'dvReady': send(S.slots ? { t: 'ready', pos: chosenSlot() } : { t: 'ready' }); s.slot = null; s.moving = false; return true;
      case 'dvMine': s.rsel = s.rsel === el.dataset.tid ? null : el.dataset.tid; render(); return true;
      case 'dvReveal': if (s.rsel) send({ t: 'reveal', tile: s.rsel }); s.rsel = null; return true;
      case 'dvHide': store.set('dv-hide', hideMine() ? '0' : '1'); render(); return true;
      case 'dvMemo': s.memo = el.dataset.tid; render(); return true;
      case 'dvMemoVal': {
        const v = Number(el.dataset.v);
        const all = loadMemo();
        const list = new Set(all[s.memo] || []);
        if (list.has(v)) list.delete(v);
        else list.add(v);
        all[s.memo] = [...list].sort((a, b) => (a === J ? 99 : a) - (b === J ? 99 : b));
        if (!all[s.memo].length) delete all[s.memo];
        saveMemo(all);
        render();
        return true;
      }
      case 'dvMemoClear': {
        const all = loadMemo();
        delete all[s.memo];
        saveMemo(all);
        render();
        return true;
      }
      default: return false;
    }
  }

  window.GAME_UI.davinci = {
    name: '다빈치 코드', label: '🔢 다빈치 코드', range: '2~4명', rules: RULES,
    render: renderDavinci, sync, click, lobbyOptions, afterRender,
    closeAll: () => { if (ui.dv) ui.dv.memo = null; },
    selected: () => selectedInfo(),
  };
}());
