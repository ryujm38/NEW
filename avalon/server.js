'use strict';
// HTTP(정적 파일) + WebSocket(게임) 서버. 방은 메모리에만 있다. 서버가 재시작되면 진행 중인 방은 사라진다.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { createHub } = require('./hub');

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

function createAppServer() {
  const hub = createHub();

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

  wss.on('connection', (ws) => {
    const conn = {
      send: (text) => ws.send(text),
      close: (code, reason) => ws.close(code, reason),
      isOpen: () => ws.readyState === ws.OPEN,
    };
    ws.isAlive = true;
    hub.onOpen(conn);
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('message', (raw) => hub.onMessage(conn, raw));
    ws.on('close', () => hub.onClose(conn));
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

  const sweeper = setInterval(() => hub.sweep(), 10 * 60 * 1000);

  httpServer.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(sweeper);
  });

  return { httpServer, rooms: hub.rooms };
}

module.exports = { createAppServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  const { httpServer } = createAppServer();
  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`아발론 서버가 켜졌어요: http://localhost:${port}`);
  });
}
