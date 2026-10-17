'use strict';
// 우노 규칙 엔진. 아발론(game.js)과 같은 모양(createRoom/addPlayer/viewFor/actions)으로 서버에 꽂힌다.
//
// 108장: 색(빨강 r, 노랑 y, 초록 g, 파랑 b)마다 0이 1장, 1~9와 스킵/리버스/+2가 각 2장 = 25장 × 4
//        + 와일드 4장 + 와일드 +4 4장
// 규칙: 7장씩 받고, 같은 색이나 같은 숫자/기호를 내거나 와일드를 낸다. 낼 게 없으면 1장 뽑는다.
//   - 뽑은 카드가 낼 수 있으면 그 카드만 낼 수 있고, 안 내면 넘긴다. 낼 수 없으면 자동으로 넘어간다.
//   - +2/+4는 쌓을 수 없다. 맞은 사람이 뽑고 차례를 잃는다.
//   - 와일드 +4는 지금 색과 같은 색 카드가 손에 없을 때만 낼 수 있다. (도전 규칙은 없다)
//   - 2명일 때 리버스는 스킵처럼 동작한다.
//   - 시작 카드는 숫자 카드가 나올 때까지 다시 뽑는다.
//   - 카드가 1장 남으면 "우노!"를 외쳐야 한다. 다음 사람이 움직이기 전에 다른 사람이 고발하면 2장을 뽑는다.
//   - 먼저 손패를 비운 사람이 그 판의 승자. 승수는 방에 쌓인다.

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const HAND_SIZE = 7;
const COLORS = ['r', 'y', 'g', 'b'];
const COLOR_NAME = { r: '빨강', y: '노랑', g: '초록', b: '파랑', w: '와일드' };
const KIND_NAME = { skip: '스킵', rev: '리버스', d2: '+2', wild: '와일드', d4: '와일드 +4' };
const LOG_KEEP = 6;

function buildDeck() {
  const deck = [];
  for (const color of COLORS) {
    deck.push({ color, kind: '0' });
    for (let n = 1; n <= 9; n++) deck.push({ color, kind: String(n) }, { color, kind: String(n) });
    for (const kind of ['skip', 'rev', 'd2']) deck.push({ color, kind }, { color, kind });
  }
  for (let i = 0; i < 4; i++) deck.push({ color: 'w', kind: 'wild' }, { color: 'w', kind: 'd4' });
  return deck.map((c, id) => ({ id, ...c }));
}
const DECK = buildDeck();
const isNumber = (c) => /^\d$/.test(c.kind);

function cardLabel(c) {
  const k = KIND_NAME[c.kind] || c.kind;
  return c.color === 'w' ? k : `${COLOR_NAME[c.color]} ${k}`;
}

function createRoom(code) {
  return {
    kind: 'uno',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    draw: [],
    discard: [],
    color: null, // 지금 이어야 하는 색 (와일드를 내면 고른 색)
    dir: 1,
    turn: 0,
    drewId: null, // 이번 차례에 뽑은 카드 (이 카드만 낼 수 있다)
    unoWindow: null, // { id, called } 1장 남긴 사람과 우노 여부
    winnerId: null,
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
  const player = { id: newId(), token: newToken(), name, connected: true, hand: [], wins: 0, uno: false };
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

const top = (room) => room.discard[room.discard.length - 1];
const current = (room) => room.players[room.turn];
const step = (room, n) => (((room.turn + room.dir * n) % room.players.length) + room.players.length) % room.players.length;

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 뽑을 더미가 비면 맨 위 한 장만 남기고 버린 더미를 섞어서 다시 쓴다
function takeCards(room, player, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (room.draw.length === 0) {
      if (room.discard.length <= 1) break;
      const keep = room.discard.pop();
      room.draw = shuffle(room.discard);
      room.discard = [keep];
    }
    player.hand.push(room.draw.pop());
    got += 1;
  }
  return got;
}

function hasColor(room, hand) {
  return hand.some((c) => c.color === room.color);
}

function canPlay(room, hand, card) {
  if (room.drewId !== null && card.id !== room.drewId) return false;
  if (card.kind === 'wild') return true;
  if (card.kind === 'd4') return !hasColor(room, hand);
  const t = top(room);
  return card.color === room.color || card.kind === t.kind;
}

function checkTurn(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (current(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

// ---- 상태 전이 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  if (room.players.length < MIN_PLAYERS) return { error: `${MIN_PLAYERS}명 이상 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };

  const deck = shuffle(DECK);
  room.players.forEach((p) => {
    p.hand = deck.splice(0, HAND_SIZE);
    p.uno = false;
  });
  // 시작 카드는 숫자 카드만. 기호 카드는 더미 맨 아래로 돌려보낸다
  let first = deck.pop();
  while (!isNumber(first)) {
    deck.unshift(first);
    first = deck.pop();
  }
  room.draw = deck;
  room.discard = [first];
  room.color = first.color;
  room.dir = 1;
  room.turn = crypto.randomInt(room.players.length);
  room.drewId = null;
  room.unoWindow = null;
  room.winnerId = null;
  room.log = [];
  room.gameNo += 1;
  room.phase = 'play';
  say(room, `게임 시작! 첫 카드는 ${cardLabel(first)}. ${current(room).name}님부터 시작해요.`);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    p.hand = [];
    p.wins = 0;
    p.uno = false;
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  room.phase = 'lobby';
  room.draw = [];
  room.discard = [];
  room.drewId = null;
  room.unoWindow = null;
  room.winnerId = null;
  room.log = [];
  return {};
}

// 같은 멤버로 바로 새 판. 승수는 유지된다.
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

function play(room, id, cardId, color) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  const me = current(room);
  const card = me.hand.find((c) => c.id === cardId);
  if (!card) return { error: '그 카드는 손에 없어요.' };
  if (!canPlay(room, me.hand, card)) {
    if (room.drewId !== null && card.id !== room.drewId) return { error: '방금 뽑은 카드만 낼 수 있어요. 아니면 넘기세요.' };
    if (card.kind === 'd4') return { error: '지금 색 카드가 있으면 와일드 +4는 낼 수 없어요.' };
    return { error: '낼 수 없는 카드예요. 색이나 숫자가 같아야 해요.' };
  }
  if (card.color === 'w' && !COLORS.includes(color)) return { error: '이을 색을 고르세요.' };

  room.unoWindow = null; // 이전 사람의 우노 고발 기회는 내가 움직이면 끝난다
  me.hand = me.hand.filter((c) => c.id !== card.id);
  room.discard.push(card);
  room.color = card.color === 'w' ? color : card.color;
  room.drewId = null;
  say(room, `${me.name}님이 ${cardLabel(card)} 카드를 냈어요${card.color === 'w' ? ` (색: ${COLOR_NAME[color]})` : ''}.`);

  if (me.hand.length === 0) {
    me.wins += 1;
    room.winnerId = me.id;
    room.phase = 'over';
    say(room, `${me.name}님이 카드를 모두 내서 이겼어요!`);
    return {};
  }

  const victim = () => room.players[step(room, 1)];
  if (card.kind === 'skip') {
    say(room, `${victim().name}님은 차례를 건너뛰어요.`);
    room.turn = step(room, 2);
  } else if (card.kind === 'rev') {
    room.dir *= -1;
    if (room.players.length === 2) {
      room.turn = step(room, 2); // 2명이면 스킵처럼: 내가 다시
    } else {
      room.turn = step(room, 1);
    }
  } else if (card.kind === 'd2' || card.kind === 'd4') {
    const n = card.kind === 'd2' ? 2 : 4;
    const v = victim();
    const got = takeCards(room, v, n);
    v.uno = false;
    say(room, `${v.name}님이 ${got}장을 뽑고 차례를 건너뛰어요.`);
    room.turn = step(room, 2);
  } else {
    room.turn = step(room, 1);
  }

  if (me.hand.length === 1) {
    if (me.uno) {
      say(room, `${me.name}님: 우노!`);
      room.unoWindow = { id: me.id, called: true };
    } else {
      room.unoWindow = { id: me.id, called: false };
    }
  }
  me.uno = false;
  return {};
}

function draw(room, id) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.drewId !== null) return { error: '이미 뽑았어요. 그 카드를 내거나 넘기세요.' };
  const me = current(room);
  room.unoWindow = null;
  me.uno = false;
  const before = me.hand.length;
  takeCards(room, me, 1);
  if (me.hand.length === before) {
    say(room, '뽑을 카드가 없어서 차례를 넘겨요.');
    room.turn = step(room, 1);
    return {};
  }
  const card = me.hand[me.hand.length - 1];
  if (canPlay({ ...room, drewId: null }, me.hand, card)) {
    room.drewId = card.id; // 낼지 넘길지는 본인이 정한다
    say(room, `${me.name}님이 카드를 1장 뽑았어요.`);
  } else {
    say(room, `${me.name}님이 카드를 1장 뽑고 넘겼어요.`);
    room.turn = step(room, 1);
  }
  return {};
}

function pass(room, id) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.drewId === null) return { error: '먼저 카드를 뽑으세요.' };
  room.drewId = null;
  room.unoWindow = null;
  say(room, `${current(room).name}님이 뽑은 카드를 내지 않고 넘겼어요.`);
  room.turn = step(room, 1);
  return {};
}

// 우노 외치기. 1장이 된 직후에는 바로, 2장 남았을 때는 미리 외쳐 둘 수 있다.
function callUno(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const me = getPlayer(room, id);
  if (!me) return { error: '플레이어가 아니에요.' };
  const w = room.unoWindow;
  if (w && w.id === id && !w.called) {
    w.called = true;
    say(room, `${me.name}님: 우노!`);
    return {};
  }
  if (me.hand.length === 2) {
    me.uno = true;
    return {};
  }
  return { error: '지금은 우노를 외칠 수 없어요.' };
}

// 우노를 안 외친 사람 고발: 그 사람이 2장을 뽑는다
function catchUno(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const w = room.unoWindow;
  if (!w || w.called) return { error: '고발할 사람이 없어요.' };
  if (w.id === id) return { error: '자기 자신은 고발할 수 없어요.' };
  if (!getPlayer(room, id)) return { error: '플레이어가 아니에요.' };
  const target = getPlayer(room, w.id);
  const got = takeCards(room, target, 2);
  room.unoWindow = null;
  say(room, `${getPlayer(room, id).name}님이 ${target.name}님의 우노 안 외침을 잡았어요! ${got}장 뽑아요.`);
  return {};
}

// 자리를 비운 사람 때문에 멈췄을 때 방장이 그 차례를 넘긴다
function skipTurn(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const who = current(room);
  room.drewId = null;
  room.unoWindow = null;
  room.turn = step(room, 1);
  say(room, `방장이 ${who.name}님의 차례를 넘겼어요.`);
  return {};
}

// ---- 각자에게 보여줄 상태 (남의 손패는 장수만) ----

const COLOR_ORDER = { r: 0, y: 1, g: 2, b: 3, w: 4 };
const KIND_ORDER = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'rev', 'd2', 'wild', 'd4'];

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const playing = room.phase === 'play';
  const myTurn = playing && current(room).id === viewerId;
  const hand = me
    ? me.hand
        .slice()
        .sort((a, b) => COLOR_ORDER[a.color] - COLOR_ORDER[b.color] || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind))
        .map((c) => ({ id: c.id, color: c.color, kind: c.kind, playable: myTurn && canPlay(room, me.hand, c) }))
    : [];
  const started = room.phase !== 'lobby';
  return {
    kind: 'uno',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.connected, count: p.hand.length, wins: p.wins })),
    hand,
    top: started && room.discard.length ? { color: top(room).color, kind: top(room).kind } : null,
    color: started ? room.color : null,
    dir: room.dir,
    turnId: playing ? current(room).id : null,
    drawCount: started ? room.draw.length : 0,
    drewId: myTurn ? room.drewId : null,
    unoWindow: playing ? room.unoWindow : null,
    myUnoReady: !!(me && me.uno),
    winnerId: room.winnerId,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  play: (room, id, msg) => play(room, id, msg.card, msg.color),
  draw: (room, id) => draw(room, id),
  pass: (room, id) => pass(room, id),
  uno: (room, id) => callUno(room, id),
  catch: (room, id) => catchUno(room, id),
  force: (room, id) => skipTurn(room, id),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  DECK,
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  start,
  backToLobby,
  restart,
  play,
  draw,
  pass,
  callUno,
  catchUno,
  skipTurn,
  viewFor,
  canPlay,
};
