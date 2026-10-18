'use strict';
// 스플렌더 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const COLORS = ['w', 'u', 'g', 'r', 'k'];
  const CNAME = { w: '흰색', u: '파랑', g: '초록', r: '빨강', k: '검정', y: '금' };
  const RULES = `
<details><summary>스플렌더 규칙 간단 설명</summary>
<p><b>2~4명</b> · 보석으로 카드를 사서 점수를 모아요. 카드는 영구 할인(보너스)이 되어 점점 더 비싼 카드를 살 수 있어요.</p>
<ul>
<li>내 차례에 <b>하나만</b> 해요: ① 서로 다른 색 보석 3개 가져오기 ② 같은 색 2개 가져오기(그 색이 4개 이상 남았을 때) ③ 카드 1장 예약하기(금 보석 1개 받음, 최대 3장) ④ 카드 구매하기.</li>
<li>보석은 <b>10개</b>를 넘으면 버려서 10개로 맞춰요. 금 보석은 아무 색 대신 쓸 수 있어요.</li>
<li>카드의 색 <b>보너스</b>는 그 색 보석 1개 할인이에요. 점수가 적힌 카드는 점수가 돼요.</li>
<li>턴 끝에 보너스가 조건에 맞으면 <b>귀족</b>이 찾아와 3점을 줘요.</li>
<li><b>15점</b>이 되면 그 라운드까지 모두 같은 횟수로 하고 끝나요. 점수가 가장 높은 사람이 승리, 동점이면 산 카드가 적은 사람이 이겨요.</li>
</ul></details>`;

  const st = () => (ui.sp = ui.sp || { gems: [], sel: null, giveBack: {} });
  const me = () => S.players.find((p) => p.id === S.me);
  const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? esc(p.name) : '?'; };

  const gem = (c, n, cls = '') => `<span class="sg c-${c} ${cls}">${n === null ? '' : n}</span>`;

  function costChips(cost) {
    const chips = COLORS.filter((c) => cost[c] > 0).map((c) => gem(c, cost[c], 'sm'));
    return chips.join('') || '<span class="dim small">공짜</span>';
  }

  function cardHtml(c, o = {}) {
    const cls = ['sc'];
    if (o.sel) cls.push('sel');
    if (c.afford) cls.push('ok');
    const attrs = o.attrs || '';
    return `<button class="${cls.join(' ')}" ${attrs} aria-label="${c.level}단계 ${CNAME[c.bonus]} 카드">
      <div class="sc-top"><b>${c.points || ''}</b>${gem(c.bonus, null, 'sm')}</div>
      <div class="sc-cost">${costChips(c.cost)}</div></button>`;
  }

  function nobleHtml(n, o = {}) {
    const chips = COLORS.filter((c) => n.req[c]).map((c) => `<span class="sg c-${c} sm sq">${n.req[c]}</span>`).join('');
    const tag = o.act ? 'button' : 'div';
    return `<${tag} class="sn ${o.cls || ''}" ${o.act ? `data-act="${o.act}" data-id="${n.id}"` : ''}><b>👑 3</b><div class="sn-req">${chips}</div><small>${esc(n.name)}</small></${tag}>`;
  }

  function bankHtml(canTake) {
    const picked = st().gems;
    return `<div class="sbank">${[...COLORS, 'y'].map((c) => {
      const n = S.bank[c];
      const times = picked.filter((x) => x === c).length;
      const act = canTake && c !== 'y' && n > 0 ? `data-act="spGem" data-c="${c}"` : '';
      return `<button class="sbtok ${times ? 'sel' : ''}" ${act} ${act ? '' : 'disabled'}>${gem(c, n, 'big')}${times ? `<i>${times}</i>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function playerHtml(p) {
    const turn = p.id === S.turnId && S.phase === 'play';
    const tokens = [...COLORS, 'y'].filter((c) => p.gems[c] > 0).map((c) => gem(c, p.gems[c], 'sm')).join('') || '<span class="dim small">보석 없음</span>';
    const bonus = COLORS.filter((c) => p.bonus[c] > 0).map((c) => `<span class="sg c-${c} sm sq">${p.bonus[c]}</span>`).join('');
    const winner = S.winnerIds.includes(p.id);
    return `<div class="spp ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''}">
      <div class="spp-h"><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${turn ? ' 👈' : ''}${winner ? ' 🏆' : ''}<span class="spp-pts">${p.points}점</span></div>
      <div class="spp-r">${tokens}</div>
      <div class="spp-r small dim">보너스 ${bonus || '없음'} · 카드 ${p.cardCount} · 예약 ${p.reservedCount} · 귀족 ${p.nobles.length}</div></div>`;
  }

  function selectedCard() {
    const s = st().sel;
    if (!s) return null;
    if (s.reserved != null) return (me().reserved || []).find((c) => c.id === s.reserved) || null;
    if (s.deck) return { deck: true, level: s.level };
    return (S.board[s.level] || [])[s.index] || null;
  }

  function dock() {
    const mode = S.mode;
    const s = st();
    if (mode === 'main') {
      if (s.gems.length) {
        const label = s.gems.map((c) => CNAME[c]).join(' · ');
        return `<button class="primary" data-act="spTake">보석 가져오기: ${label}</button><button class="ghost" data-act="spClear">선택 취소</button>`;
      }
      const c = selectedCard();
      if (c) {
        const reservedFull = me().reservedCount >= 3;
        if (c.deck) {
          return `<p class="small dim center">${c.level}단계 덱의 맨 위 카드를 예약해요 (내용은 예약한 뒤에 볼 수 있어요)</p>
            <button class="primary" data-act="spReserve" ${reservedFull ? 'disabled' : ''}>덱에서 예약 (금 +1)</button>
            <button class="ghost" data-act="spClear">선택 취소</button>`;
        }
        const isRes = s.sel.reserved != null;
        return `<div class="row">
          <button class="primary" data-act="spBuy" ${c.afford ? '' : 'disabled'}>${c.afford ? '구매하기' : '보석이 모자라요'}</button>
          ${isRes ? '' : `<button data-act="spReserve" ${reservedFull ? 'disabled' : ''}>${reservedFull ? '예약 가득' : '예약 (금 +1)'}</button>`}
        </div><button class="ghost" data-act="spClear">선택 취소</button>`;
      }
      return `<p class="center dim small">보석을 눌러 가져오거나, 카드를 눌러 사거나 예약하세요.</p>
        ${S.canPass ? '<button data-act="spPass">할 수 있는 게 없어요 — 차례 넘기기</button>' : ''}`;
    }
    if (mode === 'discard') {
      const need = S.pending.need;
      const given = Object.values(s.giveBack).reduce((a, b) => a + b, 0);
      const mine = me();
      const chips = [...COLORS, 'y'].filter((c) => mine.gems[c] > 0).map((c) => {
        const n = s.giveBack[c] || 0;
        return `<button class="sbtok ${n ? 'sel' : ''}" data-act="spGive" data-c="${c}">${gem(c, mine.gems[c] - n, 'big')}${n ? `<i>-${n}</i>` : ''}</button>`;
      }).join('');
      return `<p class="center"><b>보석이 10개를 넘었어요.</b> ${need}개를 버리세요. (${given}/${need})</p>
        <div class="sbank">${chips}</div>
        <button class="primary" data-act="spGiveOk" ${given === need ? '' : 'disabled'}>이 보석 버리기</button>`;
    }
    if (mode === 'noble') {
      return `<p class="center"><b>귀족이 여러 명 찾아왔어요.</b> 한 명을 고르세요.</p>
        <div class="snrow">${S.nobles.filter((n) => S.pending.options.includes(n.id)).map((n) => nobleHtml(n, { act: 'spNoble' })).join('')}</div>`;
    }
    if (mode === 'wait') return `<p class="center dim">${pname(S.turnId || (S.pending && S.pending.who))}님 차례예요</p>`;
    return '';
  }

  function renderSplendor() {
    const s = st();
    const m = me();
    const canTake = S.mode === 'main';
    const sel = selectedCard();
    const rows = [3, 2, 1].map((lv) => {
      const deckBtn = `<button class="sc deck ${s.sel && s.sel.deck && s.sel.level === lv ? 'sel' : ''}" ${canTake && S.deckCounts[lv] ? `data-act="spDeck" data-level="${lv}"` : 'disabled'}>
        <div class="sc-top"><b>${'●'.repeat(lv)}</b></div><div class="sc-cost"><span class="small dim">덱 ${S.deckCounts[lv]}장</span></div></button>`;
      const cards = S.board[lv].map((c, i) => (c
        ? cardHtml(c, { sel: s.sel && s.sel.level === lv && s.sel.index === i, attrs: `data-act="spCard" data-level="${lv}" data-index="${i}"` })
        : '<div class="sc empty"></div>')).join('');
      return `<div class="srow">${deckBtn}${cards}</div>`;
    }).join('');

    const reserved = m && m.reserved && m.reserved.length
      ? `<div class="card"><b>내 예약 카드</b><div class="srow res">${m.reserved.map((c) => cardHtml(c, { sel: s.sel && s.sel.reserved === c.id, attrs: `data-act="spResCard" data-id="${c.id}"` })).join('')}</div></div>`
      : '';
    const mine = m ? `<div class="card"><b>내 보석</b> <span class="small dim">(${Object.values(m.gems).reduce((a, b) => a + b, 0)}/10)</span>
      <div class="spp-r" style="margin-top:6px">${[...COLORS, 'y'].map((c) => gem(c, m.gems[c], 'sm')).join('')}</div></div>` : '';
    const winner = S.phase === 'over'
      ? `<div class="card panel"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>${genericOverButtons(S.hostId === S.me)}</div>` : '';
    const final = S.endTrigger && S.phase === 'play' ? '<div class="banner">🏁 15점에 도달한 사람이 있어요. 이번 라운드가 마지막이에요!</div>' : '';
    const log = S.log.length ? `<div class="ulog">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    const isHost = S.hostId === S.me;

    return `
    <div class="top"><span>${roomTag()}</span><span>스플렌더 · ${S.turnId ? `${pname(S.turnId)}님 차례` : '게임 끝'}</span></div>
    ${final}${winner}
    <div class="snrow">${S.nobles.map((n) => nobleHtml(n)).join('')}</div>
    <div class="sboard">${rows}</div>
    ${bankHtml(canTake)}
    ${reserved}
    <div class="spplayers">${S.players.map(playerHtml).join('')}</div>
    ${mine}
    ${log}
    <div class="bdock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('지금 차례 넘기기 (자리 비운 사람)', '지금 차례인 사람의 턴을 넘길까요? (자리를 비웠을 때 쓰세요)') : ''}`;
  }

  function sync() {
    if (S.kind !== 'splendor') { ui.sp = null; return; }
    const s = st();
    if (S.mode !== 'main') { s.gems = []; s.sel = null; }
    if (S.mode !== 'discard') s.giveBack = {};
    if (s.sel && !selectedCard()) s.sel = null;
    // 은행에 없어진 색을 고르고 있었다면 풀어 준다
    s.gems = s.gems.filter((c) => S.bank && S.bank[c] > 0);
  }

  function click(act, el) {
    const s = st();
    switch (act) {
      case 'spGem': {
        const c = el.dataset.c;
        const g = s.gems;
        const times = g.filter((x) => x === c).length;
        const dup = g.length === 2 && g[0] === g[1];
        if (times === 2) s.gems = [];
        else if (times === 1 && g.length === 1) {
          if (S.bank[c] >= 4) s.gems = [c, c];
          else s.gems = [];
        } else if (times === 1) s.gems = g.filter((x) => x !== c);
        else if (dup || g.length >= 3) s.gems = [c];
        else s.gems = [...g, c];
        s.sel = null;
        render();
        return true;
      }
      case 'spClear': s.gems = []; s.sel = null; render(); return true;
      case 'spTake': send({ t: 'take', colors: s.gems }); s.gems = []; return true;
      case 'spCard': {
        const level = Number(el.dataset.level);
        const index = Number(el.dataset.index);
        s.gems = [];
        s.sel = s.sel && s.sel.level === level && s.sel.index === index ? null : { level, index };
        render();
        return true;
      }
      case 'spDeck': {
        const level = Number(el.dataset.level);
        s.gems = [];
        s.sel = s.sel && s.sel.deck && s.sel.level === level ? null : { deck: true, level };
        render();
        return true;
      }
      case 'spResCard': {
        const id = Number(el.dataset.id);
        s.gems = [];
        s.sel = s.sel && s.sel.reserved === id ? null : { reserved: id };
        render();
        return true;
      }
      case 'spBuy': {
        const x = s.sel;
        if (x.reserved != null) send({ t: 'buy', reserved: x.reserved });
        else send({ t: 'buy', level: x.level, index: x.index });
        s.sel = null;
        return true;
      }
      case 'spReserve': {
        const x = s.sel;
        if (x.deck) send({ t: 'reserve', level: x.level, deck: true });
        else send({ t: 'reserve', level: x.level, index: x.index });
        s.sel = null;
        return true;
      }
      case 'spPass': send({ t: 'pass' }); return true;
      case 'spGive': {
        const c = el.dataset.c;
        const mine = me().gems[c];
        const cur = s.giveBack[c] || 0;
        const total = Object.values(s.giveBack).reduce((a, b) => a + b, 0);
        if (cur < mine && total < S.pending.need) s.giveBack[c] = cur + 1;
        else s.giveBack[c] = 0;
        render();
        return true;
      }
      case 'spGiveOk': send({ t: 'discard', gems: s.giveBack }); s.giveBack = {}; return true;
      case 'spNoble': send({ t: 'noble', id: Number(el.dataset.id) }); return true;
      default: return false;
    }
  }

  window.GAME_UI.splendor = {
    name: '스플렌더', label: '💎 스플렌더', range: '2~4명', rules: RULES, render: renderSplendor, sync, click,
  };
}());
