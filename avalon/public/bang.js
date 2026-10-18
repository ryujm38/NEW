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
const BANG_TYPE_LABEL = { brown: '갈색 · 한 번 쓰고 버림', blue: '파랑 · 앞에 놓는 장비', gun: '파랑 · 무기' };
// 역할별 작전 (내 정보 시트에서만 보여 준다. 멀리서 보이는 곳에는 내 역할을 띄우지 않는다)
const BANG_ROLE_PLAN = {
  sheriff: '모두가 내 정체를 알아요. 누가 나를 공격하는지 보고 무법자를 추리해서 쏘세요. 부보안관을 쓰러뜨리면 내 카드를 모두 버려야 해요.',
  deputy: '정체를 숨긴 채 보안관을 지키세요. 보안관을 공격하는 사람이 무법자일 가능성이 높아요.',
  outlaw: '보안관을 쓰러뜨리면 무법자 팀이 이겨요. 다른 무법자가 누군지는 몰라요. 무법자를 쓰러뜨린 사람은 카드 3장을 받아요.',
  renegade: '처음엔 보안관 편인 척 무법자를 줄이고, 마지막에 보안관과 1:1로 남아 이기세요. 보안관이 먼저 쓰러지면 무법자가 이겨요.',
};

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

// 카드 한 장: 왼쪽 위 숫자·무늬, 가운데 그림, 아래 이름 띠. 테두리 색이 종류(갈색=즉시 / 파랑=장비)
function bangCardHtml(c, o = {}) {
  const def = BD.CARDS[c.key];
  const cls = ['bng-card', `t-${def.type}`];
  if (o.cls) cls.push(o.cls);
  if ([...def.name].length >= 5) cls.push('long');
  const tag = c.asBang ? '<em class="bk-tag">뱅!으로</em>' : '';
  const inner = `<span class="bk-rk ${bangRed(c.suit) ? 'red' : ''}"><b>${bangRank(c.rank)}</b><i>${BD.SUITS[c.suit]}</i></span>${tag}`
    + `<span class="bk-art"><span class="bk-ic">${def.icon}</span>${def.type === 'gun' ? `<em class="bk-rng">${def.range}</em>` : ''}</span>`
    + `<span class="bk-nm">${esc(def.name)}</span>`;
  const label = `${def.name} ${BD.SUITS[c.suit]}${bangRank(c.rank)}${c.asBang ? ' (뱅!으로 쓰기)' : ''}`;
  const st = o.style ? ` style="${o.style}"` : '';
  if (o.act) return `<button class="${cls.join(' ')}" data-act="${o.act}" data-id="${c.id}"${st} aria-label="${esc(label)}">${inner}</button>`;
  return `<span class="${cls.join(' ')}" role="img" aria-label="${esc(label)}">${inner}</span>`;
}

const bangPlayer = (id) => S.players.find((p) => p.id === id);
const bangName = (id) => (bangPlayer(id) ? esc(bangPlayer(id).name) : '?');
// 문장 속 이름: 나면 "나", 아니면 "OO님"
const bangWho = (id) => (id === S.me ? '나' : `${bangName(id)}님`);

// 체력 = 총알
function bangHearts(p, big) {
  const n = Math.max(p.max, p.life);
  const low = p.life <= 1 ? ' low' : '';
  return `<span class="bng-hp${big ? ' big' : ''}${low}" aria-label="체력 ${p.life}/${p.max}">${Array.from({ length: n }, (_, i) => `<i class="${i < p.life ? '' : 'off'}"></i>`).join('')}<small>${p.life}/${p.max}</small></span>`;
}

function bangRoleBadge(role) {
  if (!role) return '<span class="bng-role r-x">❔ 정체 비밀</span>';
  const r = BD.ROLES[role];
  return `<span class="bng-role r-${role}">${r.icon} ${esc(r.name)}</span>`;
}

// 장비: 남의 자리는 좁아서 짧은 이름(2개 넘으면 아이콘만), 내 칸에는 이름까지
const BANG_EQ_SHORT = { barrel: '배럴', mustang: '머스탱', scope: '스코프', jail: '감옥', dynamite: '폭탄' };
function bangEquipHtml(p, full) {
  const brief = !full && p.table.length <= 2;
  return p.table.map((c) => {
    const d = BD.CARDS[c.key];
    const danger = c.key === 'jail' || c.key === 'dynamite' ? ' danger' : '';
    const txt = full ? ` ${esc(d.name)}` : brief && BANG_EQ_SHORT[c.key] ? `<small>${BANG_EQ_SHORT[c.key]}</small>` : '';
    return `<span class="bng-eq t-${d.type}${danger}" title="${esc(d.name)}: ${esc(d.desc)}" aria-label="${esc(d.name)}">${d.icon}${txt}${d.type === 'gun' ? `<b>${d.range}</b>` : ''}</span>`;
  }).join('');
}

// 지금 누가 누구에게 무엇을 했고, 누가 대응해야 하는지: { head, sub }
function bangPendingInfo() {
  const pd = S.pending;
  if (!pd) return null;
  const who = bangWho(pd.who);
  const mine = pd.who === S.me;
  const src = pd.source ? bangWho(pd.source) : '';
  switch (pd.t) {
    case 'respond':
      if (pd.kind === 'bang') return { head: `🔫 ${src} → ${who}에게 뱅!`, sub: `${mine ? '내가' : `${who}이`} 빗나감!${pd.need > 1 ? ` ${pd.need}장` : ''}으로 막을 차례예요` };
      if (pd.kind === 'gatling') return { head: `🌀 ${src}의 개틀링!`, sub: `${mine ? '내가' : `${who}이`} 빗나감!으로 막을 차례예요` };
      if (pd.kind === 'indians') return { head: `🏹 ${src}의 인디언!`, sub: `${mine ? '내가' : `${who}이`} 뱅!을 버려야 해요 (못 버리면 체력 -1)` };
      return { head: `⚔️ 결투: ${who} vs ${bangWho(pd.other)}`, sub: `${mine ? '내가' : `${who}이`} 뱅!을 낼 차례예요 (못 내면 체력 -1)` };
    case 'barrel': return { head: `🛢️ ${src} → ${who}에게 ${pd.kind === 'gatling' ? '개틀링' : '뱅!'}`, sub: `${mine ? '내가' : `${who}이`} 배럴을 쓸지 고르는 중이에요` };
    case 'store': return { head: '🏪 잡화점', sub: `${mine ? '내가' : `${who}이`} 펼쳐진 카드 중 1장을 고를 차례예요` };
    case 'dying': return { head: `💀 ${who} 체력 0!`, sub: `${mine ? '내가' : `${who}이`} 맥주로 버틸지 고르는 중이에요` };
    case 'drawChoice': return { head: `🃏 ${who} 카드 뽑는 중`, sub: '캐릭터 능력으로 뽑는 방법을 고르고 있어요' };
    case 'kit': return { head: `🃏 ${who} 카드 뽑는 중`, sub: '키트 칼슨: 3장 중 1장을 덱 위로 돌려놓고 있어요' };
    default: return null;
  }
}
function bangPendingText() {
  const i = bangPendingInfo();
  return i ? `${i.head} · ${i.sub}` : '';
}
// 공격한 사람(대응 기다리는 쪽의 상대)
function bangPendingSrc() {
  const pd = S.pending;
  if (!pd || (pd.t !== 'respond' && pd.t !== 'barrel')) return null;
  return pd.kind === 'duel' ? pd.other : pd.source;
}

// 둘러앉은 자리: 나는 아래(내 칸), 내 다음 사람부터 시계 방향으로 왼쪽 → 위 → 오른쪽. [줄, 칸]
const BANG_RING = {
  3: { seats: [[2, 1], [1, 2], [2, 3]], table: [2, 2, 1] },
  4: { seats: [[2, 1], [1, 1], [1, 3], [2, 3]], table: [1, 2, 2] },
  5: { seats: [[2, 1], [1, 1], [1, 2], [1, 3], [2, 3]], table: [2, 2, 1] },
  6: { seats: [[3, 1], [2, 1], [1, 1], [1, 3], [2, 3], [3, 3]], table: [1, 2, 3] },
};

function bangSeatHtml(p, o) {
  const over = S.phase === 'over';
  const cls = ['bng-seat'];
  if (p.id === S.turnId) cls.push('turn');
  if (!p.alive) cls.push('dead');
  if (S.pending && S.pending.who === p.id) cls.push('wait');
  if (o.srcId === p.id) cls.push('src');
  const aim = o.targeting && o.targetSet.has(p.id);
  if (o.targeting) cls.push(aim ? 'target' : 'untarget');
  const ch = p.char ? BD.CHARS[p.char] : null;
  const inRange = p.dist != null && S.range != null && p.dist <= S.range;
  let flag = '';
  if (S.pending && S.pending.who === p.id) flag = '<em class="bs-flag hot">대응 중</em>';
  else if (o.srcId === p.id) flag = `<em class="bs-flag src">${S.pending.kind === 'duel' ? '⚔️ 결투' : '🔫 공격'}</em>`;
  else if (p.id === S.turnId && !over) flag = '<em class="bs-flag">차례</em>';
  const sheriff = p.role === 'sheriff' ? '<span class="bs-star" title="보안관">⭐</span>' : '';
  let mid;
  if (!p.alive) {
    mid = `<span class="bs-dead">💀 탈락</span>${bangRoleBadge(p.role)}`;
  } else {
    const dist = p.dist == null ? '' : `<span class="bs-dist ${inRange ? 'in' : ''}">${inRange ? '🎯 ' : ''}거리 ${p.dist}</span>`;
    mid = `${bangHearts(p)}<span class="bs-meta"><span class="bs-hand" aria-label="손패 ${p.handCount}장">🃏${p.handCount}</span>${dist}</span>`;
  }
  const equip = p.alive ? bangEquipHtml(p, false) : '';
  const body = `${flag}<span class="bs-name"><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}</b>${sheriff}</span>`
    + `<span class="bs-char">${ch ? esc(ch.name) : ''}</span>${mid}`
    + `${equip ? `<span class="bs-eq">${equip}</span>` : ''}`
    + `${aim ? '<span class="bs-aim" aria-hidden="true"></span>' : ''}`;
  const hit = bangAnimStyle(BANG_ANIM.hitAt[p.id]);
  if (hit) cls.push('hit');
  const st = `grid-row:${o.pos[0]};grid-column:${o.pos[1]};${hit || ''}`;
  return aim
    ? `<button class="${cls.join(' ')}" data-act="bangTarget" data-id="${p.id}" style="${st}" aria-label="${esc(p.name)}님에게 쓰기">${body}</button>`
    : `<div class="${cls.join(' ')}" style="${st}">${body}</div>`;
}

// 가운데 탁자: 덱, 버린 더미, 지금 차례인 사람의 뱅! 사용 여부
function bangTableHtml(pos) {
  const over = S.phase === 'over';
  const turnP = bangPlayer(S.turnId);
  const used = S.bangUsed;
  const bangLine = !over && turnP
    ? `<span class="bt-bang ${used ? 'used' : ''}" title="${esc(turnP.name)}님의 이번 턴">🔫 뱅! ${used ? '사용함' : '가능'}</span>`
    : '';
  return `<div class="bng-table" style="grid-row:${pos[0]} / span ${pos[2]};grid-column:${pos[1]}">
    <span class="bt-piles">
      <span class="bt-pile"><span class="bng-back"></span><small>덱 ${S.deckCount}</small></span>
      <span class="bt-pile">${S.discardTop ? bangCardHtml(S.discardTop, { cls: 'mini' }) : '<span class="bng-card mini empty"></span>'}<small>버린 카드</small></span>
    </span>
    ${bangLine}
  </div>`;
}

function bangRingHtml(o) {
  const idx = S.players.findIndex((p) => p.id === S.me);
  const others = idx < 0 ? S.players : [...S.players.slice(idx + 1), ...S.players.slice(0, idx)];
  const map = BANG_RING[others.length];
  if (!map) {
    // 혹시 모를 인원(관전 등): 단순 격자
    return `<div class="bng-ring">${others.map((p, i) => bangSeatHtml(p, { ...o, pos: [Math.floor(i / 3) + 1, (i % 3) + 1] })).join('')}</div>`;
  }
  const seats = others.map((p, i) => bangSeatHtml(p, { ...o, pos: map.seats[i] })).join('');
  return `<div class="bng-ring">${seats}${bangTableHtml(map.table)}</div>`;
}

// 내 칸: 체력, 손패 수, 사거리, 이번 턴 뱅!, 장비. 내 비밀 역할은 여기 띄우지 않는다(보안관만 공개)
function bangMeHtml(me, srcId) {
  if (!me) return '';
  const over = S.phase === 'over';
  const ch = me.char ? BD.CHARS[me.char] : null;
  const cls = ['bng-me'];
  if (me.id === S.turnId && !over) cls.push('turn');
  if (S.pending && S.pending.who === me.id) cls.push('wait');
  if (srcId === me.id) cls.push('src');
  if (!me.alive) cls.push('dead');
  const hit = bangAnimStyle(BANG_ANIM.hitAt[me.id]);
  if (hit) cls.push('hit');
  const myTurn = me.id === S.turnId && !over && me.alive;
  const chips = [];
  if (me.alive) {
    chips.push(`<span class="bm-chip">🃏 손패 ${me.handCount}</span>`);
    if (S.range != null) chips.push(`<span class="bm-chip">🎯 내 사거리 <b>${S.range}</b></span>`);
    if (myTurn) {
      const free = me.char === 'willy' || me.table.some((c) => c.key === 'volcanic');
      chips.push(free ? '<span class="bm-chip">🔫 뱅! 무제한</span>'
        : `<span class="bm-chip ${S.bangUsed ? 'used' : 'ready'}">🔫 뱅! ${S.bangUsed ? '이번 턴에 씀' : '1번 쓸 수 있음'}</span>`);
    }
  }
  const equip = me.alive ? bangEquipHtml(me, true) : '';
  const flag = S.pending && S.pending.who === me.id ? '<em class="bs-flag hot">내가 대응할 차례</em>'
    : srcId === me.id ? '<em class="bs-flag src">🔫 내가 공격</em>'
      : myTurn ? '<em class="bs-flag">내 차례</em>' : '';
  return `<div class="${cls.join(' ')}"${hit ? ` style="${hit}"` : ''}>
    ${flag}
    <div class="bm-head"><span class="bs-av">${ch ? esc([...ch.name][0]) : '?'}</span>
      <span class="bm-who"><b>나${me.role === 'sheriff' ? ' <span class="bs-star">⭐</span>' : ''}</b><small>${ch ? esc(ch.name) : ''}</small></span>
      ${me.alive ? bangHearts(me, true) : '<span class="bs-dead">💀 탈락 · 구경 중</span>'}</div>
    ${chips.length ? `<div class="bm-chips">${chips.join('')}</div>` : ''}
    ${equip ? `<div class="bm-eq">${equip}</div>` : ''}
  </div>`;
}

function renderBang() {
  bangTrackAnim();
  const me = bangPlayer(S.me);
  const isHost = S.hostId === S.me;
  const over = S.phase === 'over';
  const selCard = S.hand.find((c) => c.id === ui.bSel);
  const targeting = !!(selCard && selCard.targets && S.mode === 'main');
  const targetSet = new Set(targeting ? selCard.targets : []);
  const srcId = bangPendingSrc();

  const turnP = bangPlayer(S.turnId);
  let status = '';
  if (over) {
    const label = { law: '⭐ 보안관 팀 승리!', outlaw: '💰 무법자 승리!', renegade: '🐍 배신자 승리!' }[S.winner];
    status = `<div class="bng-sign win"><b>${label}</b><small>모든 사람의 정체가 공개됐어요</small></div>`;
  } else if (S.pending) {
    const info = bangPendingInfo();
    const mine = S.pending.who === S.me;
    status = `<div class="bng-sign alert ${mine ? 'mine' : ''}"><b>${info ? info.head : ''}</b><small>${info ? info.sub : ''}</small></div>`;
  } else if (S.turnId === S.me) {
    status = S.mode === 'discard'
      ? `<div class="bng-sign mine"><b>손패 ${S.needDiscard}장을 버리세요</b><small>손패는 체력 수까지만 들고 턴을 끝낼 수 있어요</small></div>`
      : '<div class="bng-sign mine"><b>내 차례예요!</b><small>빛나는 카드를 내고, 다 했으면 턴 끝내기</small></div>';
  } else {
    status = `<div class="bng-sign"><b>${turnP ? esc(turnP.name) : ''}님 차례</b><small>${turnP && turnP.dist != null ? `나와 거리 ${turnP.dist}` : '카드를 내는 중이에요'}</small></div>`;
  }

  const log = S.log.length
    ? `<div class="bng-log" aria-live="polite">${S.log.slice(-2).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>`
    : '';

  const alive = !!(me && me.alive);
  // 잡화점·뽑기 선택은 조작 영역이 주인공이라 손패보다 위에, 나머지는 손패 아래(엄지 닿는 곳)에 붙여 둔다
  const panelFirst = S.mode === 'store' || S.mode === 'drawChoice';
  const panel = over || !alive ? '' : bangPanel(selCard, targeting);
  return `<div class="bng-scr ${targeting ? 'aiming' : ''}">
  <div class="top"><span>${roomTag()}</span><span>🤠 뱅! · ${S.gameNo}번째 판</span></div>
  ${status}
  ${over ? bangOverPanel(isHost) : ''}
  ${bangRingHtml({ targeting, targetSet, srcId })}
  ${log}
  <div class="bng-dock">
    ${over ? '' : bangMeHtml(me, srcId)}
    ${over || !alive ? '' : (panelFirst ? panel + bangHandHtml() : bangHandHtml() + panel)}
    <div class="foot">
      <button data-act="bangInfo">🎭 내 정보 · 캐릭터</button>
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
    ? `<p class="bng-desc"><b>${BD.CARDS[selCard.key].icon} ${esc(BD.CARDS[selCard.key].name)}</b>${selCard.asBang ? '<em>뱅!으로 쓰기</em>' : ''} ${esc(BD.CARDS[selCard.key].desc)}</p>`
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
    return `<div class="bng-panel"><p class="bng-hint">위 손패에서 버릴 카드를 눌러 고르세요. (<b>${S.needDiscard}장</b> 더)</p>
      ${selCard ? `${desc}<button class="primary" data-act="bangDiscard">이 카드 버리기</button>` : ''}${sidBtn}</div>`;
  }
  if (mode === 'respond') {
    const need = pd.kind === 'bang' || pd.kind === 'gatling' ? '빗나감!' : '뱅!';
    const ready = selCard && selCard.ok;
    return `<div class="bng-panel alert">${ready ? '' : `<p class="bng-hint">위 손패에서 빛나는 <b>${need}</b> 카드를 눌러 골라요${pd.need > 1 ? ` (${pd.need}장 필요)` : ''}</p>`}
      <div class="bng-row">${ready ? `<button class="primary" data-act="bangRespond">${BD.CARDS[selCard.key].icon} ${esc(BD.CARDS[selCard.key].name)}으로 막기</button>` : ''}<button class="no" data-act="bangGiveUp">포기 (체력 -1)</button></div></div>`;
  }
  if (mode === 'barrel') {
    return `<div class="bng-panel alert"><p class="bng-hint"><b>🛢️ 배럴</b>: 카드 1장을 뒤집어 ♥이면 막아요. 실패해도 빗나감!으로 또 막을 수 있어요.${pd.barrels > 1 ? ' (배럴을 한 번 더 쓸 수 있어요)' : ''}</p>
      <div class="bng-row"><button class="primary" data-act="bangBarrel" data-use="1">🛢️ 배럴 쓰기</button>
      <button data-act="bangBarrel" data-use="0">쓰지 않기</button></div></div>`;
  }
  if (mode === 'dying') {
    const ready = selCard && selCard.ok;
    return `<div class="bng-panel alert"><p class="bng-hint"><b>💀 체력 ${S.players.find((p) => p.id === S.me).life}!</b> 위 손패의 맥주를 골라 마시면 살 수 있어요.</p>
      <div class="bng-row">${ready ? '<button class="primary" data-act="bangRespond">🍺 맥주 마시기</button>' : ''}<button class="no" data-act="bangGiveUp">포기하고 탈락</button></div>${sidBtn}</div>`;
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
    return `<div class="bng-panel"><h2>키트 칼슨</h2><p class="bng-hint">방금 받은 3장 중 <b>덱 위로 돌려놓을 1장</b>을 위 손패에서 고르세요. (빛나는 카드)</p>
      ${selCard && selCard.ok ? `${desc}<button class="primary" data-act="bangKit">이 카드를 덱 위로</button>` : ''}</div>`;
  }
  if (S.pending) {
    const info = bangPendingInfo();
    return `<div class="bng-panel quiet"><p class="bng-hint">⏳ ${info ? info.sub : '다른 사람이 고르는 중이에요'}</p></div>`;
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
  const okN = S.hand.filter((c) => c.ok).length;
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
  const lbl = interactive && S.mode !== 'discard' ? ` · <span class="ok">${S.mode === 'main' ? '낼 수 있는' : '쓸 수 있는'} 카드 ${okN}장</span>` : '';
  return `<div class="bng-hand mine"><span class="bng-hand-lbl">내 손패 <b>${S.hand.length}</b>장${lbl}</span>${cards}</div>`;
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
  const others = S.players.filter((p) => p.char && p.id !== S.me).map((p) => {
    const eq = p.table.map((c) => `${BD.CARDS[c.key].icon} ${esc(BD.CARDS[c.key].name)}`).join(', ');
    return `<div class="bi-row"><b>${esc(p.name)}${p.role === 'sheriff' ? ' ⭐' : ''}${p.alive ? '' : ' · 탈락'}</b><span><i>${esc(BD.CHARS[p.char].name)}</i> ${esc(BD.CHARS[p.char].desc)}</span>${eq ? `<span class="bi-eq">앞에 놓인 카드: ${eq}</span>` : ''}</div>`;
  }).join('');
  return `<div class="overlay" data-act="closeall"><div class="sheet bng-sheet">
    <p class="dim small">🤫 내 역할은 나만 볼 수 있어요. 다른 사람이 화면을 보지 않게 조심하세요.</p>
    ${role ? `<div class="bng-wanted r-${me.role}"><div class="bw-top">내 역할</div><div class="bw-ic">${role.icon}</div><div class="bw-rn">${esc(role.name)}</div><p>${esc(role.goal)}</p>${BANG_ROLE_PLAN[me.role] ? `<p class="bw-plan">💡 ${esc(BANG_ROLE_PLAN[me.role])}</p>` : ''}</div>` : ''}
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
