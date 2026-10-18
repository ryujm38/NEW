'use strict';
// 스플렌더 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
// 그림(보석·카드·귀족)은 모두 이 파일의 SVG와 skin-splendor.css로 새로 그린 것이다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const COLORS = ['w', 'u', 'g', 'r', 'k'];
  const ALL = [...COLORS, 'y'];
  const CNAME = { w: '흰색', u: '파랑', g: '초록', r: '빨강', k: '검정', y: '금' };
  const GNAME = { w: '다이아몬드', u: '사파이어', g: '에메랄드', r: '루비', k: '오닉스', y: '황금' };
  const ROMAN = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' };
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

  // ---- 보석 그림 (색마다 모양이 달라서 색을 구분하기 어려워도 알아볼 수 있다) ----
  const GEM = {
    w: { base: '#dfe6f3', dark: '#6f7c96', light: '#ffffff' },
    u: { base: '#2e6be6', dark: '#0f2f7a', light: '#a9cbff' },
    g: { base: '#18a463', dark: '#06512f', light: '#9ff5c8' },
    r: { base: '#e22d4b', dark: '#6e0b1d', light: '#ffb0bc' },
    k: { base: '#40394f', dark: '#0d0b12', light: '#b2a6c9' },
    y: { base: '#f3c24d', dark: '#8a5a0c', light: '#fff3c0' },
  };
  const f1 = (n) => Math.round(n * 10) / 10;
  const pts = (list) => list.map(([x, y]) => `${f1(x)},${f1(y)}`).join(' ');
  const ring = (n, rx, ry, rot) => Array.from({ length: n }, (_, i) => {
    const a = rot + (i * 2 * Math.PI) / n;
    return [20 + rx * Math.cos(a), 20 + ry * Math.sin(a)];
  });
  const shrink = (list, k) => list.map(([x, y]) => [20 + (x - 20) * k, 20 + (y - 20) * k]);
  const SHAPES = {
    w: () => { const o = ring(8, 17, 17, Math.PI / 8); return [o, shrink(o, 0.5)]; }, // 브릴리언트 컷
    u: () => { const o = ring(12, 13.5, 17, 0); return [o, shrink(o, 0.5)]; }, // 오벌 컷
    g: () => { const o = [[14, 3], [26, 3], [32, 9], [32, 31], [26, 37], [14, 37], [8, 31], [8, 9]]; return [o, shrink(o, 0.56)]; }, // 에메랄드 컷
    r: () => { const o = ring(6, 17.5, 17.5, -Math.PI / 2); return [o, shrink(o, 0.48)]; }, // 육각 컷
    k: () => { const o = [[20, 2], [38, 20], [20, 38], [2, 20]]; return [o, shrink(o, 0.5)]; }, // 마름모 컷
  };
  const LIGHT = (-3 * Math.PI) / 4; // 빛은 왼쪽 위에서

  function buildGem(c) {
    const g = GEM[c];
    if (c === 'y') {
      const star = Array.from({ length: 10 }, (_, i) => {
        const r = i % 2 ? 4.6 : 10.5;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        return [20 + r * Math.cos(a), 20 + r * Math.sin(a)];
      });
      return `<circle cx="20" cy="20" r="17" fill="${g.base}" stroke="${g.dark}" stroke-width="1.6"/>
        <circle cx="20" cy="20" r="13.5" fill="none" stroke="${g.dark}" stroke-opacity=".45" stroke-width="1.2"/>
        <path d="M6 15 A15 15 0 0 1 25 4.6" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2" stroke-linecap="round"/>
        <polygon points="${pts(star)}" fill="${g.light}" stroke="${g.dark}" stroke-width="1" stroke-linejoin="round"/>`;
    }
    const [o, t] = SHAPES[c]();
    const n = o.length;
    let facets = '';
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const mx = (o[i][0] + o[j][0]) / 2 - 20;
      const my = (o[i][1] + o[j][1]) / 2 - 20;
      const b = Math.cos(Math.atan2(my, mx) - LIGHT);
      const fill = b > 0 ? `#fff" fill-opacity="${f1(b * 0.55)}` : `#000" fill-opacity="${f1(-b * 0.42)}`;
      facets += `<polygon points="${pts([o[i], o[j], t[j], t[i]])}" fill="${fill}"/>`;
    }
    const sx = Math.min(...t.map((q) => q[0])) + 3;
    const sy = Math.min(...t.map((q) => q[1])) + 1;
    return `<polygon points="${pts(o)}" fill="${g.base}"/>${facets}
      <polygon points="${pts(t)}" fill="${g.light}" fill-opacity=".55"/>
      <polygon points="${pts(o)}" fill="none" stroke="${g.dark}" stroke-width="1.3" stroke-linejoin="round"/>
      <polygon points="${pts(t)}" fill="none" stroke="${g.dark}" stroke-opacity=".5" stroke-width=".8"/>
      <path d="M${f1(sx)} ${f1(sy)} l1.1 2.4 2.4 1.1 -2.4 1.1 -1.1 2.4 -1.1 -2.4 -2.4 -1.1 2.4 -1.1z" fill="#fff" fill-opacity=".92"/>`;
  }
  const GEM_SVG = Object.fromEntries(ALL.map((c) => [c, buildGem(c)]));
  const gemSvg = (c, cls = '') => `<svg class="spgem ${cls}" viewBox="0 0 40 40" aria-hidden="true">${GEM_SVG[c]}</svg>`;

  // 보석 칩(은행·내 보석): 테두리에 칩 무늬, 가운데 보석
  const chipSvg = (c) => {
    const g = GEM[c];
    return `<svg class="spchip" viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="24" cy="24" r="23" fill="${g.dark}"/>
      <circle cx="24" cy="24" r="20.5" fill="none" stroke="${g.light}" stroke-opacity=".75" stroke-width="3.2" stroke-dasharray="5.4 5.33"/>
      <circle cx="24" cy="24" r="17.5" fill="#0006" stroke="${g.base}" stroke-width="1.2"/>
      <g transform="translate(9 9) scale(.75)">${GEM_SVG[c]}</g></svg>`;
  };

  const st = () => (ui.sp = ui.sp || { gems: [], sel: null, giveBack: {} });
  const me = () => S.players.find((p) => p.id === S.me);
  const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? esc(p.name) : '?'; };
  const gemCount = (p) => ALL.reduce((a, c) => a + (p.gems[c] || 0), 0);

  // 카드를 살 때 내가 낼 보석(서버 계산과 같은 방식, 화면 안내용)
  function payInfo(card, p) {
    const pay = {};
    let gold = 0;
    const miss = {};
    COLORS.forEach((c) => {
      const need = Math.max(0, card.cost[c] - (p.bonus[c] || 0));
      pay[c] = Math.min(p.gems[c] || 0, need);
      if (need - pay[c] > 0) miss[c] = need - pay[c];
      gold += need - pay[c];
    });
    return { pay, gold, ok: gold <= (p.gems.y || 0), short: Math.max(0, gold - (p.gems.y || 0)), miss };
  }

  const pip = (c, n, cls = '') => `<span class="sp-pip c-${c} ${cls}">${n}</span>`;
  const costPips = (cost) => COLORS.filter((c) => cost[c] > 0).map((c) => pip(c, cost[c])).join('') || '<span class="sp-free">공짜</span>';

  function cardHtml(c, o = {}) {
    const cls = ['spc', `t${c.level}`, `b-${c.bonus}`];
    if (o.sel) cls.push('sel');
    if (c.afford) cls.push('ok');
    return `<button class="${cls.join(' ')}" ${o.attrs || ''} aria-label="${c.level}단계 ${CNAME[c.bonus]} 카드 ${c.points}점${c.afford ? ', 살 수 있음' : ''}">
      <span class="spc-art">${gemSvg(c.bonus)}</span>
      <span class="spc-head"><b class="spc-pts">${c.points || ''}</b>${gemSvg(c.bonus, 'spc-bonus')}</span>
      <span class="spc-cost">${costPips(c.cost)}</span>
      <i class="spc-tier">${ROMAN[c.level]}</i>
      ${c.afford ? '<em class="spc-ok" aria-hidden="true">✓</em>' : ''}</button>`;
  }

  function deckHtml(lv, canTake) {
    const s = st();
    const sel = s.sel && s.sel.deck && s.sel.level === lv;
    const n = S.deckCounts[lv];
    return `<button class="spdeck t${lv} ${sel ? 'sel' : ''} ${n ? '' : 'empty'}" ${canTake && n ? `data-act="spDeck" data-level="${lv}"` : 'disabled'} aria-label="${lv}단계 덱 ${n}장">
      <b>${ROMAN[lv]}</b><small>${n}장</small></button>`;
  }

  // 귀족 타일. 내 보너스로 이미 채운 조건은 체크 표시
  function nobleHtml(n, o = {}) {
    const m = me();
    const chips = COLORS.filter((c) => n.req[c]).map((c) => {
      const met = m && m.bonus[c] >= n.req[c];
      return `<span class="sp-bar c-${c} ${met ? 'met' : ''}">${n.req[c]}</span>`;
    }).join('');
    const tag = o.act ? 'button' : 'div';
    return `<${tag} class="spn ${o.cls || ''}" ${o.act ? `data-act="${o.act}" data-id="${n.id}"` : ''}>
      <span class="spn-top"><svg class="spn-crown" viewBox="0 0 24 16" aria-hidden="true"><path d="M2 14 L3 4 L8 9 L12 2 L16 9 L21 4 L22 14 Z" fill="#f6d77a" stroke="#7a4f12" stroke-width="1.2" stroke-linejoin="round"/><circle cx="12" cy="10" r="1.6" fill="#e22d4b"/></svg><b>3</b></span>
      <span class="spn-req">${chips}</span><small>${esc(n.name)}</small></${tag}>`;
  }

  function bankHtml(canTake) {
    const picked = st().gems;
    return `<div class="spbank">${ALL.map((c) => {
      const n = S.bank[c];
      const times = picked.filter((x) => x === c).length;
      const act = canTake && c !== 'y' && n > 0 ? `data-act="spGem" data-c="${c}"` : '';
      return `<button class="sptok c-${c} ${times ? 'sel' : ''} ${n ? '' : 'zero'}" ${act} ${act ? '' : 'disabled'} aria-label="${GNAME[c]} ${n}개">
        ${chipSvg(c)}<b class="sptok-n">${n}</b>${times ? `<i>+${times}</i>` : ''}</button>`;
    }).join('')}</div>`;
  }

  function playerHtml(p) {
    const turn = (p.id === S.turnId && S.phase === 'play' && !S.pending) || (S.pending && S.pending.who === p.id);
    const you = p.id === S.me;
    const winner = S.winnerIds.includes(p.id);
    const cols = ALL.map((c) => {
      const b = c === 'y' ? null : p.bonus[c];
      const t = p.gems[c] || 0;
      return `<span class="spb-col ${b || t ? '' : 'none'}">
        ${c === 'y' ? '<span class="sp-bar ghost">★</span>' : `<span class="sp-bar c-${c} ${b ? '' : 'zero'}">${b}</span>`}
        <span class="sp-pip c-${c} ${t ? '' : 'zero'}">${t}</span></span>`;
    }).join('');
    return `<div class="spb ${turn ? 'turn' : ''} ${you ? 'me' : ''} ${winner ? 'win' : ''}">
      <div class="spb-h"><span class="dot ${p.connected ? '' : 'off'}"></span><b class="spb-nm">${esc(p.name)}${you ? ' (나)' : ''}</b>
        ${turn ? '<span class="spb-turn">차례</span>' : ''}${winner ? '<span class="spb-turn win">🏆 승리</span>' : ''}
        <span class="spb-pts"><small>점수</small>${p.points}</span></div>
      <div class="spb-grid">${cols}</div>
      <div class="spb-f"><span>💎 보석 <b class="${gemCount(p) >= 10 ? 'full' : ''}">${gemCount(p)}</b>/10</span><span>🂠 카드 ${p.cardCount}</span><span>📌 예약 ${p.reservedCount}/3</span><span>👑 귀족 ${p.nobles.length}</span></div></div>`;
  }

  function selectedCard() {
    const s = st().sel;
    if (!s) return null;
    if (s.reserved != null) return (me().reserved || []).find((c) => c.id === s.reserved) || null;
    if (s.deck) return { deck: true, level: s.level };
    return (S.board[s.level] || [])[s.index] || null;
  }

  const gemList = (obj) => ALL.filter((c) => obj[c] > 0).map((c) => `${pip(c, obj[c], 'sm')}`).join('');

  function dock() {
    const mode = S.mode;
    const s = st();
    const m = me();
    if (mode === 'main') {
      if (s.gems.length) {
        const two = s.gems.length === 2 && s.gems[0] === s.gems[1];
        const hint = two ? '같은 색 2개' : s.gems.length < 3 && COLORS.filter((c) => S.bank[c] > 0).length >= 3 ? `서로 다른 색 ${3 - s.gems.length}개를 더 고를 수 있어요` : '';
        return `<div class="sp-sum"><span class="sp-sum-l">가져올 보석</span><span class="sp-sum-g">${s.gems.map((c) => gemSvg(c, 'sm')).join('')}</span>${hint ? `<small>${hint}</small>` : ''}</div>
          <div class="row"><button class="primary" data-act="spTake">보석 가져오기</button><button class="ghost sp-x" data-act="spClear">취소</button></div>`;
      }
      const c = selectedCard();
      if (c) {
        const reservedFull = m.reservedCount >= 3;
        if (c.deck) {
          return `<p class="small dim center">${c.level}단계 덱 맨 위 카드를 몰래 예약해요. 무슨 카드인지는 예약한 뒤에 나만 볼 수 있어요.</p>
            <div class="row"><button class="primary" data-act="spReserve" ${reservedFull ? 'disabled' : ''}>${reservedFull ? '예약은 3장까지예요' : `덱에서 예약${S.bank.y ? ' (금 +1)' : ''}`}</button><button class="ghost sp-x" data-act="spClear">취소</button></div>`;
        }
        const isRes = s.sel.reserved != null;
        const pi = payInfo(c, m);
        const payTxt = pi.ok
          ? `<span class="sp-sum-l">낼 보석</span><span class="sp-sum-g">${gemList({ ...pi.pay, y: pi.gold }) || '<b class="sp-free">공짜! (보너스로 다 할인)</b>'}</span>`
          : `<span class="sp-sum-l bad">모자라요</span><span class="sp-sum-g">${gemList(pi.miss)}</span><small>모두 ${pi.short}개가 모자라요 · 금 보석은 아무 색 대신 쓸 수 있어요</small>`;
        return `<div class="sp-sum">${payTxt}</div>
          <div class="row">
          <button class="primary" data-act="spBuy" ${c.afford ? '' : 'disabled'}>${c.afford ? `구매하기${c.points ? ` (+${c.points}점)` : ''}` : '아직 못 사요'}</button>
          ${isRes ? '' : `<button data-act="spReserve" ${reservedFull ? 'disabled' : ''}>${reservedFull ? '예약 가득' : `예약${S.bank.y ? ' (금 +1)' : ''}`}</button>`}
        </div><button class="ghost sp-x wide" data-act="spClear">선택 취소</button>`;
      }
      return `<p class="center sp-hint">💎 보석을 누르면 가져오고, 🂠 카드를 누르면 사거나 예약할 수 있어요.</p>
        ${S.canPass ? '<button data-act="spPass">할 수 있는 게 없어요 — 차례 넘기기</button>' : ''}`;
    }
    if (mode === 'discard') {
      const need = S.pending.need;
      const given = Object.values(s.giveBack).reduce((a, b) => a + b, 0);
      const chips = ALL.filter((c) => m.gems[c] > 0).map((c) => {
        const n = s.giveBack[c] || 0;
        return `<button class="sptok c-${c} ${n ? 'sel' : ''}" data-act="spGive" data-c="${c}" aria-label="${GNAME[c]} 반납">${chipSvg(c)}<b class="sptok-n">${m.gems[c] - n}</b>${n ? `<i class="minus">-${n}</i>` : ''}</button>`;
      }).join('');
      return `<p class="center"><b>보석은 10개까지만 가질 수 있어요.</b><br><span class="small">돌려줄 보석을 눌러 ${need}개를 고르세요. (${given}/${need})</span></p>
        <div class="spbank give">${chips}</div>
        <button class="primary" data-act="spGiveOk" ${given === need ? '' : 'disabled'}>이 보석 돌려주기</button>`;
    }
    if (mode === 'noble') {
      return `<p class="center"><b>귀족이 여러 명 찾아왔어요!</b> 한 명만 모실 수 있어요.</p>
        <div class="spnobles pick">${S.nobles.filter((n) => S.pending.options.includes(n.id)).map((n) => nobleHtml(n, { act: 'spNoble' })).join('')}</div>`;
    }
    if (mode === 'wait') {
      const pd = S.pending;
      const who = pname(pd ? pd.who : S.turnId);
      const what = pd && pd.t === 'discard' ? '보석을 돌려주는 중이에요' : pd && pd.t === 'noble' ? '귀족을 고르는 중이에요' : '차례예요';
      return `<p class="center sp-wait"><span class="sp-hour">⏳</span> <b>${who}</b>님 ${what}</p>`;
    }
    return '';
  }

  function overHtml() {
    const ranked = S.players.slice().sort((a, b) => b.points - a.points || a.cardCount - b.cardCount);
    const rows = ranked.map((p, i) => `<div class="sp-rank ${S.winnerIds.includes(p.id) ? 'win' : ''}"><span>${S.winnerIds.includes(p.id) ? '🏆' : `${i + 1}위`}</span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b><small>카드 ${p.cardCount} · 귀족 ${p.nobles.length}</small><em>${p.points}점</em></div>`).join('');
    return `<div class="card panel sp-over"><h2>💎 게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>
      <div class="sp-ranks">${rows}</div>${genericOverButtons(S.hostId === S.me)}</div>`;
  }

  function renderSplendor() {
    const s = st();
    const m = me();
    const canTake = S.mode === 'main';
    const rows = [3, 2, 1].map((lv) => {
      const cards = S.board[lv].map((c, i) => (c
        ? cardHtml(c, { sel: s.sel && !s.sel.deck && s.sel.reserved == null && s.sel.level === lv && s.sel.index === i, attrs: `data-act="spCard" data-level="${lv}" data-index="${i}"` })
        : '<div class="spc empty"></div>')).join('');
      return `<div class="sprow">${deckHtml(lv, canTake)}${cards}</div>`;
    }).join('');

    const reserved = m && m.reserved && m.reserved.length
      ? `<section class="sp-sec sp-res"><div class="sp-cap">📌 내 예약 카드 <small>나만 볼 수 있어요</small></div><div class="sprow res">${m.reserved.map((c) => cardHtml(c, { sel: s.sel && s.sel.reserved === c.id, attrs: `data-act="spResCard" data-id="${c.id}"` })).join('')}</div></section>`
      : '';
    const final = S.endTrigger && S.phase === 'play' ? '<div class="banner sp-final">🏁 15점을 넘긴 사람이 있어요. 이번 라운드가 마지막이에요!</div>' : '';
    const log = S.log.length ? `<div class="ulog sp-log">${S.log.slice(-4).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    const isHost = S.hostId === S.me;
    // 내 보드는 맨 아래(조작 영역 바로 위)에
    const others = S.players.filter((p) => p.id !== S.me);

    return `<div class="spx">
    <div class="top"><span>${roomTag()}</span><span>💎 스플렌더 · ${S.turnId ? `${pname(S.turnId)}님 차례` : '게임 끝'}</span></div>
    ${final}${S.phase === 'over' ? overHtml() : ''}
    <section class="sp-sec"><div class="sp-cap">👑 귀족 <small>보너스 카드가 조건만큼 모이면 찾아와요 (+3점)</small></div>
      <div class="spnobles">${S.nobles.map((n) => nobleHtml(n)).join('') || '<span class="dim small">남은 귀족이 없어요</span>'}</div></section>
    <section class="spboard">${rows}</section>
    <section class="sp-sec"><div class="sp-cap">💰 보석 은행 <small>${canTake ? '서로 다른 색 3개 또는 같은 색 2개' : '금은 예약할 때만 받아요'}</small></div>${bankHtml(canTake)}</section>
    ${reserved}
    <div class="spplayers">${others.map(playerHtml).join('')}${m ? playerHtml(m) : ''}</div>
    ${log}
    <div class="bdock sp-dock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('지금 차례 넘기기 (자리 비운 사람)', '지금 차례인 사람의 턴을 넘길까요? (자리를 비웠을 때 쓰세요)') : ''}
    </div>`;
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
          else {
            s.gems = [];
            showToast('같은 색 2개는 은행에 그 색이 4개 이상 있을 때만 가져올 수 있어요.');
          }
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
        const same = s.sel && !s.sel.deck && s.sel.reserved == null && s.sel.level === level && s.sel.index === index;
        s.sel = same ? null : { level, index };
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
        if (!x) return true;
        if (x.reserved != null) send({ t: 'buy', reserved: x.reserved });
        else send({ t: 'buy', level: x.level, index: x.index });
        s.sel = null;
        return true;
      }
      case 'spReserve': {
        const x = s.sel;
        if (!x) return true;
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
    // 가이드(guide-splendor.js)가 쓰는 도우미
    helpers: { payInfo, me, selectedCard },
  };
}());
