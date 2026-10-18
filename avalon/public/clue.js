'use strict';
// 클루(원피스 한글판, 보드 없이) 화면. app.js의 전역(S, ui, send, esc, showToast, render, genericHostMenu ...)을 쓰고 GAME_UI에 등록한다.
// 꾸미기는 skin-clue.css (cl- 로 시작하는 클래스).
// 추리 노트는 각자 폰의 localStorage에만 저장하고 서버로 보내지 않는다 (방 코드 + 판 번호 + 내 id 별로).
// 비밀이 옆 사람에게 보이지 않게: 카드는 종류와 상관없이 모두 같은 양피지 색·같은 모양으로 그린다.
(function () {
  window.GAME_UI = window.GAME_UI || {};

  const RULES = `
<details><summary>클루 규칙 간단 설명</summary>
<p><b>2~6명</b> · 원피스 한글판 카드로, 보드 없이 질문과 추리만으로 해요. <b>누가 · 무엇을 · 어디에</b>(정답 봉투의 3장)를 가장 먼저 맞히면 이겨요.</p>
<ul>
<li>카드 21장: <b>인물 6</b>(루피·조로·상디 + 나미/우솝, 초파/브룩, 프랑키/로빈 중 1명씩) · <b>보물 6</b> · <b>섬 9</b>. 종류마다 1장씩 몰래 <b>정답 봉투</b>에 들어가요.</li>
<li>남은 18장을 나눠요: 2명 6장 · 3명 6장 · 4명 4장 · 5명 3장 · 6명 3장. 남는 카드(4명 2장, 5명 3장)는 모두에게 공개. 2명이면 6장이 남는데 5장은 아무도 모르는 <b>소문 카드</b>, 1장은 공개예요.</li>
<li>내 차례에 <b>질문</b>: 인물+보물+섬을 하나씩 말해요. 내 왼쪽(다음 사람)부터 차례로, 셋 중 하나라도 가진 <b>첫 사람이 1장만 나에게 몰래</b> 보여 주고 끝나요. 없는 사람은 패스.</li>
<li>질문 뒤(또는 질문 대신) <b>고발</b>할 수 있어요. 맞으면 승리! 틀리면 그 판은 더 추리할 수 없고 차례도 건너뛰지만, 질문을 받으면 카드는 계속 보여 줘야 해요. 모두 틀리면 아무도 못 이겨요.</li>
<li>각자 <b>추리 노트</b>에 ✓ 있음 · ✕ 없음 · ? 의심을 직접 표시하며 추리해요. 노트는 내 폰에만 저장돼요.</li>
</ul></details>`;

  const CAT_LABEL = { who: '누가', what: '무엇을', where: '어디에' };
  const CAT_NAME = { who: '인물', what: '보물', where: '섬' };
  const CATS = ['who', 'what', 'where'];
  const MARKS = ['', 'y', 'n', 'q']; // 빈칸 → ✓ → ✕ → ? → 빈칸
  const MARK_TXT = { y: '✓', n: '✕', q: '?' };
  const FLIP_MS = 700;

  const st = () => {
    if (!ui.cl) ui.cl = { tab: 'play', compose: null, sel: {}, pick: null, peek: null, seen: [], key: '' };
    return ui.cl;
  };
  const player = (id) => S.players.find((p) => p.id === id);
  const pname = (id) => (player(id) ? esc(player(id).name) : '?');
  const meP = () => player(S.me);
  const cardMap = () => {
    if (!cardMap.cache || cardMap.cache.src !== S.cards) cardMap.cache = { src: S.cards, m: Object.fromEntries(S.cards.map((c) => [c.id, c])) };
    return cardMap.cache.m;
  };
  const C = (id) => cardMap()[id] || { id, name: '?', short: '?', icon: '❔', cat: 'who' };
  const cname = (id) => esc(C(id).name);
  const tripleTxt = (q) => `${cname(q.who)} · ${cname(q.what)} · ${cname(q.where)}`;
  // 받침에 맞는 조사: eul('검') → '을', ro('펑크 하자드') → '로' (ㄹ 받침도 '로')
  const jong = (w) => { const c = String(w).charCodeAt(String(w).length - 1) - 0xac00; return c >= 0 && c < 11172 ? c % 28 : 0; };
  const eul = (w) => (jong(w) ? '을' : '를');
  const ro = (w) => (jong(w) && jong(w) !== 8 ? '으로' : '로');
  const initial = (id) => (player(id) ? esc([...player(id).name][0] || '?') : '?');

  // 카드 칩: 종류와 상관없이 같은 양피지 모양 (멀리서 색으로 무슨 카드인지 알 수 없게)
  function chip(id, extra = '', style = '') {
    const c = C(id);
    return `<span class="cl-card ${extra}"${style}><i aria-hidden="true">${c.icon}</i><b>${esc(c.name)}</b></span>`;
  }

  // 좌석 순서: 내 왼쪽(다음 자리)부터 시계 방향 — 내가 질문할 때 묻는 순서와 같다
  function othersFromMyLeft() {
    const i = S.players.findIndex((p) => p.id === S.me);
    if (i < 0) return S.players.slice();
    return [...S.players.slice(i + 1), ...S.players.slice(0, i)];
  }

  // ---- 추리 노트 (localStorage, 서버로 보내지 않음) ----
  const NB_PREFIX = 'clue-nb:';
  let nb = { key: null, m: {} };
  const nbKey = () => `${NB_PREFIX}${S.code}:${S.gameNo}:${S.me}`;
  function nbMarks() {
    const key = nbKey();
    if (nb.key !== key) {
      let m = {};
      try { const raw = JSON.parse(localStorage.getItem(key)); if (raw && raw.m && typeof raw.m === 'object') m = raw.m; } catch { /* 없으면 빈 노트 */ }
      nb = { key, m };
    }
    return nb.m;
  }
  function nbSave() {
    try {
      localStorage.setItem(nb.key, JSON.stringify({ t: Date.now(), m: nb.m }));
      // 지난 판 노트는 최근 12개만 남긴다
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(NB_PREFIX)) keys.push(k); }
      if (keys.length > 12) {
        const items = keys.map((k) => { let t = 0; try { t = JSON.parse(localStorage.getItem(k)).t || 0; } catch { /* noop */ } return { k, t }; }).sort((a, b) => a.t - b.t);
        items.slice(0, items.length - 12).forEach((x) => localStorage.removeItem(x.k));
      }
    } catch { /* 저장을 못 해도 이번 화면에서는 동작 */ }
  }
  function nbCols() {
    const cols = othersFromMyLeft().map((p) => ({ key: p.id, label: esc([...p.name].slice(0, 3).join('')), title: esc(p.name), out: p.out }));
    cols.push({ key: 'env', label: '봉투', title: '정답 봉투', env: true });
    if (S.rumorCount) cols.push({ key: 'rumor', label: '소문', title: '소문 카드', rumor: true });
    return cols;
  }
  // 내가 직접 아는 사실만 자동으로: 내 카드, 공개 카드, 나에게 보여 준 카드(보여 준 사람 칸 ✓, 다른 칸 ✕)
  function nbAuto() {
    const auto = {};
    const all = nbCols().map((c) => c.key);
    const no = (id) => { auto[id] = auto[id] || {}; all.forEach((k) => { auto[id][k] = 'n'; }); };
    S.hand.forEach(no);
    S.publicCards.forEach(no);
    S.history.forEach((h) => {
      // 보여 받은 카드는 그 사람 것: 그 칸 ✓, 나머지 칸(봉투 포함)은 ✕
      if (h.by === S.me && h.card && h.shower) {
        auto[h.card] = {};
        all.forEach((k) => { auto[h.card][k] = k === h.shower ? 'y' : 'n'; });
      }
    });
    return auto;
  }
  const shownToMe = () => {
    const out = {};
    S.history.forEach((h) => { if (h.by === S.me && h.card) out[h.card] = h.shower; });
    return out;
  };

  function notebookHtml() {
    const marks = nbMarks();
    const auto = nbAuto();
    const cols = nbCols();
    const seen = shownToMe();
    const head = `<div class="cl-nb-r cl-nb-head"><span class="cl-nb-name">카드</span>${cols.map((c) => `<span class="cl-nb-ch ${c.env ? 'env' : ''} ${c.out ? 'out' : ''}" title="${c.title}">${c.label}</span>`).join('')}</div>`;
    const body = CATS.map((cat) => {
      const rows = S.cards.filter((c) => c.cat === cat).map((c) => {
        const mine = S.hand.includes(c.id);
        const pub = S.publicCards.includes(c.id);
        const tag = mine ? '<em class="t-me">내 카드</em>' : pub ? '<em class="t-pub">공개</em>' : seen[c.id] ? `<em class="t-seen">${pname(seen[c.id])}</em>` : '';
        const cells = cols.map((col) => {
          const a = auto[c.id] && auto[c.id][col.key];
          const v = a || (marks[c.id] && marks[c.id][col.key]) || '';
          return `<button class="cl-nb-c ${v ? `m-${v}` : ''} ${a ? 'fixed' : ''} ${col.env ? 'env' : ''}" data-act="clMark" data-card="${c.id}" data-col="${col.key}" aria-label="${esc(c.name)} · ${col.title} ${v ? MARK_TXT[v] : '빈칸'}">${v ? MARK_TXT[v] : ''}</button>`;
        }).join('');
        return `<div class="cl-nb-r ${mine || pub ? 'known' : ''}"><span class="cl-nb-name"><i aria-hidden="true">${c.icon}</i><span>${esc(c.short)}${tag}</span></span>${cells}</div>`;
      }).join('');
      return `<div class="cl-nb-cat">${CAT_LABEL[cat]} · ${CAT_NAME[cat]}</div>${rows}`;
    }).join('');
    return `<section class="cl-nb ${cols.length >= 5 ? 'many' : ''}" style="--cols:${cols.length}">
      <div class="cl-nb-top"><b>📓 내 추리 노트</b><small>칸을 누를 때마다 ✓ 있음 → ✕ 없음 → ? 의심 → 빈칸. 진한 칸은 확실한 사실(자동). 내 폰에만 저장돼요.</small></div>
      <div class="cl-nb-grid">${head}${body}</div>
      <div class="cl-nb-legend"><span>열: 내 왼쪽부터 시계 방향 · 봉투 = 정답 봉투${S.rumorCount ? ' · 소문 = 소문 카드' : ''}</span>
        <button class="sm ghost cl-nb-clear" data-act="clClear" data-confirm="내가 직접 표시한 것만 모두 지울까요? (자동으로 채운 칸은 남아요)">내 표시 지우기</button></div>
    </section>`;
  }

  // ---- 위쪽: 상태 · 사람들 ----

  function statusHtml() {
    const m = S.mode;
    const q = S.question;
    let icon = '🔎';
    let text;
    if (S.phase === 'over') {
      icon = S.winnerId ? '🏆' : '💀';
      text = S.winnerId ? `<b>${S.winnerId === S.me ? '내가' : `${pname(S.winnerId)}님이`}</b> 사건을 해결했어요! 정답이 공개됐어요` : '<b>아무도 못 맞혔어요</b> · 정답이 공개됐어요';
    }
    else if (m === 'ask') text = '<b>내 차례!</b> 질문하거나 고발해요';
    else if (m === 'after') { icon = '🧭'; text = '<b>내 차례</b> · 결과를 보고 고발하거나 차례를 끝내요'; }
    else if (m === 'respond') { icon = '🃏'; text = `<b>${pname(q.by)}</b>님에게 카드 1장을 보여 줘야 해요`; }
    else if (S.step === 'respond' && q) { icon = '⏳'; text = `<b>${pname(q.shower)}</b>님이 ${q.by === S.me ? '<b>나</b>' : `<b>${pname(q.by)}</b>님`}에게 보여 줄 카드를 고르는 중`; }
    else if (S.step === 'after') { icon = '🧭'; text = `<b>${pname(S.turnId)}</b>님이 결과를 보고 고민하는 중`; }
    else text = `<b>${pname(S.turnId)}</b>님 차례 · 질문을 고르는 중`;
    const mine = m === 'ask' || m === 'after' || m === 'respond';
    return `<div class="cl-status ${mine ? 'mine' : ''}"><span class="cl-st-i" aria-hidden="true">${icon}</span><span class="cl-st-t">${text}</span>${S.phase === 'play' ? `<span class="cl-st-n">${S.turnNo}번째 차례</span>` : ''}</div>`;
  }

  // 사람 줄: 자리 순서(시계 방향). 이번 질문에서 패스/보여 줌을 같이 보여 준다
  function playersHtml() {
    const q = S.question;
    return `<div class="cl-players">${S.players.map((p, i) => {
      let tag = '';
      if (q) {
        if (p.id === q.by) tag = '<em class="ask">🔍 질문</em>';
        else if (q.passed.includes(p.id)) tag = '<em class="pass">✕ 패스</em>';
        else if (p.id === q.shower) tag = q.card || S.step !== 'respond' ? '<em class="show">🃏 보여 줌</em>' : `<em class="wait" style="animation-delay:-${Date.now() % 1200}ms">⏳ 고르는 중</em>`;
        else tag = '<em class="skip">– 안 물음</em>';
      }
      const turn = p.id === S.turnId;
      return `<div class="cl-pl ${turn ? 'turn' : ''} ${p.id === S.me ? 'me' : ''} ${p.out ? 'out' : ''}">
        <span class="cl-pl-seat">${i + 1}</span>
        <span class="cl-pl-nm">${esc(p.name)}${p.id === S.me ? '<small>나</small>' : ''}</span>
        <span class="cl-pl-sub">${p.out ? '<em class="out">고발 실패</em>' : turn && !tag ? '<em class="turn">차례</em>' : ''}${p.connected ? '' : '<em class="off">끊김</em>'}${tag ? `<span class="cl-pl-q">${tag}</span>` : ''}</span>
      </div>`;
    }).join('')}</div>`;
  }

  // ---- 지금 질문 ----

  function chainHtml(q) {
    const after = q.shower ? q.order.indexOf(q.shower) : q.order.length;
    return `<div class="cl-chain">${q.order.map((pid, k) => {
      let cls = 'skip';
      let t = '안 물음';
      if (q.passed.includes(pid)) { cls = 'pass'; t = '✕ 없음'; }
      else if (pid === q.shower) { cls = q.card || S.step !== 'respond' ? 'show' : 'wait'; t = cls === 'show' ? '🃏 보여 줌' : '⏳ 고르는 중'; }
      return `${k ? '<i class="cl-arrow" aria-hidden="true">›</i>' : ''}<span class="cl-link ${cls} ${k > after ? 'dim' : ''}"><b>${pname(pid)}</b><small>${t}</small></span>`;
    }).join('')}</div>`;
  }

  // 보여 받은 카드: 뒤집힌 카드를 눌러야 앞면이 보인다 (옆 사람이 우연히 보지 않게)
  function peekHtml(q) {
    const s = st();
    const open = s.peek === q.seq;
    if (!open) {
      return `<button class="cl-peek" data-act="clPeek" data-seq="${q.seq}"><span class="cl-back" aria-hidden="true">${compassSvg()}</span>
        <span class="cl-peek-t"><span><b>${pname(q.shower)}</b>님이 보여 준 카드</span><small>눌러서 몰래 확인해요</small></span></button>`;
    }
    const el = s.peekAt ? Date.now() - s.peekAt : Infinity;
    const anim = el < FLIP_MS ? ` style="animation-delay:-${el}ms"` : '';
    return `<button class="cl-peek open" data-act="clPeek" data-seq="${q.seq}">${chip(q.card, `big ${el < FLIP_MS ? 'flip' : ''}`, anim)}
      <span class="cl-peek-t"><span><b>${pname(q.shower)}</b>님이 보여 준 카드</span><small>노트에 자동으로 ✓ 했어요 · 누르면 다시 가려요</small></span></button>`;
  }

  function questionHtml() {
    const q = S.question;
    if (!q) return '';
    let res = '';
    if (q.by === S.me) {
      if (q.card) res = peekHtml(q);
      else if (!q.shower) res = '<p class="cl-q-res none">😮 아무도 보여 주지 못했어요! 셋 다 다른 사람에게는 없어요.</p>';
    } else if (q.shower === S.me && q.card) {
      res = `<p class="cl-q-res">내가 ${pname(q.by)}님에게 <b>${cname(q.card)}</b>${eul(C(q.card).name)} 보여 줬어요.</p>`;
    } else if (!q.shower && S.step !== 'respond') {
      res = '<p class="cl-q-res none">😮 아무도 보여 주지 못했어요!</p>';
    } else if (q.card === null && q.shower && S.step !== 'respond') {
      res = `<p class="cl-q-res dim">🃏 ${pname(q.shower)}님이 ${pname(q.by)}님에게만 몰래 보여 줬어요.</p>`;
    }
    return `<section class="cl-q">
      <div class="cl-q-h">🔍 <b>${q.by === S.me ? '나' : `${pname(q.by)}님`}</b>의 질문</div>
      <div class="cl-q-cards">${CATS.map((cat) => `<span class="cl-q-slot"><small>${CAT_LABEL[cat]}</small>${chip(q[cat])}</span>`).join('')}</div>
      ${chainHtml(q)}
      ${res}
    </section>`;
  }

  // ---- 공개 정보 · 내 카드 ----

  function publicHtml() {
    const acc = S.accusations.length
      ? `<div class="cl-acc">${S.accusations.map((a) => `<span class="cl-acc-r ${a.ok ? 'ok' : ''}">${a.ok ? '🏆' : '❌'} <b>${pname(a.by)}</b> ${tripleTxt(a)}</span>`).join('')}</div>` : '';
    const pub = S.publicCards.length ? `<div class="cl-row"><span class="cl-lbl">📢 공개 카드</span><span class="cl-cards">${S.publicCards.map((id) => chip(id, 'sm')).join('')}</span></div>` : '';
    const rumor = S.rumorCount ? `<div class="cl-row"><span class="cl-lbl">💬 소문 카드</span><span class="cl-rumor">${Array.from({ length: S.rumorCount }, () => '<i></i>').join('')}<small>${S.rumorCount}장 · 아무도 몰라요</small></span></div>` : '';
    if (!pub && !rumor && !acc) return '';
    return `<section class="cl-pub">${pub}${rumor}${acc ? `<div class="cl-row col"><span class="cl-lbl">⚖️ 고발 기록</span>${acc}</div>` : ''}</section>`;
  }

  function handHtml() {
    if (!S.hand.length) return '';
    const shown = S.myShown || {};
    return `<section class="cl-hand"><div class="cl-hand-h"><b>🃏 내 카드 ${S.hand.length}장</b><small>모두 ${S.handSize}장씩 · 나만 보여요 · 👁 = 보여 준 사람 수</small></div>
      <div class="cl-cards">${S.hand.map((id) => {
        const n = (shown[id] || []).length;
        return `<span class="cl-hc">${chip(id, 'sm')}${n ? `<em title="${(shown[id] || []).map(pname).join(', ')}">👁${n}</em>` : ''}</span>`;
      }).join('')}</div></section>`;
  }

  // ---- 기록 탭 ----

  function historyHtml() {
    const mineQ = S.history.filter((h) => h.by === S.me || h.shower === S.me).slice().reverse();
    const mine = mineQ.length ? mineQ.map((h) => {
      if (h.by === S.me) {
        const r = h.card ? `→ <b>${pname(h.shower)}</b>님이 ${chip(h.card, 'xs')} 보여 줌` : h.shower ? `→ ${pname(h.shower)}님이 고르는 중` : '→ <b>아무도 없음</b>';
        return `<div class="cl-h me"><span class="cl-h-n">#${h.seq}</span><span>내 질문 <b>${tripleTxt(h)}</b> ${r}</span></div>`;
      }
      return `<div class="cl-h gave"><span class="cl-h-n">#${h.seq}</span><span>${pname(h.by)}님 질문 <b>${tripleTxt(h)}</b> → 내가 ${h.card ? chip(h.card, 'xs') : '(고르는 중)'} 보여 줌</span></div>`;
    }).join('') : '<p class="cl-empty">아직 없어요. 내가 질문하거나 카드를 보여 주면 여기에 남아요.</p>';
    const all = S.history.length ? S.history.slice().reverse().map((h) => {
      const passed = h.passed.length ? `<span class="pass">✕ ${h.passed.map(pname).join(', ')}</span>` : '';
      const res = h.shower ? `<span class="show">🃏 ${pname(h.shower)}${h.card === null && S.step === 'respond' && S.question && S.question.seq === h.seq ? ' (고르는 중)' : ''}</span>` : '<span class="none">아무도 없음</span>';
      return `<div class="cl-h ${h.by === S.me ? 'me' : ''}"><span class="cl-h-n">#${h.seq}</span><span><b>${pname(h.by)}</b> ${tripleTxt(h)}<br>${passed}${res}</span></div>`;
    }).join('') : '<p class="cl-empty">아직 질문이 없어요.</p>';
    return `<section class="cl-hist"><h3>📒 내 기록 <small>나만 보여요</small></h3>${mine}</section>
      <section class="cl-hist"><h3>📜 모두의 질문 <small>✕ 패스 · 🃏 보여 준 사람</small></h3>${all}</section>`;
  }

  // ---- 질문/고발 고르기 ----

  function composerHtml() {
    const s = st();
    if (!s.compose) return '';
    const accuse = s.compose === 'accuse';
    const seen = shownToMe();
    const sections = CATS.map((cat) => {
      const chips = S.cards.filter((c) => c.cat === cat).map((c) => {
        const tag = S.hand.includes(c.id) ? '<em>내 카드</em>' : S.publicCards.includes(c.id) ? '<em>공개</em>' : seen[c.id] ? `<em>${pname(seen[c.id])}</em>` : '';
        return `<button class="cl-opt ${s.sel[cat] === c.id ? 'on' : ''}" data-act="clSel" data-cat="${cat}" data-id="${c.id}"><i aria-hidden="true">${c.icon}</i><b>${esc(c.short)}</b>${tag}</button>`;
      }).join('');
      return `<div class="cl-cs"><div class="cl-cs-h"><b>${CAT_LABEL[cat]}</b> ${CAT_NAME[cat]}</div><div class="cl-opts ${cat}">${chips}</div></div>`;
    }).join('');
    const ready = CATS.every((cat) => s.sel[cat]);
    const summary = ready ? CATS.map((cat) => cname(s.sel[cat])).join(' · ') : '세 가지를 하나씩 골라요';
    const accName = CATS.map((cat) => C(s.sel[cat] || '').name).join(' · ');
    const confirm = accuse ? ` data-confirm="${esc(`${accName}${ro(accName)} 고발할까요? 틀리면 이번 판은 더 추리할 수 없어요.`)}"` : '';
    return `<div class="overlay" data-act="closeall"><div class="sheet cl-sheet ${accuse ? 'accuse' : ''}">
      <h2>${accuse ? '⚖️ 고발하기' : '🔍 질문하기'}</h2>
      <p class="cl-sheet-sub">${accuse ? '정답 봉투의 3장을 맞혀요. <b>맞으면 승리</b>, 틀리면 이번 판은 구경하며 카드만 보여 줘요.' : '내 왼쪽 사람부터 차례로, 셋 중 하나를 가진 첫 사람이 1장을 몰래 보여 줘요. 내 카드를 섞어서 물어도 돼요.'}</p>
      ${sections}
      <div class="cl-sheet-foot"><p class="cl-sum ${ready ? 'ok' : ''}">${summary}</p>
        <button class="${accuse ? 'cl-accbtn' : 'primary'}" data-act="clSubmit" ${ready ? '' : 'disabled'}${confirm}>${accuse ? '⚖️ 이대로 고발하기' : '🔍 이대로 질문하기'}</button>
        <button class="ghost" data-act="closeall">닫기</button></div>
    </div></div>`;
  }

  // ---- 카드 보여 주기 ----

  function respondHtml() {
    const s = st();
    const q = S.question;
    const matches = CATS.map((cat) => q[cat]).filter((id) => S.hand.includes(id));
    const shown = S.myShown || {};
    const before = S.hand.filter((id) => (shown[id] || []).includes(q.by));
    const picks = matches.map((id) => {
      const who = shown[id] || [];
      const hint = who.includes(q.by) ? `<em class="again">이미 ${pname(q.by)}님에게 보여 준 카드</em>`
        : who.length ? `<em>본 사람: ${who.map(pname).join(', ')}</em>` : '<em class="new">아직 아무에게도 안 보여 줬어요</em>';
      return `<button class="cl-pick ${s.pick === id ? 'on' : ''}" data-act="clPick" data-id="${id}">${chip(id)}${hint}</button>`;
    }).join('');
    return `<div class="cl-resp">
      <p class="cl-resp-h"><b>${pname(q.by)}</b>님의 질문: ${tripleTxt(q)}<br><small>내 카드 중 <b>1장</b>을 골라 ${pname(q.by)}님에게만 몰래 보여 줘요.${matches.length > 1 ? ' 어떤 걸 보여 줄지는 내가 골라요.' : ''}</small></p>
      ${before.length ? `<p class="cl-resp-sub">${pname(q.by)}님에게 지금까지 보여 준 카드: ${before.map((id) => `<b>${cname(id)}</b>`).join(', ')}</p>` : ''}
      <div class="cl-picks">${picks}</div>
      <button class="primary cl-showbtn" data-act="clShow" ${s.pick && matches.includes(s.pick) ? '' : 'disabled'}>🃏 이 카드 보여 주기</button>
    </div>`;
  }

  function dock() {
    const m = S.mode;
    const me = meP();
    if (m === 'ask') {
      return `<div class="cl-acts"><button class="primary cl-askbtn" data-act="clAsk">🔍 질문하기</button><button class="cl-accbtn" data-act="clAccuse">⚖️ 고발</button></div>
        <button class="ghost sm cl-skip" data-act="clEnd" data-confirm="질문하지 않고 차례를 넘길까요?">질문 없이 차례 넘기기</button>`;
    }
    if (m === 'after') {
      return `<div class="cl-acts after"><button class="cl-accbtn" data-act="clAccuse">⚖️ 고발</button><button class="primary cl-endbtn" data-act="clEnd">차례 끝내기</button></div>`;
    }
    if (m === 'respond') return respondHtml();
    if (m === 'over') return '';
    const q = S.question;
    let msg;
    if (S.step === 'respond' && q) msg = q.by === S.me ? `⏳ <b>${pname(q.shower)}</b>님이 나에게 보여 줄 카드를 고르는 중이에요` : `⏳ <b>${pname(q.shower)}</b>님이 ${pname(q.by)}님에게 보여 줄 카드를 고르는 중`;
    else msg = `⏳ <b>${pname(S.turnId)}</b>님 차례예요`;
    const out = me && me.out ? '<small class="cl-outnote">고발에 실패해서 내 차례는 건너뛰어요. 질문을 받으면 카드는 계속 보여 줘요.</small>' : '';
    return `<p class="cl-dock-msg">${msg}${out}</p>`;
  }

  // ---- 끝 ----

  function envelopeSvg() {
    return `<svg viewBox="0 0 120 80" class="cl-env-svg" aria-hidden="true">
      <defs><linearGradient id="clEnvG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6e7c4"/><stop offset="1" stop-color="#d9bd86"/></linearGradient>
      <radialGradient id="clSeal" cx=".4" cy=".35"><stop offset="0" stop-color="#ef6a52"/><stop offset="1" stop-color="#8e1f14"/></radialGradient></defs>
      <rect x="6" y="14" width="108" height="60" rx="6" fill="url(#clEnvG)" stroke="#8a6a3a" stroke-width="2"/>
      <path d="M6 20 L60 52 L114 20" fill="none" stroke="#8a6a3a" stroke-width="2"/>
      <path d="M8 16 L60 -6 L112 16" fill="#efdcb0" stroke="#8a6a3a" stroke-width="2" class="cl-env-flap"/>
      <circle cx="60" cy="50" r="11" fill="url(#clSeal)"/>
      <path d="M60 42 L62.5 48 L69 50 L62.5 52 L60 58 L57.5 52 L51 50 L57.5 48 Z" fill="#ffd9a8" opacity=".85"/>
    </svg>`;
  }
  function compassSvg() {
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor" stroke-width="1.6" opacity=".7"/>
      <path d="M20 4 L23 20 L20 36 L17 20 Z" fill="currentColor"/><path d="M4 20 L20 17 L36 20 L20 23 Z" fill="currentColor" opacity=".55"/>
      <circle cx="20" cy="20" r="2.6" fill="#0d2238"/></svg>`;
  }

  function overHtml(isHost) {
    const E = S.envelope;
    if (!E) return '';
    const win = S.winnerId;
    const head = win
      ? `<p class="cl-over-win">🏆 <b>${win === S.me ? '내가' : `${pname(win)}님이`}</b> 사건을 해결했어요!</p>`
      : '<p class="cl-over-win none">💀 모두 고발에 실패했어요. 아무도 못 이겼어요.</p>';
    const hands = S.players.map((p) => `<div class="cl-row"><span class="cl-lbl">${esc(p.name)}${p.out ? ' ❌' : ''}${p.id === win ? ' 🏆' : ''}</span><span class="cl-cards">${(p.hand || []).map((id) => chip(id, 'xs')).join('')}</span></div>`).join('');
    const extra = `${S.publicCards.length ? `<div class="cl-row"><span class="cl-lbl">📢 공개</span><span class="cl-cards">${S.publicCards.map((id) => chip(id, 'xs')).join('')}</span></div>` : ''}${S.rumor && S.rumor.length ? `<div class="cl-row"><span class="cl-lbl">💬 소문</span><span class="cl-cards">${S.rumor.map((id) => chip(id, 'xs')).join('')}</span></div>` : ''}`;
    const acc = S.accusations.map((a) => `<span class="cl-acc-r ${a.ok ? 'ok' : ''}">${a.ok ? '🏆' : '❌'} <b>${pname(a.by)}</b> ${tripleTxt(a)}</span>`).join('');
    // 다시 그려도 봉투 여는 연출이 처음부터 반복되지 않게: 처음 본 시각 기준으로 음수 지연
    const s = st();
    const el = s.overAt ? Date.now() - s.overAt : Infinity;
    const anim = el < 2500 ? ` style="--od:-${el}ms"` : '';
    return `<section class="cl-over ${anim ? '' : 'still'}"${anim}>
      <div class="cl-over-h">${win ? '사건 해결' : '사건 종료'}</div>
      <div class="cl-env-open">${envelopeSvg()}</div>
      <div class="cl-answer">${CATS.map((cat, k) => `<span class="cl-ans" style="--k:${k}"><small>${CAT_LABEL[cat]}</small>${chip(E[cat], 'big')}</span>`).join('')}</div>
      ${head}
      ${acc ? `<div class="cl-acc">${acc}</div>` : ''}
      <details class="cl-over-d"><summary>모두의 카드 보기 (질문 ${S.history.length}번)</summary>${hands}${extra}</details>
      ${genericOverButtons(isHost)}
    </section>`;
  }

  // ---- 화면 ----

  function tabsHtml() {
    const s = st();
    const tabs = [['play', '🧭 진행'], ['note', '📓 노트'], ['log', `📜 기록${S.history.length ? ` ${S.history.length}` : ''}`]];
    return `<div class="cl-tabs" role="tablist">${tabs.map(([k, t]) => `<button class="cl-tab ${s.tab === k ? 'on' : ''}" data-act="clTab" data-tab="${k}" role="tab" aria-selected="${s.tab === k}">${t}</button>`).join('')}</div>`;
  }

  function renderClue() {
    const isHost = S.hostId === S.me;
    const s = st();
    // 다시 그려도 질문/고발 창이 맨 위로 튀지 않게 스크롤 위치를 기억했다가 afterRender에서 되돌린다
    const sheet = document.querySelector('.cl-sheet');
    s.sheetTop = sheet && s.compose ? sheet.scrollTop : 0;
    const over = S.phase === 'over';
    const log = S.log.length ? `<div class="ulog cl-log">${S.log.slice(-4).reverse().map((l, i) => `<div class="${i === 0 ? 'new' : ''}">${esc(l)}</div>`).join('')}</div>` : '';
    let body = '';
    if (s.tab === 'note') body = notebookHtml();
    else if (s.tab === 'log') body = historyHtml();
    else body = `${over ? overHtml(isHost) : ''}${over ? '' : playersHtml()}${questionHtml()}${over ? '' : handHtml()}${over ? '' : publicHtml()}${log}`;
    let force = '';
    if (S.phase === 'play') {
      force = S.step === 'respond' && S.question
        ? genericHostMenu(`${player(S.question.shower) ? player(S.question.shower).name : ''}님 대신 카드 보여 주기`, '자리를 비운 사람 대신, 질문에 맞는 카드 중 첫 번째 카드를 보여 줄까요?')
        : genericHostMenu(`${player(S.turnId) ? player(S.turnId).name : ''}님 차례 넘기기`, '자리를 비운 사람의 차례를 끝내고 다음 사람에게 넘길까요?');
    } else force = genericHostMenu();
    return `
    <div class="top"><span>${roomTag()}</span><span class="cl-top">🔎 클루 <small>원피스</small></span></div>
    ${statusHtml()}
    ${tabsHtml()}
    ${body}
    ${isHost ? '<div class="foot cl-foot"><button class="sm ghost" data-act="hostmenu">⚙ 방장 메뉴</button></div>' : ''}
    <div class="bdock cl-dock">${dock()}</div>
    ${composerHtml()}
    ${ui.hostOpen && isHost ? force : ''}`;
  }

  // 새 상태: 판이 바뀌면 고르던 것 초기화, 내 차례가 아니면 질문 창 닫기, 보여 줄 카드가 하나면 미리 고르기
  let lastShownSeq = null;
  function sync() {
    if (!S || S.kind !== 'clue') return;
    const s = st();
    const key = `${S.code}:${S.gameNo}`;
    if (s.key !== key) Object.assign(s, { key, tab: 'play', compose: null, sel: {}, pick: null, peek: null, peekAt: 0, seen: [] });
    if (S.mode !== 'ask' && S.mode !== 'after') s.compose = null;
    // 끝나는 순간을 직접 본 경우에만 봉투 여는 연출 (새로고침해서 들어오면 바로 결과)
    if (S.phase === 'over') {
      if (s.overAt === undefined) { s.overAt = s.sawPlay ? Date.now() : 0; s.tab = 'play'; }
    } else { s.overAt = undefined; s.sawPlay = S.phase === 'play'; }
    if (S.mode === 'respond') {
      const q = S.question;
      const matches = CATS.map((cat) => q[cat]).filter((id) => S.hand.includes(id));
      if (!matches.includes(s.pick)) s.pick = matches.length === 1 ? matches[0] : null;
    } else s.pick = null;
    // 나에게 카드가 막 보여졌으면 알려 준다 (내 화면에만)
    const q = S.question;
    if (q && q.by === S.me && q.card && lastShownSeq !== `${key}:${q.seq}`) {
      if (lastShownSeq !== null) showToast(`${player(q.shower) ? player(q.shower).name : ''}님이 카드를 보여 줬어요. 눌러서 확인해요.`);
      lastShownSeq = `${key}:${q.seq}`;
    } else if (lastShownSeq === null) lastShownSeq = '';
  }

  function click(act, el) {
    if (!S || S.kind !== 'clue') return false;
    const s = st();
    switch (act) {
      case 'clTab': s.tab = el.dataset.tab; render(); return true;
      case 'clAsk': s.compose = 'ask'; render(); return true;
      case 'clAccuse': s.compose = 'accuse'; render(); return true;
      case 'clSel': s.sel = { ...s.sel, [el.dataset.cat]: el.dataset.id }; render(); return true;
      case 'clSubmit': {
        if (!CATS.every((cat) => s.sel[cat])) { showToast('세 가지를 하나씩 골라요.'); return true; }
        send({ t: s.compose === 'accuse' ? 'accuse' : 'ask', who: s.sel.who, what: s.sel.what, where: s.sel.where });
        s.compose = null;
        s.tab = 'play';
        render();
        return true;
      }
      case 'clEnd': send({ t: 'endTurn' }); return true;
      case 'clPick': s.pick = el.dataset.id; render(); return true;
      case 'clShow': if (s.pick) send({ t: 'show', card: s.pick }); return true;
      case 'clPeek': {
        const seq = Number(el.dataset.seq);
        if (s.peek === seq) { s.peek = null; } else { s.peek = seq; s.peekAt = Date.now(); if (!s.seen.includes(seq)) s.seen.push(seq); setTimeout(render, FLIP_MS + 30); }
        render();
        return true;
      }
      case 'clMark': {
        const card = el.dataset.card;
        const col = el.dataset.col;
        const auto = nbAuto();
        if (auto[card] && auto[card][col]) { showToast('확실한 사실이라 자동으로 채운 칸이에요.'); return true; }
        const marks = nbMarks();
        const curV = (marks[card] && marks[card][col]) || '';
        const next = MARKS[(MARKS.indexOf(curV) + 1) % MARKS.length];
        marks[card] = { ...(marks[card] || {}) };
        if (next) marks[card][col] = next; else delete marks[card][col];
        nbSave();
        render();
        return true;
      }
      case 'clClear': nbMarks(); nb.m = {}; nbSave(); render(); return true;
      case 'clSet': send({ t: 'setting', key: el.dataset.key, value: el.dataset.v }); return true;
      default: return false;
    }
  }

  // 대기실 설정: 짝마다 랜덤 / 한쪽
  function lobbyOptions(isHost) {
    const card = (id) => S.cards.find((c) => c.id === id) || { name: id, icon: '' };
    const rows = Object.entries(S.pairs).map(([key, pair]) => {
      const v = (S.settings && S.settings[key]) || 'random';
      const opts = [['random', '🎲 랜덤'], ...pair.map((id) => [id, `${card(id).icon} ${card(id).name}`])];
      return `<div class="cl-lb-r"><span class="cl-lb-l">${pair.map((id) => esc(card(id).name)).join(' / ')}</span>
        <div class="cl-seg">${opts.map(([val, t]) => `<button class="${v === val ? 'on' : ''}" data-act="clSet" data-key="${key}" data-v="${val}" ${isHost ? '' : 'disabled'} aria-pressed="${v === val}">${esc(t)}</button>`).join('')}</div></div>`;
    }).join('');
    return `<div class="cl-lb"><p class="cl-lb-h"><b>인물 6명</b> · 루피·조로·상디는 항상 나와요. 나머지 3명은 짝마다 한 명씩.${isHost ? '' : ' (방장이 정해요)'}</p>${rows}</div>`;
  }

  function afterRender() {
    if (!S || S.kind !== 'clue' || !ui.cl) return;
    const sheet = document.querySelector('.cl-sheet');
    if (sheet && ui.cl.sheetTop) sheet.scrollTop = ui.cl.sheetTop;
  }

  window.GAME_UI.clue = {
    name: '클루', label: '🔎 클루', range: '2~6명', rules: RULES, render: renderClue, sync, click, lobbyOptions, afterRender,
    closeAll: () => { if (ui.cl) ui.cl.compose = null; },
  };
}());
