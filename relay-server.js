const express = require('express');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const app = express();
app.get('/healthz', (_request, response) => response.json({ ok: true }));
app.use(express.static(__dirname));

const server = http.createServer(app);
const websocketServer = new WebSocketServer({ server });
const rooms = new Map();

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function roomFor(session) {
  if (!rooms.has(session)) rooms.set(session, new Set());
  return rooms.get(session);
}

function validSession(session) {
  return typeof session === 'string' && /^[a-zA-Z0-9-]{4,64}$/.test(session);
}

websocketServer.on('connection', socket => {
  let session;
  let role;

  socket.on('message', raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      send(socket, { type: 'error', message: 'Invalid message.' });
      return;
    }

    if (!validSession(message.session)) {
      send(socket, { type: 'error', message: 'Invalid session code.' });
      return;
    }

    if (message.type === 'join') {
      if (!['camera', 'sensor'].includes(message.role)) {
        send(socket, { type: 'error', message: 'Invalid device role.' });
        return;
      }
      session = message.session;
      role = message.role;
      const room = roomFor(session);
      room.add(socket);
      send(socket, { type: 'joined', session, role });
      for (const peer of room) if (peer !== socket) send(peer, { type: 'peer', role, connected: true });
      return;
    }

    if (!session || message.session !== session) return;
    if (message.type === 'sample' && role !== 'sensor') return;
    if (message.type === 'control' && role !== 'camera') return;
    if (!['sample', 'control'].includes(message.type)) return;

    for (const peer of roomFor(session)) if (peer !== socket) send(peer, message);
  });

  socket.on('close', () => {
    if (!session) return;
    const room = rooms.get(session);
    if (!room) return;
    room.delete(socket);
    for (const peer of room) send(peer, { type: 'peer', role, connected: false });
    if (!room.size) rooms.delete(session);
  });
});

const port = Number(process.env.PORT || 10000);
server.listen(port, '0.0.0.0', () => console.log(`Movement relay listening on ${port}`));
