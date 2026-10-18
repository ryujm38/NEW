'use strict';
// 더 크루 화면. app.js의 전역(S, ui, send, esc, showToast, render, roomTag ...)을 쓰고 GAME_UI에 등록한다.
// 꾸미기는 skin-crew.css (cw- 로 시작하는 클래스, 화면 전체는 .cw 안에).
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>더 크루 규칙 간단 설명</summary>
<p><b>3~5명</b> · 모두가 한 팀인 <b>협력</b> 카드 게임이에요. 임무 30개를 차례로 깨 나가요.</p>
<ul>
<li>카드 40장: 4색(분홍·파랑·초록·노랑) 1~9와 <b>로켓 1~4</b>. 모두 똑같이 나눠 가지고, <b>로켓 4</b>를 가진 사람이 <b>사령관</b>이에요.</li>
<li>임무마다 <b>과제 카드</b>를 펼쳐 사령관부터 한 장씩 가져가요. 과제 = 그 카드가 들어간 <b>트릭을 내가 이겨야</b> 해요. 다른 사람이 이기면 임무 실패!</li>
<li>트릭: 먼저 내는 사람은 아무 카드나. 나머지는 <b>같은 색이 있으면 꼭 같은 색</b>을 내요. 없으면 아무거나(로켓도 OK). <b>로켓이 있으면 가장 높은 로켓</b>, 없으면 처음 낸 색의 가장 높은 카드가 이겨요. 이긴 사람이 다음 트릭을 먼저 내요.</li>
<li>순서 표시: <b>①②③</b> 전체 과제 중 정확히 그 번째에, <b>› ›› ›››</b> 표시끼리 이 순서로, <b>Ω</b> 맨 마지막에 완료해야 해요. 순서 있는 과제가 다른 과제와 같은 트릭에서 함께 완료돼도 실패예요.</li>
<li><b>통신</b>: 임무마다 한 번, 트릭이 시작되기 전에 내 색 카드 한 장을 공개하며 그 색에서 <b>가장 높아요 / 하나뿐이에요 / 가장 낮아요</b> 중 사실인 것을 알려요. 로켓은 안 돼요.</li>
<li><b>카드 얘기는 금지!</b> "나 파랑 9 있어" 같은 말은 하면 안 돼요. 정보는 통신과 내는 카드로만 나눠요.</li>
<li>모든 과제를 끝내면 성공 → 다음 임무. 실패하면 같은 임무를 다시 섞어서 도전해요. 시작 임무는 대기실에서 방장이 고를 수 있어요.</li>
</ul></details>`;

  const SUIT = {
    p: { name: '분홍', sym: '✿' },
    b: { name: '파랑', sym: '◆' },
    g: { name: '초록', sym: '▲' },
    y: { name: '노랑', sym: '★' },
    r: { name: '로켓', sym: '🚀' },
  };
  const COMM = { high: { short: '위', long: '가장 높아요', ico: '▲' }, only: { short: '유일', long: '하나뿐이에요', ico: '●' }, low: { short: '아래', long: '가장 낮아요', ico: '▼' } };
  const TOKEN = { 1: '①', 2: '②', 3: '③', 4: '④', 5: '⑤', '>': '›', '>>': '››', '>>>': '›››', '>>>>': '››››', O: 'Ω' };
  const SHOW_LAST_MS = 2200; // 트릭이 끝난 뒤 가운데에 잠깐 남겨 두는 시간
  const PLAY_MS = 450;

  const st = () => {
    if (!ui.cw) ui.cw = { sel: null, task: null, comm: false, commCard: null, hide: false, peek: false };
    return ui.cw;
  };
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const who = (id) => (id === S.me ? '나' : `${pname(id)}님`);
  const suitOf = (c) => c[0];
  const valOf = (c) => Number(c.slice(1));
  const cardName = (c) => `${SUIT[suitOf(c)].name} ${valOf(c)}`;
  const initial = (id) => (player(id) ? esc([...player(id).name][0] || '?') : '?');

  function card(c, cls = '', extra = '') {
    const s = suitOf(c);
    return `<span class="cw-card s-${s} ${cls}" ${extra} aria-label="${cardName(c)}"><b>${valOf(c)}</b><i>${SUIT[s].sym}</i></span>`;
  }
  function tokenBadge(t) {
    if (!t) return '';
    const kind = t === 'O' ? 'omega' : /^\d$/.test(t) ? 'num' : 'arrow';
    return `<em class="cw-tok ${kind}" title="${kind === 'num' ? `${t}번째로 완료` : kind === 'omega' ? '맨 마지막에 완료' : '표시끼리 순서대로'}">${TOKEN[t]}</em>`;
  }
  function taskChip(t, extra = '') {
    return `<span class="cw-task s-${suitOf(t.card)} ${t.done ? 'done' : ''}" ${extra}>${tokenBadge(t.token)}<b>${valOf(t.card)}</b><i>${SUIT[suitOf(t.card)].sym}</i>${t.done ? '<span class="cw-ok">✓</span>' : ''}</span>`;
  }

  // ---- 애니메이션 시각: 상태를 처음 본 시각을 기억해 다시 그려도 처음부터 돌지 않게 ----
  const seen = new Map();
  function seenAt(key) {
    if (!seen.has(key)) {
      seen.set(key, Date.now());
      if (seen.size > 80) seen.delete(seen.keys().next().value);
    }
    return seen.get(key);
  }
  const playKey = (i) => `${S.code}:${S.tries}:${S.trickNo}:${i}`;
  const lastKey = () => (S.lastTrick ? `${S.code}:${S.tries}:last${S.lastTrick.no}` : '');

  // 가운데에 보여 줄 트릭: 진행 중인 트릭, 막 끝난 트릭(잠깐), 아니면 빈 자리
  function tableTrick() {
    if (S.trick && S.trick.plays.length) return { live: true, plays: S.trick.plays, leadId: S.trick.leadId };
    if (S.lastTrick && (S.phase === 'result' || Date.now() - seenAt(lastKey()) < SHOW_LAST_MS)) {
      return { live: false, plays: S.lastTrick.plays, leadId: S.lastTrick.plays[0].id, winnerId: S.lastTrick.winnerId, no: S.lastTrick.no };
    }
    return { live: true, plays: [], leadId: S.trick ? S.trick.leadId : null };
  }

  // ---- 임무 안내 ----

  function ruleChips(m) {
    const out = [];
    const nums = m.tokens.filter((t) => /^\d$/.test(t));
    const arrows = m.tokens.filter((t) => /^>+$/.test(t));
    if (nums.length) out.push(['order', `${nums.map((t) => TOKEN[t]).join('')} 순서대로`]);
    if (arrows.length) out.push(['order', `${arrows.map((t) => TOKEN[t]).join(' ')} 이 순서로`]);
    if (m.tokens.includes('O')) out.push(['order', 'Ω 맨 마지막']);
    if (m.noComm) out.push(['bad', '📵 통신 금지']);
    if (m.deadzone) out.push(['bad', '📶 통신 방해: 표시가 안 보여요']);
    if (m.commFrom) out.push(['bad', `📡 ${m.commFrom}번째 트릭부터 통신`]);
    if (m.commOne) out.push(['bad', `📡 사령관이 정한 1명만 통신${S && S.commPlayerId ? `: ${who(S.commPlayerId)}` : ''}`]);
    if (m.cmdFirst) out.push(['bad', '👑 첫 트릭은 사령관이 이겨야']);
    if (m.assign) out.push(['', '📋 사령관이 과제를 나눠 줘요']);
    if (m.solo) out.push(['', '🧑‍🚀 한 명이 과제를 모두 맡아요']);
    return out;
  }
  const chipsHtml = (m) => ruleChips(m).map(([k, t]) => `<span class="cw-rule ${k}">${t}</span>`).join('');

  function statusText() {
    const m = S.missionInfo;
    switch (S.phase) {
      case 'choose':
        if (S.mode === 'choose') return S.choosing === 'solo' ? '<b>사령관인 내가</b> 과제를 모두 맡을 대원을 골라요' : '<b>사령관인 내가</b> 통신할 수 있는 1명을 골라요';
        return `사령관 <b>${pname(S.commanderId)}</b>님이 ${S.choosing === 'solo' ? '과제를 맡을 대원을' : '통신할 대원을'} 고르는 중`;
      case 'tasks':
        if (S.mode === 'pick') return '<b>내 차례!</b> 가져갈 과제를 하나 골라요';
        if (S.mode === 'assign') return '<b>사령관인 내가</b> 과제를 대원에게 나눠 줘요';
        return m.assign ? `사령관 <b>${pname(S.commanderId)}</b>님이 과제를 나눠 주는 중` : `<b>${pname(S.pickerId)}</b>님이 과제를 고르는 중`;
      case 'play': {
        const lead = S.trick && !S.trick.plays.length;
        if (S.mode === 'play') return lead ? '<b>내 차례!</b> 트릭을 먼저 시작해요' : '<b>내 차례!</b> 카드를 내요';
        return `<b>${pname(S.turnId)}</b>님 차례${lead ? ' · 트릭을 시작해요' : ''}`;
      }
      case 'result': return S.result.ok ? '🎉 임무 성공!' : '💥 임무 실패';
      case 'over': return '🌌 모든 임무 완료!';
      default: return '';
    }
  }

  function bannerHtml() {
    const m = S.missionInfo;
    if (!m) return '';
    const done = S.tasks.filter((t) => t.done).length;
    const pips = S.tasks.map((t) => `<i class="${t.done ? 'on' : ''}"></i>`).join('');
    const mine = S.mode !== 'wait' && S.phase !== 'result' && S.phase !== 'over';
    return `<section class="cw-mission">
      <div class="cw-mh"><span class="cw-mno"><small>임무</small><b>${S.mission}</b><small>/${S.missionCount}</small></span>
        <span class="cw-mt"><b>${esc(m.title)}</b><small>${S.attempt > 1 ? `${S.attempt}번째 도전` : '첫 도전'}</small></span>
        <span class="cw-prog"><b>${done}/${S.tasks.length}</b><small>과제 완료</small><span class="cw-pips">${pips}</span></span></div>
      ${S.phase === 'play' ? '' : `<p class="cw-story">${esc(m.story)}</p>`}
      ${ruleChips(m).length ? `<div class="cw-rules">${chipsHtml(m)}</div>` : ''}
      <div class="cw-status ${mine ? 'mine' : ''}"><span>${statusText()}</span>${S.phase === 'play' ? `<span class="cw-tn">트릭 ${Math.min(S.trickNo + 1, S.totalTricks)}/${S.totalTricks}</span>` : ''}</div>
    </section>`;
  }

  // ---- 대원 자리 ----

  function signalHtml(p) {
    const m = S.missionInfo;
    if (p.signal) {
      const tk = p.signal.token;
      const lab = tk ? `<span class="cw-sig-t ${tk}">${COMM[tk].ico} ${COMM[tk].short}</span>` : '<span class="cw-sig-t hidden">? 잡음</span>';
      return `<span class="cw-sig ${p.signal.used ? 'used' : ''}" title="${tk ? `${cardName(p.signal.card)}: ${COMM[tk].long}` : '표시가 안 보여요'}">📡${card(p.signal.card, 'xs')}${lab}${p.signal.used ? '<small>냈어요</small>' : ''}</span>`;
    }
    if (m.noComm) return '';
    if (m.commOne && S.commPlayerId && S.commPlayerId !== p.id) return '';
    return `<span class="cw-sig none">📡 ${p.commUsed ? '사용' : '아직'}</span>`;
  }

  function seatsHtml() {
    const tasksOf = (id) => S.tasks.filter((t) => t.owner === id);
    return `<section class="cw-seats">${S.players.map((p, i) => {
      const turn = (S.phase === 'play' && p.id === S.turnId) || (S.phase === 'tasks' && (p.id === S.pickerId || (S.missionInfo.assign && p.id === S.commanderId))) || (S.phase === 'choose' && p.id === S.commanderId);
      const ts = tasksOf(p.id);
      return `<div class="cw-seat ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''} ${p.connected ? '' : 'off'}">
        <span class="cw-av">${initial(p.id)}<small>${i + 1}</small></span>
        <span class="cw-sm">
          <span class="cw-sn"><b>${esc(p.name)}</b>${p.id === S.me ? '<em>나</em>' : ''}${p.id === S.commanderId ? '<span class="cw-cmd" title="사령관">👑 사령관</span>' : ''}${p.connected ? '' : '<span class="cw-offl">끊김</span>'}</span>
          <span class="cw-si"><span title="남은 카드">🂠 ${p.count}</span><span title="이긴 트릭">🏆 ${p.won}</span>${signalHtml(p)}</span>
        </span>
        <span class="cw-stasks">${ts.length ? ts.map((t) => taskChip(t)).join('') : '<span class="cw-none">과제 없음</span>'}</span>
        ${turn ? '<span class="cw-turnb">차례</span>' : ''}
      </div>`;
    }).join('')}</section>`;
  }

  // ---- 가운데: 과제 고르기 / 트릭 ----

  function poolHtml() {
    const s = st();
    const free = S.tasks.map((t, i) => ({ t, i })).filter((x) => !x.t.owner);
    const canTap = S.mode === 'pick' || S.mode === 'assign';
    const tiles = free.map(({ t, i }) => {
      const tok = t.token ? `<small>${/^\d$/.test(t.token) ? `${t.token}번째로` : t.token === 'O' ? '맨 마지막에' : `${TOKEN[t.token]} 순서`}</small>` : '';
      const inner = `${taskChip(t)}${tok}`;
      return canTap
        ? `<button class="cw-pt ${s.task === i ? 'sel' : ''}" data-act="cwTask" data-i="${i}" aria-pressed="${s.task === i}">${inner}</button>`
        : `<span class="cw-pt">${inner}</span>`;
    }).join('');
    return `<section class="cw-pool"><h3>📋 남은 과제 ${free.length}개 <small>${S.missionInfo.assign ? `사령관이 나눠 줘요 · 한 사람에게 ${S.assignCap}개까지` : S.missionInfo.solo ? '사령관이 고른 한 명이 모두 맡아요' : '사령관부터 차례로 한 장씩'}</small></h3>
      <div class="cw-pts">${tiles}</div>
      ${S.mode === 'wait' ? '' : `<div class="cw-acts cw-pacts">${setupActs()}</div>`}
      <p class="cw-hint">과제 카드와 같은 카드가 든 트릭을 <b>가져간 사람이 이겨야</b> 해요. 내 손에 그 색의 높은 카드나 로켓이 있으면 유리해요.</p></section>`;
  }

  function tableHtml() {
    const tt = tableTrick();
    const n = S.players.length;
    const leadIdx = Math.max(0, S.players.findIndex((p) => p.id === tt.leadId));
    const order = Array.from({ length: n }, (_, k) => S.players[(leadIdx + k) % n]);
    const led = tt.plays.length ? suitOf(tt.plays[0].card) : null;
    const taskCards = new Set(S.tasks.filter((t) => !t.done || !tt.live).map((t) => t.card));
    const slots = order.map((p, k) => {
      const play = tt.plays[k];
      let inner;
      if (play) {
        const el = Date.now() - seenAt(playKey(k));
        const anim = tt.live && el < PLAY_MS ? `style="animation-delay:-${el}ms"` : '';
        const win = tt.winnerId === p.id;
        const tk = S.tasks.find((t) => t.card === play.card);
        inner = `${card(play.card, `lg ${anim ? 'in' : ''} ${win ? 'win' : ''}`, anim)}${tk && taskCards.has(play.card) ? `<span class="cw-tmark" title="과제 카드">🎯 ${who(tk.owner)}</span>` : ''}`;
      } else {
        const now = tt.live && S.phase === 'play' && p.id === S.turnId;
        inner = `<span class="cw-slot ${now ? 'now' : ''}">${now ? '…' : ''}</span>`;
      }
      return `<div class="cw-tp ${tt.winnerId === p.id ? 'win' : ''}">${inner}<span class="cw-tpn">${k === 0 ? '<i>선</i>' : ''}${who(p.id)}</span></div>`;
    }).join('');
    let head;
    if (!tt.live) head = `<b>${tt.no}번째 트릭</b> → <span class="cw-winner">🏆 ${who(tt.winnerId)} 가져가요</span>`;
    else if (led) head = `<b>${S.trickNo + 1}번째 트릭</b> · 처음 낸 색 <span class="cw-led s-${led}">${SUIT[led].sym} ${SUIT[led].name}</span>`;
    else head = `<b>${S.trickNo + 1}번째 트릭</b> · ${tt.leadId ? `${who(tt.leadId)} 먼저 내요` : ''}`;
    const last = tt.live && S.lastTrick && !led
      ? `<p class="cw-last">지난 트릭: ${S.lastTrick.plays.map((x) => card(x.card, 'xs')).join('')} → ${who(S.lastTrick.winnerId)}</p>` : '';
    return `<section class="cw-table ${tt.live ? '' : 'done'}"><div class="cw-th">${head}</div><div class="cw-tps n${n}">${slots}</div>${last}</section>`;
  }

  // ---- 아래: 내 손패와 할 일 ----

  function handHtml() {
    const s = st();
    if (!S.hand.length) return '<p class="cw-empty">손에 카드가 없어요.</p>';
    if (s.hide) return `<div class="cw-hand hidden">${S.hand.map(() => '<span class="cw-card back"></span>').join('')}</div>`;
    const legal = new Set(S.legal);
    const playing = S.mode === 'play';
    const signal = player(S.me) && player(S.me).signal;
    const groups = ['p', 'b', 'g', 'y', 'r'].map((su) => S.hand.filter((c) => suitOf(c) === su)).filter((g) => g.length);
    return `<div class="cw-hand ${playing ? 'playing' : ''}">${groups.map((g) => `<span class="cw-hg">${g.map((c) => {
      const ok = playing && legal.has(c);
      const cls = `cw-hc ${ok ? 'legal' : ''} ${playing && !ok ? 'no' : ''} ${s.sel === c ? 'sel' : ''} ${signal && signal.card === c ? 'sig' : ''}`;
      return ok
        ? `<button class="${cls}" data-act="cwCard" data-c="${c}" aria-pressed="${s.sel === c}">${card(c)}</button>`
        : `<span class="${cls}">${card(c)}</span>`;
    }).join('')}</span>`).join('')}</div>`;
  }

  const COMM_WHY = {
    noComm: '이번 임무는 통신 금지예요',
    used: '이번 임무의 통신은 이미 썼어요',
    notChosen: '이번 임무는 사령관이 정한 사람만 통신해요',
    notYet: '아직 통신할 수 없는 트릭이에요',
    midTrick: '트릭 도중에는 통신할 수 없어요',
    noCard: '지금은 사실대로 알릴 카드가 없어요',
  };

  function commButton() {
    if (S.phase !== 'play') return '';
    if (S.commOptions.length) return '<button class="cw-commbtn" data-act="cwComm">📡 통신하기 <small>임무당 1번</small></button>';
    const why = COMM_WHY[S.commBlock];
    return why && S.commBlock !== 'noComm' && S.commBlock !== 'used' ? `<span class="cw-commno">📡 ${why}</span>` : '';
  }

  function setupActs() {
    const s = st();
    const m = S.mode;
    let act = '';
    if (m === 'pick') {
      act = s.task != null && S.tasks[s.task] && !S.tasks[s.task].owner
        ? `<button class="primary cw-go" data-act="cwPick">${taskChip(S.tasks[s.task])} 이 과제 가져가기</button>`
        : '<p class="cw-msg"><b>가져갈 과제를 눌러요</b></p>';
    } else if (m === 'assign') {
      if (s.task != null && S.tasks[s.task] && !S.tasks[s.task].owner) {
        act = `<p class="cw-msg">${taskChip(S.tasks[s.task])} <b>누구에게 줄까요?</b></p><div class="cw-choices">${S.players.map((p) => {
          const have = S.tasks.filter((t) => t.owner === p.id).length;
          return `<button class="cw-choice" data-act="cwAssign" data-id="${p.id}" ${have >= S.assignCap ? 'disabled' : ''}>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}<small>${have}/${S.assignCap}개</small></button>`;
        }).join('')}</div>`;
      } else act = '<p class="cw-msg"><b>나눠 줄 과제를 먼저 눌러요</b></p>';
    } else if (m === 'choose') {
      const solo = S.choosing === 'solo';
      act = `<p class="cw-msg"><b>${solo ? '과제를 모두 맡을 대원' : '통신할 수 있는 대원'}을 골라요</b>${solo ? ' (나는 안 돼요)' : ''}</p><div class="cw-choices">${S.players.map((p) => `<button class="cw-choice" data-act="cwChoose" data-id="${p.id}" ${solo && p.id === S.me ? 'disabled' : ''}>${esc(p.name)}${p.id === S.me ? ' (나)' : ''}</button>`).join('')}</div>`;
    }
    return act;
  }

  function dockHtml() {
    const s = st();
    const m = S.mode;
    let act = '';
    if (m === 'play') {
      const lead = S.trick && !S.trick.plays.length;
      const led = !lead && S.trick ? suitOf(S.trick.plays[0].card) : null;
      const must = led && S.hand.some((c) => suitOf(c) === led) ? `${SUIT[led].name}을 내야 해요` : led ? `${SUIT[led].name}이 없어서 아무거나 낼 수 있어요` : '아무 카드나 낼 수 있어요';
      act = s.sel
        ? `<button class="primary cw-go" data-act="cwPlay">${card(s.sel, 'xs')} 이 카드 내기</button>`
        : `<p class="cw-msg"><b>낼 카드를 눌러요</b> · ${must}</p>`;
    } else if (S.phase === 'play') {
      act = `<p class="cw-msg wait">⏳ <b>${pname(S.turnId)}</b>님 차례예요</p>`;
    } else if ((S.phase === 'tasks' || S.phase === 'choose') && m === 'wait') {
      act = '<p class="cw-msg wait">⏳ 과제를 나누는 중이에요. 내 손패를 보며 계획해요.</p>';
    }
    const sig = player(S.me) && player(S.me).signal;
    const setup = S.phase === 'tasks' || S.phase === 'choose';
    return `<div class="bdock cw-dock ${setup ? 'static' : ''}">
      <div class="cw-dh"><span>🖐 내 손패 <b>${S.hand.length}</b>장${sig ? ` · 📡 ${cardName(sig.card)} 공개 중` : ''}</span>
        <button class="sm ghost cw-hide" data-act="cwHide" aria-pressed="${s.hide}">${s.hide ? '👁 보기' : '🙈 가리기'}</button></div>
      ${handHtml()}
      ${act || commButton() ? `<div class="cw-acts">${act}${commButton()}</div>` : ''}
    </div>`;
  }

  function commSheet() {
    const s = st();
    if (!s.comm) return '';
    const opts = new Map(S.commOptions.map((o) => [o.card, o.token]));
    const colored = S.hand.filter((c) => suitOf(c) !== 'r');
    const pickedTok = s.commCard ? opts.get(s.commCard) : null;
    const dz = S.missionInfo.deadzone;
    return `<div class="overlay" data-act="closeall"><div class="sheet cw-sheet">
      <h2>📡 통신하기</h2>
      <p class="small dim">내 색 카드 한 장을 모두에게 보여 주고, 그 색에서 <b>가장 높은지 / 하나뿐인지 / 가장 낮은지</b> 알려요. 사실인 것만 고를 수 있어요. 카드는 손에 남아요.${dz ? ' <b>이번 임무는 통신 방해</b>: 다른 사람에겐 카드만 보이고 표시는 안 보여요.' : ''}</p>
      <div class="cw-cpick">${colored.map((c) => {
        const tk = opts.get(c);
        return tk
          ? `<button class="cw-cc ${s.commCard === c ? 'sel' : ''}" data-act="cwCommCard" data-c="${c}">${card(c)}<small>${COMM[tk].short}</small></button>`
          : `<span class="cw-cc no">${card(c)}<small>안 돼요</small></span>`;
      }).join('')}</div>
      <div class="cw-ctoks">${Object.entries(COMM).map(([k, v]) => `<button class="cw-ctok ${k} ${pickedTok === k ? 'ok' : ''}" data-act="cwCommSend" data-t="${k}" ${pickedTok === k ? '' : 'disabled'}>${v.ico} ${v.long}</button>`).join('')}</div>
      <p class="small dim">${s.commCard ? `${cardName(s.commCard)}: <b>${COMM[pickedTok].long}</b>를 눌러 보내요.` : '먼저 위에서 카드를 골라요. 가운데 카드(가장 높지도 낮지도 않은 카드)와 로켓은 통신할 수 없어요.'}</p>
      <button class="ghost" data-act="closeall">닫기</button>
    </div></div>`;
  }

  // ---- 결과 / 끝 ----

  function resultHtml(isHost) {
    if (S.phase !== 'result') return '';
    const s = st();
    const ok = S.result.ok;
    if (s.peek) {
      return `<div class="cw-peekbar ${ok ? 'ok' : 'bad'}"><b>${ok ? '🎉 임무 성공' : '💥 임무 실패'}</b><button class="sm" data-act="cwPeek">결과 다시 보기</button></div>`;
    }
    const last = S.mission >= S.missionCount;
    const btn = isHost
      ? `<button class="primary cw-next" data-act="cwNext">${ok ? (last ? '🌌 캠페인 마치기' : `다음 임무 ▶ ${S.mission + 1}번`) : '↻ 다시 도전'}</button>
         <button class="sm ghost" data-act="again" data-confirm="대기실로 돌아갈까요? 다음에 이어서 할 임무는 기억해 둬요.">대기실로</button>`
      : `<p class="progress">방장이 ${ok ? '다음 임무' : '다시 도전'}을 누르길 기다리는 중…</p>`;
    return `<div class="cw-result ${ok ? 'ok' : 'bad'}"><div class="cw-rc">
      <div class="cw-rbig">${ok ? '🎉' : '💥'}</div>
      <h2>임무 ${S.mission} ${ok ? '성공!' : '실패'}</h2>
      <p class="cw-rr">${esc(S.result.reason)}</p>
      <div class="cw-rtasks">${S.tasks.map((t) => `<span class="cw-rt">${taskChip(t)}<small>${who(t.owner)}</small></span>`).join('')}</div>
      <p class="small dim">${ok ? `${S.attempt}번 만에 해냈어요.` : '같은 임무를 카드를 새로 섞어서 다시 해요.'}</p>
      ${btn}
      <button class="sm ghost" data-act="cwPeek">판 보기</button>
    </div></div>`;
  }

  function overHtml(isHost) {
    return `<section class="cw-over"><div class="cw-ob">🌌</div><h2>${S.missionCount}개 임무 모두 완료!</h2>
      <p>미지의 행성에 무사히 도착했어요. 이 방에서 모두 <b>${S.tries}번</b> 도전했어요.</p>
      ${isHost ? '<button class="primary" data-act="restart">1번 임무부터 다시</button><button data-act="again" style="margin-top:8px">대기실로 돌아가기</button>' : '<p class="progress">방장이 다시 시작하길 기다리는 중…</p>'}</section>`;
  }

  function hostMenu() {
    const labels = {
      choose: '사령관 대신 정하기',
      tasks: S.missionInfo && S.missionInfo.assign ? '사령관 대신 과제 1개 나눠 주기' : '고르는 사람 대신 첫 과제 가져가기',
      play: `${S.turnId ? pname(S.turnId) : ''}님 대신 가장 낮은 카드 내기`,
      result: S.result && S.result.ok ? '다음 임무로' : '다시 도전',
    };
    const f = labels[S.phase];
    return `<div class="overlay" data-act="closeall"><div class="sheet">
      <h2>방장 메뉴</h2>
      <p class="dim small">누르면 모든 사람의 화면이 바로 바뀌어요.</p>
      ${f ? `<button data-act="force" data-confirm="${esc(`자리를 비운 사람 대신 진행할까요? (${f})`)}">${esc(f)}</button>` : ''}
      ${S.phase !== 'over' ? '<button class="primary" data-act="restart" data-confirm="카드를 새로 섞어서 이 임무를 처음부터 다시 할까요?">이 임무 처음부터 다시</button>' : ''}
      <button data-act="again" data-confirm="대기실로 돌아갈까요? 지금 임무 번호는 기억해 둬요.">대기실로 (시작 임무 다시 고르기)</button>
      <button class="ghost" data-act="closeall">닫기</button>
    </div></div>`;
  }

  function renderCrew() {
    const isHost = S.hostId === S.me;
    const log = S.log.length ? `<div class="ulog cw-log">${S.log.slice(-4).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    if (S.phase === 'over') {
      return `<div class="top"><span>${roomTag()}</span><span class="cw-top">🚀 더 크루</span></div>
      <div class="cw">${overHtml(isHost)}${log}</div>`;
    }
    const mid = S.phase === 'choose' || S.phase === 'tasks' ? poolHtml() : tableHtml();
    return `<div class="top"><span>${roomTag()}</span><span class="cw-top">🚀 더 크루</span></div>
    <div class="cw">
      ${bannerHtml()}
      ${mid}
      ${seatsHtml()}
      ${log}
      ${isHost ? '<div class="foot cw-foot"><button class="sm ghost" data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
      ${dockHtml()}
      ${resultHtml(isHost)}
    </div>
    ${commSheet()}
    ${ui.hostOpen && isHost ? hostMenu() : ''}`;
  }

  // ---- 대기실: 시작 임무 고르기 ----

  function lobbyOptions(isHost) {
    if (!S.missions) return '';
    const cur = S.settings.startMission;
    const opts = S.missions.map((m) => `<option value="${m.no}" ${m.no === cur ? 'selected' : ''}>임무 ${m.no} · ${esc(m.title)} ${m.no <= S.cleared ? ' ✓' : ''}</option>`).join('');
    const m = S.missions[cur - 1];
    return `<label class="opt"><span>시작 임무</span><select id="cwStart" ${isHost ? '' : 'disabled'}>${opts}</select></label>
      <div class="cw-lm"><b>임무 ${m.no} · ${esc(m.title)}</b><span>${esc(m.story)}</span><span class="cw-lr"><span class="cw-rule">📋 과제 ${m.n}개</span>${chipsHtml(m)}</span></div>
      <p class="small dim" style="margin:0 0 8px">${S.cleared ? `이 방에서 임무 ${S.cleared}까지 깼어요. ` : ''}성공하면 다음 임무로 자동으로 넘어가요. 다른 날 이어서 하려면 여기서 임무 번호를 골라요.${isHost ? '' : ' (방장이 정해요)'}</p>`;
  }

  document.addEventListener('change', (e) => {
    if (e.target && e.target.id === 'cwStart') send({ t: 'setting', key: 'startMission', value: Number(e.target.value) });
  });

  // ---- 새 상태가 올 때 ----
  function sync() {
    if (!S || S.kind !== 'crew') return;
    const s = st();
    if (S.phase === 'lobby') { s.sel = null; s.task = null; s.comm = false; s.peek = false; return; }
    if (S.mode !== 'play' || !S.legal.includes(s.sel)) s.sel = null;
    if ((S.mode !== 'pick' && S.mode !== 'assign') || !S.tasks[s.task] || S.tasks[s.task].owner) s.task = null;
    if (!S.commOptions.length) { s.comm = false; s.commCard = null; }
    if (s.commCard && !S.commOptions.some((o) => o.card === s.commCard)) s.commCard = null;
    if (S.phase !== 'result') s.peek = false;
    // 막 나온 카드·끝난 트릭의 시각을 기록
    if (S.trick) S.trick.plays.forEach((_, i) => seenAt(playKey(i)));
    if (S.lastTrick) seenAt(lastKey());
  }

  let timer = null;
  function afterRender() {
    if (!S || S.kind !== 'crew' || S.phase !== 'play') return;
    clearTimeout(timer);
    if (S.lastTrick && (!S.trick || !S.trick.plays.length)) {
      const left = SHOW_LAST_MS - (Date.now() - seenAt(lastKey()));
      if (left > 0) timer = setTimeout(() => render(), left + 30);
    }
  }

  function click(act, el) {
    if (!S || S.kind !== 'crew') return false;
    const s = st();
    switch (act) {
      case 'cwCard': {
        const c = el.dataset.c;
        if (s.sel === c) send({ t: 'play', card: c });
        else s.sel = c;
        render();
        return true;
      }
      case 'cwPlay': if (s.sel) send({ t: 'play', card: s.sel }); return true;
      case 'cwTask': s.task = Number(el.dataset.i); render(); return true;
      case 'cwPick': if (s.task != null) send({ t: 'pick', index: s.task }); return true;
      case 'cwAssign': if (s.task != null) send({ t: 'assign', index: s.task, target: el.dataset.id }); return true;
      case 'cwChoose': send({ t: 'choose', target: el.dataset.id }); return true;
      case 'cwComm': s.comm = true; s.commCard = null; render(); return true;
      case 'cwCommCard': s.commCard = el.dataset.c; render(); return true;
      case 'cwCommSend':
        if (s.commCard) send({ t: 'comm', card: s.commCard, token: el.dataset.t });
        s.comm = false;
        s.commCard = null;
        render();
        return true;
      case 'cwHide': s.hide = !s.hide; render(); return true;
      case 'cwPeek': s.peek = !s.peek; render(); return true;
      case 'cwNext': send({ t: 'next' }); return true;
      default: return false;
    }
  }

  window.GAME_UI.crew = {
    name: '더 크루', label: '🚀 더 크루', range: '3~5명', rules: RULES, render: renderCrew, sync, click, afterRender, lobbyOptions,
    closeAll: () => { if (ui.cw) { ui.cw.comm = false; ui.cw.commCard = null; } },
    cardName,
  };
}());
