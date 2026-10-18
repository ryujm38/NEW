'use strict';
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const c = require('../crew');
const { serializeRoom, deserializeRoom } = require('../hub');

function mk(n = 3, startMission = 1) {
  const room = c.createRoom('CR');
  for (let i = 0; i < n; i++) c.addPlayer(room, `p${i}`);
  if (startMission !== 1) assert.deepStrictEqual(c.setSetting(room, room.hostId, 'startMission', startMission), {});
  assert.deepStrictEqual(c.start(room, room.hostId), {});
  return room;
}
const P = (room, i) => room.players[i];
const id = (room, i) => room.players[i].id;
const guest = (room) => room.players.find((p) => p.id !== room.hostId).id;

// 정해 둔 손패/과제로 바로 트릭 단계를 만든다 (규칙을 정확히 시험하려고)
function rig(room, { hands, tasks = [], lead = 0, mission }) {
  if (mission) room.mission = mission;
  room.players.forEach((p, i) => { p.hand = c.sortHand(hands[i]); p.won = 0; p.signal = null; p.commUsed = false; });
  room.commander = lead;
  room.tasks = tasks.map((t) => ({ card: t.card, token: t.token || null, owner: id(room, t.owner), done: false, trick: null }));
  Object.assign(room, { phase: 'play', turn: lead, trick: { lead, plays: [] }, trickNo: 0, lastTrick: null, played: [], result: null, choose: [], commPlayer: null });
}
// 한 트릭을 자리 순서대로 낸다 (lead부터)
function trick(room, cards) {
  cards.forEach((card) => {
    const p = room.players[room.turn];
    assert.deepStrictEqual(c.play(room, p.id, card), {}, `${p.name} ${card}`);
  });
}
// 과제 고르기 단계를 사령관부터 차례로 끝낸다
function pickAll(room) {
  while (room.phase === 'choose') {
    const cmd = room.players[room.commander];
    const other = room.players[(room.commander + 1) % room.players.length];
    assert.deepStrictEqual(c.choose(room, cmd.id, other.id), {});
  }
  while (room.phase === 'tasks') assert.deepStrictEqual(c.force(room, room.hostId), {});
}

test('카드 40장, 고르게 나누기, 로켓 4를 가진 사람이 사령관이고 먼저 낸다', () => {
  assert.strictEqual(c.DECK.length, 40);
  assert.strictEqual(new Set(c.DECK).size, 40);
  assert.strictEqual(c.TASK_DECK.length, 36);
  assert.ok(c.TASK_DECK.every((x) => x[0] !== 'r'));
  for (const n of [3, 4, 5]) {
    for (let g = 0; g < 20; g++) {
      const room = mk(n);
      const counts = room.players.map((p) => p.hand.length).sort((a, b) => a - b);
      assert.deepStrictEqual(counts, { 3: [13, 13, 14], 4: [10, 10, 10, 10], 5: [8, 8, 8, 8, 8] }[n]);
      const all = room.players.flatMap((p) => p.hand);
      assert.strictEqual(new Set(all).size, 40);
      assert.ok(P(room, room.commander).hand.includes('r4'));
      assert.strictEqual(room.phase, 'tasks');
      assert.strictEqual(room.picker, room.commander);
      assert.strictEqual(room.tasks.length, 1);
      pickAll(room);
      assert.strictEqual(room.phase, 'play');
      assert.strictEqual(room.turn, room.commander);
      assert.strictEqual(room.trick.lead, room.commander);
    }
  }
});

test('시작: 3~5명, 방장만, 접속 끊김 불가. 시작 임무는 방장이 대기실에서 정한다', () => {
  const two = c.createRoom('X');
  c.addPlayer(two, 'a'); c.addPlayer(two, 'b');
  assert.ok(c.start(two, two.hostId).error);
  const full = c.createRoom('Y');
  for (let i = 0; i < 5; i++) c.addPlayer(full, `p${i}`);
  assert.ok(c.addPlayer(full, 'p6').error);
  assert.ok(c.start(full, full.players[1].id).error);
  assert.ok(c.setSetting(full, full.players[1].id, 'startMission', 3).error);
  assert.ok(c.setSetting(full, full.hostId, 'startMission', 0).error);
  assert.ok(c.setSetting(full, full.hostId, 'startMission', c.MISSIONS.length + 1).error);
  assert.deepStrictEqual(c.setSetting(full, full.hostId, 'startMission', 14), {});
  full.players[2].connected = false;
  assert.ok(c.start(full, full.hostId).error);
  full.players[2].connected = true;
  assert.deepStrictEqual(c.start(full, full.hostId), {});
  assert.strictEqual(full.mission, 14);
  assert.strictEqual(full.tasks.length, c.MISSIONS[13].n);
  assert.deepStrictEqual(full.tasks.map((t) => t.token), ['1', '2', '3', null]);
  assert.ok(c.setSetting(full, full.hostId, 'startMission', 2).error, '게임 중에는 못 바꾼다');
});

test('임무 일지: 30개, 과제 수 1→9로 점점 늘고 특별 규칙이 들어 있다', () => {
  assert.strictEqual(c.MISSIONS.length, 30);
  assert.strictEqual(c.MISSIONS[0].n, 1);
  assert.strictEqual(c.MISSIONS[29].n, 9);
  c.MISSIONS.forEach((m) => {
    assert.ok(m.n >= 1 && m.n <= 9 && m.title && m.story);
    assert.ok(!m.tokens || m.tokens.length <= m.n);
  });
  for (const k of ['noComm', 'deadzone', 'commFrom', 'cmdFirst', 'assign', 'solo', 'commOne']) assert.ok(c.MISSIONS.some((m) => m[k]), k);
});

test('과제 고르기: 사령관부터 시계 방향으로 한 장씩, 남의 차례·가져간 과제는 안 된다', () => {
  const room = mk(3, 9); // 과제 4개
  const cmd = room.commander;
  const order = [0, 1, 2, 3].map((k) => (cmd + k) % 3);
  const wrong = (cmd + 1) % 3;
  assert.ok(c.pickTask(room, id(room, wrong), 0).error);
  assert.deepStrictEqual(c.pickTask(room, id(room, cmd), 2), {});
  assert.ok(c.pickTask(room, id(room, order[1]), 2).error, '이미 가져간 과제');
  assert.ok(c.pickTask(room, id(room, order[1]), 9).error, '없는 과제');
  assert.deepStrictEqual(c.pickTask(room, id(room, order[1]), 0), {});
  assert.deepStrictEqual(c.pickTask(room, id(room, order[2]), 1), {});
  assert.strictEqual(room.phase, 'tasks');
  assert.deepStrictEqual(c.pickTask(room, id(room, order[3]), 3), {});
  assert.strictEqual(room.phase, 'play');
  assert.deepStrictEqual(room.tasks.map((t) => t.owner), [id(room, order[1]), id(room, order[2]), id(room, cmd), id(room, cmd)]);
});

test('사령관이 나눠 주기(assign): 사령관만, 고르게(누구도 다른 사람보다 2개 이상 많지 않게)', () => {
  const room = mk(3, 11); // assign, 과제 4개 → 최대 2개
  const cmd = P(room, room.commander);
  const other = P(room, (room.commander + 1) % 3);
  assert.ok(c.pickTask(room, cmd.id, 0).error);
  assert.ok(c.assignTask(room, other.id, 0, other.id).error);
  assert.deepStrictEqual(c.assignTask(room, cmd.id, 0, other.id), {});
  assert.deepStrictEqual(c.assignTask(room, cmd.id, 1, other.id), {});
  assert.ok(c.assignTask(room, cmd.id, 2, other.id).error, '3개째는 안 된다');
  assert.deepStrictEqual(c.assignTask(room, cmd.id, 2, cmd.id), {});
  // 4개를 3명에게: 2·1·1이어야 한다. 사령관에게 2개째를 주면 남은 한 명이 0개가 되므로 막는다
  assert.match(c.assignTask(room, cmd.id, 3, cmd.id).error, /고르게/);
  const third = P(room, (room.commander + 2) % 3);
  assert.deepStrictEqual(c.viewFor(room, cmd.id).assignable, [third.id]);
  assert.deepStrictEqual(c.assignTask(room, cmd.id, 3, third.id), {});
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(c.viewFor(room, cmd.id).mode, 'play');
});

test('홀로 선외 활동(solo): 사령관이 자기 말고 한 명을 고르면 과제를 모두 맡는다', () => {
  const room = mk(4, 16);
  assert.strictEqual(room.phase, 'choose');
  const cmd = P(room, room.commander);
  const other = P(room, (room.commander + 2) % 4);
  assert.strictEqual(c.viewFor(room, cmd.id).mode, 'choose');
  assert.strictEqual(c.viewFor(room, other.id).mode, 'wait');
  assert.ok(c.choose(room, other.id, other.id).error);
  assert.ok(c.choose(room, cmd.id, cmd.id).error);
  assert.deepStrictEqual(c.choose(room, cmd.id, other.id), {});
  assert.strictEqual(room.phase, 'play');
  assert.ok(room.tasks.length === 3 && room.tasks.every((t) => t.owner === other.id));
});

test('따라 내기: 처음 낸 색이 있으면 그 색만, 없으면 아무거나(로켓 포함)', () => {
  const room = mk(3);
  rig(room, { hands: [['b5', 'p2'], ['b3', 'b9', 'y1'], ['g4', 'r1']], lead: 0 });
  assert.deepStrictEqual(c.legalCards(room, P(room, 0)).sort(), ['b5', 'p2']);
  assert.ok(c.play(room, id(room, 1), 'b3').error, '내 차례가 아니다');
  assert.deepStrictEqual(c.play(room, id(room, 0), 'b5'), {});
  assert.deepStrictEqual(c.legalCards(room, P(room, 1)).sort(), ['b3', 'b9']);
  assert.ok(c.play(room, id(room, 1), 'y1').error, '파랑이 있으면 파랑');
  assert.ok(c.play(room, id(room, 1), 'g4').error, '없는 카드');
  assert.deepStrictEqual(c.play(room, id(room, 1), 'b3'), {});
  assert.deepStrictEqual(c.legalCards(room, P(room, 2)).sort(), ['g4', 'r1']);
  assert.deepStrictEqual(c.play(room, id(room, 2), 'r1'), {});
  assert.strictEqual(room.lastTrick.winner, id(room, 2), '로켓 1이 파랑 5를 이긴다');
  assert.strictEqual(room.turn, 2, '이긴 사람이 다음에 먼저 낸다');
  assert.strictEqual(P(room, 2).won, 1);
});

test('트릭 승자: 가장 높은 로켓 > 처음 낸 색의 가장 높은 카드, 다른 색은 높아도 못 이긴다', () => {
  const w = (cards) => c.trickWinner(cards.map((card, i) => ({ id: `x${i}`, card }))).id;
  assert.strictEqual(w(['g3', 'g7', 'g5']), 'x1');
  assert.strictEqual(w(['g3', 'y9', 'p9']), 'x0');
  assert.strictEqual(w(['g3', 'r1', 'r2', 'g9']), 'x2');
  assert.strictEqual(w(['r2', 'r4', 'r3']), 'x1');
  assert.strictEqual(w(['r1', 'b9', 'p9']), 'x0');
  assert.strictEqual(w(['b1', 'b2', 'r1', 'b9', 'g9']), 'x2');
});

test('과제: 주인이 그 카드가 든 트릭을 이기면 완료, 다른 사람이 이기면 바로 실패', () => {
  const room = mk(3);
  rig(room, { hands: [['b5', 'p2'], ['b3', 'p9'], ['b1', 'p1']], tasks: [{ card: 'b3', owner: 0 }, { card: 'p1', owner: 1 }], lead: 0 });
  trick(room, ['b5', 'b3', 'b1']);
  assert.ok(room.tasks[0].done);
  assert.strictEqual(room.tasks[0].trick, 1);
  assert.strictEqual(room.phase, 'play');
  trick(room, ['p2', 'p9', 'p1']);
  assert.strictEqual(room.phase, 'result');
  assert.strictEqual(room.result.ok, true);

  const r2 = mk(3);
  rig(r2, { hands: [['b5', 'p2'], ['b3', 'p9'], ['b1', 'p1']], tasks: [{ card: 'b3', owner: 1 }, { card: 'p1', owner: 1 }], lead: 0 });
  trick(r2, ['b5', 'b3', 'b1']);
  assert.strictEqual(r2.phase, 'result');
  assert.strictEqual(r2.result.ok, false);
  assert.match(r2.result.reason, /파랑 3/);
  assert.strictEqual(r2.trick, null);
  assert.ok(c.play(r2, id(r2, 0), 'p2').error, '끝난 임무에는 못 낸다');
});

test('3명: 14장 받은 사람의 마지막 한 장은 내지 않고, 그게 과제면 실패', () => {
  const room = mk(3);
  rig(room, { hands: [['b5', 'g2'], ['b3'], ['b1']], tasks: [{ card: 'b5', owner: 0 }, { card: 'g2', owner: 0 }], lead: 0 });
  trick(room, ['b5', 'b3', 'b1']);
  assert.strictEqual(room.phase, 'result');
  assert.strictEqual(room.result.ok, false);
  assert.match(room.result.reason, /카드가 다 떨어졌/);
});

test('순서 번호 1~5: 전체 과제 중 정확히 그 번째에 완료해야 한다', () => {
  // 번호 없는 과제가 1번보다 먼저 완료 → 실패
  const r = mk(3);
  rig(r, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'p1', token: '1', owner: 0 }, { card: 'b1', owner: 0 }], lead: 0 });
  trick(r, ['b9', 'b1', 'b2']);
  assert.strictEqual(r.result && r.result.ok, false);
  assert.match(r.result.reason, /1번 과제/);
  // 1 → 2 순서대로 → 성공
  const ok = mk(3);
  rig(ok, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'b1', token: '1', owner: 0 }, { card: 'p1', token: '2', owner: 0 }], lead: 0 });
  trick(ok, ['b9', 'b1', 'b2']);
  trick(ok, ['p9', 'p1', 'p2']);
  assert.strictEqual(ok.result.ok, true);
  // 2번을 먼저 → 실패
  const bad = mk(3);
  rig(bad, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'p1', token: '1', owner: 0 }, { card: 'b1', token: '2', owner: 0 }], lead: 0 });
  trick(bad, ['b9', 'b1', 'b2']);
  assert.strictEqual(bad.result.ok, false);
  // 원작: 한 트릭에서 함께 완료되면 어느 쪽이 먼저 나왔든 순서에 맞게 완료한 것 (1과 표시 없는 과제, 1과 2)
  const same = mk(3);
  rig(same, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'b1', token: '1', owner: 0 }, { card: 'b2', owner: 0 }, { card: 'p1', owner: 0 }], lead: 0 });
  trick(same, ['b9', 'b1', 'b2']);
  assert.strictEqual(same.phase, 'play');
  assert.strictEqual(same.tasks.filter((t) => t.done).length, 2);
  const pair = mk(3);
  rig(pair, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'b2', token: '2', owner: 0 }, { card: 'b1', token: '1', owner: 0 }, { card: 'p1', token: '3', owner: 0 }], lead: 0 });
  trick(pair, ['b9', 'b1', 'b2']);
  assert.strictEqual(pair.phase, 'play', '1과 2가 같은 트릭이면 괜찮다(2가 먼저 나왔어도)');
  trick(pair, ['p9', 'p1', 'p2']);
  assert.strictEqual(pair.result.ok, true);
  // 1과 3이 함께(사이를 채울 과제 없음) → 실패
  const gap = mk(3);
  rig(gap, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'b1', token: '1', owner: 0 }, { card: 'b2', token: '3', owner: 0 }, { card: 'p1', token: '2', owner: 0 }], lead: 0 });
  trick(gap, ['b9', 'b1', 'b2']);
  assert.strictEqual(gap.result.ok, false);
  assert.match(gap.result.reason, /3번 과제/);
  // 2번 과제와 표시 없는 과제가 함께 첫 트릭에: 표시 없는 쪽이 1번째, 2번이 2번째 → 괜찮다
  const fill = mk(3);
  rig(fill, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'b1', token: '2', owner: 0 }, { card: 'b2', owner: 0 }, { card: 'p1', owner: 0 }], lead: 0 });
  trick(fill, ['b9', 'b1', 'b2']);
  assert.strictEqual(fill.phase, 'play');
  // 번호 없는 과제가 먼저여도 번호 2는 두 번째면 된다
  const two = mk(3);
  rig(two, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'p1', token: '2', owner: 0 }, { card: 'b1', owner: 0 }], lead: 0 });
  trick(two, ['b9', 'b1', 'b2']);
  trick(two, ['p9', 'p1', 'p2']);
  assert.strictEqual(two.result.ok, true);
});

test('상대 순서 › ›› ›››: 표시끼리 순서만 지키면 사이에 다른 과제는 괜찮다', () => {
  const hands = [['b9', 'p9', 'g9'], ['b1', 'p1', 'g1'], ['b2', 'p2', 'g2']];
  const ok = mk(3);
  rig(ok, { hands, tasks: [{ card: 'b1', token: '>', owner: 0 }, { card: 'p1', owner: 0 }, { card: 'g1', token: '>>', owner: 0 }], lead: 0 });
  trick(ok, ['b9', 'b1', 'b2']);
  trick(ok, ['p9', 'p1', 'p2']);
  trick(ok, ['g9', 'g1', 'g2']);
  assert.strictEqual(ok.result.ok, true);
  const bad = mk(3);
  rig(bad, { hands, tasks: [{ card: 'p1', token: '>', owner: 0 }, { card: 'b1', token: '>>', owner: 0 }], lead: 0 });
  trick(bad, ['b9', 'b1', 'b2']);
  assert.strictEqual(bad.result.ok, false);
  assert.match(bad.result.reason, /앞 순서/);
  // 이어지는 화살표 둘이 같은 트릭 → 괜찮다(원작). 사이 화살표가 남아 있으면 실패
  const same = mk(3);
  rig(same, { hands, tasks: [{ card: 'b2', token: '>>', owner: 0 }, { card: 'b1', token: '>', owner: 0 }], lead: 0 });
  trick(same, ['b9', 'b1', 'b2']);
  assert.strictEqual(same.result.ok, true);
  const skip = mk(3);
  rig(skip, { hands, tasks: [{ card: 'b1', token: '>', owner: 0 }, { card: 'b2', token: '>>>', owner: 0 }, { card: 'p1', token: '>>', owner: 0 }], lead: 0 });
  trick(skip, ['b9', 'b1', 'b2']);
  assert.strictEqual(skip.result.ok, false);
  assert.match(skip.result.reason, /앞 순서/);
  const mixed = mk(3);
  rig(mixed, { hands, tasks: [{ card: 'b1', token: '>', owner: 0 }, { card: 'b2', owner: 0 }, { card: 'p1', token: '>>', owner: 0 }], lead: 0 });
  trick(mixed, ['b9', 'b1', 'b2']);
  assert.strictEqual(mixed.phase, 'play');
  assert.strictEqual(mixed.tasks.filter((t) => t.done).length, 2);
});

test('Ω: 모든 과제 중 마지막에 (마지막 트릭에서 다른 과제와 함께여도 된다)', () => {
  const hands = [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']];
  const ok = mk(3);
  rig(ok, { hands, tasks: [{ card: 'p1', token: 'O', owner: 0 }, { card: 'b1', owner: 0 }], lead: 0 });
  trick(ok, ['b9', 'b1', 'b2']);
  trick(ok, ['p9', 'p1', 'p2']);
  assert.strictEqual(ok.result.ok, true);
  const bad = mk(3);
  rig(bad, { hands, tasks: [{ card: 'b1', token: 'O', owner: 0 }, { card: 'p1', owner: 0 }], lead: 0 });
  trick(bad, ['b9', 'b1', 'b2']);
  assert.strictEqual(bad.result.ok, false);
  assert.match(bad.result.reason, /Ω/);
  const same = mk(3);
  rig(same, { hands, tasks: [{ card: 'b1', token: 'O', owner: 0 }, { card: 'b2', owner: 0 }], lead: 0 });
  trick(same, ['b9', 'b1', 'b2']);
  assert.strictEqual(same.result.ok, true);
  // Ω와 번호가 함께 마지막 트릭에: 번호가 Ω 자리(맨 끝)를 차지하면 실패
  const clash = mk(3);
  rig(clash, { hands, tasks: [{ card: 'b1', token: 'O', owner: 0 }, { card: 'b2', token: '2', owner: 0 }], lead: 0 });
  trick(clash, ['b9', 'b1', 'b2']);
  assert.strictEqual(clash.result.ok, false);
  const fine = mk(3);
  rig(fine, { hands, tasks: [{ card: 'b1', token: 'O', owner: 0 }, { card: 'b2', token: '1', owner: 0 }], lead: 0 });
  trick(fine, ['b9', 'b1', 'b2']);
  assert.strictEqual(fine.result.ok, true);
});

test('첫 트릭은 사령관이 이겨야 하는 임무(cmdFirst)', () => {
  const m = c.MISSIONS.findIndex((x) => x.cmdFirst) + 1;
  const hands = [['b1', 'p9'], ['b9', 'p1'], ['b2', 'p2']];
  const bad = mk(3);
  rig(bad, { hands, tasks: [{ card: 'p1', owner: 0 }], lead: 0, mission: m });
  trick(bad, ['b1', 'b9', 'b2']);
  assert.strictEqual(bad.result.ok, false);
  assert.match(bad.result.reason, /사령관/);
  const ok = mk(3);
  rig(ok, { hands: [['b9', 'p9'], ['b1', 'p1'], ['b2', 'p2']], tasks: [{ card: 'p1', owner: 0 }], lead: 0, mission: m });
  trick(ok, ['b9', 'b1', 'b2']);
  assert.strictEqual(ok.phase, 'play');
});

test('통신: 사실인 표시만(가장 높아요/하나뿐/가장 낮아요), 로켓·가운데 카드·트릭 도중·두 번째는 안 된다', () => {
  assert.strictEqual(c.commTokenFor(['b2', 'b5', 'b9', 'p4', 'r1'], 'b9'), 'high');
  assert.strictEqual(c.commTokenFor(['b2', 'b5', 'b9', 'p4', 'r1'], 'b2'), 'low');
  assert.strictEqual(c.commTokenFor(['b2', 'b5', 'b9', 'p4', 'r1'], 'b5'), null);
  assert.strictEqual(c.commTokenFor(['b2', 'b5', 'b9', 'p4', 'r1'], 'p4'), 'only');
  assert.strictEqual(c.commTokenFor(['b2', 'b5', 'b9', 'p4', 'r1'], 'r1'), null);
  assert.strictEqual(c.commTokenFor(['b2'], 'b3'), null);

  const room = mk(3);
  rig(room, { hands: [['b2', 'b5', 'b9', 'p4', 'r1'], ['b3', 'g1'], ['b1', 'g2']], lead: 0, tasks: [{ card: 'y9', owner: 0 }] });
  const me = id(room, 0);
  assert.ok(c.communicate(room, me, 'b5', 'high').error);
  assert.ok(c.communicate(room, me, 'b9', 'low').error);
  assert.ok(c.communicate(room, me, 'b9', 'only').error);
  assert.ok(c.communicate(room, me, 'r1', 'high').error);
  assert.ok(c.communicate(room, me, 'g1', 'only').error, '남의 카드');
  assert.ok(c.communicate(room, me, 'b9', 'nope').error);
  assert.deepStrictEqual(c.communicate(room, me, 'b9', 'high'), {});
  assert.deepStrictEqual(P(room, 0).signal, { card: 'b9', token: 'high', used: false });
  assert.ok(c.communicate(room, me, 'p4', 'only').error, '임무마다 한 번');
  assert.ok(P(room, 0).hand.includes('b9'), '공개한 카드도 손에 남는다');
  // 트릭 도중에는 아무도 통신할 수 없다
  assert.deepStrictEqual(c.play(room, me, 'b9'), {});
  assert.strictEqual(P(room, 0).signal.used, true);
  assert.strictEqual(c.commBlock(room, P(room, 1)), 'midTrick');
  assert.ok(c.communicate(room, id(room, 1), 'g1', 'only').error);
  trick(room, ['b3', 'b1']);
  // 트릭이 끝나면 다시 할 수 있다 (b3을 냈으니 g1은 하나뿐)
  assert.strictEqual(c.commBlock(room, P(room, 1)), null);
  assert.deepStrictEqual(c.communicate(room, id(room, 1), 'g1', 'only'), {});
  // 다른 사람 화면에서도 보인다
  const v = c.viewFor(room, id(room, 2));
  assert.deepStrictEqual(v.players[1].signal, { card: 'g1', token: 'only', used: false });
});

test('통신 금지 / 늦게 열림 / 한 명만 / 방해(표시는 본인만 본다)', () => {
  const hands = [['b2', 'b9', 'p9', 'p8'], ['b1', 'g1', 'p1', 'p2'], ['b3', 'g2', 'p3', 'p4']];
  const idx = (k) => c.MISSIONS.findIndex((x) => x[k]) + 1;
  const no = mk(3);
  rig(no, { hands, lead: 0, mission: idx('noComm') });
  assert.strictEqual(c.commBlock(no, P(no, 0)), 'noComm');
  assert.match(c.communicate(no, id(no, 0), 'b9', 'high').error, /금지/);

  const late = mk(3);
  const lm = idx('commFrom');
  rig(late, { hands, lead: 0, mission: lm, tasks: [{ card: 'y9', owner: 0 }] }); // 손에 없는 과제: 끝나지 않게
  const from = c.MISSIONS[lm - 1].commFrom;
  assert.ok(from >= 2);
  for (let k = 1; k < from; k++) {
    assert.strictEqual(c.commBlock(late, P(late, 0)), 'notYet');
    assert.match(c.communicate(late, id(late, 0), 'b9', 'high').error, /트릭부터/);
    for (let j = 0; j < 3; j++) assert.deepStrictEqual(c.force(late, late.hostId), {});
  }
  assert.strictEqual(late.phase, 'play');
  assert.strictEqual(c.commBlock(late, P(late, 0)), null);

  const one = mk(4, idx('commOne'));
  assert.strictEqual(one.phase, 'choose');
  const cmd = P(one, one.commander);
  const chosen = P(one, (one.commander + 3) % 4);
  assert.deepStrictEqual(c.choose(one, cmd.id, chosen.id), {});
  assert.strictEqual(one.commPlayer, chosen.id);
  assert.strictEqual(one.phase, 'tasks');
  pickAll(one);
  assert.strictEqual(c.commBlock(one, cmd), 'notChosen');
  assert.ok(c.communicate(one, cmd.id, 'r4', 'high').error);
  assert.strictEqual(c.viewFor(one, chosen.id).commBlock, c.commBlock(one, chosen));

  const dz = mk(3);
  rig(dz, { hands, lead: 0, mission: idx('deadzone') });
  assert.deepStrictEqual(c.communicate(dz, id(dz, 0), 'b9', 'high'), {});
  assert.deepStrictEqual(c.viewFor(dz, id(dz, 0)).players[0].signal, { card: 'b9', token: 'high', used: false });
  assert.deepStrictEqual(c.viewFor(dz, id(dz, 1)).players[0].signal, { card: 'b9', token: null, used: false });
  assert.ok(!dz.log.some((l) => l.includes('가장 높아요')), '기록에도 표시가 남지 않는다');
});

test('임무 성공 → 다음 임무, 실패 → 같은 임무 다시 (방장만). 마지막 임무를 깨면 끝', () => {
  const room = mk(3);
  rig(room, { hands: [['b9'], ['b1'], ['b2']], tasks: [{ card: 'b1', owner: 0 }], lead: 0, mission: 1 });
  trick(room, ['b9', 'b1', 'b2']);
  assert.strictEqual(room.result.ok, true);
  assert.strictEqual(room.cleared, 1);
  assert.strictEqual(room.settings.startMission, 2);
  assert.strictEqual(c.viewFor(room, id(room, 1)).mode, 'result');
  assert.ok(c.next(room, guest(room)).error);
  assert.deepStrictEqual(c.next(room, room.hostId), {});
  assert.strictEqual(room.mission, 2);
  assert.strictEqual(room.attempt, 1);
  assert.strictEqual(room.tasks.length, 2);
  assert.strictEqual(room.players.reduce((n, p) => n + p.hand.length, 0), 40);

  rig(room, { hands: [['b9'], ['b1'], ['b2']], tasks: [{ card: 'b1', owner: 1 }], lead: 0, mission: 2 });
  trick(room, ['b9', 'b1', 'b2']);
  assert.strictEqual(room.result.ok, false);
  assert.deepStrictEqual(c.next(room, room.hostId), {});
  assert.strictEqual(room.mission, 2);
  assert.strictEqual(room.attempt, 2);

  // 대기실로 돌아가도 이어서 할 임무가 남는다
  assert.deepStrictEqual(c.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.settings.startMission, 2);
  assert.strictEqual(room.cleared, 1);
  assert.deepStrictEqual(c.start(room, room.hostId), {});
  assert.strictEqual(room.mission, 2);

  // 마지막 임무
  rig(room, { hands: [['b9'], ['b1'], ['b2']], tasks: [{ card: 'b1', owner: 0 }], lead: 0, mission: 30 });
  trick(room, ['b9', 'b1', 'b2']);
  assert.deepStrictEqual(c.next(room, room.hostId), {});
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(c.viewFor(room, id(room, 0)).mode, 'over');
  assert.strictEqual(room.cleared, 30);
  assert.deepStrictEqual(c.restart(room, room.hostId), {});
  assert.strictEqual(room.mission, 1);
});

test('다시 시작: 진행 중이면 같은 임무를 새로 섞고, 성공 화면이면 다음 임무로', () => {
  const room = mk(4, 5);
  const g = room.gameNo;
  assert.deepStrictEqual(c.restart(room, room.hostId), {});
  assert.strictEqual(room.mission, 5);
  assert.strictEqual(room.attempt, 2);
  assert.strictEqual(room.gameNo, g);
  assert.ok(c.restart(room, guest(room)).error);
  assert.ok(c.backToLobby(room, guest(room)).error);
  assert.deepStrictEqual(c.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.hand.length === 0));
  assert.ok(c.restart(room, room.hostId).error);
});

test('방장 force: 사령관 선택 / 과제 고르기 / 나눠 주기 / 가장 낮은 카드 내기 / 결과 넘기기', () => {
  const room = mk(3, 16); // solo
  assert.ok(c.force(room, guest(room)).error);
  assert.deepStrictEqual(c.force(room, room.hostId), {});
  assert.strictEqual(room.phase, 'play');
  assert.ok(room.tasks.every((t) => t.owner === id(room, (room.commander + 1) % 3)));

  const a = mk(3, 11);
  for (let k = 0; k < 4; k++) assert.deepStrictEqual(c.force(a, a.hostId), {});
  assert.strictEqual(a.phase, 'play');
  const per = a.players.map((p) => a.tasks.filter((t) => t.owner === p.id).length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 1);

  const r = mk(3);
  rig(r, { hands: [['b5', 'r2', 'p1'], ['b3', 'b9', 'y1'], ['g4', 'r1', 'g1']], lead: 0, tasks: [{ card: 'y1', owner: 1 }] });
  assert.deepStrictEqual(c.force(r, r.hostId), {});
  assert.deepStrictEqual(r.trick.plays.map((x) => x.card), ['p1'], '로켓보다 색 카드, 가장 낮은 것');
  assert.deepStrictEqual(c.force(r, r.hostId), {});
  assert.deepStrictEqual(r.trick.plays.map((x) => x.card), ['p1', 'y1'], '분홍이 없으면 아무거나 중 가장 낮은 것');
  assert.deepStrictEqual(c.force(r, r.hostId), {});
  assert.strictEqual(r.phase, 'result');
  assert.deepStrictEqual(c.force(r, r.hostId), {});
  assert.strictEqual(r.phase, 'tasks');
  assert.strictEqual(r.attempt, 2);
});

test('화면 정보: 내 손패만 보이고, 남은 카드 수·낸 카드·통신·과제는 모두에게 보인다', () => {
  const room = mk(4, 9);
  pickAll(room);
  for (const viewer of room.players) {
    const v = c.viewFor(room, viewer.id);
    assert.deepStrictEqual(v.hand, viewer.hand);
    v.players.forEach((vp, i) => {
      assert.strictEqual(vp.count, room.players[i].hand.length);
      assert.ok(!('hand' in vp) && !('token' in vp));
    });
    assert.strictEqual(v.tasks.length, 4);
    assert.ok(v.tasks.every((t) => t.owner));
    assert.ok(!JSON.stringify(v).includes(room.players.find((p) => p.id !== viewer.id).token));
    if (v.mode === 'play') assert.ok(v.legal.length && v.legal.every((x) => viewer.hand.includes(x)));
    else assert.deepStrictEqual(v.legal, []);
    assert.ok(v.commOptions.every((o) => viewer.hand.includes(o.card)));
  }
  const lobby = c.createRoom('L');
  c.addPlayer(lobby, 'a');
  const lv = c.viewFor(lobby, lobby.hostId);
  assert.strictEqual(lv.mode, 'lobby');
  assert.strictEqual(lv.missions.length, 30);
});

test('저장했다 되살려도 똑같이 보이고 이어서 진행된다', () => {
  const room = mk(5, 18);
  for (let step = 0; step < 20; step++) {
    const text = serializeRoom(room);
    const back = deserializeRoom(text);
    assert.strictEqual(serializeRoom(back), text);
    for (const p of room.players) assert.deepStrictEqual(c.viewFor(back, p.id), c.viewFor(room, p.id));
    c.actions.force(back, back.hostId, {});
    c.actions.force(room, room.hostId, {});
  }
});

// 무작위 플레이: 고르기/나눠 주기/통신/카드 내기를 아무렇게나. 임무는 반드시 끝나고 상태가 깨지지 않는다
const rnd = (a) => a[crypto.randomInt(a.length)];
function randomStep(room) {
  const ids = room.players.map((p) => p.id);
  const cmd = room.players[room.commander];
  if (room.phase === 'choose') {
    const opts = room.choose[0] === 'solo' ? ids.filter((x) => x !== cmd.id) : ids;
    return c.actions.choose(room, cmd.id, { target: rnd(opts) });
  }
  if (room.phase === 'tasks') {
    const free = room.tasks.map((t, i) => (t.owner ? -1 : i)).filter((i) => i >= 0);
    if (c.MISSIONS[room.mission - 1].assign) {
      const ok = ids.filter((x) => c.canAssign(room, x));
      assert.deepStrictEqual(c.viewFor(room, cmd.id).assignable, ok);
      return c.actions.assign(room, cmd.id, { index: rnd(free), target: rnd(ok) });
    }
    return c.actions.pick(room, room.players[room.picker].id, { index: rnd(free) });
  }
  // 가끔 아무나 통신
  if (crypto.randomInt(4) === 0) {
    const p = rnd(room.players);
    const v = c.viewFor(room, p.id);
    if (v.commOptions.length) {
      const o = rnd(v.commOptions);
      assert.deepStrictEqual(c.actions.comm(room, p.id, { card: o.card, token: o.token }), {});
    }
  }
  const p = room.players[room.turn];
  const v = c.viewFor(room, p.id);
  assert.strictEqual(v.mode, 'play');
  return c.actions.play(room, p.id, { card: rnd(v.legal) });
}

test('3~5명이 무작위로 여러 임무를 하면 임무는 늘 끝나고, 카드·과제·비밀이 깨지지 않는다', () => {
  let wins = 0;
  let missions = 0;
  for (const n of [3, 4, 5]) {
    for (let g = 0; g < 6; g++) {
      const room = mk(n, 1 + crypto.randomInt(30));
      for (let m = 0; m < 12; m++) {
        let steps = 0;
        while (room.phase !== 'result') {
          assert.ok(['choose', 'tasks', 'play'].includes(room.phase), room.phase);
          const r = randomStep(room);
          assert.deepStrictEqual(r, {}, `${room.phase} ${JSON.stringify(r)}`);
          steps += 1;
          assert.ok(steps < 200, '임무가 끝나지 않아요');
          // 카드 수: 손 + 이번 임무에 나온 카드 = 40, 겹치는 카드 없음
          const all = [...room.players.flatMap((p) => p.hand), ...room.played];
          assert.strictEqual(all.length, 40);
          assert.strictEqual(new Set(all).size, 40);
          assert.ok(room.trickNo <= Math.floor(40 / n));
          const counts = room.players.map((p) => p.hand.length);
          assert.ok(Math.max(...counts) - Math.min(...counts) <= (n === 3 ? 2 : 1));
          // 비밀: 다른 사람 화면에는 내 손패가 없다
          for (const viewer of room.players) {
            const v = c.viewFor(room, viewer.id);
            assert.deepStrictEqual(v.hand, viewer.hand);
            assert.ok(v.players.every((vp) => !('hand' in vp)));
            const others = room.players.filter((p) => p.id !== viewer.id).flatMap((p) => p.hand);
            assert.ok(v.legal.every((x) => !others.includes(x)));
            assert.ok(v.commOptions.every((o) => !others.includes(o.card)));
          }
          // 순서가 있는 과제가 끝났다면 규칙대로였는지
          const done = room.tasks.filter((t) => t.done);
          done.filter((t) => /^[1-5]$/.test(t.token || '')).forEach((t) => {
            const before = room.tasks.filter((x) => x.done && x.trick < t.trick).length;
            const upto = room.tasks.filter((x) => x.done && x.trick <= t.trick).length;
            assert.ok(before < Number(t.token) && Number(t.token) <= upto, '번호 과제는 그 트릭이 차지한 자리 안에서 완료');
          });
        }
        missions += 1;
        if (c.MISSIONS[room.mission - 1].assign) {
          const per = room.players.map((p) => room.tasks.filter((t) => t.owner === p.id).length);
          assert.ok(Math.max(...per) - Math.min(...per) <= 1, '나눠 주기는 고르게');
        }
        if (room.result.ok) {
          wins += 1;
          assert.ok(room.tasks.every((t) => t.done));
        }
        if (room.result.ok && room.mission === 30) break;
        assert.deepStrictEqual(c.next(room, room.hostId), {});
      }
    }
  }
  assert.ok(missions >= 18 * 1);
  assert.ok(wins >= 0);
});

function getHost(room) { return room.players.find((p) => p.id === room.hostId); }

test('결과 넘기기: 방장만. 방장 접속이 끊기면 남은 사람 누구나 넘길 수 있다', () => {
  const room = mk(3);
  rig(room, { hands: [['b9'], ['b1'], ['b2']], tasks: [{ card: 'b1', owner: 1 }], lead: 0 });
  trick(room, ['b9', 'b1', 'b2']);
  assert.strictEqual(room.result.ok, false);
  const g = guest(room);
  assert.strictEqual(c.viewFor(room, g).canNext, false);
  assert.strictEqual(c.viewFor(room, room.hostId).canNext, true);
  assert.ok(c.next(room, g).error);
  getHost(room).connected = false;
  assert.ok(c.next(room, 'nobody').error, '방에 없는 사람은 안 된다');
  assert.strictEqual(c.viewFor(room, g).canNext, true);
  assert.deepStrictEqual(c.next(room, g), {});
  assert.strictEqual(room.attempt, 2);
});

test('과제 고르게 나누기(canAssign): 여러 인원·과제 수에서 끝까지 나눌 수 있고 차이는 1 이하', () => {
  for (const n of [3, 4, 5]) {
    for (let t = 1; t <= 9; t++) {
      for (let g = 0; g < 30; g++) {
        const room = mk(n);
        room.tasks = Array.from({ length: t }, (_, i) => ({ card: c.TASK_DECK[i], token: null, owner: null, done: false, trick: null }));
        for (let i = 0; i < t; i++) {
          const ok = room.players.filter((p) => c.canAssign(room, p.id));
          assert.ok(ok.length > 0, `${n}명 ${t}개: 줄 사람이 없음`);
          room.tasks[i].owner = ok[crypto.randomInt(ok.length)].id;
        }
        const per = room.players.map((p) => room.tasks.filter((x) => x.owner === p.id).length);
        assert.ok(Math.max(...per) - Math.min(...per) <= 1);
      }
    }
  }
});
