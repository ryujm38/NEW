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
let everOnline = false; // 한 번이라도 연결됐는지
const loadedAt = Date.now();
setTimeout(() => { if (!online) render(); }, 2100); // 2초가 지나도 연결이 안 되면 안내를 띄운다
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
    everOnline = true;
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
        ui.pwError = ui.joinPw ? m.msg : ''; // 입력해서 틀린 경우에만 칸 아래에 표시
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
  rejects: '원정대가 5번 연속 부결됐어요.',
  quests: '원정이 3번 실패했어요.',
  merlin: '암살자가 멀린을 찾아냈어요!',
  missed: '암살자가 멀린을 찾지 못했어요.',
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
  const showOffline = !online && (everOnline || Date.now() - loadedAt > 2000);
  const banner = showOffline ? `<div class="banner">${everOnline ? '연결이 끊겼어요. 다시 연결하는 중…' : '서버에 연결하는 중이에요…'}</div>` : '';
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

// ---- 첫 화면·대기실 꾸밈: 게임마다 색과 작은 문장(직접 그린 SVG, 48×48) ----

// n갈래 별 (보안관 배지·카지노 칩에 쓴다)
function hmStar(cx, cy, R, r, n) {
  let d = '';
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}
function hmTips(cx, cy, R, n, rr, fill) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    s += `<circle cx="${(cx + R * Math.cos(a)).toFixed(1)}" cy="${(cy + R * Math.sin(a)).toFixed(1)}" r="${rr}" fill="${fill}"/>`;
  }
  return s;
}

// c: 게임 색(밝은 쪽, 글자는 어두운 색으로 올린다) · d: 바탕용 어두운 색
const HM_GAME = {
  avalon: { c: '#9fb0ff', d: '#1a2160', art: `<circle cx="11" cy="12" r="1.3" fill="#fff"/><circle cx="15" cy="21" r=".9" fill="#fff"/><circle cx="38" cy="33" r="1" fill="#fff"/>
    <path d="M33 6a9 9 0 1 0 8.5 12.6A7 7 0 0 1 33 6Z" fill="#ffe7a3"/>
    <path d="M24 6l3 4v19h-6V10Z" fill="#eef2ff"/><path d="M24 11v17" stroke="#97a3c8" stroke-width="1.3"/>
    <rect x="15" y="28.5" width="18" height="3.6" rx="1.8" fill="#e9c46a"/><rect x="22.4" y="32" width="3.2" height="7.5" fill="#9a6a24"/><circle cx="24" cy="41.5" r="2.7" fill="#e9c46a"/>` },
  mafia: { c: '#ff6b78', d: '#3a0d16', art: `<path d="M6 43h36" stroke="#ffffff2a" stroke-width="2" stroke-linecap="round"/>
    <path d="M10.5 31c0-13 4.5-20 13.5-20s13.5 7 13.5 20Z" fill="#24242c" stroke="#ffffff4a" stroke-width="1.2"/><path d="M18 12.5q6 5.5 12 0" fill="none" stroke="#000" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M10.5 25.5h27v5.5h-27Z" fill="#ff4d5a"/><ellipse cx="24" cy="32" rx="21" ry="5.6" fill="#30303a" stroke="#ffffff4a" stroke-width="1.2"/>
    <path d="M15 23c0-5 2-8.5 5.5-10" fill="none" stroke="#ffffff50" stroke-width="2.2" stroke-linecap="round"/>` },
  uno: { c: '#ffd23f', d: '#3a2508', art: `<g stroke="#fff" stroke-width="2"><rect x="9" y="12" width="16" height="23" rx="3.2" fill="#3b82e0" transform="rotate(-20 17 36)"/>
    <rect x="16" y="10" width="16" height="23" rx="3.2" fill="#35a862"/><rect x="23" y="12" width="16" height="23" rx="3.2" fill="#e0453a" transform="rotate(20 31 36)"/></g>
    <ellipse cx="31.5" cy="24" rx="4.2" ry="7" fill="#fff" transform="rotate(38 31.5 24)"/><ellipse cx="31.5" cy="24" rx="2.2" ry="4.2" fill="#f0c331" transform="rotate(38 31.5 24)"/>` },
  bang: { c: '#f0954a', d: '#3a1d0b', art: `<path d="${hmStar(24, 24, 17, 8.5, 6)}" fill="#f3c45a" stroke="#7a4a1c" stroke-width="1.6" stroke-linejoin="round"/>
    ${hmTips(24, 24, 17, 6, 2.6, '#f3c45a')}<circle cx="24" cy="24" r="6.5" fill="#d99a35" stroke="#7a4a1c" stroke-width="1.4"/>
    <path d="M20 20.5l4-1.5 4 1.5" fill="none" stroke="#fff5d0" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>` },
  splendor: { c: '#c98bff', d: '#2a1240', art: `<path d="M12 18l6-8h12l6 8L24 40Z" fill="#9b55ea"/><path d="M12 18l6-8h12l6 8Z" fill="#e5ccff"/>
    <path d="M12 18L24 40l-5-22Z" fill="#c792ff"/><path d="M36 18L24 40l5-22Z" fill="#6f2fc0"/>
    <path d="M12 18h24M18 10l1 8 5-8 5 8 1-8M19 18l5 22 5-22" fill="none" stroke="#ffffffa0" stroke-width="1" stroke-linejoin="round"/>
    <path d="M38 7l1 2.5 2.5 1-2.5 1L38 14l-1-2.5-2.5-1 2.5-1Z" fill="#fff"/>` },
  marble: { c: '#4cc9ff', d: '#0b2a44', art: `<rect x="8" y="8" width="32" height="32" rx="4" fill="#eaf6ff"/>
    <rect x="11" y="11" width="26" height="26" fill="none" stroke="#2f7fd6" stroke-width="5" stroke-dasharray="4.2 1.3"/>
    <rect x="8.5" y="8.5" width="7" height="7" rx="1.5" fill="#ff5a5a"/><rect x="32.5" y="8.5" width="7" height="7" rx="1.5" fill="#ffc531"/>
    <rect x="8.5" y="32.5" width="7" height="7" rx="1.5" fill="#35b36a"/><rect x="32.5" y="32.5" width="7" height="7" rx="1.5" fill="#9b6cff"/>
    <rect x="18" y="18" width="12" height="12" rx="2.6" fill="#fff" stroke="#b9cbe0"/><circle cx="21.5" cy="21.5" r="1.4" fill="#e0453a"/><circle cx="24" cy="24" r="1.4" fill="#e0453a"/><circle cx="26.5" cy="26.5" r="1.4" fill="#e0453a"/>` },
  bohnanza: { c: '#98d65a', d: '#1f3010', art: `<path d="M27 13c.5-4.5 3.5-7 8-7-.3 4.3-3.4 6.8-8 7Z" fill="#c6f28a"/><path d="M26.5 14c.6-2.4 2-4.2 4-5.4" fill="none" stroke="#5e9a2a" stroke-width="1.2"/>
    <path d="M14.5 31c-4.5-8 0-18 9.5-19.5 8.5-1.3 13.5 4.5 11.5 10.5-1 3-3.8 4-3.8 7s3 5 1 8c-3 4.5-13.5 2.5-18.2-6Z" fill="#c8633a"/>
    <path d="M18.5 20.5c1.8-3.6 4.6-5 7.6-5.2" fill="none" stroke="#ffd2b0" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="20.5" cy="26" r="1.7" fill="#2a1408"/><circle cx="27" cy="25" r="1.7" fill="#2a1408"/><path d="M21 31q3 2.4 6-.6" fill="none" stroke="#2a1408" stroke-width="1.5" stroke-linecap="round"/>` },
  vegas: { c: '#ff5fbf', d: '#3a0c34', art: `<circle cx="24" cy="24" r="17" fill="#e8379b"/><circle cx="24" cy="24" r="14.5" fill="none" stroke="#fff" stroke-width="5" stroke-dasharray="5.4 6"/>
    <circle cx="24" cy="24" r="10" fill="#2a1038" stroke="#ffd76a" stroke-width="1.6"/><path d="${hmStar(24, 24, 6.5, 2.7, 5)}" fill="#ffd76a"/>` },
  duel: { c: '#e2b46a', d: '#3a250d', art: `<path d="M9 17.5L24 9l15 8.5Z" fill="#f3e7cb"/><circle cx="24" cy="14.5" r="1.6" fill="#a97b32"/><rect x="9.5" y="18.5" width="29" height="3" fill="#f3e7cb"/>
    <g fill="#f3e7cb"><rect x="12" y="22.5" width="3.6" height="12"/><rect x="19" y="22.5" width="3.6" height="12"/><rect x="25.4" y="22.5" width="3.6" height="12"/><rect x="32.4" y="22.5" width="3.6" height="12"/></g>
    <rect x="9" y="35" width="30" height="3.2" fill="#f3e7cb"/><rect x="6.5" y="38.6" width="35" height="3" rx="1" fill="#dcc79a"/>` },
  // 클루: 돋보기와 보물 지도
  clue: { c: '#f2c66d', d: '#3b2410', art: `<rect x="7" y="9" width="27" height="31" rx="3" fill="#f3e2b8"/><path d="M11 17h14M11 22h10M11 27h12" stroke="#b08a52" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M24 31l3-3m-3 0l3 3" stroke="#c0392b" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="31" cy="27" r="7.5" fill="#bde3ff55" stroke="#f2c66d" stroke-width="3"/><path d="M36.5 32.5l5 5" stroke="#9a6a24" stroke-width="4" stroke-linecap="round"/>` },
  // 다빈치 코드: 검정·흰색 숫자 타일
  davinci: { c: '#5ce0c6', d: '#0b3a35', art: `<rect x="7" y="12" width="15" height="24" rx="3" fill="#1b1f2e" stroke="#5ce0c6" stroke-width="1.4"/><text x="14.5" y="29" text-anchor="middle" font-size="12" font-weight="900" fill="#f2f4fb">7</text>
    <rect x="26" y="12" width="15" height="24" rx="3" fill="#f2f4fb" stroke="#5ce0c6" stroke-width="1.4"/><text x="33.5" y="29" text-anchor="middle" font-size="12" font-weight="900" fill="#1b1f2e">?</text>
    <path d="M7 39h34" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>` },
  // 더 크루: 로켓과 별
  crew: { c: '#8fb4ff', d: '#101a44', art: `<circle cx="10" cy="11" r="1.2" fill="#fff"/><circle cx="39" cy="15" r="1" fill="#fff"/><circle cx="35" cy="38" r="1.2" fill="#fff"/>
    <path d="M24 6c6 5 8 12 7 20l-7 6-7-6c-1-8 1-15 7-20Z" fill="#eef2ff"/><circle cx="24" cy="17" r="3.2" fill="#8fb4ff"/>
    <path d="M17 26l-5 6 6-1M31 26l5 6-6-1" fill="#ff6b78"/><path d="M21 33l3 8 3-8Z" fill="#ffb84d"/>` },
};
const HM_DICE = `<rect x="10" y="10" width="28" height="28" rx="6" fill="#f2f4fb"/><circle cx="17" cy="17" r="2.6" fill="#1b1f2e"/><circle cx="24" cy="24" r="2.6" fill="#1b1f2e"/><circle cx="31" cy="31" r="2.6" fill="#1b1f2e"/>`;
const hmGame = (kind) => HM_GAME[kind] || { c: '#c9cee6', d: '#262a3c', art: HM_DICE };
const hmVars = (kind) => `--gc:${hmGame(kind).c};--gd:${hmGame(kind).d}`;
const hmEmblem = (kind, cls = '') => `<span class="hm-em ${cls}" style="${hmVars(kind)}" aria-hidden="true"><svg viewBox="0 0 48 48" focusable="false">${hmGame(kind).art}</svg></span>`;
// 첫 화면의 게임 목록: [종류, 버튼 글자, 인원]
const hmGameList = () => [
  ['avalon', '🛡️ 아발론', '5~10명'], ['mafia', '🕵️ 마피아', '5~12명'], ['uno', '🃏 우노', '2~10명'], ['bang', '🤠 뱅!', '4~7명'],
  ...Object.entries(GAME_UI).map(([k, g]) => [k, g.label, g.range]),
];
// 그 게임의 최소 인원 ('5~10명' → 5). 모르면 0
const hmMin = (kind) => {
  const g = hmGameList().find(([k]) => k === kind);
  return g ? parseInt(String(g[2]), 10) || 0 : 0;
};
// 규칙 접기 제목 앞에 그 게임 문장을 붙인다. 첫 화면(목록)에서는 제목을 "게임 이름 + 인원"으로 줄인다
const hmRules = (kind, range = '') => `<div class="hm-rule" style="${hmVars(kind)}">${rulesHtml(kind).replace(/<summary>[^<]*<\/summary>|<summary>/, (m) => (range
  ? `<summary>${hmEmblem(kind, 'sm')}<span class="hm-rn">${esc(gameName(kind) || kind)}</span><small class="hm-rr">${esc(range)}</small></summary>`
  : `${m}`.replace('<summary>', `<summary>${hmEmblem(kind, 'sm')}`)))}</div>`;

function renderHome() {
  const gameList = hmGameList();
  const gameBtn = (g, label, sub) => {
    const on = ui.game === g;
    return `<button class="hm-game ${on ? 'on' : ''}" data-act="setgame" data-game="${g}" style="${hmVars(g)}" aria-pressed="${on}">
      ${HM_GAME[g] ? hmEmblem(g) : `<span class="hm-em" aria-hidden="true">${esc(String(label).split(' ')[0])}</span>`}
      <b>${esc(gameName(g) || label)}</b><small>${esc(sub)}</small>${on ? '<i class="hm-check" aria-hidden="true">✓</i>' : ''}</button>`;
  };
  const ago = (t) => {
    const s = Math.round((Date.now() - t) / 1000);
    return s < 10 ? '방금' : s < 60 ? `${s}초 전` : `${Math.floor(s / 60)}분 전`;
  };
  // 비밀번호 칸: 목록에서 고른 비밀번호 방 바로 아래에 연다
  const pwBox = () => `<div class="pwbox hm-pw">
      <label class="field">🔒 방 비밀번호
        <input type="text" id="joinpw" maxlength="20" autocomplete="off" value="${esc(ui.joinPw)}" placeholder="방장에게 받은 비밀번호" />
      </label>
      ${ui.pwError ? `<p class="hm-pwerr" role="alert">⚠️ ${esc(ui.pwError)}</p>` : ''}
      <div class="row2"><button class="primary" data-act="join">들어가기</button><button class="ghost" data-act="pwcancel">취소</button></div>
    </div>`;
  // 방 목록 한 줄: 문장 | 게임·방장·상태 꼬리표 | 큰 인원 숫자
  const roomRow = (r) => {
    const picked = ui.needPw && ui.code === r.code;
    const full = !r.playing && r.max && r.players >= r.max;
    const need = r.playing || full ? 0 : Math.max(0, hmMin(r.kind) - r.players);
    const state = r.playing ? '<span class="tag play">게임 중</span>'
      : full ? '<span class="tag full">가득 찼어요</span>'
        : need ? `<span class="tag need">${need}명 더 필요</span>` : '';
    return `<button class="hm-room ${picked ? 'picked' : ''} ${r.playing || full ? 'busy' : ''}" data-act="pickroom" data-code="${esc(r.code)}" data-locked="${r.locked ? 1 : 0}" style="${hmVars(r.kind)}">
      ${hmEmblem(r.kind)}
      <span class="hm-ri"><b>${esc(gameName(r.kind) || r.kind)}</b><span class="hm-host">👑 <em>${esc(r.host)}</em></span>
        <span class="tags">${state}${r.locked ? '<span class="tag lock">🔒 비밀번호</span>' : '<span class="tag open">공개</span>'}</span></span>
      <span class="hm-cnt" aria-label="${r.players}명${r.max ? ` / 최대 ${r.max}명` : ''}"><b>${r.players}</b>${r.max ? `<i>/${r.max}</i>` : ''}<small>명</small></span>
      <span class="hm-go" aria-hidden="true">›</span>
    </button>${picked ? pwBox() : ''}`;
  };
  const skeleton = '<div class="hm-skel" aria-hidden="true"><i></i><i></i></div>';
  const roomBody = ui.rooms === null
    ? `${online ? skeleton : ''}<p class="hm-note">${online ? '방 목록을 불러오는 중…' : '연결되면 방 목록을 불러와요.'}</p>`
    : ui.rooms.length === 0
      ? `<div class="hm-empty">${hmEmblem('', 'ghost')}<span><b>지금 열린 방이 없어요.</b>친구가 방을 만들었다면 ↻ 새로고침을 눌러 보세요. 내가 먼저 만들려면 아래 ‘새 방 만들기’로!</span></div>`
      : `<div class="hm-rooms">${ui.rooms.map(roomRow).join('')}</div>`;
  const nRooms = ui.rooms ? ui.rooms.length : 0;
  const busy = ui.roomsLoading && ui.rooms !== null;
  const step = (n, t, sub = '') => `<div class="hm-step"><span class="hm-n">${n}</span><span>${t}${sub ? ` <small>${sub}</small>` : ''}</span></div>`;
  return `<div class="hm" style="${hmVars(ui.game)}">
  <header class="hm-hero">
    <div class="hm-fan" aria-hidden="true">${gameList.map(([k]) => hmEmblem(k)).join('')}</div>
    <h1>${APP_NAME}<small>친구들과 폰으로 같이 하는 보드게임 ${gameList.length}종</small></h1>
  </header>
  <section class="card hm-card hm-me">
    <label class="field hm-name"><span class="hm-lbl">먼저, 내 이름 <small>8자까지 · 다른 사람에게 이렇게 보여요</small></span>
      <input type="text" id="name" maxlength="8" autocomplete="off" value="${esc(ui.name)}" placeholder="예: 민수" />
    </label>
  </section>
  <section class="card hm-card hm-join" id="hm-list">
    <div class="listhead hm-lh"><h2 class="hm-h"><span class="hm-hi" aria-hidden="true">🚪</span>친구 방에 들어가기</h2>
      <button class="sm ghost hm-refresh" data-act="roomsrefresh" ${busy ? 'disabled' : ''}>${busy ? '불러오는 중…' : '↻ 새로고침'}</button></div>
    <p class="hm-note">${[nRooms ? `열린 방 <b>${nRooms}개</b>` : '', nRooms ? '방을 누르면 바로 들어가요' : '', ui.roomsAt ? `<span class="hm-ago">${ago(ui.roomsAt)} 기준</span>` : ''].filter(Boolean).join(' · ') || '친구가 만든 방이 여기에 나타나요.'}</p>
    ${roomBody}
  </section>
  <div class="hm-or" role="separator"><span>또는</span></div>
  <section class="card hm-card hm-make">
    <h2 class="hm-h"><span class="hm-hi" aria-hidden="true">✨</span>새 방 만들기 <small>내가 방장이 돼요</small></h2>
    ${step(1, '무슨 게임을 할까요?')}
    <div class="hm-grid">
      ${gameList.map(([k, label, range]) => gameBtn(k, label, range)).join('')}
    </div>
    ${step(2, '누가 들어올 수 있나요?')}
    <div class="seg2 hm-seg" role="group" aria-label="방 공개 설정">
      <button class="${ui.locked ? '' : 'on'}" data-act="setaccess" data-v="0" aria-pressed="${!ui.locked}"><b>🔓 공개방</b><small>누구나</small></button>
      <button class="${ui.locked ? 'on' : ''}" data-act="setaccess" data-v="1" aria-pressed="${ui.locked}"><b>🔒 비밀번호 방</b><small>아는 사람만</small></button>
    </div>
    ${ui.locked
      ? `<label class="field hm-cpw">방 비밀번호 (20자까지)
      <input type="text" id="createpw" maxlength="20" autocomplete="off" value="${esc(ui.createPw)}" placeholder="예: 1234" />
    </label><p class="hm-note">친구들에게 이 비밀번호를 알려 주세요.</p>`
      : '<p class="hm-note">방 목록에서 누구나 눌러서 들어올 수 있어요.</p>'}
    ${step(3, '방을 만들고 친구를 기다려요')}
    <button class="primary hm-create" data-act="create">${hmEmblem(ui.game, 'sm')}<span>${esc(gameName(ui.game))} ${ui.locked ? '비밀번호 ' : ''}방 만들기</span></button>
  </section>
  <section class="card hm-card hm-rulebox">
    <h2 class="hm-h">게임 규칙 <small>눌러서 펼쳐 보세요</small></h2>
    ${gameList.map(([k, , range]) => hmRules(k, range)).join('')}
  </section>
  </div>`;
}

function renderLobby() {
  const isHost = S.hostId === S.me;
  const n = S.players.length;
  const { minPlayers: min, maxPlayers: max } = S;
  const need = Math.max(0, min - n);
  const host = S.players.find((p) => p.id === S.hostId);
  const slots = S.players.map((p, i) => {
    const me = p.id === S.me;
    const sub = p.connected ? '' : '접속이 끊겼어요';
    return `<div class="slot lb-slot ${me ? 'me' : ''} ${p.connected ? '' : 'off'}">
      <span class="lb-av" style="--ac:${LB_AV[i % LB_AV.length]}">${esc([...p.name][0] || '?')}<span class="dot ${p.connected ? '' : 'off'}"></span></span>
      <span class="nm"><span class="lb-pn">${esc(p.name)}${me ? ' <em>(나)</em>' : ''}</span>${sub ? `<small>${sub}</small>` : ''}</span>
      ${p.id === S.hostId ? '<span class="tag host">👑 방장</span>' : ''}
      ${p.wins ? `<span class="tag">🏆 ${p.wins}</span>` : ''}
      ${isHost && p.id !== S.me ? `<button class="sm ghost lb-kick" data-act="kick" data-id="${p.id}">내보내기</button>` : ''}
    </div>`;
  });
  // 빈 자리는 한 줄로 묶는다: 꼭 필요한 자리(+n) 또는 더 들어올 수 있는 자리
  const free = max - n;
  if (need) {
    slots.push(`<div class="slot empty lb-slot lb-need"><span class="lb-av" aria-hidden="true">+${need}</span><span class="nm">빈 자리 ${need}개<small>꼭 필요한 자리예요</small></span></div>`);
  } else if (free > 0) {
    slots.push(`<div class="slot empty lb-slot"><span class="lb-av">＋</span><span class="nm">빈 자리 ${free}개<small>더 들어올 수 있어요 (없어도 시작 가능)</small></span></div>`);
  }
  const allOn = S.players.every((p) => p.connected);
  const ready = n >= min && n <= max && allOn;
  const startLabel = n < min ? `${need}명 더 필요해요` : allOn ? '게임 시작' : '접속이 끊긴 사람이 있어요';
  const count = min === max ? `${max}명` : `${min}~${max}명`;
  // 인원 막대: 칸 하나가 한 사람. 시작에 꼭 필요한 칸(최소 인원)과 더 들어올 수 있는 칸을 나눠 그린다
  const cells = (from, to) => Array.from({ length: to - from }, (_, k) => `<i class="${from + k < n ? 'on' : ''}"></i>`).join('');
  const meter = `<div class="lb-meter" aria-hidden="true" style="--a:${min};--b:${max - min}">
      <span class="lb-mg need"><span class="lb-cells">${cells(0, min)}</span><small>${min === max ? `${max}명 모두 필요` : `최소 ${min}명`}</small></span>
      ${max > min ? `<span class="lb-mg extra"><span class="lb-cells">${cells(min, max)}</span><small>최대 ${max}명</small></span>` : ''}
    </div>`;
  const status = need ? `<b>${need}명</b> 더 모이면 시작할 수 있어요`
    : !allOn ? '접속이 끊긴 사람이 있어요. 다시 들어올 때까지 기다려 주세요'
      : n >= max ? `자리가 다 찼어요. ${isHost ? '시작할 수 있어요!' : '곧 시작해요!'}`
        : `${isHost ? '시작할 수 있어요' : '시작할 수 있는 인원이에요'} · ${free}명 더 들어올 수 있어요`;
  let action;
  if (isHost) {
    action = `<button class="primary lb-start" data-act="start" ${ready ? '' : 'disabled'}>${ready ? '▶ ' : ''}${startLabel}</button>
      <p class="lb-hint">${ready ? '다 모였으면 눌러 주세요.' : need ? '사람이 다 모이면 버튼이 켜져요.' : '끊긴 사람이 다시 들어오거나, 내보내면 시작할 수 있어요.'}</p>`;
  } else {
    action = `<div class="lb-wait"><span class="lb-dots" aria-hidden="true"><i></i><i></i><i></i></span>
      <b>방장${host ? ` <em>${esc(host.name)}</em>님` : ''}이 시작하길 기다리는 중…</b>
      <small>${need ? `${need}명 더 모여야 시작할 수 있어요` : !allOn ? '접속이 끊긴 사람이 돌아오길 기다려요' : '인원이 됐어요. 곧 시작할 거예요'}</small></div>`;
  }
  // 친구 부르기 안내: 방장에게는 할 일로, 다른 사람에게는 짧은 참고로
  const hostName = host ? esc(host.name) : '';
  const invite = free <= 0 ? ''
    : isHost
      ? `<div class="lb-invite host"><b>📣 친구를 불러 주세요</b><span>첫 화면 <em>친구 방에 들어가기</em>에서 <em>👑 ${hostName}</em> 방을 누르면 들어와요.${S.locked ? ' 🔒 비밀번호도 꼭 알려 주세요.' : ''}</span></div>`
      : `<p class="lb-invite">친구를 더 부르려면: 첫 화면 방 목록에서 <em>👑 ${hostName}</em> 방을 누르면 돼요.</p>`;
  const opts = `${S.kind === 'mafia' ? mafiaLobbyOptions(isHost) : ''}${GAME_UI[S.kind] && GAME_UI[S.kind].lobbyOptions ? GAME_UI[S.kind].lobbyOptions(isHost) : ''}`;
  const mine = guideLobbyHtml(S.kind);
  return `<div class="lb ${isHost ? 'is-host' : 'is-guest'}" style="${hmVars(S.kind)}">
  <header class="lb-hero">
    ${hmEmblem(S.kind, 'lg')}
    <h1><small>대기실</small>${esc(gameName(S.kind))}</h1>
    <div class="lb-chips"><span>👥 ${count}</span><span>${S.locked ? '🔒 비밀번호 방' : '🔓 공개방'}</span></div>
  </header>
  <section class="card lb-card lb-people">
    <div class="lb-count"><span class="lb-n"><b>${n}</b>명 모였어요</span>${ready ? `<span class="lb-st ok">✓ ${isHost ? '시작 가능' : '인원 충분'}</span>` : ''}</div>
    ${meter}
    <p class="lb-status ${ready ? 'ok' : ''}">${status}</p>
    <div class="slots lb-slots">${slots.join('')}</div>
    ${invite}
  </section>
  ${isHost ? '' : `<div class="lb-act guest">${action}</div>`}
  ${opts.trim() ? `<section class="card lb-card lb-opts"><h2 class="hm-h">게임 설정 <small>${isHost ? '방장인 내가 정해요' : '모두에게 똑같이 적용돼요'}</small></h2>${opts}</section>` : ''}
  ${mine.trim() ? `<section class="card lb-card lb-mine"><h2 class="hm-h">내 설정 <small>나에게만 적용돼요</small></h2>${mine}</section>` : ''}
  ${isHost ? `<div class="lb-act host">${action}</div>` : ''}
  <section class="card lb-card hm-rulebox">${hmRules(S.kind)}</section>
  <div class="foot"><button class="ghost lb-leave" data-act="leave">방 나가기</button></div>
  </div>`;
}
// 대기실 이름 앞 동그라미 색 (자리 순서대로, 한 방 안에서 겹치지 않게)
const LB_AV = ['#7c9cff', '#ff7a85', '#ffcf4a', '#5fd39a', '#c98bff', '#4cc9ff', '#f0954a', '#ff5fbf', '#b5e35a', '#d9b98a', '#3fd6c6', '#b0b6cc'];

// ---- 아발론 그림 (공식 그림을 쓰지 않고 SVG로 새로 그린 문장들) ----

// 금속·보석 느낌 그라데이션: 아발론 화면마다 한 번 넣어 두고 아래 SVG들이 url(#…)로 쓴다
const AV_DEFS = `<svg class="av-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
<linearGradient id="avGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1bf"/><stop offset=".45" stop-color="#e2b45a"/><stop offset="1" stop-color="#8c5f1c"/></linearGradient>
<linearGradient id="avBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fb8ff"/><stop offset="1" stop-color="#1f3f9e"/></linearGradient>
<linearGradient id="avRed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a6b"/><stop offset="1" stop-color="#7d0e1c"/></linearGradient>
<linearGradient id="avSteel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6f8ff"/><stop offset=".5" stop-color="#aab5cd"/><stop offset="1" stop-color="#5b6580"/></linearGradient>
<linearGradient id="avDark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d1f2e"/><stop offset="1" stop-color="#0b060c"/></linearGradient>
<radialGradient id="avGlowG"><stop offset="0" stop-color="#ffe7a3" stop-opacity=".75"/><stop offset="1" stop-color="#ffe7a3" stop-opacity="0"/></radialGradient>
<radialGradient id="avGlowR"><stop offset="0" stop-color="#ff6a4a" stop-opacity=".7"/><stop offset="1" stop-color="#ff6a4a" stop-opacity="0"/></radialGradient>
<mask id="avMoonCut"><rect width="120" height="120" fill="#fff"/><circle cx="80" cy="46" r="36" fill="#000"/></mask>
</defs></svg>`;

// 네 갈래 반짝임
function avSpark(cx, cy, r) {
  return `M${cx} ${cy - r}Q${cx} ${cy} ${cx + r} ${cy}Q${cx} ${cy} ${cx} ${cy + r}Q${cx} ${cy} ${cx - r} ${cy}Q${cx} ${cy} ${cx} ${cy - r}Z`;
}
// 다섯 꼭지 별
function avStar5(cx, cy, R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r : R;
    d += `${i ? 'L' : 'M'}${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`;
  }
  return `${d}Z`;
}

// 역할 문장 (viewBox 120×120)
const AV_ART = {
  merlin: `<circle cx="60" cy="58" r="50" fill="url(#avGlowG)"/>
    <circle cx="86" cy="32" r="20" fill="url(#avGold)" opacity=".9"/><circle cx="96" cy="26" r="17" fill="#13224f"/>
    <ellipse cx="60" cy="88" rx="46" ry="11" fill="url(#avBlue)" stroke="#e9c46a" stroke-width="2"/>
    <path d="M70 8C62 28 52 54 38 86Q60 96 84 86C76 62 72 40 76 24C78 17 75 11 70 8Z" fill="url(#avBlue)" stroke="#e9c46a" stroke-width="2" stroke-linejoin="round"/>
    <path d="M40 78Q60 86 82 78L84 85Q60 94 37 85Z" fill="url(#avGold)"/>
    <path d="${avStar5(58, 54, 8, 3.4)}" fill="#ffe9a8"/>
    <path d="${avSpark(68, 34, 4)}" fill="#fff"/><circle cx="50" cy="69" r="2" fill="#fff"/>
    <path d="${avSpark(20, 34, 6)}" fill="#fff3c4"/><path d="${avSpark(104, 60, 5)}" fill="#fff3c4"/><path d="${avSpark(28, 64, 3)}" fill="#fff3c4"/>`,
  percival: `<circle cx="60" cy="58" r="50" fill="url(#avGlowG)"/>
    <path d="M60 10L97 22V54C97 81 81 98 60 109C39 98 23 81 23 54V22Z" fill="url(#avBlue)" stroke="url(#avGold)" stroke-width="4" stroke-linejoin="round"/>
    <path d="M60 21L87 30V54C87 75 75 88 60 97C45 88 33 75 33 54V30Z" fill="none" stroke="#ffffff3a" stroke-width="1.5"/>
    <g stroke="#ffe7a3" stroke-width="2" stroke-linecap="round" opacity=".85"><path d="M60 30v6M44 36l3 5M76 36l-3 5"/></g>
    <path d="M33 58Q60 36 87 58Q60 80 33 58Z" fill="#f6f1e2"/>
    <circle cx="60" cy="58" r="11.5" fill="url(#avGold)"/><circle cx="60" cy="58" r="5.5" fill="#0d1430"/><circle cx="63.5" cy="54.5" r="2.2" fill="#fff"/>
    <path d="${avSpark(49, 86, 5)}" fill="#fff3c4"/><path d="${avSpark(71, 86, 5)}" fill="#fff3c4"/>`,
  servant: `<circle cx="60" cy="58" r="50" fill="url(#avGlowG)"/>
    <circle cx="60" cy="58" r="38" fill="url(#avBlue)" stroke="url(#avGold)" stroke-width="4"/>
    <circle cx="60" cy="58" r="28" fill="none" stroke="#ffffff38" stroke-width="2"/>
    <g fill="#e9c46a" opacity=".8"><circle cx="60" cy="24" r="2.5"/><circle cx="94" cy="58" r="2.5"/><circle cx="26" cy="58" r="2.5"/><circle cx="60" cy="92" r="2.5"/></g>
    <path d="M60 4L66 15V76H54V15Z" fill="url(#avSteel)" stroke="#3d4560" stroke-width="1"/>
    <path d="M60 14V74" stroke="#7f8aa6" stroke-width="1.6"/>
    <rect x="38" y="75" width="44" height="8" rx="4" fill="url(#avGold)"/>
    <rect x="56.5" y="83" width="7" height="18" rx="2" fill="#5a3a1a"/>
    <circle cx="60" cy="105" r="6.5" fill="url(#avGold)"/>`,
  morgana: `<circle cx="60" cy="60" r="52" fill="url(#avGlowR)"/>
    <circle cx="58" cy="62" r="44" fill="url(#avRed)" mask="url(#avMoonCut)"/>
    <path d="${avStar5(82, 46, 15, 6)}" fill="url(#avGold)" opacity=".95"/>
    <circle cx="82" cy="46" r="24" fill="none" stroke="#ffb0a6" stroke-width="1" opacity=".5" stroke-dasharray="2 4"/>
    <path d="M30 92Q36 104 50 106M24 70Q22 80 28 88" stroke="#2a0a10" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="${avSpark(102, 86, 5)}" fill="#ffd2cc"/><path d="${avSpark(96, 104, 3)}" fill="#ffd2cc"/><path d="${avSpark(20, 24, 4)}" fill="#ffd2cc"/>`,
  assassin: `<circle cx="60" cy="60" r="52" fill="url(#avGlowR)"/>
    <g transform="rotate(-32 60 60)">
      <path d="M60 4L69 72H51Z" fill="url(#avSteel)" stroke="#3d4560" stroke-width="1"/>
      <path d="M60 12V70" stroke="#7f8aa6" stroke-width="1.6"/>
      <path d="M38 72H82L77 81H43Z" fill="url(#avRed)" stroke="#2a0a10" stroke-width="1.5"/>
      <rect x="55" y="81" width="10" height="21" rx="2" fill="#24121a"/>
      <path d="M55 86h10M55 92h10M55 98h10" stroke="#5a2a36" stroke-width="1.5"/>
      <circle cx="60" cy="107" r="6.5" fill="url(#avRed)" stroke="#2a0a10" stroke-width="1.5"/>
    </g>
    <path d="M92 70C92 70 83 82 83 88A9 9 0 0 0 101 88C101 82 92 70 92 70Z" fill="url(#avRed)"/>
    <path d="M89 85a3 4 0 0 0 1 6" stroke="#fff8" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  minion: `<circle cx="60" cy="62" r="52" fill="url(#avGlowR)"/>
    <path d="M34 44Q14 30 20 6Q31 27 48 33Z" fill="url(#avRed)"/><path d="M86 44Q106 30 100 6Q89 27 72 33Z" fill="url(#avRed)"/>
    <path d="M28 44Q60 24 92 44Q96 80 60 106Q24 80 28 44Z" fill="url(#avDark)" stroke="url(#avRed)" stroke-width="3" stroke-linejoin="round"/>
    <path d="M60 38L65 46L60 54L55 46Z" fill="url(#avGold)"/>
    <path d="M38 60L54 64L51 71Q42 71 38 60Z" fill="#ff5a3c"/><path d="M82 60L66 64L69 71Q78 71 82 60Z" fill="#ff5a3c"/>
    <path d="M46 86Q60 93 74 86" stroke="#ff5a3c" stroke-width="2.4" fill="none" stroke-linecap="round"/>
    <path d="M52 88l2 5M60 90v5M68 88l-2 5" stroke="#ff5a3c" stroke-width="1.6" stroke-linecap="round"/>`,
};
const avRoleArt = (key) => `<svg viewBox="0 0 120 120" class="av-art" aria-hidden="true">${AV_ART[key] || ''}</svg>`;

// 작은 아이콘 (viewBox 24×24)
const AV_ICON = {
  crown: '<path d="M2.5 8.5l5 3.8L12 4.5l4.5 7.8 5-3.8L19.4 18.6H4.6z" fill="url(#avGold)" stroke="#5a3d10" stroke-width=".8" stroke-linejoin="round"/><rect x="4.6" y="18.6" width="14.8" height="2.4" rx=".6" fill="url(#avGold)" stroke="#5a3d10" stroke-width=".6"/><circle cx="12" cy="14.6" r="1.7" fill="#e24a3f"/><circle cx="7.6" cy="15.6" r="1.1" fill="#4d8ff0"/><circle cx="16.4" cy="15.6" r="1.1" fill="#4d8ff0"/>',
  grail: '<path d="M5.5 3h13c0 5.4-2.7 8.6-6.5 9.2C8.2 11.6 5.5 8.4 5.5 3z" fill="url(#avGold)"/><path d="M11 12h2v4.5h-2z" fill="url(#avGold)"/><path d="M7.5 21c0-2.4 2-4.2 4.5-4.2s4.5 1.8 4.5 4.2z" fill="url(#avGold)"/><path d="M8.2 5.5c.3 2.3 1.4 3.9 2.9 4.5" stroke="#fff9" stroke-width="1" fill="none" stroke-linecap="round"/>',
  swords: '<g stroke-linecap="round"><path d="M4 3.5l12.5 12.5M20 3.5L7.5 16" stroke="url(#avSteel)" stroke-width="2.4"/><path d="M14 18.6l4.6-4.6M10 18.6L5.4 14" stroke="url(#avGold)" stroke-width="2.2"/><path d="M18.3 18.3l2 2M5.7 18.3l-2 2" stroke="#3a2008" stroke-width="2.6"/></g>',
  sword: '<path d="M12 1.5l2 3v10.5h-4V4.5z" fill="url(#avSteel)"/><rect x="6.5" y="15" width="11" height="2.4" rx="1.2" fill="url(#avGold)"/><rect x="11" y="17.4" width="2" height="3.4" fill="#5a3d10"/><circle cx="12" cy="21.6" r="1.6" fill="url(#avGold)"/>',
  check: '<path d="M5 12.5l4.6 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  cross: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>',
  seal: `<path d="${avStar5(12, 12, 7.5, 3.2)}" fill="currentColor"/>`,
  tower: '<path d="M6.5 21V10.5L4.5 8.5V4h2.6v2h2.2V4h5.4v2h2.2V4h2.6v4.5l-2 2V21z" fill="url(#avGold)"/><path d="M10.4 21v-4.2a1.6 1.6 0 0 1 3.2 0V21z" fill="#141c44"/><path d="M11.2 10.5h1.6v2.6h-1.6z" fill="#141c44"/>',
  target: '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
};
const avIcon = (k, cls = '') => `<svg viewBox="0 0 24 24" class="av-i ${cls}" aria-hidden="true">${AV_ICON[k] || ''}</svg>`;

// 게임 끝 화면의 큰 문장: 선은 빛나는 성배, 악은 단검
function avEndArt(goodWon) {
  if (!goodWon) return avRoleArt('assassin');
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const x1 = 60 + 40 * Math.cos(a), y1 = 54 + 40 * Math.sin(a);
    const x2 = 60 + 54 * Math.cos(a), y2 = 54 + 54 * Math.sin(a);
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }).join('');
  return `<svg viewBox="0 0 120 120" class="av-art" aria-hidden="true"><circle cx="60" cy="54" r="50" fill="url(#avGlowG)"/>
    <g stroke="#ffe7a3" stroke-width="2.2" stroke-linecap="round" opacity=".7">${rays}</g>
    <g transform="translate(24 18) scale(3)">${AV_ICON.grail}</g></svg>`;
}

// 화면이 다시 그려져도 등장 효과가 처음부터 되풀이되지 않게: 처음 본 시각을 기억해 두고 남은 만큼만 이어서 움직인다
const avSeenAt = {};
function avAnim(key, ms) {
  const now = Date.now();
  if (!avSeenAt[key]) avSeenAt[key] = now;
  const gone = now - avSeenAt[key];
  return gone < ms ? { cls: ' av-anim', st: ` style="--ad:-${gone}ms"` } : { cls: '', st: '' };
}

function avHue(id) {
  let h = 7;
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
const avInitial = (name) => esc(Array.from(String(name).trim())[0] || '?');
const avCoin = (yes, cls = '') => `<span class="av-coin ${yes ? 'y' : 'n'} ${cls}">${avIcon(yes ? 'check' : 'cross')}</span>`;
const avSlot = (id) => `<span class="av-slot ${id ? 'on' : ''}">${id ? `${avIcon('sword')}${nm(id)}` : '?'}</span>`;
const AV_ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ'];

// 원정 판: 원정 메달 5개 + 점수 + 지금 리더 + 연속 부결을 한 덩어리로 모아 한눈에 보이게
function renderTrack() {
  const live = S.phase !== 'over' && S.phase !== 'assassin';
  const medals = S.teamSizes.map((size, i) => {
    const r = S.results[i];
    const cur = !r && i === S.round && live;
    const cls = r ? (r.ok ? 'ok' : 'bad') : cur ? 'cur' : '';
    const label = r ? (r.ok ? '성공' : `실패 ${r.fails}장`) : cur ? '이번 원정' : `${size}명`;
    const two = S.failsNeeded[i] > 1 ? '<em class="av-two" title="실패 카드 2장이 나와야 실패">2</em>' : '';
    const face = r ? avIcon(r.ok ? 'grail' : 'swords') : `<b>${size}</b>`;
    return `<div class="av-q ${cls}"><span class="av-qi">${AV_ROMAN[i]}</span><div class="av-medal">${face}${two}</div><span class="lbl">${label}</span></div>`;
  }).join('');
  const rej = Array.from({ length: S.maxRejects }, (_, i) => `<i class="${i < S.rejects ? 'on' : ''}${i === S.maxRejects - 1 ? ' last' : ''}"></i>`).join('');
  const good = S.results.filter((r) => r.ok).length;
  const bad = S.results.length - good;
  const hot = live && S.rejects >= S.maxRejects - 1;
  const ldr = live && S.leaderId
    ? `<span class="av-ldr" title="지금 리더">${avIcon('crown')}<b>${nm(S.leaderId)}</b>${S.leaderId === S.me ? '<small>나</small>' : ''}</span>`
    : '';
  const two = live && S.failsNeeded[S.round] > 1 && ['propose', 'vote', 'quest'].includes(S.phase)
    ? '<p class="av-note"><em class="av-two inline">2</em> 이번 원정은 실패 카드가 <b>2장</b> 나와야 실패예요.</p>' : '';
  const last = S.history[S.history.length - 1];
  let lastLine = '';
  if (last && (S.phase === 'propose' || S.phase === 'vote')) {
    const yes = Object.values(last.votes).filter(Boolean).length;
    const no = Object.keys(last.votes).length - yes;
    const res = !last.approved ? '<b class="n">부결</b>' : last.quest ? (last.quest.ok ? '<b class="y">원정 성공</b>' : '<b class="n">원정 실패</b>') : '<b class="y">가결</b>';
    lastLine = `<button class="av-last" data-act="history"><span>📜 지난 제안 · ${nm(last.leader)}의 원정대 ${res} <small>찬 ${yes} · 반 ${no}</small></span><i>›</i></button>`;
  }
  return `<div class="av-board">
    <div class="av-quests">${medals}</div>
    <div class="av-stat">
      <span class="av-sc"><b class="g">선 ${good}</b><b class="e">악 ${bad}</b></span>
      ${ldr}
      <span class="av-rej${hot ? ' hot' : ''}" title="연속 부결 (5번이면 악의 승리)"><small>부결</small>${rej}<b>${S.rejects}/${S.maxRejects}</b></span>
    </div>${two}${lastLine}</div>`;
}

// 플레이어 자리. o: team(원정대), sel(누를 수 있음), aim(암살 지목 중), vote(true/false 공개된 표), voted(표를 냈지만 비공개),
//   carded(원정 카드 냄), acked(확인함), wait(아직 안 함), shot(암살 지목됨), sub(작은 글)
function playerCard(p, o = {}) {
  const cls = ['av-seat'];
  if (p.id === S.me) cls.push('me');
  if (o.team) cls.push('team');
  if (o.sel) cls.push('sel');
  if (o.aim) cls.push('aim');
  if (o.vote === true) cls.push('vy');
  if (o.vote === false) cls.push('vn');
  if (o.wait) cls.push('wait');
  if (o.shot) cls.push('shot');
  if (!p.connected) cls.push('off');
  let sub = o.sub ? esc(o.sub) : '';
  let ava = `<span class="av-ava" style="--h:${avHue(p.id)}">${avInitial(p.name)}</span>`;
  if (p.role) {
    const r = S.roleNames[p.role];
    cls.push(r.team === 'good' ? 'good-r' : 'evil-r');
    sub = esc(r.name) + (o.shot ? ' · 🎯지목' : '');
    ava = `<span class="av-ava role ${r.team}">${avRoleArt(p.role)}</span>`;
  }
  let side = '';
  if (o.vote === true || o.vote === false) side = avCoin(o.vote);
  else if (o.voted) side = `<span class="av-coin seal" title="투표함">${avIcon('seal')}</span>`;
  else if (o.carded) side = `<span class="av-mback" title="카드 냄">${avIcon('tower')}</span>`;
  else if (o.aim) side = `<span class="av-aim">${avIcon('target')}</span>`;
  else if (o.sel && o.team) side = `<span class="av-coin pick">${avIcon('check')}</span>`;
  else if (o.acked) side = `<span class="av-ok" title="확인함">${avIcon('check')}</span>`;
  const live = S.phase !== 'over' && S.phase !== 'assassin' && S.phase !== 'roles';
  const crown = live && p.id === S.leaderId ? `<span class="av-crown" title="리더">${avIcon('crown')}</span>` : '';
  const flag = o.team && !p.role ? '<span class="av-flag">원정대</span>' : '';
  const off = p.connected ? '' : '<span class="av-offdot" title="접속 끊김"></span>';
  const attrs = o.sel ? ` data-act="pick" data-id="${p.id}"` : '';
  const tag = o.sel ? 'button' : 'div';
  return `<${tag} class="${cls.join(' ')}"${attrs}>${crown}${flag}${ava}${off}<span class="av-pn"><span class="nm">${esc(p.name)}${p.id === S.me ? ' <small>(나)</small>' : ''}</span><span class="sub">${sub}</span></span>${side}</${tag}>`;
}

// 화면 짜임: 맨 위 줄 → (가이드) → 원정 판 → 지금 단계 안내 → 자리 → 아래에 붙은 행동 버튼
function renderGame() {
  const isHost = S.hostId === S.me;
  const phase = S.phase;
  const isLeader = S.leaderId === S.me;
  const connectedCount = S.players.filter((p) => p.connected).length;
  const ackCount = S.players.filter((p) => p.acked).length;
  const meP = byId(S.me);
  const marked = new Set(phase === 'propose' ? S.draft : S.team);
  const rn = AV_ROMAN[Math.min(S.round, 4)];
  const crown = avIcon('crown', 'inl');

  let info = ''; // 원정 판 아래: 지금 무슨 일이 일어나는지
  let dock = ''; // 화면 아래: 내가 누를 것
  let seatOpt = () => ({});
  const ackSeat = (p) => ({ acked: p.acked, wait: !p.acked && p.connected, sub: p.acked ? '확인 완료' : p.connected ? '확인 중…' : '접속 끊김' });
  const meter = (n, total, text) => `<div class="av-meter"><i><b style="width:${total ? Math.round((n / total) * 100) : 0}%"></b></i><span>${text}</span></div>`;

  if (phase === 'roles') {
    const comp = S.composition;
    const compHtml = comp
      ? `<div class="av-comp"><div class="av-comp-h">이번 판 ${S.players.length}명 · <b class="g">선 ${comp.good}</b> · <b class="e">악 ${comp.evil}</b></div>
        <div class="av-chips">${comp.roles.map((r) => `<span class="av-chip ${r.team}">${avRoleArt(r.key)}${esc(r.name)}${r.count > 1 ? ` ×${r.count}` : ''}</span>`).join('')}</div></div>`
      : '';
    info = `<div class="av-panel"><div class="av-ph">당신의 역할</div>${roleCardHtml(S.roleInfo, true)}${compHtml}</div>`;
    dock = ackHtml(meP, ackCount, connectedCount, isHost, '확인했어요', '기다리지 않고 시작');
    seatOpt = ackSeat;
  } else if (phase === 'propose') {
    const size = S.teamSize;
    const left = size - S.draft.length;
    seatOpt = (p) => ({ team: marked.has(p.id), sel: isLeader, sub: marked.has(p.id) ? '원정대 후보' : '' });
    const slots = Array.from({ length: size }, (_, i) => avSlot(S.draft[i])).join('');
    info = `<div class="av-panel"><div class="av-ph">${rn} 원정대 구성 · ${size}명</div>
      <div class="av-slots">${slots}</div>
      ${isLeader
        ? `<p class="av-say">${crown} <b>당신이 리더예요!</b> 자리를 눌러 <b>${size}명</b>을 골라요. 나도 넣을 수 있어요.</p>`
        : `<p class="av-say">${crown} <b>${nm(S.leaderId)}</b>님이 고르는 중 <b class="av-cnt">${S.draft.length}/${size}</b></p><p class="dim small center">누구를 넣을지 같이 이야기해 보세요.</p>`}
      ${S.rejects >= S.maxRejects - 1 ? '<p class="av-warn">또 부결되면 5연속 부결로 악의 승리예요!</p>' : ''}
    </div>`;
    if (isLeader) dock = `<button class="primary" data-act="propose" ${left === 0 ? '' : 'disabled'}>${left === 0 ? '이 원정대로 확정' : `${left}명 더 골라 주세요`}</button>`;
  } else if (phase === 'vote') {
    seatOpt = (p) => ({ team: marked.has(p.id), voted: p.voted, wait: !p.voted, sub: p.voted ? '투표 완료' : '고민 중…' });
    const votedN = S.players.filter((p) => p.voted).length;
    info = `<div class="av-panel"><div class="av-ph">${rn} 원정대 투표 · ${S.rejects + 1}번째 제안</div>
      <div class="av-slots">${S.team.map(avSlot).join('')}</div>
      <p class="av-say">${crown} <b>${nm(S.leaderId)}</b>님이 고른 원정대예요. 찬성? 반대?</p>
      ${S.rejects >= S.maxRejects - 1 ? '<p class="av-warn">또 부결되면 5연속 부결로 악의 승리예요!</p>' : ''}
      ${meter(votedN, S.players.length, `${votedN}/${S.players.length}명 투표 · 다 모이면 한꺼번에 공개`)}
    </div>`;
    dock = S.myVote === null
      ? `<div class="av-tokens">
          <button class="av-token ty" data-act="vote" data-v="1">${avCoin(true)}<span><b>찬성</b><small>원정 출발</small></span></button>
          <button class="av-token tn" data-act="vote" data-v="0">${avCoin(false)}<span><b>반대</b><small>리더 교체</small></span></button></div>`
      : `<div class="av-voted">${avCoin(S.myVote)}<b>${S.myVote ? '찬성' : '반대'}에 투표했어요</b><small>공개를 기다려요</small></div>`;
  } else if (phase === 'voteResult') {
    const lv = S.lastVote;
    const yes = Object.values(lv.votes).filter(Boolean).length;
    const no = Object.keys(lv.votes).length - yes;
    seatOpt = (p) => ({ team: marked.has(p.id), vote: lv.votes[p.id], sub: `${lv.votes[p.id] ? '찬성' : '반대'}${p.acked ? ' · 확인' : ''}` });
    const an = avAnim(`v${S.gameNo}-${S.history.length}`, 900);
    const coins = [...Array(yes).fill(true), ...Array(no).fill(false)].map((v, i) => `<span style="--i:${i}">${avCoin(v)}</span>`).join('');
    const fifth = !lv.approved && S.rejects >= S.maxRejects;
    info = `<div class="av-panel"><div class="av-ph">${rn} 투표 결과</div>
      <div class="av-verdict ${lv.approved ? 'ok' : 'bad'}">${lv.approved ? '가결 — 원정 출발!' : fifth ? '5번째 부결…' : '부결'}</div>
      <div class="av-tally${an.cls}"${an.st}>${coins}</div>
      <p class="center">찬성 <b class="y">${yes}</b> · 반대 <b class="n">${no}</b>${lv.approved ? '' : ` · 연속 부결 <b class="n">${S.rejects}/${S.maxRejects}</b>`}</p>
      ${lv.approved ? '' : fifth ? '<p class="av-warn">5번 연속 부결이에요. 악의 승리!</p>' : '<p class="dim small center">리더가 다음 사람에게 넘어가요. 누가 어떻게 투표했는지는 아래 자리에 보여요.</p>'}
    </div>`;
    dock = ackHtml(meP, ackCount, connectedCount, isHost);
  } else if (phase === 'quest') {
    const onTeam = S.team.includes(S.me);
    seatOpt = (p) => ({ team: marked.has(p.id), carded: marked.has(p.id) && p.carded, wait: marked.has(p.id) && !p.carded, sub: marked.has(p.id) ? (p.carded ? '카드 냄' : '카드 고르는 중…') : '' });
    const backs = `<div class="av-backs">${S.team.map((_, i) => `<span class="av-back ${i < S.cardsIn ? 'in' : ''}">${avIcon('tower')}</span>`).join('')}</div>`;
    const say = !onTeam ? '원정대원이 몰래 카드를 내는 중이에요…' : S.myCard !== null ? '카드를 냈어요. 다른 대원을 기다려요.' : '맨 아래에서 카드를 한 장 몰래 내세요.';
    info = `<div class="av-panel"><div class="av-ph">${rn} 원정 진행 중</div>
      <div class="av-slots">${S.team.map(avSlot).join('')}</div>
      ${backs}
      <p class="av-say">${say}</p>
      ${meter(S.cardsIn, S.team.length, `${S.cardsIn}/${S.team.length}명 제출`)}
    </div>`;
    if (onTeam && S.myCard === null) {
      // 선이든 악이든 두 카드가 똑같이 보이게 그린다 (옆 사람이 버튼 색만 보고 정체를 알지 못하게)
      const good = S.roleInfo.team === 'good';
      dock = `<p class="av-hint">선은 <b>성공</b>만, 악은 <b>성공·실패</b> 중에 낼 수 있어요.</p>
        <div class="av-qcards">
          <button class="av-qc ok" data-act="card" data-v="1"><span class="art">${avIcon('grail')}</span><b>성공</b><small>누구나 낼 수 있어요</small></button>
          <button class="av-qc bad" data-act="card" data-v="0" ${good ? 'disabled' : ''}><span class="art">${avIcon('swords')}</span><b>실패</b><small>${good ? '선은 낼 수 없어요' : '악만 낼 수 있어요'}</small></button>
        </div>`;
    } else if (onTeam) {
      dock = `<div class="av-voted"><span class="av-mback big">${avIcon('tower')}</span><b>카드를 냈어요</b><small>결과를 기다려요</small></div>`;
    }
  } else if (phase === 'questResult') {
    const q = S.lastQuest;
    const n = S.team.length;
    seatOpt = (p) => ({ team: marked.has(p.id), acked: p.acked, wait: !p.acked && p.connected, sub: p.acked ? '확인 완료' : '' });
    const an = avAnim(`q${S.gameNo}-${S.round}`, 1600);
    // 카드는 섞여서 공개된다: 성공 먼저, 실패는 뒤에 (누가 냈는지와는 상관없음)
    const faces = Array.from({ length: n }, (_, i) => {
      const ok = i < n - q.fails;
      return `<span class="av-rc ${ok ? 'ok' : 'bad'}" style="--i:${i}">${avIcon(ok ? 'grail' : 'swords')}<b>${ok ? '성공' : '실패'}</b></span>`;
    }).join('');
    const good = S.results.filter((r) => r.ok).length;
    const bad = S.results.length - good;
    const next = bad >= 3 ? '<p class="av-warn">원정이 3번 실패했어요. 악의 승리!</p>'
      : good >= 3 ? '<p class="av-gold center">선이 3번 성공! 이제 암살 단계예요.</p>'
        : '<p class="center dim small">누가 실패를 냈는지는 공개되지 않아요.</p>';
    info = `<div class="av-panel"><div class="av-ph">${rn} 원정 결과</div>
      <div class="av-verdict ${q.ok ? 'ok' : 'bad'}">${q.ok ? '원정 성공!' : '원정 실패'}</div>
      <div class="av-reveal${an.cls}"${an.st}>${faces}</div>
      <p class="center">실패 카드 <b class="${q.fails ? 'n' : 'y'}">${q.fails}장</b>${q.needed > 1 ? ` · 이번엔 ${q.needed}장이 나와야 실패예요` : ''}</p>
      ${next}
    </div>`;
    dock = ackHtml(meP, ackCount, connectedCount, isHost);
  } else if (phase === 'assassin') {
    const amAssassin = S.roleInfo && S.roleInfo.key === 'assassin';
    seatOpt = (p) => ({ sel: amAssassin && p.id !== S.me, aim: amAssassin && p.id !== S.me });
    info = `<div class="av-panel dark"><div class="av-ph">암살 단계</div>
      <div class="av-hero sm">${avRoleArt('assassin')}</div>
      <div class="av-verdict gold">선이 원정을 3번 성공했어요!</div>
      ${amAssassin
        ? '<p class="av-say">하지만 끝이 아니에요. <b>멀린</b>이라고 생각하는 사람을 아래 자리에서 눌러 지목하세요. 맞히면 악의 역전승!</p>'
        : '<p class="av-say">암살자가 멀린을 찾고 있어요. 맞히면 악이, 틀리면 선이 이겨요.</p>'}
    </div>`;
  } else if (phase === 'over') {
    const goodWon = S.winner === 'good';
    seatOpt = (p) => ({ shot: p.id === S.assassinTarget });
    info = `<div class="av-panel end ${goodWon ? 'good' : 'evil'}">
      <div class="av-hero">${avEndArt(goodWon)}</div>
      <div class="av-verdict xl ${goodWon ? 'ok' : 'bad'}">${goodWon ? '선의 승리!' : '악의 승리!'}</div>
      <p class="center">${REASONS[S.reason] || ''}</p>
      ${S.assassinTarget ? `<p class="center dim small">암살자의 선택: ${nm(S.assassinTarget)}</p>` : ''}
      <p class="center dim small">아래 자리에서 모두의 역할을 확인해 보세요.</p>
    </div>`;
    dock = isHost
      ? `<button class="primary" data-act="restart">같은 멤버로 바로 다시 하기</button><button class="ghost sm av-force" data-act="again">대기실로 돌아가기</button>`
      : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>';
  }

  const title = { roles: '역할 확인', propose: '원정대 구성', vote: '투표', voteResult: '투표 결과', quest: '원정', questResult: '원정 결과', assassin: '암살', over: '게임 끝' }[phase];
  return `<div class="av ph-${phase}${phase === 'over' ? ` win-${S.winner}` : ''}">${AV_DEFS}
  <div class="top"><span>${roomTag()}</span><span class="av-round">${Math.min(S.round + 1, 5)}라운드 · ${title}</span></div>
  ${phase === 'roles' ? '' : renderTrack()}
  ${info}
  <div class="av-seats n${S.players.length}">${S.players.map((p) => playerCard(p, seatOpt(p))).join('')}</div>
  <div class="bdock av-dock">
    ${dock ? `<div class="av-act">${dock}</div>` : ''}
    <div class="foot">
      <button data-act="role">🎭 내 역할</button>
      <button data-act="history">📜 기록</button>
      ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
    </div>
  </div>
  ${ui.roleOpen ? `<div class="overlay" data-act="closeall"><div class="sheet">${roleCardHtml(S.roleInfo)}<button data-act="closeall">닫기</button></div></div>` : ''}
  ${ui.hostOpen && isHost ? hostMenuHtml() : ''}
  ${ui.historyOpen ? `<div class="overlay" data-act="closeall"><div class="sheet"><h2>지난 기록</h2>${historyHtml()}<button data-act="closeall">닫기</button></div></div>` : ''}
  </div>`;
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

// 확인 단계의 아래 버튼: 아직이면 확인 버튼, 눌렀으면 기다리는 사람 수 (방장은 넘기기)
function ackHtml(meP, ackCount, connectedCount, isHost, label = '확인', forceLabel = '기다리지 않고 넘어가기') {
  if (meP.acked) {
    return `<p class="progress">다른 사람을 기다리는 중 (${ackCount}/${connectedCount})</p>${isHost ? `<button class="ghost sm av-force" data-act="force">${forceLabel}</button>` : ''}`;
  }
  return `<button class="primary" data-act="ack">${label}</button>`;
}

// 역할 카드: 선이든 악이든 같은 색·같은 모양으로 그린다. 같은 방에서 옆 사람이 화면 색만 보고 정체를 알아채지 못하게.
// 그림도 모두 같은 금빛 단색으로 칠하고, 알고 있는 정보 칸도 역할과 상관없이 늘 같은 자리에 같은 모양으로 둔다.
// reveal이면 처음 한 번 뒤집히며 나타난다
function roleCardHtml(ri, reveal) {
  if (!ri) return '<p class="dim">역할이 아직 없어요.</p>';
  const night = ri.night || { title: '알고 있는 정보', names: [] };
  const empty = ri.night ? '없음' : '없어요 · 투표와 원정 결과로 추리해요';
  const intel = `<div class="av-intel"><div class="t">${esc(night.title)}</div><div class="av-names">${night.names.length
    ? night.names.map((n) => `<span class="av-name">${esc(n)}</span>`).join('')
    : `<span class="av-none">${empty}</span>`}</div></div>`;
  const an = reveal ? avAnim(`role${S.gameNo}`, 900) : { cls: '', st: '' };
  return `<div class="av-card${an.cls}"${an.st}><div class="av-card-in">
      <div class="av-card-side">${sideLabel(ri.team)}</div>
      <div class="av-card-art">${avRoleArt(ri.key)}</div>
      <div class="av-card-name">${esc(ri.name)}</div>
      <div class="av-card-desc">${esc(ri.desc)}</div>
    </div></div>${intel}`;
}

function historyHtml() {
  if (!S.history.length) return '<p class="dim center">아직 기록이 없어요.</p>';
  return S.history.map((h) => {
    const yes = Object.values(h.votes).filter(Boolean).length;
    const no = Object.keys(h.votes).length - yes;
    const votes = S.players.map((p) => `<span class="av-hv ${h.votes[p.id] ? 'y' : 'n'}">${h.votes[p.id] ? '○' : '✕'} ${esc(p.name)}</span>`).join('');
    const result = !h.approved ? '<span class="av-badge bad">부결</span>' : h.quest ? (h.quest.ok ? '<span class="av-badge ok">원정 성공</span>' : `<span class="av-badge bad">원정 실패 · 실패 ${h.quest.fails}장</span>`) : '<span class="av-badge">진행 중</span>';
    return `<div class="av-hist"><div class="av-hist-h"><b>${h.round}라운드 · ${h.attempt}번째 제안</b>${result}</div>
      <p class="small">👑 리더 ${nm(h.leader)} · 원정대 <b>${nameList(h.team)}</b> · 찬 ${yes} / 반 ${no}</p><div class="av-hvotes">${votes}</div></div>`;
  }).reverse().join('');
}

// ---- 이벤트 ----

$app.addEventListener('input', (e) => {
  if (e.target.id === 'name') { ui.name = e.target.value; }
  if (e.target.id === 'createpw') { ui.createPw = e.target.value; }
  if (e.target.id === 'joinpw') { ui.joinPw = e.target.value; ui.pwError = ''; }
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
    case 'pwcancel': ui.needPw = false; ui.joinPw = ''; ui.pwError = ''; render(); break;
    case 'roomsrefresh': requestRooms(); render(); break;
    case 'pickroom': {
      // 목록에서 고른 방: 공개방은 바로 들어가고, 비밀번호 방은 아래 비밀번호 칸을 연다
      const name = ui.name.trim();
      if (ui.code !== el.dataset.code) ui.joinPw = '';
      ui.pwError = '';
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
