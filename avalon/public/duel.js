'use strict';
// 세븐 원더스 듀얼 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)과 duel-data.js의
// DUEL_DATA를 쓰고 GAME_UI에 등록한다.
(function () {
  window.GAME_UI = window.GAME_UI || {};
  const { RES, COLORS, SYMS, CHAINS, TOKENS, CARD, WONDER, resText, cardDesc } = DUEL_DATA;

  const RULES = `
<details><summary>세븐 원더스 듀얼 규칙 간단 설명</summary>
<p><b>2명</b> · 3개 시대 동안 카드를 모아 도시를 키우는 게임이에요.</p>
<ul>
<li>피라미드로 깔린 카드 중 <b>다른 카드에 가려지지 않은 카드</b>만 번갈아 하나씩 가져와요. 아래 카드를 가져가면 위 카드가 뒤집혀요.</li>
<li>가져온 카드로 <b>① 건물 짓기</b>(비용을 내거나, 연계 기호가 있으면 무료) <b>② 버리고 동전 받기</b>(2 + 내 상업 카드 수) <b>③ 불가사의 짓기</b>(카드는 불가사의 밑에 깔려요) 중 하나를 해요.</li>
<li>자원이 모자라면 은행에서 사요. 한 개에 <b>2 + 상대가 가진 같은 자원 수</b>만큼 동전이 들어요.</li>
<li><b>즉시 승리</b>: 군사 말을 상대 수도(끝)까지 밀거나, 서로 다른 <b>과학 기호 6종</b>을 모으면 바로 이겨요. 같은 과학 기호가 2장이 되면 진보 토큰을 하나 얻어요.</li>
<li>3시대까지 아무도 못 이기면 점수(카드·불가사의·진보 토큰·군사·동전 3개당 1점)가 높은 사람이 이겨요. 동점이면 시민(파랑) 점수가 높은 쪽.</li>
<li>불가사의는 4개씩 갖고 시작하고, 둘이 합쳐 <b>7개</b>까지만 지을 수 있어요.</li>
<li>⚠️ 카드·불가사의 구성은 원작과 같지 않은 비슷한 구성이에요.</li>
</ul></details>`;

  const st = () => {
    if (!ui.dl) ui.dl = { focus: null, wpick: false };
    return ui.dl;
  };
  const player = (id) => S.players.find((p) => p.id === id);
  const me = () => player(S.me);
  const opp = () => S.players.find((p) => p.id !== S.me);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const giverOf = (sym) => Object.values(CARD).find((c) => c.gives === sym);
  const takerOf = (sym) => Object.values(CARD).filter((c) => c.from === sym).map((c) => c.name);

  function cardIcon(c) {
    if (c.res) return Object.entries(c.res).map(([k, n]) => RES[k].repeat(n)).join('');
    if (c.choice) return c.choice.map((k) => RES[k]).join('');
    if (c.trade) return `🔁${c.trade.map((k) => RES[k]).join('')}`;
    if (c.color === 'purple') return '👑';
    if (c.shields) return '⚔️'.repeat(c.shields);
    if (c.sym) return SYMS[c.sym].icon;
    if (c.per) return '🪙✨';
    if (c.coins) return `🪙${c.coins}`;
    if (c.color === 'blue') return `⭐${c.vp}`;
    return '❔';
  }

  // ---- 카드 설명 ----
  function cardInfoHtml(c) {
    const col = COLORS[c.color];
    let chain = '';
    if (c.from) {
      const g = giverOf(c.from);
      chain += `<div class="small">🔗 ${CHAINS[c.from]} 기호(${g ? esc(g.name) : '?'})가 있으면 무료</div>`;
    }
    if (c.gives) chain += `<div class="small dim">이 카드를 지으면 ${CHAINS[c.gives]} 기호 → ${takerOf(c.gives).map(esc).join(', ') || '없음'}을(를) 무료로 지을 수 있어요</div>`;
    return `<div class="dinfo"><div class="dinfo-h"><i class="dband dc-${c.color}"></i><b>${esc(c.name)}</b> <span class="dim small">${c.age}시대 · ${col.name}</span></div>
      <div class="small">비용 ${resText(c.cost)}</div><div class="small">${esc(cardDesc(c)) || '효과 없음'}</div>${chain}</div>`;
  }

  function wonderInfoHtml(w) {
    return `<div class="dinfo"><div class="dinfo-h"><i class="dband dwonder"></i><b>🏛️ ${esc(w.name)}</b></div>
      <div class="small">비용 ${resText(w.cost)}</div><div class="small">${esc(w.desc)}</div></div>`;
  }

  function tokenInfoHtml(id) {
    const t = TOKENS[id];
    return `<div class="dinfo"><div class="dinfo-h"><b>${t.icon} ${esc(t.name)}</b> <span class="dim small">진보 토큰</span></div><div class="small">${esc(t.desc)}</div></div>`;
  }

  // ---- 판 ----
  function pyramidHtml() {
    const s = st();
    const rows = Math.max(...S.slots.map((x) => x.row)) + 1;
    const STEP = 40;
    const H = (rows - 1) * STEP + 64;
    const pick = S.mode === 'pick';
    const tiles = S.slots.filter((x) => !x.taken).map((x) => {
      const left = `calc(50% + ${(((x.x - 1) * 100) / 12).toFixed(3)}%)`;
      const style = `left:${left};top:${x.row * STEP}px;z-index:${x.row + 1}`;
      const sel = s.focus && s.focus.kind === 'slot' && s.focus.i === x.i;
      if (x.card === null) return `<div class="dcard back" style="${style}"><span>?</span></div>`;
      const c = CARD[x.card];
      let price = `<span class="dcost">${resText(c.cost)}</span>`;
      if (pick && x.open) {
        const k = S.costs[x.i];
        price = `<span class="dprice ${k.ok ? 'ok' : 'no'}">${k.chain ? '🔗무료' : k.coins ? `🪙${k.coins}` : '무료'}</span>`;
      }
      return `<button class="dcard dc-${c.color} ${x.open ? 'open' : ''} ${sel ? 'sel' : ''}" data-act="dlSlot" data-i="${x.i}" style="${style}">
        <span class="dico">${cardIcon(c)}</span><span class="dnm">${esc(c.name)}</span>${price}</button>`;
    }).join('');
    return `<div class="dpyr" style="height:${H}px">${tiles}</div>`;
  }

  function trackHtml() {
    const cells = [];
    for (let p = -9; p <= 9; p++) {
      const tok = [3, 6].includes(Math.abs(p)) ? `${Math.abs(p) === 3 ? 2 : 5}` : '';
      const fired = S.milTokens[`${p < 0 ? '-' : '+'}${Math.abs(p)}`];
      const zone = Math.abs(p) >= 6 ? 'z3' : Math.abs(p) >= 3 ? 'z2' : Math.abs(p) >= 1 ? 'z1' : 'z0';
      const inner = Math.abs(p) === 9 ? '🏰' : p === S.military ? '⚔️' : tok ? `<small class="${fired ? 'gone' : ''}">🪙${tok}</small>` : '';
      cells.push(`<div class="dtc ${zone} ${p === S.military ? 'pawn' : ''}">${p === S.military && Math.abs(p) === 9 ? '⚔️' : inner}</div>`);
    }
    const [a, b] = S.players;
    return `<div class="dtrack">${cells.join('')}</div>
      <div class="dtrack-l"><span>◀ ${esc(a.name)} 수도</span><span class="dim small">말이 상대 쪽으로 갈수록 상대의 동전이 줄고 점수를 얻어요</span><span>${esc(b.name)} 수도 ▶</span></div>`;
  }

  function playerBar(p) {
    const you = p.id === S.me;
    const turn = p.id === S.turnId;
    const sci = p.sci.map((k) => SYMS[k].icon).join('');
    const toks = p.tokens.map((t) => `<button class="dtok" data-act="dlInfo" data-kind="token" data-id="${t}">${TOKENS[t].icon}</button>`).join('');
    return `<div class="dpl ${turn ? 'turn' : ''} ${you ? 'me' : ''}">
      <div class="dpl-h"><i class="vchip big" style="background:${p.color}"></i><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${you ? ' (나)' : ''}</b>${turn ? ' 👈' : ''}${S.winnerIds.includes(p.id) ? ' 🏆' : ''}</div>
      <div class="dpl-r"><b class="dcoin">🪙 ${p.coins}</b><span class="small">${sci ? `과학 ${sci} (${p.sci.length}/6)` : '과학 -'}</span></div>
      ${toks ? `<div class="dtoks">${toks}</div>` : ''}</div>`;
  }

  function cityHtml(p) {
    const you = p.id === S.me;
    const wonders = p.wonders.map((w) => {
      const W = WONDER[w.id];
      const cls = w.built ? 'built' : w.lost ? 'lost' : '';
      const cost = you && !w.built && !w.lost && S.wonderCosts[w.id] ? ` · ${S.wonderCosts[w.id].coins ? `🪙${S.wonderCosts[w.id].coins}` : '무료'}` : '';
      return `<button class="dwon ${cls}" data-act="dlInfo" data-kind="wonder" data-id="${w.id}"><b>${esc(W.name)}</b><small>${w.built ? '✅ 완성' : w.lost ? '✖ 지을 수 없음' : `${resText(W.cost)}${cost}`}</small></button>`;
    }).join('');
    const order = ['brown', 'grey', 'blue', 'green', 'yellow', 'red', 'purple'];
    const cards = p.cards.map((id) => CARD[id]).sort((a, b) => order.indexOf(a.color) - order.indexOf(b.color));
    const chips = cards.map((c) => `<button class="dchip dc-${c.color}" data-act="dlInfo" data-kind="card" data-id="${c.id}">${cardIcon(c)} ${esc(c.name)}</button>`).join('');
    return `<div class="card dcity ${you ? 'me' : ''}"><div class="small"><b>${esc(p.name)}${you ? ' (나)' : ''}</b>의 도시</div>
      <div class="dwons">${wonders}</div>
      <div class="dchips">${chips || '<span class="dim small">아직 지은 건물이 없어요</span>'}</div></div>`;
  }

  function draftHtml() {
    const mine = S.mode === 'draft';
    const items = S.draft.pool.map((id) => {
      const W = WONDER[id];
      return `<button class="dpick" ${mine ? `data-act="dlDraft" data-id="${id}"` : 'disabled'}><b>🏛️ ${esc(W.name)}</b><span class="small">비용 ${resText(W.cost)}</span><span class="small dim">${esc(W.desc)}</span></button>`;
    }).join('');
    return `<div class="card panel"><h2>불가사의 고르기 (${S.draft.set + 1}/2)</h2>
      <p class="small dim">${mine ? '가져갈 불가사의를 하나 고르세요.' : `${pname(S.draft.pickerId)}님이 고르는 중이에요.`} 마지막 한 장은 자동으로 정해져요.</p>${items}</div>`;
  }

  function overHtml() {
    const isHost = S.hostId === S.me;
    const reason = { military: '군사 승리', science: '과학 승리', points: '점수 승리', tie: '동점 (공동 우승)' }[S.reason];
    const rows = [['blue', '시민'], ['green', '과학'], ['yellow', '상업'], ['purple', '길드'], ['wonders', '불가사의'], ['tokens', '진보 토큰'], ['military', '군사'], ['coins', '동전']];
    const [a, b] = S.players;
    const sa = S.result.scores[a.id];
    const sb = S.result.scores[b.id];
    const table = rows.map(([k, n]) => `<div class="drow"><span>${sa[k]}</span><span class="dim">${n}</span><span>${sb[k]}</span></div>`).join('');
    return `<div class="card panel"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')}</p><p class="center dim">${reason}</p>
      <div class="drow head"><b>${esc(a.name)}</b><span></span><b>${esc(b.name)}</b></div>${table}
      <div class="drow total"><b>${sa.total}</b><span class="dim">합계</span><b>${sb.total}</b></div>
      ${genericOverButtons(isHost)}</div>`;
  }

  // ---- 아래 도크 ----
  function focusHtml() {
    const f = st().focus;
    if (!f) return '';
    if (f.kind === 'slot') {
      const x = S.slots[f.i];
      return x && x.card !== null ? cardInfoHtml(CARD[x.card]) : '';
    }
    if (f.kind === 'card') return cardInfoHtml(CARD[f.id]);
    if (f.kind === 'wonder') return wonderInfoHtml(WONDER[f.id]);
    return tokenInfoHtml(f.id);
  }

  function actionsHtml() {
    const s = st();
    const f = s.focus;
    if (!f || f.kind !== 'slot' || !S.slots[f.i] || !S.slots[f.i].open) {
      return `<p class="center dim">${S.mode === 'pick' ? '가져올 카드를 고르세요. (노란 테두리가 지금 가져올 수 있는 카드)' : ''}</p>`;
    }
    const k = S.costs[f.i];
    if (s.wpick) {
      const list = me().wonders.filter((w) => !w.built && !w.lost).map((w) => {
        const c = S.wonderCosts[w.id];
        return `<button ${c.ok ? '' : 'disabled'} data-act="dlWonder" data-w="${w.id}">${esc(WONDER[w.id].name)} · ${c.coins ? `🪙${c.coins}` : '무료'}${c.ok ? '' : ' (동전 부족)'}</button>`;
      }).join('') || '<p class="dim center">지을 수 있는 불가사의가 없어요.</p>';
      return `<div class="dact"><p class="small center">어느 불가사의를 지을까요? (이 카드는 불가사의 밑에 깔려요)</p>${list}<button class="ghost" data-act="dlWback">뒤로</button></div>`;
    }
    return `<div class="dact row3">
      <button class="primary" ${k.ok ? '' : 'disabled'} data-act="dlBuild">🏗️ 건설<br>${k.ok ? (k.chain ? '연계 무료' : k.coins ? `🪙${k.coins}` : '무료') : '동전 부족'}</button>
      <button data-act="dlDiscard">♻️ 버리기<br>🪙+${S.discardGain}</button>
      <button data-act="dlWpick" ${Object.keys(S.wonderCosts).length ? '' : 'disabled'}>🏛️ 불가사의<br>짓기</button></div>`;
  }

  function pendHtml() {
    const pe = S.pend;
    const mine = S.mode === pe.type;
    if (!mine) return `<p class="center dim">${pname(pe.playerId)}님이 고르는 중이에요…</p>`;
    if (pe.type === 'token' || pe.type === 'library') {
      const items = pe.options.map((t) => `<button data-act="dlToken" data-t="${t}"><b>${TOKENS[t].icon} ${esc(TOKENS[t].name)}</b><br><span class="small dim">${esc(TOKENS[t].desc)}</span></button>`).join('');
      return `<div class="dact"><p class="center"><b>${pe.type === 'library' ? '대도서관: 진보 토큰을 고르세요' : '과학 기호 한 쌍! 진보 토큰을 고르세요'}</b></p>${items}</div>`;
    }
    const title = pe.type === 'destroy' ? `상대의 ${COLORS[pe.color].name} 카드 하나를 파괴하세요` : '버려진 카드 하나를 무료로 지으세요';
    const items = pe.options.map((id) => {
      const c = CARD[id];
      return `<button data-act="dlCard" data-c="${id}"><i class="dband dc-${c.color}"></i> ${cardIcon(c)} <b>${esc(c.name)}</b> <span class="small dim">${c.age}시대</span><br><span class="small dim">${esc(cardDesc(c))}</span></button>`;
    }).join('');
    return `<div class="dact"><p class="center"><b>${title}</b></p>${items}</div>`;
  }

  function dock() {
    if (S.mode === 'over') return '';
    if (S.mode === 'draft') return '<p class="center"><b>불가사의를 골라주세요</b></p>';
    if (S.mode === 'chooseStart') {
      return `<div class="dact"><p class="center"><b>${S.age + 1}시대를 누가 먼저 시작할까요?</b></p><button class="primary" data-act="dlStart" data-who="me">내가 먼저</button><button data-act="dlStart" data-who="opp">상대가 먼저</button></div>`;
    }
    if (S.pend) return pendHtml();
    if (S.mode === 'pick') return actionsHtml();
    if (S.phase === 'chooseStart') return `<p class="center dim">${pname(S.chooserId)}님이 다음 시대의 시작 플레이어를 고르는 중이에요…</p>`;
    if (S.phase === 'draft') return `<p class="center dim">${pname(S.draft.pickerId)}님이 불가사의를 고르는 중이에요…</p>`;
    return `<p class="center dim">${pname(S.turnId)}님 차례예요</p>`;
  }

  function renderDuel() {
    const isHost = S.hostId === S.me;
    const [a, b] = S.players;
    const mine = me();
    const other = opp();
    const log = S.log.length ? `<div class="ulog">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    const board = S.phase === 'play' || S.phase === 'chooseStart' || S.phase === 'over' ? `
      ${S.boardTokens.length ? `<div class="dboard small"><span class="dim">진보 토큰</span>${S.boardTokens.map((t) => `<button class="dtok" data-act="dlInfo" data-kind="token" data-id="${t}">${TOKENS[t].icon} ${esc(TOKENS[t].name)}</button>`).join('')}</div>` : ''}
      ${S.slots.some((x) => !x.taken) ? `<div class="small dim center">${S.age}시대 · 버린 카드 ${S.discard.length}장</div>${pyramidHtml()}` : ''}` : '';
    return `
    <div class="top"><span>방 <b>${esc(S.code)}</b></span><span>세븐 원더스 듀얼${S.age ? ` · ${S.age}시대` : ''}</span></div>
    ${S.phase === 'over' ? overHtml() : ''}
    ${S.phase === 'draft' ? draftHtml() : ''}
    <div class="dpls">${playerBar(a)}${playerBar(b)}</div>
    ${S.phase === 'lobby' ? '' : trackHtml()}
    ${board}
    ${other ? cityHtml(other) : ''}
    ${mine ? cityHtml(mine) : ''}
    ${log}
    <div class="bdock">
      ${S.mode === 'pick' || st().focus ? focusHtml() : ''}
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (자동으로 한 수 진행)', '자리를 비운 사람 대신 한 수 진행할까요? (카드를 버려 동전을 받거나 첫 번째 선택지를 골라요)') : ''}`
  }

  function sync() {
    if (S.kind !== 'duel') { ui.dl = null; return; }
    const s = st();
    const f = s.focus;
    if (f && f.kind === 'slot') {
      const x = S.slots[f.i];
      if (!x || x.taken || x.card === null || S.mode !== 'pick') s.focus = null;
    }
    if (S.mode !== 'pick') s.wpick = false;
  }

  function focusOn(kind, id) {
    const s = st();
    const same = s.focus && s.focus.kind === kind && s.focus.id === id;
    s.focus = same ? null : { kind, id };
    s.wpick = false;
    render();
  }

  function click(act, el) {
    const s = st();
    const i = Number(el.dataset.i);
    switch (act) {
      case 'dlSlot': {
        const same = s.focus && s.focus.kind === 'slot' && s.focus.i === i;
        s.focus = same ? null : { kind: 'slot', i };
        s.wpick = false;
        render();
        return true;
      }
      case 'dlInfo': focusOn(el.dataset.kind, el.dataset.kind === 'token' ? el.dataset.id : Number(el.dataset.id)); return true;
      case 'dlWpick': s.wpick = true; render(); return true;
      case 'dlWback': s.wpick = false; render(); return true;
      case 'dlBuild': send({ t: 'build', slot: s.focus.i }); s.focus = null; return true;
      case 'dlDiscard': send({ t: 'discard', slot: s.focus.i }); s.focus = null; return true;
      case 'dlWonder': send({ t: 'wonder', slot: s.focus.i, wonder: Number(el.dataset.w) }); s.focus = null; s.wpick = false; return true;
      case 'dlDraft': send({ t: 'draftWonder', wonder: Number(el.dataset.id) }); return true;
      case 'dlToken': send({ t: 'choose', token: el.dataset.t }); return true;
      case 'dlCard': send({ t: 'choose', card: Number(el.dataset.c) }); return true;
      case 'dlStart': send({ t: 'startWith', who: el.dataset.who }); return true;
      default: return false;
    }
  }

  window.GAME_UI.duel = {
    name: '세븐 원더스 듀얼', label: '🏛️ 세븐 원더스 듀얼', range: '2명', rules: RULES, render: renderDuel, sync, click,
  };
}());
