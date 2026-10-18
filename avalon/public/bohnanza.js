'use strict';
// 보난자 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)과 bohnanza-data.js의
// BOHNANZA_DATA를 쓰고 GAME_UI에 등록한다. 꾸미기는 skin-bohnanza.css (bz- 로 시작하는 클래스).
(function () {
  window.GAME_UI = window.GAME_UI || {};
  const { BEANS } = BOHNANZA_DATA;

  const RULES = `
<details><summary>보난자 규칙 간단 설명</summary>
<p><b>3~5명</b> · 콩을 심고 수확해서 <b>코인</b>을 모아요. 코인이 가장 많은 사람이 이겨요. (3명이면 커피콩을 빼요)</p>
<ul>
<li><b>손패 순서는 바꿀 수 없어요.</b> 새 카드는 맨 뒤에 붙고, 내 차례에 <b>맨 앞 카드를 반드시 심어요</b>(원하면 그다음 카드도 하나 더).</li>
<li>한 밭에는 <b>같은 종류의 콩</b>만 심을 수 있어요. 다른 콩을 심으려면 그 밭을 먼저 <b>수확</b>해야 해요. 밭은 처음에 2개, 코인 3개를 내면 3번째 밭을 살 수 있어요.</li>
<li><b>수확</b>: 밭을 누르면 콩이 코인으로 바뀌어요. 콩 수가 많을수록 코인이 많아요(카드 아래 <b>콩 계량표</b>: 🪙 위 숫자 = 코인, 아래 숫자 = 필요한 콩 수). 남은 콩은 버려요. 수확은 언제든 할 수 있지만, 콩이 1개뿐인 밭은 다른 밭에 2개 이상 있으면 수확할 수 없어요.</li>
<li>내 차례에 카드 2장이 펼쳐져요. 펼친 카드와 내 손패 중 <b>내놓을 카드</b>를 공개하면, 다른 사람이 <b>제안</b>(줄 카드 ↔ 받고 싶은 카드)을 해요. 마음에 드는 제안을 <b>수락</b>하면 교환돼요. 다른 사람끼리는 거래할 수 없어요.</li>
<li>거래로 받은 카드와 거래하지 않은 펼친 카드는 <b>모두 바로 심어야</b> 해요. 그다음 덱에서 3장을 뽑아 손패 뒤에 붙여요.</li>
<li><b>덱이 3번 바닥나면</b> 게임이 끝나요. 모두 밭을 수확하고, 코인이 가장 많은 사람이 승리!</li>
</ul></details>`;

  const st = () => (ui.bz = ui.bz || { give: [], want: [], table: null });
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const me = () => player(S.me);
  const tname = (t) => BEANS[t].name;
  // 받침에 따라 조사 고르기 (대두를 / 녹색콩을)
  const josa = (w, a, b) => { const c = w.charCodeAt(w.length - 1) - 0xac00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); };

  // ---- 콩 캐릭터 (직접 그린 SVG) ----

  // 밝은 콩 색 위에는 진한 글씨를 쓴다
  function lightColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16; const g = (n >> 8) & 255; const b = n & 255;
    return 0.299 * r + 0.587 * g + 0.114 * b > 165;
  }
  const beanVars = (t) => `--bc:${BEANS[t].color};--ink:${lightColor(BEANS[t].color) ? '#2b1d14' : '#fff'}`;

  const D = '#2b1d14';
  const EYES = {
    dot: `<circle cx="28" cy="31" r="3.3" fill="${D}"/><circle cx="41" cy="31" r="3.3" fill="${D}"/><circle cx="29.2" cy="29.8" r="1.1" fill="#fff"/><circle cx="42.2" cy="29.8" r="1.1" fill="#fff"/>`,
    big: `<circle cx="28" cy="30" r="5.2" fill="#fff" stroke="${D}" stroke-width="1.2"/><circle cx="41" cy="30" r="5.2" fill="#fff" stroke="${D}" stroke-width="1.2"/><circle cx="28.8" cy="31" r="2.9" fill="${D}"/><circle cx="41.8" cy="31" r="2.9" fill="${D}"/><circle cx="29.8" cy="29.8" r="1" fill="#fff"/><circle cx="42.8" cy="29.8" r="1" fill="#fff"/>`,
    happy: `<path d="M24.5 32Q28 27 31.5 32M37.5 32Q41 27 44.5 32" fill="none" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/>`,
    sleepy: `<path d="M24.5 30Q28 34 31.5 30M37.5 30Q41 34 44.5 30" fill="none" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/>`,
    angry: `<circle cx="28" cy="32" r="3.1" fill="${D}"/><circle cx="41" cy="32" r="3.1" fill="${D}"/><path d="M23.5 25.5L31.5 28.5M45.5 25.5L37.5 28.5" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/>`,
    squint: `<path d="M25 27.5L30.5 31L25 34.5M44 27.5L38.5 31L44 34.5" fill="none" stroke="${D}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    patch: `<ellipse cx="28" cy="31" rx="7.4" ry="6.8" fill="#1d1b22"/><circle cx="28" cy="31" r="3" fill="#fff"/><circle cx="28.6" cy="31.4" r="1.6" fill="${D}"/><circle cx="41" cy="31" r="3.2" fill="${D}"/><circle cx="42.1" cy="29.9" r="1" fill="#fff"/>`,
  };
  const MOUTH = {
    smile: `<path d="M30 39Q34.5 44.5 39 39" fill="none" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/>`,
    grin: `<path d="M29.3 38.3Q34.5 47 39.7 38.3Z" fill="#7a2420" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>`,
    o: `<ellipse cx="34.5" cy="41" rx="2.5" ry="3.1" fill="${D}"/>`,
    flat: `<path d="M30.5 41.5L38.5 40.5" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/>`,
    wavy: `<path d="M29 41Q31 38.8 33 41T37 41T41 41" fill="none" stroke="${D}" stroke-width="2.2" stroke-linecap="round"/>`,
    small: `<path d="M32 40Q34.5 43 37 40" fill="none" stroke="${D}" stroke-width="2.2" stroke-linecap="round"/>`,
    smirk: `<path d="M30.5 41Q36 43.5 39.5 38.5" fill="none" stroke="${D}" stroke-width="2.4" stroke-linecap="round"/>`,
  };
  const ACC = {
    steam: '<path d="M27 11q-3-3 0-6t0-5M34.5 10q-3-3.5 0-7t0-3M42 11q-3-3 0-6" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.2" stroke-linecap="round"/>',
    shine: '<path d="M53 3L55 9.5L61 11.5L55 13.5L53 20L51 13.5L45 11.5L51 9.5Z" fill="#fff7c2" stroke="#b58a12" stroke-width=".8"/>',
    drop: '<path d="M55 6C58.5 11.5 59.5 13.5 59.5 16A4.5 4.5 0 0 1 50.5 16C50.5 13.5 51.5 11.5 55 6Z" fill="#a8dcff" stroke="#2a5fa8" stroke-width="1.1"/>',
    flame: '<path d="M35 0C39.5 5 41.5 8.5 39.5 12.8C38.4 15 36.5 16 35 16C31.6 16 29.5 13.8 29.5 10.8C29.5 7.8 31.5 5.5 32.5 3.8C33.4 6.8 34.5 7.8 35.8 7.8C36 5.8 35.8 3.5 35 0Z" fill="#ffb02e" stroke="#c4380f" stroke-width="1.3"/>',
    stink: '<path d="M4.5 21q3.5 3 0 6t0 6M59.5 25q-3.5 3 0 6t0 6" fill="none" stroke="#b6e05a" stroke-width="2.4" stroke-linecap="round"/><circle cx="8" cy="15" r="1.6" fill="#b6e05a"/>',
    leaf: '<path d="M34 11C36 3 46 0 51 2C49 8.5 42.5 12.5 34 11Z" fill="#8be35f" stroke="#1f5e2a" stroke-width="1.3"/><path d="M35.5 10Q42 6.5 48.5 3.5" fill="none" stroke="#1f5e2a" stroke-width="1"/>',
    sprout: '<path d="M34 14V5" stroke="#2f7a2f" stroke-width="2" stroke-linecap="round"/><path d="M34 7.5C30 2.5 24.5 3 23.5 5.2C26.5 8.8 31 8.8 34 7.5Z" fill="#7fd45a" stroke="#2f7a2f" stroke-width="1.1"/><path d="M34 6.5C37 1.5 43 1.2 44.2 3.4C41.2 7.4 37 7.6 34 6.5Z" fill="#9be36d" stroke="#2f7a2f" stroke-width="1.1"/>',
    heart: '<path d="M54 19C46.5 14 47.2 7.5 51.4 7.5C53 7.5 53.6 8.6 54 9.6C54.4 8.6 55 7.5 56.6 7.5C60.8 7.5 61.5 14 54 19Z" fill="#ff5c7a" stroke="#9c1d3a" stroke-width="1"/>',
    flower: '<g stroke="#c9631c" stroke-width=".9"><circle cx="36" cy="2.8" r="3.3" fill="#fff"/><circle cx="39.4" cy="5.3" r="3.3" fill="#fff"/><circle cx="38.1" cy="9.2" r="3.3" fill="#fff"/><circle cx="33.9" cy="9.2" r="3.3" fill="#fff"/><circle cx="32.6" cy="5.3" r="3.3" fill="#fff"/><circle cx="36" cy="6.2" r="2.6" fill="#ffcc33"/></g>',
  };
  const BODY = 'M20 15C29 7 47 9 53 22C59 35 54 51 40 56C27 60 13 53 10 41C9 34 15 32 16 27C17 22 14 19 20 15Z';
  const svgCache = {};
  function beanSvg(type) {
    if (svgCache[type]) return svgCache[type];
    const f = BEANS[type].face || {};
    const cheeks = f.cheeks ? '<ellipse cx="22.5" cy="38" rx="3.4" ry="2.2" fill="#ff7b9c" opacity=".6"/><ellipse cx="46.5" cy="38" rx="3.4" ry="2.2" fill="#ff7b9c" opacity=".6"/>' : '';
    svgCache[type] = `<svg class="bz-bean" viewBox="0 0 64 64" aria-hidden="true">
      <path class="bz-bean-b" d="${BODY}"/>
      <path d="M14 43C20 53 33 57 44 52" fill="none" stroke="#000" stroke-opacity=".16" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="38" cy="19.5" rx="9" ry="3.4" transform="rotate(18 38 19.5)" fill="#fff" opacity=".42"/>
      ${EYES[f.eyes] || EYES.dot}${MOUTH[f.mouth] || MOUTH.smile}${cheeks}${ACC[f.acc] || ''}</svg>`;
    return svgCache[type];
  }

  const coin = (n, cls = '') => `<span class="bz-coin ${cls}">${n === undefined ? '' : n}</span>`;

  // 콩 계량표: 위는 받는 코인, 아래는 필요한 콩 수. count를 주면 이미 채운 칸을 밝힌다
  function meterHtml(type, count) {
    const meter = BEANS[type].meter;
    const nextIdx = count === undefined ? -1 : meter.findIndex(([need]) => need > count);
    return `<span class="bz-meter">${meter.map(([need, c], i) => {
      const cls = count === undefined ? '' : count >= need ? 'on' : i === nextIdx ? 'next' : '';
      return `<i class="${cls}"><b>${c}</b><s>${need}</s></i>`;
    }).join('')}</span>`;
  }

  // 콩 카드. o: { act, sel, tag, tagCls, no, size('sm'|'lg'), front, dim }
  function bean(c, o = {}) {
    const b = BEANS[c.type];
    const cls = ['bz-card', `bt-${c.type}`];
    if (o.size) cls.push(o.size);
    if (o.sel) cls.push('sel');
    if (o.front) cls.push('front');
    if (o.next) cls.push('next');
    if (o.dim) cls.push('dim');
    const inner = `${o.tag ? `<em class="bz-tag ${o.tagCls || ''}">${o.tag}</em>` : ''}${o.no ? `<span class="bz-no">${o.no}</span>` : ''}
      <span class="bz-card-nm">${b.name}</span>
      <span class="bz-card-art">${beanSvg(c.type)}<span class="bz-card-n" title="덱에 있는 이 콩 카드 수">${b.n}</span></span>
      ${o.size === 'sm' ? '' : meterHtml(c.type)}`;
    const style = `style="${beanVars(c.type)}"`;
    return o.act
      ? `<button class="${cls.join(' ')}" ${style} data-act="${o.act}" data-id="${c.id}" aria-pressed="${o.sel ? 'true' : 'false'}">${inner}</button>`
      : `<div class="${cls.join(' ')}" ${style}>${inner}</div>`;
  }

  function nextHint(f) {
    const next = BEANS[f.type].meter.find(([need]) => need > f.count);
    return next ? `${next[0] - f.count}개 더 → ${coin(next[1], 'xs')}` : '최고 단계!';
  }

  // 내 밭(흙 밭). 콩이 있으면 눌러서 수확한다
  function plot(f, i, mine) {
    const playing = S.phase === 'play';
    const act = mine && playing && f.count ? `data-act="bzHarvest" data-i="${i}"` : '';
    const tag = act ? 'button' : 'div';
    if (!f.type || !f.count) {
      return `<div class="bz-plot empty"><span class="bz-plot-no">밭 ${i + 1}</span><span class="bz-soil"><span class="bz-plot-sprout">🌱</span></span><span class="bz-plot-nm">빈 밭</span><small class="bz-plot-val">어떤 콩이든 심을 수 있어요</small></div>`;
    }
    const layers = Math.min(f.count, 3);
    const art = Array.from({ length: layers }, (_, k) => `<span class="bz-pile l${layers - 1 - k}">${beanSvg(f.type)}</span>`).join('');
    const lock = mine && f.canHarvest === false;
    return `<${tag} class="bz-plot has ${act ? 'can' : ''} ${lock ? 'lock' : ''}" style="${beanVars(f.type)}" ${act}>
      <span class="bz-plot-no">밭 ${i + 1}</span>
      <span class="bz-soil">${art}<b class="bz-plot-cnt">×${f.count}</b></span>
      <span class="bz-plot-nm">${tname(f.type)}</span>
      ${meterHtml(f.type, f.count)}
      <small class="bz-plot-val">${act ? (lock ? '🔒 지금은 수확 불가' : `눌러서 수확 → ${coin(f.value, 'xs')}`) : `지금 수확하면 ${coin(f.value, 'xs')}`}<br>${nextHint(f)}</small>
    </${tag}>`;
  }

  function miniPlot(f) {
    if (!f.type || !f.count) return '<span class="bz-mini empty">빈 밭</span>';
    return `<span class="bz-mini" style="${beanVars(f.type)}">${beanSvg(f.type)}<b>×${f.count}</b>${coin(f.value, 'xs')}</span>`;
  }

  // 맨 위 상태판: 누구 차례 · 지금 몇 단계 · 덱 상황을 한눈에
  function statusHtml() {
    if (S.phase !== 'play') return '';
    const mine = S.turnId === S.me;
    const stepIdx = { plant1: 0, trade: 1, plantAll: 2 }[S.step] || 0;
    const planters = S.players.filter((p) => p.tableCount);
    const what = {
      plant1: S.plantCount ? '2번째 카드도 심을지 고르는 중 (선택)' : '손패 맨 앞 카드를 심는 중',
      trade: `펼친 카드 ${S.faceUp.length}장으로 거래 중 · 제안 ${S.proposals.length}건`,
      plantAll: planters.length ? `받은 카드 심는 중: ${planters.map((p) => `${p.id === S.me ? '나' : esc(p.name)} ${p.tableCount}장`).join(', ')}` : '다 심었어요',
    }[S.step] || '';
    const steps = ['심기', '거래', '모두 심기'].map((t, i) => `<li class="${i < stepIdx ? 'done' : i === stepIdx ? 'now' : ''}"><i>${i < stepIdx ? '✓' : i + 1}</i>${t}</li>`).join('');
    const runs = Array.from({ length: S.maxRuns }, (_, i) => `<i class="${i + 1 < S.deckRuns ? 'done' : i + 1 === S.deckRuns ? 'now' : ''}">${i + 1}</i>`).join('');
    const disc = S.discardTop
      ? `<span class="bz-disc" style="${beanVars(S.discardTop)}" title="버린 더미 맨 위">${beanSvg(S.discardTop)}</span>`
      : '<span class="bz-disc none">버린<br>카드<br>없음</span>';
    return `<section class="bz-status ${mine ? 'mine' : ''}">
      <div class="bz-st-row">
        <div class="bz-st-who"><b class="bz-st-name">${mine ? '🧑‍🌾 내 차례!' : `${pname(S.turnId)}님 차례`}</b><small>${what}</small></div>
        <div class="bz-st-deck" title="덱이 3번째로 바닥나면 게임이 끝나요">
          <span class="bz-pile-deck"><span class="bz-back"></span><span class="bz-back up"><b>${S.deckCount}</b></span></span>
          <span class="bz-st-runs"><small>덱 ${S.deckRuns}/${S.maxRuns}바퀴</small><span class="bz-runs">${runs}</span></span>
          ${disc}
        </div>
      </div>
      <ol class="bz-steps">${steps}<li class="end" title="모두 심으면 차례인 사람이 3장을 뽑고 다음 사람 차례">↻ 3장 뽑기</li></ol>
    </section>`;
  }

  function opponentsHtml() {
    const others = S.players.filter((p) => p.id !== S.me);
    return `<div class="bz-opps">${others.map((p) => {
      const turn = p.id === S.turnId;
      const win = S.winnerIds.includes(p.id);
      let badge = '';
      if (S.phase === 'play' && S.step === 'trade' && !turn) {
        badge = S.proposals.some((x) => x.from === p.id) ? '<span class="bz-sb on">📨 제안함</span>' : '<span class="bz-sb">제안 없음</span>';
      } else if (S.phase === 'play' && S.step === 'plantAll') {
        badge = p.tableCount ? `<span class="bz-sb todo">🌱 ${p.tableCount}장 심는 중</span>` : '<span class="bz-sb done">✓ 다 심음</span>';
      }
      return `<div class="bz-opp ${turn ? 'turn' : ''}">
        <div class="bz-opp-h"><span class="dot ${p.connected ? '' : 'off'}"></span><b class="bz-opp-nm">${esc(p.name)}</b>${turn ? '<span class="bz-turnb">차례</span>' : ''}${badge}${win ? ' 🏆' : ''}
          <span class="bz-opp-s"><span class="bz-handc" title="손패 ${p.handCount}장">${p.handCount}</span>${coin()}<b>${S.phase === 'over' ? S.scores[p.id] : p.coins}</b></span></div>
        <div class="bz-opp-f">${p.fields.map(miniPlot).join('')}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function myFarm() {
    const m = me();
    if (!m) return '';
    const turn = m.id === S.turnId;
    const canBuy = S.phase === 'play' && m.fields.length < 3;
    const buy = canBuy
      ? `<button class="bz-plot buy" data-act="bzBuyField" ${m.coins >= S.fieldPrice ? '' : 'disabled'}><span class="bz-plot-no">밭 3</span><span class="bz-soil">${m.coins >= S.fieldPrice ? '➕' : '🔒'}</span><span class="bz-plot-nm">밭 사기</span><small class="bz-plot-val">${coin(S.fieldPrice, 'xs')} 코인 ${S.fieldPrice}개${m.coins >= S.fieldPrice ? '' : '가 필요해요'}</small></button>`
      : '';
    return `<section class="bz-farm ${turn ? 'turn' : ''}">
      <div class="bz-farm-h"><b>🧑‍🌾 내 농장</b>${turn ? '<span class="bz-turnb">내 차례</span>' : ''}${S.winnerIds.includes(m.id) ? ' 🏆' : ''}
        <span class="bz-farm-coins">${coin()}<b>${S.phase === 'over' ? S.scores[m.id] : m.coins}</b><small>코인</small></span></div>
      <div class="bz-plots">${m.fields.map((f, i) => plot(f, i, true)).join('')}${buy}</div>
    </section>`;
  }

  function tradeZone() {
    if (S.step !== 'trade' || S.phase !== 'play') return '';
    const s = st();
    const A = S.turnId;
    const isA = A === S.me;
    const selectable = !isA && S.mode === 'tradeB';
    const card = (c) => bean(c, { act: selectable ? 'bzWant' : '', sel: s.want.includes(c.id), tag: s.want.includes(c.id) ? '받을 카드' : '', tagCls: 'want' });
    const faceUp = S.faceUp.map(card).join('') || '<span class="bz-none">펼친 카드를 모두 거래했어요</span>';
    const offered = S.offered.map(card).join('') || `<span class="bz-none">${isA ? '아래 내 손패를 눌러 내놓을 수 있어요' : '아직 내놓은 손패가 없어요'}</span>`;
    const props = S.proposals.map((p) => {
      const giveHtml = p.give.map((c) => bean(c, { size: 'sm' })).join('') || '<span class="bz-none">없음(공짜)</span>';
      const wantHtml = p.want.map((id) => {
        const c = [...S.faceUp, ...S.offered].find((x) => x.id === id);
        return c ? bean(c, { size: 'sm' }) : '';
      }).join('') || '<span class="bz-none">없음(선물)</span>';
      const mine = p.from === S.me;
      const actions = isA
        ? `<div class="bz-prop-acts"><button class="primary sm" data-act="bzAccept" data-from="${p.from}">✅ 수락</button><button class="sm" data-act="bzReject" data-from="${p.from}">거절</button></div>`
        : mine ? '<div class="bz-prop-acts"><button class="sm ghost" data-act="bzWithdraw">내 제안 철회</button></div>' : '';
      return `<div class="bz-prop ${mine ? 'mine' : ''}"><div class="bz-prop-h"><b>${mine ? '내 제안' : `${pname(p.from)}님의 제안`}</b></div>
        <div class="bz-swap"><div class="side"><small>${mine ? '내가' : `${pname(p.from)}님이`} 줘요</small><div class="bz-row">${giveHtml}</div></div>
          <span class="bz-arrow">⇄</span>
          <div class="side"><small>${isA ? '내가' : `${pname(A)}님이`} 줘요</small><div class="bz-row">${wantHtml}</div></div></div>${actions}</div>`;
    }).join('');
    const help = isA
      ? '다른 사람의 제안을 기다려요. 필요 없는 손패를 아래에서 눌러 내놓으면 더 많은 제안을 받을 수 있어요.'
      : `받고 싶은 카드를 누르고, 아래 내 손패에서 줄 카드를 골라 제안해요. (${pname(A)}님하고만 거래할 수 있어요)`;
    const myProp = S.proposals.find((p) => p.from === S.me);
    const chips = [
      `<span class="bz-chip">펼친 카드 <b>${S.faceUp.length}</b></span>`,
      `<span class="bz-chip">내놓은 손패 <b>${S.offered.length}</b></span>`,
      `<span class="bz-chip ${S.proposals.length ? 'hot' : ''}">📨 제안 <b>${S.proposals.length}</b>건</span>`,
      isA ? '' : `<span class="bz-chip ${myProp ? 'ok' : ''}">${myProp ? '✅ 내 제안 보냄' : '내 제안 아직 없음'}</span>`,
    ].join('');
    const head = `
      <div class="bz-trade-h"><b>🤝 거래 테이블</b><small>${isA ? '내가 받는 쪽' : `${pname(A)}님과 거래`}</small></div>
      <div class="bz-chips">${chips}</div>
      <p class="bz-help">${help}</p>`;
    const pool = `<div class="bz-pool">
      <div class="bz-sec bz-faceup"><small>펼친 카드 <span>(거래 안 되면 ${isA ? '내가' : `${pname(A)}님이`} 심어요)</span></small><div class="bz-row">${faceUp}</div></div>
      <div class="bz-sec bz-offered"><small>${isA ? '내가' : `${pname(A)}님이`} 내놓은 손패</small><div class="bz-row">${offered}</div></div></div>`;
    const propBox = S.proposals.length ? `<div class="bz-props"><div class="bz-props-h">📨 제안 ${S.proposals.length}건</div>${props}</div>` : '<p class="bz-none center">아직 제안이 없어요.</p>';
    // 차례인 사람은 받은 제안이 먼저, 다른 사람은 고를 카드가 먼저 보이게
    return `<section class="bz-trade">${head}${isA ? propBox + pool : pool + propBox}</section>`;
  }

  function tableHtml() {
    if (!S.table.length) return '';
    const s = st();
    const pick = S.mode === 'plantAll';
    return `<section class="bz-table"><div class="bz-sec-h"><b>🌱 꼭 심어야 할 카드</b><small>${pick ? '카드를 고르고 아래에서 밭을 골라요' : ''}</small></div>
      <div class="bz-row">${S.table.map((c) => bean(c, { act: pick ? 'bzTable' : '', sel: s.table === c.id, tag: s.table === c.id ? '심는 중' : '' })).join('')}</div></section>`;
  }

  function handHtml() {
    const s = st();
    const m = S.mode;
    const clickable = m === 'tradeA' || m === 'tradeB';
    const cards = S.hand.map((c, i) => {
      const offered = m === 'tradeA' && S.offered.some((o) => o.id === c.id);
      const give = m === 'tradeB' && s.give.includes(c.id);
      const front = i === 0 && S.phase === 'play';
      let tag = front ? '맨 앞' : '';
      let tagCls = 'front';
      if (offered) { tag = '내놓음'; tagCls = 'offer'; }
      if (give) { tag = '줄 카드'; tagCls = 'give'; }
      return bean(c, { act: clickable ? 'bzHand' : '', sel: offered || give, front, next: i === 1 && S.phase === 'play', tag, tagCls, no: i + 1 });
    }).join('');
    const sub = m === 'tradeA' ? '👆 눌러서 내놓기/거두기' : m === 'tradeB' ? '👆 눌러서 줄 카드 고르기' : '순서는 못 바꿔요';
    const plan = S.hand.length && S.phase === 'play'
      ? `<div class="bz-handplan"><span>${m === 'plant1' ? '지금 심을 카드' : '내 차례에 심을 카드'}</span>${S.hand.slice(0, m === 'plant1' && S.plantCount ? 1 : 2).map((c, i) => `<b class="bz-hp" style="${beanVars(c.type)}"><i>${i + 1}</i>${tname(c.type)}${i || (m === 'plant1' && S.plantCount) ? ' <small>(선택)</small>' : ''}</b>`).join('')}</div>` : '';
    return `<section class="bz-handbox"><div class="bz-sec-h"><b>🖐 내 손패 ${S.hand.length}장</b><small>${sub}</small></div>
      ${plan}
      ${S.hand.length ? `<div class="bz-handrail"><span class="bz-rail-l">◀ 맨 앞(먼저 심어요)</span><span class="bz-rail-r">새 카드는 맨 뒤 ▶</span></div>
      <div class="bz-hand">${cards}</div>` : '<p class="bz-none">손패가 없어요. 차례가 끝나면 3장을 뽑아요.</p>'}</section>`;
  }

  // 심을 카드를 놓을 밭 버튼들
  function fieldButtons(card, act) {
    const m = me();
    const btns = m.fields.map((f, i) => {
      if (f.type === null || !f.count) return `<button class="bz-pb new" data-act="${act}" data-i="${i}"><span class="bz-pb-art">🌱</span><span class="bz-pb-t"><span class="bz-pb-no">밭 ${i + 1}</span><b>빈 밭에 심기</b></span></button>`;
      if (f.type === card.type) {
        const after = BOHNANZA_DATA.coinsFor(card.type, f.count + 1);
        return `<button class="bz-pb add" style="${beanVars(f.type)}" data-act="${act}" data-i="${i}"><span class="bz-pb-art">${beanSvg(f.type)}</span><span class="bz-pb-t"><span class="bz-pb-no">밭 ${i + 1} · 같은 콩</span><b>×${f.count} → ×${f.count + 1}</b><small>수확 시 ${coin(after, 'xs')}</small></span></button>`;
      }
      return `<button class="bz-pb blocked" style="${beanVars(f.type)}" disabled><span class="bz-pb-art">${beanSvg(f.type)}</span><span class="bz-pb-t"><span class="bz-pb-no">밭 ${i + 1}</span><b>다른 콩</b><small>수확 먼저</small></span></button>`;
    });
    const blocked = m.fields.every((f) => f.type !== null && f.count && f.type !== card.type);
    return `<div class="bz-pbs">${btns.join('')}</div>${blocked ? '<p class="bz-warn">심을 밭이 없어요. 위 <b>내 농장</b>에서 밭 하나를 눌러 먼저 수확하세요.</p>' : ''}`;
  }

  // 아래 고정 영역 머리: 콩 그림 + 할 일 한 줄
  const dockHead = (card, title, sub) => `<div class="bz-dock-h"><span class="bz-dock-bean" style="${beanVars(card.type)}">${beanSvg(card.type)}</span><div><b>${title}</b><small>${sub}</small></div></div>`;

  function dock() {
    const s = st();
    const m = S.mode;
    if (m === 'plant1') {
      const card = S.hand[0];
      if (!card) return '';
      const second = S.plantCount >= 1;
      return `${dockHead(card, second ? `2번째 카드 ${tname(card.type)}도 심을까요? (선택)` : `맨 앞 ${josa(tname(card.type), '을', '를')} 꼭 심어요`, '심을 밭을 골라요 · 한 밭에는 한 종류만')}
        ${fieldButtons(card, 'bzPlantHand')}
        ${second ? '<button class="bz-skip" data-act="bzSkip">그만 심고 카드 2장 펼치기 ▶</button>' : ''}`;
    }
    if (m === 'tradeA') {
      const n = S.proposals.length;
      return `<p class="bz-dock-msg">${n ? `📨 제안 <b>${n}건</b>이 왔어요. 위에서 <b>수락/거절</b>해요.` : '제안을 기다리는 중이에요.'}<br><small>거래를 마치면 남은 펼친 카드 ${S.faceUp.length}장은 내가 심어요.</small></p>
        <button class="primary" data-act="bzEndTrade">거래 끝내기 ✋</button>`;
    }
    if (m === 'tradeB') {
      const mine = S.proposals.find((p) => p.from === S.me);
      const ok = s.give.length + s.want.length > 0;
      return `<p class="bz-dock-msg">줄 카드 <b>${s.give.length}</b>장 ⇄ 받을 카드 <b>${s.want.length}</b>장 ${mine ? '· <b>제안 보냄</b>' : ''}</p>
        <div class="row"><button class="primary" data-act="bzPropose" ${ok ? '' : 'disabled'}>${mine ? '제안 바꾸기' : '📨 제안하기'}</button>${mine ? '<button data-act="bzWithdraw">철회</button>' : ''}</div>`;
    }
    if (m === 'plantAll') {
      const card = S.table.find((c) => c.id === s.table);
      return card
        ? `${dockHead(card, `받은 ${josa(tname(card.type), '을', '를')} 심을 밭`, `남은 카드 ${S.table.length}장 · 모두 심어야 해요`)}${fieldButtons(card, 'bzPlantTable')}`
        : '<p class="bz-dock-msg">위의 <b>꼭 심어야 할 카드</b>를 눌러 고른 뒤 밭을 고르세요.</p>';
    }
    if (m === 'over') return '';
    const who = S.step === 'plantAll'
      ? `받은 카드를 심는 중: <b>${S.players.filter((p) => p.tableCount).map((p) => esc(p.name)).join(', ') || '…'}</b>`
      : `<b>${pname(S.turnId)}</b>님이 ${S.step === 'trade' ? '거래 중' : '콩을 심는 중'}이에요`;
    return `<p class="bz-dock-msg wait">⏳ ${who}</p>`;
  }

  function stepText() {
    if (S.phase === 'over') return '게임 끝';
    return { plant1: `${pname(S.turnId)}님 · 심기`, trade: `${pname(S.turnId)}님 · 거래`, plantAll: '모두 심는 중' }[S.step] || '';
  }

  function overHtml(isHost) {
    if (S.phase !== 'over') return '';
    const ranked = S.players.slice().sort((a, b) => S.scores[b.id] - S.scores[a.id]);
    return `<section class="bz-over"><div class="bz-over-h">🌾 수확 끝! 🌾</div>
      <p class="bz-over-win">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>
      <div class="bz-rank">${ranked.map((p, i) => `<div class="bz-rank-r ${S.winnerIds.includes(p.id) ? 'win' : ''}"><span class="bz-rank-no">${i + 1}</span><span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span>${coin()}<b>${S.scores[p.id]}</b></div>`).join('')}</div>
      ${genericOverButtons(isHost)}</section>`;
  }

  function renderBohnanza() {
    const isHost = S.hostId === S.me;
    const log = S.log.length ? `<div class="ulog bz-log">${S.log.slice(-4).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    return `
    <div class="top"><span>${roomTag()}</span><span class="bz-top">🫘 보난자 · ${stepText()}</span></div>
    ${overHtml(isHost)}
    ${statusHtml()}
    ${opponentsHtml()}
    ${tradeZone()}
    ${myFarm()}
    ${tableHtml()}
    ${handHtml()}
    ${log}
    ${isHost ? '<div class="foot bz-foot"><button class="sm ghost" data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
    <div class="bdock bz-dock">
      ${dock()}
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
    // 심을 카드가 있으면 첫 장을 미리 골라 둔다 (다른 카드를 눌러 바꿀 수 있어요)
    if (S.mode === 'plantAll' && s.table === null && S.table.length) s.table = S.table[0].id;
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
      case 'bzTable': s.table = Number(el.dataset.id); render(); return true;
      case 'bzPlantTable': send({ t: 'plant', card: s.table, field: Number(el.dataset.i) }); s.table = null; return true;
      default: return false;
    }
  }

  // 화면을 다시 그려도 손패 가로 스크롤 위치를 지킨다
  let handScroll = 0;
  document.addEventListener('scroll', (e) => {
    const t = e.target;
    if (t && t.classList && t.classList.contains('bz-hand')) handScroll = t.scrollLeft;
  }, true);
  function afterRender() {
    if (!S || S.kind !== 'bohnanza') return;
    const h = document.querySelector('.bz-hand');
    if (h && handScroll) h.scrollLeft = handScroll;
  }

  window.GAME_UI.bohnanza = {
    name: '보난자', label: '🫘 보난자', range: '3~5명', rules: RULES, render: renderBohnanza, sync, click, afterRender,
  };
}());
