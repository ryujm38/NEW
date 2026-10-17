'use strict';
// 6인용 아발론 규칙 엔진. 네트워크와 무관한 순수 로직이라 테스트하기 쉽다.
//
// 6인 구성: 선 4(멀린, 퍼시벌, 충성스러운 신하 2) / 악 2(모르가나, 암살자)
// 원정 인원: 2, 3, 4, 3, 4 · 6인은 모든 원정이 실패 카드 1장이면 실패
// 3번 성공하면 암살자가 멀린을 맞힐 기회를 얻고, 3번 실패하거나 원정대가 5번 연속 부결되면 악의 승리

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const PLAYER_COUNT = 6;
const TEAM_SIZES = [2, 3, 4, 3, 4];
const MAX_REJECTS = 5;
const WINS_NEEDED = 3;

const ROLES = {
  merlin: {
    team: 'good',
    name: '멀린',
    desc: '악의 세력이 누구인지 알고 있습니다. 들키지 않게 선을 이끄세요. 선이 이겨도 암살자에게 정체를 들키면 패배합니다.',
  },
  percival: {
    team: 'good',
    name: '퍼시벌',
    desc: '멀린 후보 두 명을 알고 있습니다. 한 명은 진짜 멀린, 한 명은 모르가나입니다. 누가 진짜인지 가려내 멀린을 지키세요.',
  },
  servant: {
    team: 'good',
    name: '충성스러운 신하',
    desc: '아무 정보도 없습니다. 투표와 토론으로 악을 가려내 원정을 성공시키세요.',
  },
  morgana: {
    team: 'evil',
    name: '모르가나',
    desc: '퍼시벌에게 멀린처럼 보입니다. 퍼시벌을 속이세요. 동료 악을 알고 있습니다.',
  },
  assassin: {
    team: 'evil',
    name: '암살자',
    desc: '선이 3번 성공해도 멀린을 맞히면 역전승합니다. 토론 내내 누가 멀린인지 관찰하세요. 동료 악을 알고 있습니다.',
  },
};
const ROLE_POOL = ['merlin', 'percival', 'servant', 'servant', 'morgana', 'assassin'];

const ACK_PHASES = new Set(['roles', 'voteResult', 'questResult']);

function createRoom(code) {
  return {
    kind: 'avalon',
    code,
    hostId: null,
    players: [], // 좌석 순서 = 배열 순서
    phase: 'lobby',
    gameNo: 0, // 시작할 때마다 +1
    round: 0,
    leader: 0,
    rejects: 0,
    draft: [],
    team: [],
    votes: {},
    cards: {},
    acks: new Set(),
    results: [], // { ok, fails } 라운드별
    history: [],
    current: null, // 진행 중인 history 항목
    winner: null,
    reason: null,
    assassinTarget: null,
    lastActive: Date.now(),
  };
}

function addPlayer(room, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: '이름을 입력하세요.' };
  if (room.phase !== 'lobby') return { error: '이미 게임이 시작됐어요.' };
  if (room.players.length >= PLAYER_COUNT) return { error: '방이 가득 찼어요. (6명)' };
  if (room.players.some((p) => p.name === name)) return { error: '같은 이름이 이미 있어요. 다른 이름을 쓰세요.' };
  const player = { id: newId(), token: newToken(), name, connected: true, role: null };
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

function connectedIds(room) {
  return room.players.filter((p) => p.connected).map((p) => p.id);
}

function teamSize(room) {
  return TEAM_SIZES[room.round];
}

function roleOf(room, id) {
  const p = getPlayer(room, id);
  return p && p.role;
}

function teamOf(room, id) {
  const r = roleOf(room, id);
  return r ? ROLES[r].team : null;
}

// ---- 상태 전이 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  if (room.players.length !== PLAYER_COUNT) return { error: `정확히 ${PLAYER_COUNT}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };

  room.gameNo += 1;
  room.players = shuffle(room.players); // 좌석(리더 순서)을 섞는다
  const roles = shuffle(ROLE_POOL);
  room.players.forEach((p, i) => {
    p.role = roles[i];
  });
  room.round = 0;
  room.leader = crypto.randomInt(PLAYER_COUNT);
  room.rejects = 0;
  room.draft = [];
  room.team = [];
  room.votes = {};
  room.cards = {};
  room.results = [];
  room.history = [];
  room.current = null;
  room.winner = null;
  room.reason = null;
  room.assassinTarget = null;
  room.phase = 'roles';
  room.acks = new Set();
  return {};
}

// 방장이 게임을 초기화하고 대기실로 돌려보낸다. 게임 도중에도 할 수 있다.
// 게임이 끝난 뒤에는 나간 사람을 정리하지만, 도중에는 잠깐 끊긴 사람일 수 있어서 자리를 유지한다.
function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    p.role = null;
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  room.phase = 'lobby';
  room.round = 0;
  room.rejects = 0;
  room.draft = [];
  room.team = [];
  room.votes = {};
  room.cards = {};
  room.results = [];
  room.history = [];
  room.current = null;
  room.winner = null;
  room.reason = null;
  room.assassinTarget = null;
  room.acks = new Set();
  return {};
}

// 같은 멤버로 역할을 새로 섞어 바로 처음부터 다시 시작한다.
function restart(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '대기실에서는 "게임 시작"을 누르세요.' };
  if (room.players.length !== PLAYER_COUNT || room.players.some((p) => !p.connected)) {
    return { error: '접속이 끊긴 사람이 있어요. 대기실로 돌아가서 정리하세요.' };
  }
  const prev = room.phase;
  room.phase = 'lobby'; // start()가 대기실 상태를 요구한다. 실패하면 되돌린다.
  const r = start(room, byId);
  if (r.error) room.phase = prev;
  return r;
}

function kick(room, byId, targetId) {
  if (byId !== room.hostId) return { error: '방장만 내보낼 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '게임 시작 전에만 할 수 있어요.' };
  if (targetId === byId) return { error: '자기 자신은 내보낼 수 없어요.' };
  if (!getPlayer(room, targetId)) return { error: '없는 사람이에요.' };
  removePlayer(room, targetId);
  return { kicked: targetId };
}

function ack(room, id) {
  if (!ACK_PHASES.has(room.phase)) return { error: '지금은 확인할 게 없어요.' };
  if (!getPlayer(room, id)) return { error: '플레이어가 아니에요.' };
  room.acks.add(id);
  maybeAdvance(room);
  return {};
}

// 방장이 아직 확인 안 한 사람을 기다리지 않고 넘긴다 (자리를 비운 사람이 있을 때)
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (!ACK_PHASES.has(room.phase)) return { error: '지금은 넘길 게 없어요.' };
  advance(room);
  return {};
}

// 접속이 끊겨 확인을 못 하는 사람 때문에 멈추지 않도록, 접속 중인 사람이 모두 확인하면 넘어간다.
function maybeAdvance(room) {
  if (!ACK_PHASES.has(room.phase)) return;
  const ids = connectedIds(room);
  if (ids.length > 0 && ids.every((id) => room.acks.has(id))) advance(room);
}

function nextLeader(room) {
  room.leader = (room.leader + 1) % PLAYER_COUNT;
  room.draft = [];
  room.team = [];
  room.votes = {};
  room.cards = {};
  room.current = null;
  room.phase = 'propose';
}

function endGame(room, winner, reason) {
  room.phase = 'over';
  room.winner = winner;
  room.reason = reason;
  room.acks = new Set();
}

function advance(room) {
  const phase = room.phase;
  room.acks = new Set();
  if (phase === 'roles') {
    room.phase = 'propose';
  } else if (phase === 'voteResult') {
    if (room.current.approved) {
      room.cards = {};
      room.phase = 'quest';
    } else if (room.rejects >= MAX_REJECTS) {
      endGame(room, 'evil', 'rejects');
    } else {
      nextLeader(room);
    }
  } else if (phase === 'questResult') {
    const good = room.results.filter((r) => r.ok).length;
    const evil = room.results.length - good;
    if (evil >= WINS_NEEDED) {
      endGame(room, 'evil', 'quests');
    } else if (good >= WINS_NEEDED) {
      room.phase = 'assassin';
    } else {
      room.round += 1;
      room.rejects = 0;
      nextLeader(room);
    }
  }
}

function leaderId(room) {
  return room.players[room.leader].id;
}

function validTeam(room, team) {
  if (!Array.isArray(team)) return false;
  const set = new Set(team);
  return set.size === team.length && team.every((id) => getPlayer(room, id));
}

// 리더가 고르는 중인 팀을 모두에게 실시간으로 보여준다
function setDraft(room, id, team) {
  if (room.phase !== 'propose') return { error: '지금은 원정대를 고를 때가 아니에요.' };
  if (id !== leaderId(room)) return { error: '리더만 고를 수 있어요.' };
  if (!validTeam(room, team) || team.length > teamSize(room)) return { error: '잘못된 선택이에요.' };
  room.draft = team.slice();
  return {};
}

function propose(room, id, team) {
  if (room.phase !== 'propose') return { error: '지금은 원정대를 정할 때가 아니에요.' };
  if (id !== leaderId(room)) return { error: '리더만 정할 수 있어요.' };
  if (!validTeam(room, team) || team.length !== teamSize(room)) {
    return { error: `원정대는 정확히 ${teamSize(room)}명이어야 해요.` };
  }
  room.team = team.slice();
  room.draft = team.slice();
  room.votes = {};
  room.phase = 'vote';
  return {};
}

function vote(room, id, approve) {
  if (room.phase !== 'vote') return { error: '지금은 투표할 때가 아니에요.' };
  if (!getPlayer(room, id)) return { error: '플레이어가 아니에요.' };
  if (id in room.votes) return { error: '이미 투표했어요.' };
  room.votes[id] = !!approve;
  if (Object.keys(room.votes).length === PLAYER_COUNT) resolveVote(room);
  return {};
}

function resolveVote(room) {
  const yes = Object.values(room.votes).filter(Boolean).length;
  const approved = yes > PLAYER_COUNT / 2; // 동수는 부결
  const entry = {
    round: room.round + 1,
    attempt: room.rejects + 1,
    leader: leaderId(room),
    team: room.team.slice(),
    votes: { ...room.votes },
    approved,
    quest: null,
  };
  room.history.push(entry);
  room.current = entry;
  if (approved) room.rejects = 0;
  else room.rejects += 1;
  room.phase = 'voteResult';
  room.acks = new Set();
}

function submitCard(room, id, success) {
  if (room.phase !== 'quest') return { error: '지금은 원정 중이 아니에요.' };
  if (!room.team.includes(id)) return { error: '원정대가 아니에요.' };
  if (id in room.cards) return { error: '이미 냈어요.' };
  // 선은 실패 카드를 낼 수 없다
  room.cards[id] = teamOf(room, id) === 'good' ? true : !!success;
  if (Object.keys(room.cards).length === room.team.length) resolveQuest(room);
  return {};
}

function resolveQuest(room) {
  const fails = Object.values(room.cards).filter((ok) => !ok).length;
  const result = { ok: fails === 0, fails };
  room.results.push(result);
  room.current.quest = result;
  room.phase = 'questResult';
  room.acks = new Set();
}

function assassinate(room, id, targetId) {
  if (room.phase !== 'assassin') return { error: '지금은 암살 단계가 아니에요.' };
  if (roleOf(room, id) !== 'assassin') return { error: '암살자만 할 수 있어요.' };
  if (targetId === id || !getPlayer(room, targetId)) return { error: '잘못된 대상이에요.' };
  room.assassinTarget = targetId;
  if (roleOf(room, targetId) === 'merlin') endGame(room, 'evil', 'merlin');
  else endGame(room, 'good', 'missed');
  return {};
}

// ---- 각자에게 보여줄 상태 (비밀은 여기서 걸러진다) ----

function nightInfo(room, id) {
  const role = roleOf(room, id);
  const others = room.players.filter((p) => p.id !== id);
  if (role === 'merlin') {
    return {
      title: '당신이 아는 악의 세력',
      names: others.filter((p) => ROLES[p.role].team === 'evil').map((p) => p.name),
    };
  }
  if (role === 'percival') {
    return {
      title: '멀린 후보 (한 명은 모르가나)',
      names: shuffle(others.filter((p) => p.role === 'merlin' || p.role === 'morgana').map((p) => p.name)),
    };
  }
  if (role === 'morgana' || role === 'assassin') {
    return {
      title: '악의 동료',
      names: others.filter((p) => ROLES[p.role].team === 'evil').map((p) => p.name),
    };
  }
  return null;
}

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const phase = room.phase;
  const inGame = phase !== 'lobby';
  const over = phase === 'over';
  const ldr = inGame ? leaderId(room) : null;
  const showTeam = ['vote', 'voteResult', 'quest', 'questResult'].includes(phase);

  const view = {
    kind: 'avalon',
    minPlayers: PLAYER_COUNT,
    maxPlayers: PLAYER_COUNT,
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase,
    gameNo: room.gameNo,
    round: room.round,
    teamSizes: TEAM_SIZES,
    teamSize: inGame && !over ? teamSize(room) : null,
    rejects: room.rejects,
    maxRejects: MAX_REJECTS,
    leaderId: ldr,
    results: room.results,
    team: showTeam ? room.team : [],
    draft: phase === 'propose' ? room.draft : [],
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      voted: phase === 'vote' ? p.id in room.votes : null,
      acked: ACK_PHASES.has(phase) ? room.acks.has(p.id) : null,
      carded: phase === 'quest' && room.team.includes(p.id) ? p.id in room.cards : null,
      role: over ? p.role : null,
    })),
    history: room.history, // 표는 전원이 투표한 뒤(공개 단계)에야 기록되므로 그대로 보내도 된다
    myVote: phase === 'vote' && me && me.id in room.votes ? room.votes[me.id] : null,
    myCard: phase === 'quest' && me && me.id in room.cards ? room.cards[me.id] : null,
    cardsIn: phase === 'quest' ? Object.keys(room.cards).length : null,
    lastVote: phase === 'voteResult' ? room.current : null,
    lastQuest: phase === 'questResult' ? room.current.quest : null,
    winner: room.winner,
    reason: room.reason,
    assassinTarget: over ? room.assassinTarget : null,
    roleInfo: null,
    roleNames: ROLES_PUBLIC,
  };

  if (me && me.role) {
    const r = ROLES[me.role];
    view.roleInfo = {
      key: me.role,
      name: r.name,
      team: r.team,
      desc: r.desc,
      night: nightInfo(room, me.id),
    };
  }
  return view;
}

const ROLES_PUBLIC = Object.fromEntries(
  Object.entries(ROLES).map(([k, v]) => [k, { name: v.name, team: v.team }]),
);

// 서버가 메시지 종류(t)로 찾아 부르는 동작 표. 반환값은 { error } 또는 {}.
const actions = {
  start: (room, id) => start(room, id),
  ack: (room, id) => ack(room, id),
  force: (room, id) => force(room, id),
  draft: (room, id, msg) => setDraft(room, id, msg.team),
  propose: (room, id, msg) => propose(room, id, msg.team),
  vote: (room, id, msg) => vote(room, id, msg.approve),
  card: (room, id, msg) => submitCard(room, id, msg.success),
  assassinate: (room, id, msg) => assassinate(room, id, msg.target),
  again: (room, id) => backToLobby(room, id), // 게임 초기화: 대기실로 돌아가기
  restart: (room, id) => restart(room, id), // 같은 멤버로 역할을 새로 섞어 바로 다시 시작
};

module.exports = {
  actions,
  afterDisconnect: maybeAdvance,
  PLAYER_COUNT,
  TEAM_SIZES,
  MAX_REJECTS,
  ROLES,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  start,
  backToLobby,
  restart,
  kick,
  ack,
  force,
  maybeAdvance,
  setDraft,
  propose,
  vote,
  submitCard,
  assassinate,
  viewFor,
  leaderId,
  cleanName,
};
