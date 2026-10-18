'use strict';
// 다빈치 코드 규칙 엔진, 2~4명.
//
// 타일: 검은색 0~11, 흰색 0~11 (24개) + 조커 2개(검은 "−", 흰 "−") = 26개. 방장이 대기실에서 조커를 뺄 수 있다.
// 준비: 모두 뒤집어 섞고, 2~3명은 4개씩, 4명은 3개씩 가져간다. 줄은 왼쪽부터 작은 숫자 순서이고,
//   숫자가 같으면 검은색이 왼쪽. 조커는 주인이 원하는 자리에 둔다(처음에도, 나중에 뽑았을 때도).
// 색깔과 자리는 모두에게 보이고, 숫자는 공개되기 전까지 주인만 안다.
// 내 차례:
//   1) 가운데에서 타일 1개를 뽑는다(나만 봄. 가운데가 비었으면 안 뽑음).
//   2) 상대의 숨은 타일 하나를 골라 숫자(0~11 또는 조커)를 말한다.
//      맞으면 그 타일이 공개되고(자리는 그대로), 한 번 더 맞히거나 멈춘다. 멈추면 뽑은 타일을 숨긴 채로 내 줄에 넣는다.
//      틀리면 뽑은 타일을 공개한 채로 내 줄에 넣고 차례가 끝난다.
//      뽑은 타일이 없는데 틀리면 내 숨은 타일 하나를 골라 공개한다.
//   한 차례에 적어도 한 번은 맞혀 봐야 한다.
// 타일이 모두 공개된 사람은 탈락. 숨은 타일이 남은 마지막 한 사람이 승리.
//
// 판단한 부분:
//   - 뽑은 타일을 줄에 넣을 때는 늘 주인이 "놓기"를 한 번 누른다. 숫자 타일은 들어갈 자리가 정해져 있고
//     (조커 옆이라 자리가 여러 곳일 때만 그중에서 고름), 조커는 아무 데나. 조커일 때만 한 단계가 더 있으면 들키므로 늘 똑같이 둔다.
//   - 처음 나눠 받은 뒤 모두 "준비 완료"를 누른다(조커를 받은 사람만 기다리면 조커가 있다는 게 들키니까). 조커를 빼면 이 단계는 없다.
//     조커를 받은 사람은 같은 "준비 완료" 버튼으로 조커 자리까지 정한다(ready에 pos). 따로 누르는 단계가 없어서 화면·횟수가 같다.
//   - 가운데 남은 타일은 개수만 알려 준다(색별 개수를 알려 주면 방금 뽑은 타일의 색을 알 수 있어서).
//   - 틀린 추측("이 타일은 5가 아니다")은 모두가 들은 정보라 타일마다 기록해서 보여 준다.
//   - 뽑지 못한 채로 틀렸는데 내 숨은 타일이 하나뿐이면 고를 것 없이 바로 그 타일을 공개한다(그리고 탈락).

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 4;
const MAX_N = 11;
const JOKER = -1;
const LOG_KEEP = 16;
const COLOR_ICON = { b: '⚫', w: '⚪' };

const handSize = (n) => (n >= 4 ? 3 : 4);
const isJoker = (t) => t.n === JOKER;
const sortKey = (t) => t.n * 2 + (t.c === 'w' ? 1 : 0); // 같은 숫자면 검은색이 왼쪽
const numText = (n) => (n === JOKER ? '조커' : String(n));
const tileText = (t) => `${COLOR_ICON[t.c]}${numText(t.n)}`;

function createRoom(code) {
  return {
    kind: 'davinci',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | setup | play | over
    gameNo: 0,
    settings: { jokers: true },
    gameJokers: true, // 이번 판에 조커가 들어갔는지 (시작할 때 settings에서 복사)
    pool: [], // 가운데 엎어 둔 타일
    turn: 0,
    step: null, // guess | place | reveal
    drawn: null, // 이번 차례에 뽑은 타일 (뽑은 사람만 봄)
    guesses: 0, // 이번 차례에 맞힌 횟수
    placeOpen: false, // place 단계: 공개한 채로 놓는지
    seq: 0,
    ev: null, // 마지막 사건 (화면 애니메이션·효과음용): { seq, t, by, target, tile, value, ok }
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
  const player = { id: newId(), token: newToken(), name, connected: true, row: [], pendingJokers: [], ready: false, out: false };
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
  if (key !== 'jokers' || typeof value !== 'boolean') return { error: '알 수 없는 설정이에요.' };
  room.settings.jokers = value;
  return {};
}

// ---- 도우미 ----

const cur = (room) => room.players[room.turn];
const alive = (room) => room.players.filter((p) => !p.out);
const hiddenOf = (p) => p.row.filter((t) => !t.open);

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 타일 26개(조커 없으면 24개). 아이디는 숫자와 상관없는 임의 값이라 남에게 보내도 정체를 알 수 없다.
function buildTiles(jokers) {
  const base = [];
  for (const c of ['b', 'w']) for (let n = 0; n <= MAX_N; n++) base.push({ c, n });
  if (jokers) base.push({ c: 'b', n: JOKER }, { c: 'w', n: JOKER });
  const used = new Set();
  return shuffle(base).map((t) => {
    let id;
    do id = crypto.randomBytes(4).toString('hex'); while (used.has(id));
    used.add(id);
    return { id, c: t.c, n: t.n, open: false, miss: [] };
  });
}

// 타일을 줄에 넣을 수 있는 자리 [가장 왼쪽, 가장 오른쪽] (자리 번호 = 그 앞에 끼워 넣는 위치).
// 조커는 어디든. 숫자 타일은 작은 숫자 타일보다 오른쪽, 큰 숫자 타일보다 왼쪽이고, 그 사이에 조커만 있으면 그중 아무 데나.
function slotRange(row, tile) {
  if (isJoker(tile)) return [0, row.length];
  const k = sortKey(tile);
  let lo = 0;
  let hi = row.length;
  row.forEach((t, i) => { if (!isJoker(t) && sortKey(t) < k) lo = i + 1; });
  for (let i = 0; i < row.length; i++) {
    if (!isJoker(row[i]) && sortKey(row[i]) > k) { hi = i; break; }
  }
  return [lo, Math.max(lo, hi)];
}
// 정해 주지 않았을 때의 자리: 숫자 타일은 순서대로 들어갈 첫 자리, 조커는 맨 끝
const defaultSlot = (row, tile) => (isJoker(tile) ? row.length : slotRange(row, tile)[0]);

function insertTile(row, tile, pos) {
  const [lo, hi] = slotRange(row, tile);
  const at = Number.isInteger(pos) ? pos : defaultSlot(row, tile);
  if (at < lo || at > hi) return false;
  row.splice(at, 0, tile);
  return true;
}

const ordinal = (p, tile) => p.row.findIndex((t) => t.id === tile.id) + 1;
const where = (p, tile) => `${p.name}님의 ${COLOR_ICON[tile.c]}타일(왼쪽 ${ordinal(p, tile)}번째)`;

// ---- 진행 ----

function beginPlay(room) {
  room.phase = 'play';
  room.turn = 0;
  beginTurn(room);
}

function beginTurn(room) {
  const p = cur(room);
  room.guesses = 0;
  room.placeOpen = false;
  room.step = 'guess';
  room.drawn = room.pool.length ? room.pool.pop() : null;
  say(room, room.drawn
    ? `▶ ${p.name}님 차례 · 타일을 1개 뽑았어요. (가운데 ${room.pool.length}개 남음)`
    : `▶ ${p.name}님 차례 · 가운데 타일이 다 떨어져서 뽑지 않아요.`);
}

function nextTurn(room) {
  const n = room.players.length;
  for (let i = 1; i <= n; i++) {
    const idx = (room.turn + i) % n;
    if (!room.players[idx].out) {
      room.turn = idx;
      beginTurn(room);
      return;
    }
  }
}

function finish(room, winner) {
  // 게임이 끝나는 순간 뽑아 둔 타일이 있으면 숨긴 채로 내 줄에 넣어 둔다 (끝나면 모두 공개)
  if (room.drawn) {
    const p = cur(room);
    insertTile(p.row, room.drawn, defaultSlot(p.row, room.drawn));
    room.drawn = null;
  }
  room.phase = 'over';
  room.step = null;
  room.winnerIds = winner ? [winner.id] : [];
  say(room, `🏆 게임 끝! ${winner ? `${winner.name}님 승리!` : ''}`);
}

// 누군가의 타일이 모두 공개됐는지 보고, 한 명만 남으면 끝낸다. 끝났으면 true
function checkOut(room, p) {
  if (p.out || hiddenOf(p).length) return false;
  p.out = true;
  say(room, `💀 ${p.name}님의 타일이 모두 공개됐어요. 탈락!`);
  const left = alive(room);
  if (left.length <= 1) {
    finish(room, left[0] || null);
    return true;
  }
  return false;
}

function event(room, ev) {
  room.seq += 1;
  room.ev = { seq: room.seq, ...ev };
}

// ---- 행동 ----

function checkTurn(room, id, step) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  if (step && room.step !== step) {
    return { error: { guess: '지금은 숫자를 맞힐 때가 아니에요.', place: '지금은 타일을 놓을 때가 아니에요.', reveal: '지금은 내 타일을 공개할 때가 아니에요.' }[step] };
  }
  return null;
}

function parseValue(v) {
  if (v === 'J' || v === 'j' || v === JOKER) return JOKER;
  if (typeof v !== 'number' && typeof v !== 'string') return null;
  if (v === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= MAX_N ? n : null;
}

function guess(room, id, targetId, tileId, rawValue) {
  const bad = checkTurn(room, id, 'guess');
  if (bad) return bad;
  const me = cur(room);
  const value = parseValue(rawValue);
  if (value === null) return { error: '0~11 중 숫자나 조커를 고르세요.' };
  if (value === JOKER && !room.gameJokers) return { error: '이번 판에는 조커가 없어요.' };
  const tp = getPlayer(room, targetId);
  if (!tp || tp.id === id) return { error: '다른 사람의 타일을 고르세요.' };
  if (tp.out) return { error: '이미 탈락한 사람이에요.' };
  const tile = tp.row.find((t) => t.id === tileId);
  if (!tile) return { error: '그 타일이 없어요.' };
  if (tile.open) return { error: '이미 공개된 타일이에요. 숨은 타일을 고르세요.' };
  const ok = tile.n === value;
  event(room, { t: 'guess', by: id, target: tp.id, tile: tile.id, value, ok });
  if (ok) {
    tile.open = true;
    room.guesses += 1;
    say(room, `🎯 ${me.name}님 → ${where(tp, tile)}에 "${numText(value)}" — 맞았어요!`);
    checkOut(room, tp);
    return {};
  }
  if (!tile.miss.includes(value)) tile.miss.push(value);
  say(room, `❌ ${me.name}님 → ${where(tp, tile)}에 "${numText(value)}" — 틀렸어요.`);
  if (room.drawn) {
    room.step = 'place';
    room.placeOpen = true;
  } else {
    const mine = hiddenOf(me);
    if (mine.length === 1) revealOwn(room, me, mine[0]);
    else room.step = 'reveal';
  }
  return {};
}

function stop(room, id) {
  const bad = checkTurn(room, id, 'guess');
  if (bad) return bad;
  if (room.guesses < 1) return { error: '한 번은 꼭 맞혀 봐야 해요.' };
  const me = cur(room);
  if (room.drawn) {
    room.step = 'place';
    room.placeOpen = false;
    say(room, `✋ ${me.name}님이 그만 맞히기로 했어요. 뽑은 타일은 숨겨서 놓아요.`);
  } else {
    say(room, `✋ ${me.name}님이 그만 맞히기로 했어요.`);
    nextTurn(room);
  }
  return {};
}

function place(room, id, pos) {
  const bad = checkTurn(room, id, 'place');
  if (bad) return bad;
  const me = cur(room);
  const tile = room.drawn;
  const at = pos === undefined || pos === null ? defaultSlot(me.row, tile) : Number(pos);
  if (!Number.isInteger(at) || !insertTile(me.row, tile, at)) return { error: '그 자리에는 놓을 수 없어요. 숫자 순서에 맞는 자리를 고르세요.' };
  tile.open = room.placeOpen;
  room.drawn = null;
  event(room, { t: 'place', by: id, tile: tile.id, open: tile.open });
  say(room, tile.open
    ? `📢 ${me.name}님이 뽑은 타일을 공개해서 놓았어요: ${tileText(tile)} (왼쪽 ${ordinal(me, tile)}번째)`
    : `🤫 ${me.name}님이 뽑은 ${COLOR_ICON[tile.c]}타일을 숨겨서 놓았어요. (왼쪽 ${ordinal(me, tile)}번째)`);
  nextTurn(room);
  return {};
}

function revealOwn(room, me, tile) {
  tile.open = true;
  event(room, { t: 'reveal', by: me.id, tile: tile.id });
  say(room, `📢 ${me.name}님이 자기 타일 하나를 공개했어요: ${tileText(tile)} (왼쪽 ${ordinal(me, tile)}번째)`);
  if (!checkOut(room, me)) nextTurn(room);
}

function reveal(room, id, tileId) {
  const bad = checkTurn(room, id, 'reveal');
  if (bad) return bad;
  const me = cur(room);
  const tile = me.row.find((t) => t.id === tileId);
  if (!tile || tile.open) return { error: '내 숨은 타일 중에서 고르세요.' };
  revealOwn(room, me, tile);
  return {};
}

// 준비 단계: 처음 받은 조커를 놓을 자리
function setupJoker(room, id, pos) {
  if (room.phase !== 'setup') return { error: '지금은 준비 단계가 아니에요.' };
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  if (!p.pendingJokers.length) return { error: '놓을 조커가 없어요.' };
  const at = pos === undefined || pos === null ? p.row.length : Number(pos);
  if (!Number.isInteger(at) || at < 0 || at > p.row.length) return { error: '그 자리에는 놓을 수 없어요.' };
  p.row.splice(at, 0, p.pendingJokers.shift());
  return {};
}

// 준비 완료. 조커가 남아 있으면 pos 자리에 조커 하나를 놓고, 남은 조커가 없을 때만 준비 완료가 된다.
// (조커를 받은 사람도 똑같이 "준비 완료" 한 번이면 되게 해서, 누르는 횟수·화면으로 조커가 들키지 않게 한다)
function ready(room, id, pos) {
  if (room.phase !== 'setup') return { error: '지금은 준비 단계가 아니에요.' };
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  if (p.pendingJokers.length) {
    if (pos === undefined || pos === null) return { error: '먼저 조커를 놓을 자리를 고르세요.' };
    const r = setupJoker(room, id, pos);
    if (r.error) return r;
    if (p.pendingJokers.length) return {};
  }
  if (p.ready) return {};
  p.ready = true;
  maybeBegin(room);
  return {};
}

function maybeBegin(room) {
  if (room.phase !== 'setup') return;
  if (room.players.every((p) => p.ready)) {
    say(room, '모두 준비됐어요. 시작해요!');
    beginPlay(room);
  }
}

// 방장: 멈춘 사람 대신 진행
//   준비: 조커는 맨 끝에 놓고 준비 완료 / 맞히기: 한 번 이상 맞혔으면 멈추고, 아니면 아무 숨은 타일에 아무 숫자
//   놓기: 순서대로 들어갈 자리(조커는 맨 끝) / 공개: 가장 왼쪽 숨은 타일
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'setup') {
    room.players.forEach((p) => {
      while (p.pendingJokers.length) p.row.push(p.pendingJokers.shift());
      p.ready = true;
    });
    say(room, '⚙ 방장이 준비를 마무리했어요.');
    maybeBegin(room);
    return {};
  }
  if (room.phase !== 'play') return { error: '지금은 넘길 게 없어요.' };
  const me = cur(room);
  say(room, `⚙ 방장이 ${me.name}님 대신 진행했어요.`);
  if (room.step === 'guess') {
    if (room.guesses >= 1) stop(room, me.id);
    else {
      const targets = room.players.filter((p) => p.id !== me.id && !p.out).flatMap((p) => hiddenOf(p).map((t) => [p, t]));
      const [tp, tile] = targets[crypto.randomInt(targets.length)];
      const values = Array.from({ length: MAX_N + 1 }, (_, i) => i);
      if (room.gameJokers) values.push(JOKER);
      guess(room, me.id, tp.id, tile.id, values[crypto.randomInt(values.length)]);
      if (room.phase === 'play' && cur(room) === me && room.step === 'guess') stop(room, me.id);
    }
  }
  if (room.phase === 'play' && cur(room) === me && room.step === 'place') place(room, me.id, null);
  if (room.phase === 'play' && cur(room) === me && room.step === 'reveal') reveal(room, me.id, hiddenOf(me)[0].id);
  return {};
}

// ---- 시작 / 초기화 ----

function resetPlayers(room) {
  room.players.forEach((p) => Object.assign(p, { row: [], pendingJokers: [], ready: false, out: false }));
}

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  resetPlayers(room);
  const jokers = !!room.settings.jokers;
  Object.assign(room, {
    gameJokers: jokers, pool: buildTiles(jokers), turn: 0, step: null, drawn: null, guesses: 0, placeOpen: false,
    ev: null, winnerIds: [], log: [], gameNo: room.gameNo + 1,
  });
  const k = handSize(n);
  room.players.forEach((p) => {
    for (let i = 0; i < k; i++) {
      const t = room.pool.pop();
      if (isJoker(t)) p.pendingJokers.push(t);
      else p.row.push(t);
    }
    p.row.sort((a, b) => sortKey(a) - sortKey(b));
  });
  say(room, `🔢 타일을 ${k}개씩 나눠 가졌어요. (가운데 ${room.pool.length}개)`);
  if (jokers) {
    room.phase = 'setup';
    say(room, '내 타일을 확인하고 "준비 완료"를 눌러요.');
  } else {
    beginPlay(room);
  }
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  resetPlayers(room);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', pool: [], turn: 0, step: null, drawn: null, guesses: 0, placeOpen: false, ev: null, winnerIds: [], log: [] });
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
// 숨은 타일의 숫자는 주인에게만, 뽑은 타일은 뽑은 사람에게만 보낸다. 게임이 끝나면 모두 공개.

function viewFor(room, viewerId) {
  const started = room.phase !== 'lobby';
  const over = room.phase === 'over';
  const playing = room.phase === 'play';
  const turnP = playing ? cur(room) : null;
  const myTurn = !!turnP && turnP.id === viewerId;
  const meP = getPlayer(room, viewerId);

  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (over) mode = 'over';
  else if (room.phase === 'setup') mode = meP && !meP.ready ? 'setup' : 'wait';
  else if (myTurn) mode = room.step;
  else if (meP && meP.out) mode = 'out';

  const tileView = (owner, t) => ({ id: t.id, c: t.c, open: t.open, n: t.open || over || owner === viewerId ? t.n : null, miss: t.miss.slice() });

  let drawn = null;
  if (myTurn && room.drawn) drawn = { id: room.drawn.id, c: room.drawn.c, n: room.drawn.n };
  let slots = null;
  let slot0 = null;
  if (myTurn && room.step === 'place' && room.drawn) {
    slots = slotRange(meP.row, room.drawn);
    slot0 = defaultSlot(meP.row, room.drawn);
  } else if (mode === 'setup' && meP.pendingJokers.length) {
    slots = [0, meP.row.length];
    slot0 = meP.row.length;
  }

  return {
    kind: 'davinci',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: room.settings,
    jokers: started ? room.gameJokers : room.settings.jokers,
    mode,
    turnId: turnP ? turnP.id : null,
    step: playing ? room.step : null,
    guesses: playing ? room.guesses : 0,
    placeOpen: playing && room.step === 'place' ? room.placeOpen : false,
    hasDrawn: playing && !!room.drawn,
    drawn,
    slots,
    defaultSlot: slot0,
    pool: room.pool.length,
    handSize: handSize(room.players.length),
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      out: p.out,
      ready: room.phase === 'setup' ? p.ready : null,
      // 준비 단계에는 남의 줄을 보내지 않는다 (조커를 아직 안 놓은 사람은 줄이 짧아서 조커가 있는 게 들키니까)
      row: started && (room.phase !== 'setup' || p.id === viewerId) ? p.row.map((t) => tileView(p.id, t)) : [],
      pending: p.id === viewerId ? p.pendingJokers.map((t) => ({ id: t.id, c: t.c, n: t.n })) : [],
    })),
    ev: room.ev,
    winnerIds: room.winnerIds,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  setting: (room, id, msg) => setSetting(room, id, msg.key, msg.value),
  setupJoker: (room, id, msg) => setupJoker(room, id, msg.pos),
  ready: (room, id, msg) => ready(room, id, msg.pos),
  guess: (room, id, msg) => guess(room, id, msg.target, msg.tile, msg.value),
  stop: (room, id) => stop(room, id),
  place: (room, id, msg) => place(room, id, msg.pos),
  reveal: (room, id, msg) => reveal(room, id, msg.tile),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  MIN_PLAYERS,
  MAX_PLAYERS,
  MAX_N,
  JOKER,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  setSetting,
  start,
  backToLobby,
  restart,
  setupJoker,
  ready,
  guess,
  stop,
  place,
  reveal,
  force,
  viewFor,
  slotRange,
  defaultSlot,
  insertTile,
  sortKey,
  buildTiles,
  handSize,
};
