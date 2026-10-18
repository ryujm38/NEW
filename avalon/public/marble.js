'use strict';
// 부루마블 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>부루마블 규칙 간단 설명</summary>
<p><b>2~6명</b> · 주사위로 보드를 돌며 땅을 사고 건물을 지어 통행료로 돈을 모아요. 돈 단위는 <b>만원</b>이에요.</p>
<ul>
<li>모두 <b>300만</b>으로 시작해요. 시작 칸을 지나거나 밟으면 월급 <b>20만</b>.</li>
<li>빈 도시에 도착하면 <b>구입</b>할 수 있어요. 내 도시에 다시 도착하면 <b>별장 → 빌딩 → 호텔</b>을 지을 수 있고, 통행료가 크게 올라요.</li>
<li>남의 도시에 도착하면 <b>통행료</b>를 내요. 호텔이 아니면 (땅+건물 값)의 <b>2배</b>를 내고 <b>인수</b>할 수도 있어요.</li>
<li>같은 나라(색깔)의 도시를 모두 가지면 통행료가 <b>2배</b>. 관광지는 많이 가질수록 통행료가 올라요.</li>
<li><b>더블</b>이 나오면 한 번 더 굴려요. 3번 연속 더블이면 <b>무인도</b>로 가요.</li>
<li><b>무인도</b>에서는 벌금 20만, 탈출권, 더블, 또는 3턴 기다리면 나올 수 있어요.</li>
<li><b>황금열쇠</b>는 돈을 받거나 내고, 이동하고, 탈출권도 줘요. <b>우주여행</b>에 도착하면 다음 차례에 원하는 칸으로 가요. 사회복지기금 접수에 낸 돈은 수령 칸에 도착한 사람이 가져가요.</li>
<li>돈이 모자라면 땅을 팔아(투자한 값의 절반) 갚아야 하고, 못 갚으면 <b>파산</b>해요. 한 명만 남거나 정한 바퀴 수가 지나면 끝나고, 자산(현금+땅과 건물)이 가장 많은 사람이 이겨요.</li>
</ul></details>`;

  const GROUP_COLOR = { A: '#8d5a3b', B: '#5bc0eb', C: '#e87aa0', D: '#f09a3a', E: '#d9453a', F: '#e8c23a', G: '#4caf68', H: '#6b78e6' };
  const SPECIAL = {
    start: ['🏁', '시작'], island: ['🏝️', '무인도'], fundcollect: ['🏦', '복지 수령'], space: ['🚀', '우주여행'],
    fundpay: ['💸', '복지 접수'], key: ['🔑', '황금열쇠'], tour: ['🚢', ''],
  };
  const LEVEL_ICON = ['', '🏠', '🏢', '🏨'];
  const LEVEL_NAME = ['땅', '별장', '빌딩', '호텔'];
  const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  const st = () => (ui.mb = ui.mb || { info: null, warp: null });
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const me = () => player(S.me);
  const won = (n) => `${n}만`;

  function cellPos(i) {
    if (i <= 8) return [9, 9 - i];
    if (i <= 16) return [9 - (i - 8), 1];
    if (i <= 24) return [1, 1 + (i - 16)];
    return [1 + (i - 24), 9];
  }

  function tileHtml(t, warping) {
    const [row, col] = cellPos(t.i);
    const sp = SPECIAL[t.type];
    const label = t.type === 'city' ? esc(t.name) : (sp[1] || esc(t.name));
    const band = t.group ? `<i class="band" style="background:${GROUP_COLOR[t.group]}"></i>` : `<i class="band sp">${sp[0]}</i>`;
    const owner = t.owner ? player(t.owner) : null;
    const ownerMark = owner ? `<i class="own" style="background:${owner.color}">${LEVEL_ICON[t.level]}</i>` : '';
    const here = S.players.filter((p) => !p.bankrupt && p.pos === t.i).map((p) => `<i class="tk" style="background:${p.color}"></i>`).join('');
    const price = t.price && !owner ? `<small>${t.price}</small>` : '';
    const cls = ['mt', `t-${t.type}`];
    if (warping && !(me() && me().pos === t.i)) cls.push('warpable');
    if (st().warp === t.i) cls.push('picked');
    return `<button class="${cls.join(' ')}" style="grid-row:${row};grid-column:${col}" data-act="mbTile" data-i="${t.i}" aria-label="${esc(t.name)}">
      ${band}<span class="nm">${label}</span>${price}${ownerMark}<span class="tks">${here}</span></button>`;
  }

  function centerHtml() {
    const d = S.dice;
    const dice = d
      ? `<div class="mdice">${DIE[d[0]]}${DIE[d[1]]}<small>${S.diceBy ? `${pname(S.diceBy)}: ` : ''}${d[0]} + ${d[1]} = ${d[0] + d[1]}${d[0] === d[1] ? ' · 더블!' : ''}</small></div>`
      : '<div class="mdice dim">🎲</div>';
    const rounds = S.maxRounds ? `${Math.min(S.round, S.maxRounds)}/${S.maxRounds}바퀴` : `${S.round}바퀴째`;
    const turnP = S.turnId && player(S.turnId);
    const key = S.lastKey ? `<div class="mkey">🔑 ${pname(S.lastKey.by)}: ${esc(S.lastKey.text)}</div>` : '';
    const log = S.log.slice(-3).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('');
    return `<div class="mcenter">
      <div class="mc-top"><span>${rounds}</span><span>🏦 복지기금 ${won(S.fund)}</span></div>
      ${turnP ? `<div class="mc-turn"><i class="tk big" style="background:${turnP.color}"></i> ${esc(turnP.name)}님 차례</div>` : ''}
      ${dice}${key}<div class="mlog">${log}</div></div>`;
  }

  function playersHtml() {
    return `<div class="mplayers2">${S.players.map((p) => {
      const turn = p.id === S.turnId;
      const tags = [];
      if (p.bankrupt) tags.push('<span class="tag" style="color:var(--evil)">파산</span>');
      if (p.jail) tags.push(`<span class="tag">🏝️ 무인도 ${p.jailTurns}/3</span>`);
      if (p.escape) tags.push(`<span class="tag">탈출권 ${p.escape}</span>`);
      if (p.warp) tags.push('<span class="tag">🚀 우주여행 예정</span>');
      const props = p.props.map((i) => {
        const t = S.tiles[i];
        return `<span class="mprop" style="border-color:${t.group ? GROUP_COLOR[t.group] : '#6b7280'}">${esc(t.name)}${LEVEL_ICON[t.level]}</span>`;
      }).join('');
      return `<div class="mpl ${turn ? 'turn' : ''} ${p.bankrupt ? 'out' : ''} ${p.id === S.me ? 'me' : ''}">
        <div class="mpl-h"><i class="tk big" style="background:${p.color}"></i><span class="dot ${p.connected ? '' : 'off'}"></span><b>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</b>${S.winnerIds.includes(p.id) ? ' 🏆' : ''}<span class="mpl-cash">${won(p.cash)}</span></div>
        <div class="mpl-r small dim">자산 ${won(p.netWorth)} ${tags.join('')}</div>
        ${props ? `<div class="mpl-p">${props}</div>` : ''}</div>`;
    }).join('')}</div>`;
  }

  function infoSheet() {
    const t = S.tiles[st().info];
    const owner = t.owner ? player(t.owner) : null;
    let body = '';
    if (t.type === 'city') {
      const mult = [0.2, 0.6, 1.4, 3.0];
      const rows = mult.map((m, l) => `<tr><td>${LEVEL_NAME[l]}</td><td>${Math.max(1, Math.round(t.price * m))}만</td><td>${l ? `${[Math.ceil(t.price * 0.5), t.price, Math.ceil(t.price * 1.5)][l - 1]}만` : `${t.price}만`}</td></tr>`).join('');
      body = `<table><tr><th>단계</th><th>통행료</th><th>짓는 비용</th></tr>${rows}</table><p class="small dim">같은 색을 모두 가지면 통행료 2배</p>`;
    } else if (t.type === 'tour') {
      body = `<p>가격 ${t.price}만 · 통행료 10만 (관광지를 2곳 가지면 20만, 3곳이면 40만)</p>`;
    } else {
      body = `<p class="small dim">${esc({ start: '지나가거나 밟으면 월급 20만', key: '황금열쇠를 뽑아요', island: '도착하면 갇혀요 (벌금 20만 / 탈출권 / 더블 / 3턴)', fundpay: '15만을 사회복지기금에 내요', fundcollect: '쌓인 사회복지기금을 모두 가져가요', space: '다음 차례에 원하는 칸으로 이동해요' }[t.type] || '')}</p>`;
    }
    const own = owner ? `<p>주인: <b style="color:${owner.color}">${esc(owner.name)}</b>${t.type === 'city' ? ` · ${LEVEL_NAME[t.level]}` : ''} · 지금 통행료 <b>${won(t.toll)}</b></p>` : (t.price ? '<p class="dim">주인 없음</p>' : '');
    return `<div class="overlay" data-act="closeall"><div class="sheet"><h2>${esc(t.name)}</h2>${own}${body}<button data-act="closeall">닫기</button></div></div>`;
  }

  function dock() {
    const mode = S.mode;
    const pd = S.pending;
    const m = me();
    const tile = pd && pd.tile !== undefined ? S.tiles[pd.tile] : null;
    switch (mode) {
      case 'roll': {
        const buttons = [];
        if (m.jail) {
          buttons.push(`<p class="center small">🏝️ 무인도에 갇혀 있어요 (${m.jailTurns}/3턴). 더블이 나오면 탈출해요.</p>`);
          if (S.canPayFine) buttons.push(`<button data-act="mbFine">벌금 ${S.fine}만 내고 나가기</button>`);
          if (m.escape) buttons.push(`<button data-act="mbEscape">탈출권 사용 (${m.escape}장)</button>`);
        }
        buttons.push('<button class="primary" data-act="mbRoll">🎲 주사위 굴리기</button>');
        return buttons.join('');
      }
      case 'buy':
        return `<p class="center"><b>${esc(tile.name)}</b>을(를) <b>${won(pd.cost)}</b>에 살까요? <span class="dim small">(내 돈 ${won(m.cash)})</span></p>
          <div class="row"><button class="primary" data-act="mbBuy">구입</button><button data-act="mbSkip">건너뛰기</button></div>`;
      case 'build': {
        const next = LEVEL_NAME[tile.level + 1];
        return `<p class="center"><b>${esc(tile.name)}</b>에 <b>${next}</b>을(를) ${won(pd.cost)}에 지을까요?</p>
          <div class="row"><button class="primary" data-act="mbBuild">건설</button><button data-act="mbSkip">건너뛰기</button></div>`;
      }
      case 'takeover':
        return `<p class="center"><b>${esc(tile.name)}</b>을(를) ${pname(tile.owner)}님에게서 <b>${won(pd.cost)}</b>에 인수할까요? <span class="dim small">(값을 상대에게 줘요)</span></p>
          <div class="row"><button class="primary" data-act="mbTakeover">인수</button><button data-act="mbSkip">건너뛰기</button></div>`;
      case 'debt': {
        const mine = S.tiles.filter((t) => t.owner === S.me);
        const sells = mine.map((t) => `<button class="mprop-btn" data-act="mbSell" data-i="${t.i}">${esc(t.name)} ${LEVEL_ICON[t.level]} · 팔기 +${won(t.sale)}</button>`).join('');
        return `<p class="center"><b class="n">${won(pd.amount)}</b>을 내야 하는데 내 돈은 <b>${won(m.cash)}</b>이에요. 땅을 팔아 갚으세요.</p>
          <div class="mprops">${sells || '<p class="dim center">팔 땅이 없어요</p>'}</div>
          <button class="no" data-act="mbBankrupt" data-confirm="정말 파산을 선언할까요? 모든 땅이 사라져요.">파산 선언</button>`;
      }
      case 'warp': {
        const picked = st().warp;
        return `<p class="center">🚀 <b>우주여행!</b> 가고 싶은 칸을 보드에서 누르세요.</p>
          ${picked !== null ? `<button class="primary" data-act="mbWarp">${esc(S.tiles[picked].name)}(으)로 이동</button>` : '<button disabled>칸을 고르세요</button>'}`;
      }
      case 'over':
        return '';
      default: {
        const who = pd ? pd.who : S.turnId;
        return `<p class="center dim">${pname(who)}님 차례예요${pd && pd.t === 'debt' ? ' (빚을 갚는 중)' : ''}</p>`;
      }
    }
  }

  function renderMarble() {
    const warping = S.mode === 'warp';
    const isHost = S.hostId === S.me;
    const board = `<div class="mboard">${S.tiles.map((t) => tileHtml(t, warping)).join('')}${centerHtml()}</div>`;
    const over = S.phase === 'over'
      ? `<div class="card panel"><h2>게임 끝</h2><p class="big ok">🏆 ${S.winnerIds.map(pname).join(', ')} 승리!</p>${genericOverButtons(isHost)}</div>` : '';
    return `
    <div class="top"><span>${roomTag()}</span><span>부루마블</span></div>
    ${over}
    ${board}
    ${playersHtml()}
    <div class="bdock">
      ${dock()}
      ${isHost ? '<div class="foot"><button data-act="hostmenu">⚙ 방장</button></div>' : ''}
    </div>
    ${st().info !== null ? infoSheet() : ''}
    ${ui.hostOpen && isHost ? genericHostMenu('멈춘 곳 대신 진행 (굴리기/건너뛰기/파산)', '자리를 비운 사람 대신 진행할까요? (굴리기 / 선택은 건너뛰기 / 빚은 파산 처리)') : ''}`;
  }

  function lobbyOptions(isHost) {
    const opts = S.roundChoices.map((n) => `<option value="${n}" ${S.settings.maxRounds === n ? 'selected' : ''}>${n ? `${n}바퀴` : '무제한'}</option>`).join('');
    return `<label class="opt"><span>게임 길이</span>
      <select id="mbRounds" ${isHost ? '' : 'disabled'}>${opts}</select></label>
      <p class="small dim" style="margin:0 0 8px">정한 바퀴가 지나면 자산이 가장 많은 사람이 이겨요.${isHost ? '' : ' (방장이 정해요)'}</p>`;
  }

  function sync() {
    if (S.kind !== 'marble') { ui.mb = null; return; }
    const s = st();
    if (S.mode !== 'warp') s.warp = null;
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'mbRounds') send({ t: 'setting', key: 'maxRounds', value: Number(e.target.value) });
  });

  function click(act, el) {
    const s = st();
    switch (act) {
      case 'mbTile': {
        const i = Number(el.dataset.i);
        if (S.mode === 'warp') {
          if (me() && me().pos === i) {
            showToast('다른 칸을 고르세요.');
            return true;
          }
          s.warp = s.warp === i ? null : i;
        } else s.info = i;
        render();
        return true;
      }
      case 'mbRoll': send({ t: 'roll' }); return true;
      case 'mbFine': send({ t: 'payFine' }); return true;
      case 'mbEscape': send({ t: 'useEscape' }); return true;
      case 'mbBuy': send({ t: 'buy' }); return true;
      case 'mbBuild': send({ t: 'build' }); return true;
      case 'mbTakeover': send({ t: 'takeover' }); return true;
      case 'mbSkip': send({ t: 'skip' }); return true;
      case 'mbSell': send({ t: 'sell', tile: Number(el.dataset.i) }); return true;
      case 'mbBankrupt': send({ t: 'bankrupt' }); return true;
      case 'mbWarp': send({ t: 'warp', tile: s.warp }); s.warp = null; return true;
      default: return false;
    }
  }

  window.GAME_UI.marble = {
    name: '부루마블', label: '🎲 부루마블', range: '2~6명', rules: RULES,
    render: renderMarble, sync, click, lobbyOptions,
    closeAll: () => { if (ui.mb) ui.mb.info = null; },
  };
}());
