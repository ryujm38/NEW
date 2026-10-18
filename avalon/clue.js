'use strict';
// 클루: 원피스 한글판 규칙을 보드 없이 하는 엔진, 2~6명.
//
// 카드 21장: 인물(누가) 6 · 보물(무엇을) 6 · 섬(어디에) 9.
//   인물은 루피·조로·상디 고정 + 나미|우솝, 초파|브룩, 프랑키|로빈 중 한 명씩(대기실에서 방장이 고르거나 랜덤).
// 준비: 종류마다 1장씩 몰래 정답 봉투에 넣고, 남은 18장을 나눈다.
//   한 사람당 2명 6장 · 3명 6장 · 4명 4장 · 5명 3장 · 6명 3장.
//   남는 카드: 4명 2장 · 5명 3장은 모두에게 공개. 2명은 6장이 남는데 5장은 아무도 모르는 "소문 카드", 1장은 공개.
// 자리 순서대로 차례가 돌고, 첫 사람은 무작위.
// 내 차례(보드·주사위 없음):
//   질문: 인물+보물+섬을 하나씩 말한다. 질문한 사람 왼쪽(다음 자리)부터 시계 방향으로,
//     셋 중 하나라도 가진 첫 사람이 그중 정확히 1장을 질문자에게만 몰래 보여 주고 질문이 끝난다.
//     없는 사람은 패스. 누가 패스했고 누가 보여 줬는지는 모두가 알지만, 무슨 카드인지는 질문자(와 보여 준 사람)만 안다.
//   고발: 질문한 뒤(또는 질문 대신) 인물+보물+섬을 말하고 봉투를 확인한다.
//     맞으면 승리하고 정답이 공개된다. 틀리면 그 판에서는 더 이상 질문·고발을 못 하고 차례도 건너뛰지만,
//     질문을 받으면 카드는 계속 보여 줘야 한다. 모두 틀리면 아무도 못 이기고 정답이 공개된다.
//     (틀린 사람에게도 봉투 내용은 보여 주지 않는다. 고발한 세 장은 모두에게 공개된다.)
//   질문만 하고 고발 없이 차례를 끝낼 수 있다. 질문 없이 넘길 수도 있다.
// 원작의 장비·모험·사건 카드와 악당 카운터는 쓰지 않는다(보드가 없으므로).

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const LOG_KEEP = 30;
const HAND_SIZE = { 2: 6, 3: 6, 4: 4, 5: 3, 6: 3 };

// 카드 목록 (id, 종류, 이름, 짧은 이름, 아이콘)
const CATS = ['who', 'what', 'where'];
const CAT_NAME = { who: '인물', what: '보물', where: '섬' };
const ALL_CARDS = [
  ['luffy', 'who', '루피', '루피', '👒'],
  ['zoro', 'who', '조로', '조로', '⚔️'],
  ['sanji', 'who', '상디', '상디', '🍳'],
  ['nami', 'who', '나미', '나미', '🍊'],
  ['usopp', 'who', '우솝', '우솝', '🎯'],
  ['chopper', 'who', '초파', '초파', '🦌'],
  ['brook', 'who', '브룩', '브룩', '🎻'],
  ['franky', 'who', '프랑키', '프랑키', '🔧'],
  ['robin', 'who', '로빈', '로빈', '🌸'],
  ['chest', 'what', '보물상자', '보물상자', '💎'],
  ['scope', 'what', '쌍안경', '쌍안경', '🔭'],
  ['necklace', 'what', '목걸이', '목걸이', '📿'],
  ['coin', 'what', '해적 금화', '해적금화', '🪙'],
  ['meat', 'what', '고기', '고기', '🍖'],
  ['sword', 'what', '검', '검', '🗡️'],
  ['wano', 'where', '와노쿠니', '와노쿠니', '⛩️'],
  ['drum', 'where', '드럼성', '드럼성', '❄️'],
  ['fishman', 'where', '어인섬', '어인섬', '🐟'],
  ['wci', 'where', '홀케이크 아일랜드', '홀케이크', '🎂'],
  ['marine', 'where', '마린 포드', '마린포드', '⚓'],
  ['dressrosa', 'where', '드레스로자', '드레스로자', '🌻'],
  ['amazon', 'where', '아마존 릴리', '아마존릴리', '🐍'],
  ['water7', 'where', '워터 세븐', '워터세븐', '🚂'],
  ['punk', 'where', '펑크 하자드', '펑크하자드', '🔥'],
].map(([id, cat, name, short, icon]) => ({ id, cat, name, short, icon }));
const CARD = Object.fromEntries(ALL_CARDS.map((c) => [c.id, c]));
const FIXED_WHO = ['luffy', 'zoro', 'sanji'];
const PAIRS = { p1: ['nami', 'usopp'], p2: ['chopper', 'brook'], p3: ['franky', 'robin'] };
const TREASURES = ALL_CARDS.filter((c) => c.cat === 'what').map((c) => c.id);
const ISLANDS = ALL_CARDS.filter((c) => c.cat === 'where').map((c) => c.id);
const DEFAULT_SETTINGS = { p1: 'random', p2: 'random', p3: 'random' };

const cardName = (id) => (CARD[id] ? CARD[id].name : '?');
const pick = (arr) => arr[crypto.randomInt(arr.length)];

function createRoom(code) {
  return {
    kind: 'clue',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    settings: { ...DEFAULT_SETTINGS },
    suspects: [], // 이번 판 인물 6명
    envelope: null, // { who, what, where } — 끝날 때까지 아무에게도 보내지 않는다
    publicCards: [], // 모두에게 공개된 남는 카드
    rumor: [], // 2인: 아무도 모르는 소문 카드
    turn: 0,
    turnNo: 0,
    step: null, // ask | respond | after
    asked: false, // 이번 차례에 질문을 했는지
    question: null, // 지금 차례 질문의 seq (history 안)
    history: [], // 질문 기록 { seq, turnNo, by, who, what, where, order, passed, shower, card(비밀) }
    accusations: [], // { by, turnNo, who, what, where, ok }
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
  const player = { id: newId(), token: newToken(), name, connected: true, hand: [], out: false, shown: {}, wins: 0 };
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

function setSetting(room, byId, key, value) {
  if (byId !== room.hostId) return { error: '방장만 바꿀 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '게임 시작 전에만 바꿀 수 있어요.' };
  if (!Object.hasOwn(PAIRS, key) || !(value === 'random' || PAIRS[key].includes(value))) return { error: '알 수 없는 설정이에요.' };
  if (!room.settings) room.settings = { ...DEFAULT_SETTINGS };
  room.settings[key] = value;
  return {};
}

// ---- 도우미 ----

const cur = (room) => room.players[room.turn];
const currentQ = (room) => (room.question == null ? null : room.history.find((h) => h.seq === room.question) || null);
const inPlay = (room) => [...room.suspects, ...TREASURES, ...ISLANDS];
const triple = (o) => `${cardName(o.who)} · ${cardName(o.what)} · ${cardName(o.where)}`;

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 인물+보물+섬 세 장이 이번 판에 쓰는 올바른 카드인지
function validTriple(room, msg) {
  const o = { who: msg && msg.who, what: msg && msg.what, where: msg && msg.where };
  if (!room.suspects.includes(o.who)) return { error: '인물을 골라 주세요.' };
  if (!TREASURES.includes(o.what)) return { error: '보물을 골라 주세요.' };
  if (!ISLANDS.includes(o.where)) return { error: '섬을 골라 주세요.' };
  return o;
}

// 질문한 사람 왼쪽(다음 자리)부터 시계 방향으로 나머지 모두
function askOrder(room, askerIdx) {
  const n = room.players.length;
  return Array.from({ length: n - 1 }, (_, i) => room.players[(askerIdx + 1 + i) % n].id);
}

// 질문 세 장 중 이 사람이 가진 카드 (질문 순서: 인물 → 보물 → 섬)
const matchesOf = (p, q) => [q.who, q.what, q.where].filter((c) => p.hand.includes(c));

function finish(room, winnerId) {
  room.phase = 'over';
  room.step = null;
  room.question = null;
  room.winnerId = winnerId;
  const w = getPlayer(room, winnerId);
  if (w) w.wins = (w.wins || 0) + 1;
}

// 다음 차례: 고발에 실패한 사람은 건너뛴다. 모두 실패했으면 아무도 못 이기고 끝.
function nextTurn(room) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (room.turn + i) % n;
    if (!room.players[idx].out) {
      room.turn = idx;
      room.turnNo += 1;
      room.step = 'ask';
      room.asked = false;
      room.question = null;
      say(room, `👉 ${room.players[idx].name}님 차례예요.`);
      return;
    }
  }
  say(room, `💀 모두 고발에 실패했어요. 정답 공개: ${triple(room.envelope)}`);
  finish(room, null);
}

// ---- 행동 ----

function checkTurn(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

function ask(room, id, msg) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.step === 'respond') return { error: '카드를 보여 주길 기다리는 중이에요.' };
  if (room.step !== 'ask' || room.asked) return { error: '질문은 한 차례에 한 번만 할 수 있어요.' };
  const o = validTriple(room, msg);
  if (o.error) return o;
  const A = cur(room);
  const q = {
    seq: room.history.length + 1, turnNo: room.turnNo, by: A.id, ...o,
    order: askOrder(room, room.turn), passed: [], shower: null, card: null,
  };
  // 왼쪽부터 차례로: 하나도 없으면 패스, 처음으로 가진 사람에서 멈춘다
  for (const pid of q.order) {
    if (matchesOf(getPlayer(room, pid), q).length) {
      q.shower = pid;
      break;
    }
    q.passed.push(pid);
  }
  room.history.push(q);
  room.question = q.seq;
  room.asked = true;
  say(room, `🔍 ${A.name}님의 질문: ${triple(q)}`);
  if (q.passed.length) say(room, `🙅 ${q.passed.map((pid) => getPlayer(room, pid).name).join(', ')}님은 보여 줄 카드가 없어요.`);
  if (q.shower) {
    room.step = 'respond';
    say(room, `🤔 ${getPlayer(room, q.shower).name}님이 ${A.name}님에게 보여 줄 카드를 고르는 중…`);
  } else {
    room.step = 'after';
    say(room, '😮 아무도 카드를 보여 주지 못했어요!');
  }
  return {};
}

function show(room, id, card) {
  if (room.phase !== 'play' || room.step !== 'respond') return { error: '지금은 카드를 보여 줄 때가 아니에요.' };
  const q = currentQ(room);
  if (!q || q.shower !== id) return { error: '내가 보여 줄 차례가 아니에요.' };
  const p = getPlayer(room, id);
  if (!matchesOf(p, q).includes(card)) return { error: '질문에 나온 내 카드 중에서 골라 주세요.' };
  q.card = card;
  const list = p.shown[card] || [];
  if (!list.includes(q.by)) list.push(q.by);
  p.shown[card] = list;
  room.step = 'after';
  say(room, `🃏 ${p.name}님이 ${getPlayer(room, q.by).name}님에게 카드 1장을 몰래 보여 줬어요.`);
  return {};
}

function accuse(room, id, msg) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.step === 'respond') return { error: '카드를 다 본 뒤에 고발할 수 있어요.' };
  const o = validTriple(room, msg);
  if (o.error) return o;
  const A = cur(room);
  const E = room.envelope;
  const ok = o.who === E.who && o.what === E.what && o.where === E.where;
  room.accusations.push({ by: A.id, turnNo: room.turnNo, ...o, ok });
  if (ok) {
    say(room, `🏆 ${A.name}님의 고발: ${triple(o)} → 정답! ${A.name}님이 사건을 해결했어요!`);
    finish(room, A.id);
    return {};
  }
  A.out = true;
  say(room, `❌ ${A.name}님의 고발: ${triple(o)} → 틀렸어요! 이제 차례는 건너뛰지만, 질문을 받으면 카드는 계속 보여 줘요.`);
  nextTurn(room);
  return {};
}

function endTurn(room, id) {
  const bad = checkTurn(room, id);
  if (bad) return bad;
  if (room.step === 'respond') return { error: '카드를 보여 주길 기다리는 중이에요.' };
  if (!room.asked) say(room, `💤 ${cur(room).name}님은 질문 없이 차례를 넘겼어요.`);
  nextTurn(room);
  return {};
}

// 방장: 자리를 비운 사람 대신 진행. 질문자면 차례를 끝내고, 보여 줄 사람이면 첫 번째로 맞는 카드를 보여 준다.
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 넘길 게 없어요.' };
  if (room.step === 'respond') {
    const q = currentQ(room);
    const p = getPlayer(room, q.shower);
    say(room, `⏩ 방장이 ${p.name}님 대신 카드를 골랐어요.`);
    return show(room, p.id, matchesOf(p, q)[0]);
  }
  say(room, `⏩ 방장이 ${cur(room).name}님 차례를 넘겼어요.`);
  nextTurn(room);
  return {};
}

// ---- 시작 / 초기화 ----

function deal(room) {
  const n = room.players.length;
  room.suspects = [...FIXED_WHO, ...Object.keys(PAIRS).map((k) => (room.settings[k] === 'random' ? pick(PAIRS[k]) : room.settings[k]))];
  room.envelope = { who: pick(room.suspects), what: pick(TREASURES), where: pick(ISLANDS) };
  const env = Object.values(room.envelope);
  const rest = shuffle(inPlay(room).filter((c) => !env.includes(c)));
  const size = HAND_SIZE[n];
  room.players.forEach((p, i) => {
    p.hand = rest.slice(i * size, (i + 1) * size);
    p.out = false;
    p.shown = {};
  });
  const left = rest.slice(n * size);
  if (n === 2) {
    room.rumor = left.slice(0, 5);
    room.publicCards = left.slice(5);
  } else {
    room.rumor = [];
    room.publicCards = left;
  }
}

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  if (!room.settings) room.settings = { ...DEFAULT_SETTINGS };
  Object.assign(room, { history: [], accusations: [], winnerId: null, log: [], gameNo: room.gameNo + 1, question: null, asked: false, turnNo: 1 });
  deal(room);
  room.phase = 'play';
  room.step = 'ask';
  room.turn = crypto.randomInt(n);
  say(room, '🔎 사건 발생! 누가 · 무엇을 · 어디에? 정답 봉투에 카드 3장이 들어갔어요.');
  if (room.publicCards.length) say(room, `📢 남는 카드 공개: ${room.publicCards.map(cardName).join(', ')}`);
  if (room.rumor.length) say(room, `💬 소문 카드 ${room.rumor.length}장은 아무도 모르게 뒤집어 뒀어요.`);
  say(room, `👉 ${cur(room).name}님부터 시작해요.`);
  return {};
}

function resetGame(room) {
  room.players.forEach((p) => { p.hand = []; p.out = false; p.shown = {}; });
  Object.assign(room, {
    phase: 'lobby', step: null, suspects: [], envelope: null, publicCards: [], rumor: [], turn: 0, turnNo: 0,
    asked: false, question: null, history: [], accusations: [], winnerId: null, log: [],
  });
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  resetGame(room);
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
// 비밀: 남의 손패, 질문에서 보여 준 카드(질문자·보여 준 사람만), 봉투·소문 카드(끝난 뒤에만), 남의 "보여 준 기록".
// 게임이 끝나면 복기할 수 있게 모두의 손패와 보여 준 카드까지 공개한다.

function viewFor(room, viewerId) {
  const started = room.phase !== 'lobby';
  const playing = room.phase === 'play';
  const over = room.phase === 'over';
  const meP = getPlayer(room, viewerId);
  const q = playing ? currentQ(room) : null;
  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (over) mode = 'over';
  else if (room.step === 'respond') mode = q && q.shower === viewerId ? 'respond' : 'wait';
  else if (cur(room).id === viewerId) mode = room.step; // ask | after

  const qView = (h) => ({
    seq: h.seq, turnNo: h.turnNo, by: h.by, who: h.who, what: h.what, where: h.where,
    order: h.order, passed: h.passed, shower: h.shower,
    card: over || viewerId === h.by || viewerId === h.shower ? h.card : null,
  });
  const cards = (started ? inPlay(room) : ALL_CARDS.map((c) => c.id)).map((id) => CARD[id]);

  return {
    kind: 'clue',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    settings: room.settings,
    pairs: PAIRS,
    cards,
    turnId: playing ? cur(room).id : null,
    turnNo: room.turnNo,
    step: playing ? room.step : null,
    asked: playing ? room.asked : false,
    handSize: HAND_SIZE[room.players.length] || 0,
    players: room.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, count: p.hand.length, out: p.out, wins: p.wins || 0,
      hand: over ? p.hand : null,
    })),
    hand: meP ? meP.hand : [],
    myShown: meP ? meP.shown : {},
    publicCards: room.publicCards,
    rumorCount: room.rumor.length,
    rumor: over ? room.rumor : null,
    question: q ? qView(q) : null,
    history: room.history.map(qView),
    accusations: room.accusations,
    envelope: over ? room.envelope : null,
    winnerId: room.winnerId,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  setting: (room, id, msg) => setSetting(room, id, msg.key, msg.value),
  ask: (room, id, msg) => ask(room, id, msg),
  show: (room, id, msg) => show(room, id, msg.card),
  accuse: (room, id, msg) => accuse(room, id, msg),
  endTurn: (room, id) => endTurn(room, id),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  MIN_PLAYERS,
  MAX_PLAYERS,
  HAND_SIZE,
  ALL_CARDS,
  CARD,
  CATS,
  CAT_NAME,
  PAIRS,
  FIXED_WHO,
  TREASURES,
  ISLANDS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  setSetting,
  start,
  backToLobby,
  restart,
  ask,
  show,
  accuse,
  endTurn,
  force,
  viewFor,
  askOrder,
};
