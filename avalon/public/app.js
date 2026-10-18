'use strict';
// 화면은 서버가 보내는 state를 그대로 그린다. 비밀(역할, 남의 투표/카드)은 서버가 걸러서 보내므로 여기엔 없다.

const $app = document.getElementById('app');
const SESSION_KEY = 'avalon-session';
const NAME_KEY = 'avalon-name';
const GAME_KEY = 'avalon-game';
const APP_NAME = '택미린솔록면';
const GAME_NAME = { avalon: '아발론', uno: '우노', bang: '뱅!', mafia: '마피아' };
// 새 게임은 파일 안에서 GAME_UI[종류] = {...}로 등록한다.
//   name(제목용 이름), label(첫 화면 버튼), range(인원), rules(규칙 html), render(), sync(), click(act, el),
//   afterRender(), lobbyOptions(isHost), closeAll()
window.GAME_UI = window.GAME_UI || {};
const gameName = (kind) => (GAME_UI[kind] && GAME_UI[kind].name) || GAME_NAME[kind];
const allGames = () => [...Object.keys(GAME_NAME), ...Object.keys(GAME_UI)];
const uiGames = () => Object.values(GAME_UI);

let ws = null;
let online = false;
let backoff = 500;
let S = null; // 서버가 보낸 내 시점의 상태
let toastTimer = null;
const ui = {
  name: load(NAME_KEY) || '',
  code: '', // 방 목록에서 고른 방
  roleOpen: false,
  historyOpen: false,
  hostOpen: false,
  colorOpen: false,
  bSel: null, // 뱅: 고른 손패 카드
  bPick: null, // 뱅: 패닉!/캣 발루 대상 고르는 중
  bSid: null, // 뱅: 시드 능력으로 버릴 카드 고르는 중
  bStore: null, // 뱅: 잡화점에서 고른 카드
  bInfo: false,
  mSel: null, // 마피아: 고른 대상
  mInfo: false,
  mText: '', // 마피아: 채팅 입력 중인 글
  unoSel: null,
  game: allGames().includes(load(GAME_KEY)) ? load(GAME_KEY) : 'avalon', // 새 방을 만들 때 고른 게임
  toast: '',
  locked: false, // 방 만들기: 비밀번호 방으로 만들지
  createPw: '',
  joinPw: '',
  needPw: false, // 들어가려는 방이 비밀번호 방이라 비밀번호 칸을 연다
  rooms: null, // 방 목록 (null = 아직 안 받음)
  roomsLoading: false,
  roomsAt: 0,
};
let session = loadJson(SESSION_KEY);

function load(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function save(k, v) {
  try { localStorage.setItem(k, v); } catch { /* 저장을 못 해도 게임은 된다 */ }
}
function loadJson(k) {
  try { return JSON.parse(load(k)); } catch { return null; }
}
function clearSession() {
  session = null;
  try { localStorage.removeItem(SESSION_KEY); } catch { /* noop */ }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- 연결 ----

// 이 페이지가 있는 폴더. 주소가 /board/ 아래여도(Cloudflare) 맨 위여도(Node 서버) 같은 코드로 동작한다.
const BASE_PATH = location.pathname.replace(/\/index\.html$/, '/').replace(/([^/])$/, '$1/');
let pingTimer = null;

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss://' : 'ws://'}${location.host}${BASE_PATH}ws`);
  ws.onopen = () => {
    online = true;
    backoff = 500;
    if (session) send({ t: 'resume', code: session.code, token: session.token });
    else requestRooms();
    // 연결이 살아 있다는 신호(서버가 조용히 끊긴 연결을 정리할 수 있게)
    clearInterval(pingTimer);
    pingTimer = setInterval(() => { if (ws && ws.readyState === WebSocket.OPEN) ws.send('{"t":"ping"}'); }, 25000);
    render();
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'joined') {
      session = { code: m.code, id: m.id, token: m.token };
      save(SESSION_KEY, JSON.stringify(session));
      ui.needPw = false;
      ui.joinPw = '';
      ui.createPw = '';
    } else if (m.t === 'state') {
      const prev = S;
      S = m.state;
      guideOnState(prev, S);
      if (prev && prev.phase !== 'lobby') {
        if (S.phase === 'lobby' && prev.phase !== 'over') showToast('방장이 게임을 초기화했어요. 대기실로 돌아왔어요.');
        else if (S.gameNo !== prev.gameNo) showToast('방장이 게임을 처음부터 다시 시작했어요.');
      }
      if (S.phase === 'lobby' || (prev && S.gameNo !== prev.gameNo)) ui.roleOpen = ui.historyOpen = ui.hostOpen = ui.colorOpen = false;
      if (!S.hand || !S.hand.some((c) => c.id === ui.unoSel && c.playable)) ui.unoSel = null;
      if (S.phase === 'lobby' || (prev && S.gameNo !== prev.gameNo)) ui.bInfo = ui.bPick = false;
      if (typeof bangSync === 'function') bangSync();
      if (S.phase === 'lobby' || (prev && S.gameNo !== prev.gameNo)) ui.mInfo = false;
      if (typeof mafiaSync === 'function') mafiaSync();
      uiGames().forEach((g) => g.sync && g.sync());
      if (S.kind !== 'uno' || S.turnId !== S.me) ui.colorOpen = false;
      render();
    } else if (m.t === 'gone') {
      clearSession();
      S = null;
      ui.roleOpen = ui.historyOpen = ui.hostOpen = ui.colorOpen = false;
      ui.unoSel = ui.bSel = ui.bPick = ui.bSid = ui.bStore = null;
      ui.bInfo = ui.mInfo = false;
      ui.mSel = null;
      ui.mText = '';
      if (m.kicked) showToast('방장이 내보냈어요.');
      render();
      requestRooms();
    } else if (m.t === 'rooms') {
      ui.rooms = Array.isArray(m.rooms) ? m.rooms : [];
      ui.roomsLoading = false;
      ui.roomsAt = Date.now();
      if (!S) render();
    } else if (m.t === 'error') {
      if (m.need === 'password') {
        ui.needPw = true;
        if (m.code) ui.code = m.code;
      }
      showToast(m.msg);
      if (m.need === 'password') { render(); focusLater('joinpw'); }
    }
  };
  ws.onclose = () => {
    clearInterval(pingTimer);
    online = false;
    render();
    setTimeout(connect, backoff);
    backoff = Math.min(backoff * 2, 5000);
  };
}

function send(o) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o));
  else showToast('연결 중이에요. 잠시만요…');
}

// 예전 초대 링크(?room=)로 열어도 주소만 정리하고 방 목록 화면을 보여 준다
if (location.search) {
  try { history.replaceState(null, '', BASE_PATH); } catch { /* noop */ }
}

// 게임 화면 맨 위에 방 코드 대신 방장 이름을 보여 준다
function roomTag() {
  const host = S && S.players && S.players.find((p) => p.id === S.hostId);
  return host ? `방장 <b>${esc(host.name)}</b>` : '';
}

// 누르는 동안은 화면 그리기가 미뤄지므로(render 참고) 입력칸으로 옮기는 것도 그린 뒤로 미룬다
function focusLater(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }, 150);
}

// 방 목록은 첫 화면에서만 쓰고, 연결될 때·방에서 나올 때·새로고침을 누를 때 받아 온다
function requestRooms() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ui.roomsLoading = true;
  ws.send('{"t":"list"}');
}

// 폰을 잠갔다 켰을 때 바로 다시 붙는다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
      backoff = 500;
      connect();
    } else if (ws.readyState === WebSocket.OPEN && session) {
      send({ t: 'resume', code: session.code, token: session.token });
    }
  }
});

function showToast(msg) {
  ui.toast = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { ui.toast = ''; render(); }, 2600);
  render();
}

// ---- 도우미 ----

const byId = (id) => S.players.find((p) => p.id === id);
const nm = (id) => (byId(id) ? esc(byId(id).name) : '?');
const nameList = (ids) => ids.map(nm).join(', ');

const REASONS = {
  rejects: '원정대가 5번 연속 부결되었습니다.',
  quests: '원정이 3번 실패했습니다.',
  merlin: '암살자가 멀린을 찾아냈습니다!',
  missed: '암살자가 멀린을 찾지 못했습니다.',
};

const AVALON_RULES_HTML = `
<details><summary>아발론 규칙 간단 설명</summary>
<p><b>5~10명</b> · 선(멀린, 퍼시벌, 충성스러운 신하) vs 악(모르가나, 암살자, 악의 하수인)</p>
<ul>
<li>인원별 선/악: 5명 3/2 · 6명 4/2 · 7명 4/3 · 8명 5/3 · 9명 6/3 · 10명 6/4. 멀린·퍼시벌·모르가나·암살자는 항상 들어가고, 남는 자리를 신하(선)와 하수인(악)이 채웁니다.</li>
<li>5번의 원정 중 <b>3번 성공</b>하면 선이 앞서고, <b>3번 실패</b>하면 악이 이깁니다. 원정 인원은 인원수에 따라 다르며 화면 위 동그라미에 표시됩니다.</li>
<li>실패 카드가 1장만 나와도 그 원정은 실패입니다. 단, <b>7명 이상일 때 4번째 원정은 실패 카드가 2장</b> 나와야 실패예요.</li>
<li>리더가 원정대를 고르면 모두가 찬성/반대로 투표합니다. <b>과반 찬성</b>이면 출발(동수는 부결), 아니면 리더가 다음 사람에게 넘어갑니다. <b>5번 연속 부결되면 악의 승리</b>.</li>
<li>원정대원은 몰래 성공/실패 카드를 냅니다. 선은 성공만 낼 수 있고, 악은 둘 중 고릅니다. 결과는 실패 카드 수만 공개됩니다.</li>
<li>선이 3번 성공해도 <b>암살자가 멀린을 맞히면 악의 역전승</b>입니다.</li>
</ul></details>`;

const rulesHtml = (kind) => (GAME_UI[kind] ? GAME_UI[kind].rules : { uno: UNO_RULES_HTML, bang: BANG_RULES_HTML, mafia: MAFIA_RULES_HTML }[kind] || AVALON_RULES_HTML);

function sideLabel(team) {
  return team === 'good' ? '선의 세력' : '악의 세력';
}

// ---- 화면 ----

// 손가락을 누르고 있는 동안 서버 상태가 와서 화면이 통째로 다시 그려지면 그 탭이 사라질 수 있다.
// 누르는 동안은 갱신을 미뤘다가 손을 뗀 직후에 한 번에 그린다.
let pressing = 0; // 누르기 시작한 시각(ms), 0이면 안 누름
let renderQueued = false;
function releasePress() {
  pressing = 0;
  if (renderQueued) {
    renderQueued = false;
    render();
  }
}
document.addEventListener('pointerdown', () => { pressing = Date.now(); }, true);
document.addEventListener('pointerup', () => setTimeout(releasePress, 60), true);
document.addEventListener('pointercancel', releasePress, true);

function render() {
  // 손이 떨어졌는데 이벤트를 놓친 경우를 대비해 1초가 넘으면 무시한다
  if (pressing && Date.now() - pressing < 1000) {
    renderQueued = true;
    return;
  }
  const banner = online ? '' : '<div class="banner">연결이 끊겼어요. 다시 연결하는 중…</div>';
  let html;
  if (!S) html = renderHome();
  else if (S.phase === 'lobby') html = renderLobby();
  else if (S.kind === 'uno') html = renderUno();
  else if (S.kind === 'bang') html = renderBang();
  else if (S.kind === 'mafia') html = renderMafia();
  else if (GAME_UI[S.kind]) html = GAME_UI[S.kind].render();
  else html = renderGame();
  if (S && S.phase !== 'lobby') html = withGuideBar(html);
  if (S) html += guideIntroHtml();
  document.title = S ? `${APP_NAME}:${gameName(S.kind)}` : APP_NAME;
  const toast = ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : '';
  const active = document.activeElement;
  const keep = active && active.id ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
  $app.innerHTML = banner + html + toast;
  if (typeof mafiaAfterRender === 'function') mafiaAfterRender();
  uiGames().forEach((g) => g.afterRender && g.afterRender());
  guideAfterRender();
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(keep.s, keep.e); } catch { /* noop */ }
    }
  }
}

// 게임 화면의 맨 위 줄(.top) 바로 아래에 초보자 가이드 띠를 끼운다
function withGuideBar(html) {
  const bar = guideBarHtml();
  if (!bar) return html;
  const at = html.indexOf('class="top"');
  const end = at < 0 ? -1 : html.indexOf('</div>', at);
  return end < 0 ? bar + html : html.slice(0, end + 6) + bar + html.slice(end + 6);
}

function renderHome() {
  const gameList = [
    ['avalon', '🛡️ 아발론', '5~10명'], ['mafia', '🕵️ 마피아', '5~12명'], ['uno', '🃏 우노', '2~10명'], ['bang', '🤠 뱅!', '4~7명'],
    ...Object.entries(GAME_UI).map(([k, g]) => [k, g.label, g.range]),
  ];
  const gameBtn = (g, label, sub) => `<button class="gamebtn ${ui.game === g ? 'on' : ''}" data-act="setgame" data-game="${g}"><b>${label}</b><small>${sub}</small></button>`;
  const ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    return s < 10 ? '방금' : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`;
  };
  // 비밀번호 칸: 목록에서 고른 비밀번호 방 바로 아래에 연다
  const pwBox = () => `<div class="pwbox">
      <label class="field">방 비밀번호
        <input type="text" id="joinpw" maxlength="20" autocomplete="off" value="${esc(ui.joinPw)}" placeholder="방장에게 받은 비밀번호" />
      </label>
      <div class="row2"><button class="primary" data-act="join">들어가기</button><button class="ghost" data-act="pwcancel">취소</button></div>
    </div>`;
  // 방 목록: 게임, 방장 이름, 인원, 공개/비밀번호, 게임 중 여부만 보여 준다
  const roomRow = (r) => `<button class="roomrow ${ui.needPw && ui.code === r.code ? 'picked' : ''}" data-act="pickroom" data-code="${esc(r.code)}" data-locked="${r.locked ? 1 : 0}">
      <span class="ri"><b>${esc(gameName(r.kind) || r.kind)}</b><small>방장 ${esc(r.host)}</small></span>
      <span class="rc"><span>${r.players}${r.max ? `/${r.max}` : ''}명</span>
        <span class="tags">${r.playing ? '<span class="tag play">게임 중</span>' : ''}${r.locked ? '<span class="tag lock">🔒 비밀번호</span>' : '<span class="tag open">공개</span>'}</span></span>
    </button>${ui.needPw && ui.code === r.code ? pwBox() : ''}`;
  const roomBody = ui.rooms === null
    ? `<p class="dim small center">${online ? '방 목록을 불러오는 중…' : '연결되면 방 목록을 불러와요.'}</p>`
    : ui.rooms.length === 0
      ? '<p class="dim small center">지금 열린 방이 없어요. 위에서 새로 만들어 보세요.</p>'
      : `<div class="roomlist">${ui.rooms.map(roomRow).join('')}</div>`;
  return `
  <h1>🎲 ${APP_NAME}<small>친구들과 폰으로 같이 하는 보드게임</small></h1>
  <div class="card">
    <label class="field">내 이름 (8자까지)
      <input type="text" id="name" maxlength="8" autocomplete="off" value="${esc(ui.name)}" placeholder="예: 민수" />
    </label>
    <p class="field" style="margin-bottom:6px">무슨 게임을 할까요?</p>
    <div class="gamegrid">
      ${gameList.map(([k, label, range]) => gameBtn(k, label, range)).join('')}
    </div>
    <div class="seg2" role="group" aria-label="방 공개 설정">
      <button class="${ui.locked ? '' : 'on'}" data-act="setaccess" data-v="0">🔓 공개방</button>
      <button class="${ui.locked ? 'on' : ''}" data-act="setaccess" data-v="1">🔒 비밀번호 방</button>
    </div>
    ${ui.locked
      ? `<label class="field">방 비밀번호 (20자까지)
      <input type="text" id="createpw" maxlength="20" autocomplete="off" value="${esc(ui.createPw)}" placeholder="예: 1234" />
    </label>`
      : '<p class="dim small">공개방은 방 목록에서 누구나 눌러서 들어올 수 있어요.</p>'}
    <button class="primary" data-act="create">${gameName(ui.game)} ${ui.locked ? '비밀번호 ' : ''}방 만들기</button>
  </div>
  <div class="card">
    <div class="listhead"><h2>방 목록${ui.roomsAt ? ` <small>${ago(ui.roomsAt)} 기준</small>` : ''}</h2>
      <button class="sm ghost" data-act="roomsrefresh" ${ui.roomsLoading && ui.rooms !== null ? 'disabled' : ''}>${ui.roomsLoading && ui.rooms !== null ? '불러오는 중…' : '↻ 새로고침'}</button></div>
    ${roomBody}
  </div>
  <div class="card">${AVALON_RULES_HTML}${MAFIA_RULES_HTML}${UNO_RULES_HTML}${BANG_RULES_HTML}${uiGames().map((g) => g.rules).join('')}</div>`;
}

function renderLobby() {
  const isHost = S.hostId === S.me;
  const n = S.players.length;
  const { minPlayers: min, maxPlayers: max } = S;
  const shown = Math.max(n + (n < max ? 1 : 0), min); // 우노는 빈 자리를 한 칸만 보여준다
  const slots = [];
  for (let i = 0; i < shown; i++) {
    const p = S.players[i];
    if (!p) {
      slots.push('<div class="slot empty">빈 자리</div>');
      continue;
    }
    slots.push(`<div class="slot">
      <span class="dot ${p.connected ? '' : 'off'}"></span>
      <span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span>
      ${p.id === S.hostId ? '<span class="tag host">방장</span>' : ''}
      ${p.wins ? `<span class="tag">🏆 ${p.wins}</span>` : ''}
      ${isHost && p.id !== S.me ? `<button class="sm ghost" data-act="kick" data-id="${p.id}">내보내기</button>` : ''}
    </div>`);
  }
  const allOn = S.players.every((p) => p.connected);
  const ready = n >= min && n <= max && allOn;
  const startLabel = n < min ? `${min - n}명 더 필요해요` : allOn ? '게임 시작' : '접속이 끊긴 사람이 있어요';
  let action;
  if (isHost) {
    action = `<button class="primary" data-act="start" ${ready ? '' : 'disabled'}>${startLabel}</button>`;
  } else {
    action = '<p class="dim center">방장이 시작하길 기다리는 중…</p>';
  }
  const count = min === max ? `${max}명` : `${min}~${max}명`;
  return `
  <h1>대기실<small>${APP_NAME}:${gameName(S.kind)} · ${count}</small></h1>
  <div class="card">
    <p class="dim center small">친구들은 방 목록에서 이 방을 눌러 들어와요</p>
    <p class="dim center small">${S.locked ? '🔒 비밀번호 방 · 비밀번호를 아는 사람만 들어올 수 있어요' : '🔓 공개방 · 방 목록에서 누구나 들어올 수 있어요'}</p>
    <div class="slots">${slots.join('')}</div>
    ${S.kind === 'mafia' ? mafiaLobbyOptions(isHost) : ''}
    ${GAME_UI[S.kind] && GAME_UI[S.kind].lobbyOptions ? GAME_UI[S.kind].lobbyOptions(isHost) : ''}
    ${guideLobbyHtml(S.kind)}
    ${action}
  </div>
  <div class="card">${rulesHtml(S.kind)}</div>
  <div class="foot"><button class="ghost" data-act="leave">방 나가기</button></div>`;
}

function renderTrack() {
  const circles = S.teamSizes.map((size, i) => {
    const r = S.results[i];
    const cls = r ? (r.ok ? 'ok' : 'bad') : i === S.round && S.phase !== 'over' && S.phase !== 'assassin' ? 'cur' : '';
    const label = r ? (r.ok ? '성공' : `실패 ${r.fails}`) : `${size}명`;
    const two = S.failsNeeded[i] > 1 ? '<em class="need" title="실패 카드 2장 필요">2</em>' : '';
    return `<div class="q ${cls}">${r ? (r.ok ? '✓' : '✗') : size}${two}<small>${label}</small></div>`;
  }).join('');
  const rej = Array.from({ length: S.maxRejects }, (_, i) => `<i class="${i < S.rejects ? 'on' : ''}"></i>`).join('');
  return `<div class="card"><div class="track">${circles}</div>
    <div class="rejects">연속 부결 ${rej}</div>
    ${S.failsNeeded.some((n) => n > 1) ? '<p class="dim small center" style="margin:6px 0 0"><em class="need inline">2</em> 표시 원정은 실패 카드가 2장 나와야 실패예요.</p>' : ''}</div>`;
}

function playerCard(p, o = {}) {
  const cls = ['p'];
  if (p.id === S.me) cls.push('me');
  if (o.team) cls.push('team');
  if (o.sel) cls.push('sel');
  if (o.vote === true) cls.push('vy');
  if (o.vote === false) cls.push('vn');
  let sub = o.sub || '';
  if (p.role) {
    const r = S.roleNames[p.role];
    cls.push(r.team === 'good' ? 'good-r' : 'evil-r');
    sub = r.name;
  }
  const mark = p.id === S.leaderId && S.phase !== 'over' ? '<span class="crown">👑</span>' : `<span class="dot ${p.connected ? '' : 'off'}"></span>`;
  const attrs = o.sel ? ` data-act="pick" data-id="${p.id}"` : '';
  const tag = o.sel ? 'button' : 'div';
  return `<${tag} class="${cls.join(' ')}"${attrs}>${mark}${esc(p.name)}${p.id === S.me ? ' (나)' : ''}<span class="sub">${sub}</span></${tag}>`;
}

function renderGame() {
  const isHost = S.hostId === S.me;
  const phase = S.phase;
  const isLeader = S.leaderId === S.me;
  const connectedCount = S.players.filter((p) => p.connected).length;
  const ackCount = S.players.filter((p) => p.acked).length;
  const meP = byId(S.me);
  const marked = new Set(phase === 'propose' ? S.draft : S.team);

  let panel = '';
  let cards = '';

  const playersHtml = (fn) => `<div class="players">${S.players.map((p) => playerCard(p, fn(p))).join('')}</div>`;

  if (phase === 'roles') {
    const ri = S.roleInfo;
    const comp = S.composition;
    const compHtml = comp
      ? `<p class="dim small center" style="margin:10px 0 0">이번 판 (${S.players.length}명): 선 ${comp.good} · 악 ${comp.evil}<br>${comp.roles.map((r) => `${esc(r.name)}${r.count > 1 ? ` ×${r.count}` : ''}`).join(', ')}</p>`
      : '';
    panel = `<div class="card panel"><h2>당신의 역할</h2>${roleCardHtml(ri)}${compHtml}
      ${meP.acked
        ? `<p class="progress">다른 사람을 기다리는 중 (${ackCount}/${connectedCount})</p>${isHost ? '<button class="ghost" data-act="force">기다리지 않고 시작</button>' : ''}`
        : '<button class="primary" data-act="ack" style="margin-top:12px">확인했어요</button>'}
    </div>`;
    cards = playersHtml(() => ({}));
  } else if (phase === 'propose') {
    const size = S.teamSize;
    const sel = isLeader;
    cards = playersHtml((p) => ({ team: marked.has(p.id), sel, sub: marked.has(p.id) ? '원정대' : '' }));
    panel = `<div class="card panel">
      <h2>원정대 구성</h2>
      ${isLeader
        ? `<p>당신이 리더예요. <b>${size}명</b>을 고르세요. (${S.draft.length}/${size}) 본인을 넣어도 돼요.</p>
           <button class="primary" data-act="propose" ${S.draft.length === size ? '' : 'disabled'}>이 원정대로 확정</button>`
        : `<p><b>${nm(S.leaderId)}</b>님이 원정대 <b>${size}명</b>을 고르는 중… (${S.draft.length}/${size})</p><p class="dim small">토론하며 의견을 모아 보세요.</p>`}
    </div>`;
  } else if (phase === 'vote') {
    cards = playersHtml((p) => ({ team: marked.has(p.id), sub: p.voted ? '투표 완료' : marked.has(p.id) ? '원정대' : '' }));
    const votedN = S.players.filter((p) => p.voted).length;
    panel = `<div class="card panel">
      <h2>원정대 투표</h2>
      <p><b>${nm(S.leaderId)}</b>님이 고른 원정대: <b>${nameList(S.team)}</b></p>
      ${S.myVote === null
        ? `<div class="row"><button class="yes" data-act="vote" data-v="1">찬성</button><button class="no" data-act="vote" data-v="0">반대</button></div>`
        : `<p class="big ${S.myVote ? 'ok' : 'bad'}">${S.myVote ? '찬성' : '반대'}에 투표했어요</p>`}
      <p class="progress">${votedN}/${S.players.length}명 투표 · 전원이 투표하면 한꺼번에 공개돼요</p>
    </div>`;
  } else if (phase === 'voteResult') {
    const lv = S.lastVote;
    const yes = Object.values(lv.votes).filter(Boolean).length;
    cards = playersHtml((p) => ({ team: marked.has(p.id), vote: lv.votes[p.id], sub: lv.votes[p.id] ? '찬성' : '반대' }));
    panel = `<div class="card panel">
      <h2>투표 결과</h2>
      <p class="big ${lv.approved ? 'ok' : 'bad'}">${lv.approved ? '가결 — 원정 출발!' : '부결'}</p>
      <p class="center">찬성 ${yes} · 반대 ${S.players.length - yes}${lv.approved ? '' : ` · 연속 부결 ${S.rejects}/${S.maxRejects}`}</p>
      ${lv.approved || S.rejects < S.maxRejects ? '' : '<p class="big bad">5번째 부결입니다…</p>'}
      ${ackHtml(meP, ackCount, connectedCount, isHost)}
    </div>`;
  } else if (phase === 'quest') {
    const onTeam = S.team.includes(S.me);
    cards = playersHtml((p) => ({ team: marked.has(p.id), sub: marked.has(p.id) ? (p.carded ? '카드 제출' : '원정대') : '' }));
    let body;
    if (!onTeam) {
      body = '<p class="center">원정대원이 카드를 내는 중…</p>';
    } else if (S.myCard !== null) {
      body = '<p class="big gold">카드를 냈어요</p>';
    } else {
      const good = S.roleInfo.team === 'good';
      body = `<p class="center">몰래 카드를 내세요. ${good ? '선은 <b>성공</b>만 낼 수 있어요.' : '악은 성공/실패를 고를 수 있어요.'}</p>
        <div class="row"><button class="yes" data-act="card" data-v="1">성공</button><button class="no" data-act="card" data-v="0" ${good ? 'disabled' : ''}>실패</button></div>`;
    }
    panel = `<div class="card panel"><h2>원정 중</h2>
      <p>원정대: <b>${nameList(S.team)}</b></p>
      ${S.failsNeeded[S.round] > 1 ? `<p class="small dim">이번 원정은 실패 카드 ${S.failsNeeded[S.round]}장이 나와야 실패예요.</p>` : ''}${body}
      <p class="progress">${S.cardsIn}/${S.team.length}명 제출</p></div>`;
  } else if (phase === 'questResult') {
    const q = S.lastQuest;
    cards = playersHtml((p) => ({ team: marked.has(p.id) }));
    panel = `<div class="card panel"><h2>원정 결과</h2>
      <p class="big ${q.ok ? 'ok' : 'bad'}">${q.ok ? '원정 성공!' : `원정 실패 — 실패 카드 ${q.fails}장`}</p>
      ${q.needed > 1 ? `<p class="center small">이번 원정은 실패 카드 ${q.needed}장이 나와야 실패예요.</p>` : ''}
      <p class="center dim small">누가 실패를 냈는지는 공개되지 않아요.</p>
      ${ackHtml(meP, ackCount, connectedCount, isHost)}
    </div>`;
  } else if (phase === 'assassin') {
    const amAssassin = S.roleInfo && S.roleInfo.key === 'assassin';
    const sel = amAssassin;
    cards = playersHtml((p) => ({ sel: sel && p.id !== S.me, sub: '' }));
    panel = `<div class="card panel"><h2>암살 단계</h2>
      <p class="big gold">선이 3번 성공했어요!</p>
      ${amAssassin
        ? '<p class="center">멀린이라고 생각하는 사람을 눌러 고르세요. 맞히면 악의 역전승!</p>'
        : '<p class="center">암살자가 멀린을 찾는 중입니다. 숨죽이고 기다리세요…</p>'}
    </div>`;
  } else if (phase === 'over') {
    const goodWon = S.winner === 'good';
    cards = playersHtml((p) => ({ sub: '', team: p.id === S.assassinTarget }));
    panel = `<div class="card panel"><h2>게임 끝</h2>
      <p class="big ${goodWon ? 'ok' : 'bad'}">${goodWon ? '선의 승리!' : '악의 승리!'}</p>
      <p class="center">${REASONS[S.reason] || ''}</p>
      ${S.assassinTarget ? `<p class="center dim small">암살자의 선택: ${nm(S.assassinTarget)}</p>` : ''}
      ${isHost
        ? `<button class="primary" data-act="restart" style="margin-top:8px">같은 멤버로 바로 다시 하기</button>
           <button data-act="again" style="margin-top:8px">대기실로 돌아가기</button>`
        : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
    </div>`;
  }

  const title = { roles: '역할 확인', propose: '원정대 구성', vote: '투표', voteResult: '투표 결과', quest: '원정', questResult: '원정 결과', assassin: '암살', over: '게임 끝' }[phase];
  return `
  <div class="top"><span>${roomTag()}</span><span>${S.round + 1 > 5 ? 5 : S.round + 1}라운드 · ${title}</span></div>
  ${phase === 'roles' ? '' : renderTrack()}
  ${panel}
  ${cards}
  <div class="foot">
    <button data-act="role">🎭 내 역할</button>
    <button data-act="history">📜 기록</button>
    ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
  </div>
  ${ui.roleOpen ? `<div class="overlay" data-act="closeall"><div class="sheet">${roleCardHtml(S.roleInfo)}<button data-act="closeall">닫기</button></div></div>` : ''}
  ${ui.hostOpen && isHost ? hostMenuHtml() : ''}
  ${ui.historyOpen ? `<div class="overlay" data-act="closeall"><div class="sheet"><h2>지난 기록</h2>${historyHtml()}<button data-act="closeall">닫기</button></div></div>` : ''}`;
}

function hostMenuHtml() {
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 사라지고, 모두에게 바로 반영돼요.</p>
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 역할을 새로 배정하고 처음부터 다시 시작할까요?">처음부터 다시 시작 (역할 새로 배정)</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요?">초기화하고 대기실로 돌아가기</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

// 새 게임들이 같이 쓰는 방장 메뉴 / 종료 화면 버튼
function genericHostMenu(forceLabel, forceConfirm) {
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 바로 바뀌어요.</p>
    ${forceLabel ? `<button data-act="force" data-confirm="${esc(forceConfirm || '정말 넘길까요?')}">${esc(forceLabel)}</button>` : ''}
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 처음부터 다시 시작할까요?">처음부터 다시 시작</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요?">초기화하고 대기실로</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

function genericOverButtons(isHost) {
  return isHost
    ? `<button class="primary" data-act="restart" style="margin-top:10px">같은 멤버로 바로 다시 하기</button>
       <button data-act="again" style="margin-top:8px">대기실로 돌아가기</button>`
    : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>';
}

function ackHtml(meP, ackCount, connectedCount, isHost) {
  if (meP.acked) {
    return `<p class="progress">다른 사람을 기다리는 중 (${ackCount}/${connectedCount})</p>${isHost ? '<button class="ghost" data-act="force">기다리지 않고 넘어가기</button>' : ''}`;
  }
  return '<button class="primary" data-act="ack" style="margin-top:10px">확인</button>';
}

function roleCardHtml(ri) {
  if (!ri) return '<p class="dim">역할이 아직 없어요.</p>';
  const night = ri.night
    ? `<div class="night"><div class="t">${esc(ri.night.title)}</div><div class="n">${ri.night.names.length ? ri.night.names.map(esc).join(', ') : '없음'}</div></div>`
    : '';
  return `<div class="rolecard ${ri.team}"><div class="side">${sideLabel(ri.team)}</div><div class="rn">${esc(ri.name)}</div><div class="desc">${esc(ri.desc)}</div>${night}</div>`;
}

function historyHtml() {
  if (!S.history.length) return '<p class="dim">아직 기록이 없어요.</p>';
  return S.history.map((h) => {
    const votes = S.players.map((p) => `<span class="${h.votes[p.id] ? 'y' : 'n'}">${esc(p.name)} ${h.votes[p.id] ? '○' : '✕'}</span>`).join(' · ');
    const result = !h.approved ? '<span class="n">부결</span>' : h.quest ? (h.quest.ok ? '<span class="y">원정 성공</span>' : `<span class="n">원정 실패 (실패 ${h.quest.fails}장)</span>`) : '진행 중';
    return `<div class="card"><p><b>${h.round}라운드 ${h.attempt}번째 제안</b> · 리더 ${nm(h.leader)}</p>
      <p class="small">원정대: ${nameList(h.team)}</p><p class="small">${votes}</p><p class="small">결과: ${result}</p></div>`;
  }).reverse().join('');
}

// ---- 이벤트 ----

$app.addEventListener('input', (e) => {
  if (e.target.id === 'name') { ui.name = e.target.value; }
  if (e.target.id === 'createpw') { ui.createPw = e.target.value; }
  if (e.target.id === 'joinpw') { ui.joinPw = e.target.value; }
});

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  // 오버레이 배경을 눌렀을 때만 닫고, 시트 안쪽 클릭은 무시
  if (act === 'closeall' && el.classList.contains('overlay') && e.target !== el) return;
  if (el.dataset.confirm && !window.confirm(el.dataset.confirm)) return;
  if (guideClick(act, el, e)) return;
  if (typeof unoClick === 'function' && unoClick(act, el)) return;
  if (typeof bangClick === 'function' && bangClick(act, el)) return;
  if (typeof mafiaClick === 'function' && mafiaClick(act, el)) return;
  if (uiGames().some((g) => g.click && g.click(act, el))) return;
  switch (act) {
    case 'setgame':
      ui.game = allGames().includes(el.dataset.game) ? el.dataset.game : 'avalon';
      save(GAME_KEY, ui.game);
      render();
      break;
    case 'create': {
      const name = ui.name.trim();
      if (!name) return showToast('이름을 먼저 입력하세요.');
      if (ui.locked && !ui.createPw.trim()) return showToast('방 비밀번호를 입력하세요.');
      save(NAME_KEY, name);
      send({ t: 'create', name, game: ui.game, locked: ui.locked, password: ui.locked ? ui.createPw.trim() : '' });
      break;
    }
    case 'join': {
      const name = ui.name.trim();
      if (!name) return showToast('이름을 먼저 입력하세요.');
      if (ui.code.trim().length !== 4) return showToast('들어갈 방을 방 목록에서 고르세요.');
      save(NAME_KEY, name);
      send({ t: 'join', name, code: ui.code.trim(), password: ui.joinPw });
      break;
    }
    case 'setaccess': ui.locked = el.dataset.v === '1'; render(); break;
    case 'pwcancel': ui.needPw = false; ui.joinPw = ''; render(); break;
    case 'roomsrefresh': requestRooms(); render(); break;
    case 'pickroom': {
      // 목록에서 고른 방: 공개방은 바로 들어가고, 비밀번호 방은 아래 비밀번호 칸을 연다
      const name = ui.name.trim();
      if (ui.code !== el.dataset.code) ui.joinPw = '';
      ui.code = el.dataset.code;
      ui.needPw = false;
      if (!name) {
        focusLater('name');
        return showToast('이름을 먼저 입력하세요.');
      }
      if (el.dataset.locked === '1') {
        ui.needPw = true;
        ui.joinPw = '';
        focusLater('joinpw');
        return showToast('비밀번호를 입력하고 들어가기를 누르세요.');
      }
      save(NAME_KEY, name);
      send({ t: 'join', name, code: ui.code });
      break;
    }
    case 'kick': send({ t: 'kick', target: el.dataset.id }); break;
    case 'leave':
      send({ t: 'leave' });
      break;
    case 'start': send({ t: 'start' }); break;
    case 'ack': send({ t: 'ack' }); break;
    case 'force': send({ t: 'force' }); break;
    case 'again': send({ t: 'again' }); break;
    case 'restart': send({ t: 'restart' }); break;
    case 'hostmenu': ui.hostOpen = true; render(); break;
    case 'pick': onPick(el.dataset.id); break;
    case 'propose': send({ t: 'propose', team: S.draft }); break;
    case 'vote': send({ t: 'vote', approve: el.dataset.v === '1' }); break;
    case 'card': send({ t: 'card', success: el.dataset.v === '1' }); break;
    case 'role': ui.roleOpen = true; render(); break;
    case 'history': ui.historyOpen = true; render(); break;
    case 'closeall': ui.roleOpen = ui.historyOpen = ui.hostOpen = ui.colorOpen = ui.bInfo = ui.mInfo = false; ui.bPick = null; uiGames().forEach((g) => g.closeAll && g.closeAll()); render(); break;
    default: break;
  }
});

function onPick(id) {
  if (S.phase === 'propose' && S.leaderId === S.me) {
    const cur = new Set(S.draft);
    if (cur.has(id)) cur.delete(id);
    else if (cur.size >= S.teamSize) return showToast(`${S.teamSize}명까지만 고를 수 있어요. 한 명을 빼고 고르세요.`);
    else cur.add(id);
    send({ t: 'draft', team: [...cur] });
  } else if (S.phase === 'assassin' && S.roleInfo && S.roleInfo.key === 'assassin') {
    const p = byId(id);
    if (window.confirm(`${p.name}님이 멀린이라고 지목할까요?`)) send({ t: 'assassinate', target: id });
  }
}

render();
connect();
