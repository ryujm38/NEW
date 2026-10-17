'use strict';
// 스플렌더 규칙 엔진, 2~4명.
//
// 내 차례에 아래 중 하나를 한다.
//   1) 서로 다른 색 보석 3개 가져오기 (가져올 수 있는 색이 3가지 미만이면 그 수만큼)
//   2) 같은 색 보석 2개 가져오기 (그 색이 4개 이상 남아 있을 때만)
//   3) 카드 1장 예약하기 (최대 3장, 금 보석 1개를 받음) - 펼쳐진 카드 또는 덱 맨 위
//   4) 펼쳐진 카드나 예약한 카드 구매하기 (가진 카드의 보너스만큼 할인, 부족분은 금 보석으로)
// 보석은 10개를 넘으면 버려서 10개로 맞춘다. 턴이 끝날 때 조건이 맞는 귀족이 있으면 받는다(여러 명이면 선택).
// 누군가 15점에 도달하면 그 라운드를 끝까지 돌고(모두 같은 횟수의 턴), 점수가 가장 높은 사람이 승리.
// 동점이면 구매한 카드가 적은 사람이 승리.
//
// 카드 90장(1단계 40, 2단계 30, 3단계 20)과 귀족 10명은 원본과 같은 구조(단계별 장수, 점수 분포,
// 색별 보너스 균형)로 만든 구성이다. 원본 카드 목록과 똑같지는 않다.

const { shuffle, newId, newToken, cleanName } = require('./common');

const COLORS = ['w', 'u', 'g', 'r', 'k']; // 흰(다이아), 파랑(사파이어), 초록(에메랄드), 빨강(루비), 검정(오닉스)
const COLOR_NAME = { w: '흰색', u: '파랑', g: '초록', r: '빨강', k: '검정', y: '금' };
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const WIN_POINTS = 15;
const TOKEN_LIMIT = 10;
const RESERVE_LIMIT = 3;
const ROW_SIZE = 4;
const BANK_PER_COLOR = { 2: 4, 3: 5, 4: 7 };
const GOLD = 5;
const LOG_KEEP = 12;

// 보너스 색을 뺀 나머지 4색에 대한 비용 틀. 색마다 돌려서 쓴다.
const TEMPLATES = {
  1: [
    { v: [1, 1, 1, 1], p: 0 }, { v: [1, 2, 1, 1], p: 0 }, { v: [2, 2, 0, 1], p: 0 }, { v: [0, 1, 3, 1], p: 0 },
    { v: [0, 0, 2, 1], p: 0 }, { v: [2, 0, 2, 0], p: 0 }, { v: [0, 0, 0, 3], p: 0 }, { v: [0, 0, 4, 0], p: 1 },
  ],
  2: [
    { v: [2, 3, 0, 0], p: 1 }, { v: [3, 2, 2, 0], p: 1 }, { v: [1, 4, 2, 0], p: 2 },
    { v: [0, 5, 0, 0], p: 2 }, { v: [0, 0, 5, 3], p: 2 }, { v: [0, 0, 0, 6], p: 3 },
  ],
  3: [
    { v: [3, 3, 5, 3], p: 3 }, { v: [0, 0, 0, 7], p: 4 }, { v: [0, 3, 3, 6], p: 4 }, { v: [0, 0, 3, 7], p: 5 },
  ],
};

function buildCards() {
  const cards = [];
  let id = 0;
  for (const level of [1, 2, 3]) {
    TEMPLATES[level].forEach((tpl, t) => {
      COLORS.forEach((bonus, c) => {
        const cost = { w: 0, u: 0, g: 0, r: 0, k: 0 };
        const r = (t + c) % 4;
        for (let i = 0; i < 4; i++) cost[COLORS[(c + 1 + i) % 5]] = tpl.v[(i + r) % 4];
        cards.push({ id: id++, level, bonus, points: tpl.p, cost });
      });
    });
  }
  return cards;
}
const CARDS = buildCards();

const NOBLE_DEFS = [
  { name: '앤 여왕', req: { w: 4, u: 4 } }, { name: '헨리 공작', req: { u: 4, g: 4 } },
  { name: '마리 여왕', req: { g: 4, r: 4 } }, { name: '카테리나 공주', req: { r: 4, k: 4 } },
  { name: '엘리자베스 여왕', req: { w: 3, u: 3, k: 3 } }, { name: '이사벨라 여왕', req: { u: 3, g: 3, r: 3 } },
  { name: '니콜라스 황제', req: { g: 3, r: 3, k: 3 } }, { name: '마키아벨리', req: { r: 3, k: 3, w: 3 } },
  { name: '술레이만 대제', req: { k: 3, w: 3, g: 3 } }, { name: '프랑수아 1세', req: { w: 3, g: 3, r: 3 } },
];
const NOBLES = NOBLE_DEFS.map((n, i) => ({ id: i, name: n.name, req: n.req, points: 3 }));

function createRoom(code) {
  return {
    kind: 'splendor',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    bank: null,
    decks: { 1: [], 2: [], 3: [] },
    board: { 1: [], 2: [], 3: [] },
    nobles: [],
    turn: 0,
    pending: null, // { t:'discard', who, need } | { t:'noble', who, options }
    endTrigger: false,
    winnerIds: [],
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
  const player = { id: newId(), token: newToken(), name, connected: true, gems: emptyGems(), cards: [], reserved: [], nobles: [] };
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

function emptyGems() {
  return { w: 0, u: 0, g: 0, r: 0, k: 0, y: 0 };
}
const cur = (room) => room.players[room.turn];
const gemTotal = (p) => Object.values(p.gems).reduce((a, b) => a + b, 0);
const bonusOf = (p, c) => p.cards.filter((card) => card.bonus === c).length;
const pointsOf = (p) => p.cards.reduce((n, c) => n + c.points, 0) + p.nobles.length * 3;

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 카드를 살 때 내야 하는 보석. 가진 색 보석을 먼저 쓰고 모자란 만큼 금으로 메운다.
function payment(p, card) {
  const pay = emptyGems();
  let gold = 0;
  for (const c of COLORS) {
    const need = Math.max(0, card.cost[c] - bonusOf(p, c));
    pay[c] = Math.min(p.gems[c], need);
    gold += need - pay[c];
  }
  pay.y = gold;
  return { ok: gold <= p.gems.y, pay };
}

function refill(room, level, index) {
  room.board[level][index] = room.decks[level].length ? room.decks[level].pop() : null;
}

function claimNoble(room, p, nobleId) {
  const noble = room.nobles.find((n) => n.id === nobleId);
  room.nobles = room.nobles.filter((n) => n !== noble);
  p.nobles.push(noble);
  say(room, `👑 ${p.name}님에게 귀족 ${noble.name}이(가) 찾아왔어요! (+3점)`);
}

function eligibleNobles(room, p) {
  return room.nobles.filter((n) => COLORS.every((c) => bonusOf(p, c) >= (n.req[c] || 0)));
}

function endTurn(room) {
  const me = cur(room);
  if (!room.endTrigger && pointsOf(me) >= WIN_POINTS) {
    room.endTrigger = true;
    say(room, `🏁 ${me.name}님이 ${WIN_POINTS}점에 도달했어요! 이번 라운드까지 진행하고 끝나요.`);
  }
  room.turn = (room.turn + 1) % room.players.length;
  if (room.endTrigger && room.turn === 0) finish(room);
}

function finish(room) {
  room.phase = 'over';
  room.pending = null;
  const best = Math.max(...room.players.map(pointsOf));
  const top = room.players.filter((p) => pointsOf(p) === best);
  const fewest = Math.min(...top.map((p) => p.cards.length));
  room.winnerIds = top.filter((p) => p.cards.length === fewest).map((p) => p.id);
  say(room, '게임 끝!');
}

// 행동을 마친 뒤: 보석이 10개를 넘으면 버리고, 그다음 귀족을 확인한다
function afterAction(room, p) {
  const total = gemTotal(p);
  if (total > TOKEN_LIMIT) {
    room.pending = { t: 'discard', who: p.id, need: total - TOKEN_LIMIT };
    return;
  }
  resolveNobles(room, p);
}

function resolveNobles(room, p) {
  const eligible = eligibleNobles(room, p);
  if (eligible.length === 1) {
    claimNoble(room, p, eligible[0].id);
    endTurn(room);
  } else if (eligible.length > 1) {
    room.pending = { t: 'noble', who: p.id, options: eligible.map((n) => n.id) };
  } else {
    endTurn(room);
  }
}

function checkMain(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (room.pending) return { error: '먼저 처리할 일이 있어요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

// ---- 행동 ----

function takeGems(room, id, colors) {
  const bad = checkMain(room, id);
  if (bad) return bad;
  if (!Array.isArray(colors) || colors.length < 1 || colors.length > 3 || !colors.every((c) => COLORS.includes(c))) {
    return { error: '가져올 보석을 고르세요.' };
  }
  const me = cur(room);
  const distinct = new Set(colors);
  const avail = COLORS.filter((c) => room.bank[c] > 0);
  if (colors.length === 2 && distinct.size === 1) {
    if (room.bank[colors[0]] < 4) return { error: '같은 색 2개는 그 색이 4개 이상 남아 있을 때만 가져올 수 있어요.' };
  } else {
    if (distinct.size !== colors.length) return { error: '같은 색은 2개를 가져올 때만 겹칠 수 있어요.' };
    if (!colors.every((c) => room.bank[c] > 0)) return { error: '남은 보석이 없는 색이에요.' };
    const must = Math.min(3, avail.length);
    if (colors.length !== must) {
      return { error: must === 3 ? '서로 다른 색 3개를 가져오세요.' : `가져올 수 있는 색이 ${must}가지뿐이에요. 모두 가져오세요.` };
    }
  }
  colors.forEach((c) => {
    room.bank[c] -= 1;
    me.gems[c] += 1;
  });
  say(room, `${me.name}님이 보석을 가져왔어요: ${colors.map((c) => COLOR_NAME[c]).join(', ')}`);
  afterAction(room, me);
  return {};
}

function reserve(room, id, level, index, fromDeck) {
  const bad = checkMain(room, id);
  if (bad) return bad;
  const me = cur(room);
  if (me.reserved.length >= RESERVE_LIMIT) return { error: `예약은 최대 ${RESERVE_LIMIT}장까지예요.` };
  if (![1, 2, 3].includes(level)) return { error: '잘못된 단계예요.' };
  let card;
  if (fromDeck) {
    if (room.decks[level].length === 0) return { error: '그 덱에 카드가 없어요.' };
    card = room.decks[level].pop();
    say(room, `${me.name}님이 ${level}단계 덱에서 카드 1장을 예약했어요.`);
  } else {
    card = room.board[level][index];
    if (!card) return { error: '그 자리에 카드가 없어요.' };
    refill(room, level, index);
    say(room, `${me.name}님이 ${level}단계 카드를 예약했어요.`);
  }
  me.reserved.push(card);
  if (room.bank.y > 0) {
    room.bank.y -= 1;
    me.gems.y += 1;
  }
  afterAction(room, me);
  return {};
}

function buy(room, id, spec) {
  const bad = checkMain(room, id);
  if (bad) return bad;
  const me = cur(room);
  let card;
  let from;
  if (spec.reserved != null) {
    card = me.reserved.find((c) => c.id === spec.reserved);
    from = 'reserved';
  } else {
    card = room.board[spec.level] && room.board[spec.level][spec.index];
    from = 'board';
  }
  if (!card) return { error: '그 카드가 없어요.' };
  const { ok, pay } = payment(me, card);
  if (!ok) return { error: '보석이 모자라서 살 수 없어요.' };
  for (const c of [...COLORS, 'y']) {
    me.gems[c] -= pay[c];
    room.bank[c] += pay[c];
  }
  if (from === 'reserved') me.reserved = me.reserved.filter((c) => c !== card);
  else refill(room, spec.level, spec.index);
  me.cards.push(card);
  say(room, `${me.name}님이 ${card.level}단계 ${COLOR_NAME[card.bonus]} 카드를 샀어요.${card.points ? ` (+${card.points}점)` : ''}`);
  afterAction(room, me);
  return {};
}

function discardTokens(room, id, gems) {
  const pd = room.pending;
  if (!pd || pd.t !== 'discard' || pd.who !== id) return { error: '지금은 보석을 버릴 때가 아니에요.' };
  const me = getPlayer(room, id);
  let sum = 0;
  for (const c of [...COLORS, 'y']) {
    const n = Number((gems || {})[c] || 0);
    if (!Number.isInteger(n) || n < 0 || n > me.gems[c]) return { error: '버릴 수 없는 개수예요.' };
    sum += n;
  }
  if (sum !== pd.need) return { error: `정확히 ${pd.need}개를 버려야 해요.` };
  for (const c of [...COLORS, 'y']) {
    const n = Number(gems[c] || 0);
    me.gems[c] -= n;
    room.bank[c] += n;
  }
  say(room, `${me.name}님이 보석 ${sum}개를 반납했어요.`);
  room.pending = null;
  resolveNobles(room, me);
  return {};
}

function chooseNoble(room, id, nobleId) {
  const pd = room.pending;
  if (!pd || pd.t !== 'noble' || pd.who !== id) return { error: '지금은 귀족을 고를 때가 아니에요.' };
  if (!pd.options.includes(nobleId)) return { error: '그 귀족은 고를 수 없어요.' };
  room.pending = null;
  claimNoble(room, getPlayer(room, id), nobleId);
  endTurn(room);
  return {};
}

function canAnyMove(room, p) {
  if (COLORS.some((c) => room.bank[c] > 0)) return true;
  if (p.reserved.length < RESERVE_LIMIT && ([1, 2, 3].some((l) => room.decks[l].length || room.board[l].some(Boolean)))) return true;
  const buyable = [...p.reserved, ...[1, 2, 3].flatMap((l) => room.board[l].filter(Boolean))];
  return buyable.some((c) => payment(p, c).ok);
}

function pass(room, id) {
  const bad = checkMain(room, id);
  if (bad) return bad;
  const me = cur(room);
  if (canAnyMove(room, me)) return { error: '할 수 있는 행동이 있어서 넘길 수 없어요.' };
  say(room, `${me.name}님은 할 수 있는 행동이 없어 차례를 넘겼어요.`);
  endTurn(room);
  return {};
}

// 방장: 자리를 비운 사람 때문에 멈췄을 때 기본값으로 진행
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const pd = room.pending;
  if (pd && pd.t === 'discard') {
    const me = getPlayer(room, pd.who);
    const gems = emptyGems();
    let left = pd.need;
    for (const c of ['y', ...COLORS].sort((a, b) => me.gems[b] - me.gems[a])) {
      const n = Math.min(left, me.gems[c]);
      gems[c] = n;
      left -= n;
    }
    return discardTokens(room, pd.who, gems);
  }
  if (pd && pd.t === 'noble') return chooseNoble(room, pd.who, pd.options[0]);
  say(room, `방장이 ${cur(room).name}님의 차례를 넘겼어요.`);
  endTurn(room);
  return {};
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  room.players.forEach((p) => {
    p.gems = emptyGems();
    p.cards = [];
    p.reserved = [];
    p.nobles = [];
  });
  room.bank = { ...emptyGems(), y: GOLD };
  COLORS.forEach((c) => { room.bank[c] = BANK_PER_COLOR[n]; });
  for (const level of [1, 2, 3]) {
    room.decks[level] = shuffle(CARDS.filter((c) => c.level === level));
    room.board[level] = [];
    for (let i = 0; i < ROW_SIZE; i++) room.board[level].push(room.decks[level].pop());
  }
  room.nobles = shuffle(NOBLES).slice(0, n + 1);
  room.turn = 0;
  room.pending = null;
  room.endTrigger = false;
  room.winnerIds = [];
  room.log = [];
  room.gameNo += 1;
  room.phase = 'play';
  say(room, `게임 시작! ${cur(room).name}님부터 시작해요.`);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    p.gems = emptyGems();
    p.cards = [];
    p.reserved = [];
    p.nobles = [];
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', pending: null, endTrigger: false, winnerIds: [], log: [], nobles: [], bank: null });
  return {};
}

function restart(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '대기실에서는 "게임 시작"을 누르세요.' };
  if (room.players.length < MIN_PLAYERS || room.players.some((p) => !p.connected)) {
    return { error: '접속이 끊긴 사람이 있어요. 대기실로 돌아가서 정리하세요.' };
  }
  const prev = room.phase;
  room.phase = 'lobby';
  const r = start(room, byId);
  if (r.error) room.phase = prev;
  return r;
}

// ---- 각자에게 보여줄 상태 ----

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const started = room.phase !== 'lobby';
  const playing = room.phase === 'play';
  const myTurn = playing && !room.pending && cur(room).id === viewerId;
  const pd = room.pending;
  const iAmWho = !!(pd && pd.who === viewerId);

  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (!playing) mode = 'over';
  else if (iAmWho) mode = pd.t;
  else if (myTurn) mode = 'main';

  const cardView = (c) => c && {
    id: c.id, level: c.level, bonus: c.bonus, points: c.points, cost: c.cost,
    afford: !!(me && mode === 'main' && payment(me, c).ok),
  };

  return {
    kind: 'splendor',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    bank: room.bank,
    deckCounts: { 1: room.decks[1].length, 2: room.decks[2].length, 3: room.decks[3].length },
    board: { 1: room.board[1].map(cardView), 2: room.board[2].map(cardView), 3: room.board[3].map(cardView) },
    nobles: room.nobles,
    turnId: playing ? cur(room).id : null,
    endTrigger: room.endTrigger,
    pending: pd ? { t: pd.t, who: pd.who, need: pd.need || null, options: pd.t === 'noble' ? pd.options : null } : null,
    canPass: !!(myTurn && me && !canAnyMove(room, me)),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      gems: p.gems,
      bonus: Object.fromEntries(COLORS.map((c) => [c, bonusOf(p, c)])),
      points: started ? pointsOf(p) : 0,
      cardCount: p.cards.length,
      reservedCount: p.reserved.length,
      reserved: p.id === viewerId ? p.reserved.map(cardView) : null,
      nobles: p.nobles,
    })),
    winnerIds: room.winnerIds,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  take: (room, id, msg) => takeGems(room, id, msg.colors),
  reserve: (room, id, msg) => reserve(room, id, msg.level, msg.index, !!msg.deck),
  buy: (room, id, msg) => buy(room, id, { level: msg.level, index: msg.index, reserved: msg.reserved }),
  discard: (room, id, msg) => discardTokens(room, id, msg.gems),
  noble: (room, id, msg) => chooseNoble(room, id, msg.id),
  pass: (room, id) => pass(room, id),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  COLORS,
  CARDS,
  NOBLES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  WIN_POINTS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  start,
  backToLobby,
  restart,
  takeGems,
  reserve,
  buy,
  discardTokens,
  chooseNoble,
  pass,
  force,
  viewFor,
  payment,
  pointsOf,
  gemTotal,
};
