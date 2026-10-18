'use strict';
// 부루마블(씨앗사 "부루마불" 원판 기준) 규칙 엔진, 2~6명.
//
// 돈은 모두 "천원" 단위 정수로 다룬다(통행료 2천원 같은 값이 있어서). 화면에서 "1만2천"처럼 바꿔 보여 준다.
//
// 보드는 원판과 같은 40칸: 출발(0) · 무인도(10) · 사회복지기금 수령처(20) · 우주여행(30) 모서리와
// 도시 23곳 · 특수지역 3곳(제주도·부산·서울) · 탈것 3곳(콩코드 여객기·퀸 엘리자베스호·컬럼비아호) ·
// 황금열쇠 6곳 · 사회복지기금 접수처(38).
// 도시 가격·통행료·건설비는 원판 땅 카드 값(나무위키 "부루마불/주요 카드" 정리)을 그대로 쓴다.
//
// 진행: 주사위 2개를 굴려 이동 → 도착한 칸 처리 → (더블이면 한 번 더, 3번 연속 더블이면 무인도).
//   빈 땅: 구입. 내 도시에 다시 도착: 별장 1채 → 별장 2채 → 빌딩 → 호텔 순서로 하나씩 건설.
//   남의 땅: 통행료(우대권이 있으면 한 번 면제). 특수지역·탈것은 건물을 못 짓고 통행료가 정해져 있다.
//   출발을 지나면 월급 20만. 무인도: 3턴 쉬기(더블이 나오거나 무전기 카드가 있으면 탈출).
//   사회복지기금 접수처에서 15만을 내고, 수령처에 도착한 사람이 모인 기금을 모두 가져간다.
//   우주여행: 다음 차례에 원하는 칸으로 간다. 컬럼비아호 주인이 따로 있으면 탑승료 20만을 낸다.
//   돈이 모자라면 땅을 팔아(들인 돈의 절반) 갚고, 못 갚으면 파산.
// 종료: 한 명만 남거나, 방장이 정한 바퀴 수가 지나면 자산(현금+땅/건물 값)이 가장 많은 사람이 승리.

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const MAN = 10; // 1만원 = 10 (천원 단위)
const START_CASH = 293 * MAN; // 원판 기본 지급액(50만×3, 10만×10, 5만·2만·1만·5천·1천×5)
const START_CASH_2P = 2 * START_CASH; // 2명이면 2배
const SALARY = 20 * MAN;
const WELFARE_FEE = 15 * MAN;
const SPACE_FARE = 20 * MAN; // 우주여행 때 컬럼비아호 주인에게 내는 탑승료
const ISLAND_WAIT = 3;
const BOARD = 40;
const ISLAND = 10;
const FUND_COLLECT = 20;
const SPACE = 30;
const ROUND_CHOICES = [0, 15, 20, 30]; // 0 = 무제한
const DEFAULT_ROUNDS = 20;
const LOG_KEEP = 14;
const COLORS = ['#e8433a', '#2f7de1', '#27a35a', '#f2b51d', '#9b5de5', '#ff7a1a'];
const LEVEL_NAME = ['땅', '별장 1채', '별장 2채', '빌딩', '호텔'];
const BUILT_NAME = ['', '별장', '별장', '빌딩', '호텔'];
const MAX_LEVEL = 4;

const m = (v) => Math.round(v * MAN);
// 도시: 이름, 대륙, 땅값, 통행료[땅, 별장1, 별장2, 빌딩, 호텔], 건설비[별장, 빌딩, 호텔] (모두 만원)
const CITY = (name, region, price, tolls, costs) => ({
  type: 'city', name, region, price: m(price), tolls: tolls.map(m), costs: costs.map(m),
});
// 특수지역/탈것: 건물 없이 통행료가 정해진 땅
const SPECIAL = (name, region, price, toll, kind) => ({ type: kind, name, region, price: m(price), toll: m(toll) });
const KEY = { type: 'key', name: '황금열쇠' };
const ASIA_LOW = [5, 15, 25];
const EU_MID = [10, 30, 50];
const HIGH = [15, 45, 75];
const TOP = [20, 60, 100];

const TILES = [
  { type: 'start', name: '출발' },
  CITY('타이베이', '아시아', 5, [0.2, 1, 3, 9, 25], ASIA_LOW),
  KEY,
  CITY('베이징', '아시아', 8, [0.4, 2, 6, 18, 45], ASIA_LOW),
  CITY('마닐라', '아시아', 8, [0.4, 2, 6, 18, 45], ASIA_LOW),
  SPECIAL('제주도', '대한민국', 20, 30, 'special'),
  CITY('싱가포르', '아시아', 10, [0.6, 3, 9, 27, 55], ASIA_LOW),
  KEY,
  CITY('카이로', '아프리카', 10, [0.6, 3, 9, 27, 55], ASIA_LOW),
  CITY('이스탄불', '유럽', 12, [0.8, 4, 10, 30, 60], ASIA_LOW),
  { type: 'island', name: '무인도' },
  CITY('아테네', '유럽', 14, [1, 5, 15, 45, 75], EU_MID),
  KEY,
  CITY('코펜하겐', '유럽', 16, [1.2, 6, 18, 50, 90], EU_MID),
  CITY('스톡홀름', '유럽', 16, [1.2, 6, 18, 50, 90], EU_MID),
  SPECIAL('콩코드 여객기', '탈것', 20, 30, 'ride'),
  CITY('베른', '유럽', 18, [1.4, 7, 20, 55, 95], EU_MID),
  KEY,
  CITY('베를린', '유럽', 18, [1.4, 7, 20, 55, 95], EU_MID),
  CITY('오타와', '북아메리카', 20, [1.6, 8, 22, 60, 100], EU_MID),
  { type: 'fundcollect', name: '사회복지기금 수령처' },
  CITY('부에노스아이레스', '남아메리카', 22, [1.8, 9, 25, 70, 105], [15, 40, 75]),
  KEY,
  CITY('상파울루', '남아메리카', 24, [2, 10, 30, 75, 110], HIGH),
  CITY('시드니', '오세아니아', 24, [2, 10, 30, 75, 110], HIGH),
  SPECIAL('부산', '대한민국', 50, 60, 'special'),
  CITY('하와이', '북아메리카', 26, [2.2, 11, 33, 80, 115], HIGH),
  CITY('리스본', '유럽', 26, [2.2, 11, 33, 80, 115], HIGH),
  SPECIAL('퀸 엘리자베스호', '탈것', 30, 25, 'ride'),
  CITY('마드리드', '유럽', 28, [2.4, 12, 36, 85, 120], HIGH),
  { type: 'space', name: '우주여행' },
  CITY('도쿄', '아시아', 30, [2.6, 13, 39, 90, 127], TOP),
  SPECIAL('컬럼비아호', '탈것', 45, 40, 'ride'),
  CITY('파리', '유럽', 32, [2.8, 15, 45, 100, 140], TOP),
  CITY('로마', '유럽', 32, [2.8, 15, 45, 100, 140], TOP),
  KEY,
  CITY('런던', '유럽', 35, [3.5, 17, 50, 110, 150], TOP),
  CITY('뉴욕', '북아메리카', 35, [3.5, 17, 50, 110, 150], TOP),
  { type: 'fundpay', name: '사회복지기금 접수처' },
  SPECIAL('서울', '대한민국', 100, 200, 'special'),
].map((t, i) => ({ i, ...t }));

const OWNABLE = new Set(['city', 'special', 'ride']);
const idx = (name) => TILES.find((t) => t.name === name).i;
const COLUMBIA = idx('컬럼비아호');

// 황금열쇠 30장 (원판 카드 종류를 따름)
const KEYS = [
  { id: 'nobel', text: '노벨평화상 수상! 상금 30만원을 받으세요.', gain: 30 },
  { id: 'lottery', text: '복권 당첨! 20만원을 받으세요.', gain: 20 },
  { id: 'race', text: '자동차 경주 우승! 상금 10만원을 받으세요.', gain: 10 },
  { id: 'scholar', text: '장학금 혜택! 10만원을 받으세요.', gain: 10 },
  { id: 'pension', text: '연금 혜택! 5만원을 받으세요.', gain: 5 },
  { id: 'abroad', text: '해외 유학! 학비 10만원을 내세요.', pay: 10 },
  { id: 'hospital', text: '병원비 5만원을 내세요.', pay: 5 },
  { id: 'speeding', text: '과속 운전 벌금 5만원을 내세요.', pay: 5 },
  { id: 'incomeTax', text: '정기 종합소득세! 건물마다 호텔 15만, 빌딩 10만, 별장 3만원을 내세요.', perBuilding: [3, 10, 15] },
  { id: 'repair', text: '건물 수리비! 건물마다 호텔 10만, 빌딩 6만, 별장 3만원을 내세요.', perBuilding: [3, 6, 10] },
  { id: 'security', text: '방범비! 건물마다 호텔 5만, 빌딩 3만, 별장 1만원을 내세요.', perBuilding: [1, 3, 5] },
  { id: 'halfSale', text: '반액 대매출! 가진 땅 중 가장 비싼 곳을 반값에 은행에 팔아요.' },
  { id: 'escape', text: '무인도 탈출용 무전기! 가지고 있다가 무인도에서 쓰세요.', keep: 'escape' },
  { id: 'escape2', text: '무인도 탈출용 무전기! 가지고 있다가 무인도에서 쓰세요.', keep: 'escape' },
  { id: 'pass', text: '우대권! 다음에 낼 통행료 한 번이 면제돼요.', keep: 'pass' },
  { id: 'pass2', text: '우대권! 다음에 낼 통행료 한 번이 면제돼요.', keep: 'pass' },
  { id: 'back2', text: '뒤로 두 칸 가세요.', back: 2 },
  { id: 'back3', text: '뒤로 세 칸 가세요.', back: 3 },
  { id: 'jeju', text: '관광 여행! 제주도로 가세요.', go: '제주도' },
  { id: 'busan', text: '관광 여행! 부산으로 가세요.', go: '부산' },
  { id: 'seoul', text: '관광 여행! 서울로 가세요. 서울 올림픽 구경!', go: '서울' },
  { id: 'island', text: '무인도로 가세요! (출발을 지나도 월급은 없어요)' },
  { id: 'fund', text: '사회복지기금 배당! 수령처로 가서 기금을 받으세요.', go: '사회복지기금 수령처' },
  { id: 'world', text: '세계 일주 초대권! 한 바퀴 돌아 제자리로. 월급과 사회복지기금을 받아요.' },
  { id: 'space', text: '우주여행 초청장! 우주여행 칸으로 가요. 컬럼비아호 탑승료는 면제!' },
  { id: 'cruise', text: '퀸 엘리자베스호를 타고 베이징으로! (주인이 있으면 배삯을 내요)', via: '퀸 엘리자베스호', go: '베이징' },
  { id: 'flight', text: '콩코드 여객기를 타고 타이베이로! (주인이 있으면 비행기삯을 내요)', via: '콩코드 여객기', go: '타이베이' },
  { id: 'highway', text: '고속도로! 출발지로 가서 월급을 받으세요.', go: '출발' },
  { id: 'highway2', text: '고속도로! 출발지로 가서 월급을 받으세요.', go: '출발' },
  { id: 'birthday', text: '생일 축하합니다! 모두에게 1만원씩 축하금을 받으세요.' },
];

const roll1 = () => crypto.randomInt(1, 7);

// 예전(32칸) 규칙으로 저장된 방이 되살아나면 대기실로 돌려 새 판으로 시작하게 한다
const VERSION = 2;
function upgrade(room) {
  if (room.v === VERSION) return;
  room.v = VERSION;
  if (!ROUND_CHOICES.includes(room.settings && room.settings.maxRounds)) room.settings = { maxRounds: DEFAULT_ROUNDS };
  if (room.phase !== 'lobby') {
    Object.assign(room, { phase: 'lobby', owners: {}, pending: null, winnerIds: [], log: [], dice: null, fund: 0, extra: false, move: null, lastKey: null });
  }
}

function createRoom(code) {
  return {
    kind: 'marble',
    v: VERSION,
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    settings: { maxRounds: DEFAULT_ROUNDS },
    owners: {}, // tile index -> { owner: id, level }
    turn: 0,
    round: 1,
    dice: null,
    diceBy: null,
    doubles: 0, // 이번 턴 연속 더블 횟수
    extra: false, // 더블로 한 번 더 굴릴 수 있는지
    fund: 0,
    keyDeck: [],
    keyDiscard: [],
    pending: null,
    winnerIds: [],
    log: [],
    lastKey: null,
    move: null, // 화면 애니메이션용: 마지막 움직임 { seq, who, dice, segs }
    moveSeq: 0,
    lastActive: Date.now(),
  };
}

function addPlayer(room, rawName) {
  const name = cleanName(rawName);
  if (!name) return { error: '이름을 입력하세요.' };
  if (room.phase !== 'lobby') return { error: '이미 게임이 시작됐어요.' };
  if (room.players.length >= MAX_PLAYERS) return { error: `방이 가득 찼어요. (${MAX_PLAYERS}명)` };
  if (room.players.some((p) => p.name === name)) return { error: '같은 이름이 이미 있어요. 다른 이름을 쓰세요.' };
  const player = {
    id: newId(), token: newToken(), name, connected: true,
    color: '', pos: 0, cash: 0, bankrupt: false, jail: false, jailTurns: 0, escape: 0, pass: 0, warp: false, freeWarp: false,
  };
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
  if (key !== 'maxRounds' || !ROUND_CHOICES.includes(value)) return { error: '알 수 없는 설정이에요.' };
  room.settings.maxRounds = value;
  return {};
}

// ---- 도우미 ----

const cur = (room) => room.players[room.turn];
const alive = (room) => room.players.filter((p) => !p.bankrupt);

// 10 → "1만", 12 → "1만2천", 2 → "2천", 2930 → "293만"
function won(k) {
  const neg = k < 0;
  const a = Math.abs(k);
  const man = Math.floor(a / MAN);
  const ch = a % MAN;
  const s = man && ch ? `${man}만${ch}천` : man ? `${man}만` : `${ch}천`;
  return `${neg ? '-' : ''}${a === 0 ? '0' : s}원`;
}

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

// 다음 단계(level → level+1)를 짓는 비용
function buildCost(tile, level) {
  if (tile.type !== 'city' || level >= MAX_LEVEL) return null;
  return tile.costs[[0, 0, 1, 2][level]];
}
function invested(tile, level) {
  let sum = tile.price;
  for (let l = 0; l < level; l++) sum += buildCost(tile, l);
  return sum;
}
const sellValue = (tile, level) => Math.floor(invested(tile, level) / 2);

function propsOf(room, p) {
  return Object.keys(room.owners).map(Number).filter((i) => room.owners[i].owner === p.id).sort((a, b) => a - b);
}
const netWorth = (room, p) => p.cash + propsOf(room, p).reduce((n, i) => n + invested(TILES[i], room.owners[i].level), 0);
const assetValue = (room, p) => propsOf(room, p).reduce((n, i) => n + sellValue(TILES[i], room.owners[i].level), 0);

function tollOf(room, i) {
  const tile = TILES[i];
  const o = room.owners[i];
  if (!o) return 0;
  return tile.type === 'city' ? tile.tolls[o.level] : tile.toll;
}

// ---- 돈 주고받기 / 파산 ----

// 계속할 일: 'done'(칸 처리 끝) | { goto: 칸, fly?: true }(돈을 낸 뒤 그 칸으로 이동)
function continueAfter(room, cont) {
  if (room.phase !== 'play') return;
  if (cont && cont.goto !== undefined) {
    const p = cur(room);
    if (cont.fly) flyTo(room, p, cont.goto);
    else walkTo(room, p, cont.goto);
  } else endAction(room);
}

function transfer(room, p, amount, creditor) {
  p.cash -= amount;
  if (creditor === 'fund') room.fund += amount;
  else if (creditor && creditor !== 'bank') getPlayer(room, creditor).cash += amount;
}

function settle(room, p, amount, creditor, cont) {
  if (p.cash >= amount) {
    transfer(room, p, amount, creditor);
    continueAfter(room, cont);
    return;
  }
  if (p.cash + assetValue(room, p) < amount) {
    say(room, `${p.name}님이 ${won(amount)}을 갚을 수 없어 파산했어요!`);
    goBankrupt(room, p, creditor);
    return;
  }
  room.pending = { t: 'debt', who: p.id, amount, creditor, cont };
  say(room, `${p.name}님은 ${won(amount - p.cash)}이 모자라요. 땅을 팔아 갚아야 해요.`);
}

function goBankrupt(room, p, creditor) {
  p.bankrupt = true;
  if (creditor && creditor !== 'bank' && creditor !== 'fund') getPlayer(room, creditor).cash += Math.max(0, p.cash);
  if (creditor === 'fund') room.fund += Math.max(0, p.cash);
  p.cash = 0;
  p.jail = false;
  p.warp = false;
  for (; p.escape > 0; p.escape--) returnCard(room, 'escape');
  for (; p.pass > 0; p.pass--) returnCard(room, 'pass');
  propsOf(room, p).forEach((i) => { delete room.owners[i]; });
  room.pending = null;
  const left = alive(room);
  if (left.length === 1) {
    finish(room, [left[0].id], '다른 모두가 파산했어요.');
    return;
  }
  endAction(room);
}

function finish(room, winnerIds, why) {
  room.phase = 'over';
  room.pending = null;
  room.winnerIds = winnerIds;
  say(room, `게임 끝! ${why}`);
}

// ---- 이동 ----

function beginMove(room, p, dice) {
  room.moveSeq = (room.moveSeq || 0) + 1;
  room.move = { seq: room.moveSeq, who: p.id, dice: dice || null, segs: [] };
}
function seg(room, s) {
  if (room.move) room.move.segs.push(s);
}

function paySalary(room, p) {
  p.cash += SALARY;
  say(room, `${p.name}님이 출발을 지나 월급 ${won(SALARY)}을 받았어요.`);
}

// 앞(+)이나 뒤(-)로 한 칸씩 걸어간다. 앞으로 가다 출발을 지나거나 밟으면 월급.
function stepMove(room, p, steps, { land = true } = {}) {
  const from = p.pos;
  const raw = from + steps;
  seg(room, { k: 'walk', from, n: steps });
  if (steps > 0 && raw >= BOARD) paySalary(room, p);
  p.pos = ((raw % BOARD) + BOARD) % BOARD;
  if (land) resolveLanding(room, p);
}

// 정해진 칸까지 앞으로 걸어간다(황금열쇠 여행 등)
function walkTo(room, p, dest, opts) {
  const n = (dest - p.pos + BOARD) % BOARD;
  if (n === 0) {
    resolveLanding(room, p);
    return;
  }
  stepMove(room, p, n, opts);
}

// 걸어가지 않고 바로 날아간다(우주여행). 출발을 지나면 월급.
function flyTo(room, p, dest) {
  seg(room, { k: 'fly', from: p.pos, to: dest });
  if (dest < p.pos) paySalary(room, p);
  p.pos = dest;
  resolveLanding(room, p);
}

// 무인도로 바로 보낸다(월급 없음)
function sendToIsland(room, p, why) {
  seg(room, { k: 'jump', from: p.pos, to: ISLAND });
  p.pos = ISLAND;
  say(room, `🏝️ ${p.name}님이 ${why} 무인도에 갇혔어요! (3턴 쉬기)`);
  p.jail = true;
  p.jailTurns = 0;
  room.extra = false;
  endAction(room);
}

// 남의 땅 통행료: 우대권이 있으면 한 번 면제
function payToll(room, p, i, cont) {
  const tile = TILES[i];
  const o = room.owners[i];
  const toll = tollOf(room, i);
  const owner = getPlayer(room, o.owner);
  if (p.pass > 0) {
    p.pass -= 1;
    returnCard(room, 'pass');
    say(room, `🎫 ${p.name}님이 우대권으로 ${tile.name} 통행료 ${won(toll)}을 면제받았어요!`);
    continueAfter(room, cont);
    return;
  }
  say(room, `💸 ${p.name}님이 ${tile.name}에서 ${owner.name}님에게 통행료 ${won(toll)}을 내요.`);
  settle(room, p, toll, o.owner, cont);
}

function resolveLanding(room, p) {
  const tile = TILES[p.pos];
  const o = room.owners[p.pos];
  if (OWNABLE.has(tile.type)) {
    if (!o) {
      if (p.cash >= tile.price) room.pending = { t: 'buy', who: p.id, tile: p.pos };
      else {
        say(room, `${p.name}님이 ${tile.name}에 도착했지만 돈이 모자라 살 수 없어요.`);
        endAction(room);
      }
    } else if (o.owner === p.id) {
      const cost = buildCost(tile, o.level);
      if (cost !== null && p.cash >= cost) room.pending = { t: 'build', who: p.id, tile: p.pos };
      else endAction(room);
    } else {
      payToll(room, p, p.pos, 'done');
    }
    return;
  }
  switch (tile.type) {
    case 'key':
      drawKey(room, p);
      break;
    case 'island':
      say(room, `🏝️ ${p.name}님이 무인도에 도착했어요! (3턴 쉬기)`);
      p.jail = true;
      p.jailTurns = 0;
      room.extra = false;
      endAction(room);
      break;
    case 'fundpay':
      say(room, `${p.name}님이 사회복지기금 ${won(WELFARE_FEE)}을 내요.`);
      settle(room, p, WELFARE_FEE, 'fund', 'done');
      break;
    case 'fundcollect':
      collectFund(room, p);
      endAction(room);
      break;
    case 'space':
      say(room, `🚀 ${p.name}님이 우주여행 칸에 도착! 다음 차례에 원하는 곳으로 날아가요.`);
      p.warp = true;
      room.extra = false;
      endAction(room);
      break;
    default:
      endAction(room);
  }
}

function collectFund(room, p) {
  if (room.fund > 0) {
    say(room, `🎉 ${p.name}님이 사회복지기금 ${won(room.fund)}을 모두 받았어요!`);
    p.cash += room.fund;
    room.fund = 0;
  } else {
    say(room, '사회복지기금이 비어 있어요.');
  }
}

// ---- 황금열쇠 ----

// 가지고 있던 카드(무전기/우대권)를 쓰면 버린 카드 더미로 돌려보낸다. 저장/복원 뒤에도 맞도록 id로 비교한다.
function returnCard(room, keep) {
  const inPlay = new Set([...room.keyDeck, ...room.keyDiscard].map((k) => k.id));
  const card = KEYS.find((k) => k.keep === keep && !inPlay.has(k.id));
  if (card) room.keyDiscard.push(card);
}

function buildingCount(room, p) {
  const c = { villa: 0, building: 0, hotel: 0 };
  propsOf(room, p).forEach((i) => {
    const l = room.owners[i].level;
    if (l === 1) c.villa += 1;
    else if (l === 2) c.villa += 2;
    else if (l === 3) c.building += 1;
    else if (l === 4) c.hotel += 1;
  });
  return c;
}

function drawKey(room, p) {
  if (room.keyDeck.length === 0) {
    room.keyDeck = shuffle(room.keyDiscard);
    room.keyDiscard = [];
  }
  const card = room.keyDeck.pop();
  if (!card.keep) room.keyDiscard.push(card);
  room.lastKey = { by: p.id, id: card.id, text: card.text, seq: room.move ? room.move.seq : 0 };
  say(room, `🔑 ${p.name}님의 황금열쇠: ${card.text}`);

  if (card.gain) {
    p.cash += m(card.gain);
    endAction(room);
  } else if (card.pay) {
    settle(room, p, m(card.pay), 'bank', 'done');
  } else if (card.perBuilding) {
    const c = buildingCount(room, p);
    const [v, b, h] = card.perBuilding;
    const amount = m(c.villa * v + c.building * b + c.hotel * h);
    if (amount === 0) {
      say(room, `${p.name}님은 건물이 없어서 낼 돈이 없어요.`);
      endAction(room);
    } else settle(room, p, amount, 'bank', 'done');
  } else if (card.keep) {
    p[card.keep] += 1;
    endAction(room);
  } else if (card.back) {
    stepMove(room, p, -card.back);
  } else if (card.via) {
    // 탈것을 거쳐서 간다: 탈것 주인이 남이면 삯을 내고, 이어서 목적지로
    walkTo(room, p, idx(card.via), { land: false });
    const vi = idx(card.via);
    const o = room.owners[vi];
    if (o && o.owner !== p.id) payToll(room, p, vi, { goto: idx(card.go) });
    else continueAfter(room, { goto: idx(card.go) });
  } else if (card.go) {
    walkTo(room, p, idx(card.go));
  } else {
    switch (card.id) {
      case 'island':
        sendToIsland(room, p, '황금열쇠로');
        break;
      case 'world':
        stepMove(room, p, BOARD, { land: false });
        collectFund(room, p);
        endAction(room);
        break;
      case 'space':
        p.freeWarp = true;
        walkTo(room, p, SPACE);
        break;
      case 'halfSale': {
        const mine = propsOf(room, p);
        if (!mine.length) {
          say(room, `${p.name}님은 땅이 없어서 그냥 넘어가요.`);
        } else {
          const best = mine.reduce((a, b) => (invested(TILES[b], room.owners[b].level) > invested(TILES[a], room.owners[a].level) ? b : a));
          const value = sellValue(TILES[best], room.owners[best].level);
          p.cash += value;
          delete room.owners[best];
          say(room, `${p.name}님이 ${TILES[best].name}을(를) 반값 ${won(value)}에 은행에 팔았어요.`);
        }
        endAction(room);
        break;
      }
      case 'birthday':
        alive(room).filter((q) => q.id !== p.id).forEach((q) => {
          const give = Math.min(MAN, q.cash);
          q.cash -= give;
          p.cash += give;
        });
        endAction(room);
        break;
      default:
        endAction(room);
    }
  }
}

// 칸 처리가 모두 끝난 뒤: 더블이면 다시 굴리고, 아니면 다음 사람
function endAction(room) {
  if (room.phase !== 'play') return;
  const p = cur(room);
  room.pending = null;
  if (room.extra && !p.bankrupt && !p.jail && !p.warp) {
    room.extra = false;
    return; // 같은 사람이 다시 굴린다
  }
  nextTurn(room);
}

function nextTurn(room) {
  const n = room.players.length;
  let i = room.turn;
  do {
    i = (i + 1) % n;
  } while (room.players[i].bankrupt);
  if (i <= room.turn) {
    // 순서가 한 바퀴 돌았다 (파산자를 건너뛰어도 한 번만 센다)
    room.round += 1;
    if (room.settings.maxRounds && room.round > room.settings.maxRounds) {
      const best = Math.max(...alive(room).map((p) => netWorth(room, p)));
      finish(room, alive(room).filter((p) => netWorth(room, p) === best).map((p) => p.id), `${room.settings.maxRounds}바퀴가 지났어요. 자산이 가장 많은 사람이 승리!`);
      return;
    }
  }
  room.turn = i;
  room.doubles = 0;
  room.extra = false;
  const p = cur(room);
  say(room, `▶ ${p.name}님의 차례`);
  if (p.warp) room.pending = { t: 'warp', who: p.id };
}

// ---- 행동 ----

function checkRoll(room, id) {
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  if (room.pending) return { error: '먼저 처리할 일이 있어요.' };
  if (cur(room).id !== id) return { error: '내 차례가 아니에요.' };
  return null;
}

function roll(room, id) {
  const bad = checkRoll(room, id);
  if (bad) return bad;
  const p = cur(room);
  if (p.jail && p.jailTurns >= ISLAND_WAIT) {
    p.jail = false;
    say(room, `${p.name}님이 3턴을 쉬고 무인도에서 나왔어요.`);
  }
  const [d1, d2] = room.rigged && room.rigged.length ? room.rigged.shift() : [roll1(), roll1()]; // rigged는 테스트용
  room.dice = [d1, d2];
  room.diceBy = p.id;
  beginMove(room, p, [d1, d2]);
  const dbl = d1 === d2;
  say(room, `🎲 ${p.name}님: ${d1} + ${d2} = ${d1 + d2}${dbl ? ' (더블!)' : ''}`);
  if (p.jail) {
    if (dbl) {
      p.jail = false;
      room.extra = false;
      say(room, `${p.name}님이 더블로 무인도를 탈출했어요!`);
      stepMove(room, p, d1 + d2);
    } else {
      p.jailTurns += 1;
      say(room, `${p.name}님은 무인도에서 쉬어요. (${p.jailTurns}/${ISLAND_WAIT})`);
      endAction(room);
    }
    return {};
  }
  if (dbl) {
    room.doubles += 1;
    if (room.doubles >= 3) {
      sendToIsland(room, p, '3번 연속 더블이라');
      return {};
    }
    room.extra = true;
  }
  stepMove(room, p, d1 + d2);
  return {};
}

function useEscape(room, id) {
  const bad = checkRoll(room, id);
  if (bad) return bad;
  const p = cur(room);
  if (!p.jail) return { error: '무인도에 있지 않아요.' };
  if (p.escape < 1) return { error: '무전기 카드가 없어요.' };
  p.escape -= 1;
  p.jail = false;
  returnCard(room, 'escape');
  say(room, `📻 ${p.name}님이 무전기로 구조를 요청해 무인도에서 나왔어요!`);
  return {};
}

function expectPending(room, id, type) {
  const pd = room.pending;
  if (!pd || pd.t !== type || pd.who !== id) return null;
  return pd;
}

function buy(room, id) {
  const pd = expectPending(room, id, 'buy');
  if (!pd) return { error: '지금은 살 수 없어요.' };
  const p = getPlayer(room, id);
  const tile = TILES[pd.tile];
  if (p.cash < tile.price) return { error: '돈이 모자라요.' };
  p.cash -= tile.price;
  room.owners[pd.tile] = { owner: id, level: 0 };
  say(room, `🏳️ ${p.name}님이 ${tile.name}을(를) ${won(tile.price)}에 샀어요.`);
  room.pending = null;
  endAction(room);
  return {};
}

function build(room, id) {
  const pd = expectPending(room, id, 'build');
  if (!pd) return { error: '지금은 지을 수 없어요.' };
  const p = getPlayer(room, id);
  const tile = TILES[pd.tile];
  const o = room.owners[pd.tile];
  const cost = buildCost(tile, o.level);
  if (cost === null) return { error: '더 지을 수 없어요.' };
  if (p.cash < cost) return { error: '돈이 모자라요.' };
  p.cash -= cost;
  o.level += 1;
  say(room, `🏗️ ${p.name}님이 ${tile.name}에 ${BUILT_NAME[o.level]}을(를) 지었어요. (${won(cost)})`);
  room.pending = null;
  endAction(room);
  return {};
}

function skip(room, id) {
  const pd = room.pending;
  if (!pd || pd.who !== id || !['buy', 'build'].includes(pd.t)) return { error: '건너뛸 게 없어요.' };
  room.pending = null;
  endAction(room);
  return {};
}

function sell(room, id, tileIdx) {
  const pd = expectPending(room, id, 'debt');
  if (!pd) return { error: '지금은 땅을 팔 때가 아니에요.' };
  const p = getPlayer(room, id);
  const o = room.owners[tileIdx];
  if (!o || o.owner !== id) return { error: '내 땅이 아니에요.' };
  const value = sellValue(TILES[tileIdx], o.level);
  p.cash += value;
  delete room.owners[tileIdx];
  say(room, `${p.name}님이 ${TILES[tileIdx].name}을(를) ${won(value)}에 팔았어요.`);
  if (p.cash >= pd.amount) {
    room.pending = null;
    transfer(room, p, pd.amount, pd.creditor);
    continueAfter(room, pd.cont);
  }
  return {};
}

function declareBankrupt(room, id) {
  const pd = expectPending(room, id, 'debt');
  if (!pd) return { error: '지금은 파산을 선언할 수 없어요.' };
  const p = getPlayer(room, id);
  say(room, `${p.name}님이 파산을 선언했어요.`);
  goBankrupt(room, p, pd.creditor);
  return {};
}

function warp(room, id, tileIdx) {
  const pd = expectPending(room, id, 'warp');
  if (!pd) return { error: '지금은 우주여행을 할 수 없어요.' };
  if (!Number.isInteger(tileIdx) || tileIdx < 0 || tileIdx >= BOARD) return { error: '잘못된 칸이에요.' };
  const p = getPlayer(room, id);
  if (tileIdx === p.pos) return { error: '다른 칸을 고르세요.' };
  p.warp = false;
  room.pending = null;
  room.dice = null;
  beginMove(room, p, null);
  say(room, `🚀 ${p.name}님이 컬럼비아호를 타고 ${TILES[tileIdx].name}(으)로 우주여행!`);
  const free = p.freeWarp;
  p.freeWarp = false;
  const o = room.owners[COLUMBIA];
  if (o && o.owner !== p.id && !free) {
    say(room, `🛰️ 컬럼비아호 탑승료 ${won(SPACE_FARE)}을 ${getPlayer(room, o.owner).name}님에게 내요.`);
    settle(room, p, SPACE_FARE, o.owner, { goto: tileIdx, fly: true });
  } else {
    flyTo(room, p, tileIdx);
  }
  return {};
}

// 방장: 자리를 비운 사람 대신 기본값으로 진행
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const pd = room.pending;
  const p = cur(room);
  if (!pd) {
    if (p.jail && p.escape > 0) useEscape(room, p.id);
    return roll(room, p.id);
  }
  if (pd.t === 'debt') return declareBankrupt(room, pd.who);
  if (pd.t === 'warp') {
    const dest = (getPlayer(room, pd.who).pos + 1 + crypto.randomInt(BOARD - 1)) % BOARD;
    return warp(room, pd.who, dest);
  }
  return skip(room, pd.who);
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };
  const cash = n === 2 ? START_CASH_2P : START_CASH;
  room.players = shuffle(room.players);
  room.players.forEach((p, i) => {
    Object.assign(p, { color: COLORS[i], pos: 0, cash, bankrupt: false, jail: false, jailTurns: 0, escape: 0, pass: 0, warp: false, freeWarp: false });
  });
  Object.assign(room, {
    owners: {}, turn: 0, round: 1, dice: null, diceBy: null, doubles: 0, extra: false, fund: 0,
    keyDeck: shuffle(KEYS), keyDiscard: [], pending: null, winnerIds: [], log: [], lastKey: null, move: null,
    gameNo: room.gameNo + 1, phase: 'play',
  });
  say(room, `게임 시작! 모두 ${won(cash)}을 받았어요. ${cur(room).name}님부터!`);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', owners: {}, pending: null, winnerIds: [], log: [], dice: null, fund: 0, extra: false, move: null });
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
  upgrade(room);
  const started = room.phase !== 'lobby';
  const playing = room.phase === 'play';
  const pd = room.pending;
  const myTurn = playing && !pd && cur(room).id === viewerId;
  const iAmWho = !!(pd && pd.who === viewerId);

  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (!playing) mode = 'over';
  else if (iAmWho) mode = pd.t;
  else if (myTurn) mode = 'roll';

  let pending = null;
  if (pd && playing) {
    pending = { t: pd.t, who: pd.who };
    if (pd.tile !== undefined) pending.tile = pd.tile;
    if (pd.t === 'buy') pending.cost = TILES[pd.tile].price;
    if (pd.t === 'build') pending.cost = buildCost(TILES[pd.tile], room.owners[pd.tile].level);
    if (pd.t === 'debt') {
      pending.amount = pd.amount;
      pending.creditor = pd.creditor;
    }
  }

  const p0 = playing ? cur(room) : null;
  const colOwner = room.owners[COLUMBIA];
  return {
    kind: 'marble',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    settings: room.settings,
    roundChoices: ROUND_CHOICES,
    mode,
    tiles: TILES.map((t) => {
      const o = room.owners[t.i];
      return {
        i: t.i, type: t.type, name: t.name, region: t.region || null, price: t.price || null,
        tolls: t.tolls || null, costs: t.costs || null, baseToll: t.toll || null,
        owner: o ? o.owner : null, level: o ? o.level : 0,
        toll: o ? tollOf(room, t.i) : null,
        build: o ? buildCost(t, o.level) : null,
        sale: o ? sellValue(t, o.level) : null,
      };
    }),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, color: p.color,
      pos: p.pos, cash: p.cash, bankrupt: p.bankrupt, jail: p.jail, jailTurns: p.jailTurns,
      escape: p.escape, pass: p.pass, warp: p.warp, freeWarp: p.freeWarp,
      props: started ? propsOf(room, p) : [],
      netWorth: started ? netWorth(room, p) : 0,
    })),
    turnId: playing ? p0.id : null,
    dice: room.dice,
    diceBy: room.diceBy,
    move: room.move,
    round: room.round,
    maxRounds: room.settings.maxRounds,
    fund: room.fund,
    pending,
    spaceFare: colOwner && colOwner.owner !== viewerId ? SPACE_FARE : 0,
    lastKey: room.lastKey,
    winnerIds: room.winnerIds,
    log: room.log,
  };
}

const rawActions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  setting: (room, id, msg) => setSetting(room, id, msg.key, msg.value),
  roll: (room, id) => roll(room, id),
  useEscape: (room, id) => useEscape(room, id),
  buy: (room, id) => buy(room, id),
  build: (room, id) => build(room, id),
  skip: (room, id) => skip(room, id),
  sell: (room, id, msg) => sell(room, id, msg.tile),
  bankrupt: (room, id) => declareBankrupt(room, id),
  warp: (room, id, msg) => warp(room, id, msg.tile),
};

const actions = {};
Object.entries(rawActions).forEach(([k, fn]) => {
  actions[k] = (room, id, msg) => { upgrade(room); return fn(room, id, msg); };
});

module.exports = {
  actions,
  upgrade,
  afterDisconnect: () => {},
  TILES,
  KEYS,
  MAN,
  START_CASH,
  START_CASH_2P,
  SALARY,
  WELFARE_FEE,
  SPACE_FARE,
  BOARD,
  ISLAND,
  FUND_COLLECT,
  SPACE,
  COLUMBIA,
  ROUND_CHOICES,
  MIN_PLAYERS,
  MAX_PLAYERS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  setSetting,
  start,
  backToLobby,
  restart,
  roll,
  useEscape,
  buy,
  build,
  skip,
  sell,
  declareBankrupt,
  warp,
  force,
  viewFor,
  tollOf,
  buildCost,
  invested,
  sellValue,
  netWorth,
  won,
};
