'use strict';
// 보난자 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)과 bohnanza-data.js의
// BOHNANZA_DATA를 쓰고 GAME_UI에 등록한다.
(function () {
  window.GAME_UI = window.GAME_UI || {};
  const { BEANS, coinsFor } = BOHNANZA_DATA;

  const RULES = `
<details><summary>보난자 규칙 간단 설명</summary>
<p><b>3~5명</b> · 콩을 심고 수확해서 <b>코인</b>을 모아요. 코인이 가장 많은 사람이 이겨요. (3명이면 커피콩을 빼요)</p>
<ul>
<li><b>손패 순서는 바꿀 수 없어요.</b> 새 카드는 맨 뒤에 붙고, 내 차례에 <b>맨 앞 카드를 반드시 심어요</b>(원하면 그다음 카드도 하나 더).</li>
<li>한 밭에는 <b>같은 종류의 콩</b>만 심을 수 있어요. 다른 콩을 심으려면 그 밭을 먼저 <b>수확</b>해야 해요. 밭은 처음에 2개, 코인 3개를 내면 3번째 밭을 살 수 있어요.</li>
<li><b>수확</b>: 밭을 누르면 콩이 코인으로 바뀌어요. 콩 수가 많을수록 코인이 많아요(밭 카드의 표시). 남은 콩은 버려요. 수확은 언제든 할 수 있지만, 콩이 1개뿐인 밭은 다른 밭에 2개 이상 있으면 수확할 수 없어요.</li>
<li>내 차례에 카드 2장이 펼쳐져요. 펼친 카드와 내 손패 중 <b>내놓을 카드</b>를 공개하면, 다른 사람이 <b>제안</b>(줄 카드 ↔ 받고 싶은 카드)을 해요. 마음에 드는 제안을 <b>수락</b>하면 교환돼요. 다른 사람끼리는 거래할 수 없어요.</li>
<li>거래로 받은 카드와 거래하지 않은 펼친 카드는 <b>모두 바로 심어야</b> 해요. 그다음 덱에서 3장을 뽑아 손패 뒤에 붙여요.</li>
<li><b>덱이 3번 바닥나면</b> 게임이 끝나요. 모두 밭을 수확하고, 코인이 가장 많은 사람이 승리!</li>
</ul></details>`;

  const st = () => (ui.bz = ui.bz || { give: [], want: [], table: null });
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const me = () => player(S.me);
  const tname = (t) => BEANS[t].name;

  function bean(c, o = {}) {
    const b = BEANS[c.type];
    const cls = ['bzc'];
    if (o.sel) cls.push('sel');
    if (o.first) cls.push('first');
    if (o.dim) cls.push('dim');
    const inner = `${o.first ? '<em>다음</em>' : ''}<span class="ic">${b.icon}</span><span class="nm">${b.name}</span>`;
    const style = `style="--bc:${b.color}"`;
    return o.act
      ? `<button class="${cls.join(' ')}" ${style} data-act="${o.act}" data-id="${c.id}">${inner}</button>`
      : `<div class="${cls.join(' ')}" ${style}>${inner}</div>`;
  }

  function meterHint(f) {
    if (!f.type) return '';
    const meter = BEANS[f.type].meter;
    const next = meter.find(([need]) => need > f.count);
    return next ? `다음 코인까지 ${next[0] - f.count}개` : '최대!';
  }

  function fieldBox(f, i, mineOpts) {
    const b = f.type ? BEANS[f.type] : null;
    const act = mineOpts && f.count ? `data-act="bzHarvest" data-i="${i}"` : '';
    return `<${act ? 'button' : 'div'} class="bzf ${f.count ? '' : 'empty'}" ${b ? `style="--bc:${b.color}"` : ''} ${act}>
      ${b ? `<span class="ic">${b.icon}</span><b>${b.name} ×${f.count}</b><small>수확하면 코인 ${f.value}${mineOpts ? ` · ${meterHint(f)}` : ''}</small>` : '<span class="dim small">빈 밭</span>'}
    </${act ? 'button' : 'div'}>`;
  }

  function playersHtml() {
    return `<div class="bzplayers">${S.players.map((p) => {
      const turn = p.id === S.turnId;
      const fields = p.fields.map((f, i) => fieldBox(f, i, p.id === S.me && S.phase === 'play')).join('');
      return `<div class="bzp ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''}">
        <div class="bzp-h"><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${turn ? ' 👈' : ''}${S.winnerIds.includes(p.id) ? ' 🏆' : ''}
          <span class="bzp-s">🃏 ${p.handCount} · 💰 ${p.coins}${p.tableCount ? ` · 심을 카드 ${p.tableCount}` : ''}</span></div>
        <div class="bzfields">${fields}${p.id === S.me && p.fields.length < 3 && p.coins >= S.fieldPrice ? `<button class="bzf buy" data-act="bzBuyField">➕ 밭 사기<small>코인 ${S.fieldPrice}개</small></button>` : ''}</div></div>`;
    }).join('')}</div>`;
  }

  function tradeZone() {
    if (S.step !== 'trade') return '';
    const s = st();
    const A = S.turnId;
    const isA = A === S.me;
    const selectable = !isA && S.mode === 'tradeB';
    const faceUp = S.faceUp.map((c) => bean(c, { act: selectable ? 'bzWant' : '', sel: s.want.includes(c.id) })).join('') || '<span class="dim small">없음</span>';
    const offered = S.offered.map((c) => bean(c, { act: selectable ? 'bzWant' : '', sel: s.want.includes(c.id) })).join('') || '<span class="dim small">없음</span>';
    const props = S.proposals.map((p) => {
      const giveHtml = p.give.map((c) => bean(c, { dim: false })).join('') || '<span class="dim small">없음</span>';
      const wantHtml = p.want.map((id) => {
        const c = [...S.faceUp, ...S.offered].find((x) => x.id === id);
        return c ? bean(c) : '';
      }).join('') || '<span class="dim small">없음</span>';
      const actions = isA
        ? `<div class="row"><button class="primary sm" data-act="bzAccept" data-from="${p.from}">수락</button><button class="sm" data-act="bzReject" data-from="${p.from}">거절</button></div>`
        : p.from === S.me ? '<button class="sm ghost" data-act="bzWithdraw">내 제안 철회</button>' : '';
      return `<div class="bzprop"><div class="small"><b>${pname(p.from)}</b>님의 제안</div>
        <div class="bzswap"><div><small class="dim">${pname(p.from)}님이 줌</small><div class="bzrow">${giveHtml}</div></div><span>⇄</span><div><small class="dim">${pname(A)}님이 줌</small><div class="bzrow">${wantHtml}</div></div></div>${actions}</div>`;
    }).join('');
    return `<div class="card"><h2>🤝 거래</h2>
      <p class="small dim">${isA ? '펼친 카드와 내놓은 손패를 보고 제안을 수락하세요. 내놓을 손패 카드는 아래에서 눌러 고르세요.' : `${pname(A)}님이 내놓은 카드 중 받고 싶은 카드와, 내 손패 중 줄 카드를 골라 제안하세요.`}</p>
      <div class="small"><b>펼친 카드</b> (${pname(A)}님)</div><div class="bzrow">${faceUp}</div>
      <div class="small" style="margin-top:6px"><b>내놓은 손패</b></div><div class="bzrow">${offered}</div>
      ${S.proposals.length ? `<div style="margin-top:8px"><b>제안 ${S.proposals.length}건</b></div>${props}` : '<p class="small dim center" style="margin:8px 0 0">아직 제안이 없어요.</p>'}
    </div>`;
  }

  function handHtml() {
    const s = st();
    const m = S.mode;
    const clickable = m === 'tradeA' || m === 'tradeB';
    const cards = S.hand.map((c, i) => {
      const sel = m === 'tradeA' ? S.offered.some((o) => o.id === c.id) : s.give.includes(c.id);
      return bean(c, { act: clickable ? 'bzHand' : '', sel, first: i === 0 && S.phase === 'play' });
    }).join('');
    return `<div class="card"><b>내 손패</b> <span class="small dim">(${S.hand.length}장 · 순서는 바꿀 수 없어요)</span>
      <div class="bzrow hand">${cards || '<span class="dim small">없음</span>'}</div></div>`;
  }

  function tableHtml() {
    if (!S.table.length) return '';
    const s = st();
    return `<div class="card"><b>🌱 심어야 할 카드</b>
      <div class="bzrow">${S.table.map((c) => bean(c, { act: S.mode === 'plantAll' ? 'bzTable' : '', sel: s.table === c.id })).join('')}</div></div>`;
  }

  // 심을 카드를 놓을 밭 버튼들
  function fieldButtons(card, act) {
    const m = me();
    const btns = m.fields.map((f, i) => {
      if (f.type === null) return `<button data-act="${act}" data-i="${i}">밭 ${i + 1}: 빈 밭에 심기</button>`;
      if (f.type === card.type) return `<button class="primary" data-act="${act}" data-i="${i}">밭 ${i + 1}: ${tname(f.type)} ×${f.count}에 더하기</button>`;
      return `<button disabled>밭 ${i + 1}: 다른 콩(${tname(f.type)}) — 먼저 수확</button>`;
    });
    const blocked = m.fields.every((f) => f.type !== null && f.type !== card.type);
    return `${btns.join('')}${blocked ? '<p class="small center" style="color:var(--gold)">심을 밭이 없어요. 위의 밭을 눌러 먼저 수확하세요.</p>' : ''}`;
  }

  function dock() {
    const s = st();
    const m = S.mode;
    if (m === 'plant1') {
      const card = S.hand[0];
      const second = S.plantCount >= 1;
      return `<p class="center"><b>${S.plantCount === 0 ? '맨 앞 카드를 심으세요' : '원하면 다음 카드도 심을 수 있어요'}</b> ${bean(card, { first: true })}</p>
        ${fieldButtons(card, 'bzPlantHand')}
        ${second ? '<button class="ghost" data-act="bzSkip">더 안 심고 거래하러 가기</button>' : ''}`;
    }
    if (m === 'tradeA') {
      return `<p class="center small">내놓을 손패를 위에서 눌러 고르면 다른 사람이 볼 수 있어요.</p>
        <button class="primary" data-act="bzEndTrade">거래 끝내기 (남은 카드는 모두 심어요)</button>`;
    }
    if (m === 'tradeB') {
      const mine = S.proposals.find((p) => p.from === S.me);
      const ok = s.give.length + s.want.length > 0;
      return `<p class="center small">줄 카드 ${s.give.length}장 ↔ 받을 카드 ${s.want.length}장 ${mine ? '(제안 중)' : ''}</p>
        <div class="row"><button class="primary" data-act="bzPropose" ${ok ? '' : 'disabled'}>${mine ? '제안 바꾸기' : '제안하기'}</button>${mine ? '<button data-act="bzWithdraw">철회</button>' : ''}</div>`;
    }
    if (m === 'plantAll') {
      const card = S.table.find((c) => c.id === s.table);
      return card
        ? `<p class="center"><b>${tname(card.type)}</b>을(를) 심을 밭을 고르세요</p>${fieldButtons(card, 'bzPlantTable')}`
        : '<p class="center">위의 "심어야 할 카드"를 눌러 고른 뒤 밭을 고르세요.</p>';
    }
    if (m === 'over') return '';
    const who = S.step === 'plantAll'
      ? `받은 카드를 심는 중: ${S.players.filter((p) => p.tableCount).map((p) => esc(p.name)).join(', ') || '…'}`
      : `${pname(S.turnId)}님이 ${S.step === 'trade' ? '거래 중' : '콩을 심는 중'}이에요`;
    return `<p class="center dim">${who}</p>`;
  }

  function stepText() {
    if (S.phase === 'over') return '게임 끝';
    return { plant1: `${pname(S.turnId)}님: 콩 심기`, trade: `${pname(S.turnId)}님: 거래`, plantAll: '모두 심는 중' }[S.step] || '';
  }

  function renderBohnanza() {
    const isHost = S.hostId === S.me;
    const over = S.phase === 'over'
      ? `<div class="card panel"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>
          ${S.players.slice().sort((a, b) => S.scores[b.id] - S.scores[a.id]).map((p) => `<div class="slot"><span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><span>💰 ${S.scores[p.id]}</span></div>`).join('')}
          ${genericOverButtons(isHost)}</div>` : '';
    const log = S.log.length ? `<div class="ulog">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    return `
    <div class="top"><span>${roomTag()}</span><span>보난자 · ${stepText()}</span></div>
    <div class="bzinfo">🂠 덱 ${S.deckCount}장 · ${S.deckRuns}/${S.maxRuns}번째 덱${S.discardTop ? ` · 버린 더미 맨 위: ${BEANS[S.discardTop].icon}` : ''}</div>
    ${over}
    ${playersHtml()}
    ${tradeZone()}
    ${tableHtml()}
    ${handHtml()}
    ${log}
    <div class="bdock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (대신 심기 / 거래 끝내기)', '자리를 비운 사람 대신 진행할까요? (대신 심고, 거래를 끝내요)') : ''}`;
  }

  function sync() {
    if (S.kind !== 'bohnanza') { ui.bz = null; return; }
    const s = st();
    const hand = new Set(S.hand.map((c) => c.id));
    const vis = new Set([...S.faceUp, ...S.offered].map((c) => c.id));
    s.give = s.give.filter((id) => hand.has(id));
    s.want = s.want.filter((id) => vis.has(id));
    if (S.mode !== 'tradeB') { s.give = []; s.want = []; }
    if (!S.table.some((c) => c.id === s.table)) s.table = null;
  }

  function toggle(list, id) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function click(act, el) {
    const s = st();
    switch (act) {
      case 'bzHarvest': {
        const i = Number(el.dataset.i);
        const f = me().fields[i];
        if (f.canHarvest === false) { showToast('콩이 1개뿐인 밭은 다른 밭에 2개 이상 있으면 수확할 수 없어요.'); return true; }
        const msg = f.value === 0 ? `${tname(f.type)} ${f.count}개를 수확하면 코인을 못 받고 모두 버려져요. 그래도 수확할까요?` : `${tname(f.type)} ${f.count}개를 수확해 코인 ${f.value}개를 받을까요?`;
        if (window.confirm(msg)) send({ t: 'harvest', field: i });
        return true;
      }
      case 'bzBuyField': send({ t: 'buyField' }); return true;
      case 'bzPlantHand': send({ t: 'plant', card: S.hand[0].id, field: Number(el.dataset.i) }); return true;
      case 'bzSkip': send({ t: 'skipPlant' }); return true;
      case 'bzHand': {
        const id = Number(el.dataset.id);
        if (S.mode === 'tradeA') {
          const cur = S.offered.map((c) => c.id);
          send({ t: 'offer', cards: toggle(cur, id) });
        } else {
          s.give = toggle(s.give, id);
          render();
        }
        return true;
      }
      case 'bzWant': s.want = toggle(s.want, Number(el.dataset.id)); render(); return true;
      case 'bzPropose': send({ t: 'propose', give: s.give, want: s.want }); return true;
      case 'bzWithdraw': send({ t: 'withdraw' }); s.give = []; s.want = []; return true;
      case 'bzAccept': send({ t: 'accept', from: el.dataset.from }); return true;
      case 'bzReject': send({ t: 'reject', from: el.dataset.from }); return true;
      case 'bzEndTrade': send({ t: 'endTrade' }); return true;
      case 'bzTable': s.table = s.table === Number(el.dataset.id) ? null : Number(el.dataset.id); render(); return true;
      case 'bzPlantTable': send({ t: 'plant', card: s.table, field: Number(el.dataset.i) }); s.table = null; return true;
      default: return false;
    }
  }

  window.GAME_UI.bohnanza = {
    name: '보난자', label: '🫘 보난자', range: '3~5명', rules: RULES, render: renderBohnanza, sync, click,
  };
}());
