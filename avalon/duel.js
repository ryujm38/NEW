'use strict';
// 세븐 원더스 듀얼 스타일 2인 카드 게임 규칙 엔진. (카드·불가사의 구성은 public/duel-data.js, 원작과 같지 않다)
//
// 준비: 동전 7개씩, 불가사의 12개 중 8개를 4개씩 두 번 나눠 한 사람이 4개씩 갖는다(1·2·2·1 순으로 고르고 마지막 한 장은 자동).
// 1~3시대: 카드를 피라미드로 깔고, 다른 카드에 가려지지 않은 카드만 번갈아 하나씩 가져온다.
//   가져온 카드로 (1) 건물을 짓거나(비용 지불, 연계 기호가 있으면 무료)
//                (2) 버리고 동전 2 + 내 상업(노랑) 카드 수를 받거나
//                (3) 내 불가사의 하나를 짓는다(카드는 불가사의 밑에 깔림). 불가사의는 전체 7개까지만 지을 수 있다.
// 자원이 모자라면 은행에서 산다: 한 개당 2 + 상대가 가진 같은 자원(원자재·제품 카드) 수. 비축소/세관은 1.
// 즉시 승리: 군사 말이 상대 수도(±9)에 닿거나, 서로 다른 과학 기호 6종을 모으면 승리.
// 3시대가 끝나면 점수(카드·불가사의·진보 토큰·군사·동전 3개당 1점)가 높은 쪽이 승리.

const { shuffle, newId, newToken, cleanName } = require('./common');
const DATA = require('./public/duel-data.js');

const { CARDS, CARD, WONDERS, WONDER, TOKENS } = DATA;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 2;
const COLORS = ['#e0453a', '#3b82e0'];
const LOG_KEEP = 16;
const RK = ['W', 'C', 'S', 'G', 'P'];
const START_COINS = 7;
const WONDER_LIMIT = 7;
const MIL_TOKENS = [[3, 2], [6, 5]]; // [말의 위치, 상대가 잃는 동전]
const DRAFT_ORDER = [[0, 1, 1, 0], [1, 0, 0, 1]];

function createRoom(code) {
  return {
    kind: 'duel',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | draft | play | chooseStart | over
    gameNo: 0,
    age: 0,
    turn: 0,
    again: false,
    lastTaker: 0,
    chooser: 0,
    slots: [],
    discard: [],
    pend: [], // 사람의 선택이 필요한 일들(앞에서부터 처리)
    military: 0, // +면 0번 자리가 상대(1번) 수도 쪽으로 밀고 있다
    milTokens: {},
    boardTokens: [],
    boxTokens: [],
    draft: null,
    wondersBuilt: 0,
    winnerIds: [],
    reason: '',
    result: null,
    log: [],
    lastActive: Date.now(),
  };
}

function addPlayer(room, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: '이름을 입력하세요.' };
  if (room.phase !== 'lobby') return { error: '이미 게임이 시작됐어요.' };
  if (room.players.length >= MAX_PLAYERS) return { error: `방이 가득 찼어요. (${MAX_PLAYERS}명)` };
  if (room.players.some((p) => p.name === name)) return { error: '같은 이름이 이미 있어요. 다른 이름을 쓰세요.' };
  const player = { id: newId(), token: newToken(), name, connected: true, color: '', coins: 0, cards: [], wonders: [], tokens: [] };
  room.players.push(player);
  if (!room.hostId) room.hostId = player.id;
  return { player };
}

function getPlayer(room, id) {
  return room.players.find((p) => p.id === id) || null;
}

function removePlayer(room, id) {
  room.players = room.players.filter((p) => p.id !== id);
  if (room.hostId === id) {
    const next = room.players.find((p) => p.connected) || room.players[0];
    room.hostId = next ? next.id : null;
  }
}

function kick(room, byId, targetId) {
  if (byId !== room.hostId) return { error: '방장만 내보낼 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '게임 시작 전에만 할 수 있어요.' };
  if (targetId === byId) return { error: '자기 자신은 내보낼 수 없어요.' };
  if (!getPlayer(room, targetId)) return { error: '없는 사람이에요.' };
  removePlayer(room, targetId);
  return { kicked: targetId };
}

// ---- 도우미 ----

const cur = (room) => room.players[room.turn];
const oppOf = (room, p) => room.players.find((x) => x !== p);
const seatOf = (room, p) => room.players.indexOf(p);
const cardsOf = (p) => p.cards.map((id) => CARD[id]);
const hasToken = (p, k) => p.tokens.includes(k);
const countColors = (p, colors) => cardsOf(p).filter((c) => colors.includes(c.color)).length;
const builtWonders = (p) => p.wonders.filter((w) => w.built);

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// ---- 판 배치 ----

// 피라미드 배치. 가로 위치 x는 반 칸 단위(카드 폭 = 2). 아래 줄 카드가 위 줄 카드를 반쯤 덮는다.
function layout(age) {
  const spec = { 1: [2, 3, 4, 5, 6], 2: [6, 5, 4, 3, 2], 3: [2, 3, 4, 2, 4, 3, 2] }[age];
  const up = { 1: [1, 0, 1, 0, 1], 2: [1, 0, 1, 0, 1], 3: [1, 0, 1, 0, 1, 0, 1] }[age];
  const slots = [];
  spec.forEach((n, row) => {
    const xs = age === 3 && row === 3 ? [-2, 2] : Array.from({ length: n }, (_, i) => -(n - 1) + 2 * i);
    xs.forEach((x) => slots.push({ row, x, up: !!up[row], taken: false, card: null }));
  });
  slots.forEach((s) => {
    s.coveredBy = slots.map((t, j) => j).filter((j) => slots[j].row === s.row + 1 && Math.abs(slots[j].x - s.x) === 1);
  });
  return slots;
}

function dealAge(age) {
  const ofAge = CARDS.filter((c) => c.age === age && c.color !== 'purple').map((c) => c.id);
  if (age < 3) return shuffle(ofAge).slice(0, 20);
  const guilds = CARDS.filter((c) => c.color === 'purple').map((c) => c.id);
  return shuffle([...shuffle(ofAge).slice(0, 17), ...shuffle(guilds).slice(0, 3)]);
}

function startAge(room, age, first) {
  room.age = age;
  room.slots = layout(age);
  const deck = dealAge(age);
  room.slots.forEach((s, i) => { s.card = deck[i]; });
  room.turn = first;
  room.again = false;
  room.phase = 'play';
  say(room, `🏛️ ${age}시대 시작! ${cur(room).name}님부터 해요.`);
}

const isOpen = (room, i) => !room.slots[i].taken && room.slots[i].coveredBy.every((j) => room.slots[j].taken);
const openSlots = (room) => room.slots.map((s, i) => i).filter((i) => isOpen(room, i));

function takeSlot(room, i) {
  const s = room.slots[i];
  s.taken = true;
  room.lastTaker = room.turn;
  room.slots.forEach((t, j) => {
    if (!t.taken && !t.up && isOpen(room, j)) t.up = true;
  });
  return s.card;
}

// ---- 생산 / 비용 ----

function fixedProd(p) {
  const h = { W: 0, C: 0, S: 0, G: 0, P: 0 };
  cardsOf(p).forEach((c) => {
    if ((c.color === 'brown' || c.color === 'grey') && c.res) Object.entries(c.res).forEach(([k, n]) => { h[k] += n; });
  });
  return h;
}

function choiceProd(p) {
  const list = [];
  cardsOf(p).forEach((c) => { if (c.choice) list.push(c.choice); });
  builtWonders(p).forEach((w) => { if (WONDER[w.id].choice) list.push(WONDER[w.id].choice); });
  return list;
}

function minTrade(i, rem, choices, price) {
  if (i === choices.length) return RK.reduce((a, k) => a + rem[k] * price[k], 0);
  let best = minTrade(i + 1, rem, choices, price);
  choices[i].forEach((o) => {
    if (rem[o] > 0) {
      rem[o] -= 1;
      best = Math.min(best, minTrade(i + 1, rem, choices, price));
      rem[o] += 1;
    }
  });
  return best;
}

// 비용 계산. reduce: 진보 토큰(건축/석공술)으로 줄일 수 있는 자원 개수. 가장 싼 방법을 자동으로 고른다.
function payment(room, p, cost, reduce = 0) {
  const opp = oppOf(room, p);
  const have = fixedProd(p);
  const oppHave = fixedProd(opp);
  const choices = choiceProd(p);
  const discounted = new Set();
  cardsOf(p).forEach((c) => (c.trade || []).forEach((k) => discounted.add(k)));
  const price = {};
  RK.forEach((k) => { price[k] = discounted.has(k) ? 1 : 2 + oppHave[k]; });
  const need = {};
  RK.forEach((k) => { need[k] = cost[k] || 0; });
  const vecs = [];
  (function rec(i, left, vec) {
    if (i === RK.length) { vecs.push({ ...vec }); return; }
    for (let r = 0; r <= Math.min(left, need[RK[i]]); r++) {
      vec[RK[i]] = r;
      rec(i + 1, left - r, vec);
    }
  }(0, reduce, {}));
  let best = Infinity;
  vecs.forEach((vec) => {
    const rem = {};
    RK.forEach((k) => { rem[k] = Math.max(0, need[k] - vec[k] - have[k]); });
    best = Math.min(best, minTrade(0, rem, choices, price));
  });
  return { coins: (cost.$ || 0) + best, trade: best };
}

function costOfCard(room, p, card) {
  if (card.from && cardsOf(p).some((c) => c.gives === card.from)) return { coins: 0, trade: 0, chain: true };
  const reduce = card.color === 'blue' && hasToken(p, 'masonry') ? 2 : 0;
  return { ...payment(room, p, card.cost, reduce), chain: false };
}

function costOfWonder(room, p, wid) {
  return { ...payment(room, p, WONDER[wid].cost, hasToken(p, 'architecture') ? 2 : 0), chain: false };
}

function pay(room, p, c) {
  p.coins -= c.coins;
  const opp = oppOf(room, p);
  if (c.trade && hasToken(opp, 'economy')) opp.coins += c.trade;
}

// ---- 효과 ----

function win(room, ids, reason) {
  room.phase = 'over';
  room.winnerIds = ids;
  room.reason = reason;
  room.pend = [];
  room.result = { scores: Object.fromEntries(room.players.map((p) => [p.id, score(room, p)])) };
  const names = ids.map((id) => getPlayer(room, id).name).join(', ');
  say(room, `🏆 ${names}님 승리! (${{ military: '군사 승리', science: '과학 승리', points: '점수 승리', tie: '동점' }[reason]})`);
}

function pushMilitary(room, p, n) {
  const dir = seatOf(room, p) === 0 ? 1 : -1;
  room.military = Math.max(-9, Math.min(9, room.military + dir * n));
  const opp = oppOf(room, p);
  MIL_TOKENS.forEach(([t, loss]) => {
    const key = `${dir > 0 ? '+' : '-'}${t}`;
    const reached = dir > 0 ? room.military >= t : room.military <= -t;
    if (reached && !room.milTokens[key]) {
      room.milTokens[key] = true;
      const lost = Math.min(opp.coins, loss);
      opp.coins -= lost;
      say(room, `⚔️ 군사 토큰! ${opp.name}님이 동전 ${lost}개를 잃었어요.`);
    }
  });
  say(room, `⚔️ ${p.name}님이 방패 ${n}개만큼 밀었어요.`);
  if (Math.abs(room.military) >= 9) win(room, [p.id], 'military');
}

function sciSet(p) {
  const s = new Set(cardsOf(p).filter((c) => c.sym).map((c) => c.sym));
  if (hasToken(p, 'law')) s.add('law');
  return s;
}

function checkScience(room, p) {
  if (sciSet(p).size >= 6) win(room, [p.id], 'science');
}

function addScience(room, p, sym) {
  const n = cardsOf(p).filter((c) => c.sym === sym).length;
  if (n === 2 && room.boardTokens.length) room.pend.push({ type: 'token', player: seatOf(room, p), options: room.boardTokens.slice() });
  checkScience(room, p);
}

function gainToken(room, p, tid) {
  p.tokens.push(tid);
  if (tid === 'agriculture' || tid === 'urbanism') p.coins += 6;
  say(room, `${TOKENS[tid].icon} ${p.name}님이 진보 토큰 "${TOKENS[tid].name}"을(를) 얻었어요.`);
  if (tid === 'law') checkScience(room, p);
}

// 카드를 내 도시에 놓고 효과를 적용한다.
function construct(room, p, card, chain) {
  const opp = oppOf(room, p);
  p.cards.push(card.id);
  say(room, `🏗️ ${p.name}님이 "${card.name}"을(를) 지었어요.`);
  if (card.coins) p.coins += card.coins;
  if (card.per) {
    const n = card.per.wonders ? builtWonders(p).length : countColors(p, card.per.colors);
    p.coins += n * card.per.coins;
  }
  if (card.guild && card.guild.coins) p.coins += Math.max(countColors(p, card.guild.colors), countColors(opp, card.guild.colors));
  if (chain && hasToken(p, 'urbanism')) p.coins += 4;
  if (card.shields) {
    pushMilitary(room, p, card.shields + (card.color === 'red' && hasToken(p, 'strategy') ? 1 : 0));
    if (room.phase === 'over') return;
  }
  if (card.sym) addScience(room, p, card.sym);
}

// ---- 점수 ----

function guildVp(room, p, card) {
  const opp = oppOf(room, p);
  const g = card.guild;
  if (g.moneylend) return Math.floor(Math.max(p.coins, opp.coins) / 3);
  if (g.wonders) return g.vp * Math.max(builtWonders(p).length, builtWonders(opp).length);
  return Math.max(countColors(p, g.colors), countColors(opp, g.colors));
}

function score(room, p) {
  const seat = seatOf(room, p);
  const by = { blue: 0, green: 0, yellow: 0, purple: 0 };
  cardsOf(p).forEach((c) => {
    if (c.guild) by.purple += guildVp(room, p, c);
    else if (c.vp && by[c.color] !== undefined) by[c.color] += c.vp;
  });
  const wonders = builtWonders(p).reduce((a, w) => a + WONDER[w.id].vp, 0);
  let tokens = 0;
  if (hasToken(p, 'agriculture')) tokens += 4;
  if (hasToken(p, 'philosophy')) tokens += 7;
  if (hasToken(p, 'mathematics')) tokens += 3 * p.tokens.length;
  const lead = room.military * (seat === 0 ? 1 : -1);
  const m = Math.abs(lead);
  const military = lead > 0 ? (m >= 6 ? 10 : m >= 3 ? 5 : 2) : 0;
  const coins = Math.floor(p.coins / 3);
  return { ...by, wonders, tokens, military, coins, total: by.blue + by.green + by.yellow + by.purple + wonders + tokens + military + coins };
}

function finishGame(room) {
  const [a, b] = room.players;
  const sa = score(room, a);
  const sb = score(room, b);
  let ids;
  let reason = 'points';
  if (sa.total !== sb.total) ids = [sa.total > sb.total ? a.id : b.id];
  else if (sa.blue !== sb.blue) ids = [sa.blue > sb.blue ? a.id : b.id]; // 동점이면 시민(파랑) 승점이 높은 쪽
  else { ids = [a.id, b.id]; reason = 'tie'; }
  win(room, ids, reason);
}

// ---- 진행 ----

function endAge(room) {
  if (room.age >= 3) return finishGame(room);
  // 군사가 약한 쪽(말이 자기 쪽에 가까운 쪽)이 다음 시대를 누가 시작할지 고른다. 같으면 마지막 카드를 가져간 사람이 고른다.
  room.chooser = room.military > 0 ? 1 : room.military < 0 ? 0 : room.lastTaker;
  room.phase = 'chooseStart';
  say(room, `${room.players[room.chooser].name}님이 ${room.age + 1}시대를 누가 시작할지 골라요.`);
  return undefined;
}

function settle(room) {
  if (room.phase !== 'play') return;
  while (room.pend.length && !room.pend[0].options.length) room.pend.shift();
  if (room.pend.length) return;
  if (room.slots.every((s) => s.taken)) { endAge(room); return; }
  if (room.again) say(room, `🔁 ${cur(room).name}님이 한 번 더 해요.`);
  else room.turn = 1 - room.turn;
  room.again = false;
}

function finishAction(room, again) {
  room.again = again;
  settle(room);
}

function checkMove(room, id) {
  if (room.phase !== 'play') return { error: '지금은 카드를 가져올 때가 아니에요.' };
  if (room.pend.length) return { error: '먼저 선택을 끝내세요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

function checkSlot(room, i) {
  if (!Number.isInteger(i) || i < 0 || i >= room.slots.length) return { error: '없는 카드예요.' };
  if (!isOpen(room, i)) return { error: '다른 카드에 가려져 있거나 이미 가져간 카드예요.' };
  return null;
}

function build(room, id, i) {
  const bad = checkMove(room, id) || checkSlot(room, i);
  if (bad) return bad;
  const p = cur(room);
  const card = CARD[room.slots[i].card];
  const c = costOfCard(room, p, card);
  if (p.coins < c.coins) return { error: `동전이 모자라요. (필요 ${c.coins})` };
  takeSlot(room, i);
  pay(room, p, c);
  construct(room, p, card, c.chain);
  if (room.phase === 'over') return {};
  finishAction(room, false);
  return {};
}

function discardCard(room, id, i) {
  const bad = checkMove(room, id) || checkSlot(room, i);
  if (bad) return bad;
  const p = cur(room);
  const card = CARD[room.slots[i].card];
  const gain = 2 + countColors(p, ['yellow']);
  takeSlot(room, i);
  room.discard.push(card.id);
  p.coins += gain;
  say(room, `♻️ ${p.name}님이 "${card.name}"을(를) 버리고 동전 ${gain}개를 받았어요.`);
  finishAction(room, false);
  return {};
}

function buildWonder(room, id, i, wid) {
  const bad = checkMove(room, id) || checkSlot(room, i);
  if (bad) return bad;
  const p = cur(room);
  const w = p.wonders.find((x) => x.id === wid);
  if (!w) return { error: '내 불가사의가 아니에요.' };
  if (w.built) return { error: '이미 지은 불가사의예요.' };
  if (w.lost) return { error: '더는 지을 수 없는 불가사의예요.' };
  const c = costOfWonder(room, p, wid);
  if (p.coins < c.coins) return { error: `동전이 모자라요. (필요 ${c.coins})` };
  const opp = oppOf(room, p);
  const W = WONDER[wid];
  w.under = takeSlot(room, i);
  pay(room, p, c);
  w.built = true;
  room.wondersBuilt += 1;
  say(room, `🏛️ ${p.name}님이 불가사의 "${W.name}"을(를) 완성했어요!`);
  if (W.coins) p.coins += W.coins;
  if (W.oppLoses) opp.coins = Math.max(0, opp.coins - W.oppLoses);
  if (W.shields) {
    pushMilitary(room, p, W.shields);
    if (room.phase === 'over') return {};
  }
  if (W.destroy) {
    room.pend.push({ type: 'destroy', player: seatOf(room, p), color: W.destroy, options: opp.cards.filter((cid) => CARD[cid].color === W.destroy) });
  }
  if (W.library) room.pend.push({ type: 'library', player: seatOf(room, p), options: shuffle(room.boxTokens).slice(0, 3) });
  if (W.revive) room.pend.push({ type: 'revive', player: seatOf(room, p), options: room.discard.slice() });
  if (room.wondersBuilt >= WONDER_LIMIT) {
    room.players.forEach((q) => q.wonders.forEach((x) => { if (!x.built) x.lost = true; }));
    say(room, '불가사의가 7개 지어져서 남은 불가사의는 더 지을 수 없어요.');
  }
  finishAction(room, !!W.again || hasToken(p, 'theology'));
  return {};
}

// 선택이 필요한 일(진보 토큰 / 파괴 / 되살리기) 처리
function choose(room, id, msg) {
  if (room.phase !== 'play' || !room.pend.length) return { error: '지금은 고를 게 없어요.' };
  const head = room.pend[0];
  const p = room.players[head.player];
  if (p.id !== id) return { error: '내가 고를 차례가 아니에요.' };
  const opp = oppOf(room, p);
  if (head.type === 'token' || head.type === 'library') {
    if (!head.options.includes(msg.token)) return { error: '고를 수 없는 토큰이에요.' };
    room.pend.shift();
    if (head.type === 'token') room.boardTokens = room.boardTokens.filter((t) => t !== msg.token);
    else room.boxTokens = room.boxTokens.filter((t) => t !== msg.token);
    gainToken(room, p, msg.token);
  } else if (head.type === 'destroy') {
    if (!head.options.includes(msg.card)) return { error: '고를 수 없는 카드예요.' };
    room.pend.shift();
    opp.cards = opp.cards.filter((cid) => cid !== msg.card);
    room.discard.push(msg.card);
    say(room, `💥 ${opp.name}님의 "${CARD[msg.card].name}"이(가) 파괴됐어요.`);
  } else if (head.type === 'revive') {
    if (!head.options.includes(msg.card) || !room.discard.includes(msg.card)) return { error: '고를 수 없는 카드예요.' };
    room.pend.shift();
    room.discard.splice(room.discard.indexOf(msg.card), 1);
    construct(room, p, CARD[msg.card], false);
  }
  if (room.phase === 'over') return {};
  settle(room);
  return {};
}

function chooseStart(room, id, who) {
  if (room.phase !== 'chooseStart') return { error: '지금은 고를 때가 아니에요.' };
  if (room.players[room.chooser].id !== id) return { error: '내가 고를 차례가 아니에요.' };
  if (who !== 'me' && who !== 'opp') return { error: '"내가 먼저" 또는 "상대가 먼저"를 고르세요.' };
  startAge(room, room.age + 1, who === 'me' ? room.chooser : 1 - room.chooser);
  return {};
}

// ---- 불가사의 고르기 ----

function draftPicker(room) {
  return room.players[DRAFT_ORDER[room.draft.set][room.draft.picks]];
}

function advanceDraft(room) {
  const d = room.draft;
  if (d.pool.length === 1) {
    const last = room.players[DRAFT_ORDER[d.set][3]];
    last.wonders.push({ id: d.pool[0], built: false, under: null });
    d.pool = [];
  }
  if (d.pool.length === 0) {
    d.set += 1;
    d.picks = 0;
    if (d.set >= 2) {
      room.draft = null;
      startAge(room, 1, 0);
      return;
    }
    d.pool = d.sets[d.set].slice();
  }
  say(room, `${draftPicker(room).name}님이 불가사의를 골라요.`);
}

function draftWonder(room, id, wid) {
  if (room.phase !== 'draft') return { error: '지금은 불가사의를 고를 때가 아니에요.' };
  const p = draftPicker(room);
  if (p.id !== id) return { error: '내가 고를 차례가 아니에요.' };
  if (!room.draft.pool.includes(wid)) return { error: '고를 수 없는 불가사의예요.' };
  room.draft.pool = room.draft.pool.filter((x) => x !== wid);
  p.wonders.push({ id: wid, built: false, under: null });
  room.draft.picks += 1;
  advanceDraft(room);
  return {};
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  if (room.players.length !== 2) return { error: '2명이 모여야 해요.' };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  room.players.forEach((p, i) => {
    p.color = COLORS[i];
    p.coins = START_COINS;
    p.cards = [];
    p.wonders = [];
    p.tokens = [];
  });
  const tokens = shuffle(Object.keys(TOKENS));
  const wonders = shuffle(WONDERS.map((w) => w.id)).slice(0, 8);
  Object.assign(room, {
    gameNo: room.gameNo + 1,
    age: 0,
    turn: 0,
    again: false,
    lastTaker: 0,
    slots: [],
    discard: [],
    pend: [],
    military: 0,
    milTokens: {},
    boardTokens: tokens.slice(0, 5),
    boxTokens: tokens.slice(5),
    wondersBuilt: 0,
    winnerIds: [],
    reason: '',
    result: null,
    log: [],
    draft: { sets: [wonders.slice(0, 4), wonders.slice(4)], set: 0, picks: 0, pool: wonders.slice(0, 4) },
  });
  room.phase = 'draft';
  say(room, `불가사의를 고르세요. ${draftPicker(room).name}님부터!`);
  return {};
}

function reset(room) {
  room.players.forEach((p) => { p.coins = 0; p.cards = []; p.wonders = []; p.tokens = []; });
  Object.assign(room, {
    phase: 'lobby', age: 0, slots: [], discard: [], pend: [], military: 0, milTokens: {}, boardTokens: [], boxTokens: [],
    draft: null, wondersBuilt: 0, winnerIds: [], reason: '', result: null, log: [], again: false,
  });
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  reset(room);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  return {};
}

function restart(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '대기실에서는 "게임 시작"을 누르세요.' };
  if (room.players.length !== 2 || room.players.some((p) => !p.connected)) {
    return { error: '접속이 끊긴 사람이 있어요. 대기실로 돌아가서 정리하세요.' };
  }
  reset(room);
  return start(room, byId);
}

// 방장: 자리를 비운 사람 대신 진행 (불가사의 고르기 → 첫 번째 것, 카드 → 첫 번째 카드 버리기, 선택 → 첫 번째 것)
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'draft') return draftWonder(room, draftPicker(room).id, room.draft.pool[0]);
  if (room.phase === 'chooseStart') return chooseStart(room, room.players[room.chooser].id, 'opp');
  if (room.phase !== 'play') return { error: '지금은 넘길 게 없어요.' };
  if (room.pend.length) {
    const head = room.pend[0];
    const opt = head.options[0];
    const msg = head.type === 'token' || head.type === 'library' ? { token: opt } : { card: opt };
    return choose(room, room.players[head.player].id, msg);
  }
  return discardCard(room, cur(room).id, openSlots(room)[0]);
}

// ---- 각자에게 보여줄 상태 ----

function viewFor(room, viewerId) {
  const started = room.phase !== 'lobby';
  const me = getPlayer(room, viewerId);
  const myTurn = room.phase === 'play' && cur(room).id === viewerId;
  const head = room.pend[0] || null;
  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (room.phase === 'over') mode = 'over';
  else if (room.phase === 'draft') mode = draftPicker(room).id === viewerId ? 'draft' : 'wait';
  else if (room.phase === 'chooseStart') mode = room.players[room.chooser].id === viewerId ? 'chooseStart' : 'wait';
  else if (head) mode = room.players[head.player].id === viewerId ? head.type : 'wait';
  else if (myTurn) mode = 'pick';

  const open = room.phase === 'play' ? new Set(openSlots(room)) : new Set();
  const costs = {};
  const wonderCosts = {};
  if (mode === 'pick') {
    open.forEach((i) => {
      const c = costOfCard(room, me, CARD[room.slots[i].card]);
      costs[i] = { coins: c.coins, chain: c.chain, ok: me.coins >= c.coins };
    });
    me.wonders.filter((w) => !w.built && !w.lost).forEach((w) => {
      const c = costOfWonder(room, me, w.id);
      wonderCosts[w.id] = { coins: c.coins, ok: me.coins >= c.coins };
    });
  }

  return {
    kind: 'duel',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    age: room.age,
    turnId: room.phase === 'play' ? cur(room).id : null,
    players: room.players.map((p, seat) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      color: p.color,
      coins: p.coins,
      cards: p.cards,
      wonders: p.wonders.map((w) => ({ id: w.id, built: w.built, lost: !!w.lost })),
      tokens: p.tokens,
      sci: started ? [...sciSet(p)] : [],
      shieldSide: seat === 0 ? 1 : -1,
    })),
    slots: room.slots.map((s, i) => ({ i, row: s.row, x: s.x, taken: s.taken, up: s.up, card: !s.taken && s.up ? s.card : null, open: open.has(i) })),
    military: room.military,
    milTokens: room.milTokens,
    boardTokens: room.boardTokens,
    discard: room.discard,
    draft: room.phase === 'draft' ? { pool: room.draft.pool, pickerId: draftPicker(room).id, set: room.draft.set } : null,
    pend: head ? { type: head.type, playerId: room.players[head.player].id, color: head.color || null, options: head.options } : null,
    chooserId: room.phase === 'chooseStart' ? room.players[room.chooser].id : null,
    costs,
    wonderCosts,
    discardGain: me ? 2 + countColors(me, ['yellow']) : 0,
    winnerIds: room.winnerIds,
    reason: room.reason,
    result: room.result,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  draftWonder: (room, id, msg) => draftWonder(room, id, msg.wonder),
  build: (room, id, msg) => build(room, id, msg.slot),
  discard: (room, id, msg) => discardCard(room, id, msg.slot),
  wonder: (room, id, msg) => buildWonder(room, id, msg.slot, msg.wonder),
  choose: (room, id, msg) => choose(room, id, msg),
  startWith: (room, id, msg) => chooseStart(room, id, msg.who),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  MIN_PLAYERS,
  MAX_PLAYERS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  start,
  backToLobby,
  restart,
  force,
  viewFor,
  layout,
  dealAge,
  startAge,
  openSlots,
  payment,
  costOfCard,
  costOfWonder,
  score,
  build,
  discardCard,
  buildWonder,
  choose,
  chooseStart,
  draftWonder,
};
