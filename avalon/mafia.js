'use strict';
// 마피아 규칙 엔진, 5~12명. 서버가 사회자 역할을 한다.
//
// 구성: 마피아 floor(n/3)명(최소 1), 경찰 1, 의사 1, 나머지는 시민.
// 진행: 역할 확인 → [낮(토론) → 투표(처형) → 결과 → 밤] 반복. 게임은 낮부터 시작한다.
//   (1일차 낮에는 아직 밤사이 일어난 일이 없다. 1일차 낮 → 1번째 밤 → 2일차 낮 …)
//   밤: 마피아가 함께 한 명을 지목(표가 갈리면 최다득표 중 무작위), 의사가 한 명을 보호(자기 자신 가능),
//       경찰이 한 명을 조사(마피아 여부를 본인만 확인. 방장이 옵션을 켜면 직업까지). 마피아의 표적을 의사가 지켰으면 아무도 죽지 않는다.
//   낮: 살아 있는 사람의 과반이 "토론 끝"을 누르면 투표로 넘어간다.
//   투표: 살아 있는 사람이 각자 한 명(또는 기권)에게 투표. 단독 최다득표자가 "처형 후보"가 되고, 동률이면 아무도 처형되지 않는다.
//   찬반 투표: 후보를 뺀 산 사람이 각자 "처형(찬성)" 또는 "살리기(반대)"를 고른다. 찬성이 반대보다 많을 때만 처형(동수면 생존).
// 승리: 마피아가 모두 죽으면 시민팀, 마피아 수가 나머지 생존자 수 이상이면 마피아팀.
// 채팅: 낮/투표에는 산 사람 전체 채팅, 밤에는 마피아끼리만. (목소리 없이도 할 수 있게)

const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 5;
const MAX_PLAYERS = 12;
const CHAT_KEEP = 60;
const CHAT_MAX = 80;
const LOG_KEEP = 100;

const ROLES = {
  mafia: { name: '마피아', team: 'mafia', desc: '밤마다 동료와 함께 한 명을 골라 제거하세요. 낮에는 시민인 척 정체를 숨기세요.' },
  police: { name: '경찰', team: 'citizen', desc: '밤마다 한 명을 조사해 마피아인지 알아낼 수 있어요. 정체를 들키면 마피아의 표적이 되니 조심하세요.' },
  doctor: { name: '의사', team: 'citizen', desc: '밤마다 한 명을 지켜요. 마피아가 그 사람을 노리면 살아나요. 자기 자신도 지킬 수 있어요.' },
  citizen: { name: '시민', team: 'citizen', desc: '특별한 능력은 없어요. 토론과 투표로 마피아를 찾아내세요.' },
};

function composition(n) {
  const mafia = Math.max(1, Math.floor(n / 3));
  const roles = [...Array(mafia).fill('mafia'), 'police', 'doctor'];
  while (roles.length < n) roles.push('citizen');
  return roles;
}

function createRoom(code) {
  return {
    kind: 'mafia',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | roles | night | day | vote | trial | voteResult | over
    gameNo: 0,
    day: 0,
    settings: { revealRoles: true, policeReveal: false }, // 죽은 사람의 직업 공개 / 경찰에게 직업까지 알려줄지
    night: null, // { mafia: {id: target}, doctor, police } (undefined = 아직, null = 하지 않음)
    readyIds: new Set(),
    acks: new Set(),
    votes: {},
    accused: null,
    trial: {},
    lastNight: null,
    lastVote: null,
    policeLog: [],
    chat: [],
    log: [],
    winner: null,
    pendingWinner: null,
    lastActive: Date.now(),
  };
}

function addPlayer(room, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: '이름을 입력하세요.' };
  if (room.phase !== 'lobby') return { error: '이미 게임이 시작됐어요.' };
  if (room.players.length >= MAX_PLAYERS) return { error: `방이 가득 찼어요. (${MAX_PLAYERS}명)` };
  if (room.players.some((p) => p.name === name)) return { error: '같은 이름이 이미 있어요. 다른 이름을 쓰세요.' };
  const player = { id: newId(), token: newToken(), name, connected: true, role: null, alive: true };
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

const alive = (room) => room.players.filter((p) => p.alive);
const aliveMafia = (room) => alive(room).filter((p) => p.role === 'mafia');
const nameOf = (room, id) => (getPlayer(room, id) ? getPlayer(room, id).name : '?');

function say(room, text) {
  room.log.push({ day: room.day, text });
  if (room.log.length > LOG_KEEP) room.log.shift();
}

function roleTag(room, p) {
  return room.settings.revealRoles ? ` (${ROLES[p.role].name})` : '';
}

function winnerOf(room) {
  const live = alive(room);
  const mafia = live.filter((p) => p.role === 'mafia').length;
  if (mafia === 0) return 'citizen';
  if (mafia >= live.length - mafia) return 'mafia';
  return null;
}

function finish(room, winner) {
  room.phase = 'over';
  room.winner = winner;
  room.night = null;
  room.pendingWinner = null;
  say(room, winner === 'citizen' ? '마피아가 모두 사라졌어요. 시민팀 승리!' : '마피아가 시민과 같거나 더 많아졌어요. 마피아팀 승리!');
}

function pickRandomTop(counts) {
  const top = Math.max(...Object.values(counts));
  const tied = Object.keys(counts).filter((id) => counts[id] === top);
  return tied[Math.floor(Math.random() * tied.length)];
}

// ---- 설정 / 시작 / 초기화 ----

function setSetting(room, byId, key, value) {
  if (byId !== room.hostId) return { error: '방장만 바꿀 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '게임 시작 전에만 바꿀 수 있어요.' };
  if (key !== 'revealRoles' && key !== 'policeReveal') return { error: '알 수 없는 설정이에요.' };
  room.settings[key] = !!value;
  return {};
}

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  const roles = shuffle(composition(n));
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.alive = true;
  });
  Object.assign(room, {
    gameNo: room.gameNo + 1, day: 1, night: null, votes: {}, accused: null, trial: {}, lastNight: null, lastVote: null,
    policeLog: [], chat: [], log: [], winner: null, pendingWinner: null,
    readyIds: new Set(), acks: new Set(), phase: 'roles',
  });
  say(room, '게임 시작! 역할을 확인하세요.');
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    p.role = null;
    p.alive = true;
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, {
    phase: 'lobby', day: 0, night: null, votes: {}, accused: null, trial: {}, lastNight: null, lastVote: null, policeLog: [], chat: [], log: [],
    winner: null, pendingWinner: null, readyIds: new Set(), acks: new Set(),
  });
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

// ---- 진행 ----

function startDay(room) {
  room.phase = 'day';
  room.readyIds = new Set();
  room.votes = {};
  room.accused = null;
  room.trial = {};
  say(room, `☀️ ${room.day}일차 낮이 밝았어요.`);
}

function startNight(room) {
  room.phase = 'night';
  room.night = { mafia: {}, doctor: undefined, police: undefined };
  room.readyIds = new Set();
  room.votes = {};
  say(room, `🌙 ${room.day}번째 밤이 되었어요.`);
}

function nightComplete(room) {
  const n = room.night;
  if (!aliveMafia(room).every((p) => p.id in n.mafia)) return false;
  const doctor = alive(room).find((p) => p.role === 'doctor');
  const police = alive(room).find((p) => p.role === 'police');
  if (doctor && n.doctor === undefined) return false;
  if (police && n.police === undefined) return false;
  return true;
}

function resolveNight(room) {
  const n = room.night;
  const counts = {};
  Object.values(n.mafia).forEach((t) => { counts[t] = (counts[t] || 0) + 1; });
  const attacked = Object.keys(counts).length ? pickRandomTop(counts) : null;
  const saved = attacked !== null && n.doctor === attacked;
  room.night = null;
  room.lastNight = { attacked: saved ? attacked : null, victim: null, saved };
  if (attacked && !saved) {
    const v = getPlayer(room, attacked);
    v.alive = false;
    room.lastNight.victim = v.id;
    say(room, `☠️ ${v.name}님이 밤사이 마피아에게 살해당했어요${roleTag(room, v)}.`);
  } else if (saved) {
    say(room, `마피아가 ${nameOf(room, attacked)}님을 공격했지만 의사가 살렸어요!`);
  } else {
    say(room, '조용한 밤이었어요. 아무 일도 없었어요.');
  }
  const w = winnerOf(room);
  if (w) {
    finish(room, w);
    return;
  }
  room.day += 1;
  startDay(room);
}

function night(room, id, targetId) {
  if (room.phase !== 'night') return { error: '지금은 밤이 아니에요.' };
  const me = getPlayer(room, id);
  if (!me || !me.alive) return { error: '죽은 사람은 할 수 없어요.' };
  const t = getPlayer(room, targetId);
  if (!t || !t.alive) return { error: '살아 있는 사람을 고르세요.' };
  const n = room.night;
  switch (me.role) {
    case 'mafia':
      if (t.role === 'mafia') return { error: '동료 마피아는 고를 수 없어요.' };
      if (id in n.mafia) return { error: '이미 선택했어요.' };
      n.mafia[id] = t.id;
      break;
    case 'doctor':
      if (n.doctor !== undefined) return { error: '이미 선택했어요.' };
      n.doctor = t.id;
      break;
    case 'police':
      if (n.police !== undefined) return { error: '이미 선택했어요.' };
      if (t.id === id) return { error: '자기 자신은 조사할 수 없어요.' };
      n.police = t.id;
      // 기본은 마피아 여부만. 방장이 켜면 직업까지 알려준다 (꺼져 있으면 role 항목 자체가 없다)
      room.policeLog.push({ day: room.day, target: t.id, mafia: t.role === 'mafia', ...(room.settings.policeReveal ? { role: t.role } : {}) });
      break;
    default:
      return { error: '밤에 할 수 있는 일이 없어요. 눈을 감고 기다리세요.' };
  }
  if (nightComplete(room)) resolveNight(room);
  return {};
}

function startVote(room) {
  room.phase = 'vote';
  room.votes = {};
  say(room, '🗳 투표 시간이에요.');
}

function ready(room, id) {
  if (room.phase !== 'day') return { error: '지금은 토론 시간이 아니에요.' };
  const me = getPlayer(room, id);
  if (!me || !me.alive) return { error: '죽은 사람은 할 수 없어요.' };
  room.readyIds.add(id);
  if (room.readyIds.size * 2 > alive(room).length) startVote(room);
  return {};
}

function vote(room, id, targetId) {
  if (room.phase !== 'vote') return { error: '지금은 투표 시간이 아니에요.' };
  const me = getPlayer(room, id);
  if (!me || !me.alive) return { error: '죽은 사람은 투표할 수 없어요.' };
  if (id in room.votes) return { error: '이미 투표했어요.' };
  if (targetId !== null) {
    const t = getPlayer(room, targetId);
    if (!t || !t.alive) return { error: '살아 있는 사람에게 투표하세요.' };
    if (t.id === id) return { error: '자기 자신에게는 투표할 수 없어요.' };
  }
  room.votes[id] = targetId;
  if (Object.keys(room.votes).length === alive(room).length) resolveVote(room);
  return {};
}

function resolveVote(room) {
  const counts = {};
  Object.values(room.votes).forEach((t) => {
    if (t !== null) counts[t] = (counts[t] || 0) + 1;
  });
  const top = Math.max(0, ...Object.values(counts));
  const leaders = Object.keys(counts).filter((t) => counts[t] === top);
  const accused = top > 0 && leaders.length === 1 ? leaders[0] : null;
  room.lastVote = { votes: { ...room.votes }, counts, accused, executed: null, trial: null };
  if (accused) {
    room.accused = accused;
    room.trial = {};
    room.phase = 'trial';
    say(room, `⚖️ ${nameOf(room, accused)}님이 처형 후보예요. 찬반 투표를 해주세요.`);
    return;
  }
  say(room, '⚖️ 투표 결과 아무도 처형 후보가 되지 않았어요.');
  room.pendingWinner = null;
  room.phase = 'voteResult';
  room.acks = new Set();
}

const judges = (room) => alive(room).filter((p) => p.id !== room.accused);

function judge(room, id, kill) {
  if (room.phase !== 'trial') return { error: '지금은 찬반 투표 시간이 아니에요.' };
  const me = getPlayer(room, id);
  if (!me || !me.alive) return { error: '죽은 사람은 투표할 수 없어요.' };
  if (id === room.accused) return { error: '처형 후보는 투표할 수 없어요.' };
  if (typeof kill !== 'boolean') return { error: '찬성 또는 반대를 고르세요.' };
  if (id in room.trial) return { error: '이미 투표했어요.' };
  room.trial[id] = kill;
  if (judges(room).every((p) => p.id in room.trial)) resolveTrial(room);
  return {};
}

function resolveTrial(room) {
  const kill = Object.values(room.trial).filter((v) => v).length;
  const spare = Object.values(room.trial).filter((v) => !v).length;
  const v = getPlayer(room, room.accused);
  room.lastVote.trial = { votes: { ...room.trial }, kill, spare };
  if (kill > spare) {
    v.alive = false;
    room.lastVote.executed = v.id;
    say(room, `⚖️ 찬성 ${kill} : 반대 ${spare}. ${v.name}님이 처형됐어요${roleTag(room, v)}.`);
    room.pendingWinner = winnerOf(room);
  } else {
    say(room, `⚖️ 찬성 ${kill} : 반대 ${spare}. ${v.name}님은 처형되지 않았어요.`);
    room.pendingWinner = null;
  }
  room.phase = 'voteResult';
  room.acks = new Set();
}

function ack(room, id) {
  if (room.phase !== 'roles' && room.phase !== 'voteResult') return { error: '지금은 확인할 게 없어요.' };
  const me = getPlayer(room, id);
  if (!me) return { error: '플레이어가 아니에요.' };
  room.acks.add(id);
  maybeAdvance(room);
  return {};
}

function needsAck(room, p) {
  return p.connected && (room.phase === 'roles' || p.alive);
}

function maybeAdvance(room) {
  if (room.phase !== 'roles' && room.phase !== 'voteResult') return;
  const need = room.players.filter((p) => needsAck(room, p));
  if (need.length > 0 && need.every((p) => room.acks.has(p.id))) advance(room);
}

function advance(room) {
  room.acks = new Set();
  if (room.phase === 'roles') {
    startDay(room); // 게임은 낮부터
  } else if (room.phase === 'voteResult') {
    if (room.pendingWinner) finish(room, room.pendingWinner);
    else startNight(room); // 1일차 낮 뒤에는 1번째 밤
  }
}

// 방장: 자리를 비운 사람 때문에 멈췄을 때 기본값으로 진행
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  switch (room.phase) {
    case 'roles':
    case 'voteResult':
      advance(room);
      break;
    case 'day':
      startVote(room);
      break;
    case 'vote':
      alive(room).forEach((p) => {
        if (!(p.id in room.votes)) room.votes[p.id] = null;
      });
      resolveVote(room);
      break;
    case 'trial':
      judges(room).forEach((p) => {
        if (!(p.id in room.trial)) room.trial[p.id] = false; // 안 한 사람은 반대(살리기)로 센다
      });
      resolveTrial(room);
      break;
    case 'night': {
      const n = room.night;
      aliveMafia(room).forEach((p) => {
        if (!(p.id in n.mafia)) {
          const targets = alive(room).filter((t) => t.role !== 'mafia');
          n.mafia[p.id] = targets[Math.floor(Math.random() * targets.length)].id;
        }
      });
      if (n.doctor === undefined) n.doctor = null;
      if (n.police === undefined) n.police = null;
      resolveNight(room);
      break;
    }
    default:
      return { error: '지금은 넘길 게 없어요.' };
  }
  return {};
}

function chat(room, id, rawText) {
  const me = getPlayer(room, id);
  if (!me || !me.alive) return { error: '죽은 사람은 채팅할 수 없어요.' };
  const text = String(rawText ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);
  if (!text) return { error: '내용을 입력하세요.' };
  let ch;
  if (room.phase === 'day' || room.phase === 'vote' || room.phase === 'trial') ch = 'all';
  else if (room.phase === 'night' && me.role === 'mafia') ch = 'mafia';
  else return { error: room.phase === 'night' ? '밤에는 마피아만 채팅할 수 있어요.' : '지금은 채팅할 수 없어요.' };
  room.chat.push({ id, name: me.name, text, ch, day: room.day });
  if (room.chat.length > CHAT_KEEP) room.chat.shift();
  return {};
}

// ---- 각자에게 보여줄 상태 ----

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const started = room.phase !== 'lobby';
  const over = room.phase === 'over';
  const isMafia = !!(me && me.role === 'mafia');
  const roleVisible = (p) => over || p.id === viewerId || (isMafia && p.role === 'mafia')
    || (!p.alive && room.settings.revealRoles && started);

  let nightAction = null;
  if (room.phase === 'night' && me && me.alive && me.role !== 'citizen') {
    const n = room.night;
    const mine = me.role === 'mafia' ? n.mafia[me.id] : n[me.role];
    const options = alive(room)
      .filter((t) => (me.role === 'mafia' ? t.role !== 'mafia' : me.role === 'police' ? t.id !== me.id : true))
      .map((t) => t.id);
    nightAction = {
      kind: me.role,
      options,
      done: mine !== undefined,
      myPick: mine === undefined ? null : mine,
      team: me.role === 'mafia' ? Object.entries(n.mafia).map(([voter, target]) => ({ voter, target })) : null,
    };
  }

  let canChat = null;
  if (me && me.alive) {
    if (room.phase === 'day' || room.phase === 'vote' || room.phase === 'trial') canChat = 'all';
    else if (room.phase === 'night' && isMafia) canChat = 'mafia';
  }

  return {
    kind: 'mafia',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    day: room.day,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: room.settings,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      alive: p.alive,
      role: started && roleVisible(p) ? p.role : null,
      ready: room.phase === 'day' ? room.readyIds.has(p.id) : null,
      voted: room.phase === 'vote' ? p.id in room.votes : room.phase === 'trial' && p.id !== room.accused ? p.id in room.trial : null,
      acked: room.phase === 'roles' || room.phase === 'voteResult' ? room.acks.has(p.id) : null,
    })),
    aliveCount: started ? alive(room).length : 0,
    readyCount: room.phase === 'day' ? room.readyIds.size : 0,
    myVote: room.phase === 'vote' && me && me.id in room.votes ? { target: room.votes[me.id] } : null,
    accusedId: room.phase === 'trial' ? room.accused : null,
    myJudge: room.phase === 'trial' && me && me.id in room.trial ? { kill: room.trial[me.id] } : null,
    judgeCount: room.phase === 'trial' ? judges(room).length : 0,
    nightAction,
    policeLog: me && me.role === 'police' ? room.policeLog : null,
    lastNight: started && room.phase !== 'roles' && room.phase !== 'night' ? room.lastNight : null,
    lastVote: room.phase === 'voteResult' || room.phase === 'trial' || over ? room.lastVote : null,
    canChat,
    chat: room.chat.filter((c) => c.ch === 'all' || (c.ch === 'mafia' && isMafia)),
    log: room.log,
    winner: room.winner,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  ack: (room, id) => ack(room, id),
  ready: (room, id) => ready(room, id),
  vote: (room, id, msg) => vote(room, id, msg.target ?? null),
  judge: (room, id, msg) => judge(room, id, msg.kill),
  night: (room, id, msg) => night(room, id, msg.target),
  chat: (room, id, msg) => chat(room, id, msg.text),
  setting: (room, id, msg) => setSetting(room, id, msg.key, msg.value),
};

module.exports = {
  actions,
  afterDisconnect: maybeAdvance,
  ROLES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  composition,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  setSetting,
  start,
  backToLobby,
  restart,
  night,
  ready,
  vote,
  judge,
  ack,
  force,
  chat,
  viewFor,
};
