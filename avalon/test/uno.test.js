'use strict';
const test = require('node:test');
const assert = require('node:assert');
const u = require('../uno');

let nextId = 1000;
const c = (color, kind) => ({ id: nextId++, color, kind });

function lobby(n) {
  const room = u.createRoom('UNOT');
  for (let i = 0; i < n; i++) u.addPlayer(room, `p${i}`);
  return room;
}
function started(n = 3) {
  const room = lobby(n);
  assert.deepStrictEqual(u.start(room, room.hostId), {});
  return room;
}
// 규칙을 정확히 시험하려고 판을 직접 세팅한다. draw의 맨 끝 카드가 다음에 뽑힌다.
function setup(room, { top, color = top.color, hands = [], turn = 0, dir = 1, draw }) {
  room.discard = [top];
  room.color = color;
  room.dir = dir;
  room.turn = turn;
  room.drewId = null;
  room.unoWindow = null;
  room.phase = 'play';
  room.players.forEach((p, i) => { p.hand = hands[i] || [c('r', '1'), c('r', '2'), c('r', '3')]; p.uno = false; });
  room.draw = draw || [c('b', '9'), c('b', '8'), c('b', '7'), c('b', '6'), c('b', '5'), c('b', '4')];
}
const pid = (room, i) => room.players[i].id;

test('덱은 108장: 숫자 76 + 스킵/리버스/+2 각 8 + 와일드 4 + +4 4', () => {
  assert.strictEqual(u.DECK.length, 108);
  assert.strictEqual(new Set(u.DECK.map((x) => x.id)).size, 108);
  const count = (f) => u.DECK.filter(f).length;
  assert.strictEqual(count((x) => /^\d$/.test(x.kind)), 76);
  for (const k of ['skip', 'rev', 'd2']) assert.strictEqual(count((x) => x.kind === k), 8);
  assert.strictEqual(count((x) => x.kind === 'wild'), 4);
  assert.strictEqual(count((x) => x.kind === 'd4'), 4);
  for (const col of ['r', 'y', 'g', 'b']) assert.strictEqual(count((x) => x.color === col), 25);
  for (const col of ['r', 'y', 'g', 'b']) assert.strictEqual(count((x) => x.color === col && x.kind === '0'), 1);
});

test('2~10명, 방장만, 전원 접속해야 시작한다', () => {
  const one = lobby(1);
  assert.ok(u.start(one, one.hostId).error);
  const two = lobby(2);
  assert.ok(u.start(two, two.players[1].id).error);
  two.players[1].connected = false;
  assert.ok(u.start(two, two.hostId).error);
  const full = lobby(10);
  assert.ok(u.addPlayer(full, 'p10').error); // 공식 최대 10명
  assert.ok(u.addPlayer(full, 'p0').error);
  assert.deepStrictEqual(u.start(full, full.hostId), {}); // 10명도 시작된다
  assert.ok(full.players.every((p) => p.hand.length === 7));
  assert.strictEqual(full.draw.length, 108 - 70 - 1);
});

test('시작: 7장씩, 시작 카드는 숫자, 더미 장수가 맞다', () => {
  for (let i = 0; i < 30; i++) {
    const room = started(4);
    assert.ok(room.players.every((p) => p.hand.length === 7));
    assert.match(room.discard[0].kind, /^\d$/);
    assert.strictEqual(room.color, room.discard[0].color);
    assert.strictEqual(room.draw.length, 108 - 28 - 1);
    const all = [...room.draw, ...room.discard, ...room.players.flatMap((p) => p.hand)];
    assert.strictEqual(new Set(all.map((x) => x.id)).size, 108);
  }
});

test('같은 색/같은 숫자는 낼 수 있고 아니면 거부, 남의 차례도 거부', () => {
  const room = started(3);
  const sameColor = c('r', '9'), sameNum = c('y', '5'), neither = c('g', '9');
  setup(room, { top: c('r', '5'), hands: [[sameColor, sameNum, neither, c('b', '1')]] });
  assert.ok(u.play(room, pid(room, 1), 1, undefined).error); // 남의 차례
  assert.ok(u.play(room, pid(room, 0), neither.id).error);
  assert.ok(u.play(room, pid(room, 0), 99999).error); // 없는 카드
  assert.deepStrictEqual(u.play(room, pid(room, 0), sameNum.id), {});
  assert.strictEqual(room.color, 'y'); // 같은 숫자를 내면 색이 따라간다
  assert.strictEqual(room.turn, 1);
});

test('와일드는 색을 골라야 하고, 고른 색으로 이어진다', () => {
  const room = started(3);
  const w = c('w', 'wild'), y1 = c('y', '1');
  setup(room, { top: c('r', '5'), hands: [[w, y1, c('b', '1')], [c('y', '2'), c('r', '2')]] });
  assert.ok(u.play(room, pid(room, 0), w.id).error);
  assert.ok(u.play(room, pid(room, 0), w.id, 'x').error);
  assert.deepStrictEqual(u.play(room, pid(room, 0), w.id, 'y'), {});
  assert.strictEqual(room.color, 'y');
  const yellow2 = room.players[1].hand[0];
  assert.deepStrictEqual(u.play(room, pid(room, 1), yellow2.id), {});
});

test('와일드 +4는 지금 색 카드가 없을 때만', () => {
  const room = started(3);
  const d4 = c('w', 'd4'), red = c('r', '2'), blue = c('b', '3');
  setup(room, { top: c('r', '5'), hands: [[d4, red, c('g', '1')]] });
  assert.match(u.play(room, pid(room, 0), d4.id, 'b').error, /색 카드/);
  room.players[0].hand = [d4, blue, c('g', '1')];
  assert.deepStrictEqual(u.play(room, pid(room, 0), d4.id, 'b'), {});
  assert.strictEqual(room.players[1].hand.length, 3 + 4);
  assert.strictEqual(room.turn, 2); // 맞은 사람은 차례를 잃는다
  assert.strictEqual(room.color, 'b');
});

test('스킵: 다음 사람을 건너뛴다', () => {
  const room = started(4);
  const skip = c('r', 'skip');
  setup(room, { top: c('r', '5'), hands: [[skip, c('r', '1'), c('r', '2')]] });
  u.play(room, pid(room, 0), skip.id);
  assert.strictEqual(room.turn, 2);
});

test('리버스: 방향이 바뀐다 (3명 이상). 2명이면 스킵처럼 내가 다시', () => {
  const three = started(3);
  const rev = c('r', 'rev');
  setup(three, { top: c('r', '5'), turn: 1, hands: [[], [rev, c('r', '1'), c('r', '2')]] });
  u.play(three, pid(three, 1), rev.id);
  assert.strictEqual(three.dir, -1);
  assert.strictEqual(three.turn, 0);
  const rev2 = c('r', 'rev');
  setup(three, { top: c('r', '5'), turn: 0, dir: -1, hands: [[rev2, c('r', '1'), c('r', '2')]] });
  u.play(three, pid(three, 0), rev2.id);
  assert.strictEqual(three.dir, 1);
  assert.strictEqual(three.turn, 1);

  const two = started(2);
  const rev3 = c('r', 'rev');
  setup(two, { top: c('r', '5'), hands: [[rev3, c('r', '1'), c('r', '2')]] });
  u.play(two, pid(two, 0), rev3.id);
  assert.strictEqual(two.turn, 0);
});

test('+2: 다음 사람이 2장 뽑고 차례를 잃는다 (역방향에서도)', () => {
  const room = started(4);
  const d2 = c('r', 'd2');
  setup(room, { top: c('r', '5'), turn: 0, dir: -1, hands: [[d2, c('r', '1'), c('r', '2')]] });
  u.play(room, pid(room, 0), d2.id);
  assert.strictEqual(room.players[3].hand.length, 5);
  assert.strictEqual(room.turn, 2);
});

test('뽑기: 낼 수 있는 카드면 그 카드만 낼 수 있고, 넘기면 다음 사람', () => {
  const room = started(3);
  const playable = c('r', '7');
  setup(room, { top: c('r', '5'), hands: [[c('g', '1'), c('g', '2'), c('g', '3')]], draw: [c('b', '9'), playable] });
  assert.ok(u.pass(room, pid(room, 0)).error); // 뽑기 전에는 못 넘긴다
  assert.deepStrictEqual(u.draw(room, pid(room, 0)), {});
  assert.strictEqual(room.drewId, playable.id);
  assert.strictEqual(room.turn, 0); // 아직 내 차례
  assert.ok(u.draw(room, pid(room, 0)).error); // 두 번 못 뽑는다
  assert.ok(u.play(room, pid(room, 0), room.players[0].hand[0].id).error); // 다른 카드는 못 낸다
  assert.deepStrictEqual(u.pass(room, pid(room, 0)), {});
  assert.strictEqual(room.turn, 1);
  assert.strictEqual(room.players[0].hand.length, 4);
});

test('뽑은 카드를 바로 낼 수 있다', () => {
  const room = started(3);
  const playable = c('r', '7');
  setup(room, { top: c('r', '5'), hands: [[c('g', '1'), c('g', '2'), c('g', '3')]], draw: [c('b', '9'), playable] });
  u.draw(room, pid(room, 0));
  assert.deepStrictEqual(u.play(room, pid(room, 0), playable.id), {});
  assert.strictEqual(room.discard[room.discard.length - 1].id, playable.id);
  assert.strictEqual(room.turn, 1);
  assert.strictEqual(room.drewId, null);
});

test('뽑은 카드를 낼 수 없으면 자동으로 넘어간다', () => {
  const room = started(3);
  setup(room, { top: c('r', '5'), hands: [[c('g', '1'), c('g', '2'), c('g', '3')]], draw: [c('b', '9'), c('y', '9')] });
  u.draw(room, pid(room, 0));
  assert.strictEqual(room.turn, 1);
  assert.strictEqual(room.players[0].hand.length, 4);
  assert.strictEqual(room.drewId, null);
});

test('더미가 비면 버린 더미를 섞어 다시 쓴다 (맨 위 카드는 남긴다)', () => {
  const room = started(3);
  const topCard = c('r', '5');
  setup(room, { top: topCard, hands: [[c('g', '1'), c('g', '2'), c('g', '3')]], draw: [] });
  room.discard = [c('y', '1'), c('y', '2'), c('y', '3'), topCard];
  u.draw(room, pid(room, 0));
  assert.strictEqual(room.players[0].hand.length, 4);
  assert.deepStrictEqual(room.discard.map((x) => x.id), [topCard.id]);
  assert.strictEqual(room.draw.length, 2);
});

test('우노: 안 외치면 고발당해 2장, 외쳤으면 고발 불가', () => {
  const room = started(3);
  const a = c('r', '9');
  setup(room, { top: c('r', '5'), hands: [[a, c('r', '1')]] });
  u.play(room, pid(room, 0), a.id);
  assert.deepStrictEqual(room.unoWindow, { id: pid(room, 0), called: false });
  assert.ok(u.catchUno(room, pid(room, 0)).error); // 자기 자신
  assert.deepStrictEqual(u.catchUno(room, pid(room, 2)), {});
  assert.strictEqual(room.players[0].hand.length, 3);
  assert.strictEqual(room.unoWindow, null);
  assert.ok(u.catchUno(room, pid(room, 2)).error); // 중복 고발 불가

  setup(room, { top: c('r', '5'), hands: [[c('r', '9'), c('r', '1')]] });
  const b = room.players[0].hand[0];
  u.play(room, pid(room, 0), b.id);
  assert.deepStrictEqual(u.callUno(room, pid(room, 0)), {});
  assert.ok(u.catchUno(room, pid(room, 1)).error);
  assert.strictEqual(room.players[0].hand.length, 1);
});

test('우노를 미리(2장일 때) 외쳐 두면 1장이 돼도 고발당하지 않는다', () => {
  const room = started(3);
  const a = c('r', '9');
  setup(room, { top: c('r', '5'), hands: [[a, c('r', '1')]] });
  assert.deepStrictEqual(u.callUno(room, pid(room, 0)), {});
  u.play(room, pid(room, 0), a.id);
  assert.strictEqual(room.unoWindow.called, true);
  assert.ok(u.catchUno(room, pid(room, 1)).error);
  assert.ok(u.callUno(room, pid(room, 1)).error); // 3장 이상이면 외칠 수 없다
});

test('다음 사람이 움직이면 고발 기회는 사라진다', () => {
  const room = started(3);
  const a = c('r', '9'), next = c('r', '2');
  setup(room, { top: c('r', '5'), hands: [[a, c('r', '1')], [next, c('r', '3'), c('r', '4')]] });
  u.play(room, pid(room, 0), a.id);
  u.play(room, pid(room, 1), next.id);
  assert.strictEqual(room.unoWindow, null);
  assert.ok(u.catchUno(room, pid(room, 2)).error);
});

test('마지막 카드를 내면 승리, 승수는 재시작해도 유지되고 대기실로 가면 초기화', () => {
  const room = started(3);
  const last = c('w', 'd4');
  setup(room, { top: c('r', '5'), hands: [[last], [c('r', '1'), c('r', '2')]] }); // 손에 빨강이 없으니 +4 가능
  assert.deepStrictEqual(u.play(room, pid(room, 0), last.id, 'g'), {});
  assert.strictEqual(room.phase, 'over');
  assert.strictEqual(room.winnerId, pid(room, 0));
  assert.strictEqual(room.players[0].wins, 1);
  assert.ok(u.play(room, pid(room, 1), 1, undefined).error);
  assert.ok(u.restart(room, pid(room, 1)).error);
  assert.deepStrictEqual(u.restart(room, room.hostId), {});
  assert.strictEqual(room.phase, 'play');
  assert.strictEqual(room.players[0].wins, 1);
  assert.ok(room.players.every((p) => p.hand.length === 7));
  assert.deepStrictEqual(u.backToLobby(room, room.hostId), {});
  assert.strictEqual(room.phase, 'lobby');
  assert.ok(room.players.every((p) => p.wins === 0 && p.hand.length === 0));
});

test('방장은 자리를 비운 사람의 차례를 넘길 수 있다', () => {
  const room = started(3);
  setup(room, { top: c('r', '5'), turn: 1 });
  assert.ok(u.skipTurn(room, pid(room, 2)).error);
  assert.deepStrictEqual(u.skipTurn(room, room.hostId), {});
  assert.strictEqual(room.turn, 2);
});

test('각자에게는 자기 손패만 보인다', () => {
  const room = started(3);
  const view = u.viewFor(room, pid(room, 0));
  assert.strictEqual(view.hand.length, 7);
  const mine = new Set(view.hand.map((x) => x.id));
  const theirs = room.players[1].hand.map((x) => x.id);
  assert.ok(theirs.every((id) => !mine.has(id)));
  const json = JSON.stringify(view);
  assert.ok(view.players.every((p) => p.count === 7 && !('hand' in p)));
  assert.ok(!json.includes('"token"'));
  // 내 차례가 아니면 어떤 카드도 playable이 아니다
  const other = u.viewFor(room, room.players.find((p) => p.id !== room.players[room.turn].id).id);
  assert.ok(other.hand.every((x) => !x.playable));
});

test('실제 규칙대로 끝까지 무작위로 두면 반드시 끝나고 카드 총수가 보존된다', () => {
  for (let g = 0; g < 40; g++) {
    const room = started(2 + (g % 5));
    for (let turns = 0; turns < 3000 && room.phase === 'play'; turns++) {
      const me = room.players[room.turn];
      const view = u.viewFor(room, me.id);
      const playable = view.hand.filter((x) => x.playable);
      if (view.drewId !== null) {
        const card = view.hand.find((x) => x.id === view.drewId);
        if (card.playable) assert.deepStrictEqual(u.play(room, me.id, card.id, 'r'), {});
        else assert.deepStrictEqual(u.pass(room, me.id), {});
      } else if (playable.length && turns % 7 !== 0) {
        assert.deepStrictEqual(u.play(room, me.id, playable[0].id, 'g'), {});
      } else {
        assert.deepStrictEqual(u.draw(room, me.id), {});
      }
      const total = room.draw.length + room.discard.length + room.players.reduce((n, p) => n + p.hand.length, 0);
      assert.strictEqual(total, 108);
    }
    assert.strictEqual(room.phase, 'over');
    assert.ok(room.players.some((p) => p.hand.length === 0));
  }
});
