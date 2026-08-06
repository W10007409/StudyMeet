// Phase 0 스파이크용 최소 시그널링 서버.
// 같은 room의 두 참가자 사이에서 JSON 메시지를 그대로 중계한다.
// 인증도, 영속성도, 다중 인스턴스 지원도 없다. Phase 1에서 폐기된다.

const { WebSocketServer } = require('ws');
const { parse } = require('url');

const PORT = process.env.PORT || 8080;
const rooms = new Map(); // roomId -> Set<WebSocket>

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const { query } = parse(req.url, true);
  const roomId = query.room;

  if (!roomId) {
    ws.close(1008, 'room query parameter required');
    return;
  }

  let peers = rooms.get(roomId);
  if (!peers) {
    peers = new Set();
    rooms.set(roomId, peers);
  }

  if (peers.size >= 2) {
    ws.close(1008, 'room full');
    return;
  }

  peers.add(ws);
  console.log(`[join] room=${roomId} peers=${peers.size}`);

  // 두 번째 참가자가 들어오면 양쪽에 알려 협상을 시작시킨다.
  if (peers.size === 2) {
    for (const peer of peers) {
      peer.send(JSON.stringify({ type: 'ready' }));
    }
  }

  ws.on('message', (data) => {
    for (const peer of peers) {
      if (peer !== ws && peer.readyState === peer.OPEN) {
        peer.send(data.toString());
      }
    }
  });

  ws.on('close', () => {
    peers.delete(ws);
    console.log(`[leave] room=${roomId} peers=${peers.size}`);
    for (const peer of peers) {
      if (peer.readyState === peer.OPEN) {
        peer.send(JSON.stringify({ type: 'peer-left' }));
      }
    }
    if (peers.size === 0) rooms.delete(roomId);
  });
});

console.log(`signaling server listening on ws://0.0.0.0:${PORT}`);
