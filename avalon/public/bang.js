'use strict';
// 뱅! 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역과
// bang-data.js의 BANG_DATA를 그대로 쓴다. 함수들은 render() 시점에 호출된다.

const BANG_RULES_HTML = `
<details><summary>뱅! 규칙 간단 설명</summary>
<p><b>4~7명</b> · 보안관, 부보안관, 무법자, 배신자. 정체는 비밀이고 보안관만 공개돼요.</p>
<ul>
<li><b>보안관·부보안관</b>: 무법자와 배신자를 모두 제거하세요. <b>무법자</b>: 보안관을 제거하세요(무법자를 쓰러뜨리면 3장 뽑아요). <b>배신자</b>: 마지막 한 명으로 남아 보안관과 1:1로 이기세요.</li>
<li>내 턴: 카드 2장 뽑기 → 원하는 만큼 카드 내기 → 손패가 체력보다 많으면 버리고 턴 종료.</li>
<li><b>뱅!</b>은 한 턴에 한 번, 사거리(기본 1) 안의 사람에게. 맞는 사람은 <b>빗나감!</b>을 내서 막고, 못 막으면 체력 -1. 거리는 앉은 자리 기준 가까운 쪽이고 머스탱/스코프로 달라져요.</li>
<li>체력이 0이 되면 <b>맥주</b>로 버틸 수 있어요. 못 버티면 탈락하고 정체가 공개돼요. 둘만 남으면 맥주를 못 써요.</li>
<li>앞에 놓는 장비: 무기(사거리), 배럴(맞을 때 ♥면 막기), 머스탱/스코프(거리), 감옥(턴 건너뛰기 위험), 다이너마이트(♠2~9에 폭발).</li>
<li>사람마다 <b>캐릭터 능력</b>이 있어요. 내 정보에서 확인하세요.</li>
<li>보안관이 부보안관을 쓰러뜨리면 보안관은 모든 카드를 버려요.</li>
</ul></details>`;

const BD = BANG_DATA;
const bangRed = (suit) => suit === 'h' || suit === 'd';
const bangRank = (r) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' }[r] || String(r));

function bangCardHtml(c, o = {}) {
  const def = BD.CARDS[c.key];
  const cls = ['bc', def.type];
  if (o.cls) cls.push(o.cls);
  const inner = `<span class="rk ${bangRed(c.suit) ? 'red' : ''}">${BD.SUITS[c.suit]}${bangRank(c.rank)}</span><span class="ic">${def.icon}</span><span class="nm">${esc(def.name)}${c.asBang ? '<i>(뱅!)</i>' : ''}</span>`;
  if (o.act) return `<button class="${cls.join(' ')}" data-act="${o.act}" data-id="${c.id}">${inner}</button>`;
  return `<div class="${cls.join(' ')}">${inner}</div>`;
}

const bangPlayer = (id) => S.players.find((p) => p.id === id);
const bangName = (id) => (bangPlayer(id) ? esc(bangPlayer(id).name) : '?');

function bangHearts(p) {
  return `<span class="hearts">${'♥'.repeat(p.life)}<i>${'♥'.repeat(Math.max(0, p.max - p.life))}</i></span>`;
}

function bangPendingText() {
  const pd = S.pending;
  if (!pd) return '';
  const who = bangName(pd.who);
  switch (pd.t) {
    case 'respond':
      if (pd.kind === 'bang') return `🔫 ${bangName(pd.source)}님의 뱅! → <b>${who}</b>님이 막는 중${pd.need > 1 ? ` (빗나감! ${pd.need}장 필요)` : ''}`;
      if (pd.kind === 'gatling') return `🌀 개틀링! <b>${who}</b>님이 막는 중`;
      if (pd.kind === 'indians') return `🏹 인디언! <b>${who}</b>님이 뱅!을 버려야 해요`;
      return `⚔️ 결투! <b>${who}</b>님이 뱅!을 버려야 해요 (상대: ${bangName(pd.other)})`;
    case 'store': return `🏪 잡화점: <b>${who}</b>님이 고르는 중`;
    case 'dying': return `💀 <b>${who}</b>님이 죽기 직전! 맥주로 버틸 수 있어요`;
    case 'drawChoice': return `<b>${who}</b>님이 카드 뽑는 방법을 고르는 중`;
    case 'kit': return `<b>${who}</b>님이 카드 1장을 덱 위로 돌려놓는 중`;
    default: return '';
  }
}

function renderBang() {
  const me = bangPlayer(S.me);
  const isHost = S.hostId === S.me;
  const over = S.phase === 'over';
  const selCard = S.hand.find((c) => c.id === ui.bSel);
  const targeting = !!(selCard && selCard.targets && S.mode === 'main');
  const targetSet = new Set(targeting ? selCard.targets : []);

  // 나부터 시계 방향으로
  const idx = S.players.findIndex((p) => p.id === S.me);
  const ordered = idx < 0 ? S.players : [...S.players.slice(idx), ...S.players.slice(0, idx)];

  const rows = ordered.map((p) => {
    const cls = ['bp'];
    if (p.id === S.turnId) cls.push('turn');
    if (p.id === S.me) cls.push('me');
    if (!p.alive) cls.push('dead');
    if (S.pending && S.pending.who === p.id) cls.push('wait');
    if (targetSet.has(p.id)) cls.push('target');
    const ch = p.char ? BD.CHARS[p.char] : null;
    const role = p.role ? BD.ROLES[p.role] : null;
    const equip = p.table.map((c) => `<span class="tag eq" title="${esc(BD.CARDS[c.key].desc)}">${BD.CARDS[c.key].icon} ${esc(BD.CARDS[c.key].name)}</span>`).join('');
    const tags = [];
    if (role) tags.push(`<span class="tag role ${p.role}">${esc(role.name)}</span>`);
    if (p.dist != null) tags.push(`<span class="tag ${S.range != null && p.dist <= S.range ? 'near' : ''}">거리 ${p.dist}</span>`);
    const body = `<div class="bn"><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${p.id === S.turnId && !over ? ' 👈' : ''}<span class="ch">${ch ? esc(ch.name) : ''}</span></div>
      <div class="bs">${p.alive ? bangHearts(p) : '<span class="dim">탈락</span>'} <span class="hc">🃏 ${p.handCount}</span>${tags.join('')}</div>
      ${equip ? `<div class="be">${equip}</div>` : ''}`;
    return targeting && targetSet.has(p.id)
      ? `<button class="${cls.join(' ')}" data-act="bangTarget" data-id="${p.id}">${body}</button>`
      : `<div class="${cls.join(' ')}">${body}</div>`;
  }).join('');

  const turnP = bangPlayer(S.turnId);
  let status = '';
  if (over) {
    const label = { law: '보안관 팀 승리!', outlaw: '무법자 승리!', renegade: '배신자 승리!' }[S.winner];
    status = `<p class="big gold">🎉 ${label}</p>`;
  } else if (S.pending) {
    status = `<p class="bpend">${bangPendingText()}</p>`;
  } else if (S.turnId === S.me) {
    status = S.mode === 'discard'
      ? `<p class="big gold">손패 ${S.needDiscard}장을 버리세요</p>`
      : '<p class="big gold">내 차례예요!</p>';
  } else {
    status = `<p class="big dim">${turnP ? esc(turnP.name) : ''}님 차례</p>`;
  }

  const log = S.log.length
    ? `<div class="ulog">${S.log.slice(-6).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>`
    : '';

  const pile = `<div class="bpile">
      <span>🂠 덱 ${S.deckCount}장</span>
      <span>버린 더미 ${S.discardTop ? bangCardHtml(S.discardTop, { cls: 'mini' }) : '없음'}</span>
      ${S.range != null ? `<span>사거리 ${S.range}</span>` : ''}
    </div>`;

  return `
  <div class="top"><span>방 <b>${esc(S.code)}</b></span><span>뱅! · ${S.gameNo}번째 판</span></div>
  ${status}
  <div class="bplayers">${rows}</div>
  ${pile}
  ${log}
  ${over ? bangOverPanel(isHost) : ''}
  <div class="bdock">
    ${over ? '' : bangPanel(selCard, targeting)}
    ${over ? '' : bangHandHtml(selCard)}
    <div class="foot">
      <button data-act="bangInfo">🎭 내 정보</button>
      ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
    </div>
  </div>
  ${ui.bPick ? bangPickSheet() : ''}
  ${ui.bInfo ? bangInfoSheet(me) : ''}
  ${ui.hostOpen && isHost ? bangHostMenuHtml() : ''}`;
}

// 상황별 조작 영역
function bangPanel(selCard, targeting) {
  const mode = S.mode;
  const pd = S.pending;
  const sidBtn = S.canSid
    ? `<button class="${ui.bSid ? 'primary' : 'ghost'}" data-act="bangSid">${ui.bSid ? `시드: 버릴 카드 ${ui.bSid.length}/2 고르는 중 (눌러서 취소)` : '시드: 카드 2장 버리고 체력 +1'}</button>`
    : '';
  const desc = selCard
    ? `<p class="small bdesc"><b>${esc(BD.CARDS[selCard.key].name)}</b> — ${esc(BD.CARDS[selCard.key].desc)}</p>`
    : '';

  if (mode === 'main') {
    let act = '';
    if (selCard) {
      if (!selCard.ok) act = '<p class="dim small center">지금은 낼 수 없는 카드예요.</p>';
      else if (targeting) act = '<p class="center">위 목록에서 <b>대상</b>을 고르세요. (노란 테두리)</p>';
      else act = '<button class="primary" data-act="bangPlay">카드 내기</button>';
    }
    return `<div class="card panel">${desc}${act}
      <button data-act="bangEnd" ${ui.bSid ? 'disabled' : ''}>턴 끝내기</button>${sidBtn}</div>`;
  }
  if (mode === 'discard') {
    return `<div class="card panel"><p class="center">손패가 체력보다 많아요. 버릴 카드를 눌러 고르고 버리세요.</p>
      ${selCard ? `${desc}<button class="primary" data-act="bangDiscard">이 카드 버리기</button>` : ''}${sidBtn}</div>`;
  }
  if (mode === 'respond') {
    const need = pd.kind === 'bang' || pd.kind === 'gatling' ? '빗나감!' : '뱅!';
    return `<div class="card panel"><p class="center"><b>${bangPendingText()}</b></p>
      <p class="small dim center">${need} 카드를 내서 막거나, 포기하고 맞을 수 있어요.</p>
      ${selCard && selCard.ok ? `${desc}<button class="primary" data-act="bangRespond">이 카드로 막기</button>` : ''}
      <button class="no" data-act="bangGiveUp">포기 (체력 -1)</button></div>`;
  }
  if (mode === 'dying') {
    return `<div class="card panel"><p class="big bad">죽기 직전이에요!</p>
      <p class="small dim center">맥주를 마시면 살 수 있어요. 체력 ${S.players.find((p) => p.id === S.me).life}</p>
      ${selCard && selCard.ok ? `<button class="primary" data-act="bangRespond">맥주 마시기</button>` : ''}${sidBtn}
      <button class="no" data-act="bangGiveUp">포기하고 탈락</button></div>`;
  }
  if (mode === 'store') {
    const cards = pd.cards.map((c) => bangCardHtml(c, { act: 'bangStoreCard', cls: c.id === ui.bStore ? 'sel' : '' })).join('');
    return `<div class="card panel"><h2>🏪 잡화점</h2><p class="small dim">가져갈 카드를 고르세요.</p><div class="bhand">${cards}</div>
      ${ui.bStore ? '<button class="primary" data-act="bangStorePick">이 카드 가져가기</button>' : ''}</div>`;
  }
  if (mode === 'drawChoice') {
    const btns = [`<button class="primary" data-act="bangChoose" data-opt="deck">덱에서 2장 뽑기</button>`];
    if (pd.discardTop) btns.push(`<button data-act="bangChoose" data-opt="discard">버린 더미 맨 위(${esc(BD.CARDS[pd.discardTop.key].name)})를 첫 카드로</button>`);
    for (const id of pd.options || []) if (id !== 'discard') btns.push(`<button data-act="bangChoose" data-opt="${id}">${bangName(id)}님의 손패에서 1장 뽑기</button>`);
    return `<div class="card panel"><h2>카드 뽑기</h2>${btns.join('')}</div>`;
  }
  if (mode === 'kit') {
    return `<div class="card panel"><h2>키트 칼슨</h2><p class="center">방금 받은 3장 중 <b>덱 위로 돌려놓을 1장</b>을 고르세요.</p>
      ${selCard && selCard.ok ? `${desc}<button class="primary" data-act="bangKit">이 카드를 덱 위로</button>` : ''}</div>`;
  }
  return '';
}

function bangOverPanel(isHost) {
  const rows = S.players.map((p) => {
    const r = p.role ? BD.ROLES[p.role] : null;
    return `<div class="slot"><span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><span class="tag role ${p.role}">${r ? esc(r.name) : ''}</span><span class="dim small">${p.char ? esc(BD.CHARS[p.char].name) : ''}${p.alive ? '' : ' · 탈락'}</span></div>`;
  }).join('');
  return `<div class="card panel"><h2>결과</h2>${rows}
    ${isHost
      ? `<button class="primary" data-act="restart" style="margin-top:10px">같은 멤버로 바로 다시 하기</button>
         <button data-act="again" style="margin-top:8px">대기실로 돌아가기</button>`
      : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
  </div>`;
}

function bangHandHtml(selCard) {
  if (!S.hand.length) return '<p class="dim small center">손패가 없어요.</p>';
  const selSid = ui.bSid || [];
  const cards = S.hand.map((c) => {
    const cls = [];
    const interactive = S.mode === 'main' || S.mode === 'discard' || S.mode === 'respond' || S.mode === 'dying' || S.mode === 'kit';
    if (ui.bSid) cls.push(selSid.includes(c.id) ? 'sel' : 'okc');
    else {
      cls.push(c.ok ? 'okc' : (interactive ? 'noc' : ''));
      if (c.id === ui.bSel) cls.push('sel');
    }
    return bangCardHtml(c, { act: 'bangCard', cls: cls.join(' ') });
  }).join('');
  return `<div class="bhand">${cards}</div>`;
}

// 패닉!/캣 발루: 손패(무작위) 또는 앞에 놓인 카드 중 고르기
function bangPickSheet() {
  const t = bangPlayer(ui.bPick.target);
  const sel = S.hand.find((c) => c.id === ui.bSel);
  const verb = sel && sel.key === 'panic' ? '가져올' : '버리게 할';
  const handBtn = t.handCount > 0 ? `<button data-act="bangPick" data-pick="hand">🃏 손패 ${t.handCount}장 중 무작위 1장</button>` : '';
  const eq = t.table.map((c) => `<button data-act="bangPick" data-pick="${c.id}">${BD.CARDS[c.key].icon} ${esc(BD.CARDS[c.key].name)} (앞에 놓인 카드)</button>`).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet"><h2>${esc(t.name)}님의 어떤 카드를 ${verb}까요?</h2>${handBtn}${eq}<button class="ghost" data-act="closeall">취소</button></div></div>`;
}

function bangInfoSheet(me) {
  const role = me && me.role ? BD.ROLES[me.role] : null;
  const ch = me && me.char ? BD.CHARS[me.char] : null;
  const others = S.players.filter((p) => p.char && p.id !== S.me).map((p) => `<div class="slot"><span class="nm">${esc(p.name)}</span><span class="small">${esc(BD.CHARS[p.char].name)}: ${esc(BD.CHARS[p.char].desc)}</span></div>`).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    ${role ? `<div class="rolecard ${role.team === 'law' ? 'good' : 'evil'}"><div class="side">내 역할</div><div class="rn">${esc(role.name)}</div><div class="desc">${esc(role.goal)}</div></div>` : ''}
    ${ch ? `<div class="card"><b>${esc(ch.name)}</b> (체력 ${me.max})<p class="small" style="margin:4px 0 0">${esc(ch.desc)}</p></div>` : ''}
    <h2>다른 사람의 캐릭터</h2>${others}
    <button data-act="closeall">닫기</button></div></div>`;
}

function bangHostMenuHtml() {
  const playing = S.phase === 'play';
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>방장 메뉴</h2>
    <p class="dim small">누르면 모든 사람의 진행 상황이 바로 바뀌어요.</p>
    ${playing ? '<button data-act="force" data-confirm="자리를 비운 사람 대신 기본 선택으로 진행할까요? (대응 대기 중이면 포기, 자기 턴이면 턴 종료)">자리 비운 사람 대신 진행</button>' : ''}
    <button class="primary" data-act="restart" data-confirm="같은 멤버로 역할과 카드를 새로 나눠 다시 시작할까요?">처음부터 다시 시작 (역할 새로 배정)</button>
    <button data-act="again" data-confirm="게임을 초기화하고 모두 대기실로 돌아갈까요?">초기화하고 대기실로</button>
    <button class="ghost" data-act="closeall">닫기</button>
  </div></div>`;
}

// ---- 동작 ----

// 서버 상태가 바뀔 때마다 화면 쪽 선택 상태를 정리한다
function bangSync() {
  if (S.kind !== 'bang') {
    ui.bSel = ui.bPick = ui.bSid = ui.bStore = null;
    ui.bInfo = false;
    return;
  }
  const sel = S.hand.find((c) => c.id === ui.bSel);
  if (!sel || (!sel.ok && S.mode !== 'main')) ui.bSel = null;
  if (!ui.bSel) ui.bPick = null;
  if (S.mode !== 'main' && S.mode !== 'discard' && S.mode !== 'dying') ui.bSid = null;
  if (!(S.pending && S.pending.t === 'store' && S.pending.cards.some((c) => c.id === ui.bStore))) ui.bStore = null;
}

function bangPlayCard(target, pick) {
  send({ t: 'play', card: ui.bSel, target, pick });
  ui.bSel = null;
  ui.bPick = null;
}

function bangOnCard(id) {
  const card = S.hand.find((c) => c.id === id);
  if (!card) return;
  if (ui.bSid) {
    const cur = ui.bSid;
    ui.bSid = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    if (ui.bSid.length === 2) {
      send({ t: 'sid', cards: ui.bSid });
      ui.bSid = null;
    }
    render();
    return;
  }
  if (S.mode === 'wait' || S.mode === 'over' || S.mode === 'lobby') return;
  if (!card.ok && S.mode !== 'main') return showToast('지금은 이 카드를 쓸 수 없어요.');
  ui.bSel = ui.bSel === id ? null : id;
  render();
}

function bangClick(act, el) {
  switch (act) {
    case 'bangCard': bangOnCard(Number(el.dataset.id)); return true;
    case 'bangTarget': {
      const sel = S.hand.find((c) => c.id === ui.bSel);
      const t = bangPlayer(el.dataset.id);
      if (!sel || !t) return true;
      if (sel.key === 'panic' || sel.key === 'catbalou') {
        // 고를 수 있는 선택지가 하나뿐이면 바로 보낸다
        if (t.table.length === 0) bangPlayCard(t.id, 'hand');
        else if (t.handCount === 0 && t.table.length === 1) bangPlayCard(t.id, t.table[0].id);
        else {
          ui.bPick = { target: t.id };
          render();
        }
        return true;
      }
      bangPlayCard(t.id);
      return true;
    }
    case 'bangPick': {
      const pick = el.dataset.pick === 'hand' ? 'hand' : Number(el.dataset.pick);
      bangPlayCard(ui.bPick.target, pick);
      return true;
    }
    case 'bangPlay': bangPlayCard(); return true;
    case 'bangEnd': send({ t: 'end' }); ui.bSel = null; return true;
    case 'bangDiscard': send({ t: 'discard', card: ui.bSel }); ui.bSel = null; return true;
    case 'bangRespond': send({ t: 'respond', card: ui.bSel }); ui.bSel = null; return true;
    case 'bangGiveUp':
      if (window.confirm(S.mode === 'dying' ? '정말 포기하고 탈락할까요?' : '막지 않고 맞을까요?')) send({ t: 'respond' });
      ui.bSel = null;
      return true;
    case 'bangStoreCard': ui.bStore = ui.bStore === Number(el.dataset.id) ? null : Number(el.dataset.id); render(); return true;
    case 'bangStorePick': send({ t: 'store', card: ui.bStore }); ui.bStore = null; return true;
    case 'bangChoose': send({ t: 'choose', opt: el.dataset.opt }); return true;
    case 'bangKit': send({ t: 'choose', card: ui.bSel }); ui.bSel = null; return true;
    case 'bangSid':
      ui.bSid = ui.bSid ? null : [];
      ui.bSel = null;
      render();
      return true;
    case 'bangInfo': ui.bInfo = true; render(); return true;
    default: return false;
  }
}
