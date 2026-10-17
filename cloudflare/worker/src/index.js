// 보드게임 서버의 Cloudflare 버전. 모든 방을 Durable Object 하나(이름 "main")가 메모리에 들고 있고,
// 방이 바뀔 때마다 저장소(SQLite)에 적어 둔다. 그래서 잠시 모두 나가서 객체가 내려가도 다시 접속하면 이어서 할 수 있다.
// 규칙과 방 관리는 Node 서버와 같은 코드(avalon/hub.js)를 그대로 쓴다.
import { DurableObject } from 'cloudflare:workers';
import hubLib from '../../../avalon/hub.js';

const { createHub, serializeRoom, deserializeRoom } = hubLib;
const PING_EVERY_MS = 30 * 1000;
const DEAD_AFTER_MS = 75 * 1000; // 화면이 꺼진 폰처럼 조용히 끊긴 연결을 이 시간 뒤에 정리한다

export class GameHub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.conns = new Set();
    this.timer = null;
    this.hub = createHub({
      onChange: (room) => this.ctx.storage.put(`room:${room.code}`, serializeRoom(room)),
      onRemove: (code) => this.ctx.storage.delete(`room:${code}`),
    });
    this.ctx.blockConcurrencyWhile(async () => {
      const saved = await this.ctx.storage.list({ prefix: 'room:' });
      for (const text of saved.values()) {
        try {
          this.hub.restore(deserializeRoom(text));
        } catch (e) {
          console.error('restore failed', e);
        }
      }
      this.hub.sweep();
    });
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('WebSocket 전용 주소예요.', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = {
      send: (text) => server.send(text),
      close: (code, reason) => {
        try { server.close(code, reason); } catch { /* 이미 닫힘 */ }
      },
      isOpen: () => server.readyState === WebSocket.OPEN,
    };
    this.conns.add(conn);
    this.hub.onOpen(conn);
    this.startTimer();
    server.addEventListener('message', (e) => this.hub.onMessage(conn, e.data));
    const gone = () => this.drop(conn);
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    return new Response(null, { status: 101, webSocket: client });
  }

  drop(conn) {
    if (!this.conns.has(conn)) return;
    this.conns.delete(conn);
    this.hub.onClose(conn);
    if (this.conns.size === 0) this.stopTimer();
  }

  // 접속한 사람이 있을 때만 돈다(아무도 없으면 객체가 쉬도록 타이머를 멈춘다)
  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const now = Date.now();
      for (const conn of [...this.conns]) {
        if (!conn.isOpen() || now - conn.lastSeen > DEAD_AFTER_MS) {
          conn.close(4001, 'timeout');
          this.drop(conn);
        }
      }
      this.hub.sweep();
    }, PING_EVERY_MS);
  }

  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

// 이 Worker 주소로 직접 들어와도(테스트용) 같은 방 서버로 연결해 준다
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.endsWith('/ws')) {
      return env.ROOMS.get(env.ROOMS.idFromName('main')).fetch(request);
    }
    return new Response('board-rooms: 게임은 clue-note 사이트의 /board/ 에서 하세요.', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
