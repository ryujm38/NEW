'use strict';
// 라스베가스(주사위 보드게임) 규칙 엔진, 3~6명. 돈의 단위는 $1,000("k").
//
// 4라운드. 매 라운드 카지노 6곳(1~6번)에 지폐를 합이 $50k 이상이 될 때까지 깐다.
// 내 차례: 남은 주사위를 모두 굴리고, 나온 숫자 중 하나를 골라 그 숫자가 나온 주사위를 전부 같은 번호의 카지노에 놓는다.
// 모두의 주사위가 소진되면 카지노마다 계산한다:
//   주사위 수가 같은 사람끼리는 모두 상쇄(탈락)되고, 남은 사람 중 많이 놓은 순서대로 가장 큰 지폐부터 가져간다.
//   받을 사람이 없는 지폐는 버린다.
// 4라운드가 끝나면 돈이 가장 많은 사람이 승리. 동액이면 공동 우승.
// 시작 플레이어는 라운드마다 한 칸씩 넘어간다.
//
// 지폐 54장 구성: $10k ×6, $20k ×8, $30k ×8, $40k ×6, $50k ×6, $60k ×5, $70k ×5, $80k ×5, $90k ×5.
// 주사위는 8개씩(3~5명), 6명일 때만 6개씩이다. (원작은 2~5명이고 2인용 변형 규칙은 넣지 않았다.)

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 6;
const ROUNDS = 4;
const CASINOS = 6;
const TARGET = 50; // 카지노마다 지폐 합이 이 값 이상이 되도록 깐다
const COLORS = ['#e0453a', '#3b82e0', '#35a862', '#e8c23a', '#b98af0', '#f08a3a'];
const LOG_KEEP = 14;
const BILL_COUNTS = [[10, 6], [20, 8], [30, 8], [40, 6], [50, 6], [60, 5], [70, 5], [80, 5], [90, 5]];

const BILLS = BILL_COUNTS.flatMap(([v, n]) => Array(n).fill(v));
const diceFor = (n) => (n <= 5 ? 8 : 6);
const roll1 = () => crypto.randomInt(1, 7);

function createRoom(code) {
  return {
    kind: 'vegas',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | roundEnd | over
    gameNo: 0,
    round: 0,
    turn: 0,
    step: null, // roll | place
    rolled: null, // 방금 굴린 주사위 값들
    casinos: [],
    deck: [],
    results: [],
    acks: new Set(),
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
  const player = { id: newId(), token: newToken(), name, connected: true, color: '', dice: 0, money: [] };
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
const total = (p) => p.money.reduce((a, b) => a + b, 0);

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// ---- 진행 ----

function startRound(room) {
  room.round += 1;
  room.casinos = [];
  for (let n = 1; n <= CASINOS; n++) {
    const bills = [];
    while (bills.reduce((a, b) => a + b, 0) < TARGET && room.deck.length) bills.push(room.deck.pop());
    bills.sort((a, b) => b - a);
    room.casinos.push({ n, bills, dice: {} });
  }
  const dice = diceFor(room.players.length);
  room.players.forEach((p) => { p.dice = dice; });
  room.turn = (room.round - 1) % room.players.length; // 시작 플레이어가 라운드마다 넘어간다
  room.step = 'roll';
  room.rolled = null;
  room.phase = 'play';
  say(room, `🎰 ${room.round}라운드 시작! ${cur(room).name}님부터 해요.`);
}

function nextPlayer(room) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (room.turn + i) % n;
    if (room.players[idx].dice > 0) {
      room.turn = idx;
      room.step = 'roll';
      return true;
    }
  }
  return false;
}

// 카지노별 계산. 같은 수를 놓은 사람은 모두 탈락하고, 남은 사람이 많이 놓은 순서대로 큰 지폐를 가져간다.
function settleCasino(room, c) {
  const entries = Object.entries(c.dice).map(([id, n]) => ({ id, n }));
  const rows = entries.map((e) => ({ ...e, tied: entries.filter((x) => x.n === e.n).length > 1, bill: null }));
  const survivors = rows.filter((r) => !r.tied).sort((a, b) => b.n - a.n);
  survivors.forEach((r, i) => {
    if (i < c.bills.length) {
      r.bill = c.bills[i];
      getPlayer(room, r.id).money.push(r.bill);
    }
  });
  rows.sort((a, b) => b.n - a.n);
  return { casino: c.n, bills: c.bills.slice(), rows };
}

function endRound(room) {
  room.results = room.casinos.map((c) => settleCasino(room, c));
  room.phase = 'roundEnd';
  room.acks = new Set();
  room.rolled = null;
  say(room, `${room.round}라운드 끝! 카지노별로 계산했어요.`);
}

function finish(room) {
  room.phase = 'over';
  const best = Math.max(...room.players.map(total));
  room.winnerIds = room.players.filter((p) => total(p) === best).map((p) => p.id);
  say(room, '게임 끝!');
}

// ---- 행동 ----

function checkTurn(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

function roll(room, id) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.step !== 'roll') return { error: '이미 굴렸어요. 놓을 숫자를 고르세요.' };
  const p = cur(room);
  room.rolled = Array.from({ length: p.dice }, roll1).sort((a, b) => a - b);
  room.step = 'place';
  say(room, `🎲 ${p.name}님이 굴렸어요: ${room.rolled.join(' ')}`);
  return {};
}

function place(room, id, number) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.step !== 'place') return { error: '먼저 주사위를 굴리세요.' };
  if (!room.rolled.includes(number)) return { error: '나오지 않은 숫자예요.' };
  const p = cur(room);
  const count = room.rolled.filter((v) => v === number).length;
  const c = room.casinos[number - 1];
  c.dice[p.id] = (c.dice[p.id] || 0) + count;
  p.dice -= count;
  room.rolled = null;
  say(room, `${p.name}님이 ${number}번 카지노에 주사위 ${count}개를 놓았어요. (남은 주사위 ${p.dice}개)`);
  if (!nextPlayer(room)) endRound(room);
  return {};
}

function ack(room, id) {
  if (room.phase !== 'roundEnd') return { error: '지금은 확인할 게 없어요.' };
  if (!getPlayer(room, id)) return { error: '플레이어가 아니에요.' };
  room.acks.add(id);
  maybeAdvance(room);
  return {};
}

function maybeAdvance(room) {
  if (room.phase !== 'roundEnd') return;
  const need = room.players.filter((p) => p.connected);
  if (need.length > 0 && need.every((p) => room.acks.has(p.id))) nextRound(room);
}

function nextRound(room) {
  room.acks = new Set();
  if (room.round >= ROUNDS) finish(room);
  else startRound(room);
}

// 방장: 자리를 비운 사람 대신 진행. 굴리고, 가장 많이 나온 숫자(같으면 큰 숫자)를 놓는다.
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'roundEnd') {
    nextRound(room);
    return {};
  }
  if (room.phase !== 'play') return { error: '지금은 넘길 게 없어요.' };
  const id = cur(room).id;
  if (room.step === 'roll') roll(room, id);
  const counts = {};
  room.rolled.forEach((v) => { counts[v] = (counts[v] || 0) + 1; });
  const best = Object.keys(counts).map(Number).sort((a, b) => counts[b] - counts[a] || b - a)[0];
  return place(room, id, best);
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  room.players.forEach((p, i) => {
    p.color = COLORS[i];
    p.money = [];
    p.dice = 0;
  });
  Object.assign(room, { deck: shuffle(BILLS), round: 0, results: [], winnerIds: [], log: [], gameNo: room.gameNo + 1, acks: new Set() });
  startRound(room);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => { p.money = []; p.dice = 0; });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', step: null, rolled: null, casinos: [], deck: [], results: [], winnerIds: [], log: [], round: 0, acks: new Set() });
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
  const started = room.phase !== 'lobby';
  const playing = room.phase === 'play';
  const myTurn = playing && cur(room).id === viewerId;
  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (room.phase === 'over') mode = 'over';
  else if (room.phase === 'roundEnd') mode = 'roundEnd';
  else if (myTurn) mode = room.step;

  return {
    kind: 'vegas',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    round: room.round,
    rounds: ROUNDS,
    turnId: playing ? cur(room).id : null,
    step: room.step,
    rolled: room.rolled,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      color: p.color,
      dice: p.dice,
      bills: p.money.length,
      total: started ? total(p) : 0,
      acked: room.phase === 'roundEnd' ? room.acks.has(p.id) : null,
    })),
    casinos: room.casinos.map((c) => ({ n: c.n, bills: c.bills, dice: c.dice })),
    results: room.phase === 'roundEnd' || room.phase === 'over' ? room.results : [],
    winnerIds: room.winnerIds,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  roll: (room, id) => roll(room, id),
  place: (room, id, msg) => place(room, id, msg.number),
  ack: (room, id) => ack(room, id),
};

module.exports = {
  actions,
  afterDisconnect: maybeAdvance,
  BILLS,
  MIN_PLAYERS,
  MAX_PLAYERS,
  ROUNDS,
  CASINOS,
  TARGET,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  start,
  backToLobby,
  restart,
  roll,
  place,
  ack,
  force,
  viewFor,
  settleCasino,
  startRound,
  diceFor,
};
