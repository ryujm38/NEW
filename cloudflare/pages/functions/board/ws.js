// clue-note 사이트의 /board/ws : 보드게임 WebSocket을 board-rooms Worker의 Durable Object로 넘긴다.
export async function onRequest({ request, env }) {
  if (request.headers.get('Upgrade') !== 'websocket') {
    return new Response('WebSocket 전용 주소예요.', { status: 426 });
  }
  return env.ROOMS.get(env.ROOMS.idFromName('main')).fetch(request);
}
