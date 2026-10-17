'use strict';
const test = require('node:test');
const assert = require('node:assert');
const sp = require('../splendor');

let nid = 5000;
const card = (bonus, cost = {}, points = 0, level = 1) => ({
  id: nid++, level, bonus, points, cost: { w: 0, u: 0, g: 0, r: 0, k: 0, ...cost },
});

function mk(n = 3) {
  const room = sp.createRoom('SP');
  for (let i = 0; i < n; i++) sp.addPlayer(room, `p${i}`);
  assert.deepStrictEqual(sp.start(room, room.hostId), {});
  return room;
}
const P = (room, i) => room.players[i];
const id = (room, i) => P(room, i).id;
const gems = (o = {}) => ({ w: 0, u: 0, g: 0, r: 0, k: 0, y: 0, ...o });
const cur = (room) => room.players[room.turn];
const take = (room, colors) => sp.takeGems(room, cur(room).id, colors);

// 은행 + 모든 플레이어 보석 합은 항상 처음과 같아야 한다
function gemSum(room, c) {
  return room.bank[c] + room.players.reduce((n, p) => n + p.gems[c], 0);
}

test('카드 90장: 단계별 40/30/20, 색 균형, 점수 분포, 보너스 색은 비용에 없다', () => {
  assert.strictEqual(sp.CARDS.length, 90);
  assert.deepStrictEqual([1, 2, 3].map((l) => sp.CARDS.filter((c) => c.level === l).length), [40, 30, 20]);
  for (const l of [1, 2, 3]) {
    for (const c of sp.COLORS) {
      assert.strictEqual(sp.CARDS.filter((x) => x.level === l && x.bonus === c).length, l === 1 ? 8 : l === 2 ? 6 : 4);
    }
  }
  assert.deepStrictEqual(sp.CARDS.filter((c) => c.level === 3).map((c) => c.points).sort().join(''), '33333444444444455555');
  assert.ok(sp.CARDS.every((c) => c.cost[c.bonus] === 0));
  assert.strictEqual(new Set(sp.CARDS.map((c) => c.id)).size, 90);
  assert.strictEqual(sp.NOBLES.length, 10);
});

test('시작: 인원별 보석 수, 귀족 n+1명, 펼친 카드 4장씩', () => {
  const want = { 2: [4, 3], 3: [5, 4], 4: [7, 5] };
  for (const n of [2, 3, 4]) {
    const room = mk(n);
    assert.deepStrictEqual(sp.COLORS.map((c) => room.bank[c]), Array(5).fill(want[n][0]));
    assert.strictEqual(room.bank.y, 5);
    assert.strictEqual(room.nobles.length, want[n][1]);
    for (const l of [1, 2, 3]) {
      assert.strictEqual(room.board[l].length, 4);
      assert.ok(room.board[l].every(Boolean));
    }
    assert.deepStrictEqual([1, 2, 3].map((l) => room.decks[l].length), [36, 26, 16]);
  }
});

test('1명/5명/방장 아님/접속 끊김이면 시작할 수 없다', () => {
  const room = sp.createRoom('X');
  sp.addPlayer(room, 'a');
  assert.ok(sp.start(room, room.hostId).error);
  for (const n of ['b', 'c', 'd']) sp.addPlayer(room, n);
  assert.ok(sp.addPlayer(room, 'e').error);
  assert.ok(sp.start(room, room.players[1].id).error);
  room.players[2].connected = false;
  assert.ok(sp.start(room, room.hostId).error);
});

test('보석 가져오기: 서로 다른 3색, 같은 색 2개(4개 이상일 때), 잘못된 조합은 거부', () => {
  const room = mk(2);
  const a = cur(room);
  assert.ok(take(room, ['w', 'w', 'u']).error);
  assert.ok(take(room, ['w', 'u']).error); // 3가지 색이 남아 있으면 3개를 가져와야 한다
  assert.ok(take(room, ['x']).error);
  assert.ok(sp.takeGems(room, id(room, 1) === a.id ? id(room, 0) : id(room, 1), ['w', 'u', 'g']).error); // 남의 차례
  assert.deepStrictEqual(take(room, ['w', 'u', 'g']), {});
  assert.deepStrictEqual([a.gems.w, a.gems.u, a.gems.g], [1, 1, 1]);
  assert.strictEqual(room.bank.w, 3);
  assert.notStrictEqual(cur(room).id, a.id); // 턴이 넘어갔다
  // 2인 게임은 색당 4개: 정확히 4개일 때 2개 가능
  assert.deepStrictEqual(take(room, ['r', 'r']), {});
  assert.strictEqual(room.bank.r, 2);
  // 이제 r은 2개 남아서 같은 색 2개 불가 (4개 미만)
  assert.ok(take(room, ['r', 'r']).error);
});

test('같은 색 2개는 4개 미만이면 불가', () => {
  const room = mk(2);
  room.bank.w = 3;
  assert.match(take(room, ['w', 'w']).error, /4개 이상/);
  room.bank.w = 4;
  assert.deepStrictEqual(take(room, ['w', 'w']), {});
});

test('남은 색이 3가지 미만이면 가능한 만큼만 가져온다', () => {
  const room = mk(2);
  room.bank.w = 0; room.bank.u = 0; room.bank.g = 0; // r, k만 남음
  assert.ok(take(room, ['r']).error); // 2가지 색이 있으니 둘 다
  assert.deepStrictEqual(take(room, ['r', 'k']), {});
  const only = mk(2);
  ['w', 'u', 'g', 'r'].forEach((c) => { only.bank[c] = 0; });
  assert.deepStrictEqual(take(only, ['k']), {}); // 한 가지 색만 남음
  const none = mk(2);
  sp.COLORS.forEach((c) => { none.bank[c] = 0; });
  assert.ok(take(none, ['w']).error);
});

test('보석이 10개를 넘으면 버려서 10개로 맞춘 뒤에 턴이 넘어간다', () => {
  const room = mk(2);
  const a = cur(room);
  a.gems = gems({ w: 3, u: 3, g: 2 }); // 8개
  room.bank.w -= 3; room.bank.u -= 3; room.bank.g -= 2;
  take(room, ['r', 'k', 'g']); // 11개
  assert.deepStrictEqual(room.pending, { t: 'discard', who: a.id, need: 1 });
  assert.strictEqual(cur(room).id, a.id);
  assert.ok(take(room, ['w', 'u', 'g']).error); // 먼저 버려야 한다
  assert.ok(sp.discardTokens(room, a.id, gems({ w: 2 })).error); // 정확히 1개
  assert.ok(sp.discardTokens(room, a.id, gems({ k: 2 })).error);
  assert.ok(sp.discardTokens(room, id(room, 1), gems({ w: 1 })).error);
  assert.deepStrictEqual(sp.discardTokens(room, a.id, gems({ w: 1 })), {});
  assert.strictEqual(Object.values(a.gems).reduce((x, y) => x + y, 0), 10);
  assert.notStrictEqual(cur(room).id, a.id);
});

test('예약: 금 1개를 받고, 3장까지, 덱에서도 가능, 금이 없어도 예약은 된다', () => {
  const room = mk(2);
  const a = cur(room);
  const c1 = room.board[1][0];
  assert.deepStrictEqual(sp.reserve(room, a.id, 1, 0, false), {});
  assert.deepStrictEqual(a.reserved.map((c) => c.id), [c1.id]);
  assert.strictEqual(a.gems.y, 1);
  assert.strictEqual(room.bank.y, 4);
  assert.ok(room.board[1][0] && room.board[1][0].id !== c1.id); // 빈자리가 채워짐
  sp.takeGems(room, cur(room).id, ['w', 'u', 'g']); // 상대 턴 소모
  const deckTop = room.decks[2][room.decks[2].length - 1];
  assert.deepStrictEqual(sp.reserve(room, a.id, 2, 0, true), {});
  assert.strictEqual(a.reserved[1].id, deckTop.id);
  assert.strictEqual(room.decks[2].length, 25);
  sp.takeGems(room, cur(room).id, ['w', 'u', 'g']);
  room.bank.y = 0;
  assert.deepStrictEqual(sp.reserve(room, a.id, 3, 1, false), {});
  assert.strictEqual(a.gems.y, 2); // 금이 없어서 못 받음
  sp.takeGems(room, cur(room).id, ['w', 'u', 'g']);
  assert.match(sp.reserve(room, a.id, 1, 1, false).error, /최대 3장/);
});

test('구매: 보너스로 할인, 모자란 만큼 금으로, 낸 보석은 은행으로, 빈자리 채움', () => {
  const room = mk(2);
  const a = cur(room);
  const target = card('r', { w: 2, u: 2, g: 1 }, 1);
  room.board[1][0] = target;
  a.gems = gems({ w: 1, u: 1 });
  room.bank.w -= 1; room.bank.u -= 1;
  assert.match(sp.buy(room, a.id, { level: 1, index: 0 }).error, /모자라/);
  a.cards = [card('w'), card('u')]; // 보너스 흰 1, 파랑 1 → 비용 w1 u1 g1
  assert.ok(sp.payment(a, target).ok === false); // 초록 1이 모자람 (금도 없음)
  a.gems.y = 1; room.bank.y -= 1;
  const sumBefore = sp.COLORS.map((c) => gemSum(room, c));
  const pay = sp.payment(a, target);
  assert.ok(pay.ok);
  assert.deepStrictEqual(pay.pay, gems({ w: 1, u: 1, y: 1 }));
  assert.deepStrictEqual(sp.buy(room, a.id, { level: 1, index: 0 }), {});
  assert.deepStrictEqual(a.gems, gems());
  assert.strictEqual(room.bank.y, 5);
  assert.strictEqual(a.cards.length, 3);
  assert.strictEqual(sp.pointsOf(a), 1);
  assert.deepStrictEqual(sp.COLORS.map((c) => gemSum(room, c)), sumBefore);
  assert.notStrictEqual(room.board[1][0].id, target.id);
});

test('예약한 카드 구매, 남의 카드는 못 산다, 카드가 없으면 거부', () => {
  const room = mk(2);
  const a = cur(room);
  const reserved = card('g', { k: 1 });
  a.reserved = [reserved];
  a.gems = gems({ k: 1 });
  room.bank.k -= 1;
  assert.deepStrictEqual(sp.buy(room, a.id, { reserved: reserved.id }), {});
  assert.deepStrictEqual(a.reserved, []);
  assert.strictEqual(a.cards[0].id, reserved.id);
  assert.ok(sp.buy(room, cur(room).id, { reserved: 99999 }).error);
  assert.ok(sp.buy(room, cur(room).id, { level: 1, index: 9 }).error);
});

test('귀족: 조건을 채우면 턴 끝에 자동으로 오고(+3점), 여럿이면 고른다', () => {
  const room = mk(2);
  const a = cur(room);
  room.nobles = [sp.NOBLES[0]]; // 흰4 파랑4
  a.cards = [card('w'), card('w'), card('w'), card('w'), card('u'), card('u'), card('u')];
  const last = card('u', { r: 1 });
  room.board[1][0] = last;
  a.gems = gems({ r: 1 });
  room.bank.r -= 1;
  sp.buy(room, a.id, { level: 1, index: 0 });
  assert.strictEqual(a.nobles.length, 1);
  assert.strictEqual(room.nobles.length, 0);
  assert.strictEqual(sp.pointsOf(a), 3);
  assert.notStrictEqual(cur(room).id, a.id);

  const two = mk(2);
  const b = cur(two);
  two.nobles = [sp.NOBLES[0], sp.NOBLES[1]]; // 흰4파4 / 파4초4
  b.cards = [...Array(4).fill(0).map(() => card('w')), ...Array(3).fill(0).map(() => card('u')), ...Array(4).fill(0).map(() => card('g'))];
  two.board[1][0] = card('u', { r: 1 });
  b.gems = gems({ r: 1 });
  sp.buy(two, b.id, { level: 1, index: 0 });
  assert.strictEqual(two.pending.t, 'noble');
  assert.strictEqual(cur(two).id, b.id);
  assert.ok(sp.chooseNoble(two, b.id, 5).error);
  assert.ok(sp.chooseNoble(two, id(two, 0) === b.id ? id(two, 1) : id(two, 0), 0).error);
  assert.deepStrictEqual(sp.chooseNoble(two, b.id, 1), {});
  assert.deepStrictEqual(b.nobles.map((n) => n.id), [1]);
  assert.strictEqual(two.nobles.length, 1);
  assert.notStrictEqual(cur(two).id, b.id);
});

test('보석 때문에 버리는 중이어도 귀족은 그 다음에 받는다', () => {
  const room = mk(2);
  const a = cur(room);
  room.nobles = [sp.NOBLES[0]];
  a.cards = [card('w'), card('w'), card('w'), card('w'), card('u'), card('u'), card('u'), card('u')];
  a.gems = gems({ r: 3, k: 3, g: 3 });
  room.bank.r -= 3; room.bank.k -= 3; room.bank.g -= 3;
  take(room, ['w', 'u', 'g']); // 12개 → 2개 버림, 귀족 조건은 이미 충족
  assert.strictEqual(room.pending.t, 'discard');
  assert.strictEqual(a.nobles.length, 0);
  sp.discardTokens(room, a.id, gems({ r: 2 }));
  assert.strictEqual(a.nobles.length, 1);
});

test('15점: 그 라운드를 끝까지 돌고 끝난다. 동점이면 카드가 적은 사람이 이긴다', () => {
  const room = mk(3);
  const order = room.players.slice();
  // 0번(첫 순서)이 15점에 도달 → 1, 2번도 한 번씩 더 하고 끝
  order[0].cards = [card('w', {}, 5, 3), card('u', {}, 5, 3), card('g', {}, 4, 3)];
  const winCard = card('r', { k: 1 }, 1, 1);
  room.board[1][0] = winCard;
  order[0].gems = gems({ k: 1 });
  assert.strictEqual(room.turn, 0);
  sp.buy(room, order[0].id, { level: 1, index: 0 });
  assert.strictEqual(sp.pointsOf(order[0]), 15);
  assert.strictEqual(room.endTrigger, true);
  assert.strictEqual(room.phase, 'play');
  take(room, ['w', 'u', 'g']);
  assert.strictEqual(room.phase, 'play');
  take(room, ['w', 'u', 'g']);
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [order[0].id]);
  assert.ok(sp.takeGems(room, order[0].id, ['w', 'u', 'g']).error);
});

test('마지막 순서가 15점이면 바로 끝나고, 동점이면 카드 수가 적은 쪽, 같으면 공동 우승', () => {
  const room = mk(2);
  const [a, b] = room.players;
  a.cards = [card('w', {}, 5, 3), card('u', {}, 5, 3), card('g', {}, 5, 3)]; // 15점, 카드 3장
  b.cards = [card('w', {}, 5, 3), card('u', {}, 5, 3), card('g', {}, 4, 3), card('r', {}, 1, 1)]; // 15점, 카드 4장
  room.turn = 1;
  room.board[1][0] = card('k', {}, 0, 1);
  sp.buy(room, b.id, { level: 1, index: 0 });
  assert.strictEqual(room.phase, 'over'); // b가 마지막 순서
  assert.deepStrictEqual(room.winnerIds, [a.id]); // 같은 15점이면 카드가 적은 a
  const tie = mk(2);
  const [c, d] = tie.players;
  c.cards = [card('w', {}, 5, 3), card('u', {}, 5, 3), card('g', {}, 5, 3)];
  d.cards = [card('w', {}, 5, 3), card('u', {}, 5, 3), card('g', {}, 5, 3)];
  tie.turn = 1;
  tie.board[1][0] = card('k', {}, 0, 1);
  d.gems = gems();
  sp.buy(tie, d.id, { level: 1, index: 0 });
  assert.strictEqual(tie.phase, 'over');
  // d가 카드 1장을 더 사서(0점) 점수는 같고 카드 수는 d가 더 많다 → c 단독 우승
  assert.deepStrictEqual(tie.winnerIds, [c.id]);
});

test('넘기기는 할 수 있는 행동이 하나도 없을 때만', () => {
  const room = mk(2);
  const a = cur(room);
  assert.ok(sp.pass(room, a.id).error);
  sp.COLORS.forEach((c) => { room.bank[c] = 0; });
  a.reserved = [card('w', { w: 9 }), card('u', { w: 9 }), card('g', { w: 9 })];
  [1, 2, 3].forEach((l) => { room.board[l] = [null, null, null, null]; room.decks[l] = []; });
  assert.strictEqual(sp.viewFor(room, a.id).canPass, true);
  assert.deepStrictEqual(sp.pass(room, a.id), {});
  assert.notStrictEqual(cur(room).id, a.id);
});

test('예약한 카드는 본인에게만 보이고, 살 수 있는 카드는 afford가 켜진다', () => {
  const room = mk(2);
  const a = cur(room);
  const other = room.players.find((p) => p !== a);
  sp.reserve(room, a.id, 1, 0, false);
  const mine = sp.viewFor(room, a.id).players.find((p) => p.id === a.id);
  const theirs = sp.viewFor(room, other.id).players.find((p) => p.id === a.id);
  assert.strictEqual(mine.reserved.length, 1);
  assert.strictEqual(theirs.reserved, null);
  assert.strictEqual(theirs.reservedCount, 1);
  room.board[1][1] = card('w', { u: 1 });
  cur(room).gems = gems({ u: 1 });
  const v = sp.viewFor(room, cur(room).id);
  assert.strictEqual(v.board[1][1].afford, true);
  assert.strictEqual(v.mode, 'main');
  assert.strictEqual(sp.viewFor(room, a.id === cur(room).id ? other.id : a.id).mode, 'wait');
});

test('방장 force: 버리는 중이면 알아서 버리고, 아니면 차례를 넘긴다', () => {
  const room = mk(2);
  const a = cur(room);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(sp.force(room, nonHost.id).error);
  a.gems = gems({ w: 5, u: 5 });
  room.bank.w -= 5; room.bank.u -= 5;
  take(room, ['g', 'r', 'k']);
  assert.strictEqual(room.pending.t, 'discard');
  assert.deepStrictEqual(sp.force(room, room.hostId), {});
  assert.strictEqual(room.pending, null);
  assert.strictEqual(Object.values(a.gems).reduce((x, y) => x + y, 0), 10);
  const before = cur(room).id;
  sp.force(room, room.hostId);
  assert.notStrictEqual(cur(room).id, before);
});

test('초기화와 다시 시작', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(sp.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(sp.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.deepStrictEqual(sp.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(sp.backToLobby(room, room.hostId).error);
});

// ---- 무작위로 끝까지 ----

function botTurn(room, rnd) {
  const pd = room.pending;
  const who = pd ? pd.who : cur(room).id;
  const v = sp.viewFor(room, who);
  const me = room.players.find((p) => p.id === who);
  const must = (r, what) => assert.deepStrictEqual(r, {}, `${what} ${JSON.stringify(r)}`);
  if (v.mode === 'discard') {
    const g = gems();
    let left = pd.need;
    for (const c of ['y', ...sp.COLORS]) {
      const n = Math.min(left, me.gems[c]);
      g[c] = n; left -= n;
    }
    must(sp.discardTokens(room, who, g), 'discard');
    return;
  }
  if (v.mode === 'noble') { must(sp.chooseNoble(room, who, pd.options[0]), 'noble'); return; }
  // 살 수 있는 카드가 있으면 대체로 산다
  const buyable = [];
  [1, 2, 3].forEach((l) => v.board[l].forEach((c, i) => { if (c && c.afford) buyable.push({ level: l, index: i, c }); }));
  const myRes = v.players.find((p) => p.id === who).reserved.filter((c) => c.afford);
  if ((buyable.length || myRes.length) && rnd() < 0.8) {
    if (myRes.length && (!buyable.length || rnd() < 0.5)) must(sp.buy(room, who, { reserved: myRes[0].id }), 'buy reserved');
    else {
      buyable.sort((x, y) => y.c.points - x.c.points);
      must(sp.buy(room, who, { level: buyable[0].level, index: buyable[0].index }), 'buy');
    }
    return;
  }
  const avail = sp.COLORS.filter((c) => room.bank[c] > 0);
  if (avail.length && rnd() < 0.85) {
    const shuffled = avail.slice().sort(() => rnd() - 0.5);
    if (shuffled.length >= 3) must(sp.takeGems(room, who, shuffled.slice(0, 3)), 'take3');
    else must(sp.takeGems(room, who, shuffled), 'take<3');
    return;
  }
  if (me.reserved.length < 3) {
    const lv = [1, 2, 3].find((l) => room.board[l].some(Boolean));
    if (lv) { must(sp.reserve(room, who, lv, room.board[lv].findIndex(Boolean), false), 'reserve'); return; }
  }
  if (avail.length) {
    const shuffled = avail.slice().sort(() => rnd() - 0.5);
    must(sp.takeGems(room, who, shuffled.length >= 3 ? shuffled.slice(0, 3) : shuffled), 'take fallback');
    return;
  }
  // 다른 선택지가 없으면 살 수 있는 카드는 반드시 산다 (넘기기는 아무것도 못 할 때만 가능)
  if (myRes.length) { must(sp.buy(room, who, { reserved: myRes[0].id }), 'buy reserved fallback'); return; }
  if (buyable.length) { must(sp.buy(room, who, { level: buyable[0].level, index: buyable[0].index }), 'buy fallback'); return; }
  must(sp.pass(room, who), 'pass');
}

test('2~4명이 무작위로 끝까지 두면 항상 끝나고 보석 수가 보존된다', () => {
  let finished = 0;
  let total = 0;
  for (const n of [2, 3, 4]) {
    for (let g = 0; g < 25; g++) {
      const room = mk(n);
      const start = {};
      sp.COLORS.concat('y').forEach((c) => { start[c] = gemSum(room, c); });
      let seed = n * 977 + g + 1;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
      for (let step = 0; step < 3000 && room.phase === 'play'; step++) {
        botTurn(room, rnd);
        for (const c of Object.keys(start)) assert.strictEqual(gemSum(room, c), start[c], `${n}명 ${g}판 ${c} 보석 수가 달라졌어요`);
        for (const p of room.players) {
          assert.ok(Object.values(p.gems).every((x) => x >= 0));
          assert.ok(p.reserved.length <= 3);
          if (!room.pending || room.pending.who !== p.id) assert.ok(Object.values(p.gems).reduce((a, b) => a + b, 0) <= 10, '보석 10개 초과');
        }
        const cards = room.players.reduce((k, p) => k + p.cards.length + p.reserved.length, 0)
          + [1, 2, 3].reduce((k, l) => k + room.decks[l].length + room.board[l].filter(Boolean).length, 0);
        assert.strictEqual(cards, 90);
      }
      total += 1;
      if (room.phase === 'over') {
        finished += 1;
        assert.ok(room.winnerIds.length >= 1);
        assert.ok(Math.max(...room.players.map(sp.pointsOf)) >= 15);
      }
    }
  }
  assert.ok(finished / total > 0.9, `끝난 판이 너무 적어요: ${finished}/${total}`);
});
