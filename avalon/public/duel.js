'use strict';
// 세븐 원더스 듀얼 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)과 duel-data.js의
// DUEL_DATA를 쓰고 GAME_UI에 등록한다. 그림(카드·불가사의·군사 트랙)은 skin-duel.css와 이 파일의 SVG로 새로 그린 것이다.
(function () {
  window.GAME_UI = window.GAME_UI || {};
  const { RES, RES_NAME, COLORS, SYMS, CHAINS, TOKENS, CARD, WONDER, resText, cardDesc } = DUEL_DATA;

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
<li>카드 73장·불가사의 12개·진보 토큰 10개는 원작 구성을 따라 만들었어요(한국어 이름은 직접 옮긴 거라 정식 번역과 다를 수 있어요).</li>
</ul></details>`;

  const ROMAN = { 1: 'Ⅰ', 2: 'Ⅱ', 3: 'Ⅲ' };
  // 불가사의마다 새로 정한 상징과 배경 색조(화면용)
  const WART = {
    0: ['🔺', 38], 1: ['📚', 28], 2: ['🌿', 110], 3: ['🏟️', 12], 4: ['🗿', 200], 5: ['🗼', 190],
    6: ['⚓', 215], 7: ['🛣️', 30], 8: ['⚱️', 280], 9: ['🏛️', 48], 10: ['⚡', 255], 11: ['🦁', 40],
  };
  const COLOR_ORDER = ['brown', 'grey', 'blue', 'green', 'yellow', 'red', 'purple'];
  const RK = ['W', 'C', 'S', 'G', 'P'];

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
  const coinSvg = '<svg class="dl-coin" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#e9b949" stroke="#7a5212" stroke-width="1.4"/><circle cx="10" cy="10" r="6" fill="none" stroke="#7a5212" stroke-opacity=".55" stroke-width="1"/><path d="M4.5 7.5 A6 6 0 0 1 11 4" stroke="#fff" stroke-opacity=".7" stroke-width="1.4" fill="none" stroke-linecap="round"/></svg>';
  const coins = (n) => `<span class="dl-coins">${coinSvg}<b>${n}</b></span>`;

  function cardIcon(c) {
    if (c.res) return Object.entries(c.res).map(([k, n]) => RES[k].repeat(n)).join('');
    if (c.choice) return c.choice.map((k) => RES[k]).join('/');
    if (c.trade) return `${c.trade.map((k) => RES[k]).join('')}<small>1</small>`;
    if (c.color === 'purple') return '👑';
    if (c.shields) return '🛡️'.repeat(c.shields);
    if (c.sym) return SYMS[c.sym].icon;
    if (c.per) return `🪙<small>+</small>`;
    if (c.coins) return `🪙<small>${c.coins}</small>`;
    if (c.color === 'blue') return `<b class="dl-vp">${c.vp}</b>`;
    return '❔';
  }

  // 공개된 카드로 계산하는 생산량(화면 안내용)
  function prodOf(p) {
    const fixed = { W: 0, C: 0, S: 0, G: 0, P: 0 };
    const choice = [];
    const trade = new Set();
    p.cards.forEach((id) => {
      const c = CARD[id];
      if ((c.color === 'brown' || c.color === 'grey') && c.res) Object.entries(c.res).forEach(([k, n]) => { fixed[k] += n; });
      if (c.choice) choice.push(c.choice);
      (c.trade || []).forEach((k) => trade.add(k));
    });
    p.wonders.filter((w) => w.built && WONDER[w.id].choice).forEach((w) => choice.push(WONDER[w.id].choice));
    return { fixed, choice, trade };
  }

  // ---- 카드 설명 ----
  function cardInfoHtml(c, extra = '') {
    const col = COLORS[c.color];
    let chain = '';
    if (c.from) {
      const g = giverOf(c.from);
      chain += `<div class="dl-i-row">🔗 <span>${CHAINS[c.from]} 기호(${g ? esc(g.name) : '?'})가 있으면 <b>무료</b></span></div>`;
    }
    if (c.gives) chain += `<div class="dl-i-row dim">${CHAINS[c.gives]} <span>지으면 → ${takerOf(c.gives).map(esc).join(', ') || '없음'}을(를) 나중에 무료로</span></div>`;
    return `<div class="dl-info k-${c.color}"><div class="dl-i-h"><span class="dl-i-ico">${cardIcon(c)}</span><b>${esc(c.name)}</b><span class="dl-i-tag">${ROMAN[c.age]}시대 · ${col.name}</span></div>
      <div class="dl-i-row">💰 <span>비용 ${resText(c.cost)}</span>${extra}</div><div class="dl-i-row">✨ <span>${esc(cardDesc(c)) || '효과 없음'}</span></div>${chain}</div>`;
  }

  function wonderInfoHtml(w) {
    return `<div class="dl-info k-wonder"><div class="dl-i-h"><span class="dl-i-ico">${WART[w.id][0]}</span><b>${esc(w.name)}</b><span class="dl-i-tag">불가사의</span></div>
      <div class="dl-i-row">💰 <span>비용 ${resText(w.cost)}</span></div><div class="dl-i-row">✨ <span>${esc(w.desc)}</span></div></div>`;
  }

  function tokenInfoHtml(id) {
    const t = TOKENS[id];
    return `<div class="dl-info k-token"><div class="dl-i-h"><span class="dl-i-ico">${t.icon}</span><b>${esc(t.name)}</b><span class="dl-i-tag">진보 토큰</span></div><div class="dl-i-row">✨ <span>${esc(t.desc)}</span></div></div>`;
  }

  // ---- 시대 카드 피라미드 ----
  function pyramidHtml() {
    const s = st();
    // 위쪽 줄이 다 빠지면 남은 카드만큼 판을 위로 당긴다
    const left = S.slots.filter((x) => !x.taken);
    const top = Math.min(...left.map((x) => x.row));
    const rows = Math.max(...left.map((x) => x.row)) - top + 1;
    const STEP = 38;
    const CH = 72;
    const H = (rows - 1) * STEP + CH + 8;
    const pick = S.mode === 'pick';
    const m = me();
    const o = opp();
    const tiles = left.map((x) => {
      const lx = `calc(50% + ${(((x.x - 1) * 100) / 12).toFixed(3)}%)`;
      const style = `left:${lx};top:${(x.row - top) * STEP}px;z-index:${x.row + 1}`;
      const sel = s.focus && s.focus.kind === 'slot' && s.focus.i === x.i;
      if (x.card === null) return `<div class="dlc back a${S.age}" style="${style}"><span>${ROMAN[S.age]}</span></div>`;
      const c = CARD[x.card];
      let price = `<span class="dlc-cost">${c.from ? `🔗${CHAINS[c.from]} ` : ''}${resText(c.cost)}</span>`;
      let ok = '';
      if (pick && x.open) {
        const k = S.costs[x.i];
        ok = k.ok ? 'can' : 'cant';
        price = `<span class="dlc-price ${k.ok ? 'ok' : 'no'}">${k.chain ? '🔗무료' : k.coins ? `🪙${k.coins}` : '무료'}</span>`;
      }
      const oWin = x.open && S.phase === 'play' ? winsWith(o, c) : '';
      const mWin = x.open && S.phase === 'play' ? winsWith(m, c) : '';
      const flag = oWin ? `<i class="dlc-flag bad" aria-hidden="true">⚠️</i>` : mWin ? '<i class="dlc-flag good" aria-hidden="true">🏆</i>' : '';
      const warn = oWin ? ` (상대가 가져가면 ${oWin === 'science' ? '과학' : '군사'} 승리!)` : mWin ? ` (내가 지으면 ${mWin === 'science' ? '과학' : '군사'} 승리!)` : '';
      return `<button class="dlc k-${c.color} ${x.open ? 'open' : 'covered'} ${ok} ${sel ? 'sel' : ''} ${oWin ? 'threat' : ''}" data-act="dlSlot" data-i="${x.i}" style="${style}" aria-label="${esc(c.name)}${x.open ? '' : ' (가려짐)'}${warn}">${flag}
        <span class="dlc-band"><span class="dlc-ico">${cardIcon(c)}</span>${c.gives ? `<i class="dlc-chain">${CHAINS[c.gives]}</i>` : ''}</span>
        <span class="dlc-nm">${esc(c.name)}</span>${price}</button>`;
    }).join('');
    return `<div class="dlpyr" style="height:${H}px">${tiles}</div>`;
  }

  // ---- 지금 점수(게임이 지금 끝난다면) — 모두 공개된 정보로 서버의 점수 계산과 같은 방식 ----
  const colorCount = (p, list) => p.cards.filter((id) => list.includes(CARD[id].color)).length;
  const builtCount = (p) => p.wonders.filter((w) => w.built).length;
  function liveScore(p) {
    const o = S.players.find((x) => x.id !== p.id);
    let cards = 0;
    p.cards.forEach((id) => {
      const c = CARD[id];
      if (c.guild) {
        const g = c.guild;
        if (g.moneylend) cards += Math.floor(Math.max(p.coins, o.coins) / 3);
        else if (g.wonders) cards += g.vp * Math.max(builtCount(p), builtCount(o));
        else cards += Math.max(colorCount(p, g.colors), colorCount(o, g.colors));
      } else if (c.vp && ['blue', 'green', 'yellow'].includes(c.color)) cards += c.vp;
    });
    const wonders = p.wonders.filter((w) => w.built).reduce((a, w) => a + (WONDER[w.id].vp || 0), 0);
    let tokens = 0;
    if (p.tokens.includes('agriculture')) tokens += 4;
    if (p.tokens.includes('philosophy')) tokens += 7;
    if (p.tokens.includes('mathematics')) tokens += 3 * p.tokens.length;
    const lead = S.military * p.shieldSide;
    const military = lead >= 6 ? 10 : lead >= 3 ? 5 : lead >= 1 ? 2 : 0;
    return cards + wonders + tokens + military + Math.floor(p.coins / 3);
  }

  // ---- 즉시 승리 위협: 펼쳐진 카드 중 누군가 가져가면 바로 이기는 카드 ----
  const SCI_ALL = Object.keys(SYMS);
  const leadOf = (p) => S.military * p.shieldSide; // +면 p가 상대 수도 쪽으로 밀고 있음
  function winsWith(p, c) {
    if (!p || !c) return '';
    if (c.sym && !p.sci.includes(c.sym) && p.sci.length >= 5) return 'science';
    if (c.shields) {
      const n = c.shields + (c.color === 'red' && p.tokens.includes('strategy') ? 1 : 0);
      if (leadOf(p) + n >= 9) return 'military';
    }
    return '';
  }
  function threatList() {
    const m = me();
    const o = opp();
    if (!m || !o || S.phase !== 'play') return [];
    const out = [];
    const oLead = leadOf(o);
    const mLead = leadOf(m);
    const visible = S.slots.filter((x) => x.open && x.card !== null);
    const oWin = visible.filter((x) => winsWith(o, CARD[x.card]));
    const mWin = visible.filter((x) => winsWith(m, CARD[x.card]));
    if (o.sci.length >= 5) {
      const needList = SCI_ALL.filter((k) => !o.sci.includes(k) && k !== 'law');
      const need = needList.map((k) => SYMS[k].icon).join('') + (needList.length > 1 ? ' 중 하나' : ' 하나');
      out.push({ bad: true, text: `<b>${esc(o.name)}님 과학 ${o.sci.length}종!</b> ${need}면 과학 승리${oWin.length ? ' · ⚠️ 카드를 먼저 가져가요' : ''}` });
    }
    if (oLead >= 5) out.push({ bad: true, text: `<b>내 수도까지 ${9 - oLead}칸!</b> 방패 ${9 - oLead}개면 군사 패배${oWin.some((x) => CARD[x.card].shields) ? ' · ⚠️ 빨강 카드를 먼저 가져가요' : ' · 빨강 카드로 밀어내요'}` });
    else if (oWin.length && o.sci.length < 5) out.push({ bad: true, text: `<b>⚠️ 표시 카드</b>를 상대가 가져가면 바로 져요` });
    if (m.sci.length >= 5) out.push({ bad: false, text: `<b>내 과학 ${m.sci.length}종!</b> 새 기호 하나면 과학 승리${mWin.some((x) => CARD[x.card].sym) ? ' · 🏆 카드를 노려요' : ''}` });
    if (mLead >= 5) out.push({ bad: false, text: `<b>상대 수도까지 ${9 - mLead}칸!</b> 방패 ${9 - mLead}개면 군사 승리${mWin.some((x) => CARD[x.card].shields) ? ' · 🏆 카드를 노려요' : ''}` });
    return out;
  }

  // ---- 군사 트랙 ----
  function trackHtml() {
    const [a, b] = S.players;
    const loot = { '-6': 5, '-3': 2, 3: 2, 6: 5 };
    const cells = [];
    for (let p = -9; p <= 9; p++) {
      const ab = Math.abs(p);
      const zone = ab === 9 ? 'cap' : ab >= 6 ? 'z3' : ab >= 3 ? 'z2' : ab >= 1 ? 'z1' : 'z0';
      const side = p < 0 ? 'l' : p > 0 ? 'r' : '';
      const here = p === S.military;
      const pawn = here ? '<i class="dl-pawn" aria-hidden="true"><svg viewBox="0 0 16 22"><path d="M8 1 L14 9 L8 21 L2 9 Z" fill="#ff5a3c" stroke="#3a0a00" stroke-width="1.3" stroke-linejoin="round"/><path d="M8 1 L8 21 M2 9 L14 9" stroke="#ffd2a8" stroke-opacity=".7" stroke-width=".8"/></svg></i>' : '';
      const key = p > 0 ? `+${p}` : String(p);
      const coin = loot[p] && !S.milTokens[key] && !here ? `<span class="dl-loot" title="여기 닿으면 상대 동전 −${loot[p]}">${loot[p]}</span>` : '';
      const inner = ab === 9 ? `<span class="dl-castle" style="--pc:${p < 0 ? a.color : b.color}">🏰</span>` : p === 0 && !here ? '<span class="dl-mid">◆</span>' : '';
      cells.push(`<div class="dl-tc ${zone} ${side}">${inner}${coin}${pawn}</div>`);
    }
    const zl = (from, to, txt) => `<span class="dl-zl" style="grid-column:${from} / ${to}">${txt}</span>`;
    const zones = [zl(2, 5, '10점'), zl(5, 8, '5점'), zl(8, 10, '2점'), zl(11, 13, '2점'), zl(13, 16, '5점'), zl(16, 19, '10점')].join('');
    const lead = S.military === 0 ? '팽팽해요' : `<b style="--pc:${(S.military > 0 ? a : b).color}">${esc((S.military > 0 ? a : b).name)}</b> ${Math.abs(S.military)}칸 우세`;
    return `<section class="dl-mil" aria-label="군사 트랙, ${S.military === 0 ? '균형' : `${esc((S.military > 0 ? a : b).name)} ${Math.abs(S.military)}칸 우세`}">
      <div class="dl-mil-h"><span style="--pc:${a.color}">🏰 ${esc(a.name)}</span><em>⚔️ ${lead}</em><span style="--pc:${b.color}">${esc(b.name)} 🏰</span></div>
      <div class="dl-track">${cells.join('')}</div>
      <div class="dl-zones">${zones}</div></section>`;
  }

  function sciCounts(p) {
    const n = {};
    p.cards.forEach((id) => { const s = CARD[id].sym; if (s) n[s] = (n[s] || 0) + 1; });
    return n;
  }

  function playerBar(p) {
    const you = p.id === S.me;
    const turn = p.id === S.turnId || (S.pend && S.pend.playerId === p.id) || (S.draft && S.draft.pickerId === p.id) || S.chooserId === p.id;
    const acting = S.phase !== 'over' && turn;
    const n = sciCounts(p);
    const sci = p.sci.map((k) => `<i class="${n[k] >= 2 ? 'pair' : ''}" title="${SYMS[k].name}${n[k] >= 2 ? ' 2장' : ''}">${SYMS[k].icon}</i>`).join('');
    const toks = p.tokens.map((t) => `<button class="dl-tk sm" data-act="dlInfo" data-kind="token" data-id="${t}" aria-label="${esc(TOKENS[t].name)}">${TOKENS[t].icon}</button>`).join('');
    const counts = COLOR_ORDER.map((k) => {
      const c = p.cards.filter((id) => CARD[id].color === k).length;
      return c ? `<span class="dl-cnt k-${k}" title="${COLORS[k].name} ${c}장">${c}</span>` : '';
    }).join('');
    const sciWarn = p.sci.length >= 5 ? 'warn' : '';
    const vp = S.phase === 'over' && S.result ? S.result.scores[p.id].total : liveScore(p);
    const doing = !acting ? '' : S.phase === 'draft' ? '고르는 중' : S.phase === 'chooseStart' ? '선택 중' : S.pend ? '선택 중' : '차례';
    return `<div class="dlp ${acting ? 'turn' : ''} ${you ? 'me' : ''} ${S.winnerIds.includes(p.id) ? 'win' : ''}" style="--pc:${p.color}">
      <div class="dlp-h"><span class="dot ${p.connected ? '' : 'off'}"></span><b class="dlp-nm">${esc(p.name)}</b>${you ? '<small class="dlp-me">나</small>' : ''}${doing ? `<span class="dlp-turn">${doing}</span>` : ''}${S.winnerIds.includes(p.id) ? '<span class="dlp-win">🏆</span>' : ''}</div>
      <div class="dlp-st">
        <span class="dls" title="동전">${coinSvg}<b>${p.coins}</b></span>
        <span class="dls vp" title="${S.phase === 'over' ? '최종 점수' : '지금 끝나면 받을 점수'}"><i>🏆</i><b>${vp}</b></span>
        <span class="dls sci ${sciWarn}" title="서로 다른 과학 기호"><i>🔬</i><b>${p.sci.length}</b><small>/6</small></span></div>
      <div class="dlp-r">${counts ? `<span class="dl-cnts">${counts}</span>` : '<span class="dlp-none">건물 없음</span>'}<span class="dlp-w" title="지은 불가사의">🏛️${builtCount(p)}/${p.wonders.length}</span></div>
      ${sci || toks ? `<div class="dlp-sci ${sciWarn}">${sci}${toks ? `<span class="dl-tks">${toks}</span>` : ''}</div>` : ''}</div>`;
  }

  function wonderHtml(p, w, you) {
    const W = WONDER[w.id];
    const [glyph, hue] = WART[w.id];
    const cls = w.built ? 'built' : w.lost ? 'lost' : '';
    const c = you && !w.built && !w.lost ? S.wonderCosts[w.id] : null;
    const price = c ? `<em class="dl-wprice ${c.ok ? 'ok' : 'no'}">${c.coins ? `🪙${c.coins}` : '무료'}</em>` : '';
    const state = w.built ? '<span class="dl-wst">✅ 완성</span>' : w.lost ? '<span class="dl-wst">✖ 지을 수 없음</span>' : `<span class="dl-wcost">${resText(W.cost)}</span>`;
    return `<button class="dlw ${cls}" style="--wh:${hue}" data-act="dlInfo" data-kind="wonder" data-id="${w.id}">
      <span class="dlw-g">${glyph}</span><span class="dlw-t"><b>${esc(W.name)}</b><small>${esc(W.desc)}</small>${state}</span>${price}</button>`;
  }

  function prodHtml(p, you) {
    const o = S.players.find((x) => x.id !== p.id);
    const { fixed, choice, trade } = prodOf(p);
    const op = prodOf(o).fixed;
    const fx = RK.filter((k) => fixed[k]).map((k) => `<span>${RES[k]}${fixed[k]}</span>`).join('');
    const ch = choice.map((list) => `<span class="ch">${list.map((k) => RES[k]).join('/')}</span>`).join('');
    const buy = you ? `<div class="dl-prod buy"><b>사 오는 값</b>${RK.map((k) => `<span title="${RES_NAME[k]}">${RES[k]}<small>${trade.has(k) ? 1 : 2 + op[k]}</small></span>`).join('')}</div>` : '';
    return `<div class="dl-prod"><b>생산</b>${fx || ch ? fx + ch : '<span class="dim">없음</span>'}</div>${buy}`;
  }

  function cityHtml(p) {
    const you = p.id === S.me;
    const wonders = p.wonders.map((w) => wonderHtml(p, w, you)).join('');
    const groups = COLOR_ORDER.map((k) => {
      const list = p.cards.map((id) => CARD[id]).filter((c) => c.color === k);
      if (!list.length) return '';
      return `<div class="dl-grp">${list.map((c) => `<button class="dl-chip k-${c.color}" data-act="dlInfo" data-kind="card" data-id="${c.id}"><span>${cardIcon(c)}</span>${esc(c.name)}</button>`).join('')}</div>`;
    }).join('');
    return `<section class="dl-city ${you ? 'me' : ''}" style="--pc:${p.color}">
      <div class="dl-city-h"><b>${esc(p.name)}${you ? ' (나)' : ''}의 도시</b><span class="dim small">불가사의 ${p.wonders.filter((w) => w.built).length}개 완성</span></div>
      ${prodHtml(p, you)}
      <div class="dlws">${wonders}</div>
      <div class="dl-grps">${groups || '<span class="dim small">아직 지은 건물이 없어요</span>'}</div></section>`;
  }

  function draftHtml() {
    const mine = S.mode === 'draft';
    const items = S.draft.pool.map((id) => {
      const W = WONDER[id];
      const [glyph, hue] = WART[id];
      return `<button class="dlw big" style="--wh:${hue}" ${mine ? `data-act="dlDraft" data-id="${id}"` : 'disabled'}>
        <span class="dlw-g">${glyph}</span><span class="dlw-t"><b>${esc(W.name)}</b><small>${esc(W.desc)}</small><span class="dl-wcost">비용 ${resText(W.cost)}</span></span></button>`;
    }).join('');
    return `<section class="card panel dl-draft"><h2>🏛️ 불가사의 고르기 <small>${S.draft.set + 1}/2묶음</small></h2>
      <p class="small dim">${mine ? '<b class="dl-hot">내 차례!</b> 가져갈 불가사의를 하나 누르세요.' : `${pname(S.draft.pickerId)}님이 고르는 중이에요.`} 마지막 한 장은 자동으로 정해져요.</p>
      <div class="dl-draft-list">${items}</div></section>`;
  }

  function overHtml() {
    const isHost = S.hostId === S.me;
    const reason = { military: '⚔️ 군사 승리 — 상대 수도를 점령했어요!', science: '🔬 과학 승리 — 서로 다른 과학 기호 6종!', points: '🏛️ 점수 승리', tie: '🤝 동점 (공동 우승)' }[S.reason];
    const rows = [['blue', '🔵 시민'], ['green', '🟢 과학'], ['yellow', '🟡 상업'], ['purple', '🟣 길드'], ['wonders', '🏛️ 불가사의'], ['tokens', '🧪 진보 토큰'], ['military', '⚔️ 군사'], ['coins', '🪙 동전']];
    const [a, b] = S.players;
    const sa = S.result.scores[a.id];
    const sb = S.result.scores[b.id];
    const table = rows.map(([k, n]) => `<div class="drow"><span>${sa[k]}</span><span class="dim">${n}</span><span>${sb[k]}</span></div>`).join('');
    return `<section class="card panel dl-over"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')}</p><p class="center">${reason}</p>
      <div class="drow head"><b>${esc(a.name)}</b><span></span><b>${esc(b.name)}</b></div>${table}
      <div class="drow total"><b>${sa.total}</b><span class="dim">합계</span><b>${sb.total}</b></div>
      ${S.reason === 'military' || S.reason === 'science' ? '<p class="small dim center">즉시 승리라서 점수와 상관없이 이겼어요.</p>' : ''}
      ${S.reason === 'points' && sa.total === sb.total ? '<p class="small dim center">합계가 같아서 시민(파랑) 점수가 높은 쪽이 이겼어요.</p>' : ''}
      ${genericOverButtons(isHost)}</section>`;
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
      const covered = f && f.kind === 'slot' ? '<b>이 카드는 다른 카드에 가려져 있어서 아직 못 가져와요.</b><br>' : '';
      return `<p class="center dl-hint">${covered}👆 <b>금빛 테두리</b> 카드를 눌러요<br><span class="small">가격표 초록 = 지을 수 있음 · 빨강 = 동전 부족</span></p>`;
    }
    const k = S.costs[f.i];
    if (s.wpick) {
      const list = me().wonders.filter((w) => !w.built && !w.lost).map((w) => {
        const c = S.wonderCosts[w.id];
        return `<button class="dl-wbtn" ${c.ok ? '' : 'disabled'} data-act="dlWonder" data-w="${w.id}"><span>${WART[w.id][0]}</span><b>${esc(WONDER[w.id].name)}</b><em>${c.coins ? `🪙${c.coins}` : '무료'}${c.ok ? '' : ' · 동전 부족'}</em></button>`;
      }).join('') || '<p class="dim center">지을 수 있는 불가사의가 없어요.</p>';
      return `<div class="dact"><p class="small center">어느 불가사의를 지을까요? 이 카드는 불가사의 밑에 깔려요.</p>${list}<button class="ghost" data-act="dlWback">뒤로</button></div>`;
    }
    const canW = Object.keys(S.wonderCosts).length;
    return `<div class="dact row3 dl-acts">
      <button class="primary" ${k.ok ? '' : 'disabled'} data-act="dlBuild"><span>🏗️</span>건설<small>${k.ok ? (k.chain ? '연계 무료' : k.coins ? `🪙${k.coins}` : '무료') : `🪙${k.coins} 필요`}</small></button>
      <button data-act="dlDiscard"><span>♻️</span>버리기<small>🪙+${S.discardGain}</small></button>
      <button data-act="dlWpick" ${canW ? '' : 'disabled'}><span>🏛️</span>불가사의<small>${canW ? '짓기' : '없음'}</small></button></div>`;
  }

  function pendHtml() {
    const pe = S.pend;
    const mine = S.mode === pe.type;
    if (!mine) return `<p class="center dim">${pname(pe.playerId)}님이 고르는 중이에요…</p>`;
    if (pe.type === 'token' || pe.type === 'library') {
      const items = pe.options.map((t) => `<button class="dl-tkpick" data-act="dlToken" data-t="${t}"><span class="dl-tk">${TOKENS[t].icon}</span><span><b>${esc(TOKENS[t].name)}</b><small>${esc(TOKENS[t].desc)}</small></span></button>`).join('');
      return `<div class="dact"><p class="center"><b>${pe.type === 'library' ? '📚 대도서관: 진보 토큰을 하나 고르세요' : '🔬 같은 과학 기호 한 쌍! 진보 토큰을 고르세요'}</b></p>${items}</div>`;
    }
    const title = pe.type === 'destroy' ? `💥 상대의 ${COLORS[pe.color].name} 카드 하나를 파괴하세요` : '⚱️ 버려진 카드 하나를 무료로 지으세요';
    const items = pe.options.map((id) => {
      const c = CARD[id];
      return `<button class="dl-cpick k-${c.color}" data-act="dlCard" data-c="${id}"><span class="dl-i-ico">${cardIcon(c)}</span><span><b>${esc(c.name)}</b> <small class="dim">${ROMAN[c.age]}시대</small><small>${esc(cardDesc(c))}</small></span></button>`;
    }).join('');
    return `<div class="dact"><p class="center"><b>${title}</b></p>${items}</div>`;
  }

  function dock() {
    if (S.mode === 'over') return '';
    if (S.mode === 'draft') return '<p class="center dl-hint">👆 위에서 불가사의를 하나 골라요</p>';
    if (S.mode === 'chooseStart') {
      return `<div class="dact"><p class="center"><b>${ROMAN[S.age + 1]}시대를 누가 먼저 시작할까요?</b></p><div class="row"><button class="primary" data-act="dlStart" data-who="me">내가 먼저</button><button data-act="dlStart" data-who="opp">상대가 먼저</button></div></div>`;
    }
    if (S.pend) return pendHtml();
    if (S.mode === 'pick') return actionsHtml();
    if (S.phase === 'chooseStart') return `<p class="center dim">${pname(S.chooserId)}님이 다음 시대의 시작 플레이어를 고르는 중이에요…</p>`;
    if (S.phase === 'draft') return `<p class="center dim">${pname(S.draft.pickerId)}님이 불가사의를 고르는 중이에요…</p>`;
    return `<p class="center dim"><span class="dl-hour">⏳</span> ${pname(S.turnId)}님 차례예요</p>`;
  }

  function renderDuel() {
    const isHost = S.hostId === S.me;
    const [a, b] = S.players;
    const mine = me();
    const other = opp();
    const log = S.log.length ? `<section class="dl-logs"><div class="dl-cap">📜 최근 기록</div><div class="ulog dl-log">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div></section>` : '';
    const news = S.log.length && S.phase !== 'over' ? `<div class="dl-news" aria-live="polite"><span>📣</span><span>${esc(S.log[S.log.length - 1])}</span></div>` : '';
    const tokens = S.boardTokens.length && S.phase !== 'draft'
      ? `<section class="dl-toks" aria-label="진보 토큰"><span class="dl-toks-l">🧪 진보 토큰<small>같은 과학 기호 2장이면 1개</small></span>
        <div class="dl-tkrow">${S.boardTokens.map((t) => `<button class="dl-tkb" data-act="dlInfo" data-kind="token" data-id="${t}" aria-label="진보 토큰 ${esc(TOKENS[t].name)}"><span class="dl-tk">${TOKENS[t].icon}</span></button>`).join('')}</div></section>` : '';
    let board = '';
    if (S.phase === 'play' || S.phase === 'chooseStart' || S.phase === 'over') {
      const left = S.slots.filter((x) => !x.taken).length;
      const canN = S.mode === 'pick' ? Object.values(S.costs).filter((k) => k.ok).length : 0;
      const cap = S.mode === 'pick' ? ` · <b class="${canN ? 'dl-okn' : 'dl-non'}">지을 수 있는 카드 ${canN}장</b>` : '';
      board = left ? `<section class="dl-age"><div class="dl-cap">🃏 ${ROMAN[S.age]}시대 <small>남은 ${left}장 · 버린 카드 ${S.discard.length}장${cap}</small></div>${pyramidHtml()}</section>` : '';
      if (S.phase === 'chooseStart') board += `<div class="dl-agebanner"><b>${ROMAN[S.age]}시대 끝!</b><span>곧 ${ROMAN[S.age + 1]}시대가 시작돼요${S.age + 1 === 3 ? ' · 보라색 길드 카드가 섞여 있어요' : ''}</span></div>`;
    }
    const tl = threatList();
    const threats = tl.length ? `<div class="dl-threats" role="status">${tl.map((t) => `<div class="dl-threat ${t.bad ? 'bad' : 'good'}"><span>${t.bad ? '🚨' : '🎯'}</span><span>${t.text}</span></div>`).join('')}</div>` : '';
    const status = S.phase === 'over' ? '게임 끝'
      : S.phase === 'draft' ? `불가사의 고르기 ${S.draft.set + 1}/2`
        : S.phase === 'chooseStart' ? `${ROMAN[S.age]}시대 끝`
          : `${ROMAN[S.age]}시대 · ${S.mode === 'pick' || (S.pend && S.pend.playerId === S.me) ? '<b class="dl-mine">내 차례</b>' : `${pname(S.pend ? S.pend.playerId : S.turnId)}님 차례`}`;
    return `<div class="dlx">
    <div class="top"><span>${roomTag()}</span><span class="dl-topst">🏛️ ${status}${isHost ? '<button class="dl-hostbtn" data-act="hostmenu" aria-label="방장 메뉴">⚙</button>' : ''}</span></div>
    ${S.phase === 'over' ? overHtml() : ''}
    <div class="dlps">${playerBar(a)}${playerBar(b)}</div>
    ${S.phase === 'draft' ? draftHtml() : ''}
    ${threats}
    ${trackHtml()}
    ${news}
    ${board}
    ${tokens}
    ${mine ? cityHtml(mine) : ''}
    ${other ? cityHtml(other) : ''}
    ${log}
    <div class="bdock dl-dock">
      ${S.mode === 'pick' || st().focus ? focusHtml() : ''}
      ${dock()}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (자동으로 한 수 진행)', '자리를 비운 사람 대신 한 수 진행할까요? (카드를 버려 동전을 받거나 첫 번째 선택지를 골라요)') : ''}
    </div>`;
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

  // 군사 말이 움직였으면 이전 칸에서 미끄러지듯 옮겨 준다
  let lastMil = null;
  function afterRender() {
    if (!S || S.kind !== 'duel' || S.phase === 'lobby') { lastMil = null; return; }
    const key = `${S.code}:${S.gameNo}`;
    const pawn = document.querySelector('.dlx .dl-pawn');
    if (pawn && lastMil && lastMil.key === key && lastMil.v !== S.military && pawn.animate
      && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      const cell = pawn.parentElement.getBoundingClientRect().width + 1;
      pawn.animate([{ transform: `translateX(${(lastMil.v - S.military) * cell}px)` }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    lastMil = { key, v: S.military };
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
      case 'dlBuild': if (s.focus) send({ t: 'build', slot: s.focus.i }); s.focus = null; return true;
      case 'dlDiscard': if (s.focus) send({ t: 'discard', slot: s.focus.i }); s.focus = null; return true;
      case 'dlWonder': if (s.focus) send({ t: 'wonder', slot: s.focus.i, wonder: Number(el.dataset.w) }); s.focus = null; s.wpick = false; return true;
      case 'dlDraft': send({ t: 'draftWonder', wonder: Number(el.dataset.id) }); return true;
      case 'dlToken': send({ t: 'choose', token: el.dataset.t }); return true;
      case 'dlCard': send({ t: 'choose', card: Number(el.dataset.c) }); return true;
      case 'dlStart': send({ t: 'startWith', who: el.dataset.who }); return true;
      default: return false;
    }
  }

  window.GAME_UI.duel = {
    name: '세븐 원더스 듀얼', label: '🏛️ 세븐 원더스 듀얼', range: '2명', rules: RULES, render: renderDuel, sync, click, afterRender,
    helpers: { prodOf, liveScore, threatList, winsWith },
  };
}());
