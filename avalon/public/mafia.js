'use strict';
// 마피아 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역을 그대로 쓴다.
// 비밀(남의 역할, 남의 표, 마피아 채팅)은 서버가 걸러서 보내므로 여기엔 없다.

const MAFIA_RULES_HTML = `
<details><summary>마피아 규칙 간단 설명</summary>
<p><b>5~12명</b> · 마피아팀(마피아) vs 시민팀(경찰, 의사, 시민). 마피아는 서로를 알고 있어요.</p>
<ul>
<li>게임은 <b>낮부터</b> 시작해요: 1일차 낮(토론·투표) → 1번째 밤 → 2일차 낮 → …</li>
<li><b>밤</b>: 마피아는 함께 한 명을 골라 죽여요. <b>의사</b>는 한 명을 지켜요(자기 자신도 가능). <b>경찰</b>은 한 명을 조사해 마피아인지 알아내요(본인만 확인).</li>
<li>마피아의 표적을 의사가 지켰다면 아무도 죽지 않아요. 마피아의 표가 갈리면 최다득표 중 무작위예요.</li>
<li><b>낮</b>: 밤에 일어난 일이 공개되고 토론해요(채팅 또는 음성). 산 사람의 과반이 "토론 끝"을 누르면 투표로 넘어가요.</li>
<li><b>투표</b>: 각자 한 명(또는 기권)에게 투표해요. 혼자 가장 많은 표를 받은 사람이 <b>처형 후보</b>가 되고, 동률이면 아무도 후보가 되지 않아요.</li>
<li><b>찬반 투표</b>: 후보를 뺀 산 사람이 "처형(찬성)" 또는 "살리기(반대)"를 골라요. <b>찬성이 반대보다 많아야</b> 처형돼요(동수면 살아요). 후보 본인은 투표할 수 없어요.</li>
<li>마피아가 모두 죽으면 <b>시민팀 승리</b>. 마피아 수가 나머지 생존자 수 이상이 되면 <b>마피아팀 승리</b>.</li>
<li>죽은 사람은 말할 수 없어요. 직업을 공개할지는 방장이 대기실에서 정해요. 경찰은 기본적으로 "마피아인지 아닌지"만 알지만, 방장이 옵션을 켜면 직업까지 알아요.</li>
</ul></details>`;

const MAFIA_ROLE = {
  mafia: { name: '마피아', cls: 'mafia', icon: '🔪' },
  police: { name: '경찰', cls: 'police', icon: '🕵️' },
  doctor: { name: '의사', cls: 'doctor', icon: '💉' },
  citizen: { name: '시민', cls: 'citizen', icon: '🙂' },
};
const MAFIA_ROLE_DESC = {
  mafia: '밤마다 동료와 함께 한 명을 골라 제거하세요. 낮에는 시민인 척 정체를 숨기세요.',
  police: '밤마다 한 명을 조사해 마피아인지 알아낼 수 있어요. 정체를 들키면 마피아의 표적이 되니 조심하세요.',
  doctor: '밤마다 한 명을 지켜요. 마피아가 그 사람을 노리면 살아나요. 자기 자신도 지킬 수 있어요.',
  citizen: '특별한 능력은 없어요. 토론과 투표로 마피아를 찾아내세요.',
};

const mfPlayer = (id) => S.players.find((p) => p.id === id);
const mfName = (id) => (mfPlayer(id) ? esc(mfPlayer(id).name) : '?');
const mfMe = () => mfPlayer(S.me);

function mafiaLobbyOptions(isHost) {
  const opt = (key, label, hint) => `<label class="opt ${isHost ? '' : 'ro'}">
    <input type="checkbox" data-act="mafiaOpt" data-key="${key}" ${S.settings[key] ? 'checked' : ''} ${isHost ? '' : 'disabled'} />
    <span>${label}<small class="dim" style="display:block;font-size:12px">${hint}</small></span>
  </label>`;
  return `${opt('revealRoles', '죽은 사람의 직업 공개', '꺼 두면 게임이 끝날 때까지 정체를 알 수 없어요')}
    ${opt('policeReveal', '경찰에게 직업까지 알려주기', '꺼 두면 경찰은 "마피아인지 아닌지"만 알아요 (기본)')}
    ${isHost ? '' : '<p class="small dim" style="margin:0 0 6px">옵션은 방장이 정해요.</p>'}`;
}

function mfRoleTag(p) {
  if (!p.role) return '';
  const r = MAFIA_ROLE[p.role];
  return `<span class="tag role mf-${r.cls}">${r.icon} ${r.name}</span>`;
}

function mfRoleCard() {
  const me = mfMe();
  if (!me || !me.role) return '';
  const r = MAFIA_ROLE[me.role];
  const mates = me.role === 'mafia'
    ? S.players.filter((p) => p.role === 'mafia' && p.id !== S.me).map((p) => `${esc(p.name)}${p.alive ? '' : ' (죽음)'}`)
    : [];
  const team = me.role === 'mafia' ? 'evil' : 'good';
  return `<div class="rolecard ${team}"><div class="side">내 역할</div><div class="rn">${r.icon} ${r.name}</div>
    <div class="desc">${esc(MAFIA_ROLE_DESC[me.role])}</div>
    ${me.role === 'mafia' ? `<div class="night"><div class="t">동료 마피아</div><div class="n">${mates.length ? mates.join(', ') : '없음 (혼자예요)'}</div></div>` : ''}
  </div>`;
}

function mfPoliceLog() {
  if (!S.policeLog || !S.policeLog.length) return '';
  const result = (l) => (l.role
    ? `${MAFIA_ROLE[l.role].icon} ${MAFIA_ROLE[l.role].name}`
    : l.mafia ? '마피아!' : '마피아 아님');
  return `<div class="card"><b>🕵️ 조사 기록</b>${S.policeLog.map((l) => `<div class="small" style="margin-top:4px">${l.day}번째 밤 · ${mfName(l.target)}님 → <b class="${l.mafia ? 'n' : 'y'}">${result(l)}</b></div>`).join('')}</div>`;
}

function mfChatHtml() {
  // 밤에는 마피아 채팅만, 낮/투표에는 전체 채팅만 보여준다 (끝나면 모두)
  const show = S.phase === 'night' ? (c) => c.ch === 'mafia' : S.phase === 'over' ? () => true : (c) => c.ch === 'all';
  const lines = S.chat.filter(show).map((c) => `<div class="cl ${c.ch}"><b>${esc(c.name)}</b> ${esc(c.text)}</div>`).join('');
  const label = S.canChat === 'mafia' ? '마피아끼리만 보이는 채팅' : S.canChat === 'all' ? '토론 채팅' : '채팅 (읽기 전용)';
  return `<div class="card mchatbox"><div class="small dim">💬 ${label}</div>
    <div class="mchat" id="mchat">${lines || '<div class="dim small">아직 대화가 없어요.</div>'}</div>
    ${S.canChat ? `<div class="mrow"><input type="text" id="mtext" maxlength="80" autocomplete="off" placeholder="메시지 입력" value="${esc(ui.mText || '')}" /><button class="sm primary" data-act="mafiaSend">보내기</button></div>` : ''}
  </div>`;
}

function renderMafia() {
  const me = mfMe();
  const isHost = S.hostId === S.me;
  const phase = S.phase;
  const over = phase === 'over';
  const sel = ui.mSel;

  // 선택 가능한 대상
  let pickable = new Set();
  if (phase === 'night' && S.nightAction && !S.nightAction.done) pickable = new Set(S.nightAction.options);
  if (phase === 'vote' && me && me.alive && !S.myVote) pickable = new Set(S.players.filter((p) => p.alive && p.id !== S.me).map((p) => p.id));

  const counts = S.lastVote && (phase === 'voteResult' || phase === 'trial') ? S.lastVote.counts : {};
  const rows = S.players.map((p) => {
    const cls = ['mp'];
    if (!p.alive) cls.push('dead');
    if (p.id === S.me) cls.push('me');
    if (pickable.has(p.id)) cls.push('pick');
    if (sel === p.id) cls.push('sel');
    const marks = [];
    if (phase === 'day' && p.alive && p.ready) marks.push('<span class="tag">✋ 토론 끝</span>');
    if ((phase === 'vote' || phase === 'trial') && p.alive && p.voted) marks.push('<span class="tag">🗳 투표함</span>');
    if (phase === 'trial' && p.id === S.accusedId) marks.push('<span class="tag" style="color:var(--evil)">⚖️ 처형 후보</span>');
    if (phase === 'voteResult' && S.lastVote && S.lastVote.trial && S.lastVote.trial.votes[p.id] !== undefined) {
      marks.push(S.lastVote.trial.votes[p.id] ? '<span class="tag" style="color:var(--evil)">☠️ 찬성</span>' : '<span class="tag" style="color:var(--ok)">🙏 반대</span>');
    }
    if (phase === 'night' && S.nightAction && S.nightAction.team) {
      const picked = S.nightAction.team.filter((t) => t.target === p.id).map((t) => mfName(t.voter));
      if (picked.length) marks.push(`<span class="tag" style="color:var(--evil)">🔪 ${picked.join(', ')} 지목</span>`);
    }
    if (counts[p.id]) marks.push(`<span class="tag" style="color:var(--gold)">${counts[p.id]}표</span>`);
    if (S.lastNight && S.lastNight.victim === p.id && phase === 'day') marks.push('<span class="tag" style="color:var(--evil)">☠️ 밤에 죽음</span>');
    const body = `<span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>
      <span class="mstate">${p.alive ? '' : '💀 '}${mfRoleTag(p)}${marks.join('')}</span>`;
    return pickable.has(p.id)
      ? `<button class="${cls.join(' ')}" data-act="mafiaPick" data-id="${p.id}">${body}</button>`
      : `<div class="${cls.join(' ')}">${body}</div>`;
  }).join('');

  const title = { roles: '역할 확인', night: `🌙 ${S.day}번째 밤`, day: `☀️ ${S.day}일차 낮`, vote: `🗳 ${S.day}일차 투표`, trial: `⚖️ ${S.day}일차 찬반 투표`, voteResult: '투표 결과', over: '게임 끝' }[phase];

  return `
  <div class="top"><span>${roomTag()}</span><span>마피아 · ${title}</span></div>
  ${mfRoleBanner(me)}
  ${mfPanel(me, isHost)}
  <div class="mplayers">${rows}</div>
  ${phase === 'day' || phase === 'vote' || phase === 'trial' || (phase === 'night' && S.canChat) || (over && S.chat.length) ? mfChatHtml() : ''}
  ${mfPoliceLog()}
  ${mfLog()}
  <div class="bdock">
    ${mfDockButtons(me)}
    <div class="foot">
      <button data-act="mafiaInfo">🎭 내 역할</button>
      ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
    </div>
  </div>
  ${ui.mInfo ? `<div class="overlay" data-act="closeall"><div class="sheet">${mfRoleCard()}<button data-act="closeall">닫기</button></div></div>` : ''}
  ${ui.hostOpen && isHost ? mfHostMenuHtml() : ''}`;
}

// 주요 행동 버튼은 화면 아래에 붙여 둔다 (플레이어 목록이 길어도 바로 누를 수 있게)
function mfDockButtons(me) {
  if (!me || !me.alive) return '';
  const sel = ui.mSel;
  if (S.phase === 'night' && S.nightAction && !S.nightAction.done) {
    const label = { mafia: '죽이기', doctor: '지키기', police: '조사하기' }[S.nightAction.kind];
    return sel
      ? `<button class="primary" data-act="mafiaConfirm">${mfName(sel)}님 ${label}</button>`
      : '<button disabled>대상을 고르세요</button>';
  }
  if (S.phase === 'day' && !me.ready) return '<button class="primary" data-act="ready">토론 끝 (투표하러 가기)</button>';
  if (S.phase === 'vote' && !S.myVote) {
    return `<div class="row">${sel
      ? `<button class="no" data-act="mafiaVote">${mfName(sel)}님에게 투표</button>`
      : '<button disabled>대상을 고르세요</button>'}<button class="ghost" data-act="mafiaAbstain">기권</button></div>`;
  }
  if (S.phase === 'trial' && S.accusedId !== S.me && !S.myJudge) {
    return '<div class="row"><button class="no" data-act="mafiaJudge" data-kill="1">☠️ 처형 (찬성)</button><button class="primary" data-act="mafiaJudge" data-kill="0">🙏 살리기 (반대)</button></div>';
  }
  return '';
}

function mfRoleBanner(me) {
  if (!me || !me.role || S.phase === 'roles' || S.phase === 'over') return '';
  const r = MAFIA_ROLE[me.role];
  return `<div class="mbanner ${r.cls}">${r.icon} 나는 <b>${r.name}</b>${me.alive ? '' : ' · 💀 죽었어요 (지켜보기만 할 수 있어요)'}</div>`;
}

function mfLog() {
  if (!S.log.length) return '';
  const lines = S.phase === 'over' ? S.log : S.log.slice(-6);
  return `<div class="ulog">${lines.slice().reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l.text)}</div>`).join('')}</div>`;
}

function mfPanel(me, isHost) {
  const phase = S.phase;
  const alive = me && me.alive;
  const progress = (n, total, what) => `<p class="progress">${what} ${n}/${total}</p>`;

  if (phase === 'roles') {
    const total = S.players.length;
    const mafia = S.players.filter((p) => p.role === 'mafia').length;
    const acked = S.players.filter((p) => p.acked).length;
    return `<div class="card panel"><h2>당신의 역할</h2>${mfRoleCard()}
      <p class="dim small center" style="margin:10px 0 0">이번 판 (${total}명): 마피아 ${Math.max(1, Math.floor(total / 3))} · 경찰 1 · 의사 1 · 시민 ${total - Math.max(1, Math.floor(total / 3)) - 2}</p>
      ${me && S.players.find((p) => p.id === S.me).acked
        ? `${progress(acked, total, '확인한 사람')}${isHost ? '<button class="ghost" data-act="force">기다리지 않고 시작</button>' : ''}`
        : '<button class="primary" data-act="ack" style="margin-top:12px">확인했어요</button>'}
    </div>`;
  }

  if (phase === 'night') {
    const na = S.nightAction;
    if (!alive) return '<div class="card panel center"><p class="big dim">🌙 밤이에요</p><p class="dim small">당신은 죽었어요. 조용히 지켜보세요.</p></div>';
    if (!na) return '<div class="card panel center"><p class="big dim">🌙 밤이에요</p><p class="dim small">눈을 감고 기다리세요. 곧 아침이 와요.</p></div>';
    const verb = { mafia: '죽일 사람', doctor: '지킬 사람', police: '조사할 사람' }[na.kind];
    if (na.done) {
      return `<div class="card panel"><h2>🌙 밤</h2><p class="big gold">${mfName(na.myPick)}님을 선택했어요</p>
        <p class="progress">다른 역할이 모두 정할 때까지 기다리는 중…</p>${isHost ? '<button class="ghost" data-act="force">기다리지 않고 아침으로</button>' : ''}</div>`;
    }
    return `<div class="card panel"><h2>🌙 밤 — ${verb}을 고르세요</h2>
      <p class="small dim">${na.kind === 'mafia' ? '동료의 선택은 아래 목록에 표시돼요. 채팅으로 의논하세요.' : na.kind === 'police' ? '조사 결과는 나만 볼 수 있어요.' : '자기 자신도 고를 수 있어요.'}</p>
      <p class="center">아래 목록에서 한 명을 누르면 맨 아래에 확인 버튼이 나와요.</p></div>`;
  }

  if (phase === 'day') {
    const ln = S.lastNight;
    let news = S.day === 1 && !ln
      ? '첫 번째 낮이에요. 아직 밤을 겪지 않아서 아무 일도 없었어요. 서로 이야기해 보고, 의심되는 사람이 없으면 기권해도 돼요.'
      : '조용한 밤이었어요.';
    if (ln && ln.victim) news = `☠️ <b>${mfName(ln.victim)}</b>님이 밤사이 마피아에게 살해당했어요.`;
    else if (ln && ln.saved) news = `마피아가 <b>${mfName(ln.attacked)}</b>님을 공격했지만 의사가 살렸어요!`;
    const readyN = S.readyCount;
    const need = Math.floor(S.aliveCount / 2) + 1;
    const mine = me && me.ready;
    return `<div class="card panel"><h2>☀️ ${S.day}일차 낮</h2><p>${news}</p>
      <p class="small dim">토론하세요. 살아 있는 ${S.aliveCount}명 중 ${need}명이 "토론 끝"을 누르면 투표가 시작돼요.</p>
      ${alive && mine ? '<p class="center dim">✋ 토론 끝을 눌렀어요</p>' : ''}
      ${progress(readyN, need, '토론 끝')}${isHost ? '<button class="ghost" data-act="force">지금 투표 시작</button>' : ''}</div>`;
  }

  if (phase === 'vote') {
    const votedN = S.players.filter((p) => p.voted).length;
    if (!alive) return `<div class="card panel"><h2>🗳 투표</h2><p class="dim center">당신은 죽어서 투표할 수 없어요.</p>${progress(votedN, S.aliveCount, '투표')}</div>`;
    if (S.myVote) {
      const t = S.myVote.target;
      return `<div class="card panel"><h2>🗳 투표</h2><p class="big gold">${t ? `${mfName(t)}님에게 투표했어요` : '기권했어요'}</p>
        ${progress(votedN, S.aliveCount, '투표')}${isHost ? '<button class="ghost" data-act="force">기다리지 않고 개표</button>' : ''}</div>`;
    }
    return `<div class="card panel"><h2>🗳 투표 — 처형 후보</h2>
      <p class="small dim">단독 최다득표자가 처형 후보가 되고, 이어서 찬반 투표를 해요. 동률이면 아무도 후보가 되지 않아요.</p>
      <p class="center">아래 목록에서 한 명을 누르면 맨 아래에 투표 버튼이 나와요.</p>${progress(votedN, S.aliveCount, '투표')}</div>`;
  }

  if (phase === 'trial') {
    const lv = S.lastVote;
    const judgedN = S.players.filter((p) => p.voted).length;
    const voters = S.judgeCount;
    const tally = lv ? Object.values(lv.counts).reduce((a, b) => a + b, 0) : 0;
    const head = `<h2>⚖️ 찬반 투표</h2><p class="big bad">${mfName(S.accusedId)}님을 처형할까요?</p>
      <p class="small dim center" style="margin-top:-4px">${lv ? `${mfName(S.accusedId)}님이 ${lv.counts[S.accusedId]}표를 받았어요 (총 ${tally}표). ` : ''}찬성이 반대보다 많아야 처형돼요. 동수면 살아요.</p>`;
    if (S.me === S.accusedId) {
      return `<div class="card panel">${head}<p class="center dim">당신이 처형 후보예요. 투표할 수 없어요.</p>${progress(judgedN, voters, '찬반 투표')}${isHost ? '<button class="ghost" data-act="force">기다리지 않고 개표</button>' : ''}</div>`;
    }
    if (!alive) return `<div class="card panel">${head}<p class="dim center">당신은 죽어서 투표할 수 없어요.</p>${progress(judgedN, voters, '찬반 투표')}</div>`;
    if (S.myJudge) {
      return `<div class="card panel">${head}<p class="big gold">${S.myJudge.kill ? '☠️ 처형(찬성)에 투표했어요' : '🙏 살리기(반대)에 투표했어요'}</p>${progress(judgedN, voters, '찬반 투표')}${isHost ? '<button class="ghost" data-act="force">기다리지 않고 개표</button>' : ''}</div>`;
    }
    return `<div class="card panel">${head}<p class="center">아래 버튼으로 투표하세요.</p>${progress(judgedN, voters, '찬반 투표')}${isHost ? '<button class="ghost" data-act="force">기다리지 않고 개표</button>' : ''}</div>`;
  }

  if (phase === 'voteResult') {
    const lv = S.lastVote;
    const rows = lv ? Object.entries(lv.votes).map(([voter, t]) => `<div class="small">${mfName(voter)} → ${t ? mfName(t) : '<span class="dim">기권</span>'}</div>`).join('') : '';
    const acked = S.players.filter((p) => p.acked).length;
    const needAck = S.players.filter((p) => p.alive && p.connected).length;
    const meAcked = me && S.players.find((p) => p.id === S.me).acked;
    return `<div class="card panel"><h2>⚖️ 투표 결과</h2>
      <p class="big ${lv && lv.executed ? 'bad' : 'gold'}">${lv && lv.executed ? `${mfName(lv.executed)}님이 처형됐어요` : lv && lv.accused ? `${mfName(lv.accused)}님은 처형되지 않았어요` : '아무도 처형 후보가 되지 않았어요'}</p>
      ${lv && lv.trial ? `<p class="center"><b class="n">찬성 ${lv.trial.kill}</b> : <b class="y">반대 ${lv.trial.spare}</b></p>` : ''}
      <div style="margin:8px 0"><div class="small dim">1차 투표</div>${rows}</div>
      ${alive ? (meAcked ? progress(acked, needAck, '확인') : '<button class="primary" data-act="ack">확인</button>') : ''}
      ${isHost ? '<button class="ghost" data-act="force">기다리지 않고 넘어가기</button>' : ''}</div>`;
  }

  if (phase === 'over') {
    const win = S.winner === 'citizen';
    return `<div class="card panel"><h2>게임 끝</h2><p class="big ${win ? 'ok' : 'bad'}">${win ? '🙂 시민팀 승리!' : '🔪 마피아팀 승리!'}</p>
      ${isHost
        ? `<button class="primary" data-act="restart" style="margin-top:8px">같은 멤버로 바로 다시 하기</button>
           <button data-act="again" style="margin-top:8px">대기실로 돌아가기</button>`
        : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}</div>`;
  }
  return '';
}

function mfHostMenuHtml() {
  const playing = S.phase !== 'over' && S.phase !== 'lobby';
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 바로 바뀌어요.</p>
    ${playing ? '<button data-act="force" data-confirm="멈춘 곳을 기본값으로 넘길까요? (밤: 행동 안 한 사람은 건너뜀, 투표: 기권 처리)">멈춘 곳 넘기기</button>' : ''}
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 역할을 새로 나눠 다시 시작할까요?">처음부터 다시 시작 (역할 새로 배정)</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요?">초기화하고 대기실로</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

// ---- 동작 ----

function mafiaSync() {
  if (S.kind !== 'mafia') {
    ui.mSel = null;
    ui.mInfo = false;
    return;
  }
  const na = S.nightAction;
  const canNight = S.phase === 'night' && na && !na.done && na.options.includes(ui.mSel);
  const me = mfMe();
  const canVote = S.phase === 'vote' && me && me.alive && !S.myVote && ui.mSel !== S.me && mfPlayer(ui.mSel) && mfPlayer(ui.mSel).alive;
  if (!canNight && !canVote) ui.mSel = null;
}

function mafiaAfterRender() {
  const el = document.getElementById('mchat');
  if (el) el.scrollTop = el.scrollHeight;
}

function mafiaSendChat() {
  const text = (ui.mText || '').trim();
  if (!text) return;
  send({ t: 'chat', text });
  ui.mText = '';
  const input = document.getElementById('mtext');
  if (input) input.value = '';
}

document.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'mtext') ui.mText = e.target.value;
});
document.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'mtext' && e.key === 'Enter') {
    e.preventDefault();
    mafiaSendChat();
  }
});
document.addEventListener('change', (e) => {
  if (e.target && e.target.dataset && e.target.dataset.act === 'mafiaOpt') {
    send({ t: 'setting', key: e.target.dataset.key, value: e.target.checked });
  }
});

function mafiaClick(act, el) {
  switch (act) {
    case 'mafiaPick':
      ui.mSel = ui.mSel === el.dataset.id ? null : el.dataset.id;
      render();
      return true;
    case 'mafiaConfirm':
      send({ t: 'night', target: ui.mSel });
      ui.mSel = null;
      return true;
    case 'mafiaVote':
      send({ t: 'vote', target: ui.mSel });
      ui.mSel = null;
      return true;
    case 'mafiaAbstain':
      if (window.confirm('기권할까요?')) send({ t: 'vote', target: null });
      ui.mSel = null;
      return true;
    case 'mafiaJudge':
      send({ t: 'judge', kill: el.dataset.kill === '1' });
      return true;
    case 'ready': send({ t: 'ready' }); return true;
    case 'mafiaSend': mafiaSendChat(); return true;
    case 'mafiaInfo': ui.mInfo = true; render(); return true;
    case 'mafiaOpt': return true; // 체크박스는 change 이벤트로 처리
    default: return false;
  }
}
