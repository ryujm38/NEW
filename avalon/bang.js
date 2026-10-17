'use strict';
// 뱅!(BANG!) 규칙 엔진, 4~7명. 아발론(game.js)·우노(uno.js)와 같은 모양으로 서버에 꽂힌다.
//
// 구조: 카드를 내면 효과를 "작업(queue)"으로 쌓고 run()이 차례로 처리한다. 사람의 선택이 필요한 지점
// (빗나감! 낼지, 죽기 직전 맥주, 잡화점 고르기 …)에서는 room.pending에 "누가 무엇을 해야 하는지"를 적고 멈춘다.
// 작업도 pending도 없으면 지금 턴인 사람의 자유 행동 시간이다.
//
// 단순화한 점: 럭키 듀크는 뽑기!에서 더 좋은 쪽을 자동으로 고른다. (배럴은 맞을 때 쓸지 말지 직접 고른다)
// 카드 80장의 종류·장수·무늬·숫자는 실제 덱 목록을 따른다(public/bang-data.js).

const crypto = require('crypto');
const { shuffle, newId, newToken, cleanName } = require('./common');
const DATA = require('./public/bang-data.js');

const { CARDS, CHARS, ROLES, SUITS } = DATA;
const MIN_PLAYERS = 4;
const MAX_PLAYERS = 7;
const LOG_KEEP = 14;
const ROLE_SETS = {
  4: ['sheriff', 'renegade', 'outlaw', 'outlaw'],
  5: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'deputy'],
  6: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy'],
  7: ['sheriff', 'renegade', 'outlaw', 'outlaw', 'outlaw', 'deputy', 'deputy'],
};
const BANG_LIKE_TO_NEED = { bang: 'missed', gatling: 'missed', indians: 'bang', duel: 'bang' };
const TARGETED = new Set(['bang', 'panic', 'catbalou', 'duel', 'jail']);

const RANK_OF = { J: 11, Q: 12, K: 13, A: 14 };

// 무늬·숫자는 public/bang-data.js의 실제 카드 목록을 그대로 쓴다.
function buildDeck() {
  const deck = [];
  for (const [key, list] of Object.entries(DATA.DECK)) {
    list.forEach((code) => deck.push({ id: deck.length, key, suit: code[0], rank: RANK_OF[code.slice(1)] || Number(code.slice(1)) }));
  }
  return deck;
}
const DECK = buildDeck();

const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
const cardLabel = (c) => `${SUITS[c.suit]}${RANK_LABEL[c.rank] || c.rank} ${CARDS[c.key].name}`;
const rand = (n) => crypto.randomInt(n);

function createRoom(code) {
  return {
    kind: 'bang',
    code,
    hostId: null,
    players: [],
    phase: 'lobby', // lobby | play | over
    gameNo: 0,
    deck: [],
    discard: [],
    turn: 0,
    bangUsed: false,
    discarding: false, // 턴을 끝내려고 하는데 손패가 체력보다 많을 때
    queue: [],
    pending: null,
    winner: null,
    reason: null,
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
  const player = {
    id: newId(), token: newToken(), name, connected: true,
    role: null, char: null, life: 0, max: 0, hand: [], table: [], alive: true,
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

// ---- 도우미 ----

const cur = (room) => room.players[room.turn];
const liveCount = (room) => room.players.filter((p) => p.alive).length;
const cardCount = (p) => p.hand.length + p.table.length;

function say(room, text) {
  room.log.push(text);
  if (room.log.length > LOG_KEEP) room.log.shift();
}

function popDeck(room) {
  if (room.deck.length === 0) {
    if (room.discard.length === 0) return null;
    room.deck = shuffle(room.discard);
    room.discard = [];
  }
  return room.deck.pop();
}

function drawCards(room, p, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    const c = popDeck(room);
    if (!c) break;
    p.hand.push(c);
    got += 1;
  }
  return got;
}

// '뽑기!' 판정: 덱 맨 위를 버린 더미로 넘기고 good(card)이면 성공. 럭키 듀크는 2장을 넘겨 좋은 쪽을 고른다.
function check(room, p, good, what) {
  const flips = [];
  for (let i = 0; i < (p.char === 'luckyduke' ? 2 : 1); i++) {
    const c = popDeck(room);
    if (c) {
      room.discard.push(c);
      flips.push(c);
    }
  }
  const win = flips.find(good);
  const shown = win || flips[0];
  say(room, `${p.name}님 ${what}: ${flips.map(cardLabel).join(', ') || '카드 없음'} → ${win ? '성공' : '실패'}`);
  return { ok: !!win, card: shown };
}

const isHeart = (c) => c.suit === 'h';
const isDynamiteSafe = (c) => !(c.suit === 's' && c.rank >= 2 && c.rank <= 9);

function hasEquip(p, key) {
  return p.table.some((c) => c.key === key);
}
const scopeBonus = (p) => (p.char === 'rose' ? 1 : 0) + p.table.filter((c) => c.key === 'scope').length;
const mustangBonus = (p) => (p.char === 'paul' ? 1 : 0) + p.table.filter((c) => c.key === 'mustang').length;
function weaponRange(p) {
  const gun = p.table.find((c) => CARDS[c.key].type === 'gun');
  return gun ? CARDS[gun.key].range : 1;
}
function distance(room, a, b) {
  const live = room.players.filter((p) => p.alive);
  const d = Math.abs(live.indexOf(a) - live.indexOf(b));
  const base = Math.min(d, live.length - d);
  return Math.max(1, base - scopeBonus(a) + mustangBonus(b));
}
// 내 다음 사람부터 시계 방향으로 살아 있는 다른 사람들
function othersFrom(room, p) {
  const out = [];
  const n = room.players.length;
  const start = room.players.indexOf(p);
  for (let i = 1; i < n; i++) {
    const q = room.players[(start + i) % n];
    if (q.alive) out.push(q);
  }
  return out;
}

function effectiveKey(p, card) {
  if (p.char === 'calamity' && card.key === 'missed') return 'bang';
  return card.key;
}

// 응답용 카드: 뱅!/개틀링은 빗나감!, 인디언!/결투는 뱅!. 캘러미티는 둘 다 가능.
function respondCards(p, kind) {
  const want = BANG_LIKE_TO_NEED[kind];
  return p.hand
    .filter((c) => c.key === want || (p.char === 'calamity' && (c.key === 'missed' || c.key === 'bang')))
    .map((c) => c.id);
}

function removeFromHand(p, cardId) {
  const i = p.hand.findIndex((c) => c.id === cardId);
  return i < 0 ? null : p.hand.splice(i, 1)[0];
}

// ---- 피해 / 탈락 / 승리 ----

function damage(room, target, n, sourceId) {
  if (!target.alive) return;
  target.life -= n;
  say(room, `${target.name}님이 체력 ${n}을 잃었어요. (남은 체력 ${Math.max(target.life, 0)})`);
  if (target.char === 'bart') drawCards(room, target, n);
  const src = sourceId && sourceId !== target.id ? getPlayer(room, sourceId) : null;
  if (target.char === 'elgringo' && src && src.alive) {
    for (let i = 0; i < n && src.hand.length; i++) {
      target.hand.push(src.hand.splice(rand(src.hand.length), 1)[0]);
      say(room, `${target.name}님이 ${src.name}님의 손패에서 1장을 가져왔어요.`);
    }
  }
  if (target.life <= 0) room.queue.unshift({ t: 'dying', who: target.id, source: sourceId || null });
}

function winnerOf(room) {
  const live = room.players.filter((p) => p.alive);
  const sheriff = room.players.find((p) => p.role === 'sheriff');
  if (!sheriff.alive) {
    return live.length === 1 && live[0].role === 'renegade' ? 'renegade' : 'outlaw';
  }
  if (!live.some((p) => p.role === 'outlaw' || p.role === 'renegade')) return 'law';
  return null;
}

function eliminate(room, victim, sourceId) {
  victim.alive = false;
  victim.life = Math.min(victim.life, 0);
  say(room, `💀 ${victim.name}님 탈락! 정체는 ${ROLES[victim.role].name}`);
  const loot = [...victim.hand, ...victim.table];
  victim.hand = [];
  victim.table = [];
  const vulture = room.players.find((p) => p.alive && p.char === 'vulture');
  if (vulture) {
    vulture.hand.push(...loot);
    if (loot.length) say(room, `${vulture.name}님(벌처 샘)이 카드 ${loot.length}장을 가져왔어요.`);
  } else {
    room.discard.push(...loot);
  }
  const killer = sourceId ? getPlayer(room, sourceId) : null;
  if (killer && killer.alive && killer.id !== victim.id) {
    if (victim.role === 'outlaw') {
      drawCards(room, killer, 3);
      say(room, `${killer.name}님이 무법자를 쓰러뜨려 카드 3장을 뽑았어요.`);
    }
    if (killer.role === 'sheriff' && victim.role === 'deputy') {
      room.discard.push(...killer.hand, ...killer.table);
      killer.hand = [];
      killer.table = [];
      say(room, '보안관이 부보안관을 쓰러뜨려 모든 카드를 버려요!');
    }
  }
  const w = winnerOf(room);
  if (w) {
    room.phase = 'over';
    room.winner = w;
    room.queue = [];
    room.pending = null;
    say(room, '게임 끝!');
  }
}

// ---- 턴 진행 ----

function beginTurn(room) {
  const a = cur(room).id;
  room.bangUsed = false;
  room.discarding = false;
  room.queue.push({ t: 'dynamite', actor: a }, { t: 'jail', actor: a }, { t: 'draw', actor: a });
  say(room, `▶ ${cur(room).name}님의 차례`);
}

function nextTurn(room) {
  if (room.phase !== 'play') return;
  let i = room.turn;
  do {
    i = (i + 1) % room.players.length;
  } while (!room.players[i].alive);
  room.turn = i;
  beginTurn(room);
}

function ready(room) {
  return room.phase === 'play' && !room.pending && room.queue.length === 0;
}

// 손패가 빈 수지는 바로 한 장 뽑는다
function suzy(room) {
  for (const p of room.players) {
    if (p.alive && p.char === 'suzy' && p.hand.length === 0 && drawCards(room, p, 1)) {
      say(room, `${p.name}님(수지)이 손패가 비어 1장을 뽑았어요.`);
    }
  }
}

function run(room) {
  for (let guard = 0; guard < 1000; guard++) {
    if (room.phase !== 'play' || room.pending) return;
    suzy(room);
    if (room.queue.length === 0) {
      if (!cur(room).alive) {
        room.queue.push({ t: 'nextTurn' });
        continue;
      }
      return; // 지금 턴인 사람의 자유 행동 시간
    }
    const task = room.queue.shift();
    if (task.actor && !getPlayer(room, task.actor).alive) continue;
    step(room, task);
  }
  throw new Error('bang: 작업이 끝나지 않아요');
}

function step(room, task) {
  switch (task.t) {
    case 'nextTurn':
      nextTurn(room);
      break;

    case 'dynamite': {
      const p = getPlayer(room, task.actor);
      const dyn = p.table.find((c) => c.key === 'dynamite');
      if (!dyn) break;
      const r = check(room, p, isDynamiteSafe, '다이너마이트');
      p.table = p.table.filter((c) => c !== dyn);
      if (r.ok) {
        const next = othersFrom(room, p)[0];
        next.table.push(dyn);
        say(room, `다이너마이트가 ${next.name}님에게 넘어갔어요.`);
      } else {
        room.discard.push(dyn);
        say(room, '💥 다이너마이트 폭발!');
        damage(room, p, 3, null);
      }
      break;
    }

    case 'jail': {
      const p = getPlayer(room, task.actor);
      const jail = p.table.find((c) => c.key === 'jail');
      if (!jail) break;
      p.table = p.table.filter((c) => c !== jail);
      room.discard.push(jail);
      const r = check(room, p, isHeart, '감옥 탈출');
      if (!r.ok) {
        say(room, `${p.name}님은 감옥에 갇혀 차례를 건너뛰어요.`);
        room.queue = [{ t: 'nextTurn' }];
      }
      break;
    }

    case 'draw':
      startDraw(room, getPlayer(room, task.actor));
      break;

    case 'attack': {
      const t = getPlayer(room, task.target);
      if (!t.alive) break;
      const src = getPlayer(room, task.source);
      const need = task.kind === 'bang' && src.char === 'slab' ? 2 : 1;
      const barrels = t.table.filter((c) => c.key === 'barrel').length + (t.char === 'jourdonnais' ? 1 : 0);
      continueAttack(room, task.kind, t, task.source, need, barrels);
      break;
    }

    case 'indian': {
      const t = getPlayer(room, task.target);
      if (t.alive) askRespond(room, 'indians', t, task.source, 1);
      break;
    }

    case 'duel': {
      const who = getPlayer(room, task.who);
      if (who.alive) askRespond(room, 'duel', who, task.other, 1, task.other);
      break;
    }

    case 'store': {
      const starter = getPlayer(room, task.starter);
      const order = [starter, ...othersFrom(room, starter)];
      const cards = [];
      for (let i = 0; i < order.length; i++) {
        const c = popDeck(room);
        if (c) cards.push(c);
      }
      say(room, `잡화점! 카드 ${cards.length}장이 펼쳐졌어요.`);
      room.pending = { t: 'store', who: order[0].id, order: order.map((p) => p.id), i: 0, cards };
      break;
    }

    case 'dying': {
      const p = getPlayer(room, task.who);
      if (!p.alive || p.life > 0) break;
      if (!canSave(room, p)) {
        eliminate(room, p, task.source);
        break;
      }
      room.pending = { t: 'dying', who: p.id, source: task.source };
      break;
    }

    default:
      throw new Error(`bang: 알 수 없는 작업 ${task.t}`);
  }
}

// 뱅!/개틀링을 맞는 사람: 배럴이 있으면 쓸지 먼저 묻고, 막지 못한 몫은 빗나감!으로 막을 기회를 준다
function continueAttack(room, kind, t, sourceId, need, barrels) {
  if (need <= 0) {
    say(room, `${t.name}님이 막았어요!`);
    return;
  }
  if (barrels > 0) {
    room.pending = { t: 'barrel', who: t.id, kind, source: sourceId, need, barrels };
    return;
  }
  askRespond(room, kind, t, sourceId, need);
}

// 배럴을 쓸지 고른다. 쓰면 뽑기!(♥면 빗나감! 1장 몫), 안 쓰면 남은 배럴은 포기하고 빗나감!으로 넘어간다.
function useBarrel(room, id, use) {
  const pd = room.pending;
  if (!pd || pd.t !== 'barrel' || pd.who !== id) return { error: '지금은 배럴을 쓸 때가 아니에요.' };
  const t = getPlayer(room, id);
  room.pending = null;
  let { need, barrels } = pd;
  if (use) {
    barrels -= 1;
    if (check(room, t, isHeart, '배럴').ok) need -= 1;
  } else {
    barrels = 0;
    say(room, `${t.name}님은 배럴을 쓰지 않았어요.`);
  }
  continueAttack(room, pd.kind, t, pd.source, need, barrels);
  run(room);
  return {};
}

function canSave(room, p) {
  if (liveCount(room) <= 2) return false; // 둘만 남으면 맥주를 쓸 수 없다
  if (p.hand.some((c) => c.key === 'beer')) return true;
  return p.char === 'sid' && p.hand.length >= 2;
}

// 대응할 수 있는 카드가 없으면 묻지 않고 바로 맞는다
function askRespond(room, kind, who, sourceId, need, other) {
  if (respondCards(who, kind).length === 0) {
    damage(room, who, 1, kind === 'duel' ? other : sourceId);
    return;
  }
  room.pending = { t: 'respond', kind, who: who.id, source: sourceId, need, other: other || null };
}

function startDraw(room, p) {
  if (p.char === 'jesse') {
    const options = othersFrom(room, p).filter((q) => q.hand.length > 0).map((q) => q.id);
    if (options.length) {
      room.pending = { t: 'drawChoice', who: p.id, kind: 'jesse', options };
      return;
    }
  }
  if (p.char === 'pedro' && room.discard.length) {
    room.pending = { t: 'drawChoice', who: p.id, kind: 'pedro', options: ['discard'] };
    return;
  }
  if (p.char === 'kit') {
    const before = p.hand.length;
    drawCards(room, p, 3);
    const got = p.hand.slice(before).map((c) => c.id);
    if (got.length) {
      room.pending = { t: 'kit', who: p.id, cards: got };
      return;
    }
  }
  if (p.char === 'blackjack') {
    drawCards(room, p, 1);
    const second = popDeck(room);
    if (second) {
      p.hand.push(second);
      say(room, `${p.name}님(블랙 잭)의 두 번째 카드는 ${cardLabel(second)}`);
      if (second.suit === 'h' || second.suit === 'd') drawCards(room, p, 1);
    }
    return;
  }
  drawCards(room, p, 2);
}

// ---- 입력 처리 ----

function choose(room, id, msg) {
  const pd = room.pending;
  if (!pd || pd.who !== id) return { error: '지금은 고를 게 없어요.' };
  const me = getPlayer(room, id);
  if (pd.t === 'kit') {
    const card = me.hand.find((c) => c.id === msg.card);
    if (!card || !pd.cards.includes(card.id)) return { error: '3장 중에서 돌려놓을 카드를 고르세요.' };
    me.hand = me.hand.filter((c) => c !== card);
    room.deck.push(card);
    room.pending = null;
    say(room, `${me.name}님이 1장을 덱 위로 돌려놓았어요.`);
  } else if (pd.t === 'drawChoice') {
    const opt = msg.opt;
    if (opt === 'deck') {
      drawCards(room, me, 2);
    } else if (pd.kind === 'pedro' && opt === 'discard') {
      me.hand.push(room.discard.pop());
      drawCards(room, me, 1);
      say(room, `${me.name}님이 버린 더미에서 카드를 가져왔어요.`);
    } else if (pd.kind === 'jesse' && pd.options.includes(opt)) {
      const from = getPlayer(room, opt);
      me.hand.push(from.hand.splice(rand(from.hand.length), 1)[0]);
      drawCards(room, me, 1);
      say(room, `${me.name}님이 ${from.name}님의 손패에서 1장을 뽑았어요.`);
    } else {
      return { error: '그 선택은 할 수 없어요.' };
    }
    room.pending = null;
  } else {
    return { error: '지금은 고를 게 없어요.' };
  }
  run(room);
  return {};
}

function store(room, id, cardId) {
  const pd = room.pending;
  if (!pd || pd.t !== 'store' || pd.who !== id) return { error: '지금은 고를 차례가 아니에요.' };
  const i = pd.cards.findIndex((c) => c.id === cardId);
  if (i < 0) return { error: '그 카드는 펼쳐진 카드에 없어요.' };
  const me = getPlayer(room, id);
  me.hand.push(pd.cards.splice(i, 1)[0]);
  say(room, `${me.name}님이 잡화점에서 카드를 골랐어요.`);
  advanceStore(room, pd);
  run(room);
  return {};
}

function advanceStore(room, pd) {
  do {
    pd.i += 1;
  } while (pd.i < pd.order.length && !getPlayer(room, pd.order[pd.i]).alive);
  if (pd.i >= pd.order.length || pd.cards.length === 0) {
    room.discard.push(...pd.cards); // 남은 카드(탈락자 몫)는 버린다
    room.pending = null;
  } else {
    pd.who = pd.order[pd.i];
  }
}

// 대응: card를 내거나(빗나감!/뱅!/맥주), card 없이 호출하면 포기(맞기/죽기)
function respond(room, id, cardId) {
  const pd = room.pending;
  if (!pd || pd.who !== id || (pd.t !== 'respond' && pd.t !== 'dying')) return { error: '지금은 대응할 차례가 아니에요.' };
  const me = getPlayer(room, id);

  if (pd.t === 'dying') {
    if (cardId == null) {
      room.pending = null;
      eliminate(room, me, pd.source);
    } else {
      const card = me.hand.find((c) => c.id === cardId);
      if (!card || card.key !== 'beer') return { error: '맥주만 쓸 수 있어요.' };
      me.hand = me.hand.filter((c) => c !== card);
      room.discard.push(card);
      me.life += 1;
      say(room, `${me.name}님이 맥주를 마셨어요. (체력 ${me.life})`);
      afterSaveAttempt(room, me, pd);
    }
    run(room);
    return {};
  }

  if (cardId == null) {
    room.pending = null;
    damage(room, me, 1, pd.kind === 'duel' ? pd.other : pd.source);
    run(room);
    return {};
  }
  if (!respondCards(me, pd.kind).includes(cardId)) return { error: '그 카드로는 막을 수 없어요.' };
  const card = removeFromHand(me, cardId);
  room.discard.push(card);
  say(room, `${me.name}님이 ${CARDS[card.key].name}을(를) 냈어요.`);
  room.pending = null;
  if (pd.kind === 'duel') {
    room.queue.unshift({ t: 'duel', who: pd.other, other: pd.who });
  } else if ((pd.kind === 'bang' || pd.kind === 'gatling') && pd.need > 1) {
    askRespond(room, pd.kind, me, pd.source, pd.need - 1);
  }
  run(room);
  return {};
}

function afterSaveAttempt(room, me, pd) {
  if (me.life > 0) {
    room.pending = null;
  } else if (!canSave(room, me)) {
    room.pending = null;
    eliminate(room, me, pd.source);
  }
}

// 시드: 카드 2장을 버리고 체력 1 회복
function sid(room, id, cardIds) {
  const me = getPlayer(room, id);
  if (!me || me.char !== 'sid' || !me.alive) return { error: '시드 케첨만 쓸 수 있어요.' };
  const dying = room.pending && room.pending.t === 'dying' && room.pending.who === id;
  const mine = ready(room) && cur(room).id === id;
  if (!dying && !mine) return { error: '지금은 쓸 수 없어요.' };
  if (!dying && me.life >= me.max) return { error: '체력이 가득 차 있어요.' };
  const ids = Array.isArray(cardIds) ? [...new Set(cardIds)] : [];
  if (ids.length !== 2 || !ids.every((c) => me.hand.some((h) => h.id === c))) return { error: '버릴 카드 2장을 고르세요.' };
  ids.forEach((c) => room.discard.push(removeFromHand(me, c)));
  me.life += 1;
  say(room, `${me.name}님(시드)이 카드 2장을 버리고 체력을 회복했어요. (체력 ${me.life})`);
  if (dying) afterSaveAttempt(room, me, room.pending);
  run(room);
  return {};
}

// ---- 내 턴의 행동 ----

function checkPlayable(room, me, key) {
  switch (key) {
    case 'bang':
      if (room.bangUsed && !hasEquip(me, 'volcanic') && me.char !== 'willy') return { error: '이번 차례에는 이미 뱅!을 썼어요.' };
      if (targetsFor(room, me, 'bang').length === 0) return { error: '사거리 안에 아무도 없어요.' };
      return null;
    case 'beer':
      if (me.life >= me.max) return { error: '체력이 가득 차 있어요.' };
      if (liveCount(room) <= 2) return { error: '둘만 남으면 맥주를 쓸 수 없어요.' };
      return null;
    case 'missed':
      return { error: '빗나감!은 공격당할 때만 낼 수 있어요.' };
    case 'panic':
    case 'catbalou':
    case 'duel':
    case 'jail':
      return targetsFor(room, me, key).length ? null : { error: '고를 수 있는 대상이 없어요.' };
    default:
      break;
  }
  const def = CARDS[key];
  if (def.type !== 'brown' && hasEquip(me, key)) return { error: '같은 장비가 이미 있어요.' };
  return null;
}

function targetsFor(room, me, key) {
  const others = othersFrom(room, me);
  switch (key) {
    case 'bang': return others.filter((t) => distance(room, me, t) <= weaponRange(me)).map((t) => t.id);
    case 'panic': return others.filter((t) => distance(room, me, t) <= 1 && cardCount(t) > 0).map((t) => t.id);
    case 'catbalou': return others.filter((t) => cardCount(t) > 0).map((t) => t.id);
    case 'duel': return others.map((t) => t.id);
    case 'jail': return others.filter((t) => t.role !== 'sheriff' && !hasEquip(t, 'jail')).map((t) => t.id);
    default: return [];
  }
}

function play(room, id, cardId, targetId, pick) {
  if (!ready(room)) return { error: '지금은 카드를 낼 수 없어요.' };
  const me = cur(room);
  if (me.id !== id) return { error: '내 차례가 아니에요.' };
  if (room.discarding) return { error: '먼저 손패를 줄이세요.' };
  const card = me.hand.find((c) => c.id === cardId);
  if (!card) return { error: '그 카드는 손에 없어요.' };
  const key = effectiveKey(me, card);
  const bad = checkPlayable(room, me, key);
  if (bad) return bad;

  let target = null;
  if (TARGETED.has(key)) {
    target = getPlayer(room, targetId);
    if (!target || !targetsFor(room, me, key).includes(target.id)) return { error: '그 대상은 고를 수 없어요.' };
  }
  let stealFrom = null; // 패닉!/캣 발루로 건드릴 카드
  if (key === 'panic' || key === 'catbalou') {
    const wantHand = pick === 'hand' || (pick == null && target.hand.length > 0);
    if (wantHand) {
      if (target.hand.length === 0) return { error: '손패가 없어요.' };
      stealFrom = 'hand';
    } else {
      stealFrom = target.table.find((c) => c.id === pick);
      if (!stealFrom) return { error: '가져올 카드를 고르세요.' };
    }
  }

  me.hand = me.hand.filter((c) => c !== card);
  const name = CARDS[card.key].name;
  switch (key) {
    case 'bang':
      room.bangUsed = true;
      room.discard.push(card);
      say(room, `${me.name}님이 ${target.name}님에게 뱅!`);
      room.queue.unshift({ t: 'attack', kind: 'bang', source: me.id, target: target.id });
      break;
    case 'beer':
      room.discard.push(card);
      me.life += 1;
      say(room, `${me.name}님이 맥주를 마셨어요. (체력 ${me.life})`);
      break;
    case 'saloon':
      room.discard.push(card);
      room.players.filter((p) => p.alive).forEach((p) => { p.life = Math.min(p.max, p.life + 1); });
      say(room, `${me.name}님이 살롱을 열었어요. 모두 체력 +1`);
      break;
    case 'stagecoach':
      room.discard.push(card);
      drawCards(room, me, 2);
      say(room, `${me.name}님이 역마차로 2장을 뽑았어요.`);
      break;
    case 'wellsfargo':
      room.discard.push(card);
      drawCards(room, me, 3);
      say(room, `${me.name}님이 웰스 파고로 3장을 뽑았어요.`);
      break;
    case 'panic':
    case 'catbalou': {
      room.discard.push(card);
      let taken;
      if (stealFrom === 'hand') {
        taken = target.hand.splice(rand(target.hand.length), 1)[0];
        say(room, `${me.name}님이 ${target.name}님의 손패 1장을 ${key === 'panic' ? '가져왔어요' : '버리게 했어요'}.`);
      } else {
        taken = stealFrom;
        target.table = target.table.filter((c) => c !== taken);
        say(room, `${me.name}님이 ${target.name}님의 ${CARDS[taken.key].name}을(를) ${key === 'panic' ? '가져왔어요' : '버리게 했어요'}.`);
      }
      if (key === 'panic') me.hand.push(taken);
      else room.discard.push(taken);
      break;
    }
    case 'genstore':
      room.discard.push(card);
      say(room, `${me.name}님이 잡화점을 열었어요.`);
      room.queue.unshift({ t: 'store', starter: me.id });
      break;
    case 'indians':
      room.discard.push(card);
      say(room, `${me.name}님이 인디언!`);
      room.queue.unshift(...othersFrom(room, me).map((t) => ({ t: 'indian', source: me.id, target: t.id })));
      break;
    case 'gatling':
      room.discard.push(card);
      say(room, `${me.name}님이 개틀링!`);
      room.queue.unshift(...othersFrom(room, me).map((t) => ({ t: 'attack', kind: 'gatling', source: me.id, target: t.id })));
      break;
    case 'duel':
      room.discard.push(card);
      say(room, `${me.name}님이 ${target.name}님에게 결투를 신청했어요!`);
      room.queue.unshift({ t: 'duel', who: target.id, other: me.id });
      break;
    case 'jail':
      target.table.push(card);
      say(room, `${me.name}님이 ${target.name}님을 감옥에 가뒀어요.`);
      break;
    default: {
      // 장비
      if (CARDS[key].type === 'gun') {
        const old = me.table.find((c) => CARDS[c.key].type === 'gun');
        if (old) {
          me.table = me.table.filter((c) => c !== old);
          room.discard.push(old);
        }
      }
      me.table.push(card);
      say(room, `${me.name}님이 ${name}을(를) 장착했어요.`);
    }
  }
  run(room);
  return {};
}

function endTurn(room, id) {
  if (!ready(room)) return { error: '지금은 턴을 끝낼 수 없어요.' };
  const me = cur(room);
  if (me.id !== id) return { error: '내 차례가 아니에요.' };
  if (me.hand.length > me.life) {
    room.discarding = true;
    return {};
  }
  room.queue.push({ t: 'nextTurn' });
  run(room);
  return {};
}

function discardCard(room, id, cardId) {
  if (!ready(room) || !room.discarding) return { error: '지금은 카드를 버릴 때가 아니에요.' };
  const me = cur(room);
  if (me.id !== id) return { error: '내 차례가 아니에요.' };
  const card = removeFromHand(me, cardId);
  if (!card) return { error: '그 카드는 손에 없어요.' };
  room.discard.push(card);
  if (me.hand.length <= me.life) {
    room.discarding = false;
    room.queue.push({ t: 'nextTurn' });
    run(room);
  }
  return {};
}

// 방장: 자리를 비운 사람 때문에 멈췄을 때 그 사람 몫을 기본값으로 처리
function force(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase !== 'play') return { error: '지금은 게임 중이 아니에요.' };
  const pd = room.pending;
  if (pd) {
    const who = pd.who;
    if (pd.t === 'barrel') useBarrel(room, who, true); // 자리를 비운 사람은 배럴을 쓴 것으로 (손해 볼 일이 없다)
    else if (pd.t === 'respond' || pd.t === 'dying') respond(room, who, null);
    else if (pd.t === 'store') store(room, who, pd.cards[0].id);
    else if (pd.t === 'drawChoice') choose(room, who, { opt: 'deck' });
    else if (pd.t === 'kit') choose(room, who, { card: pd.cards[pd.cards.length - 1] });
    return {};
  }
  if (ready(room)) {
    const me = cur(room);
    while (me.hand.length > me.life) room.discard.push(me.hand.splice(rand(me.hand.length), 1)[0]);
    room.discarding = false;
    room.queue.push({ t: 'nextTurn' });
    run(room);
  }
  return {};
}

// ---- 시작 / 초기화 ----

function start(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 시작할 수 있어요.' };
  if (room.phase !== 'lobby') return { error: '이미 시작됐어요.' };
  const n = room.players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) return { error: `${MIN_PLAYERS}~${MAX_PLAYERS}명이 모여야 해요.` };
  if (room.players.some((p) => !p.connected)) return { error: '접속이 끊긴 사람이 있어요.' };

  room.players = shuffle(room.players);
  const roles = shuffle(ROLE_SETS[n]);
  const chars = shuffle(Object.keys(CHARS));
  room.deck = shuffle(DECK);
  room.discard = [];
  room.players.forEach((p, i) => {
    p.role = roles[i];
    p.char = chars[i];
    p.max = CHARS[p.char].life + (p.role === 'sheriff' ? 1 : 0);
    p.life = p.max;
    p.alive = true;
    p.table = [];
    p.hand = [];
  });
  room.players.forEach((p) => drawCards(room, p, p.max));
  room.turn = room.players.findIndex((p) => p.role === 'sheriff');
  room.queue = [];
  room.pending = null;
  room.winner = null;
  room.reason = null;
  room.log = [];
  room.gameNo += 1;
  room.phase = 'play';
  say(room, '게임 시작! 보안관부터 시작해요.');
  beginTurn(room);
  run(room);
  return {};
}

function backToLobby(room, byId) {
  if (byId !== room.hostId) return { error: '방장만 할 수 있어요.' };
  if (room.phase === 'lobby') return { error: '이미 대기실이에요.' };
  if (room.phase === 'over') room.players = room.players.filter((p) => p.connected);
  room.players.forEach((p) => {
    Object.assign(p, { role: null, char: null, life: 0, max: 0, hand: [], table: [], alive: true });
  });
  if (!getPlayer(room, room.hostId)) room.hostId = room.players[0] ? room.players[0].id : null;
  Object.assign(room, { phase: 'lobby', deck: [], discard: [], queue: [], pending: null, winner: null, reason: null, log: [], discarding: false });
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

const KEY_ORDER = Object.keys(CARDS);
const pub = (c) => ({ id: c.id, key: c.key, suit: c.suit, rank: c.rank });

function viewFor(room, viewerId) {
  const me = getPlayer(room, viewerId);
  const started = room.phase !== 'lobby';
  const over = room.phase === 'over';
  const pd = room.pending;
  const idle = ready(room);
  const myMain = idle && me && cur(room).id === viewerId;
  const iAmWho = !!(pd && me && pd.who === viewerId);

  let mode = 'wait';
  if (!started) mode = 'lobby';
  else if (over) mode = 'over';
  else if (pd) mode = iAmWho ? pd.t : 'wait';
  else if (myMain) mode = room.discarding ? 'discard' : 'main';

  const hand = me
    ? me.hand
        .slice()
        .sort((a, b) => KEY_ORDER.indexOf(a.key) - KEY_ORDER.indexOf(b.key) || a.id - b.id)
        .map((c) => {
          const info = { ...pub(c), ok: false, targets: null, asBang: false };
          if (mode === 'main') {
            const key = effectiveKey(me, c);
            info.asBang = key !== c.key;
            info.ok = !checkPlayable(room, me, key);
            if (info.ok && TARGETED.has(key)) info.targets = targetsFor(room, me, key);
          } else if (mode === 'discard') {
            info.ok = true;
          } else if (mode === 'respond') {
            info.ok = respondCards(me, pd.kind).includes(c.id);
          } else if (mode === 'dying') {
            info.ok = c.key === 'beer';
          } else if (mode === 'kit') {
            info.ok = pd.cards.includes(c.id);
          }
          return info;
        })
    : [];

  let pending = null;
  if (pd && started && !over) {
    pending = { t: pd.t, who: pd.who, kind: pd.kind || null, source: pd.source || null, other: pd.other || null, need: pd.need || null, barrels: pd.barrels || null };
    if (pd.t === 'store') pending.cards = pd.cards.map(pub);
    if (pd.t === 'drawChoice' && iAmWho) {
      pending.options = pd.options;
      pending.discardTop = pd.kind === 'pedro' && room.discard.length ? pub(room.discard[room.discard.length - 1]) : null;
    }
  }

  const canSid = !!(me && me.alive && me.char === 'sid' && me.hand.length >= 2 && started && !over
    && ((mode === 'main' && me.life < me.max) || mode === 'dying' || (mode === 'discard' && me.life < me.max)));

  return {
    kind: 'bang',
    code: room.code,
    me: viewerId,
    hostId: room.hostId,
    phase: room.phase,
    gameNo: room.gameNo,
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    mode,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      connected: p.connected,
      alive: p.alive,
      life: Math.max(p.life, 0),
      max: p.max,
      handCount: p.hand.length,
      dist: me && me.alive && p.alive && p.id !== viewerId ? distance(room, me, p) : null,
      table: p.table.map(pub),
      char: started ? p.char : null,
      role: started && (over || !p.alive || p.role === 'sheriff' || p.id === viewerId) ? p.role : null,
    })),
    turnId: started && !over ? cur(room).id : null,
    deckCount: room.deck.length,
    discardTop: room.discard.length ? pub(room.discard[room.discard.length - 1]) : null,
    bangUsed: room.bangUsed,
    range: me && me.alive ? weaponRange(me) : null,
    needDiscard: me && mode === 'discard' ? Math.max(0, me.hand.length - me.life) : 0,
    hand,
    pending,
    canSid,
    winner: room.winner,
    log: room.log,
  };
}

const actions = {
  start: (room, id) => start(room, id),
  again: (room, id) => backToLobby(room, id),
  restart: (room, id) => restart(room, id),
  force: (room, id) => force(room, id),
  play: (room, id, msg) => play(room, id, msg.card, msg.target, msg.pick),
  end: (room, id) => endTurn(room, id),
  discard: (room, id, msg) => discardCard(room, id, msg.card),
  respond: (room, id, msg) => respond(room, id, msg.card ?? null),
  barrel: (room, id, msg) => useBarrel(room, id, msg.use !== false),
  store: (room, id, msg) => store(room, id, msg.card),
  choose: (room, id, msg) => choose(room, id, msg),
  sid: (room, id, msg) => sid(room, id, msg.cards),
};

module.exports = {
  actions,
  afterDisconnect: () => {},
  DECK,
  MIN_PLAYERS,
  MAX_PLAYERS,
  ROLE_SETS,
  createRoom,
  addPlayer,
  getPlayer,
  removePlayer,
  kick,
  start,
  backToLobby,
  restart,
  play,
  endTurn,
  discardCard,
  respond,
  useBarrel,
  store,
  choose,
  sid,
  force,
  viewFor,
  distance,
  weaponRange,
  run,
  ready,
  cur,
  cardLabel,
};
