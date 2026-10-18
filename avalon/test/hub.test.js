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

// ---- 방 목록 / 공개방 / 비밀번호 방 ----

function lobbyOf(hub, code) { return hub.rooms.get(code); }

test('방 목록: 공개방/비밀번호 방, 인원/최대 인원, 방장 이름, 진행 여부만 보이고 비밀번호는 안 보인다', () => {
  const hub = createHub();
  const a = conn(); hub.onOpen(a);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '민수', game: 'avalon' }));
  const b = conn(); hub.onOpen(b);
  hub.onMessage(b, JSON.stringify({ t: 'create', name: '지영', game: 'uno', locked: true, password: 'abc1' }));
  const c = conn(); hub.onOpen(c);
  hub.onMessage(c, JSON.stringify({ t: 'list' }));
  const list = c.last('rooms').rooms;
  assert.strictEqual(list.length, 2);
  const pub = list.find((r) => r.kind === 'avalon');
  const sec = list.find((r) => r.kind === 'uno');
  assert.deepStrictEqual(Object.keys(pub).sort(), ['code', 'host', 'kind', 'locked', 'max', 'players', 'playing']);
  assert.deepStrictEqual({ host: pub.host, players: pub.players, max: pub.max, locked: pub.locked, playing: pub.playing }, { host: '민수', players: 1, max: 10, locked: false, playing: false });
  assert.deepStrictEqual({ host: sec.host, locked: sec.locked }, { host: '지영', locked: true });
  const text = JSON.stringify(c.out);
  assert.ok(!text.includes('abc1') && !text.includes('hash') && !text.includes('salt') && !text.includes('token'), '목록에 비밀번호/토큰이 새면 안 돼요');
});

test('비밀번호 방: 비밀번호 없이/틀리면 못 들어오고(비밀번호 칸을 열라는 신호), 맞으면 들어온다', () => {
  const hub = createHub();
  const a = conn(); hub.onOpen(a);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'uno', locked: true, password: ' 1234 ' }));
  const code = a.last('joined').code;
  const b = conn(); hub.onOpen(b);
  hub.onMessage(b, JSON.stringify({ t: 'join', name: '친구', code }));
  assert.deepStrictEqual(b.last('error'), { t: 'error', msg: '비밀번호가 걸린 방이에요. 비밀번호를 입력하세요.', need: 'password', code });
  hub.onMessage(b, JSON.stringify({ t: 'join', name: '친구', code, password: '9999' }));
  assert.strictEqual(b.last('error').msg, '비밀번호가 맞지 않아요.');
  assert.strictEqual(lobbyOf(hub, code).players.length, 1);
  hub.onMessage(b, JSON.stringify({ t: 'join', name: '친구', code, password: '1234' }));
  assert.ok(b.last('joined'));
  assert.strictEqual(lobbyOf(hub, code).players.length, 2);
  // 화면 상태에는 잠금 표시만 있고 비밀번호는 없다
  const st = b.last('state').state;
  assert.strictEqual(st.locked, true);
  assert.ok(!JSON.stringify(b.out).includes('1234'));
  // 저장된 방에도 비밀번호 원문은 없다
  assert.ok(!serializeRoom(lobbyOf(hub, code)).includes('1234'));
});

test('비밀번호 방: 비밀번호 방을 고르고 비밀번호를 비우면 만들지 않는다. 공개방은 비밀번호 없이 들어온다', () => {
  const hub = createHub();
  const a = conn(); hub.onOpen(a);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'uno', locked: true, password: '   ' }));
  assert.strictEqual(a.last('error').msg, '비밀번호를 입력하세요.');
  assert.strictEqual(hub.rooms.size, 0);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '방장', game: 'uno' }));
  const code = a.last('joined').code;
  assert.strictEqual(a.last('state').state.locked, false);
  const b = conn(); hub.onOpen(b);
  hub.onMessage(b, JSON.stringify({ t: 'join', name: '친구', code }));
  assert.ok(b.last('joined'));
});

test('비밀번호 방: 게임 중 이름으로 다시 들어올 때도 비밀번호가 필요하고, 토큰으로 이어하기는 그대로 된다', () => {
  const hub = createHub();
  const cs = [];
  const first = conn(); hub.onOpen(first); cs.push(first);
  hub.onMessage(first, JSON.stringify({ t: 'create', name: 'p0', game: 'uno', locked: true, password: 'pw' }));
  const code = first.last('joined').code;
  for (let i = 1; i < 3; i++) {
    const c = conn(); hub.onOpen(c); cs.push(c);
    hub.onMessage(c, JSON.stringify({ t: 'join', name: `p${i}`, code, password: 'pw' }));
  }
  hub.onMessage(first, JSON.stringify({ t: 'start' }));
  assert.notStrictEqual(lobbyOf(hub, code).phase, 'lobby');
  const lost = cs[2];
  const token = lost.last('joined').token;
  hub.onClose(lost);
  const x = conn(); hub.onOpen(x);
  hub.onMessage(x, JSON.stringify({ t: 'join', name: 'p2', code }));
  assert.strictEqual(x.last('error').need, 'password');
  hub.onMessage(x, JSON.stringify({ t: 'join', name: 'p2', code, password: 'pw' }));
  assert.ok(x.last('joined'));
  const y = conn(); hub.onOpen(y);
  hub.onMessage(y, JSON.stringify({ t: 'resume', code, token }));
  assert.ok(y.last('joined'), '토큰이 있으면 비밀번호 없이 이어서 한다');
});

test('방 목록: 모두 접속이 끊긴 방은 보이지 않고, 진행 중인 방은 playing 으로 보인다. 저장/복원 뒤에도 잠금 유지', () => {
  const hub = createHub();
  const a = conn(); hub.onOpen(a);
  hub.onMessage(a, JSON.stringify({ t: 'create', name: '혼자', game: 'avalon' }));
  hub.onClose(a);
  const v = conn(); hub.onOpen(v);
  hub.onMessage(v, JSON.stringify({ t: 'list' }));
  assert.strictEqual(v.last('rooms').rooms.length, 0);

  const p = []; for (let i = 0; i < 3; i++) { const c = conn(); hub.onOpen(c); p.push(c); }
  hub.onMessage(p[0], JSON.stringify({ t: 'create', name: 'p0', game: 'uno', locked: true, password: 'zz' }));
  const code = p[0].last('joined').code;
  hub.onMessage(p[1], JSON.stringify({ t: 'join', name: 'p1', code, password: 'zz' }));
  hub.onMessage(p[0], JSON.stringify({ t: 'start' }));
  hub.onMessage(v, JSON.stringify({ t: 'list' }));
  const row = v.last('rooms').rooms.find((r) => r.code === code);
  assert.deepStrictEqual({ playing: row.playing, players: row.players, locked: row.locked }, { playing: true, players: 2, locked: true });

  // 저장했다가 다른 hub에 되살려도 비밀번호가 유지된다
  const hub2 = createHub();
  hub2.restore(deserializeRoom(serializeRoom(hub.rooms.get(code))));
  const z = conn(); hub2.onOpen(z);
  hub2.onMessage(z, JSON.stringify({ t: 'join', name: 'p1', code }));
  assert.strictEqual(z.last('error').need, 'password');
  hub2.onMessage(z, JSON.stringify({ t: 'join', name: 'p1', code, password: 'zz' }));
  assert.ok(z.last('joined'));
});
