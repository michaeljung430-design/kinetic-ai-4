const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer, WebSocket } = require('ws');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const VIRTUAL_ADAPTER = /^(vEthernet|Virtual|VMware|Loopback|Docker|Hyper-?V|Tailscale|ZeroTier|Bluetooth|Npcap)/i;
const PHYSICAL_ADAPTER = /^(Wi-?Fi|Ethernet|en0|en1|wlan0)/i;

function lanAddress() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) candidates.push({ name, address: net.address });
    }
  }
  const physical = candidates.find(c => PHYSICAL_ADAPTER.test(c.name));
  if (physical) return physical.address;
  const nonVirtual = candidates.find(c => !VIRTUAL_ADAPTER.test(c.name));
  if (nonVirtual) return nonVirtual.address;
  return candidates[0]?.address || '127.0.0.1';
}

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function roomFor(rooms, session) {
  if (!rooms.has(session)) rooms.set(session, new Set());
  return rooms.get(session);
}

function validSession(session) {
  return typeof session === 'string' && /^[a-zA-Z0-9-]{4,64}$/.test(session);
}

function attachRelay(server) {
  const wss = new WebSocketServer({ server });
  const rooms = new Map();

  wss.on('connection', socket => {
    let session, role;

    socket.on('message', raw => {
      let message;
      try { message = JSON.parse(raw.toString()); }
      catch { send(socket, { type: 'error', message: 'Invalid message.' }); return; }

      if (!validSession(message.session)) { send(socket, { type: 'error', message: 'Invalid session code.' }); return; }

      if (message.type === 'join') {
        if (!['camera', 'sensor'].includes(message.role)) { send(socket, { type: 'error', message: 'Invalid device role.' }); return; }
        session = message.session; role = message.role;
        socket.role = role;
        const room = roomFor(rooms, session);
        for (const peer of room) send(socket, { type: 'peer', role: peer.role, connected: true });
        room.add(socket);
        send(socket, { type: 'joined', session, role });
        for (const peer of room) if (peer !== socket) send(peer, { type: 'peer', role, connected: true });
        return;
      }

      if (!session || message.session !== session) return;
      if (message.type === 'sample' && role !== 'sensor') return;
      if (message.type === 'control' && role !== 'camera') return;
      if (!['sample', 'control'].includes(message.type)) return;

      for (const peer of roomFor(rooms, session)) if (peer !== socket) send(peer, message);
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

  return wss;
}

function serveStatic(appDir, req, res) {
  if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  const relative = urlPath === '/' ? '/movement-sensor-diagnostics.html' : urlPath;
  const filePath = path.normalize(path.join(appDir, relative));
  if (!filePath.startsWith(appDir)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function startLocalServer(appDir, preferredPort = 5199) {
  const server = http.createServer((req, res) => serveStatic(appDir, req, res));
  attachRelay(server);

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(preferredPort, '0.0.0.0', () => {
      resolve({ server, port: server.address().port, lan: lanAddress() });
    });
  });
}

module.exports = { startLocalServer, lanAddress };
