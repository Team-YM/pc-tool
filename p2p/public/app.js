const $ = id => document.getElementById(id);
const visitorId = localStorage.getItem('p2p-visitor-id') || crypto.randomUUID();
localStorage.setItem('p2p-visitor-id', visitorId);
const name = localStorage.getItem('p2p-name') || `访客-${visitorId.slice(0, 4)}`;
localStorage.setItem('p2p-name', name); $('visitorName').textContent = name;
const pagePath = window.location.pathname;
const appBase = pagePath.endsWith('/') ? pagePath : `${pagePath}/`;
const socketPath = `${appBase}socket.io/`;
const socket = io({ path: socketPath, auth: { visitorId } });
socket.on('connect', () => {
  $('cooldown').classList.add('hidden');
});
socket.on('connect_error', error => {
  joining = false;
  $('joinBtn').disabled = false;
  $('joinBtn').textContent = '加入房间';
  $('joinMessage').textContent = '服务器连接失败，请稍后重试';
  $('cooldown').textContent = `服务器连接失败：${error.message}`;
  $('cooldown').classList.remove('hidden');
});
let role = '', roomCode = '', pc = null, channel = null, pending = {}, incoming = {}, joining = false, joinTimer = null, remoteDescriptionSet = false, candidateQueue = [];
const rtcConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
function showCooldown(data) { if (!data.banned) { $('cooldown').classList.add('hidden'); return; } const tick = () => { const left = Math.max(0, data.bannedUntil - Date.now()); const hours = Math.floor(left / 3600000); const minutes = Math.floor((left % 3600000) / 60000); $('cooldown').textContent = `多次加入失败，请在 ${hours} 小时 ${minutes} 分钟后重试。有异议请加QQ群:(1121812272)`; if (left === 0) $('cooldown').classList.add('hidden'); }; tick(); $('cooldown').classList.remove('hidden'); setInterval(tick, 1000); }
function enterRoom(data) { role = data.role; roomCode = data.roomCode; $('landing').classList.add('hidden'); $('room').classList.remove('hidden'); $('roomCode').textContent = roomCode; $('connection').textContent = role === 'owner' ? '等待对方加入' : '正在连接房主'; setupPeer(); }
function setupPeer() {
  pc = new RTCPeerConnection(rtcConfig);
  pc.onicecandidate = e => e.candidate && socket.emit('signal', { type: 'candidate', candidate: e.candidate });
  pc.onconnectionstatechange = () => {
    $('connection').textContent = pc.connectionState === 'connected' ? '已连接' : pc.connectionState;
    if (['failed', 'disconnected'].includes(pc.connectionState)) $('roomMessage').textContent = '连接失败，请双方重新创建或加入房间';
  };
  pc.ondatachannel = e => attachChannel(e.channel);
  if (role === 'owner') attachChannel(pc.createDataChannel('files'));
}
function attachChannel(ch) { channel = ch; channel.binaryType = 'arraybuffer'; channel.onopen = () => { $('connection').textContent = '已连接，可传输文件'; }; channel.onmessage = onChannelMessage; }
async function makeOffer() { const offer = await pc.createOffer(); await pc.setLocalDescription(offer); socket.emit('signal', { type: 'offer', sdp: offer }); }
socket.on('visitor:ready', showCooldown);
socket.on('room:created', data => { enterRoom(data); });
socket.on('room:joined', data => { clearTimeout(joinTimer); joining = false; $('joinBtn').disabled = false; $('joinBtn').textContent = '加入房间'; $('joinMessage').textContent = '加入成功，正在建立连接'; enterRoom(data); });
socket.on('peer:joined', async () => { $('connection').textContent = '对方已加入，正在连接'; await makeOffer(); });
socket.on('signal', async msg => {
  if (!pc) setupPeer();
  if (msg.type === 'candidate') {
    if (!remoteDescriptionSet) return candidateQueue.push(msg.candidate);
    try { await pc.addIceCandidate(msg.candidate); } catch {}
    return;
  }
  if (msg.type === 'offer') {
    await pc.setRemoteDescription(msg.sdp);
    remoteDescriptionSet = true;
    for (const candidate of candidateQueue.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('signal', { type: 'answer', sdp: answer });
  } else if (msg.type === 'answer') {
    await pc.setRemoteDescription(msg.sdp);
    remoteDescriptionSet = true;
    for (const candidate of candidateQueue.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
  }
});
socket.on('action:error', data => {
  if (joining) {
    joining = false;
    $('joinBtn').disabled = false;
    $('joinBtn').textContent = '加入房间';
    $('joinMessage').textContent = `加入失败：${data.message}，请检查邀请码后重试`;
  }
  $('roomMessage').textContent = data.message;
  showCooldown(data);
});
socket.on('peer:left', () => { $('roomMessage').textContent = '对方已离开房间'; $('connection').textContent = '对方已离开'; });
socket.on('room:closed', data => { alert(data.message); location.reload(); });
$('createBtn').onclick = () => socket.emit('room:create');
$('joinBtn').onclick = () => {
  if (joining) return;
  const input = $('roomInput').value.trim().toUpperCase();
  if (input.length !== 6) {
    $('joinMessage').textContent = '请输入完整的 6 位邀请码';
    $('roomInput').focus();
    return;
  }
  joining = true;
  $('joinBtn').disabled = true;
  $('joinBtn').textContent = '加入中…';
  $('joinMessage').textContent = '正在验证邀请码，请勿重复点击';
  clearTimeout(joinTimer);
  joinTimer = setTimeout(() => {
    if (!joining) return;
    joining = false;
    $('joinBtn').disabled = false;
    $('joinBtn').textContent = '加入房间';
    $('joinMessage').textContent = '加入请求超时，请检查服务器连接后重试';
  }, 15000);
  socket.emit('room:join', { roomCode: input });
};
$('copyBtn').onclick = async () => { await navigator.clipboard.writeText(roomCode); $('copyBtn').textContent = '已复制'; setTimeout(() => $('copyBtn').textContent = '复制', 1500); };
$('leaveBtn').onclick = () => { socket.emit('room:leave'); location.reload(); };
$('pickBtn').onclick = () => $('fileInput').click(); $('fileInput').onchange = e => Array.from(e.target.files).forEach(sendFile);
$('dropZone').ondragover = e => { e.preventDefault(); $('dropZone').classList.add('drag'); }; $('dropZone').ondragleave = () => $('dropZone').classList.remove('drag'); $('dropZone').ondrop = e => { e.preventDefault(); $('dropZone').classList.remove('drag'); Array.from(e.dataTransfer.files).forEach(sendFile); };
function isArchive(name) { return /\.(zip|7z|rar|gz|gzip|tar|tgz|bz2|tbz2?|xz|txz|zst|tzst)$/i.test(name); }
function card(title, meta) { const el = document.createElement('article'); el.className = 'file-item'; el.innerHTML = `<div><strong>${title}</strong><small>${meta}</small></div><span class="progress">0%</span>`; $('files').prepend(el); return el; }
async function sendFile(file) { if (!isArchive(file.name)) return $('roomMessage').textContent = '仅支持上传压缩包，请先压缩文件'; if (!channel || channel.readyState !== 'open') return $('roomMessage').textContent = '连接尚未建立'; const id = crypto.randomUUID(); const el = card(`发送：${file.name}`, formatSize(file.size)); channel.send(JSON.stringify({ type: 'file-offer', id, name: file.name, size: file.size, mime: file.type })); pending[id] = { file, el }; }
function onChannelMessage(event) { if (typeof event.data !== 'string') { const view = new DataView(event.data); const idLength = view.getUint8(0); const id = new TextDecoder().decode(new Uint8Array(event.data, 1, idLength)); const payload = event.data.slice(1 + idLength); const item = incoming[id]; if (!item) return; item.parts.push(payload); item.received += payload.byteLength; item.el.querySelector('.progress').textContent = `${Math.floor(item.received / item.size * 100)}%`; if (item.received >= item.size) finishIncoming(id); return; } const msg = JSON.parse(event.data); if (msg.type === 'file-offer') { if (!isArchive(msg.name)) { channel.send(JSON.stringify({ type: 'file-response', id: msg.id, accepted: false })); $('roomMessage').textContent = '对方发送的文件不是压缩包，已拒绝'; return; } const el = card(`收到：${msg.name}`, formatSize(msg.size)); const accept = document.createElement('button'); accept.textContent = '接收'; const reject = document.createElement('button'); reject.textContent = '拒绝'; el.append(accept, reject); accept.onclick = () => { channel.send(JSON.stringify({ type: 'file-response', id: msg.id, accepted: true })); accept.remove(); reject.remove(); incoming[msg.id] = { ...msg, parts: [], received: 0, el }; if (msg.size === 0) finishIncoming(msg.id); }; reject.onclick = () => { channel.send(JSON.stringify({ type: 'file-response', id: msg.id, accepted: false })); el.querySelector('.progress').textContent = '已拒绝'; accept.remove(); reject.remove(); }; } else if (msg.type === 'file-response') { const item = pending[msg.id]; if (!item) return; if (!msg.accepted) { item.el.querySelector('.progress').textContent = '对方已拒绝'; delete pending[msg.id]; return; } if (item.file.size === 0) { item.el.querySelector('.progress').textContent = '100%'; delete pending[msg.id]; return; } streamFile(msg.id, item); } }
function finishIncoming(id) { const item = incoming[id]; if (!item) return; const blob = new Blob(item.parts, { type: item.mime }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = item.name; a.textContent = '下载文件'; item.el.querySelector('div').appendChild(a); item.el.querySelector('.progress').textContent = '100%'; delete incoming[id]; }
async function streamFile(id, item) { const idBytes = new TextEncoder().encode(id); const chunk = 64 * 1024; let sent = 0; while (sent < item.file.size) { while (channel.bufferedAmount > 4 * 1024 * 1024) await new Promise(r => setTimeout(r, 40)); const data = new Uint8Array(await item.file.slice(sent, sent + chunk).arrayBuffer()); const packet = new Uint8Array(1 + idBytes.length + data.length); packet[0] = idBytes.length; packet.set(idBytes, 1); packet.set(data, 1 + idBytes.length); channel.send(packet.buffer); sent += data.length; item.el.querySelector('.progress').textContent = `${Math.min(100, Math.floor(sent / item.file.size * 100))}%`; } delete pending[id]; }
function formatSize(n) { return n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`; }
