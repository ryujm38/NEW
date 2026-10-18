'use strict';
// 라스베가스 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
// 꾸미기는 skin-vegas.css (vg- 로 시작하는 클래스).
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>라스베가스 규칙 간단 설명</summary>
<p><b>3~6명</b> · 주사위를 카지노에 놓아 지폐를 따는 게임이에요. 4라운드 후 돈이 가장 많은 사람이 이겨요.</p>
<ul>
<li>카지노가 6곳(1~6번)이고, 곳마다 지폐가 합계 <b>$50k 이상</b> 깔려 있어요.</li>
<li>내 차례에 <b>남은 주사위를 모두 굴려요.</b> 나온 숫자 중 <b>하나를 골라</b> 그 숫자가 나온 주사위를 <b>전부</b> 같은 번호의 카지노에 놓아요. 놓은 주사위는 그 자리에 남아요.</li>
<li>모두 주사위를 다 놓으면 카지노마다 계산해요. <b>주사위 수가 같은 사람끼리는 모두 상쇄</b>(탈락)되고, 남은 사람 중 <b>많이 놓은 순서대로 큰 지폐</b>부터 가져가요. 가져갈 사람이 없는 지폐는 버려요.</li>
<li>시작 플레이어는 라운드마다 한 칸씩 넘어가요. 4라운드가 끝나면 돈이 가장 많은 사람이 승리!</li>
</ul></details>`;

  // 카지노 이름과 네온 색 (원작과 다른 새 이름)
  const CASINO = [
    null,
    { name: '루비 라운지', c: '#ff4d6d' },
    { name: '블루 오아시스', c: '#3fd0ff' },
    { name: '골든 선셋', c: '#ffd23f' },
    { name: '라임 가든', c: '#7cff6b' },
    { name: '바이올렛 문', c: '#c08cff' },
    { name: '오렌지 잭팟', c: '#ff9a3d' },
  ];
  const ROLL_MS = 900;
  const DROP_MS = 1400;

  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const money = (k) => `$${k}k`;
  const colorOf = (id) => (player(id) && player(id).color) || '#888888';

  function lightColor(hex) {
    const n = parseInt(String(hex).slice(1), 16);
    if (Number.isNaN(n)) return false;
    return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 170;
  }
  const dieVars = (color) => `--dc:${color};--pc:${lightColor(color) ? '#2a2108' : '#fff'}`;

  // 주사위 눈 위치 (3×3 칸 번호)
  const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
  function face(v) {
    const on = PIPS[v] || [];
    return Array.from({ length: 9 }, (_, i) => `<i class="${on.includes(i) ? 'on' : ''}"></i>`).join('');
  }
  function die(v, color, cls = '', extra = '') {
    return `<span class="vg-die ${cls}" style="${dieVars(color)}${extra}" aria-label="주사위 ${v}">${face(v)}</span>`;
  }

  // ---- 굴림·놓기 애니메이션: 상태가 처음 보인 시각을 기억해 다시 그려도 처음부터 다시 돌지 않게 ----
  const seenRoll = new Map();
  function rollKey() {
    const p = player(S.turnId);
    return `${S.code}:${S.gameNo}:${S.round}:${S.turnId}:${p ? p.dice : ''}:${S.rolled.join('')}`;
  }
  function rollElapsed() {
    if (!S.rolled) return Infinity;
    const k = rollKey();
    if (!seenRoll.has(k)) {
      seenRoll.set(k, Date.now());
      if (seenRoll.size > 40) seenRoll.delete(seenRoll.keys().next().value);
    }
    return Date.now() - seenRoll.get(k);
  }
  let lastDice = null; // 지난 상태의 카지노별 주사위 (새로 놓인 곳 찾기)
  let drop = null; // { n, id, at }

  function stacksHtml(c) {
    const entries = Object.entries(c.dice).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '<span class="vg-empty">아직 아무도 없어요</span>';
    const counts = entries.map((e) => e[1]);
    const lead = entries.find(([, n]) => counts.filter((x) => x === n).length === 1);
    return entries.map(([id, n]) => {
      const tied = counts.filter((x) => x === n).length > 1;
      const cubes = Array.from({ length: Math.min(n, 8) }, () => '<i></i>').join('');
      const isLead = lead && lead[0] === id;
      return `<span class="vg-stack ${tied ? 'tie' : ''} ${isLead ? 'lead' : ''} ${id === S.me ? 'me' : ''}" style="${dieVars(colorOf(id))}" title="${pname(id)}">
        <span class="vg-cubes">${cubes}</span><b>${n}</b>${tied ? '<em>동점</em>' : isLead ? '<em>👑</em>' : ''}</span>`;
    }).join('');
  }

  function billsHtml(bills) {
    if (!bills.length) return '<span class="vg-empty">지폐 없음</span>';
    return bills.map((b, i) => `<span class="vg-bill ${i === 0 ? 'first' : ''} b${b}"><b>${money(b)}</b>${i < 3 ? `<small>${i + 1}등</small>` : ''}</span>`).join('');
  }

  function casinoHtml(c, pickable) {
    const info = CASINO[c.n];
    const count = pickable ? S.rolled.filter((v) => v === c.n).length : 0;
    const cls = ['vg-cas'];
    if (pickable && count) cls.push('pick');
    if (pickable && !count) cls.push('off');
    let dropAttr = '';
    if (drop && drop.n === c.n) {
      const el = Date.now() - drop.at;
      if (el < DROP_MS) { cls.push('drop'); dropAttr = `;--dd:-${el}ms`; }
    }
    const inner = `<span class="vg-sign"><span class="vg-face">${face(c.n)}</span><span class="vg-name"><b>${c.n}번</b>${info.name}</span></span>
      <span class="vg-bills">${billsHtml(c.bills)}</span>
      <span class="vg-stacks">${stacksHtml(c)}</span>
      ${count ? `<span class="vg-add">+${count}개 놓기</span>` : ''}`;
    const style = `style="--nc:${info.c}${dropAttr}"`;
    return pickable && count
      ? `<button class="${cls.join(' ')}" ${style} data-act="vgPlace" data-n="${c.n}">${inner}</button>`
      : `<div class="${cls.join(' ')}" ${style}>${inner}</div>`;
  }

  function playersHtml() {
    return `<div class="vg-players">${S.players.map((p) => {
      const turn = p.id === S.turnId;
      const left = Array.from({ length: p.dice }, () => '<i></i>').join('');
      return `<div class="vg-pl ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''}" style="${dieVars(p.color || '#888888')}">
        <div class="vg-pl-h"><span class="vg-pl-chip"></span><span class="dot ${p.connected ? '' : 'off'}"></span><b class="vg-pl-nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${S.winnerIds.includes(p.id) ? '🏆' : ''}${turn ? '<span class="vg-turnb">차례</span>' : ''}</div>
        <div class="vg-pl-r"><span class="vg-left" title="남은 주사위 ${p.dice}개">${left || '<small>다 놓음</small>'}</span><b class="vg-pl-t">${money(p.total)}</b></div></div>`;
    }).join('')}</div>`;
  }

  function trayHtml() {
    if (!S.rolled) return '';
    const el = rollElapsed();
    const rolling = el < ROLL_MS;
    const color = colorOf(S.turnId);
    const groups = [...new Set(S.rolled)];
    const dice = groups.map((v) => {
      const n = S.rolled.filter((x) => x === v).length;
      const ds = Array.from({ length: n }, (_, k) => die(v, color, rolling ? 'roll' : '', rolling ? `;animation-delay:-${el}ms;--rt:${(k % 3) - 1}` : '')).join('');
      return `<span class="vg-grp"><span class="vg-grp-d">${ds}</span><small>${n}개</small></span>`;
    }).join('');
    const mine = S.turnId === S.me;
    return `<section class="vg-tray"><div class="vg-tray-h">${mine ? '내가' : `<b>${pname(S.turnId)}</b>님이`} 굴린 주사위 ${S.rolled.length}개</div>
      <div class="vg-felt">${dice}</div></section>`;
  }

  function resultsHtml() {
    const title = S.phase === 'over' ? '마지막 라운드 정산' : `${S.round}라운드 정산`;
    return `<section class="vg-results"><h2>💰 ${title}</h2>${S.results.map((r) => {
      const info = CASINO[r.casino];
      const rows = r.rows.map((x) => `<div class="vg-res ${x.tied ? 'tied' : ''} ${x.id === S.me ? 'me' : ''}"><span class="vg-pl-chip" style="${dieVars(colorOf(x.id))}"></span><b class="nm">${pname(x.id)}</b><span class="n">🎲${x.n}</span>${x.tied ? '<span class="why">동점 상쇄</span>' : x.bill ? `<b class="won">+${money(x.bill)}</b>` : '<span class="why">지폐 없음</span>'}</div>`).join('') || '<div class="vg-empty">아무도 놓지 않았어요</div>';
      return `<div class="vg-resc" style="--nc:${info.c}"><div class="vg-resc-h"><span class="vg-face sm">${face(r.casino)}</span><b>${r.casino}번 ${info.name}</b><small>${r.bills.map(money).join(' · ') || '지폐 없음'}</small></div>${rows}</div>`;
    }).join('')}</section>`;
  }

  function choicesHtml() {
    const color = colorOf(S.me);
    const groups = [...new Set(S.rolled)];
    return `<div class="vg-choices">${groups.map((v) => {
      const n = S.rolled.filter((x) => x === v).length;
      const c = S.casinos[v - 1];
      return `<button class="vg-choice" style="--nc:${CASINO[v].c}" data-act="vgPlace" data-n="${v}">
        ${die(v, color, 'sm')}<b>×${n}</b><small>${v}번 · ${c.bills.length ? money(c.bills[0]) : '지폐 없음'}</small></button>`;
    }).join('')}</div>`;
  }

  function dock() {
    const m = S.mode;
    const meP = player(S.me);
    if (m === 'roll') return `<button class="primary vg-rollbtn" data-act="vgRoll">🎲 주사위 ${meP ? meP.dice : ''}개 굴리기</button>`;
    if (m === 'place') {
      return `<p class="vg-dock-msg"><b>어떤 숫자를 놓을까요?</b><br><small>고른 숫자의 주사위는 <b>모두</b> 같은 번호 카지노로 가요</small></p>${choicesHtml()}`;
    }
    if (m === 'roundEnd') {
      const acked = S.players.filter((p) => p.acked).length;
      return meP && meP.acked
        ? `<p class="progress">다른 사람을 기다리는 중 (${acked}/${S.players.filter((p) => p.connected).length})</p>`
        : `<button class="primary vg-rollbtn" data-act="ack">${S.round >= S.rounds ? '최종 결과 보기' : '다음 라운드 ▶'}</button>`;
    }
    if (m === 'over') return '';
    return `<p class="vg-dock-msg wait">⏳ <b>${pname(S.turnId)}</b>님 차례예요${meP && meP.dice ? ` · 내 남은 주사위 ${meP.dice}개` : ''}</p>`;
  }

  function overHtml(isHost) {
    if (S.phase !== 'over') return '';
    const ranked = S.players.slice().sort((a, b) => b.total - a.total);
    return `<section class="vg-over"><div class="vg-over-h">JACKPOT!</div>
      <p class="vg-over-win">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>
      <div class="vg-rank">${ranked.map((p, i) => `<div class="vg-rank-r ${S.winnerIds.includes(p.id) ? 'win' : ''}"><span class="vg-rank-no">${i + 1}</span><span class="vg-pl-chip" style="${dieVars(p.color || '#888888')}"></span><span class="nm">${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><b>${money(p.total)}</b><small>${p.bills}장</small></div>`).join('')}</div>
      ${genericOverButtons(isHost)}</section>`;
  }

  function renderVegas() {
    const isHost = S.hostId === S.me;
    const pickable = S.mode === 'place';
    const pips = Array.from({ length: S.rounds }, (_, i) => `<i class="${i + 1 < S.round ? 'done' : i + 1 === S.round ? 'now' : ''}"></i>`).join('');
    const log = S.log.length ? `<div class="ulog vg-log">${S.log.slice(-4).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    return `
    <div class="top vg-top"><span>${roomTag()}</span><span>🎰 라스베가스</span></div>
    <div class="vg-marquee"><span class="vg-neon">LAS VEGAS</span><span class="vg-round">${S.round}/${S.rounds} 라운드<span class="vg-pips">${pips}</span></span></div>
    ${overHtml(isHost)}
    ${S.phase === 'roundEnd' || S.phase === 'over' ? resultsHtml() : ''}
    <div class="vg-board ${pickable ? 'picking' : ''}">${S.casinos.map((c) => casinoHtml(c, pickable)).join('')}</div>
    ${trayHtml()}
    ${playersHtml()}
    ${log}
    <div class="bdock vg-dock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (대신 굴리고 놓기 / 다음 라운드)', '자리를 비운 사람 대신 진행할까요? (굴려서 가장 많이 나온 숫자를 놓아요)') : ''}`;
  }

  // 새 상태가 오면 어느 카지노에 주사위가 새로 놓였는지 찾는다 (반짝 효과용)
  function sync() {
    if (!S || S.kind !== 'vegas' || !S.casinos) { lastDice = null; drop = null; return; }
    const now = S.casinos.map((c) => ({ ...c.dice }));
    const key = `${S.gameNo}:${S.round}`;
    if (lastDice && lastDice.key === key) {
      S.casinos.forEach((c, i) => {
        Object.entries(c.dice).forEach(([id, n]) => {
          if (n > (lastDice.dice[i][id] || 0)) drop = { n: c.n, id, at: Date.now() };
        });
      });
    }
    lastDice = { key, dice: now };
  }

  function click(act, el) {
    switch (act) {
      case 'vgRoll': send({ t: 'roll' }); return true;
      case 'vgPlace': send({ t: 'place', number: Number(el.dataset.n) }); return true;
      default: return false;
    }
  }

  window.GAME_UI.vegas = {
    name: '라스베가스', label: '🎰 라스베가스', range: '3~6명', rules: RULES, render: renderVegas, sync, click,
    casinoName: (n) => (CASINO[n] ? CASINO[n].name : `${n}번`),
  };
}());
