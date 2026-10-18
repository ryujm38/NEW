'use strict';
// 더 크루(협력 트릭 테이킹) 규칙 엔진, 3~5명. 모두가 한 팀이 되어 임무(미션)를 하나씩 깨 나간다.
//
// 카드 40장: 4색(분홍 p, 파랑 b, 초록 g, 노랑 y) × 1~9 = 36장 + 로켓(r) 1~4. 카드는 'b7', 'r4' 같은 문자열.
// 모든 카드를 고르게 나눠 준다(3명 13/13/14, 4명 10장씩, 5명 8장씩). 로켓 4를 가진 사람이 사령관이고 첫 트릭을 먼저 낸다.
//
// 과제: 임무마다 정해진 수만큼 과제 카드(색 카드 36장으로 된 별도 덱)를 펼친다.
//   사령관부터 시계 방향으로 한 장씩 가져간다(임무에 따라 사령관이 나눠 주거나, 한 명이 모두 맡기도 한다).
//   과제 = 그 카드가 들어 있는 트릭을 과제 주인이 이겨야 한다. 다른 사람이 이기면 바로 실패.
// 순서 표시(일부 임무): 1~5 = 전체 과제 중 정확히 그 번째에 완료, › ›› ››› ›››› = 표시끼리의 상대 순서,
//   Ω = 모든 과제 중 마지막에 완료. 한 트릭에서 과제 여러 개가 함께 완료되면(이긴 사람은 한 명이니 모두 그 사람 과제)
//   원작 규칙대로 "어느 쪽이 먼저 나왔든" 순서에 맞게 완료한 것으로 본다: 그 트릭의 과제들이 D+1..D+k번째 자리를
//   순서에 맞게 나눠 가질 수 있으면 성공(예: 1과 2, ››와 ›››, 마지막 트릭의 Ω와 다른 과제). 1과 3처럼 사이가 비면 실패.
// 트릭: 먼저 낸 사람은 아무 카드나. 나머지는 낸 색이 있으면 반드시 따라 낸다. 없으면 아무거나(로켓 포함).
//   로켓이 있으면 가장 높은 로켓이, 없으면 처음 낸 색 중 가장 높은 카드가 이긴다. 이긴 사람이 다음 트릭을 먼저 낸다.
// 통신: 임무마다 한 사람당 한 번, 트릭이 시작되기 전(아무도 안 냈을 때)에만, 손에 든 색 카드 한 장을 공개하며
//   그 색에서 "가장 높아요 / 하나뿐이에요 / 가장 낮아요" 중 사실인 하나를 알린다(로켓은 안 됨).
//   그 색이 한 장뿐이면 "하나뿐", 두 장 이상이면 가장 높은/낮은 카드일 때만 가능 → 사실이 아닌 통신은 막는다.
//   공개한 카드는 손에 남아 나중에 낼 수 있다.
// 성공: 모든 과제를 올바른 순서로 완료. 실패하면 같은 임무를 다시, 성공하면 다음 임무로. 3명일 때 14장 받은 사람의
//   마지막 한 장은 내지 않는다(트릭은 13번). 그 카드가 과제라면 완료할 수 없으니 실패.
// 2인용 변형(가상 승무원)은 넣지 않았다.

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 5;
const LOG_KEEP = 16;
const VERSION = 1;
const COLORS = ['p', 'b', 'g', 'y'];
const SUIT_NAME = { p: '분홍', b: '파랑', g: '초록', y: '노랑', r: '로켓' };
const SUIT_ORDER = { p: 0, b: 1, g: 2, y: 3, r: 4 };
const TASK_DECK = COLORS.flatMap((c) => Array.from({ length: 9 }, (_, i) => `${c}${i + 1}`));
const DECK = [...TASK_DECK, 'r1', 'r2', 'r3', 'r4'];
const COMM_TOKENS = ['high', 'only', 'low'];
const COMM_NAME = { high: '가장 높아요', only: '하나뿐이에요', low: '가장 낮아요' };
const TOKEN_NAME = { 1: '1번째', 2: '2번째', 3: '3번째', 4: '4번째', 5: '5번째', '>': '›', '>>': '››', '>>>': '›››', '>>>>': '››››', O: 'Ω 마지막' };

// ---- 임무 일지: 직접 만든 30개 (원작 일지의 글과는 다르다) ----
// n: 과제 수, tokens: 앞에서부터 펼쳐진 과제에 차례로 붙는 순서 표시
// 특별 규칙: noComm 통신 금지, deadzone 통신 방해(카드만 보이고 표시는 안 보임), commFrom k(k번째 트릭부터 통신),
//   cmdFirst 첫 트릭은 사령관이 이겨야, assign 사령관이 과제를 나눠 줌, solo 사령관이 고른 한 명이 과제를 모두 맡음,
//   commOne 사령관이 고른 한 명만 통신
const MISSIONS = [
  { n: 1, title: '발사 준비', story: '정거장을 떠나기 전 마지막 점검이에요. 처음으로 손발을 맞춰 봐요.' },
  { n: 2, title: '첫 궤도', story: '무사히 궤도에 올랐어요. 이번엔 두 가지를 함께 챙겨요.' },
  { n: 2, tokens: ['1', '2'], title: '점화 순서', story: '주 엔진은 1번부터 차례로 켜야 해요. 순서가 꼬이면 처음부터!' },
  { n: 3, title: '소행성 띠', story: '돌덩이 사이를 빠져나가요. 모두의 손이 필요해요.' },
  { n: 3, cmdFirst: true, title: '사령관의 시범', story: '사령관이 먼저 본보기를 보여 줘요. 첫 트릭은 사령관이 꼭 이겨야 해요.' },
  { n: 3, tokens: ['O'], title: '마지막 신호', story: '귀환 신호는 다른 일이 모두 끝난 뒤에 보내야 해요.' },
  { n: 3, tokens: ['>', '>>'], title: '연료 이송', story: '연료는 정해진 순서대로 옮겨야 탱크가 버텨요.' },
  { n: 2, noComm: true, title: '무전 침묵', story: '적막한 구역이에요. 무전기를 쓸 수 없으니 눈치로 맞춰요.' },
  { n: 4, title: '태양풍', story: '거센 태양풍이 불어요. 할 일이 하나 더 늘었어요.' },
  { n: 4, tokens: ['1'], deadzone: true, title: '잡음 섞인 무전', story: '무전에 잡음이 끼어요. 카드는 보이지만 어떤 뜻인지는 안 들려요.' },
  { n: 4, assign: true, title: '사령관의 배치', story: '사령관이 대원마다 맡을 일을 정해 줘요.' },
  { n: 4, tokens: ['>', '>>', '>>>'], title: '연쇄 점화', story: '보조 엔진 셋을 차례로 깨워요. 사이사이 다른 일은 괜찮아요.' },
  { n: 4, commFrom: 3, title: '늦게 펴지는 안테나', story: '안테나가 아직 접혀 있어요. 세 번째 트릭부터 통신할 수 있어요.' },
  { n: 4, tokens: ['1', '2', '3'], title: '정밀 착륙', story: '착륙 절차는 1, 2, 3 순서 그대로 따라야 해요.' },
  { n: 5, tokens: ['O'], title: '얼음 위성', story: '얼음 위성에 내렸어요. 깃발은 맨 마지막에 꽂아요.' },
  { n: 3, solo: true, title: '홀로 선외 활동', story: '우주복이 하나뿐이에요. 사령관이 고른 대원이 과제를 모두 맡아요.' },
  { n: 5, tokens: ['1', '2'], title: '두 번의 점화', story: '궤도를 바꾸려면 두 번의 점화를 순서대로 해야 해요.' },
  { n: 5, commOne: true, title: '단 하나의 통신기', story: '통신기가 하나만 남았어요. 사령관이 정한 한 명만 통신할 수 있어요.' },
  { n: 6, title: '고리 행성', story: '거대한 고리 사이를 지나가요. 할 일이 여섯 가지예요.' },
  { n: 5, tokens: ['>', '>>'], deadzone: true, title: '흐릿한 신호', story: '전파가 흐려졌어요. 통신 표시가 보이지 않아요.' },
  { n: 5, tokens: ['O'], cmdFirst: true, title: '사령관의 각오', story: '사령관이 첫 트릭을 이기며 앞장서요. 마지막 과제도 잊지 마세요.' },
  { n: 6, tokens: ['1', '2', '3'], title: '삼단 분리', story: '로켓 몸체를 1단, 2단, 3단 순서로 떼어 내요.' },
  { n: 6, assign: true, commFrom: 2, title: '지연된 지시', story: '사령관이 일을 나눠 주고, 통신은 두 번째 트릭부터 열려요.' },
  { n: 7, title: '블랙홀 가장자리', story: '블랙홀이 끌어당겨요. 일곱 가지 일을 서둘러 끝내요.' },
  { n: 4, noComm: true, title: '완전한 침묵', story: '모든 통신이 끊겼어요. 서로를 믿고 카드를 내요.' },
  { n: 7, tokens: ['>', '>>', '>>>', '>>>>'], title: '도미노 궤도', story: '위성 넷을 차례로 지나가요. 하나라도 순서가 바뀌면 안 돼요.' },
  { n: 7, tokens: ['1', '2', 'O'], title: '마지막 관문', story: '관문을 열고, 지나고, 마지막에 닫아야 해요.' },
  { n: 8, deadzone: true, title: '폭풍 속 교신', story: '자기 폭풍 한가운데예요. 통신은 카드만 겨우 보여요.' },
  { n: 8, tokens: ['O'], title: '아홉 번째 행성 근처', story: '드디어 목표 행성이 보여요. 마지막 과제로 착륙 허가를 받아요.' },
  { n: 9, tokens: ['1', '2', '3'], title: '미지의 행성', story: '미지의 행성에 첫발을 내디뎌요. 모든 걸 걸고 마지막 임무에 도전해요!' },
];

const suitOf = (c) => c[0];
const valOf = (c) => Number(c.slice(1));
const cardName = (c) => `${SUIT_NAME[suitOf(c)]} ${valOf(c)}`;
const isNum = (t) => /^[1-5]$/.test(t || '');
const isArrow = (t) => /^>+$/.test(t || '');
const sortHand = (h) => h.slice().sort((a, b) => SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)] || valOf(a) - valOf(b));

function missionDef(n) {
  return MISSIONS[n - 1] || MISSIONS[0];
}

function createRoom(code) {
  return {
    kind: 'crew',
    v: VERSION,
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | choose | tasks | play | result | over
    gameNo: 0,
    settings: { startMission: 1 },
    cleared: 0, // 이 방에서 깬 가장 높은 임무 번호
    mission: 1,
    attempt: 1, // 지금 임무의 몇 번째 도전인지
    tries: 0, // 이 방의 전체 도전 수
    commander: 0, // 사령관 자리 번호
    choose: [], // 사령관이 먼저 정할 것: 'comm' | 'solo'
    commPlayer: null, // commOne 임무에서 통신할 수 있는 사람
    tasks: [], // { card, token, owner, done, trick }
    picker: 0, // 과제를 고를 차례인 자리 번호
    turn: 0,
    trick: null, // { lead, plays: [{ id, card }] }
    trickNo: 0, // 끝난 트릭 수
    lastTrick: null, // { plays, winner, no }
    played: [], // 이번 임무에 나온 카드
    result: null, // { ok, reason, mission }
    log: [],
    lastActive: Date.now(),
  };
}

function upgrade(room) {
  if (room.v === VERSION) return;
  room.v = VERSION;
}

function addPlayer(room, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: '이름을 입력하세요.' };
  if (room.phase !== 'lobby') return { error: '이미 게임이 시작됐어요.' };
  if (room.players.length >= MAX_PLAYERS) return { error: `방이 가득 찼어요. (${MAX_PLAYERS}명)` };
  if (room.players.some((p) => p.name === name)) return { error: '같은 이름이 이미 있어요. 다른 이름을 쓰세요.' };
  const player = { id: newId(), token: newToken(), name, connected: true, hand: [], won: 0, signal: null, commUsed: false };
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
  const n = Number(value);
  if (key !== 'startMission' || !Number.isInteger(n) || n < 1 || n > MISSIONS.length) return { error: '알 수 없는 설정이에요.' };
  room.settings.startMission = n;
  return {};
}

// ---- 도우미 ----

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

const def = (room) => missionDef(room.mission);
const commander = (room) => room.players[room.commander];
const nameOf = (room, id) => (getPlayer(room, id) ? getPlayer(room, id).name : '?');

// 이 트릭에서 낼 수 있는 카드: 처음 낸 색이 있으면 그 색만
function legalCards(room, p) {
  if (!room.trick || !room.trick.plays.length) return p.hand.slice();
  const led = suitOf(room.trick.plays[0].card);
  const follow = p.hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : p.hand.slice();
}

// 트릭을 이긴 카드: 로켓이 있으면 가장 높은 로켓, 없으면 처음 낸 색 중 가장 높은 카드
function trickWinner(plays) {
  const led = suitOf(plays[0].card);
  const rockets = plays.filter((x) => suitOf(x.card) === 'r');
  const pool = rockets.length ? rockets : plays.filter((x) => suitOf(x.card) === led);
  return pool.reduce((best, x) => (valOf(x.card) > valOf(best.card) ? x : best));
}

// 이 카드로 사실인 통신 표시 (없으면 null)
function commTokenFor(hand, card) {
  if (!hand.includes(card) || suitOf(card) === 'r') return null;
  const same = hand.filter((c) => suitOf(c) === suitOf(card)).map(valOf);
  if (same.length === 1) return 'only';
  if (valOf(card) === Math.max(...same)) return 'high';
  if (valOf(card) === Math.min(...same)) return 'low';
  return null;
}

// 지금 통신할 수 없는 이유 (할 수 있으면 null)
function commBlock(room, p) {
  if (room.phase !== 'play') return 'phase';
  const d = def(room);
  if (d.noComm) return 'noComm';
  if (p.commUsed) return 'used';
  if (d.commOne && room.commPlayer !== p.id) return 'notChosen';
  if (d.commFrom && room.trickNo < d.commFrom - 1) return 'notYet';
  if (room.trick && room.trick.plays.length) return 'midTrick';
  if (!p.hand.some((c) => commTokenFor(p.hand, c))) return 'noCard';
  return null;
}

// ---- 임무 진행 ----

function startMission(room) {
  const d = def(room);
  const n = room.players.length;
  const deck = shuffle(DECK);
  room.players.forEach((p) => { p.hand = []; p.won = 0; p.signal = null; p.commUsed = false; });
  const first = crypto.randomInt(n); // 3명일 때 한 장 더 받는 사람을 고르게
  deck.forEach((c, i) => { room.players[(first + i) % n].hand.push(c); });
  room.players.forEach((p) => { p.hand = sortHand(p.hand); });
  room.commander = room.players.findIndex((p) => p.hand.includes('r4'));
  const cards = shuffle(TASK_DECK).slice(0, d.n);
  const tokens = d.tokens || [];
  room.tasks = cards.map((card, i) => ({ card, token: tokens[i] || null, owner: null, done: false, trick: null }));
  Object.assign(room, { trick: null, trickNo: 0, lastTrick: null, played: [], result: null, commPlayer: null, picker: room.commander, turn: room.commander });
  room.tries += 1;
  say(room, `🚀 임무 ${room.mission} "${d.title}" 시작!${room.attempt > 1 ? ` (${room.attempt}번째 도전)` : ''} 사령관은 ${commander(room).name}님이에요.`);
  room.choose = [];
  if (d.commOne) room.choose.push('comm');
  if (d.solo) room.choose.push('solo');
  if (room.choose.length) room.phase = 'choose';
  else startTasks(room);
}

function startTasks(room) {
  room.phase = 'tasks';
  room.picker = room.commander;
  if (def(room).assign) say(room, `📋 사령관 ${commander(room).name}님이 과제 ${room.tasks.length}개를 나눠 줘요.`);
  else say(room, `📋 과제 ${room.tasks.length}개를 펼쳤어요. 사령관부터 한 장씩 가져가요.`);
}

function startPlay(room) {
  room.phase = 'play';
  room.turn = room.commander;
  room.trick = { lead: room.commander, plays: [] };
  say(room, `🃏 첫 트릭은 사령관 ${commander(room).name}님이 먼저 내요.`);
}

// 사령관이 정하기: comm(통신할 한 명) / solo(과제를 모두 맡을 한 명, 사령관 제외)
function choose(room, id, targetId) {
  if (room.phase !== 'choose') return { error: '지금은 고를 때가 아니에요.' };
  if (commander(room).id !== id) return { error: '사령관만 정할 수 있어요.' };
  const target = getPlayer(room, targetId);
  if (!target) return { error: '없는 사람이에요.' };
  const what = room.choose[0];
  if (what === 'solo') {
    if (target.id === id) return { error: '사령관은 자기 자신을 고를 수 없어요.' };
    room.tasks.forEach((t) => { t.owner = target.id; });
    say(room, `🧑‍🚀 사령관이 ${target.name}님에게 과제 ${room.tasks.length}개를 모두 맡겼어요.`);
  } else {
    room.commPlayer = target.id;
    say(room, `📡 사령관이 ${target.name}님만 통신할 수 있게 정했어요.`);
  }
  room.choose.shift();
  if (room.choose.length) return {};
  if (room.tasks.every((t) => t.owner)) startPlay(room);
  else startTasks(room);
  return {};
}

const assignCap = (room) => Math.ceil(room.tasks.length / room.players.length);
// 원작: 다 나눈 뒤 누구도 다른 사람보다 과제가 2개 이상 많으면 안 된다 → 각자 ⌊t/n⌋ 또는 ⌈t/n⌉개.
// 이 사람에게 한 개 더 줘도 끝까지 고르게 나눌 수 있는지
function canAssign(room, targetId) {
  const n = room.players.length;
  const t = room.tasks.length;
  const q = Math.floor(t / n);
  const r = t % n;
  const cnt = (pid) => room.tasks.filter((x) => x.owner === pid).length;
  const have = cnt(targetId);
  if (have < q) return true;
  if (r === 0 || have > q) return false;
  return room.players.filter((p) => cnt(p.id) > q).length < r;
}

function pickTask(room, id, index) {
  if (room.phase !== 'tasks') return { error: '지금은 과제를 고를 때가 아니에요.' };
  if (def(room).assign) return { error: '이번 임무는 사령관이 과제를 나눠 줘요.' };
  if (room.players[room.picker].id !== id) return { error: '내가 고를 차례가 아니에요.' };
  const t = room.tasks[index];
  if (!t) return { error: '없는 과제예요.' };
  if (t.owner) return { error: '이미 누가 가져간 과제예요.' };
  t.owner = id;
  say(room, `📋 ${nameOf(room, id)}님이 과제를 가져갔어요: ${cardName(t.card)}${t.token ? ` (${TOKEN_NAME[t.token]})` : ''}`);
  room.picker = (room.picker + 1) % room.players.length;
  if (room.tasks.every((x) => x.owner)) startPlay(room);
  return {};
}

function assignTask(room, id, index, targetId) {
  if (room.phase !== 'tasks') return { error: '지금은 과제를 나눌 때가 아니에요.' };
  if (!def(room).assign) return { error: '이번 임무는 각자 골라요.' };
  if (commander(room).id !== id) return { error: '사령관만 나눠 줄 수 있어요.' };
  const t = room.tasks[index];
  if (!t) return { error: '없는 과제예요.' };
  if (t.owner) return { error: '이미 나눠 준 과제예요.' };
  const target = getPlayer(room, targetId);
  if (!target) return { error: '없는 사람이에요.' };
  if (!canAssign(room, target.id)) {
    const cap = assignCap(room);
    return { error: room.tasks.filter((x) => x.owner === target.id).length >= cap
      ? `한 사람에게 ${cap}개까지만 줄 수 있어요.`
      : '과제는 고르게 나눠야 해요. 다 나눈 뒤 다른 사람보다 2개 이상 많은 사람이 있으면 안 돼요.' };
  }
  t.owner = target.id;
  say(room, `📋 사령관이 ${target.name}님에게 과제를 줬어요: ${cardName(t.card)}${t.token ? ` (${TOKEN_NAME[t.token]})` : ''}`);
  if (room.tasks.every((x) => x.owner)) startPlay(room);
  return {};
}

const COMM_ERR = {
  phase: '지금은 통신할 수 없어요.',
  noComm: '이번 임무는 통신 금지예요.',
  used: '이번 임무의 통신은 이미 썼어요.',
  notChosen: '이번 임무는 사령관이 정한 사람만 통신할 수 있어요.',
  midTrick: '트릭 도중에는 통신할 수 없어요. 트릭이 끝난 뒤에 하세요.',
  noCard: '지금 손에 사실대로 알릴 수 있는 카드가 없어요.',
};

function communicate(room, id, card, token) {
  const p = getPlayer(room, id);
  if (!p) return { error: '플레이어가 아니에요.' };
  const why = commBlock(room, p);
  if (why === 'notYet') return { error: `통신은 ${def(room).commFrom}번째 트릭부터 할 수 있어요.` };
  if (why) return { error: COMM_ERR[why] };
  if (typeof card !== 'string' || !p.hand.includes(card)) return { error: '내 손에 없는 카드예요.' };
  if (suitOf(card) === 'r') return { error: '로켓은 통신할 수 없어요.' };
  if (!COMM_TOKENS.includes(token)) return { error: '표시를 고르세요.' };
  const truth = commTokenFor(p.hand, card);
  if (truth !== token) {
    return { error: truth ? `이 카드는 "${COMM_NAME[truth]}"로만 알릴 수 있어요.` : '이 카드는 그 색에서 가장 높지도, 낮지도, 하나뿐이지도 않아서 통신할 수 없어요.' };
  }
  p.signal = { card, token, used: false };
  p.commUsed = true;
  say(room, def(room).deadzone
    ? `📡 ${p.name}님이 통신했어요: ${cardName(card)} (잡음 때문에 표시는 안 보여요)`
    : `📡 ${p.name}님이 통신했어요: ${cardName(card)} — ${SUIT_NAME[suitOf(card)]} 중 ${COMM_NAME[token]}`);
  return {};
}

function play(room, id, card) {
  if (room.phase !== 'play') return { error: '지금은 카드를 낼 때가 아니에요.' };
  const p = room.players[room.turn];
  if (p.id !== id) return { error: '내 차례가 아니에요.' };
  if (typeof card !== 'string' || !p.hand.includes(card)) return { error: '내 손에 없는 카드예요.' };
  if (!legalCards(room, p).includes(card)) {
    return { error: `${SUIT_NAME[suitOf(room.trick.plays[0].card)]} 카드가 있으면 그 색을 내야 해요.` };
  }
  p.hand = p.hand.filter((c) => c !== card);
  if (p.signal && p.signal.card === card) p.signal.used = true;
  room.trick.plays.push({ id, card });
  room.played.push(card);
  const lead = room.trick.plays.length === 1;
  say(room, `🃏 ${p.name}님: ${cardName(card)}${lead ? ' (트릭 시작)' : ''}`);
  if (room.trick.plays.length < room.players.length) {
    room.turn = (room.turn + 1) % room.players.length;
    return {};
  }
  resolveTrick(room);
  return {};
}

// 순서 규칙을 어겼으면 이유를, 괜찮으면 null. T: 이번 트릭에서 완료되는 과제들(주인은 맞음)
// T의 과제들은 D+1..end번째 자리를 함께 차지하고, 그 안에서는 순서에 맞게 놓였다고 본다(원작: 먼저 나온 쪽과 상관없음).
function orderProblem(room, T) {
  const D = room.tasks.filter((t) => t.done).length;
  const end = D + T.length;
  const rest = room.tasks.filter((t) => !t.done && !T.includes(t));
  const omega = T.find((t) => t.token === 'O');
  if (omega && rest.length) return `Ω 과제(${cardName(omega.card)})가 마지막이 아닌데 완료됐어요.`;
  for (const t of T) {
    if (isNum(t.token)) {
      const k = Number(t.token);
      const last = omega ? end - 1 : end; // Ω가 함께면 맨 끝 자리는 Ω 몫
      if (k < D + 1 || k > last) {
        return T.length === 1
          ? `${k}번 과제(${cardName(t.card)})가 ${D + 1}번째로 완료됐어요.`
          : `${k}번 과제(${cardName(t.card)})가 ${D + 1}~${end}번째 과제들과 함께 완료돼서 순서가 안 맞아요.`;
      }
    }
    if (isArrow(t.token) && rest.some((r) => isArrow(r.token) && r.token.length < t.token.length)) {
      return `${TOKEN_NAME[t.token]} 과제(${cardName(t.card)})가 앞 순서 과제보다 먼저 완료됐어요.`;
    }
  }
  const skipped = rest.find((r) => isNum(r.token) && Number(r.token) <= end);
  if (skipped) return `${skipped.token}번 과제(${cardName(skipped.card)})보다 다른 과제가 먼저 완료됐어요.`;
  return null;
}

function resolveTrick(room) {
  const plays = room.trick.plays;
  const win = trickWinner(plays);
  const winner = getPlayer(room, win.id);
  winner.won += 1;
  room.trickNo += 1;
  room.lastTrick = { plays: plays.map((x) => ({ ...x })), winner: winner.id, no: room.trickNo };
  room.trick = null;
  say(room, `🏆 ${winner.name}님이 ${room.trickNo}번째 트릭을 가져갔어요 (${cardName(win.card)})`);
  const cards = plays.map((x) => x.card);
  const T = room.tasks.filter((t) => !t.done && cards.includes(t.card));
  const wrong = T.find((t) => t.owner !== winner.id);
  if (wrong) return endMission(room, false, `과제 ${cardName(wrong.card)}: ${nameOf(room, wrong.owner)}님이 이겨야 했는데 ${winner.name}님이 가져갔어요.`);
  if (T.length) {
    const bad = orderProblem(room, T);
    if (bad) return endMission(room, false, bad);
    T.forEach((t) => { t.done = true; t.trick = room.trickNo; });
    say(room, `✅ 과제 완료: ${T.map((t) => cardName(t.card)).join(', ')} (${room.tasks.filter((t) => t.done).length}/${room.tasks.length})`);
  }
  if (def(room).cmdFirst && room.trickNo === 1 && winner.id !== commander(room).id) {
    return endMission(room, false, '첫 트릭은 사령관이 이겨야 했어요.');
  }
  if (room.tasks.every((t) => t.done)) return endMission(room, true, '모든 과제를 완료했어요!');
  if (room.players.some((p) => !p.hand.length)) {
    return endMission(room, false, '카드가 다 떨어졌는데 끝내지 못한 과제가 있어요.');
  }
  room.turn = room.players.indexOf(winner);
  room.trick = { lead: room.turn, plays: [] };
  return undefined;
}

function endMission(room, ok, reason) {
  room.phase = 'result';
  room.trick = null;
  room.result = { ok, reason, mission: room.mission };
  if (ok) {
    room.cleared = Math.max(room.cleared, room.mission);
    room.settings.startMission = Math.min(room.mission + 1, MISSIONS.length);
    say(room, `🎉 임무 ${room.mission} 성공! ${reason}`);
  } else {
    say(room, `💥 임무 ${room.mission} 실패: ${reason}`);
  }
}

// 결과 화면에서: 성공이면 다음 임무, 실패면 같은 임무 다시
// 방장이 누른다. 방장 접속이 끊겼으면 누구나 누를 수 있다(방장 폰이 꺼져도 캠페인이 멈추지 않게).
function canNext(room, byId) {
  const host = getPlayer(room, room.hostId);
  return byId === room.hostId || (!!getPlayer(room, byId) && !(host && host.connected));
}
function next(room, byId) {
  if (!canNext(room, byId)) return { error: '방장만 다음으로 넘길 수 있어요.' };
  if (room.phase !== 'result') return { error: '아직 임무가 끝나지 않았어요.' };
  if (room.result.ok) {
    if (room.mission >= MISSIONS.length) {
      room.phase = 'over';
      room.settings.startMission = 1;
      say(room, `🌌 ${MISSIONS.length}개 임무를 모두 해냈어요! 대단한 승무원들이에요.`);
      return {};
    }
    room.mission += 1;
    room.attempt = 1;
  } else {
    room.attempt += 1;
  }
  startMission(room);
  return {};
}

// 방장: 멈춘 사람 대신 진행
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'choose') {
    const cmd = commander(room);
    const target = room.choose[0] === 'solo' ? room.players[(room.commander + 1) % room.players.length] : cmd;
    say(room, '방장이 사령관 대신 정했어요.');
    return choose(room, cmd.id, target.id);
  }
  if (room.phase === 'tasks') {
    const i = room.tasks.findIndex((t) => !t.owner);
    if (def(room).assign) {
      const n = room.players.length;
      const counts = (p) => room.tasks.filter((t) => t.owner === p.id).length;
      let target = null;
      for (let k = 0; k < n; k++) {
        const p = room.players[(room.commander + k) % n];
        if (!target || counts(p) < counts(target)) target = p;
      }
      say(room, '방장이 사령관 대신 과제를 나눠 줬어요.');
      return assignTask(room, commander(room).id, i, target.id);
    }
    say(room, `방장이 ${room.players[room.picker].name}님 대신 과제를 골랐어요.`);
    return pickTask(room, room.players[room.picker].id, i);
  }
  if (room.phase === 'play') {
    const p = room.players[room.turn];
    const legal = legalCards(room, p).sort((a, b) => (suitOf(a) === 'r') - (suitOf(b) === 'r') || valOf(a) - valOf(b) || SUIT_ORDER[suitOf(a)] - SUIT_ORDER[suitOf(b)]);
    say(room, `방장이 ${p.name}님 대신 가장 낮은 카드를 냈어요.`);
    return play(room, p.id, legal[0]);
  }
  if (room.phase === 'result') return next(room, byId);
  return { error: '지금은 넘길 게 없어요.' };
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  room.players = shuffle(room.players);
  const m = Number(room.settings.startMission) || 1;
  Object.assign(room, { mission: Math.min(Math.max(1, m), MISSIONS.length), attempt: 1, log: [], gameNo: room.gameNo + 1 });
  startMission(room);
  return {};
}

function clearGame(room) {
  room.players.forEach((p) => { p.hand = []; p.won = 0; p.signal = null; p.commUsed = false; });
  Object.assign(room, { tasks: [], choose: [], commPlayer: null, trick: null, trickNo: 0, lastTrick: null, played: [], result: null });
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  room.players = room.players.filter((p) => p.connected);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  // 진행 중이던 임무부터 이어서 할 수 있게 시작 임무를 맞춰 둔다 (성공했다면 이미 다음 임무로 맞춰져 있다)
  if (room.phase !== 'over' && !(room.phase === 'result' && room.result && room.result.ok)) room.settings.startMission = room.mission;
  clearGame(room);
  Object.assign(room, { phase: 'lobby', log: [] });
  return {};
}

// 같은 멤버로: 진행 중이면 지금 임무를 새로 섞어서, 성공 화면이면 다음 임무로, 캠페인을 다 깼으면 1번 임무부터
function restart(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '대기실에서는 "게임 시작"을 누르세요.' };
  if (room.players.length < MIN_PLAYERS || room.players.some((p) => !p.connected)) {
    return { error: '접속이 끊긴 사람이 있어요. 대기실로 돌아가서 정리하세요.' };
  }
  if (room.phase === 'result' && room.result && room.result.ok) return next(room, byId);
  if (room.phase === 'over') {
    room.mission = 1;
    room.attempt = 1;
    room.gameNo += 1;
    room.log = [];
  } else {
    room.attempt += 1;
  }
  clearGame(room);
  startMission(room);
  return {};
}

// ---- 각자에게 보여줄 상태 ----

function missionSummary(d, i) {
  return {
    no: i + 1, n: d.n, title: d.title, story: d.story, tokens: d.tokens || [],
    noComm: !!d.noComm, deadzone: !!d.deadzone, commFrom: d.commFrom || 0, cmdFirst: !!d.cmdFirst,
    assign: !!d.assign, solo: !!d.solo, commOne: !!d.commOne,
  };
}

function viewFor(room, viewerId) {
  upgrade(room);
  const started = room.phase !== 'lobby';
  const me = getPlayer(room, viewerId);
  const d = def(room);
  const cmd = started && room.phase !== 'over' ? commander(room) : null;
  const playing = room.phase === 'play';
  const turnP = playing ? room.players[room.turn] : null;
  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (room.phase === 'over') mode = 'over';
  else if (room.phase === 'result') mode = 'result';
  else if (room.phase === 'choose') mode = cmd.id === viewerId ? 'choose' : 'wait';
  else if (room.phase === 'tasks') {
    if (d.assign) mode = cmd.id === viewerId ? 'assign' : 'wait';
    else mode = room.players[room.picker].id === viewerId ? 'pick' : 'wait';
  } else if (playing && turnP.id === viewerId) mode = 'play';

  const block = me ? commBlock(room, me) : 'phase';
  return {
    kind: 'crew',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    settings: { startMission: room.settings.startMission },
    missions: started ? null : MISSIONS.map(missionSummary),
    missionCount: MISSIONS.length,
    mission: room.mission,
    missionInfo: started ? missionSummary(d, room.mission - 1) : null,
    attempt: room.attempt,
    tries: room.tries,
    cleared: room.cleared,
    commanderId: cmd ? cmd.id : null,
    choosing: room.phase === 'choose' ? room.choose[0] : null,
    commPlayerId: room.commPlayer,
    pickerId: room.phase === 'tasks' && !d.assign ? room.players[room.picker].id : null,
    assignCap: room.phase === 'tasks' && d.assign ? assignCap(room) : null,
    assignable: room.phase === 'tasks' && d.assign ? room.players.filter((p) => canAssign(room, p.id)).map((p) => p.id) : null,
    canNext: room.phase === 'result' && canNext(room, viewerId),
    tasks: room.tasks.map((t) => ({ card: t.card, token: t.token, owner: t.owner, done: t.done, trick: t.trick })),
    turnId: turnP ? turnP.id : null,
    trick: room.trick ? { leadId: room.players[room.trick.lead].id, plays: room.trick.plays.map((x) => ({ ...x })) } : null,
    trickNo: room.trickNo,
    totalTricks: Math.floor(DECK.length / Math.max(1, room.players.length)),
    lastTrick: room.lastTrick ? { plays: room.lastTrick.plays.map((x) => ({ ...x })), winnerId: room.lastTrick.winner, no: room.lastTrick.no } : null,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      count: p.hand.length,
      won: p.won,
      commUsed: p.commUsed,
      // 통신 방해 임무에서는 표시(가장 높아요 등)를 본인만 본다
      signal: p.signal ? { card: p.signal.card, token: d.deadzone && p.id !== viewerId ? null : p.signal.token, used: p.signal.used } : null,
    })),
    hand: me ? me.hand.slice() : [],
    legal: mode === 'play' ? legalCards(room, me) : [],
    commBlock: block,
    commOptions: me && !block ? me.hand.map((c) => ({ card: c, token: commTokenFor(me.hand, c) })).filter((x) => x.token) : [],
    result: room.result,
    log: room.log,
  };
}

const rawActions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  setting: (room, id, msg) => setSetting(room, id, msg.key, msg.value),
  choose: (room, id, msg) => choose(room, id, msg.target),
  pick: (room, id, msg) => pickTask(room, id, Number(msg.index)),
  assign: (room, id, msg) => assignTask(room, id, Number(msg.index), msg.target),
  comm: (room, id, msg) => communicate(room, id, msg.card, msg.token),
  play: (room, id, msg) => play(room, id, msg.card),
  next: (room, id) => next(room, id),
};
const actions = {};
Object.entries(rawActions).forEach(([k, fn]) => {
  actions[k] = (room, id, msg) => { upgrade(room); return fn(room, id, msg || {}); };
});

module.exports = {
  actions,
  afterDisconnect: () => {},
  MIN_PLAYERS,
  MAX_PLAYERS,
  DECK,
  TASK_DECK,
  MISSIONS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  setSetting,
  start,
  backToLobby,
  restart,
  startMission,
  choose,
  pickTask,
  assignTask,
  communicate,
  play,
  next,
  force,
  viewFor,
  legalCards,
  trickWinner,
  commTokenFor,
  commBlock,
  orderProblem,
  canAssign,
  sortHand,
};
