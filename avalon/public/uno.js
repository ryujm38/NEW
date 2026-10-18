'use strict';
// 우노 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역을 그대로 쓴다.
// (여기 함수들은 render() 시점에 호출되므로 app.js가 다 올라온 뒤에 실행된다.)
// 카드 그림은 전부 CSS(skin-uno.css)와 인라인 SVG로 새로 그렸다. 외부 이미지는 쓰지 않는다.

const UNO_COLOR_NAME = { r: '빨강', y: '노랑', g: '초록', b: '파랑', w: '와일드' };
const UNO_KIND_NAME = { skip: '스킵', rev: '리버스', d2: '+2', wild: '와일드', d4: '와일드 +4' };
const UNO_FACE = { skip: '⊘', rev: '⇄', d2: '+2', wild: '★', d4: '+4' };
const unoFace = (kind) => UNO_FACE[kind] || kind;
const unoCardName = (c) => (c.color === 'w' ? UNO_KIND_NAME[c.kind] : `${UNO_COLOR_NAME[c.color]} ${UNO_KIND_NAME[c.kind] || c.kind}`);

const UNO_RULES_HTML = `
<details><summary>우노 규칙 간단 설명</summary>
<ul>
<li>7장씩 받고, 맨 위 카드와 <b>같은 색 또는 같은 숫자/기호</b>를 냅니다. 와일드는 언제든 내고 색을 고릅니다.</li>
<li>낼 카드가 없으면 <b>1장 뽑습니다.</b> 뽑은 카드가 낼 수 있으면 바로 내거나 넘길 수 있고, 낼 수 없으면 자동으로 넘어갑니다.</li>
<li><b>스킵</b> 다음 사람 건너뛰기 · <b>리버스</b> 방향 바꾸기(2명이면 스킵) · <b>+2</b> 다음 사람이 2장 뽑고 건너뜀 · <b>와일드 +4</b> 다음 사람이 4장 뽑고 건너뜀</li>
<li>+2, +4는 쌓을 수 없습니다. <b>와일드 +4는 지금 색 카드가 손에 없을 때만</b> 낼 수 있어요.</li>
<li>카드가 <b>1장 남으면 "우노!"</b>를 외쳐야 합니다. 안 외치면 다음 사람이 움직이기 전에 다른 사람이 고발해서 <b>2장</b>을 뽑게 할 수 있어요.</li>
<li>손패를 먼저 모두 내면 승리! 승수는 방에 쌓입니다.</li>
</ul></details>`;

// ---- 카드 그림 (인라인 SVG, 새로 그림) ----
const UNO_SVG = {
  skip: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.6" fill="none" stroke="currentColor" stroke-width="3.2"/><path d="M6.8 17.2 17.2 6.8" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>',
  rev: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10.5c0-3 2.2-5 5.2-5H17"/><path d="m14.4 2.8 2.8 2.7-2.8 2.7"/><path d="M19 13.5c0 3-2.2 5-5.2 5H7"/><path d="m9.6 21.2-2.8-2.7 2.8-2.7"/></g></svg>',
  d2: '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#fff" stroke-width="1.4"><rect x="4" y="3.5" width="9.5" height="13.5" rx="2" fill="currentColor" transform="rotate(-12 8.7 10.2)"/><rect x="10.5" y="7" width="9.5" height="13.5" rx="2" fill="currentColor" transform="rotate(10 15.2 13.7)"/></g></svg>',
  wild: '<svg viewBox="0 0 24 24" aria-hidden="true"><g transform="rotate(-28 12 12)"><path d="M12 12V3.5A6.4 8.5 0 0 1 18.4 12Z" fill="#ff4d5e"/><path d="M12 12h6.4A6.4 8.5 0 0 1 12 20.5Z" fill="#ffc92e"/><path d="M12 12v8.5A6.4 8.5 0 0 1 5.6 12Z" fill="#22c47a"/><path d="M12 12H5.6A6.4 8.5 0 0 1 12 3.5Z" fill="#3d8bff"/><ellipse cx="12" cy="12" rx="6.4" ry="8.5" fill="none" stroke="#fff" stroke-width="1.2"/></g></svg>',
  d4: '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="#fff" stroke-width="1.1"><rect x="2.2" y="6" width="7" height="10" rx="1.5" fill="#3d8bff" transform="rotate(-18 5.7 11)"/><rect x="7" y="4.4" width="7" height="10" rx="1.5" fill="#22c47a" transform="rotate(-6 10.5 9.4)"/><rect x="10.5" y="6.8" width="7" height="10" rx="1.5" fill="#ff4d5e" transform="rotate(7 14 11.8)"/><rect x="14.4" y="9" width="7" height="10" rx="1.5" fill="#ffc92e" transform="rotate(18 17.9 14)"/></g></svg>',
};

// 카드 한 장. o.tag==='button'이면 손패 버튼, o.style로 부채꼴 위치/애니메이션을 넘긴다
function unoCardHtml(card, o = {}) {
  const num = /^\d$/.test(card.kind);
  const cls = ['uno-card', `c-${card.color}`, `k-${num ? 'n' : card.kind}`];
  if (o.cls) cls.push(o.cls);
  const idx = num ? card.kind : unoFace(card.kind);
  const mid = num
    ? `<b class="uc-num${card.kind === '6' || card.kind === '9' ? ' ul' : ''}">${card.kind}</b>`
    : `<span class="uc-sym">${UNO_SVG[card.kind] || esc(idx)}</span>`;
  const inner = `<span class="uc-field"><i class="uc-i tl">${esc(idx)}</i><span class="uc-oval">${mid}</span><i class="uc-i br">${esc(idx)}</i></span>`;
  const style = o.style ? ` style="${o.style}"` : '';
  if (o.tag === 'button') {
    return `<button class="${cls.join(' ')}" data-act="unoCard" data-id="${card.id}"${style} aria-label="${esc(unoCardName(card))}${o.label ? ` · ${o.label}` : ''}">${inner}</button>`;
  }
  return `<div class="${cls.join(' ')}"${style} role="img" aria-label="${esc(unoCardName(card))}">${inner}</div>`;
}

function unoBackHtml(cls = '') {
  return `<span class="uno-back ${cls}"><span class="ub-ring"><b>우노</b></span></span>`;
}

function unoMyTurn() {
  return S.phase === 'play' && S.turnId === S.me;
}

// 화면을 다시 그려도 애니메이션이 처음부터 다시 돌지 않게, 바뀐 시각을 기억해 두고 남은 만큼만 이어서 돌린다
const UNO_ANIM = { topSig: null, topAt: 0, hand: new Set(), handAt: {}, game: null };
const UNO_ANIM_MS = 520;
function unoAnimStyle(at) {
  const t = Date.now() - at;
  return t < UNO_ANIM_MS ? `animation-delay:-${t}ms` : null;
}
function unoTrackAnim() {
  const now = Date.now();
  const gameKey = `${S.code}:${S.gameNo}`;
  const fresh = UNO_ANIM.game !== gameKey;
  UNO_ANIM.game = gameKey;
  const sig = S.top ? `${S.top.color}${S.top.kind}:${S.color}:${S.log.length ? S.log[S.log.length - 1] : ''}` : null;
  if (sig !== UNO_ANIM.topSig) {
    UNO_ANIM.topAt = fresh ? 0 : now;
    UNO_ANIM.topSig = sig;
  }
  const ids = new Set(S.hand.map((c) => c.id));
  if (!fresh) ids.forEach((id) => { if (!UNO_ANIM.hand.has(id)) UNO_ANIM.handAt[id] = now; });
  Object.keys(UNO_ANIM.handAt).forEach((id) => {
    if (!ids.has(Number(id)) || now - UNO_ANIM.handAt[id] > UNO_ANIM_MS) delete UNO_ANIM.handAt[id];
  });
  UNO_ANIM.hand = ids;
}

const unoHue = (name) => [...String(name)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 17);

// 다음 차례인 사람 (진행 방향 기준)
function unoNextId() {
  const n = S.players.length;
  const ti = S.players.findIndex((p) => p.id === S.turnId);
  return ti >= 0 && n > 1 ? S.players[(((ti + S.dir) % n) + n) % n].id : null;
}

// 차례 띠: 나부터 앉은 순서(정방향 기준)로 늘어놓는다. 자리는 고정, 화살표가 지금 도는 방향을 보여 준다.
function unoSeatsHtml(over) {
  const nextId = over ? null : unoNextId();
  const w = S.unoWindow;
  const mi = Math.max(0, S.players.findIndex((p) => p.id === S.me));
  const order = [...S.players.slice(mi), ...S.players.slice(0, mi)];
  const cols = Math.min(order.length, 5);
  const chips = order.map((p, i) => {
    const cls = ['uno-seat'];
    if (p.id === S.turnId) cls.push('turn');
    else if (p.id === nextId) cls.push('next');
    if (p.id === S.me) cls.push('me');
    if (!over && p.count === 1) cls.push('last');
    if (!p.connected) cls.push('off');
    if (over && p.id === S.winnerId) cls.push('win');
    const catchable = !over && w && !w.called && w.id === p.id;
    let badge = '';
    if (over && p.id === S.winnerId) badge = '<em class="us-badge now">🏆 승리</em>';
    else if (p.id === S.turnId) badge = '<em class="us-badge now">차례</em>';
    else if (p.id === nextId) badge = '<em class="us-badge next">다음</em>';
    let alert = '';
    if (catchable) alert = '<em class="us-alert catch">🚨 안 외침</em>';
    else if (!over && p.count === 1) alert = '<em class="us-alert">우노!</em>';
    // 자리 사이 화살표: 마지막 칸이 아니고 같은 줄 안일 때만
    const arrow = i < order.length - 1 && (i + 1) % cols !== 0 ? `<i class="us-arrow" aria-hidden="true">${S.dir === 1 ? '›' : '‹'}</i>` : '';
    return `<div class="${cls.join(' ')}" style="--h:${unoHue(p.name)}">
      ${badge}
      <span class="us-av">${esc([...p.name][0] || '?')}<span class="dot ${p.connected ? '' : 'off'}"></span></span>
      <span class="us-nm">${p.id === S.me ? '나' : esc(p.name)}</span>
      <span class="us-cnt"><b>${p.count}</b><small>장</small></span>
      ${alert}${p.wins ? `<span class="us-win">🏆${p.wins}</span>` : ''}${arrow}
    </div>`;
  }).join('');
  return `<div class="uno-seats" style="--cols:${cols}">${chips}</div>`;
}

// 손패를 한 줄 최대 7장씩 부채꼴로 나눈다 (겹쳐도 한 장당 40px 넘게 보이게)
function unoHandHtml(myTurn) {
  if (!S.hand.length) return '<p class="uno-empty">손패가 없어요.</p>';
  const n = S.hand.length;
  const rowsN = Math.ceil(n / 7);
  const per = Math.ceil(n / rowsN);
  const rows = [];
  for (let r = 0; r < rowsN; r++) rows.push(S.hand.slice(r * per, (r + 1) * per));
  const sel = ui.unoSel;
  return rows.map((row) => {
    const m = row.length;
    const cards = row.map((c, i) => {
      const off = i - (m - 1) / 2;
      const st = [`--r:${(off * 3).toFixed(1)}deg`, `--y:${(off * off * 1.1).toFixed(1)}px`];
      const cls = [c.playable ? 'ok' : (myTurn ? 'no' : 'wait')];
      if (c.id === sel) cls.push('sel');
      if (S.drewId === c.id) cls.push('drew');
      const at = UNO_ANIM.handAt[c.id];
      const anim = at ? unoAnimStyle(at) : null;
      if (anim) {
        cls.push('uno-in');
        st.push(anim);
      }
      return unoCardHtml(c, { tag: 'button', cls: cls.join(' '), style: st.join(';'), label: c.playable ? '낼 수 있음' : '' });
    }).join('');
    return `<div class="uno-row" style="--n:${m}">${cards}</div>`;
  }).join('');
}

function renderUno() {
  unoTrackAnim();
  const isHost = S.hostId === S.me;
  const myTurn = unoMyTurn();
  const me = S.players.find((p) => p.id === S.me);
  const over = S.phase === 'over';
  const turnP = S.players.find((p) => p.id === S.turnId);
  const w = S.unoWindow;
  const playableN = S.hand.filter((c) => c.playable).length;
  const anyPlayable = playableN > 0;
  const nextId = over ? null : unoNextId();
  const nextP = S.players.find((p) => p.id === nextId);

  let status;
  if (over) {
    const winner = S.players.find((p) => p.id === S.winnerId);
    status = `<div class="uno-status win"><b>🎉 ${S.winnerId === S.me ? '내가' : `${esc(winner ? winner.name : '?')}님이`} 이겼어요!</b><small>${S.winnerId === S.me ? '카드를 모두 털어냈어요!' : '다음 판엔 내가 이겨 봐요'}</small></div>`;
  } else if (myTurn) {
    const sub = S.drewId !== null ? '방금 뽑은 카드를 내거나 넘기세요'
      : anyPlayable ? `반짝이는 카드 ${playableN}장 중 하나를 골라 내세요` : '낼 카드가 없어요. 더미에서 1장 뽑으세요';
    status = `<div class="uno-status mine"><b>내 차례예요!</b><small>${sub}</small></div>`;
  } else {
    const sub = nextId === S.me ? '<em>다음이 내 차례예요!</em> 낼 카드를 미리 봐 두세요' : `다음은 ${esc(nextP ? nextP.name : '')}님`;
    status = `<div class="uno-status"><b><span class="us-dot" style="--h:${unoHue(turnP ? turnP.name : '')}"></span>${esc(turnP ? turnP.name : '')}님 차례</b><small>${sub}</small></div>`;
  }

  const topAnim = S.top && UNO_ANIM.topAt ? unoAnimStyle(UNO_ANIM.topAt) : null;
  const canDraw = myTurn && S.drewId === null;
  const center = `
    <div class="uno-table c-${S.color || 'w'}">
      <div class="uno-dir ${S.dir === 1 ? 'cw' : 'ccw'}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3"/><path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3"/><path d="m17.6 3.2-.3 3.6-3.6-.3"/><path d="m6.4 20.8.3-3.6 3.6.3"/></g></svg>
        <small>${S.dir === 1 ? '정방향 ›' : '‹ 역방향'}</small>
      </div>
      <button class="uno-pile ${canDraw && !anyPlayable ? 'hot' : ''}" data-act="unoDraw" ${canDraw ? '' : 'disabled'} aria-label="카드 1장 뽑기">
        <span class="up-stack">${unoBackHtml('b3')}${unoBackHtml('b2')}${unoBackHtml('b1')}</span>
        <small>${canDraw ? '<b>탭해서 뽑기</b>' : '뽑는 더미'}<br>${S.drawCount}장 남음</small>
      </button>
      <div class="uno-discard">
        <span class="ud-stack">
          <span class="ud-glow"></span>
          <span class="ud-ghost g1"></span><span class="ud-ghost g2"></span>
          ${S.top ? unoCardHtml(S.top, { cls: `big${topAnim ? ' uno-land' : ''}`, style: topAnim }) : ''}
        </span>
      </div>
      <div class="uno-color c-${S.color}"><i></i><span>지금 색</span><b>${esc(UNO_COLOR_NAME[S.color] || '')}</b></div>
    </div>`;

  const log = S.log.length
    ? `<div class="uno-log" aria-live="polite">${S.log.slice(-2).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>`
    : '';

  let actions = '';
  if (!over) {
    const btns = [];
    if (w && !w.called && w.id === S.me) btns.push('<button class="uno-shout pulse" data-act="unoCall">우노!</button>');
    else if (me && me.count === 2 && !S.myUnoReady) btns.push('<button class="uno-pre" data-act="unoCall">🗣 우노 미리 외치기</button>');
    if (w && !w.called && w.id !== S.me) {
      const t = S.players.find((p) => p.id === w.id);
      btns.push(`<button class="uno-catch pulse" data-act="unoCatch">🚨 ${esc(t ? t.name : '')}님 우노 안 외쳤다! 고발</button>`);
    }
    if (myTurn && S.drewId !== null) btns.push('<button class="uno-pass" data-act="unoPass">넘기기 ⏭</button>');
    actions = btns.length ? `<div class="uno-acts">${btns.join('')}</div>` : '';
    if (S.myUnoReady) actions += '<p class="uno-note">🗣 우노를 미리 외쳐 뒀어요. 한 장 남기면 바로 인정돼요.</p>';
  }

  const selCard = S.hand.find((c) => c.id === ui.unoSel);
  const playBtn = selCard && selCard.playable && !over
    ? `<button class="uno-play c-${selCard.color}" data-act="unoPlay"><i></i>${esc(unoCardName(selCard))} 내기${selCard.color === 'w' ? ' · 색 고르기' : ''}</button>`
    : '';

  let overPanel = '';
  if (over) {
    const rank = S.players.slice().sort((a, b) => b.wins - a.wins || a.count - b.count);
    overPanel = `<div class="uno-over">
      <h2>🏆 승수판</h2>
      ${rank.map((p, i) => `<div class="uo-row ${p.id === S.winnerId ? 'win' : ''}"><span class="uo-rk">${i + 1}</span><span class="uo-nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><span class="uo-w">🏆 ${p.wins}</span><span class="uo-c">남은 ${p.count}장</span></div>`).join('')}
      ${isHost
        ? `<button class="primary" data-act="restart">한 판 더 (승수 유지)</button>
           <button data-act="again">대기실로 돌아가기 (승수 초기화)</button>`
        : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
    </div>`;
  }

  const handLbl = `내 손패 <b>${S.hand.length}</b>장${myTurn && !over ? ` · <span class="${anyPlayable ? 'ok' : ''}">낼 수 있는 카드 ${playableN}장</span>` : ''}`;
  return `<div class="uno-scr">
  <div class="top"><span>${roomTag()}</span><span>🃏 우노 · ${S.gameNo}번째 판</span></div>
  ${unoSeatsHtml(over)}
  ${center}
  ${log}
  ${status}
  ${overPanel}
  <div class="uno-dock ${myTurn ? 'mine' : ''}">
    ${actions}
    ${playBtn}
    ${over && !S.hand.length ? '' : `<div class="uno-hand ${over ? 'dimmed' : ''}"><span class="uno-hand-lbl">${handLbl}</span>${unoHandHtml(myTurn)}</div>`}
  </div>
  ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
  ${ui.colorOpen ? unoColorSheetHtml() : ''}
  ${ui.hostOpen && isHost ? unoHostMenuHtml() : ''}
  </div>`;
}

function unoColorSheetHtml() {
  const count = { r: 0, y: 0, g: 0, b: 0 };
  S.hand.forEach((c) => { if (count[c.color] !== undefined && c.id !== ui.unoSel) count[c.color] += 1; });
  return `<div class="overlay" data-act="closeall"><div class="sheet uno-sheet">
    <h2>이을 색을 고르세요</h2>
    <p class="dim small">내 손에 많이 남은 색을 고르면 다음에 내기 쉬워요.</p>
    <div class="uno-wheel">
      ${['r', 'y', 'b', 'g'].map((c) => `<button class="uw c-${c}" data-act="unoColor" data-color="${c}"><b>${UNO_COLOR_NAME[c]}</b><small>내 손에 ${count[c]}장</small></button>`).join('')}
    </div>
    <button class="ghost" data-act="closeall">취소</button>
  </div></div>`;
}

function unoHostMenuHtml() {
  const playing = S.phase === 'play';
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 바로 바뀌어요.</p>
    ${playing ? '<button data-act="force" data-confirm="지금 차례인 사람의 턴을 넘길까요? (자리를 비웠을 때 쓰세요)">지금 차례 넘기기 (자리 비운 사람)</button>' : ''}
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 카드를 새로 나눠 다시 시작할까요? (승수는 유지돼요)">이번 판 새로 시작 (승수 유지)</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요? (승수도 사라져요)">초기화하고 대기실로 (승수 삭제)</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

// 카드 탭: 첫 번째 탭은 고르기(위로 올라옴), 같은 카드를 다시 탭하거나 "내기" 버튼을 누르면 냄
function unoOnCard(id) {
  const card = S.hand.find((c) => c.id === id);
  if (!card) return;
  if (S.phase !== 'play') return;
  if (!unoMyTurn()) return showToast('내 차례가 아니에요.');
  if (!card.playable) {
    if (S.drewId !== null) return showToast('방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.');
    if (card.kind === 'd4') return showToast('지금 색 카드가 있으면 와일드 +4는 낼 수 없어요.');
    return showToast('낼 수 없는 카드예요. 색이나 숫자가 같아야 해요.');
  }
  if (ui.unoSel === id) return unoPlaySelected();
  ui.unoSel = id;
  render();
}

function unoPlaySelected() {
  const card = S.hand.find((c) => c.id === ui.unoSel);
  if (!card) return;
  if (card.color === 'w') {
    ui.colorOpen = true;
    render();
    return;
  }
  send({ t: 'play', card: card.id });
  ui.unoSel = null;
}

// 우노 화면에서 쓰는 클릭 동작. 처리했으면 true.
function unoClick(act, el) {
  switch (act) {
    case 'unoCard': unoOnCard(Number(el.dataset.id)); return true;
    case 'unoPlay': unoPlaySelected(); return true;
    case 'unoColor':
      send({ t: 'play', card: ui.unoSel, color: el.dataset.color });
      ui.unoSel = null;
      ui.colorOpen = false;
      render();
      return true;
    case 'unoDraw': send({ t: 'draw' }); ui.unoSel = null; return true;
    case 'unoPass': send({ t: 'pass' }); ui.unoSel = null; return true;
    case 'unoCall': send({ t: 'uno' }); return true;
    case 'unoCatch': send({ t: 'catch' }); return true;
    default: return false;
  }
}
