'use strict';
// 라스베가스 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
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

  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const money = (k) => `$${k}k`;
  const dot = (id) => `<i class="vchip" style="background:${player(id) ? player(id).color : '#888'}"></i>`;

  function casinoHtml(c, pickable) {
    const entries = Object.entries(c.dice).sort((a, b) => b[1] - a[1]);
    const dice = entries.map(([id, n]) => `<span class="vdice">${dot(id)}×${n}</span>`).join('') || '<span class="dim small">비어 있음</span>';
    const bills = c.bills.map((b) => `<span class="vbill">${money(b)}</span>`).join('') || '<span class="dim small">지폐 없음</span>';
    const count = pickable ? S.rolled.filter((v) => v === c.n).length : 0;
    const cls = ['vcas'];
    if (pickable && count) cls.push('pick');
    const inner = `<div class="vcas-h"><span class="vnum">${c.n}</span>${count ? `<span class="vcount">+${count}개</span>` : ''}</div>
      <div class="vbills">${bills}</div><div class="vdicerow">${dice}</div>`;
    return pickable && count
      ? `<button class="${cls.join(' ')}" data-act="vgPlace" data-n="${c.n}">${inner}</button>`
      : `<div class="${cls.join(' ')}">${inner}</div>`;
  }

  function playersHtml() {
    return `<div class="vplayers">${S.players.map((p) => {
      const turn = p.id === S.turnId;
      return `<div class="vp ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''}">
        <div class="vp-h"><i class="vchip big" style="background:${p.color}"></i><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${turn ? ' 👈' : ''}${S.winnerIds.includes(p.id) ? ' 🏆' : ''}</div>
        <div class="vp-r"><span>🎲 ${p.dice}</span><span>💵 ${p.bills}장</span><b class="vp-t">${money(p.total)}</b></div></div>`;
    }).join('')}</div>`;
  }

  function rolledHtml() {
    if (!S.rolled) return '';
    const who = pname(S.turnId);
    const dice = S.rolled.map((v) => `<span class="vdie">${v}</span>`).join('');
    return `<div class="card"><div class="small dim">${who}님이 굴린 주사위 (${S.rolled.length}개)</div><div class="vdierow">${dice}</div></div>`;
  }

  function resultsHtml() {
    return `<div class="card panel"><h2>${S.phase === 'over' ? '마지막 라운드 결과' : `${S.round}라운드 결과`}</h2>${S.results.map((r) => {
      const rows = r.rows.map((x) => `<div class="vres ${x.tied ? 'tied' : ''}">${dot(x.id)}<b>${pname(x.id)}</b> ${x.n}개 ${x.tied ? '<span class="dim small">· 동수라 상쇄</span>' : x.bill ? `<b class="y">+${money(x.bill)}</b>` : '<span class="dim small">· 받을 지폐 없음</span>'}</div>`).join('') || '<div class="dim small">아무도 놓지 않았어요</div>';
      return `<div class="vresc"><div class="small"><b>${r.casino}번 카지노</b> <span class="dim">(${r.bills.map(money).join(' · ') || '지폐 없음'})</span></div>${rows}</div>`;
    }).join('')}</div>`;
  }

  function dock() {
    const m = S.mode;
    if (m === 'roll') return '<button class="primary" data-act="vgRoll">🎲 주사위 굴리기</button>';
    if (m === 'place') {
      const groups = [...new Set(S.rolled)].map((v) => `${v}번 ×${S.rolled.filter((x) => x === v).length}`).join(' · ');
      return `<p class="center"><b>놓을 숫자를 고르세요</b><br><span class="small dim">위 카지노에서 강조된 곳을 누르세요 (${groups})</span></p>`;
    }
    if (m === 'roundEnd') {
      const me = player(S.me);
      const acked = S.players.filter((p) => p.acked).length;
      return me.acked
        ? `<p class="progress">다른 사람을 기다리는 중 (${acked}/${S.players.filter((p) => p.connected).length})</p>`
        : `<button class="primary" data-act="ack">${S.round >= S.rounds ? '결과 보기' : '다음 라운드'}</button>`;
    }
    if (m === 'over') return '';
    return `<p class="center dim">${pname(S.turnId)}님 차례예요</p>`;
  }

  function renderVegas() {
    const isHost = S.hostId === S.me;
    const pickable = S.mode === 'place';
    const over = S.phase === 'over'
      ? `<div class="card panel"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>
          ${S.players.slice().sort((a, b) => b.total - a.total).map((p) => `<div class="slot"><span class="nm">${dot(p.id)} ${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</span><b>${money(p.total)}</b></div>`).join('')}
          ${genericOverButtons(isHost)}</div>` : '';
    const log = S.log.length ? `<div class="ulog">${S.log.slice(-5).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    return `
    <div class="top"><span>방 <b>${esc(S.code)}</b></span><span>라스베가스 · ${S.round}/${S.rounds}라운드</span></div>
    ${over}
    ${S.phase === 'roundEnd' || S.phase === 'over' ? resultsHtml() : ''}
    <div class="vboard">${S.casinos.map((c) => casinoHtml(c, pickable)).join('')}</div>
    ${rolledHtml()}
    ${playersHtml()}
    ${log}
    <div class="bdock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (대신 굴리고 놓기 / 다음 라운드)', '자리를 비운 사람 대신 진행할까요? (굴려서 가장 많이 나온 숫자를 놓아요)') : ''}`;
  }

  function click(act, el) {
    switch (act) {
      case 'vgRoll': send({ t: 'roll' }); return true;
      case 'vgPlace': send({ t: 'place', number: Number(el.dataset.n) }); return true;
      default: return false;
    }
  }

  window.GAME_UI.vegas = {
    name: '라스베가스', label: '🎰 라스베가스', range: '3~6명', rules: RULES, render: renderVegas, click,
  };
}());
