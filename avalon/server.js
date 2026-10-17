'use strict';
// HTTP(정적 파일) + WebSocket(게임) 서버. 방은 메모리에만 있다. 서버가 재시작되면 진행 중인 방은 사라진다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const common = require('./common');
const engines = { avalon: require('./game'), uno: require('./uno'), bang: require('./bang'), mafia: require('./mafia'), splendor: require('./splendor') };

const PUBLIC_DIR = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I, O 제외: 1/0과 헷갈리지 않게
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

function createAppServer() {
  const rooms = new Map(); // code -> room
  const sockets = new Map(); // room code -> Map(playerId -> ws)
  const engineOf = (room) => engines[room.kind];

  const httpServer = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    const rel = urlPath === '/' ? '/index.html' : urlPath;
    const file = path.normalize(path.join(PUBLIC_DIR, rel));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    });
  });

  const wss = new WebSocketServer({ server: httpServer, maxPayload: 4096 });

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

  function send(ws, msg) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  }

  function broadcast(room) {
    room.lastActive = Date.now();
    for (const [pid, ws] of socketsOf(room)) {
      send(ws, { t: 'state', state: engineOf(room).viewFor(room, pid) });
    }
  }

  function attach(ws, room, player) {
    const map = socketsOf(room);
    const old = map.get(player.id);
    if (old && old !== ws) {
      old.ctx = null; // 옛 연결의 close 이벤트가 상태를 망가뜨리지 않게
      old.close(4000, 'replaced');
    }
    map.set(player.id, ws);
    player.connected = true;
    ws.ctx = { code: room.code, id: player.id };
    send(ws, { t: 'joined', code: room.code, id: player.id, token: player.token });
  }

  function fail(ws, msg) {
    send(ws, { t: 'error', msg });
  }

  function handle(ws, msg) {
    const ctx = ws.ctx;

    if (msg.t === 'create') {
      const engine = engines[msg.game] || engines.avalon;
      const room = engine.createRoom(newCode());
      const r = engine.addPlayer(room, msg.name);
      if (r.error) return fail(ws, r.error);
      rooms.set(room.code, room);
      attach(ws, room, r.player);
      return broadcast(room);
    }

    if (msg.t === 'join') {
      const room = rooms.get(String(msg.code || '').toUpperCase().trim());
      if (!room) return fail(ws, '그 코드의 방이 없어요.');
      const name = common.cleanName(msg.name);
      if (room.phase !== 'lobby') {
        // 게임 도중 토큰을 잃어버린 사람이 같은 이름으로 다시 들어오는 경우
        const p = room.players.find((x) => x.name === name && !x.connected);
        if (!p) return fail(ws, '이미 시작된 게임이에요. 접속이 끊긴 사람의 이름으로만 다시 들어올 수 있어요.');
        attach(ws, room, p);
        return broadcast(room);
      }
      const r = engineOf(room).addPlayer(room, msg.name);
      if (r.error) return fail(ws, r.error);
      attach(ws, room, r.player);
      return broadcast(room);
    }

    if (msg.t === 'resume') {
      const room = rooms.get(String(msg.code || '').toUpperCase());
      const p = room && room.players.find((x) => x.token === msg.token);
      if (!p) return send(ws, { t: 'gone' });
      attach(ws, room, p);
      return broadcast(room);
    }

    if (!ctx) return fail(ws, '먼저 방에 들어가세요.');
    const room = rooms.get(ctx.code);
    if (!room) return send(ws, { t: 'gone' });
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
        ws.ctx = null;
        send(ws, { t: 'gone' });
        if (room.players.length === 0) rooms.delete(room.code);
        else broadcast(room);
      }
      return;
    } else if (Object.hasOwn(engine.actions, msg.t)) {
      r = engine.actions[msg.t](room, id, msg);
    } else {
      return fail(ws, '알 수 없는 요청이에요.');
    }
    if (r.error) return fail(ws, r.error);
    broadcast(room);
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.ctx = null;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!msg || typeof msg.t !== 'string') return;
      try {
        handle(ws, msg);
      } catch (e) {
        console.error('handler error', e);
        fail(ws, '서버 오류가 났어요.');
      }
    });
    ws.on('close', () => {
      const ctx = ws.ctx;
      if (!ctx) return;
      const room = rooms.get(ctx.code);
      if (!room) return;
      const engine = engineOf(room);
      const p = engine.getPlayer(room, ctx.id);
      if (!p) return;
      if (socketsOf(room).get(ctx.id) === ws) socketsOf(room).delete(ctx.id);
      p.connected = false;
      engine.afterDisconnect(room);
      broadcast(room);
    });
  });

  // 모바일은 화면이 꺼지면 연결이 조용히 죽는다. 주기적으로 ping해서 정리하고, 프록시의 유휴 종료도 막는다.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25000);

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.lastActive > ROOM_TTL_MS) {
        rooms.delete(code);
        sockets.delete(code);
      }
    }
  }, 10 * 60 * 1000);

  httpServer.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
  });

  return { httpServer, rooms };
}

module.exports = { createAppServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { httpServer } = createAppServer();
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`아발론 서버가 켜졌어요: http://localhost:${port}`);
  });
}
