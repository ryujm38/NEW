'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createHub, serializeRoom, deserializeRoom, ENGINES } = require('../hub');

// 가짜 연결: 받은 메시지를 모아 둔다
function conn() {
  const c = { out: [], open: true, closed: null };
  c.send = (text) => c.out.push(JSON.parse(text));
  c.close = (code) => { c.open = false; c.closed = code; };
  c.isOpen = () => c.open;
  c.last = (t) => [...c.out].reverse().find((m) => m.t === t);
  return c;
}

// 아발론의 밤 정보(멀린 후보 등)는 볼 때마다 순서를 섞어서 보내므로 비교할 때는 정렬한다
const norm = (v) => {
  const c = JSON.parse(JSON.stringify(v));
  if (c.roleInfo && c.roleInfo.night && Array.isArray(c.roleInfo.night.names)) c.roleInfo.night.names.sort();
  return c;
};

const PLAYERS = { avalon: 5, uno: 3, bang: 4, mafia: 5, splendor: 3, marble: 3, bohnanza: 3, vegas: 3, duel: 2 };

test('저장/복원: 모든 게임의 진행 중인 방이 그대로 되살아난다 (Set 포함)', () => {
  for (const [kind, n] of Object.entries(PLAYERS)) {
    const engine = ENGINES[kind];
    const room = engine.createRoom('TEST');
    for (let i = 0; i < n; i++) engine.addPlayer(room, `p${i}`);
    assert.deepStrictEqual(engine.start(room, room.hostId), {}, kind);
    for (let step = 0; step < 12; step++) {
      const text = serializeRoom(room);
      const back = deserializeRoom(text);
      assert.strictEqual(serializeRoom(back), text, `${kind} ${step}: 다시 저장해도 같아야 해요`);
      for (const p of room.players) {
        assert.deepStrictEqual(norm(engine.viewFor(back, p.id)), norm(engine.viewFor(room, p.id)), `${kind} ${step}: 화면이 같아야 해요`);
      }
      // 되살린 방으로도 진행이 된다 (복사본에서 방장 대신 진행해 보기만 하고, 원본은 따로 진행)
      if (engine.actions.force) {
        engine.actions.force(back, back.hostId, {});
        engine.actions.force(room, room.hostId, {});
      }
    }
  }
});

test('Set은 저장 후에도 Set으로 돌아온다', () => {
  const room = { code: 'A', s: new Set(['x', 'y']), m: new Map([['k', 1]]), nested: { a: new Set([1]) }, arr: [new Set([2])] };
  const back = deserializeRoom(serializeRoom(room));
  assert.ok(back.s instanceof Set && back.s.has('y'));
  assert.ok(back.m instanceof Map && back.m.get('k') === 1);
  assert.ok(back.nested.a instanceof Set);
  assert.ok(back.arr[0] instanceof Set);
});

test('hub: 방 만들기/들어오기/바뀔 때마다 onChange, ping에 pong, 끊기면 접속 끊김 표시', () => {
  const changed = [];
  const removed = [];
  const hub = createHub({ onChange: (r) => changed.push(r.code), onRemove: (c) => removed.push(c) });
  const a = conn();
  const b = conn();
  hub.onOpen(a);
  hub.onOpen(b);
  hub.onMessage(a, JSON.stringify({ t: 'ping' }));
  assert.ok(a.last('pong'));
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'vegas' }));
  const code = a.last('joined').code;
  assert.deepStrictEqual(changed, [code]);
  hub.onMessage(b, JSON.stringify({ t: 'join', code, name: '친구' }));
  assert.strictEqual(changed.length, 2);
  assert.strictEqual(b.last('state').state.players.length, 2);
  hub.onClose(b);
  assert.strictEqual(a.last('state').state.players.find((p) => p.name === '친구').connected, false);
  // 대기실에서 모두 나가면 방이 지워진다
  hub.onMessage(a, JSON.stringify({ t: 'leave' }));
  const b2 = conn();
  hub.onOpen(b2);
  hub.onMessage(b2, JSON.stringify({ t: 'resume', code, token: 'nope' }));
  assert.ok(b2.last('gone'));
  // 잘못된 메시지는 무시
  hub.onMessage(a, 'not json');
  hub.onMessage(a, JSON.stringify({ nope: 1 }));
});

test('hub.restore: 저장해 둔 방을 올리면 모두 끊긴 상태이고, 토큰으로 다시 들어오면 이어서 할 수 있다', () => {
  let saved = null;
  const hub1 = createHub({ onChange: (r) => { saved = serializeRoom(r); } });
  const a = conn();
  hub1.onOpen(a);
  hub1.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'duel' }));
  const { code, token } = a.last('joined');
  const b = conn();
  hub1.onOpen(b);
  hub1.onMessage(b, JSON.stringify({ t: 'join', code, name: '친구' }));
  hub1.onMessage(a, JSON.stringify({ t: 'start' }));
  assert.strictEqual(a.last('state').state.phase, 'draft');

  // 서버(객체)가 내려갔다가 다시 올라온 상황
  const hub2 = createHub();
  hub2.restore(deserializeRoom(saved));
  const room = hub2.rooms.get(code);
  assert.ok(room.players.every((p) => !p.connected));
  const a2 = conn();
  hub2.onOpen(a2);
  hub2.onMessage(a2, JSON.stringify({ t: 'resume', code, token }));
  const st = a2.last('state').state;
  assert.strictEqual(st.phase, 'draft');
  assert.strictEqual(st.players.find((p) => p.id === st.me).connected, true);
  // 모르는 종류의 방은 무시
  hub2.restore({ code: 'ZZZZ', kind: 'nope', players: [] });
  assert.ok(!hub2.rooms.has('ZZZZ'));
});

test('hub.sweep: 6시간 넘게 아무 일 없던 방은 지우고 onRemove를 부른다', () => {
  let t = 1000;
  const removed = [];
  const hub = createHub({ now: () => t, onRemove: (c) => removed.push(c) });
  const a = conn();
  hub.onOpen(a);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'uno' }));
  const { code } = a.last('joined');
  t += 5 * 60 * 60 * 1000;
  hub.sweep();
  assert.ok(hub.rooms.has(code));
  t += 2 * 60 * 60 * 1000;
  hub.sweep();
  assert.ok(!hub.rooms.has(code));
  assert.deepStrictEqual(removed, [code]);
});
