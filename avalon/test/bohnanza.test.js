'use strict';
const test = require('node:test');
const assert = require('node:assert');
const bz = require('../bohnanza');
const DATA = require('../public/bohnanza-data.js');

let nid = 9000;
const C = (type) => ({ id: nid++, type });

function mk(n = 4) {
  const room = bz.createRoom('BZ');
  for (let i = 0; i < n; i++) bz.addPlayer(room, `p${i}`);
  assert.deepStrictEqual(bz.start(room, room.hostId), {});
  return room;
}
const P = (room, i) => room.players[i];
const cur = (room) => room.players[room.turn];
const hand = (room, i, ...types) => { P(room, i).hand = types.map(C); };
const field = (room, i, idx, type, count) => {
  P(room, i).fields[idx] = { type, cards: Array.from({ length: count }, () => C(type)) };
};
const total = (room) => room.deck.length + room.discard.length + room.faceUp.length
  + room.players.reduce((n, p) => n + p.hand.length + p.table.length + p.coins.length + p.fields.reduce((k, f) => k + f.cards.length, 0), 0);

test('카드 150장: 종류별 장수가 데이터와 같다', () => {
  assert.strictEqual(bz.ALL_CARDS.length, 150);
  for (const [type, b] of Object.entries(DATA.BEANS)) assert.strictEqual(bz.ALL_CARDS.filter((c) => c.type === type).length, b.n, type);
  assert.strictEqual(new Set(bz.ALL_CARDS.map((c) => c.id)).size, 150);
});

test('빈오미터: 기준 이상이면 해당 코인, 미만이면 0', () => {
  const f = DATA.coinsFor;
  assert.deepStrictEqual([3, 4, 6, 7, 9, 10, 12, 13].map((n) => f('coffee', n)), [0, 1, 1, 2, 2, 3, 4, 4]);
  assert.deepStrictEqual([1, 2, 3, 4, 5].map((n) => f('red', n)), [0, 1, 2, 3, 4]);
  assert.deepStrictEqual([1, 2, 3, 4].map((n) => f('garden', n)), [0, 2, 3, 3]);
  assert.deepStrictEqual([2, 3, 5, 7].map((n) => f('stink', n)), [0, 1, 2, 3]);
});

test('시작: 3~5명, 손패 5장, 밭 2개, 3명이면 커피콩을 뺀다', () => {
  const one = bz.createRoom('X');
  bz.addPlayer(one, 'a'); bz.addPlayer(one, 'b');
  assert.ok(bz.start(one, one.hostId).error);
  const full = bz.createRoom('Y');
  for (let i = 0; i < 5; i++) bz.addPlayer(full, `p${i}`);
  assert.ok(bz.addPlayer(full, 'p6').error);
  for (const [n, cards] of [[3, 126], [4, 150], [5, 150]]) {
    const room = mk(n);
    assert.ok(room.players.every((p) => p.hand.length === 5 && p.fields.length === 2));
    assert.strictEqual(total(room), cards, `${n}명`);
    assert.strictEqual(room.step, 'plant1');
    assert.strictEqual(room.deckRuns, 1);
    if (n === 3) assert.ok(![...room.deck, ...room.players.flatMap((p) => p.hand)].some((c) => c.type === 'coffee'));
  }
});

test('심기: 손패 맨 앞 카드부터, 같은 종류만 한 밭에, 최대 2장', () => {
  const room = mk(3);
  const A = cur(room);
  hand(room, room.turn, 'red', 'soy', 'blue', 'green', 'chili');
  const [first, second, third] = A.hand;
  assert.ok(bz.plant(room, A.id, second.id, 0).error); // 두 번째 카드는 먼저 못 심는다
  assert.ok(bz.skipPlant(room, A.id).error); // 첫 카드는 반드시 심어야
  assert.ok(bz.plant(room, room.players.find((p) => p !== A).id, first.id, 0).error); // 남의 차례
  assert.deepStrictEqual(bz.plant(room, A.id, first.id, 0), {});
  assert.strictEqual(A.fields[0].type, 'red');
  assert.strictEqual(A.hand.length, 4);
  assert.strictEqual(room.step, 'plant1');
  assert.deepStrictEqual(bz.plant(room, A.id, second.id, 0).error !== undefined, true); // 다른 종류는 같은 밭에 못 심음
  assert.deepStrictEqual(bz.plant(room, A.id, second.id, 1), {});
  assert.strictEqual(room.step, 'trade'); // 2장을 심으면 바로 거래 단계
  assert.strictEqual(room.faceUp.length, 2);
  assert.ok(bz.plant(room, A.id, third.id, 0).error);
});

test('한 장만 심고 넘길 수 있다. 손패가 없으면 심기를 건너뛴다', () => {
  const room = mk(3);
  const A = cur(room);
  const first = A.hand[0];
  bz.plant(room, A.id, first.id, 0);
  assert.deepStrictEqual(bz.skipPlant(room, A.id), {});
  assert.strictEqual(room.step, 'trade');

  const empty = mk(3);
  empty.players.forEach((p) => { p.hand = []; });
  const A2 = cur(empty);
  hand(empty, empty.turn, 'red');
  bz.plant(empty, A2.id, A2.hand[0].id, 0); // 마지막 카드를 심고 손패가 비면 바로 거래
  assert.strictEqual(empty.step, 'trade');
});

test('밭에 다른 콩이 있으면 심을 수 없고, 수확해야 한다', () => {
  const room = mk(3);
  const A = cur(room);
  field(room, room.turn, 0, 'blue', 3);
  field(room, room.turn, 1, 'green', 2);
  hand(room, room.turn, 'red', 'soy');
  assert.match(bz.plant(room, A.id, A.hand[0].id, 0).error, /수확/);
  assert.match(bz.plant(room, A.id, A.hand[0].id, 1).error, /수확/);
  assert.deepStrictEqual(bz.harvest(room, A.id, 1), {}); // 녹색콩 2개 → 코인 0
  assert.deepStrictEqual(bz.plant(room, A.id, A.hand[0].id, 1), {});
  assert.strictEqual(A.fields[1].type, 'red');
});

test('수확: 빈오미터대로 코인이 되고 나머지는 버린다. 남의 차례에도 가능', () => {
  const room = mk(3);
  const other = room.players.find((p) => p !== cur(room));
  const idx = room.players.indexOf(other);
  field(room, idx, 0, 'blue', 6); // 푸른콩 6개 = 코인 2
  const before = total(room);
  const discard0 = room.discard.length;
  assert.deepStrictEqual(bz.harvest(room, other.id, 0), {});
  assert.strictEqual(other.coins.length, 2);
  assert.strictEqual(room.discard.length, discard0 + 4);
  assert.strictEqual(other.fields[0].type, null);
  assert.strictEqual(total(room), before);
  assert.ok(bz.harvest(room, other.id, 0).error); // 빈 밭
  assert.ok(bz.harvest(room, other.id, 5).error);
});

test('콩이 1개뿐인 밭은 다른 밭에 2개 이상이면 수확할 수 없다 (모두 1개면 가능)', () => {
  const room = mk(3);
  const p = P(room, 0);
  field(room, 0, 0, 'red', 1);
  field(room, 0, 1, 'soy', 2);
  assert.match(bz.harvest(room, p.id, 0).error, /1개뿐/);
  assert.deepStrictEqual(bz.harvest(room, p.id, 1), {}); // 2개 밭은 수확 가능
  assert.deepStrictEqual(bz.harvest(room, p.id, 0), {}); // 이제 둘 다 1개 이하라서 가능
  const flags = bz.viewFor(room, p.id).players[0].fields.map((f) => f.canHarvest);
  assert.deepStrictEqual(flags, [false, false]);
});

test('세 번째 밭: 코인 3개로 살 수 있고 최대 3개', () => {
  const room = mk(3);
  const p = P(room, 1);
  assert.match(bz.buyField(room, p.id).error, /코인/);
  p.coins = [C('red'), C('red'), C('red'), C('red')];
  const before = total(room);
  assert.deepStrictEqual(bz.buyField(room, p.id), {});
  assert.strictEqual(p.fields.length, 3);
  assert.strictEqual(p.coins.length, 1);
  assert.strictEqual(total(room), before);
  p.coins = [C('red'), C('red'), C('red')];
  assert.match(bz.buyField(room, p.id).error, /최대 3개/);
});

function toTrade(n = 4) {
  const room = mk(n);
  const A = cur(room);
  bz.plant(room, A.id, A.hand[0].id, 0);
  bz.skipPlant(room, A.id);
  assert.strictEqual(room.step, 'trade');
  return room;
}

test('거래: 차례인 사람이 내놓은 카드와 제안한 사람의 카드가 교환되고, 받은 카드는 심을 카드가 된다', () => {
  const room = toTrade();
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  const offerCard = A.hand[0];
  const wantFaceUp = room.faceUp[0];
  B.hand = [C('red'), C('soy')];
  const give = B.hand[0];
  assert.ok(bz.offer(room, B.id, [offerCard.id]).error); // 차례인 사람만
  assert.ok(bz.offer(room, A.id, [99999]).error);
  assert.deepStrictEqual(bz.offer(room, A.id, [offerCard.id]), {});
  assert.deepStrictEqual(room.offered, [offerCard.id]);
  assert.ok(bz.propose(room, A.id, [], [offerCard.id]).error); // 차례인 사람은 제안 못 함
  assert.ok(bz.propose(room, B.id, [], []).error);
  assert.ok(bz.propose(room, B.id, [99999], [offerCard.id]).error);
  assert.ok(bz.propose(room, B.id, [give.id], [A.hand[3].id]).error); // 내놓지 않은 카드는 못 원함
  assert.deepStrictEqual(bz.propose(room, B.id, [give.id], [offerCard.id, wantFaceUp.id]), {});
  const v = bz.viewFor(room, A.id);
  assert.strictEqual(v.proposals.length, 1);
  assert.deepStrictEqual(v.proposals[0].give.map((c) => c.id), [give.id]);
  const handBefore = A.hand.length;
  assert.deepStrictEqual(bz.accept(room, A.id, B.id), {});
  assert.strictEqual(A.hand.length, handBefore - 1);
  assert.strictEqual(room.faceUp.length, 1);
  assert.deepStrictEqual(B.table.map((c) => c.id).sort(), [offerCard.id, wantFaceUp.id].sort());
  assert.deepStrictEqual(A.table.map((c) => c.id), [give.id]);
  assert.strictEqual(B.hand.length, 1);
  assert.deepStrictEqual(room.proposals, {});
  assert.deepStrictEqual(room.offered, []);
});

test('선물(한쪽만 주는 제안)도 되고, 같은 사람의 새 제안은 이전 것을 대체한다', () => {
  const room = toTrade();
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  B.hand = [C('red')];
  bz.propose(room, B.id, [B.hand[0].id], []);
  bz.propose(room, B.id, [], [room.faceUp[0].id]);
  assert.strictEqual(Object.keys(room.proposals).length, 1);
  assert.deepStrictEqual(room.proposals[B.id].give, []);
  assert.deepStrictEqual(bz.withdraw(room, B.id), {});
  assert.deepStrictEqual(room.proposals, {});
  bz.propose(room, B.id, [B.hand[0].id], []); // B가 A에게 빨간콩을 선물
  assert.deepStrictEqual(bz.reject(room, A.id, B.id), {});
  assert.deepStrictEqual(room.proposals, {});
  bz.propose(room, B.id, [B.hand[0].id], []);
  bz.accept(room, A.id, B.id);
  assert.strictEqual(A.table.length, 1);
  assert.strictEqual(B.hand.length, 0);
});

test('같은 카드를 두 사람이 원하면 먼저 수락한 쪽만 받고 나머지 제안은 사라진다', () => {
  const room = toTrade(4);
  const A = cur(room);
  const [B, C2] = room.players.filter((p) => p !== A);
  B.hand = [C('red')]; C2.hand = [C('soy')];
  const target = room.faceUp[0];
  bz.propose(room, B.id, [B.hand[0].id], [target.id]);
  bz.propose(room, C2.id, [C2.hand[0].id], [target.id]);
  bz.accept(room, A.id, B.id);
  assert.deepStrictEqual(Object.keys(room.proposals), []);
  assert.ok(bz.accept(room, A.id, C2.id).error);
});

test('내놓기를 취소하면 그 카드를 원하던 제안이 사라진다', () => {
  const room = toTrade();
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  B.hand = [C('red')];
  bz.offer(room, A.id, [A.hand[0].id]);
  bz.propose(room, B.id, [], [A.hand[0].id]);
  assert.strictEqual(Object.keys(room.proposals).length, 1);
  bz.offer(room, A.id, []);
  assert.strictEqual(Object.keys(room.proposals).length, 0);
});

test('거래가 끝나면 남은 펼친 카드도 심어야 하고, 모두 심으면 3장을 뽑고 다음 차례', () => {
  const room = toTrade(3);
  const A = cur(room);
  const turnBefore = room.turn;
  const deckBefore = room.deck.length;
  const faceUpIds = room.faceUp.map((c) => c.id);
  assert.ok(bz.plant(room, A.id, faceUpIds[0], 1).error); // 거래 중에는 심을 수 없다
  assert.ok(bz.endTrade(room, room.players.find((p) => p !== A).id).error);
  assert.deepStrictEqual(bz.endTrade(room, A.id), {});
  assert.strictEqual(room.step, 'plantAll');
  assert.deepStrictEqual(A.table.map((c) => c.id), faceUpIds);
  // 두 장 모두 심기 (밭을 비워 둔다)
  A.fields = [{ type: null, cards: [] }, { type: null, cards: [] }];
  A.fields[0] = { type: A.table[0].type, cards: [] };
  const handLen = A.hand.length;
  bz.plant(room, A.id, A.table[0].id, 0);
  if (A.table.length) {
    const c = A.table[0];
    const idx = A.fields.findIndex((f) => f.type === c.type || f.type === null);
    bz.plant(room, A.id, c.id, idx);
  }
  assert.strictEqual(room.turn, (turnBefore + 1) % 3);
  assert.strictEqual(room.step, 'plant1');
  assert.strictEqual(A.hand.length, handLen + 3);
  assert.strictEqual(room.deck.length, deckBefore - 3);
  assert.deepStrictEqual(room.faceUp, []);
});

test('다른 플레이어도 받은 카드를 모두 심어야 다음으로 넘어간다', () => {
  const room = toTrade(3);
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  A.fields = [{ type: null, cards: [] }, { type: null, cards: [] }];
  B.fields = [{ type: null, cards: [] }, { type: null, cards: [] }];
  room.faceUp = [C('soy'), C('soy')];
  B.hand = [C('red'), C('chili')]; // 거래 뒤에도 카드가 남아 다음 차례에 심기부터 시작
  const turn = room.turn;
  // B가 빨간콩을 주고 펼친 대두 한 장을 가져간다
  bz.propose(room, B.id, [B.hand[0].id], [room.faceUp[0].id]);
  bz.accept(room, A.id, B.id);
  bz.endTrade(room, A.id);
  assert.strictEqual(room.step, 'plantAll');
  assert.deepStrictEqual(A.table.map((c) => c.type).sort(), ['red', 'soy']);
  assert.deepStrictEqual(B.table.map((c) => c.type), ['soy']);
  assert.strictEqual(bz.viewFor(room, B.id).mode, 'plantAll');
  A.table.slice().forEach((c, i) => assert.deepStrictEqual(bz.plant(room, A.id, c.id, c.type === 'red' ? 0 : 1), {}, `A ${i}`));
  assert.strictEqual(room.step, 'plantAll'); // 아직 B가 심지 않았다
  assert.strictEqual(room.turn, turn);
  assert.strictEqual(bz.viewFor(room, A.id).mode, 'wait');
  bz.plant(room, B.id, B.table[0].id, 0);
  assert.strictEqual(room.step, 'plant1');
  assert.strictEqual(room.turn, (turn + 1) % 3);
});

test('덱이 바닥나면 버린 더미를 섞고(2번째 덱), 세 번째로 바닥나면 게임이 끝나고 모두 수확한다', () => {
  const room = mk(3);
  room.deck = [C('red')];
  room.discard = [C('soy'), C('soy'), C('soy'), C('soy'), C('soy')];
  const A = cur(room);
  bz.plant(room, A.id, A.hand[0].id, 0);
  bz.skipPlant(room, A.id); // 2장 펼침: 덱 1장 + 섞은 더미 1장
  assert.strictEqual(room.deckRuns, 2);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(room.faceUp.length, 2);
  // 마지막 덱까지 바닥내기
  const end = mk(3);
  end.deckRuns = 3;
  end.deck = [C('red')];
  end.discard = [];
  field(end, 0, 0, 'red', 2); // 팥 2개 = 코인 1
  field(end, 1, 1, 'soy', 4); // 대두 4개 = 코인 2
  const B = cur(end);
  bz.plant(end, B.id, B.hand[0].id, end.players.indexOf(B) === 0 ? 1 : 0);
  bz.skipPlant(end, B.id);
  assert.strictEqual(end.phase, 'over');
  assert.ok(end.winnerIds.length >= 1);
  assert.ok(end.players.every((p) => p.fields.every((f) => f.cards.length === 0)));
  assert.strictEqual(end.scores[end.players[1].id] >= 2, true);
  assert.ok(bz.harvest(end, B.id, 0).error); // 끝난 뒤에는 불가
});

test('각자에게는 자기 손패만 보이고, 펼친 카드/제안/밭은 모두에게 보인다', () => {
  const room = toTrade(4);
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  const v = bz.viewFor(room, B.id);
  assert.strictEqual(v.hand.length, B.hand.length);
  const mine = new Set(v.hand.map((c) => c.id));
  assert.ok(A.hand.every((c) => !mine.has(c.id)));
  assert.strictEqual(v.faceUp.length, 2);
  assert.strictEqual(v.mode, 'tradeB');
  assert.strictEqual(bz.viewFor(room, A.id).mode, 'tradeA');
  assert.ok(v.players.every((p) => !('hand' in p) && typeof p.handCount === 'number'));
  assert.strictEqual(v.players.find((p) => p.id === A.id).fields.length, 2);
  assert.strictEqual(v.players.find((p) => p.id === B.id).fields[0].canHarvest !== null, true);
  assert.strictEqual(v.players.find((p) => p.id === A.id).fields[0].canHarvest, null);
});

test('방장 force: 대신 심고 거래를 끝내고 모두 심게 한다', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(bz.force(room, nonHost.id).error);
  assert.deepStrictEqual(bz.force(room, room.hostId), {}); // plant1 → 대신 심고 거래 시작
  assert.strictEqual(room.step, 'trade');
  assert.deepStrictEqual(bz.force(room, room.hostId), {}); // trade → 끝내고 심기 → 가능하면 다음 차례
  assert.ok(['plantAll', 'plant1'].includes(room.step));
  if (room.step === 'plantAll') bz.force(room, room.hostId);
  assert.strictEqual(room.step, 'plant1');
  assert.strictEqual(total(room), 126);
});

test('초기화와 다시 시작', () => {
  const room = mk(4);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(bz.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(bz.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.strictEqual(total(room), 150);
  assert.deepStrictEqual(bz.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(bz.backToLobby(room, room.hostId).error);
});

// ---- 무작위로 끝까지 ----

function plantSomewhere(room, p, card, fromTable) {
  // 같은 콩 밭 → 빈 밭 → (없으면) 수확 가능한 밭을 수확하고 심기
  for (let tries = 0; tries < 4; tries++) {
    let idx = p.fields.findIndex((f) => f.type === card.type);
    if (idx < 0) idx = p.fields.findIndex((f) => f.cards.length === 0);
    if (idx >= 0) {
      assert.deepStrictEqual(bz.plant(room, p.id, card.id, idx), {}, `plant ${fromTable ? 'table' : 'hand'}`);
      return;
    }
    const opts = p.fields.map((f, i) => i).filter((i) => bz.canHarvest(p, i));
    assert.ok(opts.length, '수확할 수 있는 밭이 하나도 없어요');
    assert.deepStrictEqual(bz.harvest(room, p.id, opts[Math.floor(Math.random() * opts.length)]), {});
  }
  assert.fail('심지 못했어요');
}

test('3~5명이 무작위로 끝까지 두면 항상 끝나고 카드 수가 보존된다', () => {
  let finished = 0;
  let games = 0;
  for (const n of [3, 4, 5]) {
    for (let g = 0; g < 12; g++) {
      const room = mk(n);
      const want = n === 3 ? 126 : 150;
      for (let step = 0; step < 8000 && room.phase === 'play'; step++) {
        const A = cur(room);
        if (room.step === 'plant1') {
          if (room.plantCount < 1) plantSomewhere(room, A, A.hand[0], false);
          else if (Math.random() < 0.5 && A.hand.length) plantSomewhere(room, A, A.hand[0], false);
          else assert.deepStrictEqual(bz.skipPlant(room, A.id), {});
        } else if (room.step === 'trade') {
          const r = Math.random();
          const others = room.players.filter((p) => p !== A);
          if (r < 0.25 && A.hand.length) {
            const k = Math.floor(Math.random() * Math.min(3, A.hand.length)) + 1;
            assert.deepStrictEqual(bz.offer(room, A.id, A.hand.slice(0, k).map((c) => c.id)), {});
          } else if (r < 0.6) {
            const q = others[Math.floor(Math.random() * others.length)];
            const vis = [...room.faceUp.map((c) => c.id), ...room.offered];
            const give = q.hand.length && Math.random() < 0.7 ? [q.hand[Math.floor(Math.random() * q.hand.length)].id] : [];
            const want = vis.length && Math.random() < 0.7 ? [vis[Math.floor(Math.random() * vis.length)]] : [];
            if (give.length + want.length) assert.deepStrictEqual(bz.propose(room, q.id, give, want), {});
          } else if (r < 0.8 && Object.keys(room.proposals).length) {
            const from = Object.keys(room.proposals)[0];
            assert.deepStrictEqual(bz.accept(room, A.id, from), {});
          } else assert.deepStrictEqual(bz.endTrade(room, A.id), {});
        } else if (room.step === 'plantAll') {
          const p = room.players.find((q) => q.table.length);
          plantSomewhere(room, p, p.table[0], true);
        }
        // 가끔 아무나 수확/밭 사기
        if (room.phase === 'play' && Math.random() < 0.08) {
          const p = room.players[Math.floor(Math.random() * room.players.length)];
          const i = Math.floor(Math.random() * p.fields.length);
          if (p.fields[i].cards.length >= 2) bz.harvest(room, p.id, i);
          if (p.coins.length >= 3 && p.fields.length < 3 && Math.random() < 0.5) bz.buyField(room, p.id);
        }
        assert.strictEqual(total(room), want, `${n}명 ${g}판 ${step}번째: 카드 수가 달라졌어요`);
        for (const p of room.players) {
          assert.ok(p.fields.length >= 2 && p.fields.length <= 3);
          p.fields.forEach((f) => assert.ok(f.cards.every((c) => c.type === f.type), '한 밭에 다른 콩이 섞였어요'));
        }
      }
      games += 1;
      if (room.phase === 'over') {
        finished += 1;
        assert.ok(room.winnerIds.length >= 1);
        const best = Math.max(...Object.values(room.scores));
        assert.ok(room.winnerIds.every((id) => room.scores[id] === best));
        assert.ok(room.players.every((p) => p.fields.every((f) => f.cards.length === 0)));
      }
    }
  }
  assert.ok(finished / games > 0.9, `끝난 판이 너무 적어요: ${finished}/${games}`);
});
