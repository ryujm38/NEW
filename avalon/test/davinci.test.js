'use strict';
const test = require('node:test');
const assert = require('node:assert');
const d = require('../davinci');
const { serializeRoom, deserializeRoom } = require('../hub');

const J = d.JOKER;
let seqId = 0;
const T = (c, n, open = false) => ({ id: `t${seqId++}`, c, n, open, miss: [] });
const cur = (room) => room.players[room.turn];
const others = (room, id) => room.players.filter((p) => p.id !== id);
const totalTiles = (room) => room.pool.length + (room.drawn ? 1 : 0)
  + room.players.reduce((n, p) => n + p.row.length + p.pendingJokers.length, 0);

function mk(n = 3, jokers = true) {
  const room = d.createRoom('DV');
  for (let i = 0; i < n; i++) d.addPlayer(room, `p${i}`);
  room.settings.jokers = jokers;
  assert.deepStrictEqual(d.start(room, room.hostId), {});
  if (room.phase === 'setup') {
    room.players.forEach((p) => {
      while (p.pendingJokers.length) assert.deepStrictEqual(d.setupJoker(room, p.id, 0), {});
      assert.deepStrictEqual(d.ready(room, p.id), {});
    });
  }
  assert.strictEqual(room.phase, 'play');
  return room;
}

// 정해 둔 판: 줄과 가운데 타일을 직접 놓고, 지금 차례인 사람이 drawn을 들고 있게 한다
function fixed(rows, { drawn = null, pool = [] } = {}) {
  const room = mk(rows.length, true);
  room.players.forEach((p, i) => { p.row = rows[i]; p.out = false; });
  room.turn = 0;
  room.pool = pool;
  room.drawn = drawn;
  room.step = 'guess';
  room.guesses = 0;
  return room;
}

// 줄이 규칙대로 정렬돼 있는지 (조커는 아무 데나, 나머지는 숫자 순서, 같으면 검은색이 왼쪽)
function sortedOk(row) {
  const keys = row.filter((t) => t.n !== J).map(d.sortKey);
  return keys.every((k, i) => i === 0 || keys[i - 1] < k);
}

test('타일 구성: 조커 포함 26개(아이디는 모두 다르고 숫자와 무관), 조커 빼면 24개', () => {
  const t = d.buildTiles(true);
  assert.strictEqual(t.length, 26);
  assert.strictEqual(new Set(t.map((x) => x.id)).size, 26);
  for (const c of ['b', 'w']) {
    assert.deepStrictEqual(t.filter((x) => x.c === c && x.n !== J).map((x) => x.n).sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    assert.strictEqual(t.filter((x) => x.c === c && x.n === J).length, 1);
  }
  assert.ok(t.every((x) => /^[0-9a-f]{8}$/.test(x.id)));
  assert.strictEqual(d.buildTiles(false).length, 24);
  assert.ok(d.buildTiles(false).every((x) => x.n !== J));
});

test('시작: 2~4명, 2~3명은 4개씩·4명은 3개씩, 조커가 있으면 모두 준비 완료를 눌러야 시작', () => {
  const one = d.createRoom('A');
  d.addPlayer(one, 'a');
  assert.ok(d.start(one, one.hostId).error);
  const full = d.createRoom('B');
  for (let i = 0; i < 4; i++) d.addPlayer(full, `p${i}`);
  assert.ok(d.addPlayer(full, 'p5').error);
  assert.ok(d.start(full, full.players[1].id).error);
  for (const [n, k] of [[2, 4], [3, 4], [4, 3]]) {
    for (let g = 0; g < 20; g++) {
      const room = d.createRoom('C');
      for (let i = 0; i < n; i++) d.addPlayer(room, `p${i}`);
      d.start(room, room.hostId);
      assert.strictEqual(room.phase, 'setup');
      room.players.forEach((p) => {
        assert.strictEqual(p.row.length + p.pendingJokers.length, k);
        assert.ok(sortedOk(p.row));
        assert.ok(p.row.every((t) => t.n !== J));
      });
      assert.strictEqual(room.pool.length, 26 - n * k);
      // 조커를 받은 사람은 놓기 전엔 준비 완료가 안 된다
      const withJ = room.players.find((p) => p.pendingJokers.length);
      if (withJ) {
        assert.ok(d.ready(room, withJ.id).error);
        assert.ok(d.setupJoker(room, withJ.id, 99).error);
        assert.deepStrictEqual(d.setupJoker(room, withJ.id, 1), {});
      }
      room.players.forEach((p) => {
        while (p.pendingJokers.length) d.setupJoker(room, p.id, 0);
        assert.strictEqual(room.phase, 'setup');
      });
      room.players.forEach((p, i) => {
        d.ready(room, p.id);
        assert.strictEqual(room.phase, i === n - 1 ? 'play' : 'setup');
      });
      assert.strictEqual(room.step, 'guess');
      assert.ok(room.drawn);
      assert.strictEqual(totalTiles(room), 26);
    }
  }
  // 조커를 빼면 준비 단계 없이 바로 시작
  const room = mk(2, false);
  assert.strictEqual(room.pool.length + 1, 24 - 8);
  assert.ok(room.players.every((p) => p.row.every((t) => t.n !== J)));
});

test('준비 완료 한 번으로 조커 자리까지: 조커를 받은 사람도 누르는 단계가 같다', () => {
  const room = d.createRoom('R');
  for (let i = 0; i < 2; i++) d.addPlayer(room, `p${i}`);
  d.start(room, room.hostId);
  const [A, B] = room.players;
  // A가 조커 2개를 받은 상황, B는 조커 없음
  A.row = [T('b', 2), T('w', 5)];
  A.pendingJokers = [T('b', J), T('w', J)];
  B.pendingJokers = [];
  assert.ok(d.ready(room, A.id).error); // 자리 없이 누르면 안 됨
  assert.ok(d.ready(room, A.id, 9).error); // 없는 자리
  assert.deepStrictEqual(d.actions.ready(room, A.id, { pos: 1 }), {});
  assert.strictEqual(A.ready, false); // 조커가 하나 더 남아서 아직 준비 전
  assert.deepStrictEqual(A.row.map((t) => t.n), [2, J, 5]);
  assert.deepStrictEqual(d.actions.ready(room, A.id, { pos: 3 }), {});
  assert.strictEqual(A.ready, true);
  assert.deepStrictEqual(A.row.map((t) => t.n), [2, J, 5, J]);
  assert.strictEqual(room.phase, 'setup');
  // 조커가 없는 사람은 pos를 보내도 무시하고 준비 완료
  assert.deepStrictEqual(d.actions.ready(room, B.id, { pos: 0 }), {});
  assert.strictEqual(room.phase, 'play');
});

test('대기실 설정: 방장만, 대기실에서만, 조커 켜고 끄기', () => {
  const room = d.createRoom('S');
  d.addPlayer(room, 'a');
  d.addPlayer(room, 'b');
  assert.ok(d.setSetting(room, room.players[1].id, 'jokers', false).error);
  assert.ok(d.setSetting(room, room.hostId, 'jokers', 'no').error);
  assert.ok(d.setSetting(room, room.hostId, 'what', true).error);
  assert.deepStrictEqual(d.setSetting(room, room.hostId, 'jokers', false), {});
  assert.strictEqual(d.viewFor(room, room.hostId).jokers, false);
  d.start(room, room.hostId);
  assert.ok(d.setSetting(room, room.hostId, 'jokers', true).error);
  assert.strictEqual(room.gameJokers, false);
});

test('정렬: 같은 숫자는 검은색이 왼쪽, 숫자 타일은 정해진 자리, 조커 옆이면 여러 자리 중 고를 수 있다', () => {
  const row = [T('b', 2), T('w', 2), T('w', 5), T('b', 9)];
  assert.deepStrictEqual(d.slotRange(row, T('b', 5)), [2, 2]); // 흰5 왼쪽
  assert.deepStrictEqual(d.slotRange(row, T('w', 9)), [4, 4]); // 검9 오른쪽
  assert.deepStrictEqual(d.slotRange(row, T('b', 0)), [0, 0]);
  assert.deepStrictEqual(d.slotRange(row, T('b', 3)), [2, 2]);
  assert.deepStrictEqual(d.slotRange([], T('w', 7)), [0, 0]);
  // 조커는 어디든
  assert.deepStrictEqual(d.slotRange(row, T('b', J)), [0, 4]);
  assert.strictEqual(d.defaultSlot(row, T('b', J)), 4);
  // 조커가 사이에 있으면: 3 J 7 에 5를 넣는 자리는 조커 앞/뒤 둘 다
  const withJ = [T('b', 3), T('w', J), T('w', 7)];
  assert.deepStrictEqual(d.slotRange(withJ, T('b', 5)), [1, 2]);
  assert.strictEqual(d.defaultSlot(withJ, T('b', 5)), 1);
  assert.deepStrictEqual(d.slotRange(withJ, T('w', 1)), [0, 0]);
  assert.deepStrictEqual(d.slotRange(withJ, T('b', 11)), [3, 3]);
  // 맨 앞의 조커: J 4 에 0을 넣으면 조커 앞/뒤
  assert.deepStrictEqual(d.slotRange([T('b', J), T('w', 4)], T('b', 0)), [0, 1]);
  // 끼워 넣기: 정렬이 깨지는 자리는 거절
  const r = withJ.slice();
  assert.strictEqual(d.insertTile(r, T('b', 5), 0), false);
  assert.strictEqual(d.insertTile(r, T('b', 5), 3), false);
  assert.strictEqual(d.insertTile(r, T('b', 5), 2), true);
  assert.deepStrictEqual(r.map((t) => t.n), [3, J, 5, 7]);
  assert.ok(sortedOk(r));
  // 같은 숫자 두 색을 어떤 순서로 넣어도 검-흰
  const r2 = [];
  d.insertTile(r2, T('w', 6));
  d.insertTile(r2, T('b', 6));
  assert.deepStrictEqual(r2.map((t) => t.c), ['b', 'w']);
});

test('맞히기: 맞으면 공개되고 계속하거나 멈출 수 있다. 멈추면 뽑은 타일을 숨겨서 놓는다', () => {
  const a0 = T('b', 1); const a1 = T('w', 8);
  const b0 = T('b', 3); const b1 = T('w', 3); const b2 = T('b', 10);
  const dr = T('w', 5);
  const room = fixed([[a0, a1], [b0, b1, b2]], { drawn: dr, pool: [T('b', 7)] });
  const [A, B] = room.players;
  // 권한·검사
  assert.ok(d.guess(room, B.id, A.id, a0.id, 1).error); // 내 차례가 아님
  assert.ok(d.guess(room, A.id, A.id, a0.id, 1).error); // 내 타일
  assert.ok(d.guess(room, A.id, B.id, b0.id, 12).error);
  assert.ok(d.guess(room, A.id, B.id, b0.id, 'x').error);
  assert.ok(d.guess(room, A.id, B.id, 'nope', 3).error);
  assert.ok(d.stop(room, A.id).error); // 한 번은 맞혀야 함
  assert.ok(d.place(room, A.id, 0).error);
  // 맞힘
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b0.id, 3), {});
  assert.strictEqual(b0.open, true);
  assert.strictEqual(room.guesses, 1);
  assert.strictEqual(room.step, 'guess');
  assert.strictEqual(cur(room), A);
  assert.deepStrictEqual(room.ev, { seq: room.seq, t: 'guess', by: A.id, target: B.id, tile: b0.id, value: 3, ok: true });
  assert.ok(room.log.at(-1).includes('맞았어요'));
  assert.ok(d.guess(room, A.id, B.id, b0.id, 3).error); // 이미 공개
  // 한 번 더 맞힘 (문자열 숫자도 받음)
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b1.id, '3'), {});
  assert.strictEqual(room.guesses, 2);
  // 멈춤 → 놓기 (숨긴 채로, 순서대로)
  assert.deepStrictEqual(d.stop(room, A.id), {});
  assert.strictEqual(room.step, 'place');
  assert.strictEqual(room.placeOpen, false);
  assert.ok(d.place(room, A.id, 0).error); // 1보다 왼쪽은 안 됨
  assert.deepStrictEqual(d.place(room, A.id, 1), {});
  assert.deepStrictEqual(A.row.map((t) => t.n), [1, 5, 8]);
  assert.strictEqual(dr.open, false);
  // 다음 사람 차례, 가운데에서 1개 뽑음
  assert.strictEqual(cur(room), B);
  assert.strictEqual(room.drawn.n, 7);
  assert.strictEqual(room.pool.length, 0);
  assert.strictEqual(room.guesses, 0);
});

test('틀림(뽑은 타일 있음): 뽑은 타일을 공개해서 놓고 차례가 끝난다. 틀린 숫자는 그 타일에 기록', () => {
  const a0 = T('b', 1); const b0 = T('b', 3); const b1 = T('w', 6);
  const dr = T('b', J);
  const room = fixed([[a0], [b0, b1]], { drawn: dr });
  const [A, B] = room.players;
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b1.id, 'J'), {});
  assert.strictEqual(room.ev.ok, false);
  assert.deepStrictEqual(b1.miss, [J]);
  assert.strictEqual(b1.open, false);
  assert.strictEqual(room.step, 'place');
  assert.strictEqual(room.placeOpen, true);
  assert.ok(d.guess(room, A.id, B.id, b0.id, 3).error); // 틀린 뒤엔 더 못 맞힘
  assert.ok(d.stop(room, A.id).error);
  // 조커는 아무 자리나: 맨 앞
  assert.deepStrictEqual(d.place(room, A.id, 0), {});
  assert.deepStrictEqual(A.row.map((t) => t.n), [J, 1]);
  assert.strictEqual(A.row[0].open, true);
  assert.ok(room.log.at(-2).includes('공개해서 놓았어요'));
  assert.strictEqual(cur(room), B);
  assert.strictEqual(room.drawn, null); // 가운데가 비어서 못 뽑음
});

test('틀림(뽑은 타일 없음): 내 숨은 타일 하나를 골라 공개, 하나뿐이면 바로 공개되고 탈락', () => {
  const a0 = T('b', 1); const a1 = T('w', 4); const a2 = T('w', 9, true);
  const b0 = T('b', 3); const b1 = T('w', 6);
  const room = fixed([[a0, a1, a2], [b0, b1]]);
  const [A, B] = room.players;
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b0.id, 5), {});
  assert.strictEqual(room.step, 'reveal');
  assert.ok(d.reveal(room, A.id, a2.id).error); // 이미 공개된 것
  assert.ok(d.reveal(room, A.id, b0.id).error); // 남의 것
  assert.ok(d.reveal(room, B.id, a0.id).error);
  assert.deepStrictEqual(d.reveal(room, A.id, a1.id), {});
  assert.strictEqual(a1.open, true);
  assert.strictEqual(room.ev.t, 'reveal');
  assert.strictEqual(A.out, false);
  assert.strictEqual(cur(room), B);
  // B가 틀리고 숨은 타일이 1개뿐이 아니면 고르기, A 차례에 A가 틀리면 남은 1개가 바로 공개되어 탈락
  assert.deepStrictEqual(d.guess(room, B.id, A.id, a0.id, 7), {});
  assert.strictEqual(room.step, 'reveal');
  assert.deepStrictEqual(d.reveal(room, B.id, b1.id), {});
  assert.strictEqual(cur(room), A);
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b0.id, 4), {});
  assert.strictEqual(A.out, true);
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [B.id]);
  assert.ok(room.log.some((l) => l.includes('탈락')));
});

test('탈락: 타일이 모두 공개되면 탈락하고 차례에서 빠진다. 마지막 한 명이 승리', () => {
  const a = [T('b', 0)]; const b = [T('w', 2)]; const c = [T('b', 5), T('w', 11)];
  const room = fixed([a, b, c], { drawn: T('b', 6) });
  const [A, B, C] = room.players;
  assert.deepStrictEqual(d.guess(room, A.id, B.id, b[0].id, 2), {});
  assert.strictEqual(B.out, true);
  assert.strictEqual(room.phase, 'play');
  assert.ok(d.guess(room, A.id, B.id, b[0].id, 2).error); // 탈락한 사람
  assert.deepStrictEqual(d.stop(room, A.id), {});
  assert.deepStrictEqual(d.place(room, A.id, null), {}); // 정해 주지 않으면 순서대로
  assert.deepStrictEqual(A.row.map((t) => t.n), [0, 6]);
  assert.strictEqual(cur(room), C); // B 건너뜀
  // C가 A의 타일 2개를 다 맞히면 게임 끝, C의 뽑은 타일은 줄에 들어간다
  room.drawn = T('w', 1);
  assert.deepStrictEqual(d.guess(room, C.id, A.id, A.row[1].id, 6), {});
  assert.strictEqual(room.phase, 'play');
  assert.deepStrictEqual(d.guess(room, C.id, A.id, A.row[0].id, 0), {});
  assert.strictEqual(room.phase, 'over');
  assert.deepStrictEqual(room.winnerIds, [C.id]);
  assert.strictEqual(room.drawn, null);
  assert.deepStrictEqual(C.row.map((t) => t.n), [1, 5, 11]);
  assert.ok(room.log.at(-1).startsWith('🏆 게임 끝!'));
  // 끝나면 모두에게 모든 숫자 공개
  const v = d.viewFor(room, A.id);
  assert.ok(v.players.every((p) => p.row.every((t) => t.n !== null)));
  assert.strictEqual(v.mode, 'over');
});

test('조커 맞히기: "조커"라고 해야 맞고, 조커가 없는 판에는 조커라고 할 수 없다', () => {
  const j = T('w', J);
  const room = fixed([[T('b', 1)], [T('b', 2), j]], { drawn: T('b', 3) });
  const [A, B] = room.players;
  assert.deepStrictEqual(d.guess(room, A.id, B.id, j.id, -1), {});
  assert.strictEqual(j.open, true);
  const off = mk(2, false);
  const X = cur(off);
  const Y = others(off, X.id)[0];
  assert.ok(d.guess(off, X.id, Y.id, Y.row[0].id, 'J').error);
});

test('방장 대신 진행: 준비 / 맞히기(한 번 이상이면 멈춤) / 놓기 / 공개', () => {
  // 준비 단계: 조커는 맨 끝, 모두 준비 완료
  for (let g = 0; g < 30; g++) {
    const room = d.createRoom('F');
    for (let i = 0; i < 2; i++) d.addPlayer(room, `p${i}`);
    d.start(room, room.hostId);
    assert.ok(d.force(room, room.players.find((p) => p.id !== room.hostId).id).error);
    assert.deepStrictEqual(d.force(room, room.hostId), {});
    assert.strictEqual(room.phase, 'play');
    room.players.forEach((p) => {
      assert.strictEqual(p.pendingJokers.length, 0);
      assert.strictEqual(p.row.length, 4);
    });
  }
  // 한 번 맞힌 뒤 멈춘 사람: 멈추고 순서대로 숨겨서 놓기
  const b0 = T('b', 3); const b1 = T('w', 7);
  let room = fixed([[T('b', 1), T('w', 9)], [b0, b1]], { drawn: T('b', 5) });
  const [A, B] = room.players;
  d.guess(room, A.id, B.id, b0.id, 3);
  assert.deepStrictEqual(d.force(room, room.hostId), {});
  assert.deepStrictEqual(A.row.map((t) => [t.n, t.open]), [[1, false], [5, false], [9, false]]);
  assert.strictEqual(cur(room), B);
  // 아직 안 맞힌 사람: 아무 타일에 아무 숫자 → 어떻든 차례가 넘어간다
  for (let g = 0; g < 40; g++) {
    room = fixed([[T('b', 1), T('w', 9)], [T('b', 3), T('w', 7), T('b', 8)]], { drawn: g % 2 ? T('b', 5) : null });
    const [X, Y] = room.players;
    assert.deepStrictEqual(d.force(room, room.hostId), {});
    assert.ok(room.phase === 'over' || cur(room) === Y, `턴이 넘어가야 해요 (${room.step})`);
    assert.ok(room.log.some((l) => l.includes('방장이')));
    assert.ok(X.row.length >= 2);
  }
  // 공개 고르기에서 멈춘 사람: 가장 왼쪽 숨은 타일
  room = fixed([[T('b', 1, true), T('w', 4), T('w', 9)], [T('b', 3), T('w', 7)]]);
  const [P, Q] = room.players;
  d.guess(room, P.id, Q.id, Q.row[0].id, 0);
  assert.strictEqual(room.step, 'reveal');
  d.force(room, room.hostId);
  assert.deepStrictEqual(P.row.map((t) => t.open), [true, true, false]);
  assert.strictEqual(cur(room), Q);
});

test('viewFor: 남의 숨은 숫자와 남이 뽑은 타일은 보내지 않는다', () => {
  const room = mk(3, true);
  const A = cur(room);
  const [B, C] = others(room, A.id);
  const vb = d.viewFor(room, B.id);
  const va = d.viewFor(room, A.id);
  assert.strictEqual(va.mode, 'guess');
  assert.strictEqual(vb.mode, 'wait');
  assert.deepStrictEqual(va.drawn, { id: room.drawn.id, c: room.drawn.c, n: room.drawn.n });
  assert.strictEqual(vb.drawn, null);
  assert.strictEqual(vb.hasDrawn, true);
  assert.ok(!JSON.stringify(vb).includes(room.drawn.id));
  for (const p of vb.players) {
    p.row.forEach((t) => {
      if (p.id === B.id) assert.notStrictEqual(t.n, null);
      else assert.strictEqual(t.n, null);
    });
  }
  // 공개되면 모두에게
  const t = C.row[0];
  t.open = true;
  assert.strictEqual(d.viewFor(room, B.id).players.find((p) => p.id === C.id).row[0].n, t.n);
  // 내 준비용 조커는 나만
  const r2 = d.createRoom('V');
  for (let i = 0; i < 2; i++) d.addPlayer(r2, `p${i}`);
  d.start(r2, r2.hostId);
  r2.players[0].pendingJokers = [T('b', J)];
  r2.players[0].ready = false;
  const v2 = d.viewFor(r2, r2.players[1].id);
  assert.deepStrictEqual(v2.players[0].pending, []);
  assert.deepStrictEqual(v2.players[0].row, []); // 준비 중에는 남의 줄(길이로 조커가 들킴)을 보내지 않는다
  assert.strictEqual(v2.players[1].row.length, r2.players[1].row.length);
  assert.strictEqual(d.viewFor(r2, r2.players[0].id).players[0].pending.length, 1);
  assert.strictEqual(d.viewFor(r2, r2.players[0].id).slots[1], r2.players[0].row.length);
  assert.ok(!('pool' in v2 && Array.isArray(v2.pool)));
});

test('다시 하기 / 대기실로', () => {
  const room = mk(3);
  const no = room.gameNo;
  assert.ok(d.restart(room, room.players.find((p) => p.id !== room.hostId).id).error);
  assert.deepStrictEqual(d.restart(room, room.hostId), {});
  assert.strictEqual(room.gameNo, no + 1);
  assert.strictEqual(room.phase, 'setup');
  assert.strictEqual(totalTiles(room), 26);
  assert.deepStrictEqual(d.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.row.length === 0 && !p.out));
  assert.ok(d.backToLobby(room, room.hostId).error);
  assert.ok(d.restart(room, room.hostId).error);
});

// 무작위로 끝까지: 틀린 추측과 맞힌 추측을 섞고, 가끔 방장 대신 진행과 저장/복원도 끼워 넣는다
function randomPlay(n, jokers) {
  const rnd = (k) => Math.floor(Math.random() * k);
  let room = d.createRoom('RP');
  for (let i = 0; i < n; i++) d.addPlayer(room, `p${i}`);
  room.settings.jokers = jokers;
  d.start(room, room.hostId);
  const total = jokers ? 26 : 24;
  if (room.phase === 'setup') {
    room.players.forEach((p) => {
      while (p.pendingJokers.length) assert.deepStrictEqual(d.setupJoker(room, p.id, rnd(p.row.length + 1)), {});
      if (Math.random() < 0.8) d.ready(room, p.id);
    });
    if (room.phase === 'setup') d.force(room, room.hostId);
  }
  let steps = 0;
  while (room.phase === 'play') {
    steps += 1;
    assert.ok(steps < 2000, '게임이 끝나지 않아요');
    if (steps % 37 === 0) room = deserializeRoom(serializeRoom(room));
    const me = cur(room);
    assert.ok(!me.out);
    // 불변식
    assert.strictEqual(totalTiles(room), total);
    room.players.forEach((p) => {
      assert.ok(sortedOk(p.row), `정렬이 깨졌어요: ${p.row.map((t) => t.n)}`);
      assert.strictEqual(p.out, p.row.every((t) => t.open));
    });
    const ids = new Set();
    room.players.forEach((p) => p.row.forEach((t) => ids.add(t.id)));
    room.pool.forEach((t) => ids.add(t.id));
    if (room.drawn) ids.add(room.drawn.id);
    assert.strictEqual(ids.size, total);
    // 비밀이 새지 않는지: 다른 사람 화면에는 남의 숨은 숫자도, 뽑은 타일도 없다
    room.players.forEach((viewer) => {
      const v = d.viewFor(room, viewer.id);
      const json = JSON.stringify(v);
      if (room.drawn && viewer.id !== me.id) {
        assert.strictEqual(v.drawn, null);
        assert.ok(!json.includes(room.drawn.id));
      }
      room.pool.forEach((t) => assert.ok(!json.includes(t.id)));
      v.players.forEach((vp) => {
        const real = room.players.find((p) => p.id === vp.id);
        vp.row.forEach((t, i) => {
          assert.strictEqual(t.id, real.row[i].id);
          if (vp.id !== viewer.id && !real.row[i].open) assert.strictEqual(t.n, null);
          else assert.strictEqual(t.n, real.row[i].n);
        });
      });
      assert.strictEqual(v.mode, viewer.id === me.id ? room.step : viewer.out ? 'out' : 'wait');
    });

    if (Math.random() < 0.03) { d.force(room, room.hostId); continue; }
    if (room.step === 'guess') {
      if (room.guesses > 0 && Math.random() < 0.4) { assert.deepStrictEqual(d.stop(room, me.id), {}); continue; }
      const targets = room.players.filter((p) => p !== me && !p.out).flatMap((p) => p.row.filter((t) => !t.open).map((t) => [p, t]));
      const [tp, tile] = targets[rnd(targets.length)];
      const value = Math.random() < 0.35 ? tile.n : rnd(12);
      assert.deepStrictEqual(d.guess(room, me.id, tp.id, tile.id, value), {});
    } else if (room.step === 'place') {
      const [lo, hi] = d.slotRange(me.row, room.drawn);
      assert.ok(d.place(room, me.id, hi + 1).error);
      assert.deepStrictEqual(d.place(room, me.id, lo + rnd(hi - lo + 1)), {});
    } else if (room.step === 'reveal') {
      const hid = me.row.filter((t) => !t.open);
      assert.ok(hid.length >= 2);
      assert.deepStrictEqual(d.reveal(room, me.id, hid[rnd(hid.length)].id), {});
    } else {
      assert.fail(`알 수 없는 단계 ${room.step}`);
    }
  }
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winnerIds.length, 1);
  const win = room.players.find((p) => p.id === room.winnerIds[0]);
  assert.ok(!win.out && win.row.some((t) => !t.open));
  assert.ok(room.players.filter((p) => p !== win).every((p) => p.out));
  assert.strictEqual(totalTiles(room), total);
  assert.strictEqual(room.drawn, null);
  return steps;
}

test('무작위로 끝까지: 2~4명, 조커 있음/없음, 항상 끝나고 타일 수·정렬·비밀이 지켜진다', () => {
  for (const n of [2, 3, 4]) {
    for (let g = 0; g < 60; g++) randomPlay(n, g % 3 !== 0);
  }
});

test('저장했다 되살려도 이어서 할 수 있다', () => {
  let room = mk(2);
  const A = cur(room);
  room = deserializeRoom(serializeRoom(room));
  const B = room.players.find((p) => p.id !== A.id);
  const tile = B.row[0];
  assert.deepStrictEqual(d.guess(room, A.id, B.id, tile.id, tile.n), {});
  assert.deepStrictEqual(d.stop(room, A.id), {});
  assert.deepStrictEqual(d.place(room, A.id, null), {});
  assert.strictEqual(cur(room).id, B.id);
});
