const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const PORT = Number(process.env.PORT || 1240);
const ADMIN_PORT = Number(process.env.ADMIN_PORT || 1244);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const DATA_DIR = path.join(__dirname, 'data');
const BAN_FILE = path.join(DATA_DIR, 'bans.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BAN_FILE)) fs.writeFileSync(BAN_FILE, '{}');
let bans = readBans();
const rooms = new Map();
const sockets = new Map();
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const banRetentionMs = 24 * 60 * 60 * 1000;

function readBans() { try { return JSON.parse(fs.readFileSync(BAN_FILE, 'utf8')); } catch { return {}; } }
function pruneBans(now = Date.now()) {
  let changed = false;
  for (const [id, item] of Object.entries(bans)) {
    const expiresAt = item.bannedUntil || (item.lastFailure || item.createdAt || 0) + banRetentionMs;
    if (expiresAt <= now) { delete bans[id]; changed = true; }
  }
  return changed;
}
function saveBans() { pruneBans(); fs.writeFileSync(BAN_FILE, JSON.stringify(bans, null, 2)); }
if (pruneBans()) saveBans();
const bansCleanupTimer = setInterval(() => { if (pruneBans()) saveBans(); }, 60 * 60 * 1000);
bansCleanupTimer.unref();
function idFor(socket) { const supplied = String(socket.handshake.auth?.visitorId || ''); return /^[a-zA-Z0-9_-]{8,80}$/.test(supplied) ? supplied : `anon-${crypto.randomUUID()}`; }
function banStatus(id) {
  const item = bans[id];
  if (!item) return { banned: false, failures: 0 };
  const expiresAt = item.bannedUntil || (item.lastFailure || item.createdAt || 0) + banRetentionMs;
  if (expiresAt <= Date.now()) { delete bans[id]; saveBans(); return { banned: false, failures: 0 }; }
  return { banned: Boolean(item.bannedUntil), failures: item.failures || 0, bannedUntil: item.bannedUntil || null };
}
function registerFailure(id, reason) {
  const item = bans[id] || { failures: 0, createdAt: Date.now() };
  item.failures += 1; item.lastFailure = Date.now(); item.reason = reason;
  if (item.failures >= 10) item.bannedUntil = Date.now() + 24 * 60 * 60 * 1000;
  bans[id] = item; saveBans(); return banStatus(id);
}
function code() { let out = ''; do { out = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(''); } while (rooms.has(out)); return out; }
function fail(socket, message, count = true) { const status = count ? registerFailure(socket.data.visitorId, message) : banStatus(socket.data.visitorId); socket.emit('action:error', { message, ...status }); }
function removeRoom(roomCode, message) {
  const room = rooms.get(roomCode); if (!room) return;
  if (room.guest) room.guest.emit('room:closed', { message });
  rooms.delete(roomCode);
}

const app = express();
app.get('/socket.io-client.js', (req, res) => res.sendFile(path.join(__dirname, 'node_modules/socket.io/client-dist/socket.io.js')));
app.use((req, res, next) => {
  const normalizedUrl = req.url.replace(/^\/+/, '/');
  if (/^\/admin(?:\/|$)/.test(normalizedUrl)) {
    req.url = normalizedUrl.replace(/^\/admin(?=\/|$)/, '') || '/';
    return admin(req, res, next);
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));
const server = http.createServer(app);
const io = new Server(server, { path: '/socket.io/', cors: { origin: true, credentials: true } });
io.on('connection', socket => {
  socket.data.visitorId = idFor(socket); sockets.set(socket.data.visitorId, socket);
  socket.emit('visitor:ready', banStatus(socket.data.visitorId));
  socket.on('room:create', () => {
    const status = banStatus(socket.data.visitorId); if (status.banned) return fail(socket, '多次加入失败，当前禁止创建或加入房间', false);
    if (socket.data.room) return socket.emit('action:error', { message: '你已经在房间中' });
    const roomCode = code(); rooms.set(roomCode, { owner: socket, guest: null }); socket.data.room = roomCode; socket.data.role = 'owner';
    socket.join(roomCode); socket.emit('room:created', { roomCode, role: 'owner' });
  });
  socket.on('room:join', ({ roomCode } = {}) => {
    const status = banStatus(socket.data.visitorId); if (status.banned) return fail(socket, '多次加入失败，当前禁止创建或加入房间', false);
    const normalized = String(roomCode || '').trim().toUpperCase(); const room = rooms.get(normalized);
    if (!room) return fail(socket, '房间不存在或已关闭');
    if (room.guest || room.owner.id === socket.id) return fail(socket, '房间已满或不能加入自己创建的房间');
    room.guest = socket; socket.data.room = normalized; socket.data.role = 'guest'; socket.join(normalized);
    socket.emit('room:joined', { roomCode: normalized, role: 'guest', peerName: '房主' }); room.owner.emit('peer:joined', { peerName: '访客' });
  });
  socket.on('signal', payload => { const room = rooms.get(socket.data.room); if (!room) return; const peer = room.owner.id === socket.id ? room.guest : room.owner; if (peer) peer.emit('signal', payload); });
  socket.on('room:leave', () => { const roomCode = socket.data.room; if (!roomCode) return; const room = rooms.get(roomCode); if (socket.data.role === 'owner') removeRoom(roomCode, '房主已离开，房间已关闭'); else if (room) { room.guest = null; room.owner.emit('peer:left'); } socket.leave(roomCode); socket.data.room = null; });
  socket.on('disconnect', () => { const roomCode = socket.data.room; if (roomCode && socket.data.role === 'owner') removeRoom(roomCode, '房主已离开，房间已关闭'); else if (roomCode && rooms.has(roomCode)) { const room = rooms.get(roomCode); room.guest = null; room.owner.emit('peer:left'); } sockets.delete(socket.data.visitorId); });
});
server.listen(PORT, () => console.log(`P2P app listening on ${PORT}`));

const admin = express();
admin.use(express.json());
admin.use('/style.css', express.static(path.join(__dirname, 'public', 'style.css')));
admin.use('/admin.js', express.static(path.join(__dirname, 'public', 'admin.js')));
function authorized(req) { return Boolean(ADMIN_TOKEN) && req.headers.authorization === `Bearer ${ADMIN_TOKEN}`; }
const adminPage = (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html'));
const listBans = (req, res) => {
  if (!authorized(req)) return res.status(401).json({ error: '未授权' });
  bans = readBans();
  res.set('Cache-Control', 'no-store');
  res.json(Object.entries(bans).map(([visitorId, value]) => ({ visitorId, ...value })).sort((a, b) => (b.lastFailure || 0) - (a.lastFailure || 0)));
};
const removeBan = (req, res) => { if (!authorized(req)) return res.status(401).json({ error: '未授权' }); delete bans[req.params.id]; saveBans(); res.json({ ok: true }); };
admin.get('/', adminPage);
admin.get('/admin', (req, res) => res.redirect('./admin/'));
admin.get('/admin/', adminPage);
admin.get('/api/bans', listBans);
admin.get('/admin/api/bans', listBans);
admin.delete('/api/bans/:id', removeBan);
admin.delete('/admin/api/bans/:id', removeBan);
admin.listen(ADMIN_PORT, () => console.log(`Admin listening on ${ADMIN_PORT}/admin`));
