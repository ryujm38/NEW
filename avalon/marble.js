'use strict';
// 부루마블(주사위 보드게임) 규칙 엔진, 2~6명. 돈의 단위는 "만원"이다.
//
// 보드는 32칸의 원형: 시작(0) · 도시 20곳 · 관광지 3곳 · 황금열쇠 4곳 · 무인도(8) · 사회복지기금 수령(16) ·
// 우주여행(24) · 사회복지기금 접수(29).
// 진행: 주사위 2개를 굴려 이동 → 도착한 칸 처리 → (더블이면 한 번 더, 3번 연속 더블이면 무인도).
//   빈 도시/관광지: 구입. 내 도시: 별장→빌딩→호텔 건설. 남의 도시: 통행료를 내고, 호텔이 아니면 2배 값에 인수 가능.
//   시작을 지나거나 밟으면 월급. 무인도에 도착하면 갇힘(벌금/탈출권/더블/3턴 대기로 탈출).
//   우주여행에 도착하면 다음 턴에 원하는 칸으로 이동. 돈이 모자라면 땅을 팔아 갚고, 못 갚으면 파산.
// 종료: 한 명만 남거나, 방장이 정한 바퀴 수가 지나면 자산(현금+땅/건물 값)이 가장 많은 사람이 승리.
//
// 도시 이름·가격·황금열쇠 내용은 원본 부루마블 목록이 아니라 비슷한 구조로 만든 구성이다.

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const START_CASH = 300;
const SALARY = 20;
const ISLAND_FEE = 20;
const WELFARE_FEE = 15;
const ISLAND_WAIT = 3;
const BOARD = 32;
const ROUND_CHOICES = [0, 20, 30, 50]; // 0 = 무제한
const DEFAULT_ROUNDS = 30;
const LOG_KEEP = 14;
const COLORS = ['#e0453a', '#3b82e0', '#35a862', '#e8c23a', '#b98af0', '#f08a3a'];

// 도시 [이름, 가격(만원), 그룹]
const CITY = (name, price, group) => ({ type: 'city', name, price, group });
const TOUR = (name) => ({ type: 'tour', name, price: 20 });
const TILES = [
  { type: 'start', name: '시작' },
  CITY('타이베이', 5, 'A'), CITY('홍콩', 8, 'A'),
  { type: 'key', name: '황금열쇠' },
  CITY('마닐라', 8, 'B'), TOUR('제주도'), CITY('싱가포르', 10, 'B'), CITY('카이로', 10, 'B'),
  { type: 'island', name: '무인도' },
  CITY('이스탄불', 12, 'C'), CITY('아테네', 14, 'C'),
  { type: 'key', name: '황금열쇠' },
  CITY('코펜하겐', 16, 'D'), CITY('스톡홀름', 16, 'D'), TOUR('콩코드'), CITY('취리히', 18, 'D'),
  { type: 'fundcollect', name: '사회복지기금 수령' },
  CITY('베를린', 20, 'E'), CITY('몬트리올', 22, 'E'),
  { type: 'key', name: '황금열쇠' },
  CITY('부에노스아이레스', 24, 'F'), CITY('상파울루', 26, 'F'), TOUR('퀸 엘리자베스호'), CITY('시드니', 28, 'F'),
  { type: 'space', name: '우주여행' },
  CITY('부산', 30, 'G'), CITY('하와이', 32, 'G'),
  { type: 'key', name: '황금열쇠' },
  CITY('파리', 36, 'H'), { type: 'fundpay', name: '사회복지기금 접수' }, CITY('뉴욕', 42, 'H'), CITY('서울', 50, 'H'),
].map((t, i) => ({ i, ...t }));

const GROUPS = {};
TILES.forEach((t) => { if (t.group) (GROUPS[t.group] = GROUPS[t.group] || []).push(t.i); });
const TOURS = TILES.filter((t) => t.type === 'tour').map((t) => t.i);
const TOLL_MULT = [0.2, 0.6, 1.4, 3.0]; // 땅 / 별장 / 빌딩 / 호텔
const LEVEL_NAME = ['땅', '별장', '빌딩', '호텔'];

const KEYS = [
  { id: 'fwd3', text: '앞으로 3칸 이동' },
  { id: 'back3', text: '뒤로 3칸 이동' },
  { id: 'start', text: '출발지로 이동! 월급을 받아요' },
  { id: 'island', text: '무인도로 이동' },
  { id: 'escape', text: '무인도 탈출권을 얻었어요 (보관)' },
  { id: 'lottery', text: '복권에 당첨! 20만을 받아요' },
  { id: 'tax', text: '세금 고지서! 10만을 내요' },
  { id: 'birthday', text: '생일 파티! 다른 모두에게 5만씩 받아요' },
  { id: 'hospital', text: '병원비 15만을 내요' },
  { id: 'space', text: '우주여행으로 이동' },
  { id: 'fundcollect', text: '사회복지기금 수령처로 이동' },
  { id: 'bonus', text: '보너스 30만을 받아요' },
  { id: 'theft', text: '소매치기! 5만을 잃었어요' },
  { id: 'donate', text: '사회복지기금에 10만을 기부해요' },
  { id: 'nearTour', text: '가장 가까운 관광지로 이동' },
  { id: 'interest', text: '은행 이자 10만을 받아요' },
];

const roll1 = () => crypto.randomInt(1, 7);

function createRoom(code) {
  return {
    kind: 'marble',
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
    diceBy: null, // 마지막으로 굴린 사람
    doubles: 0, // 이번 턴 연속 더블 횟수
    extra: false, // 더블로 한 번 더 굴릴 수 있는지
    fund: 0,
    keyDeck: [],
    keyDiscard: [],
    pending: null,
    winnerIds: [],
    log: [],
    lastKey: null,
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
    color: '', pos: 0, cash: 0, bankrupt: false, jail: false, jailTurns: 0, escape: 0, warp: false,
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

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

const buildCost = (tile, level) => [Math.ceil(tile.price * 0.5), tile.price, Math.ceil(tile.price * 1.5)][level];
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

function hasMonopoly(room, ownerId, group) {
  return GROUPS[group].every((i) => room.owners[i] && room.owners[i].owner === ownerId);
}

function tollOf(room, idx) {
  const tile = TILES[idx];
  const o = room.owners[idx];
  if (tile.type === 'tour') {
    const count = TOURS.filter((t) => room.owners[t] && room.owners[t].owner === o.owner).length;
    return 10 * 2 ** (count - 1);
  }
  const base = Math.max(1, Math.round(tile.price * TOLL_MULT[o.level]));
  return hasMonopoly(room, o.owner, tile.group) ? base * 2 : base;
}

// ---- 돈 주고받기 / 파산 ----

// 계속할 일: 'done'(칸 처리 끝) | { toll: 칸 번호 }(통행료를 낸 뒤 인수 확인)
function continueAfter(room, cont) {
  if (cont && cont.toll !== undefined) afterToll(room, cont.toll);
  else endAction(room);
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
    say(room, `${p.name}님이 빚을 갚을 수 없어 파산했어요!`);
    goBankrupt(room, p, creditor);
    return;
  }
  room.pending = { t: 'debt', who: p.id, amount, creditor, cont };
  say(room, `${p.name}님은 ${amount}만이 모자라요. 땅을 팔아 갚아야 해요.`);
}

function goBankrupt(room, p, creditor) {
  p.bankrupt = true;
  if (creditor && creditor !== 'bank' && creditor !== 'fund') getPlayer(room, creditor).cash += Math.max(0, p.cash);
  if (creditor === 'fund') room.fund += Math.max(0, p.cash);
  p.cash = 0;
  p.jail = false;
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

// ---- 이동 / 칸 처리 ----

function moveTo(room, p, dest, { forward = true } = {}) {
  if (forward && dest <= p.pos && dest !== p.pos) {
    p.cash += SALARY;
    say(room, `${p.name}님이 시작을 지나 월급 ${SALARY}만을 받았어요.`);
  }
  p.pos = dest;
  resolveLanding(room, p);
}

function stepMove(room, p, steps) {
  const raw = p.pos + steps;
  const dest = ((raw % BOARD) + BOARD) % BOARD;
  if (steps > 0 && raw >= BOARD) {
    p.cash += SALARY;
    say(room, `${p.name}님이 시작을 지나 월급 ${SALARY}만을 받았어요.`);
  }
  p.pos = dest;
  resolveLanding(room, p);
}

function resolveLanding(room, p) {
  const tile = TILES[p.pos];
  const o = room.owners[p.pos];
  switch (tile.type) {
    case 'start':
      endAction(room);
      break;
    case 'city':
    case 'tour':
      if (!o) {
        if (p.cash >= tile.price) room.pending = { t: 'buy', who: p.id, tile: p.pos };
        else {
          say(room, `${p.name}님이 ${tile.name}에 도착했지만 돈이 모자라 살 수 없어요.`);
          endAction(room);
        }
      } else if (o.owner === p.id) {
        if (tile.type === 'city' && o.level < 3 && p.cash >= buildCost(tile, o.level)) {
          room.pending = { t: 'build', who: p.id, tile: p.pos };
        } else endAction(room);
      } else {
        const toll = tollOf(room, p.pos);
        say(room, `${p.name}님이 ${tile.name}에 도착해 ${getPlayer(room, o.owner).name}님에게 통행료 ${toll}만을 내요.`);
        settle(room, p, toll, o.owner, { toll: p.pos });
      }
      break;
    case 'key':
      drawKey(room, p);
      break;
    case 'island':
      say(room, `${p.name}님이 무인도에 갇혔어요!`);
      p.jail = true;
      p.jailTurns = 0;
      room.extra = false;
      endAction(room);
      break;
    case 'fundpay':
      say(room, `${p.name}님이 사회복지기금 ${WELFARE_FEE}만을 내요.`);
      settle(room, p, WELFARE_FEE, 'fund', 'done');
      break;
    case 'fundcollect':
      if (room.fund > 0) {
        say(room, `${p.name}님이 사회복지기금 ${room.fund}만을 받았어요!`);
        p.cash += room.fund;
        room.fund = 0;
      } else {
        say(room, '사회복지기금이 비어 있어요.');
      }
      endAction(room);
      break;
    case 'space':
      say(room, `${p.name}님이 우주여행 칸에 도착했어요. 다음 차례에 원하는 곳으로 갈 수 있어요!`);
      p.warp = true;
      room.extra = false;
      endAction(room);
      break;
    default:
      endAction(room);
  }
}

function afterToll(room, idx) {
  const p = cur(room);
  const tile = TILES[idx];
  const o = room.owners[idx];
  if (p.bankrupt || !o) {
    endAction(room);
    return;
  }
  if (tile.type === 'city' && o.level < 3) {
    const cost = 2 * invested(tile, o.level);
    if (p.cash >= cost) {
      room.pending = { t: 'takeover', who: p.id, tile: idx, cost };
      return;
    }
  }
  endAction(room);
}

function drawKey(room, p) {
  if (room.keyDeck.length === 0) {
    room.keyDeck = shuffle(room.keyDiscard);
    room.keyDiscard = [];
  }
  const card = room.keyDeck.pop();
  if (card.id !== 'escape') room.keyDiscard.push(card);
  room.lastKey = { by: p.id, text: card.text };
  say(room, `🔑 ${p.name}님의 황금열쇠: ${card.text}`);
  switch (card.id) {
    case 'fwd3': stepMove(room, p, 3); break;
    case 'back3': stepMove(room, p, -3); break;
    case 'start': moveTo(room, p, 0); break;
    case 'island': p.pos = 8; resolveLanding(room, p); break;
    case 'escape': p.escape += 1; endAction(room); break;
    case 'lottery': p.cash += 20; endAction(room); break;
    case 'bonus': p.cash += 30; endAction(room); break;
    case 'interest': p.cash += 10; endAction(room); break;
    case 'tax': settle(room, p, 10, 'bank', 'done'); break;
    case 'hospital': settle(room, p, 15, 'bank', 'done'); break;
    case 'theft': settle(room, p, 5, 'bank', 'done'); break;
    case 'donate': settle(room, p, 10, 'fund', 'done'); break;
    case 'birthday':
      alive(room).filter((q) => q.id !== p.id).forEach((q) => {
        const pay = Math.min(5, q.cash);
        q.cash -= pay;
        p.cash += pay;
      });
      endAction(room);
      break;
    case 'space': moveTo(room, p, 24, { forward: true }); break;
    case 'fundcollect': moveTo(room, p, 16, { forward: true }); break;
    case 'nearTour': {
      const dest = TOURS.find((t) => t > p.pos) ?? TOURS[0];
      moveTo(room, p, dest, { forward: true });
      break;
    }
    default: endAction(room);
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
    say(room, `${p.name}님이 무인도에서 풀려났어요.`);
  }
  const [d1, d2] = room.rigged && room.rigged.length ? room.rigged.shift() : [roll1(), roll1()]; // rigged는 테스트용
  room.dice = [d1, d2];
  room.diceBy = p.id;
  const dbl = d1 === d2;
  say(room, `🎲 ${p.name}님이 주사위를 굴렸어요: ${d1} + ${d2}${dbl ? ' (더블!)' : ''}`);
  if (p.jail) {
    if (dbl) {
      p.jail = false;
      room.extra = false;
      say(room, `${p.name}님이 더블로 무인도를 탈출했어요!`);
      stepMove(room, p, d1 + d2);
    } else {
      p.jailTurns += 1;
      say(room, `${p.name}님은 무인도에 남아요. (${p.jailTurns}/${ISLAND_WAIT})`);
      endAction(room);
    }
    return {};
  }
  if (dbl) {
    room.doubles += 1;
    if (room.doubles >= 3) {
      say(room, `${p.name}님이 3번 연속 더블! 무인도로 가요.`);
      p.pos = 8;
      resolveLanding(room, p);
      return {};
    }
    room.extra = true;
  }
  stepMove(room, p, d1 + d2);
  return {};
}

function payFine(room, id) {
  const bad = checkRoll(room, id);
  if (bad) return bad;
  const p = cur(room);
  if (!p.jail) return { error: '무인도에 있지 않아요.' };
  if (p.cash < ISLAND_FEE) return { error: `벌금 ${ISLAND_FEE}만이 모자라요.` };
  p.cash -= ISLAND_FEE;
  p.jail = false;
  say(room, `${p.name}님이 벌금 ${ISLAND_FEE}만을 내고 무인도에서 나왔어요.`);
  return {};
}

function useEscape(room, id) {
  const bad = checkRoll(room, id);
  if (bad) return bad;
  const p = cur(room);
  if (!p.jail) return { error: '무인도에 있지 않아요.' };
  if (p.escape < 1) return { error: '탈출권이 없어요.' };
  p.escape -= 1;
  p.jail = false;
  say(room, `${p.name}님이 탈출권으로 무인도에서 나왔어요.`);
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
  say(room, `🏠 ${p.name}님이 ${tile.name}을(를) ${tile.price}만에 샀어요.`);
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
  if (p.cash < cost) return { error: '돈이 모자라요.' };
  p.cash -= cost;
  o.level += 1;
  say(room, `🏗 ${p.name}님이 ${tile.name}에 ${LEVEL_NAME[o.level]}을(를) 지었어요. (${cost}만)`);
  room.pending = null;
  endAction(room);
  return {};
}

function takeover(room, id) {
  const pd = expectPending(room, id, 'takeover');
  if (!pd) return { error: '지금은 인수할 수 없어요.' };
  const p = getPlayer(room, id);
  const o = room.owners[pd.tile];
  const seller = getPlayer(room, o.owner);
  const cost = 2 * invested(TILES[pd.tile], o.level);
  if (p.cash < cost) return { error: '돈이 모자라요.' };
  p.cash -= cost;
  seller.cash += cost;
  o.owner = id;
  say(room, `💼 ${p.name}님이 ${TILES[pd.tile].name}을(를) ${seller.name}님에게서 ${cost}만에 인수했어요!`);
  room.pending = null;
  endAction(room);
  return {};
}

function skip(room, id) {
  const pd = room.pending;
  if (!pd || pd.who !== id || !['buy', 'build', 'takeover'].includes(pd.t)) return { error: '건너뛸 게 없어요.' };
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
  say(room, `${p.name}님이 ${TILES[tileIdx].name}을(를) ${value}만에 팔았어요.`);
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
  say(room, `🚀 ${p.name}님이 ${TILES[tileIdx].name}(으)로 우주여행!`);
  moveTo(room, p, tileIdx, { forward: true });
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
  room.players = shuffle(room.players);
  room.players.forEach((p, i) => {
    Object.assign(p, { color: COLORS[i], pos: 0, cash: START_CASH, bankrupt: false, jail: false, jailTurns: 0, escape: 0, warp: false });
  });
  Object.assign(room, {
    owners: {}, turn: 0, round: 1, dice: null, diceBy: null, doubles: 0, extra: false, fund: 0,
    keyDeck: shuffle(KEYS), keyDiscard: [], pending: null, winnerIds: [], log: [], lastKey: null,
    gameNo: room.gameNo + 1, phase: 'play',
  });
  say(room, `게임 시작! 모두 ${START_CASH}만을 가지고 시작해요. ${cur(room).name}님부터!`);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', owners: {}, pending: null, winnerIds: [], log: [], dice: null, fund: 0, extra: false });
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
  const pd = room.pending;
  const me = getPlayer(room, viewerId);
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
    if (pd.t === 'takeover') pending.cost = pd.cost;
    if (pd.t === 'debt') {
      pending.amount = pd.amount;
      pending.creditor = pd.creditor;
    }
  }

  const p0 = playing ? cur(room) : null;
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
        i: t.i, type: t.type, name: t.name, price: t.price || null, group: t.group || null,
        owner: o ? o.owner : null, level: o ? o.level : 0,
        toll: o ? tollOf(room, t.i) : null,
        build: o && t.type === 'city' && o.level < 3 ? buildCost(t, o.level) : null,
        sale: o ? sellValue(t, o.level) : null,
      };
    }),
    players: room.players.map((p) => ({
      id: p.id, name: p.name, connected: p.connected, color: p.color,
      pos: p.pos, cash: p.cash, bankrupt: p.bankrupt, jail: p.jail, jailTurns: p.jailTurns,
      escape: p.escape, warp: p.warp,
      props: started ? propsOf(room, p) : [],
      netWorth: started ? netWorth(room, p) : 0,
    })),
    turnId: playing ? p0.id : null,
    dice: room.dice,
    diceBy: room.diceBy,
    round: room.round,
    maxRounds: room.settings.maxRounds,
    fund: room.fund,
    pending,
    canPayFine: !!(myTurn && me && me.jail && me.cash >= ISLAND_FEE),
    fine: ISLAND_FEE,
    lastKey: room.lastKey,
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
  roll: (room, id) => roll(room, id),
  payFine: (room, id) => payFine(room, id),
  useEscape: (room, id) => useEscape(room, id),
  buy: (room, id) => buy(room, id),
  build: (room, id) => build(room, id),
  takeover: (room, id) => takeover(room, id),
  skip: (room, id) => skip(room, id),
  sell: (room, id, msg) => sell(room, id, msg.tile),
  bankrupt: (room, id) => declareBankrupt(room, id),
  warp: (room, id, msg) => warp(room, id, msg.tile),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  TILES,
  GROUPS,
  TOURS,
  KEYS,
  START_CASH,
  SALARY,
  ISLAND_FEE,
  WELFARE_FEE,
  BOARD,
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
  payFine,
  useEscape,
  buy,
  build,
  takeover,
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
  hasMonopoly,
};
