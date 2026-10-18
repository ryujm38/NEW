'use strict';
// 방/접속 관리 (전송 방식과 무관). Node 서버(server.js)와 Cloudflare Durable Object(cloudflare/worker)가 같이 쓴다.
//
// conn(연결) 객체가 갖춰야 할 것: send(text), close(code, reason), isOpen(), 그리고 hub가 쓰는 ctx / lastSeen 필드.
// 방이 바뀔 때마다 onChange(room) / onRemove(code)를 불러 준다(Cloudflare 쪽은 이것으로 방을 저장소에 적는다).

const crypto = require('crypto');
const common = require('./common');

const ENGINES = {
  avalon: require('./game'), uno: require('./uno'), bang: require('./bang'), mafia: require('./mafia'), splendor: require('./splendor'),
  marble: require('./marble'), bohnanza: require('./bohnanza'), vegas: require('./vegas'), duel: require('./duel'),
  clue: require('./clue'), davinci: require('./davinci'), crew: require('./crew'),
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외: 1/0과 헷갈리지 않게
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const PW_MAX = 20;
const LIST_MAX = 50;

// 방 비밀번호: 그대로 저장하지 않고 소금(salt)을 섞은 해시만 둔다. 화면(viewFor)에는 나가지 않는다.
const cleanPassword = (raw) => String(raw ?? '').trim().slice(0, PW_MAX);
const hashPassword = (salt, pw) => crypto.createHash('sha256').update(`${salt}:${pw}`).digest('hex');
function makeLock(pw) {
  const salt = crypto.randomBytes(8).toString('hex');
  return { salt, hash: hashPassword(salt, pw) };
}
function passwordOk(room, raw) {
  if (!room.lock) return true;
  const a = Buffer.from(hashPassword(room.lock.salt, cleanPassword(raw)), 'hex');
  const b = Buffer.from(room.lock.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createHub(opts = {}) {
  const now = opts.now || Date.now;
  const onChange = opts.onChange || (() => {});
  const onRemove = opts.onRemove || (() => {});
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // room code -> Map(playerId -> conn)
  const engineOf = (room) => ENGINES[room.kind];

  function newCode() {
    for (;;) {
      let code = '';
      for (let i = 0; i < 4; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
      if (!rooms.has(code)) return code;
    }
  }

  function socketsOf(room) {
    if (!sockets.has(room.code)) sockets.set(room.code, new Map());
    return sockets.get(room.code);
  }

  function send(conn, msg) {
    if (conn.isOpen()) conn.send(JSON.stringify(msg));
  }

  function broadcast(room) {
    room.lastActive = now();
    for (const [pid, conn] of socketsOf(room)) {
      const state = engineOf(room).viewFor(room, pid);
      state.locked = !!room.lock; // 대기실에 공개방/비밀번호 방 표시용
      send(conn, { t: 'state', state });
    }
    onChange(room);
  }

  function removeRoom(code) {
    rooms.delete(code);
    sockets.delete(code);
    onRemove(code);
  }

  function attach(conn, room, player) {
    const map = socketsOf(room);
    const old = map.get(player.id);
    if (old && old !== conn) {
      old.ctx = null; // 옛 연결의 close 이벤트가 상태를 망가뜨리지 않게
      old.close(4000, 'replaced');
    }
    map.set(player.id, conn);
    player.connected = true;
    conn.ctx = { code: room.code, id: player.id };
    send(conn, { t: 'joined', code: room.code, id: player.id, token: player.token });
  }

  function fail(conn, msg) {
    send(conn, { t: 'error', msg });
  }

  // 비밀번호가 필요하거나 틀렸을 때: 화면이 비밀번호 칸을 열 수 있게 need 와 code 를 같이 보낸다
  function needPassword(conn, room, given) {
    const msg = cleanPassword(given) ? '비밀번호가 맞지 않아요.' : '비밀번호가 걸린 방이에요. 비밀번호를 입력하세요.';
    send(conn, { t: 'error', msg, need: 'password', code: room.code });
  }

  // 방 목록: 접속해 있는 사람이 한 명이라도 있는 방만, 최근에 움직인 순서로. 비밀번호/토큰 같은 건 넣지 않는다.
  function roomList() {
    const out = [];
    for (const room of rooms.values()) {
      const connected = room.players.filter((p) => p.connected).length;
      if (connected === 0) continue;
      const host = room.players.find((p) => p.id === room.hostId) || room.players[0];
      out.push({
        code: room.code,
        kind: room.kind,
        players: room.players.length,
        max: engineOf(room).MAX_PLAYERS || null,
        locked: !!room.lock,
        host: host ? host.name : '',
        playing: room.phase !== 'lobby',
        lastActive: room.lastActive || 0,
      });
    }
    out.sort((a, b) => b.lastActive - a.lastActive);
    return out.slice(0, LIST_MAX).map(({ lastActive, ...r }) => r);
  }

  function handle(conn, msg) {
    const ctx = conn.ctx;

    if (msg.t === 'ping') return send(conn, { t: 'pong' });

    if (msg.t === 'list') return send(conn, { t: 'rooms', rooms: roomList() });

    if (msg.t === 'create') {
      const engine = ENGINES[msg.game] || ENGINES.avalon;
      const pw = cleanPassword(msg.password);
      if (msg.locked && !pw) return fail(conn, '비밀번호를 입력하세요.');
      const room = engine.createRoom(newCode());
      const r = engine.addPlayer(room, msg.name);
      if (r.error) return fail(conn, r.error);
      room.lock = pw ? makeLock(pw) : null;
      rooms.set(room.code, room);
      attach(conn, room, r.player);
      return broadcast(room);
    }

    if (msg.t === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return fail(conn, '그 방이 없어졌어요. 방 목록을 새로고침하세요.');
      if (!passwordOk(room, msg.password)) return needPassword(conn, room, msg.password);
      const name = common.cleanName(msg.name);
      if (room.phase !== 'lobby') {
        // 게임 도중 토큰을 잃어버린 사람이 같은 이름으로 다시 들어오는 경우
        const p = room.players.find((x) => x.name === name && !x.connected);
        if (!p) return fail(conn, '이미 시작된 게임이에요. 접속이 끊긴 사람의 이름으로만 다시 들어올 수 있어요.');
        attach(conn, room, p);
        return broadcast(room);
      }
      const r = engineOf(room).addPlayer(room, msg.name);
      if (r.error) return fail(conn, r.error);
      attach(conn, room, r.player);
      return broadcast(room);
    }

    if (msg.t === 'resume') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      const p = room && room.players.find((x) => x.token === msg.token);
      if (!p) return send(conn, { t: 'gone' });
      attach(conn, room, p);
      return broadcast(room);
    }

    if (!ctx) return fail(conn, '먼저 방에 들어가세요.');
    const room = rooms.get(ctx.code);
    if (!room) return send(conn, { t: 'gone' });
    const id = ctx.id;
    const engine = engineOf(room);
    let r = {};

    // 방 종류와 상관없는 동작은 여기서, 게임 규칙에 속한 동작은 엔진의 actions 표에서 처리한다
    if (msg.t === 'kick') {
      r = engine.kick(room, id, msg.target);
      if (r.kicked) {
        const target = socketsOf(room).get(r.kicked);
        if (target) {
          target.ctx = null;
          send(target, { t: 'gone', kicked: true });
          socketsOf(room).delete(r.kicked);
        }
      }
    } else if (msg.t === 'leave') {
      if (room.phase === 'lobby') {
        engine.removePlayer(room, id);
        socketsOf(room).delete(id);
        conn.ctx = null;
        send(conn, { t: 'gone' });
        if (room.players.length === 0) removeRoom(room.code);
        else broadcast(room);
      }
      return undefined;
    } else if (Object.hasOwn(engine.actions, msg.t)) {
      r = engine.actions[msg.t](room, id, msg);
    } else {
      return fail(conn, '알 수 없는 요청이에요.');
    }
    if (r.error) return fail(conn, r.error);
    return broadcast(room);
  }

  function onMessage(conn, raw) {
    conn.lastSeen = now();
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    } catch {
      return;
    }
    if (!msg || typeof msg.t !== 'string') return;
    try {
      handle(conn, msg);
    } catch (e) {
      console.error('handler error', e);
      fail(conn, '서버 오류가 났어요.');
    }
  }

  function onOpen(conn) {
    conn.ctx = null;
    conn.lastSeen = now();
  }

  function onClose(conn) {
    const ctx = conn.ctx;
    conn.ctx = null;
    if (!ctx) return;
    const room = rooms.get(ctx.code);
    if (!room) return;
    const engine = engineOf(room);
    const p = engine.getPlayer(room, ctx.id);
    if (!p) return;
    if (socketsOf(room).get(ctx.id) === conn) socketsOf(room).delete(ctx.id);
    else return; // 이미 새 연결로 바뀐 사람
    p.connected = false;
    engine.afterDisconnect(room);
    broadcast(room);
  }

  // 오래 아무 일도 없던 방을 지운다
  function sweep() {
    const t = now();
    for (const [code, room] of rooms) {
      if (t - room.lastActive > ROOM_TTL_MS) removeRoom(code);
    }
  }

  // 저장해 둔 방을 다시 올린다(접속은 모두 끊긴 상태로)
  function restore(room) {
    if (!ENGINES[room.kind]) return;
    room.players.forEach((p) => { p.connected = false; });
    rooms.set(room.code, room);
  }

  return { rooms, onOpen, onMessage, onClose, sweep, restore };
}

// 방 객체에는 Set이 들어 있어서 JSON으로 그냥 저장할 수 없다. Set/Map을 표시해서 저장하고 되살린다.
function serializeRoom(room) {
  return JSON.stringify(room, (k, v) => {
    if (v instanceof Set) return { __set: [...v] };
    if (v instanceof Map) return { __map: [...v] };
    return v;
  });
}

function deserializeRoom(text) {
  return JSON.parse(text, (k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (Array.isArray(v.__set) && Object.keys(v).length === 1) return new Set(v.__set);
      if (Array.isArray(v.__map) && Object.keys(v).length === 1) return new Map(v.__map);
    }
    return v;
  });
}

module.exports = { createHub, serializeRoom, deserializeRoom, ENGINES, ROOM_TTL_MS };
