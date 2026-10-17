'use strict';
// 화면은 서버가 보내는 state를 그대로 그린다. 비밀(역할, 남의 투표/카드)은 서버가 걸러서 보내므로 여기엔 없다.

const $app = document.getElementById('app');
const SESSION_KEY = 'avalon-session';
const NAME_KEY = 'avalon-name';

let ws = null;
let online = false;
let backoff = 500;
let S = null; // 서버가 보낸 내 시점의 상태
let toastTimer = null;
const ui = {
  name: load(NAME_KEY) || '',
  code: (new URLSearchParams(location.search).get('room') || '').toUpperCase().slice(0, 4),
  roleOpen: false,
  historyOpen: false,
  toast: '',
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

function connect() {
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => {
    online = true;
    backoff = 500;
    if (session) send({ t: 'resume', code: session.code, token: session.token });
    render();
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === 'joined') {
      session = { code: m.code, id: m.id, token: m.token };
      save(SESSION_KEY, JSON.stringify(session));
    } else if (m.t === 'state') {
      S = m.state;
      render();
    } else if (m.t === 'gone') {
      clearSession();
      S = null;
      ui.roleOpen = ui.historyOpen = false;
      if (m.kicked) showToast('방장이 내보냈어요.');
      render();
    } else if (m.t === 'error') {
      showToast(m.msg);
    }
  };
  ws.onclose = () => {
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

const RULES_HTML = `
<details><summary>규칙 간단 설명</summary>
<p><b>6명</b> · 선 4(멀린, 퍼시벌, 충성스러운 신하 2) vs 악 2(모르가나, 암살자)</p>
<ul>
<li>5번의 원정 중 <b>3번 성공</b>하면 선이 앞서고, <b>3번 실패</b>하면 악이 이깁니다.</li>
<li>원정 인원은 순서대로 <b>2·3·4·3·4명</b>. 실패 카드가 1장만 나와도 그 원정은 실패입니다.</li>
<li>리더가 원정대를 고르면 모두가 찬성/반대로 투표합니다. 과반 찬성(4명 이상)이면 출발, 아니면 부결되고 리더가 다음 사람에게 넘어갑니다. <b>5번 연속 부결되면 악의 승리</b>.</li>
<li>원정대원은 몰래 성공/실패 카드를 냅니다. 선은 성공만 낼 수 있고, 악은 둘 중 고릅니다. 결과는 실패 카드 수만 공개됩니다.</li>
<li>선이 3번 성공해도 <b>암살자가 멀린을 맞히면 악의 역전승</b>입니다.</li>
</ul></details>`;

function sideLabel(team) {
  return team === 'good' ? '선의 세력' : '악의 세력';
}

// ---- 화면 ----

function render() {
  const banner = online ? '' : '<div class="banner">연결이 끊겼어요. 다시 연결하는 중…</div>';
  let html;
  if (!S) html = renderHome();
  else if (S.phase === 'lobby') html = renderLobby();
  else html = renderGame();
  const toast = ui.toast ? `<div class="toast">${esc(ui.toast)}</div>` : '';
  const active = document.activeElement;
  const keep = active && active.id ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
  $app.innerHTML = banner + html + toast;
  if (keep) {
    const el = document.getElementById(keep.id);
    if (el) {
      el.focus();
      try { el.setSelectionRange(keep.s, keep.e); } catch { /* noop */ }
    }
  }
}

function renderHome() {
  return `
  <h1>🛡️ 아발론<small>6명이 폰으로 같이 하는 방</small></h1>
  <div class="card">
    <label class="field">내 이름 (8자까지)
      <input type="text" id="name" maxlength="8" autocomplete="off" value="${esc(ui.name)}" placeholder="예: 민수" />
    </label>
    <button class="primary" data-act="create">새 방 만들기</button>
  </div>
  <div class="card">
    <label class="field">친구가 만든 방에 들어가기 — 방 코드 4글자
      <input type="text" id="code" maxlength="4" autocomplete="off" autocapitalize="characters" value="${esc(ui.code)}" placeholder="ABCD" style="text-transform:uppercase;letter-spacing:6px;text-align:center;font-size:22px" />
    </label>
    <button data-act="join">들어가기</button>
  </div>
  <div class="card">${RULES_HTML}</div>`;
}

function renderLobby() {
  const isHost = S.hostId === S.me;
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const p = S.players[i];
    if (!p) {
      slots.push('<div class="slot empty">빈 자리</div>');
      continue;
    }
    slots.push(`<div class="slot">
      <span class="dot ${p.connected ? '' : 'off'}"></span>
      <span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span>
      ${p.id === S.hostId ? '<span class="tag host">방장</span>' : ''}
      ${isHost && p.id !== S.me ? `<button class="sm ghost" data-act="kick" data-id="${p.id}">내보내기</button>` : ''}
    </div>`);
  }
  const n = S.players.length;
  const allOn = S.players.every((p) => p.connected);
  let action;
  if (isHost) {
    action = `<button class="primary" data-act="start" ${n === 6 && allOn ? '' : 'disabled'}>${n === 6 ? (allOn ? '게임 시작' : '접속이 끊긴 사람이 있어요') : `${6 - n}명 더 필요해요`}</button>`;
  } else {
    action = '<p class="dim center">방장이 시작하길 기다리는 중…</p>';
  }
  return `
  <h1>대기실</h1>
  <div class="card">
    <p class="dim center small">친구들에게 이 코드를 알려주세요</p>
    <div class="code">${esc(S.code)}</div>
    <button data-act="share">초대 링크 보내기</button>
    <div class="slots">${slots.join('')}</div>
    ${action}
  </div>
  <div class="card">${RULES_HTML}</div>
  <div class="foot"><button class="ghost" data-act="leave">방 나가기</button></div>`;
}

function renderTrack() {
  const circles = S.teamSizes.map((size, i) => {
    const r = S.results[i];
    const cls = r ? (r.ok ? 'ok' : 'bad') : i === S.round && S.phase !== 'over' && S.phase !== 'assassin' ? 'cur' : '';
    const label = r ? (r.ok ? '성공' : `실패 ${r.fails}`) : `${size}명`;
    return `<div class="q ${cls}">${r ? (r.ok ? '✓' : '✗') : size}<small>${label}</small></div>`;
  }).join('');
  const rej = Array.from({ length: S.maxRejects }, (_, i) => `<i class="${i < S.rejects ? 'on' : ''}"></i>`).join('');
  return `<div class="card"><div class="track">${circles}</div>
    <div class="rejects">연속 부결 ${rej}</div></div>`;
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
    panel = `<div class="card panel"><h2>당신의 역할</h2>${roleCardHtml(ri)}
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
      <p class="progress">${votedN}/6명 투표 · 전원이 투표하면 한꺼번에 공개돼요</p>
    </div>`;
  } else if (phase === 'voteResult') {
    const lv = S.lastVote;
    const yes = Object.values(lv.votes).filter(Boolean).length;
    cards = playersHtml((p) => ({ team: marked.has(p.id), vote: lv.votes[p.id], sub: lv.votes[p.id] ? '찬성' : '반대' }));
    panel = `<div class="card panel">
      <h2>투표 결과</h2>
      <p class="big ${lv.approved ? 'ok' : 'bad'}">${lv.approved ? '가결 — 원정 출발!' : '부결'}</p>
      <p class="center">찬성 ${yes} · 반대 ${6 - yes}${lv.approved ? '' : ` · 연속 부결 ${S.rejects}/${S.maxRejects}`}</p>
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
      <p>원정대: <b>${nameList(S.team)}</b></p>${body}
      <p class="progress">${S.cardsIn}/${S.team.length}명 제출</p></div>`;
  } else if (phase === 'questResult') {
    const q = S.lastQuest;
    cards = playersHtml((p) => ({ team: marked.has(p.id) }));
    panel = `<div class="card panel"><h2>원정 결과</h2>
      <p class="big ${q.ok ? 'ok' : 'bad'}">${q.ok ? '원정 성공!' : `원정 실패 — 실패 카드 ${q.fails}장`}</p>
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
        ? '<button class="primary" data-act="again" style="margin-top:8px">대기실로 돌아가 다시 하기</button>'
        : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
    </div>`;
  }

  const title = { roles: '역할 확인', propose: '원정대 구성', vote: '투표', voteResult: '투표 결과', quest: '원정', questResult: '원정 결과', assassin: '암살', over: '게임 끝' }[phase];
  return `
  <div class="top"><span>방 <b>${esc(S.code)}</b></span><span>${S.round + 1 > 5 ? 5 : S.round + 1}라운드 · ${title}</span></div>
  ${phase === 'roles' ? '' : renderTrack()}
  ${panel}
  ${cards}
  <div class="foot">
    <button data-act="role">🎭 내 역할</button>
    <button data-act="history">📜 기록</button>
  </div>
  ${ui.roleOpen ? `<div class="overlay" data-act="closeall"><div class="sheet">${roleCardHtml(S.roleInfo)}<button data-act="closeall">닫기</button></div></div>` : ''}
  ${ui.historyOpen ? `<div class="overlay" data-act="closeall"><div class="sheet"><h2>지난 기록</h2>${historyHtml()}<button data-act="closeall">닫기</button></div></div>` : ''}`;
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
  if (e.target.id === 'code') { ui.code = e.target.value.toUpperCase(); }
});

$app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  // 오버레이 배경을 눌렀을 때만 닫고, 시트 안쪽 클릭은 무시
  if (act === 'closeall' && el.classList.contains('overlay') && e.target !== el) return;
  switch (act) {
    case 'create': {
      const name = ui.name.trim();
      if (!name) return showToast('이름을 먼저 입력하세요.');
      save(NAME_KEY, name);
      send({ t: 'create', name });
      break;
    }
    case 'join': {
      const name = ui.name.trim();
      if (!name) return showToast('이름을 먼저 입력하세요.');
      if (ui.code.trim().length !== 4) return showToast('방 코드 4글자를 입력하세요.');
      save(NAME_KEY, name);
      send({ t: 'join', name, code: ui.code.trim() });
      break;
    }
    case 'share': shareLink(); break;
    case 'kick': send({ t: 'kick', target: el.dataset.id }); break;
    case 'leave':
      send({ t: 'leave' });
      break;
    case 'start': send({ t: 'start' }); break;
    case 'ack': send({ t: 'ack' }); break;
    case 'force': send({ t: 'force' }); break;
    case 'again': send({ t: 'again' }); break;
    case 'pick': onPick(el.dataset.id); break;
    case 'propose': send({ t: 'propose', team: S.draft }); break;
    case 'vote': send({ t: 'vote', approve: el.dataset.v === '1' }); break;
    case 'card': send({ t: 'card', success: el.dataset.v === '1' }); break;
    case 'role': ui.roleOpen = true; render(); break;
    case 'history': ui.historyOpen = true; render(); break;
    case 'closeall': ui.roleOpen = ui.historyOpen = false; render(); break;
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

async function shareLink() {
  const url = `${location.origin}/?room=${S.code}`;
  const text = `아발론 하자! 방 코드: ${S.code}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: '아발론', text, url });
      return;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    showToast('초대 링크를 복사했어요.');
  } catch {
    showToast(url);
  }
}

render();
connect();
