'use strict';
// 보난자(콩 심기 카드 게임) 규칙 엔진, 3~5명.
//
// 카드 150장(콩 10종, 종류마다 장수가 다름). 3명이면 커피콩을 뺀다.
// 손패는 순서를 바꿀 수 없다. 새 카드는 맨 뒤에 붙고, 맨 앞 카드부터 심어야 한다.
// 내 차례:
//   1) 심기: 손패 맨 앞 카드를 반드시 심고, 원하면 그다음 카드도 하나 더 심는다. (밭에는 한 종류의 콩만)
//   2) 거래: 덱에서 카드 2장을 펼친다. 펼친 카드와 내 손패 중 내놓을 카드를 공개하고, 다른 사람이 제안하면 수락한다.
//      받은 카드(와 거래하지 않은 펼친 카드)는 바로 심어야 한다. 다른 사람끼리는 거래할 수 없다.
//   3) 모두가 받은 카드를 심는다.
//   4) 덱에서 3장을 뽑아 손패 맨 뒤에 붙인다.
// 수확(밭의 콩을 코인으로 바꾸기)은 언제든 할 수 있다. 콩 수가 빈오미터의 기준 이상이면 코인(카드 뒷면)이 된다.
//   콩이 1개뿐인 밭은 다른 밭에 2개 이상이 있으면 수확할 수 없다.
// 코인 3개를 내고 세 번째 밭을 살 수 있다.
// 덱이 세 번째로 바닥나면 끝나고, 모두 밭을 수확해서 코인이 가장 많은 사람이 승리한다.
//
// 콩 10종의 장수와 빈오미터는 기억에 의존한 원작 기준 값이라 실제 카드와 조금 다를 수 있다.

const { shuffle, newId, newToken, cleanName } = require('./common');
const DATA = require('./public/bohnanza-data.js');

const { BEANS, coinsFor } = DATA;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 5;
const HAND_START = 5;
const MAX_RUNS = 3;
const FIELD_PRICE = 3;
const LOG_KEEP = 14;

function buildDeck() {
  const cards = [];
  let id = 0;
  for (const [type, b] of Object.entries(BEANS)) for (let i = 0; i < b.n; i++) cards.push({ id: id++, type });
  return cards;
}
const ALL_CARDS = buildDeck();

function createRoom(code) {
  return {
    kind: 'bohnanza',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    deck: [],
    discard: [],
    deckRuns: 1, // 몇 번째 덱인지 (3번째가 바닥나면 끝)
    turn: 0,
    step: null, // plant1 | trade | plantAll
    plantCount: 0,
    faceUp: [], // 차례인 사람이 펼친 2장
    offered: [], // 차례인 사람이 손패에서 내놓은 카드 id
    proposals: {}, // 제안자 id -> { give: [id], want: [id] }
    winnerIds: [],
    scores: {},
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
  const player = { id: newId(), token: newToken(), name, connected: true, hand: [], table: [], fields: [], coins: [] };
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
const emptyField = () => ({ type: null, cards: [] });
const typeName = (t) => BEANS[t].name;

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 덱에서 한 장. 덱이 비면 버린 더미를 섞어 다시 쓰고, 세 번째로 비면 null을 돌려준다.
function drawOne(room) {
  if (room.deck.length === 0) {
    if (room.deckRuns >= MAX_RUNS || room.discard.length === 0) return null;
    room.deck = shuffle(room.discard);
    room.discard = [];
    room.deckRuns += 1;
    say(room, `덱이 바닥나 버린 카드를 섞었어요. (${room.deckRuns}번째 덱)`);
  }
  return room.deck.pop();
}

// n장을 뽑는다. 덱이 세 번째로 바닥나면 게임을 끝내고 false.
function drawInto(room, list, n) {
  for (let i = 0; i < n; i++) {
    const c = drawOne(room);
    if (!c) {
      finishGame(room);
      return false;
    }
    list.push(c);
  }
  return true;
}

function canHarvest(p, idx) {
  const f = p.fields[idx];
  if (!f || f.cards.length === 0) return false;
  if (f.cards.length === 1) return !p.fields.some((g) => g.cards.length > 1);
  return true;
}

function doHarvest(room, p, idx) {
  const f = p.fields[idx];
  const n = f.cards.length;
  const coins = coinsFor(f.type, n);
  p.coins.push(...f.cards.slice(0, coins));
  room.discard.push(...f.cards.slice(coins));
  say(room, `${p.name}님이 ${typeName(f.type)} ${n}개를 수확해 코인 ${coins}개를 받았어요.`);
  p.fields[idx] = emptyField();
  return coins;
}

function finishGame(room) {
  if (room.phase === 'over') return;
  room.players.forEach((p) => {
    p.fields.forEach((f, i) => {
      if (f.cards.length) {
        const coins = coinsFor(f.type, f.cards.length);
        p.coins.push(...f.cards.slice(0, coins));
        room.discard.push(...f.cards.slice(coins));
        p.fields[i] = emptyField();
      }
    });
  });
  room.scores = Object.fromEntries(room.players.map((p) => [p.id, p.coins.length]));
  const best = Math.max(...Object.values(room.scores));
  room.winnerIds = room.players.filter((p) => room.scores[p.id] === best).map((p) => p.id);
  room.phase = 'over';
  room.step = null;
  room.discard.push(...room.faceUp); // 펼쳐 둔 카드가 사라지지 않게
  room.faceUp = [];
  room.offered = [];
  room.proposals = {};
  say(room, '덱이 세 번째로 바닥났어요. 게임 끝! 모두 밭을 수확했어요.');
}

// ---- 진행 ----

function startTrade(room) {
  const A = cur(room);
  room.faceUp = [];
  if (!drawInto(room, room.faceUp, 2)) return;
  room.step = 'trade';
  room.offered = [];
  room.proposals = {};
  say(room, `${A.name}님이 카드 2장을 펼쳤어요: ${room.faceUp.map((c) => typeName(c.type)).join(', ')}`);
}

function checkPlantAllDone(room) {
  if (room.step !== 'plantAll') return;
  if (room.players.every((p) => p.table.length === 0)) finishTurn(room);
}

function finishTurn(room) {
  const A = cur(room);
  if (!drawInto(room, A.hand, 3)) return;
  room.turn = (room.turn + 1) % room.players.length;
  room.step = 'plant1';
  room.plantCount = 0;
  room.faceUp = [];
  room.offered = [];
  room.proposals = {};
  say(room, `▶ ${cur(room).name}님의 차례`);
  if (cur(room).hand.length === 0) startTrade(room); // 손패가 없으면 심기를 건너뛴다
}

function putOnField(p, card, idx) {
  const f = p.fields[idx];
  if (!f) return { error: '그런 밭이 없어요.' };
  if (f.type && f.type !== card.type) return { error: '다른 종류의 콩이 심어져 있어요. 먼저 수확하세요.' };
  f.type = card.type;
  f.cards.push(card);
  return null;
}

function plant(room, id, cardId, fieldIdx) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  if (room.step === 'plant1') {
    if (cur(room).id !== id) return { error: '지금은 내가 심을 차례가 아니에요.' };
    if (room.plantCount >= 2) return { error: '이번 턴에는 더 심을 수 없어요.' };
    const card = p.hand[0];
    if (!card || card.id !== cardId) return { error: '손패 맨 앞 카드부터 심어야 해요.' };
    const err = putOnField(p, card, fieldIdx);
    if (err) return err;
    p.hand.shift();
    room.plantCount += 1;
    say(room, `${p.name}님이 ${typeName(card.type)}을(를) 심었어요.`);
    if (room.plantCount >= 2 || p.hand.length === 0) startTrade(room);
    return {};
  }
  if (room.step === 'plantAll') {
    const card = p.table.find((c) => c.id === cardId);
    if (!card) return { error: '심을 카드가 아니에요.' };
    const err = putOnField(p, card, fieldIdx);
    if (err) return err;
    p.table = p.table.filter((c) => c !== card);
    say(room, `${p.name}님이 받은 ${typeName(card.type)}을(를) 심었어요.`);
    checkPlantAllDone(room);
    return {};
  }
  return { error: '지금은 심을 때가 아니에요.' };
}

function skipPlant(room, id) {
  if (room.phase !== 'play' || room.step !== 'plant1') return { error: '지금은 넘길 수 없어요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  if (room.plantCount < 1) return { error: '첫 번째 카드는 반드시 심어야 해요.' };
  startTrade(room);
  return {};
}

function harvest(room, id, fieldIdx) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  const f = p.fields[fieldIdx];
  if (!f || f.cards.length === 0) return { error: '수확할 콩이 없어요.' };
  if (!canHarvest(p, fieldIdx)) return { error: '콩이 1개뿐인 밭은 다른 밭에 2개 이상 있으면 수확할 수 없어요.' };
  doHarvest(room, p, fieldIdx);
  return {};
}

function buyField(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  if (p.fields.length >= 3) return { error: '밭은 최대 3개예요.' };
  if (p.coins.length < FIELD_PRICE) return { error: `코인 ${FIELD_PRICE}개가 필요해요.` };
  room.discard.push(...p.coins.splice(0, FIELD_PRICE));
  p.fields.push(emptyField());
  say(room, `${p.name}님이 코인 ${FIELD_PRICE}개로 세 번째 밭을 샀어요.`);
  return {};
}

// ---- 거래 ----

function checkTrade(room, id, active) {
  if (room.phase !== 'play' || room.step !== 'trade') return { error: '지금은 거래 시간이 아니에요.' };
  const isActive = cur(room).id === id;
  if (active && !isActive) return { error: '차례인 사람만 할 수 있어요.' };
  if (!active && isActive) return { error: '차례인 사람은 제안을 받는 쪽이에요.' };
  return null;
}

const visibleIds = (room) => [...room.faceUp.map((c) => c.id), ...room.offered];

function offer(room, id, cardIds) {
  const bad = checkTrade(room, id, true);
  if (bad) return bad;
  const A = cur(room);
  const ids = Array.isArray(cardIds) ? [...new Set(cardIds)] : [];
  if (!ids.every((c) => A.hand.some((h) => h.id === c))) return { error: '손패에 없는 카드예요.' };
  room.offered = ids;
  // 더 이상 내놓지 않는 카드를 원하던 제안은 정리한다
  pruneProposals(room);
  return {};
}

function propose(room, id, give, want) {
  const bad = checkTrade(room, id, false);
  if (bad) return bad;
  const p = getPlayer(room, id);
  const g = Array.isArray(give) ? [...new Set(give)] : [];
  const w = Array.isArray(want) ? [...new Set(want)] : [];
  if (g.length + w.length === 0) return { error: '주고받을 카드를 고르세요.' };
  if (!g.every((c) => p.hand.some((h) => h.id === c))) return { error: '내 손패에 없는 카드예요.' };
  if (!w.every((c) => visibleIds(room).includes(c))) return { error: '차례인 사람이 내놓지 않은 카드예요.' };
  room.proposals[id] = { give: g, want: w };
  return {};
}

function withdraw(room, id) {
  if (room.phase !== 'play' || room.step !== 'trade') return { error: '지금은 거래 시간이 아니에요.' };
  delete room.proposals[id];
  return {};
}

function reject(room, id, fromId) {
  const bad = checkTrade(room, id, true);
  if (bad) return bad;
  delete room.proposals[fromId];
  return {};
}

function pruneProposals(room) {
  const vis = visibleIds(room);
  for (const [pid, pr] of Object.entries(room.proposals)) {
    const q = getPlayer(room, pid);
    if (!q || !pr.want.every((c) => vis.includes(c)) || !pr.give.every((c) => q.hand.some((h) => h.id === c))) delete room.proposals[pid];
  }
}

function accept(room, id, fromId) {
  const bad = checkTrade(room, id, true);
  if (bad) return bad;
  const A = cur(room);
  const q = getPlayer(room, fromId);
  const pr = room.proposals[fromId];
  if (!q || !pr) return { error: '그 제안이 없어요.' };
  pruneProposals(room);
  if (!room.proposals[fromId]) return { error: '제안한 카드가 더 이상 없어서 취소됐어요.' };
  const fromA = pr.want.map((cid) => {
    const fi = room.faceUp.findIndex((c) => c.id === cid);
    if (fi >= 0) return room.faceUp.splice(fi, 1)[0];
    const hi = A.hand.findIndex((c) => c.id === cid);
    return A.hand.splice(hi, 1)[0];
  });
  const fromQ = pr.give.map((cid) => q.hand.splice(q.hand.findIndex((c) => c.id === cid), 1)[0]);
  q.table.push(...fromA);
  A.table.push(...fromQ);
  room.offered = room.offered.filter((c) => !pr.want.includes(c));
  delete room.proposals[fromId];
  pruneProposals(room);
  say(room, `🤝 ${A.name}님과 ${q.name}님이 거래했어요: ${fromA.map((c) => typeName(c.type)).join(', ') || '없음'} ↔ ${fromQ.map((c) => typeName(c.type)).join(', ') || '없음'}`);
  return {};
}

function endTrade(room, id) {
  const bad = checkTrade(room, id, true);
  if (bad) return bad;
  const A = cur(room);
  A.table.push(...room.faceUp);
  room.faceUp = [];
  room.offered = [];
  room.proposals = {};
  room.step = 'plantAll';
  say(room, '거래가 끝났어요. 받은 카드를 모두 심어요.');
  checkPlantAllDone(room);
  return {};
}

// ---- 방장 도우미 / 시작 / 초기화 ----

// 자리를 비운 사람 대신: 같은 콩 밭 → 빈 밭 → 수확 가능한 밭 중 코인이 가장 적은 밭을 수확하고 심는다
function autoPlant(room, p, card) {
  for (let guard = 0; guard < 4; guard++) {
    let idx = p.fields.findIndex((f) => f.type === card.type);
    if (idx < 0) idx = p.fields.findIndex((f) => f.cards.length === 0);
    if (idx >= 0) return putOnField(p, card, idx) || null;
    const options = p.fields.map((f, i) => i).filter((i) => canHarvest(p, i));
    options.sort((a, b) => coinsFor(p.fields[a].type, p.fields[a].cards.length) - coinsFor(p.fields[b].type, p.fields[b].cards.length));
    doHarvest(room, p, options[0]);
  }
  return { error: '심을 수 없어요.' };
}

function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const A = cur(room);
  if (room.step === 'plant1') {
    if (room.plantCount < 1 && A.hand.length) {
      const card = A.hand.shift();
      autoPlant(room, A, card);
      room.plantCount += 1;
      say(room, `${A.name}님 대신 ${typeName(card.type)}을(를) 심었어요.`);
    }
    startTrade(room);
  } else if (room.step === 'trade') {
    endTrade(room, A.id);
  } else if (room.step === 'plantAll') {
    for (const p of room.players) {
      while (p.table.length) {
        const card = p.table.shift();
        autoPlant(room, p, card);
      }
    }
    checkPlantAllDone(room);
  }
  return {};
}

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  room.deck = shuffle(ALL_CARDS.filter((c) => n > 3 || c.type !== 'coffee')); // 3명이면 커피콩을 뺀다
  room.discard = [];
  room.deckRuns = 1;
  room.players.forEach((p) => {
    p.hand = room.deck.splice(0, HAND_START);
    p.table = [];
    p.fields = [emptyField(), emptyField()];
    p.coins = [];
  });
  Object.assign(room, {
    turn: 0, step: 'plant1', plantCount: 0, faceUp: [], offered: [], proposals: {}, winnerIds: [], scores: {}, log: [],
    gameNo: room.gameNo + 1, phase: 'play',
  });
  say(room, `게임 시작! ${cur(room).name}님부터 시작해요.${n === 3 ? ' (3명: 커피콩을 뺐어요)' : ''}`);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    p.hand = []; p.table = []; p.fields = []; p.coins = [];
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', step: null, deck: [], discard: [], faceUp: [], offered: [], proposals: {}, winnerIds: [], scores: {}, log: [] });
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

const pub = (c) => ({ id: c.id, type: c.type });

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const started = room.phase !== 'lobby';
  const playing = room.phase === 'play';
  const isA = playing && cur(room).id === viewerId;

  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (!playing) mode = 'over';
  else if (room.step === 'plant1') mode = isA ? 'plant1' : 'wait';
  else if (room.step === 'trade') mode = isA ? 'tradeA' : 'tradeB';
  else if (room.step === 'plantAll') mode = me && me.table.length ? 'plantAll' : 'wait';

  return {
    kind: 'bohnanza',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    step: room.step,
    plantCount: room.plantCount,
    turnId: playing ? cur(room).id : null,
    deckCount: room.deck.length,
    deckRuns: room.deckRuns,
    maxRuns: MAX_RUNS,
    discardTop: room.discard.length ? room.discard[room.discard.length - 1].type : null,
    fieldPrice: FIELD_PRICE,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      handCount: p.hand.length,
      tableCount: p.table.length,
      coins: p.coins.length,
      fields: p.fields.map((f, i) => ({
        type: f.type,
        count: f.cards.length,
        value: f.type ? coinsFor(f.type, f.cards.length) : 0,
        canHarvest: p.id === viewerId ? canHarvest(p, i) : null,
      })),
    })),
    hand: me ? me.hand.map(pub) : [],
    table: me ? me.table.map(pub) : [],
    faceUp: room.faceUp.map(pub),
    offered: room.offered.map((cid) => {
      const c = cur(room).hand.find((h) => h.id === cid);
      return c ? pub(c) : null;
    }).filter(Boolean),
    proposals: Object.entries(room.proposals).map(([from, pr]) => {
      const q = getPlayer(room, from);
      return { from, give: pr.give.map((cid) => pub(q.hand.find((h) => h.id === cid))), want: pr.want };
    }),
    winnerIds: room.winnerIds,
    scores: room.scores,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  plant: (room, id, msg) => plant(room, id, msg.card, msg.field),
  skipPlant: (room, id) => skipPlant(room, id),
  harvest: (room, id, msg) => harvest(room, id, msg.field),
  buyField: (room, id) => buyField(room, id),
  offer: (room, id, msg) => offer(room, id, msg.cards),
  propose: (room, id, msg) => propose(room, id, msg.give, msg.want),
  withdraw: (room, id) => withdraw(room, id),
  reject: (room, id, msg) => reject(room, id, msg.from),
  accept: (room, id, msg) => accept(room, id, msg.from),
  endTrade: (room, id) => endTrade(room, id),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  ALL_CARDS,
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
  plant,
  skipPlant,
  harvest,
  buyField,
  offer,
  propose,
  withdraw,
  reject,
  accept,
  endTrade,
  force,
  viewFor,
  canHarvest,
};
