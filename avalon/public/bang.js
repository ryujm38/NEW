'use strict';
// 뱅! 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역과
// bang-data.js의 BANG_DATA를 그대로 쓴다. 함수들은 render() 시점에 호출된다.
// 서부 분위기(모래·나무·현상수배 포스터)는 skin-bang.css에서 CSS 그라디언트로 새로 그렸다. 외부 이미지 없음.

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
const BANG_TYPE_LABEL = { brown: '즉시 사용', blue: '장비', gun: '무기' };

// 화면을 다시 그려도 애니메이션이 처음부터 다시 돌지 않게, 바뀐 시각을 기억해 두고 남은 만큼만 이어서 돌린다
const BANG_ANIM = { game: null, life: {}, hitAt: {}, hand: new Set(), handAt: {} };
const BANG_ANIM_MS = 600;
function bangAnimStyle(at) {
  const t = Date.now() - at;
  return at && t < BANG_ANIM_MS ? `animation-delay:-${t}ms` : null;
}
function bangTrackAnim() {
  const now = Date.now();
  const key = `${S.code}:${S.gameNo}`;
  const fresh = BANG_ANIM.game !== key;
  if (fresh) Object.assign(BANG_ANIM, { game: key, life: {}, hitAt: {}, handAt: {} });
  S.players.forEach((p) => {
    if (!fresh && BANG_ANIM.life[p.id] != null && p.life < BANG_ANIM.life[p.id]) BANG_ANIM.hitAt[p.id] = now;
    BANG_ANIM.life[p.id] = p.life;
  });
  const ids = new Set(S.hand.map((c) => c.id));
  if (!fresh) ids.forEach((id) => { if (!BANG_ANIM.hand.has(id)) BANG_ANIM.handAt[id] = now; });
  BANG_ANIM.hand = ids;
}

// 카드 한 장: 왼쪽 위 숫자·무늬, 가운데 그림, 아래 이름 띠와 종류(갈색=즉시 / 파랑=장비)
function bangCardHtml(c, o = {}) {
  const def = BD.CARDS[c.key];
  const cls = ['bng-card', `t-${def.type}`];
  if (o.cls) cls.push(o.cls);
  const ty = c.asBang ? '뱅!으로 쓰기' : def.type === 'gun' ? `무기 · 사거리 ${def.range}` : BANG_TYPE_LABEL[def.type];
  const inner = `<span class="bk-rk ${bangRed(c.suit) ? 'red' : ''}"><b>${bangRank(c.rank)}</b><i>${BD.SUITS[c.suit]}</i></span>`
    + `<span class="bk-art"><span class="bk-ic">${def.icon}</span>${def.type === 'gun' ? `<em class="bk-rng">${def.range}</em>` : ''}</span>`
    + `<span class="bk-nm">${esc(def.name)}</span><span class="bk-ty">${ty}</span>`;
  const label = `${def.name} ${BD.SUITS[c.suit]}${bangRank(c.rank)}`;
  const st = o.style ? ` style="${o.style}"` : '';
  if (o.act) return `<button class="${cls.join(' ')}" data-act="${o.act}" data-id="${c.id}"${st} aria-label="${esc(label)}">${inner}</button>`;
  return `<span class="${cls.join(' ')}" role="img" aria-label="${esc(label)}">${inner}</span>`;
}

const bangPlayer = (id) => S.players.find((p) => p.id === id);
const bangName = (id) => (bangPlayer(id) ? esc(bangPlayer(id).name) : '?');

// 체력 = 총알
function bangHearts(p) {
  const n = Math.max(p.max, p.life);
  return `<span class="bng-hp" aria-label="체력 ${p.life}/${p.max}">${Array.from({ length: n }, (_, i) => `<i class="${i < p.life ? '' : 'off'}"></i>`).join('')}<small>${p.life}/${p.max}</small></span>`;
}

function bangRoleBadge(role) {
  if (!role) return '<span class="bng-role r-x">❔ 정체 비밀</span>';
  const r = BD.ROLES[role];
  return `<span class="bng-role r-${role}">${r.icon} ${esc(r.name)}</span>`;
}

function bangEquipHtml(p) {
  return p.table.map((c) => {
    const d = BD.CARDS[c.key];
    return `<span class="bng-eq t-${d.type}" title="${esc(d.desc)}">${d.icon} ${esc(d.name)}${d.type === 'gun' ? ` <b>${d.range}</b>` : ''}</span>`;
  }).join('');
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
    case 'barrel': return `🛢️ <b>${who}</b>님이 배럴을 쓸지 고르는 중`;
    case 'store': return `🏪 잡화점: <b>${who}</b>님이 고르는 중`;
    case 'dying': return `💀 <b>${who}</b>님이 죽기 직전! 맥주로 버틸 수 있어요`;
    case 'drawChoice': return `<b>${who}</b>님이 카드 뽑는 방법을 고르는 중`;
    case 'kit': return `<b>${who}</b>님이 카드 1장을 덱 위로 돌려놓는 중`;
    default: return '';
  }
}

function bangSeatHtml(p, o) {
  const over = S.phase === 'over';
  const cls = ['bng-seat'];
  if (p.id === S.turnId) cls.push('turn');
  if (p.id === S.me) cls.push('me');
  if (!p.alive) cls.push('dead');
  if (S.pending && S.pending.who === p.id) cls.push('wait');
  if (o.targeting) cls.push(o.targetSet.has(p.id) ? 'target' : 'untarget');
  const ch = p.char ? BD.CHARS[p.char] : null;
  const inRange = p.dist != null && S.range != null && p.dist <= S.range;
  const tags = [bangRoleBadge(p.role), `<span class="bng-hand-n">🃏 ${p.handCount}장</span>`];
  if (p.dist != null) tags.push(`<span class="bng-dist ${inRange ? 'in' : ''}">${inRange ? '🎯 사정권' : '📏'} 거리 ${p.dist}</span>`);
  if (p.id === S.me && S.range != null) tags.push(`<span class="bng-dist mine">🎯 내 사거리 ${S.range}</span>`);
  const equip = bangEquipHtml(p);
  let flag = '';
  if (p.id === S.turnId && !over) flag = '<em class="bs-flag">차례</em>';
  else if (S.pending && S.pending.who === p.id) flag = '<em class="bs-flag hot">대응 중</em>';
  const body = `<span class="bs-head"><span class="bs-av">${ch ? esc([...ch.name][0]) : '?'}</span>`
    + `<span class="bs-who"><b><span class="dot ${p.connected ? '' : 'off'}"></span>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b><small>${ch ? esc(ch.name) : ''}</small></span>${flag}</span>`
    + `${p.alive ? bangHearts(p) : ''}<span class="bs-tags">${tags.join('')}</span>`
    + `${equip ? `<span class="bs-eq">${equip}</span>` : ''}`
    + `${!p.alive ? '<span class="bs-stamp">탈락</span>' : ''}`
    + `${o.targeting && o.targetSet.has(p.id) ? '<span class="bs-aim" aria-hidden="true"></span>' : ''}`;
  const hit = bangAnimStyle(BANG_ANIM.hitAt[p.id]);
  if (hit) cls.push('hit');
  const st = hit ? ` style="${hit}"` : '';
  return o.targeting && o.targetSet.has(p.id)
    ? `<button class="${cls.join(' ')}" data-act="bangTarget" data-id="${p.id}"${st}>${body}</button>`
    : `<div class="${cls.join(' ')}"${st}>${body}</div>`;
}

function renderBang() {
  bangTrackAnim();
  const me = bangPlayer(S.me);
  const isHost = S.hostId === S.me;
  const over = S.phase === 'over';
  const selCard = S.hand.find((c) => c.id === ui.bSel);
  const targeting = !!(selCard && selCard.targets && S.mode === 'main');
  const targetSet = new Set(targeting ? selCard.targets : []);

  // 나부터 시계 방향으로
  const idx = S.players.findIndex((p) => p.id === S.me);
  const ordered = idx < 0 ? S.players : [...S.players.slice(idx), ...S.players.slice(0, idx)];
  const seats = ordered.map((p) => bangSeatHtml(p, { targeting, targetSet })).join('');

  const turnP = bangPlayer(S.turnId);
  let status = '';
  if (over) {
    const label = { law: '⭐ 보안관 팀 승리!', outlaw: '💰 무법자 승리!', renegade: '🐍 배신자 승리!' }[S.winner];
    status = `<div class="bng-sign win"><b>${label}</b></div>`;
  } else if (S.pending) {
    status = `<div class="bng-sign alert"><span>${bangPendingText()}</span></div>`;
  } else if (S.turnId === S.me) {
    status = S.mode === 'discard'
      ? `<div class="bng-sign mine"><b>손패 ${S.needDiscard}장을 버리세요</b><small>손패는 체력 수까지만 들고 있을 수 있어요</small></div>`
      : `<div class="bng-sign mine"><b>내 차례예요!</b><small>카드를 내고, 다 했으면 턴 끝내기</small></div>`;
  } else {
    status = `<div class="bng-sign"><b>${turnP ? esc(turnP.name) : ''}님 차례</b></div>`;
  }

  const log = S.log.length
    ? `<div class="bng-log">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>`
    : '';

  const myTurn = S.turnId === S.me && !over;
  const board = `<div class="bng-board">
      <span class="bb-deck"><span class="bng-back"></span><small>덱 ${S.deckCount}장</small></span>
      <span class="bb-disc">${S.discardTop ? bangCardHtml(S.discardTop, { cls: 'mini' }) : '<span class="bng-card mini empty"></span>'}<small>버린 더미</small></span>
      <span class="bb-info">
        ${S.range != null ? `<span>🎯 내 사거리 <b>${S.range}</b></span>` : ''}
        ${myTurn && S.mode === 'main' ? `<span class="${S.bangUsed ? 'used' : ''}">🔫 뱅! ${S.bangUsed ? '이번 턴에 사용함' : '아직 안 씀'}</span>` : ''}
      </span>
    </div>`;

  return `<div class="bng-scr ${targeting ? 'aiming' : ''}">
  <div class="top"><span>${roomTag()}</span><span>🤠 뱅! · ${S.gameNo}번째 판</span></div>
  ${status}
  ${over ? bangOverPanel(isHost) : ''}
  <div class="bng-seats">${seats}</div>
  ${board}
  ${log}
  <div class="bng-dock">
    ${over || !(me && me.alive) ? '' : bangPanel(selCard, targeting)}
    ${over || !(me && me.alive) ? '' : bangHandHtml()}
    <div class="foot">
      <button data-act="bangInfo">🎭 내 정보</button>
      ${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}
    </div>
  </div>
  ${ui.bPick ? bangPickSheet() : ''}
  ${ui.bInfo ? bangInfoSheet(me) : ''}
  ${ui.hostOpen && isHost ? bangHostMenuHtml() : ''}
  </div>`;
}

// 상황별 조작 영역
function bangPanel(selCard, targeting) {
  const mode = S.mode;
  const pd = S.pending;
  const sidBtn = S.canSid
    ? `<button class="${ui.bSid ? 'primary' : 'ghost'}" data-act="bangSid">${ui.bSid ? `시드: 버릴 카드 ${ui.bSid.length}/2 고르는 중 (눌러서 취소)` : '시드: 카드 2장 버리고 체력 +1'}</button>`
    : '';
  const desc = selCard
    ? `<p class="bng-desc"><b>${BD.CARDS[selCard.key].icon} ${esc(BD.CARDS[selCard.key].name)}</b> ${esc(BD.CARDS[selCard.key].desc)}</p>`
    : '';

  if (mode === 'main') {
    let hint = '';
    let playBtn = '';
    if (selCard) {
      if (!selCard.ok) hint = '<p class="bng-hint">지금은 낼 수 없는 카드예요.</p>';
      else if (targeting) hint = '<p class="bng-hint aim">🎯 위에서 <b>과녁이 표시된 사람</b>을 눌러 대상을 고르세요.</p>';
      else playBtn = '<button class="primary" data-act="bangPlay">카드 내기</button>';
    }
    return `<div class="bng-panel">${desc}${hint}
      <div class="bng-row">${playBtn}<button class="bng-end" data-act="bangEnd" ${ui.bSid ? 'disabled' : ''}>턴 끝내기 ⏭</button></div>${sidBtn}</div>`;
  }
  if (mode === 'discard') {
    return `<div class="bng-panel"><p class="bng-hint">손패가 체력보다 많아요. 버릴 카드를 눌러 고르고 버리세요. (${S.needDiscard}장 더)</p>
      ${selCard ? `${desc}<button class="primary" data-act="bangDiscard">이 카드 버리기</button>` : ''}${sidBtn}</div>`;
  }
  if (mode === 'respond') {
    const need = pd.kind === 'bang' || pd.kind === 'gatling' ? '빗나감!' : '뱅!';
    return `<div class="bng-panel alert"><p class="bng-hint big">${bangPendingText()}</p>
      <p class="bng-hint">${need} 카드를 눌러 막거나, 포기하고 맞을 수 있어요.</p>
      ${selCard && selCard.ok ? `${desc}<button class="primary" data-act="bangRespond">이 카드로 막기</button>` : ''}
      <button class="no" data-act="bangGiveUp">포기 (체력 -1)</button></div>`;
  }
  if (mode === 'barrel') {
    const what = pd.kind === 'gatling' ? '개틀링' : '뱅!';
    return `<div class="bng-panel alert"><p class="bng-hint big">${bangName(pd.source)}님의 ${what}! 배럴을 쓸까요?</p>
      <p class="bng-hint">카드 1장을 뒤집어 ♥이면 막아요. 아니면 빗나감!으로 막을 수 있어요.${pd.barrels > 1 ? ' (배럴을 한 번 더 쓸 수 있어요)' : ''}</p>
      <button class="primary" data-act="bangBarrel" data-use="1">🛢️ 배럴 쓰기 (카드 뒤집기)</button>
      <button data-act="bangBarrel" data-use="0">쓰지 않기</button></div>`;
  }
  if (mode === 'dying') {
    return `<div class="bng-panel alert"><p class="bng-hint big">💀 죽기 직전이에요!</p>
      <p class="bng-hint">맥주를 눌러 마시면 살 수 있어요. 지금 체력 ${S.players.find((p) => p.id === S.me).life}</p>
      ${selCard && selCard.ok ? '<button class="primary" data-act="bangRespond">🍺 맥주 마시기</button>' : ''}${sidBtn}
      <button class="no" data-act="bangGiveUp">포기하고 탈락</button></div>`;
  }
  if (mode === 'store') {
    const cards = pd.cards.map((c) => bangCardHtml(c, { act: 'bangStoreCard', cls: c.id === ui.bStore ? 'sel okc' : 'okc' })).join('');
    return `<div class="bng-panel"><h2>🏪 잡화점</h2><p class="bng-hint">펼쳐진 카드 중 가져갈 1장을 고르세요.</p><div class="bng-hand bng-store">${cards}</div>
      ${ui.bStore ? '<button class="primary" data-act="bangStorePick">이 카드 가져가기</button>' : ''}</div>`;
  }
  if (mode === 'drawChoice') {
    const btns = ['<button class="primary" data-act="bangChoose" data-opt="deck">덱에서 2장 뽑기</button>'];
    if (pd.discardTop) btns.push(`<button data-act="bangChoose" data-opt="discard">버린 더미 맨 위(${esc(BD.CARDS[pd.discardTop.key].name)})를 첫 카드로</button>`);
    for (const id of pd.options || []) if (id !== 'discard') btns.push(`<button data-act="bangChoose" data-opt="${id}">${bangName(id)}님의 손패에서 1장 뽑기</button>`);
    return `<div class="bng-panel"><h2>🃏 카드 뽑기</h2><p class="bng-hint">캐릭터 능력으로 뽑는 방법을 고를 수 있어요.</p>${btns.join('')}</div>`;
  }
  if (mode === 'kit') {
    return `<div class="bng-panel"><h2>키트 칼슨</h2><p class="bng-hint">방금 받은 3장 중 <b>덱 위로 돌려놓을 1장</b>을 고르세요. (빛나는 카드)</p>
      ${selCard && selCard.ok ? `${desc}<button class="primary" data-act="bangKit">이 카드를 덱 위로</button>` : ''}</div>`;
  }
  return '';
}

function bangOverPanel(isHost) {
  const rows = S.players.map((p) => {
    const r = p.role ? BD.ROLES[p.role] : null;
    const won = r && (S.winner === r.team);
    return `<div class="bo-row ${won ? 'won' : ''} ${p.alive ? '' : 'dead'}"><span class="bo-nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span>${bangRoleBadge(p.role)}<small>${p.char ? esc(BD.CHARS[p.char].name) : ''}${p.alive ? '' : ' · 탈락'}</small>${won ? '<em>승리</em>' : ''}</div>`;
  }).join('');
  return `<div class="bng-over"><h2>📜 결과</h2>${rows}
    ${isHost
      ? `<button class="primary" data-act="restart">같은 멤버로 바로 다시 하기</button>
         <button data-act="again">대기실로 돌아가기</button>`
      : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
  </div>`;
}

function bangHandHtml() {
  if (!S.hand.length) return '<p class="bng-hint">손패가 없어요.</p>';
  const selSid = ui.bSid || [];
  const interactive = S.mode === 'main' || S.mode === 'discard' || S.mode === 'respond' || S.mode === 'dying' || S.mode === 'kit';
  const cards = S.hand.map((c) => {
    const cls = [];
    if (ui.bSid) cls.push(selSid.includes(c.id) ? 'sel' : 'okc');
    else {
      cls.push(c.ok ? 'okc' : (interactive ? 'noc' : ''));
      if (c.id === ui.bSel) cls.push('sel');
    }
    const deal = bangAnimStyle(BANG_ANIM.handAt[c.id]);
    if (deal) cls.push('deal');
    return bangCardHtml(c, { act: 'bangCard', cls: cls.join(' '), style: deal });
  }).join('');
  return `<div class="bng-hand mine"><span class="bng-hand-lbl">내 손패 ${S.hand.length}장</span>${cards}</div>`;
}

// 패닉!/캣 발루: 손패(무작위) 또는 앞에 놓인 카드 중 고르기
function bangPickSheet() {
  const t = bangPlayer(ui.bPick.target);
  const sel = S.hand.find((c) => c.id === ui.bSel);
  const verb = sel && sel.key === 'panic' ? '가져올' : '버리게 할';
  const handBtn = t.handCount > 0 ? `<button data-act="bangPick" data-pick="hand">🃏 손패 ${t.handCount}장 중 무작위 1장</button>` : '';
  const eq = t.table.map((c) => `<button data-act="bangPick" data-pick="${c.id}">${BD.CARDS[c.key].icon} ${esc(BD.CARDS[c.key].name)} (앞에 놓인 카드)</button>`).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet bng-sheet"><h2>${esc(t.name)}님의 어떤 카드를 ${verb}까요?</h2>${handBtn}${eq}<button class="ghost" data-act="closeall">취소</button></div></div>`;
}

function bangInfoSheet(me) {
  const role = me && me.role ? BD.ROLES[me.role] : null;
  const ch = me && me.char ? BD.CHARS[me.char] : null;
  const others = S.players.filter((p) => p.char && p.id !== S.me).map((p) => `<div class="bi-row"><b>${esc(p.name)}</b><span><i>${esc(BD.CHARS[p.char].name)}</i> ${esc(BD.CHARS[p.char].desc)}</span></div>`).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet bng-sheet">
    ${role ? `<div class="bng-wanted r-${me.role}"><div class="bw-top">내 역할</div><div class="bw-ic">${role.icon}</div><div class="bw-rn">${esc(role.name)}</div><p>${esc(role.goal)}</p></div>` : ''}
    ${ch ? `<div class="bng-char"><span class="bs-av big">${esc([...ch.name][0])}</span><div><b>${esc(ch.name)}</b> <small>체력 ${me.max}</small><p>${esc(ch.desc)}</p></div></div>` : ''}
    <h2>다른 사람의 캐릭터</h2>${others}
    <button data-act="closeall">닫기</button></div></div>`;
}

function bangHostMenuHtml() {
  const playing = S.phase === 'play';
  return `<div class="overlay" data-act="closeall"><div class="sheet bng-sheet">
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
    case 'bangBarrel': send({ t: 'barrel', use: el.dataset.use === '1' }); return true;
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
