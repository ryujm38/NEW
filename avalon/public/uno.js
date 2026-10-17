'use strict';
// 우노 화면. app.js보다 먼저 불러오며, S / ui / send / esc / showToast / render 같은 app.js의 전역을 그대로 쓴다.
// (여기 함수들은 render() 시점에 호출되므로 app.js가 다 올라온 뒤에 실행된다.)

const UNO_COLOR_NAME = { r: '빨강', y: '노랑', g: '초록', b: '파랑', w: '와일드' };
const UNO_FACE = { skip: '⊘', rev: '⇄', d2: '+2', wild: '★', d4: '+4' };
const unoFace = (kind) => UNO_FACE[kind] || kind;

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

function unoCardHtml(card, o = {}) {
  const cls = ['uc', `c-${card.color}`, `k-${card.kind.length > 1 ? card.kind : 'n'}`];
  if (o.cls) cls.push(o.cls);
  const face = esc(unoFace(card.kind));
  if (o.tag === 'button') {
    return `<button class="${cls.join(' ')}" data-act="unoCard" data-id="${card.id}" aria-label="${esc(UNO_COLOR_NAME[card.color])} ${face}"><span>${face}</span></button>`;
  }
  return `<div class="${cls.join(' ')}"><span>${face}</span></div>`;
}

function unoMyTurn() {
  return S.phase === 'play' && S.turnId === S.me;
}

function renderUno() {
  const isHost = S.hostId === S.me;
  const myTurn = unoMyTurn();
  const me = S.players.find((p) => p.id === S.me);
  const over = S.phase === 'over';
  const turnName = S.players.find((p) => p.id === S.turnId);
  const w = S.unoWindow;

  const chips = S.players.map((p) => {
    const cls = ['up'];
    if (p.id === S.turnId) cls.push('turn');
    if (p.id === S.me) cls.push('me');
    if (p.count === 1) cls.push('last');
    return `<div class="${cls.join(' ')}">
      <span class="dot ${p.connected ? '' : 'off'}"></span>
      <span class="un">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span>
      <span class="ucount">🃏 ${p.count}${p.wins ? ` · 🏆${p.wins}` : ''}</span>
    </div>`;
  }).join('');

  let status;
  if (over) {
    const winner = S.players.find((p) => p.id === S.winnerId);
    status = `<p class="big gold">🎉 ${esc(winner ? winner.name : '?')}님 승리!</p>`;
  } else if (myTurn) {
    status = S.drewId !== null
      ? '<p class="big gold">뽑은 카드를 내거나 넘기세요</p>'
      : '<p class="big gold">내 차례예요!</p>';
  } else {
    status = `<p class="big dim">${esc(turnName ? turnName.name : '')}님 차례</p>`;
  }

  const center = `
    <div class="ucenter">
      <button class="pile" data-act="unoDraw" ${myTurn && S.drewId === null ? '' : 'disabled'} aria-label="카드 뽑기">
        <div class="uc back"><span>UNO</span></div>
        <small>뽑기 · ${S.drawCount}장</small>
      </button>
      <div class="topcard">
        ${S.top ? unoCardHtml(S.top, { cls: 'big' }) : ''}
        <small class="colorchip c-${S.color}">지금 색: ${esc(UNO_COLOR_NAME[S.color] || '')}</small>
      </div>
      <div class="dirinfo">${S.dir === 1 ? '⬇' : '⬆'}<small>진행 방향</small></div>
    </div>`;

  const log = S.log.length
    ? `<div class="ulog">${S.log.slice().reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>`
    : '';

  let actions = '';
  if (!over) {
    const btns = [];
    if (myTurn && S.drewId !== null) btns.push('<button data-act="unoPass">넘기기</button>');
    if (w && !w.called && w.id === S.me) btns.push('<button class="primary pulse" data-act="unoCall">우노!</button>');
    else if (me && me.count === 2 && !S.myUnoReady) btns.push('<button class="ghost" data-act="unoCall">우노 미리 외치기</button>');
    if (w && !w.called && w.id !== S.me) {
      const t = S.players.find((p) => p.id === w.id);
      btns.push(`<button class="no pulse" data-act="unoCatch">${esc(t ? t.name : '')}님 우노 안 외쳤다! 고발</button>`);
    }
    actions = btns.length ? `<div class="row uactions">${btns.join('')}</div>` : '';
    if (S.myUnoReady) actions += '<p class="dim small center">우노를 미리 외쳐 뒀어요. 한 장 남기면 바로 인정돼요.</p>';
  }

  const sel = ui.unoSel;
  const handHtml = S.hand.map((c) => unoCardHtml(c, {
    tag: 'button',
    cls: [c.playable ? 'ok' : (myTurn ? 'no' : 'wait'), c.id === sel ? 'sel' : ''].join(' '),
  })).join('');
  const selCard = S.hand.find((c) => c.id === sel);
  const playBtn = selCard && selCard.playable
    ? `<button class="primary" data-act="unoPlay">${selCard.color === 'w' ? '이 카드 내기 (색 고르기)' : '이 카드 내기'}</button>`
    : '';

  let overPanel = '';
  if (over) {
    const rank = S.players.slice().sort((a, b) => b.wins - a.wins);
    overPanel = `<div class="card panel">
      <h2>승수</h2>
      ${rank.map((p) => `<div class="slot"><span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><span>🏆 ${p.wins}</span><span class="dim small">남은 카드 ${p.count}장</span></div>`).join('')}
      ${isHost
        ? `<button class="primary" data-act="restart" style="margin-top:10px">한 판 더 (승수 유지)</button>
           <button data-act="again" style="margin-top:8px">대기실로 돌아가기 (승수 초기화)</button>`
        : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}
    </div>`;
  }

  return `
  <div class="top"><span>방 <b>${esc(S.code)}</b></span><span>우노 · ${S.gameNo}번째 판</span></div>
  <div class="uplayers">${chips}</div>
  ${center}
  ${status}
  ${log}
  ${overPanel}
  ${actions}
  <div class="uhand ${over ? 'dimmed' : ''}">${handHtml}</div>
  ${playBtn}
  <div class="foot">${isHost ? '<button data-act="hostmenu">⚙ 방장</button>' : ''}</div>
  ${ui.colorOpen ? unoColorSheetHtml() : ''}
  ${ui.hostOpen && isHost ? unoHostMenuHtml() : ''}`;
}

function unoColorSheetHtml() {
  return `<div class="overlay" data-act="closeall"><div class="sheet">
    <h2>이을 색을 고르세요</h2>
    <div class="colorpick">
      ${['r', 'y', 'g', 'b'].map((c) => `<button class="cp c-${c}" data-act="unoColor" data-color="${c}">${UNO_COLOR_NAME[c]}</button>`).join('')}
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

// 카드 탭: 첫 번째 탭은 고르기(위로 올라옴), 같은 카드를 다시 탭하거나 "이 카드 내기"를 누르면 냄
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
