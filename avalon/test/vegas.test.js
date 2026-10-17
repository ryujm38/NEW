'use strict';
const test = require('node:test');
const assert = require('node:assert');
const v = require('../vegas');

function mk(n = 4) {
  const room = v.createRoom('LV');
  for (let i = 0; i < n; i++) v.addPlayer(room, `p${i}`);
  assert.deepStrictEqual(v.start(room, room.hostId), {});
  return room;
}
const cur = (room) => room.players[room.turn];
const P = (room, i) => room.players[i];
// 지금 차례인 사람이 굴리고, 나온 값을 직접 정한다 (규칙을 정확히 시험하려고)
function rollAs(room, values) {
  assert.deepStrictEqual(v.roll(room, cur(room).id), {});
  room.rolled = values.slice().sort((a, b) => a - b);
  cur(room).dice = values.length;
}
const sum = (a) => a.reduce((x, y) => x + y, 0);

test('지폐 54장: 종류별 장수와 합계', () => {
  assert.strictEqual(v.BILLS.length, 54);
  const count = (x) => v.BILLS.filter((b) => b === x).length;
  assert.deepStrictEqual([10, 20, 30, 40, 50, 60, 70, 80, 90].map(count), [6, 8, 8, 6, 6, 5, 5, 5, 5]);
  assert.strictEqual(sum(v.BILLS), 6 * 10 + 8 * 20 + 8 * 30 + 6 * 40 + 6 * 50 + 5 * (60 + 70 + 80 + 90));
});

test('시작: 3~6명, 방장만, 접속 끊김 불가. 주사위는 8개(6명이면 6개)', () => {
  const two = v.createRoom('X');
  v.addPlayer(two, 'a'); v.addPlayer(two, 'b');
  assert.ok(v.start(two, two.hostId).error);
  const full = v.createRoom('Y');
  for (let i = 0; i < 6; i++) v.addPlayer(full, `p${i}`);
  assert.ok(v.addPlayer(full, 'p7').error);
  assert.ok(v.start(full, full.players[1].id).error);
  full.players[2].connected = false;
  assert.ok(v.start(full, full.hostId).error);
  full.players[2].connected = true;
  v.start(full, full.hostId);
  assert.ok(full.players.every((p) => p.dice === 6));
  for (const n of [3, 4, 5]) assert.ok(mk(n).players.every((p) => p.dice === 8));
});

test('라운드 시작: 카지노 6곳에 합이 $50k 이상이 되도록 지폐를 깔고 큰 것부터 정렬', () => {
  for (let g = 0; g < 30; g++) {
    const room = mk(4);
    assert.strictEqual(room.casinos.length, 6);
    room.casinos.forEach((c, i) => {
      assert.strictEqual(c.n, i + 1);
      assert.ok(sum(c.bills) >= 50, `카지노 ${c.n}: ${c.bills}`);
      assert.deepStrictEqual(c.bills, c.bills.slice().sort((a, b) => b - a));
    });
    const dealt = room.casinos.reduce((n, c) => n + c.bills.length, 0);
    assert.strictEqual(room.deck.length, 54 - dealt);
  }
});

test('지폐는 필요한 만큼만 깐다 (정해 둔 덱으로 확인). 덱이 모자라도 멈추지 않는다', () => {
  const room = mk(3);
  const drawOrder = [20, 40, 90, 10, 10, 10, 10, 10, 30, 10, 20, 50, 60, 70];
  room.deck = drawOrder.slice().reverse(); // 맨 끝에서부터 뽑는다
  v.startRound(room);
  assert.deepStrictEqual(room.casinos.map((c) => c.bills), [[40, 20], [90], [10, 10, 10, 10, 10], [30, 20, 10], [50], [60]]);
  assert.deepStrictEqual(room.deck, [70]);
  // 덱이 모자라면 있는 만큼만 깐다
  const poor = mk(3);
  poor.deck = [10, 20];
  v.startRound(poor);
  assert.deepStrictEqual(poor.casinos.map((c) => c.bills), [[20, 10], [], [], [], [], []]);
  assert.strictEqual(poor.phase, 'play');
});

test('차례: 굴리기 → 숫자 고르기. 순서와 권한이 맞아야 한다', () => {
  const room = mk(3);
  const A = cur(room);
  const other = room.players.find((p) => p !== A);
  assert.ok(v.roll(room, other.id).error);
  assert.ok(v.place(room, A.id, 3).error); // 굴리기 전
  assert.deepStrictEqual(v.roll(room, A.id), {});
  assert.strictEqual(room.rolled.length, 8);
  assert.ok(room.rolled.every((x) => x >= 1 && x <= 6));
  assert.ok(v.roll(room, A.id).error); // 두 번 굴릴 수 없다
  assert.ok(v.place(room, other.id, room.rolled[0]).error);
  const missing = [1, 2, 3, 4, 5, 6].find((n) => !room.rolled.includes(n));
  if (missing) assert.ok(v.place(room, A.id, missing).error); // 나오지 않은 숫자
});

test('놓기: 고른 숫자가 나온 주사위를 모두 그 번호 카지노에 놓고, 다음 사람으로 넘어간다', () => {
  const room = mk(3);
  const A = cur(room);
  rollAs(room, [1, 1, 3, 3, 3, 5, 6, 6]);
  assert.deepStrictEqual(v.place(room, A.id, 3), {});
  assert.deepStrictEqual(room.casinos[2].dice, { [A.id]: 3 });
  assert.strictEqual(A.dice, 5);
  assert.strictEqual(room.rolled, null);
  assert.notStrictEqual(cur(room).id, A.id);
  assert.strictEqual(room.step, 'roll');
});

test('주사위가 없는 사람은 건너뛰고, 혼자 남으면 계속 이어서 한다', () => {
  const room = mk(3);
  const [a, b, c] = [cur(room), P(room, (room.turn + 1) % 3), P(room, (room.turn + 2) % 3)];
  b.dice = 0;
  c.dice = 0;
  rollAs(room, [2, 2]);
  a.dice = 2;
  v.place(room, a.id, 2);
  assert.strictEqual(a.dice, 0);
  assert.strictEqual(room.phase, 'roundEnd'); // 모두 소진되어 라운드 끝
  const room2 = mk(3);
  const [x, y, z] = [cur(room2), P(room2, (room2.turn + 1) % 3), P(room2, (room2.turn + 2) % 3)];
  y.dice = 0;
  rollAs(room2, [4, 4, 4, 2, 2]);
  v.place(room2, x.id, 4);
  assert.strictEqual(x.dice, 2);
  assert.strictEqual(cur(room2).id, z.id); // y는 건너뜀
  rollAs(room2, [1]);
  v.place(room2, z.id, 1);
  assert.strictEqual(z.dice, 0);
  assert.strictEqual(cur(room2).id, x.id); // x가 남은 주사위로 이어서
  assert.strictEqual(room2.phase, 'play');
  assert.strictEqual(room2.step, 'roll');
});

test('카지노 계산: 같은 수를 놓은 사람은 모두 탈락하고 남은 사람이 큰 지폐부터 가져간다', () => {
  const room = mk(4);
  const [a, b, c, d] = room.players;
  // 동수가 있는 경우: a=3, b=3 탈락, c=2가 1등
  const r1 = v.settleCasino(room, { n: 1, bills: [90, 50, 30], dice: { [a.id]: 3, [b.id]: 3, [c.id]: 2 } });
  assert.deepStrictEqual(r1.rows.map((r) => [r.n, r.tied, r.bill]).sort(), [[2, false, 90], [3, true, null], [3, true, null]]);
  assert.deepStrictEqual(c.money, [90]);
  assert.deepStrictEqual([a.money, b.money], [[], []]);
  // 동수가 없는 경우: 많이 놓은 순서대로 큰 지폐, 남는 지폐는 버림
  const r2 = v.settleCasino(room, { n: 2, bills: [60, 40], dice: { [a.id]: 4, [b.id]: 2, [c.id]: 1 } });
  assert.deepStrictEqual(a.money, [60]);
  assert.deepStrictEqual(b.money, [40]);
  assert.deepStrictEqual(c.money, [90]); // c는 두 번째 계산에서 못 받음
  assert.strictEqual(r2.rows.find((r) => r.id === c.id).bill, null);
  // 셋이 모두 같으면 아무도 못 받고, 한 명이 남으면 그 사람이 1등
  v.settleCasino(room, { n: 3, bills: [80, 20], dice: { [a.id]: 2, [b.id]: 2, [c.id]: 2 } });
  assert.deepStrictEqual([a.money, b.money, c.money], [[60], [40], [90]]);
  v.settleCasino(room, { n: 4, bills: [70, 50, 10], dice: { [d.id]: 1 } });
  assert.deepStrictEqual(d.money, [70]);
  // 아무도 없으면 지폐는 버려진다
  const r5 = v.settleCasino(room, { n: 5, bills: [50], dice: {} });
  assert.deepStrictEqual(r5.rows, []);
  // 3등까지 받기
  const e = v.settleCasino(room, { n: 6, bills: [50, 40, 30], dice: { [a.id]: 5, [b.id]: 3, [c.id]: 1 } });
  assert.deepStrictEqual(e.rows.map((r) => r.bill), [50, 40, 30]);
});

test('라운드 끝: 결과가 공개되고, 모두 확인하면 다음 라운드. 시작 플레이어가 넘어간다', () => {
  const room = mk(3);
  const first = room.turn;
  // 모든 주사위를 빨리 소진시킨다
  room.players.forEach((p) => { p.dice = 1; });
  for (let i = 0; i < 3; i++) {
    rollAs(room, [i + 1]);
    v.place(room, cur(room).id, i + 1);
  }
  assert.strictEqual(room.phase, 'roundEnd');
  assert.strictEqual(room.results.length, 6);
  const view = v.viewFor(room, P(room, 0).id);
  assert.strictEqual(view.mode, 'roundEnd');
  assert.strictEqual(view.results.length, 6);
  assert.ok(room.players.every((p) => p.money.length >= 1)); // 각자 단독 1등을 한 카지노가 있다
  assert.ok(v.ack(room, 'nobody').error);
  room.players.slice(0, 2).forEach((p) => v.ack(room, p.id));
  assert.strictEqual(room.phase, 'roundEnd');
  v.ack(room, P(room, 2).id);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(room.round, 2);
  assert.strictEqual(room.turn, (first + 1) % 3); // 시작 플레이어가 한 칸 넘어감
  assert.ok(room.players.every((p) => p.dice === 8)); // 주사위 새로
  assert.ok(room.casinos.every((c) => Object.keys(c.dice).length === 0));
  assert.deepStrictEqual(v.viewFor(room, P(room, 0).id).results, []);
});

test('4라운드가 끝나면 돈이 가장 많은 사람이 승리, 동액이면 공동 우승', () => {
  const room = mk(3);
  room.round = 4;
  room.phase = 'roundEnd';
  room.acks = new Set();
  room.players[0].money = [90, 50];
  room.players[1].money = [70, 70];
  room.players[2].money = [10];
  room.players.forEach((p) => v.ack(room, p.id));
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds.sort(), [P(room, 0).id, P(room, 1).id].sort()); // 140 vs 140
  assert.strictEqual(v.viewFor(room, P(room, 0).id).mode, 'over');
  room.phase = 'over';
});

test('접속이 끊긴 사람은 라운드 끝 확인에서 기다리지 않는다', () => {
  const room = mk(3);
  room.phase = 'roundEnd';
  room.round = 1;
  room.acks = new Set([P(room, 0).id, P(room, 1).id]);
  P(room, 2).connected = false;
  v.afterDisconnect(room);
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(room.round, 2);
});

test('방장 force: 대신 굴리고 가장 많이 나온 숫자를 놓는다. 라운드 끝에서는 다음으로', () => {
  const room = mk(3);
  const nonHost = room.players.find((p) => p.id !== room.hostId);
  assert.ok(v.force(room, nonHost.id).error);
  const before = cur(room).id;
  assert.deepStrictEqual(v.force(room, room.hostId), {});
  assert.notStrictEqual(cur(room).id, before);
  assert.ok(room.casinos.some((c) => Object.keys(c.dice).length));
  // 라운드 끝 → 넘기기
  const r = mk(3);
  r.phase = 'roundEnd';
  r.round = 1;
  v.force(r, r.hostId);
  assert.strictEqual(r.round, 2);
});

test('초기화와 다시 시작', () => {
  const room = mk(4);
  const nonHost = room.players.find((p) => p.id !== room.hostId).id;
  assert.ok(v.backToLobby(room, nonHost).error);
  const g = room.gameNo;
  assert.deepStrictEqual(v.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, g + 1);
  assert.strictEqual(room.round, 1);
  assert.ok(room.players.every((p) => p.money.length === 0));
  assert.deepStrictEqual(v.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
});

test('각자에게 보이는 상태: 굴린 주사위는 모두에게, 모드는 차례인 사람만 roll/place', () => {
  const room = mk(3);
  const A = cur(room);
  const B = room.players.find((p) => p !== A);
  assert.strictEqual(v.viewFor(room, A.id).mode, 'roll');
  assert.strictEqual(v.viewFor(room, B.id).mode, 'wait');
  v.roll(room, A.id);
  assert.strictEqual(v.viewFor(room, A.id).mode, 'place');
  assert.deepStrictEqual(v.viewFor(room, B.id).rolled, room.rolled);
  assert.strictEqual(v.viewFor(room, B.id).mode, 'wait');
  assert.ok(!JSON.stringify(v.viewFor(room, B.id)).includes('"token"'));
});

// ---- 무작위로 끝까지 ----

test('3~6명이 무작위로 끝까지 두면 4라운드에 끝나고 주사위/지폐가 보존된다', () => {
  for (const n of [3, 4, 5, 6]) {
    for (let g = 0; g < 20; g++) {
      const room = mk(n);
      const perPlayer = v.diceFor(n);
      let rounds = 1;
      for (let step = 0; step < 2000 && room.phase !== 'over'; step++) {
        if (room.phase === 'roundEnd') {
          // 라운드 끝: 카지노마다 주사위가 놓인 수가 정확해야 한다
          for (const c of room.casinos) assert.ok(Object.values(c.dice).every((x) => x > 0));
          const placed = room.casinos.reduce((k, c) => k + sum(Object.values(c.dice)), 0);
          assert.strictEqual(placed, perPlayer * n, `${n}명 라운드 ${rounds}: 놓인 주사위 수`);
          room.players.forEach((p) => v.ack(room, p.id));
          rounds += room.phase === 'play' ? 1 : 0;
          continue;
        }
        const A = cur(room);
        assert.ok(A.dice > 0);
        assert.deepStrictEqual(v.roll(room, A.id), {});
        const choices = [...new Set(room.rolled)];
        assert.deepStrictEqual(v.place(room, A.id, choices[Math.floor(Math.random() * choices.length)]), {});
        // 보존: 놓은 주사위 + 남은 주사위 = 시작 주사위
        const placed = room.casinos.reduce((k, c) => k + sum(Object.values(c.dice)), 0);
        const left = room.players.reduce((k, p) => k + p.dice, 0);
        if (room.phase === 'play') assert.strictEqual(placed + left, perPlayer * n);
      }
      assert.strictEqual(room.phase, 'over', `${n}명 ${g}판이 끝나지 않았어요`);
      assert.strictEqual(room.round, 4);
      const best = Math.max(...room.players.map((p) => sum(p.money)));
      assert.ok(room.winnerIds.length >= 1);
      assert.ok(room.winnerIds.every((id) => sum(room.players.find((p) => p.id === id).money) === best));
      // 지폐는 54장을 넘게 나눠 가질 수 없고 모두 유효한 값
      const all = room.players.flatMap((p) => p.money);
      assert.ok(all.length <= 54 && all.every((b) => v.BILLS.includes(b)));
    }
  }
});
