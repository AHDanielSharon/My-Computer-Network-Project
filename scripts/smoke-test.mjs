/* Backend smoke test: two real socket clients, messaging, files, calls. */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { io } from 'socket.io-client';

const BASE = process.env.BASE || 'https://localhost:8443';
const stamp = Date.now().toString().slice(-6);

async function api(path, { token, method = 'GET', body, form } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} ${res.status}: ${data.error || 'failed'}`);
  return data;
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE, { auth: { token }, transports: ['websocket'], rejectUnauthorized: false });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 8000);
    socket.on('connected', ({ user }) => {
      clearTimeout(timer);
      resolve({ socket, user });
    });
    socket.on('connect_error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function waitFor(socket, event, predicate = () => true, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timed out waiting for ${event}`));
    }, timeout);
    function handler(payload) {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    }
    socket.on(event, handler);
  });
}

const emitAck = (socket, event, payload) =>
  new Promise((resolve, reject) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error(`${event} ack timeout`));
      if (res?.error) return reject(new Error(`${event}: ${res.error}`));
      resolve(res);
    });
  });

function ok(label) {
  console.log(`  \u2713 ${label}`);
}

try {
  console.log('Joining three users...');
  const keyA = `smoke-device-a-${'a'.repeat(32)}-${stamp}`;
  const keyB = `smoke-device-b-${'b'.repeat(32)}-${stamp}`;
  const keyC = `smoke-device-c-${'c'.repeat(32)}-${stamp}`;
  const a = await api('/api/join', {
    method: 'POST',
    body: { name: `Alice ${stamp}`, avatarColor: '#6366f1', deviceKey: keyA },
  });
  const b = await api('/api/join', {
    method: 'POST',
    body: { name: `Bob ${stamp}`, avatarColor: '#10b981', deviceKey: keyB },
  });
  const c = await api('/api/join', {
    method: 'POST',
    body: { name: `Carol ${stamp}`, avatarColor: '#f43f5e', deviceKey: keyC },
  });
  ok(`joined ${a.user.name}, ${b.user.name} and ${c.user.name}`);

  let bootA = await api('/api/bootstrap', { token: a.token });
  if (!bootA.conversations.some((c) => c.isDefault)) throw new Error('default General group missing');
  ok(`bootstrap has General (${bootA.users.length} users)`);

  const connA = await connect(a.token);
  const aSeesB = waitFor(connA.socket, 'presence', (p) => p.userId === b.user.id && p.online);
  const connB = await connect(b.token);
  await aSeesB;
  const aSeesC = waitFor(connA.socket, 'presence', (p) => p.userId === c.user.id && p.online);
  const connC = await connect(c.token);
  await aSeesC;
  ok('presence: Alice sees Bob and Carol online');

  const dm = await api('/api/conversations/dm', { token: a.token, method: 'POST', body: { userId: b.user.id } });
  ok('DM created');

  const bGetsMessage = waitFor(connB.socket, 'message:new', (p) => p.message.conversationId === dm.conversation.id);
  const send = await emitAck(connA.socket, 'chat:send', {
    conversationId: dm.conversation.id,
    type: 'text',
    body: 'Hello over the LAN!',
  });
  const received = await bGetsMessage;
  if (received.message.body !== 'Hello over the LAN!') throw new Error('message body mismatch');
  ok('real-time DM delivery');

  const readEvent = waitFor(connA.socket, 'chat:read', (p) => p.userId === b.user.id);
  connB.socket.emit('chat:read', { conversationId: dm.conversation.id });
  await readEvent;
  ok('read receipt broadcast');

  const reactionEvent = waitFor(connA.socket, 'message:updated', (p) => p.message.id === send.message.id);
  await emitAck(connB.socket, 'chat:react', { messageId: send.message.id, emoji: '🔥' });
  const reacted = await reactionEvent;
  if (!reacted.message.reactions.some((r) => r.emoji === '🔥')) throw new Error('reaction missing');
  ok('reactions');

  const editEvent = waitFor(connB.socket, 'message:updated', (p) => p.message.id === send.message.id && p.message.editedAt);
  await emitAck(connA.socket, 'chat:edit', { messageId: send.message.id, body: 'Hello over the LAN (edited)' });
  await editEvent;
  ok('edit broadcast');

  const pinEvent = waitFor(connB.socket, 'message:updated', (p) => p.message.id === send.message.id && p.message.pinnedAt);
  await emitAck(connA.socket, 'chat:pin', { messageId: send.message.id });
  await pinEvent;
  ok('pin message');

  const form = new FormData();
  form.append('file', new Blob([Buffer.from('Lantern smoke test file contents')], { type: 'text/plain' }), 'notes.txt');
  form.append('caption', 'A tiny document');
  const uploaded = await api(`/api/conversations/${dm.conversation.id}/upload`, {
    token: a.token,
    method: 'POST',
    form,
  });
  const fileId = uploaded.message.meta.fileId;
  const download = await fetch(`${BASE}/api/files/${fileId}?token=${encodeURIComponent(b.token)}`);
  const text = await download.text();
  if (text !== 'Lantern smoke test file contents') throw new Error('download contents mismatch');
  ok('file upload + authenticated download');

  const forward = await api(`/api/messages/${send.message.id}/forward`, {
    token: a.token,
    method: 'POST',
    body: { conversationIds: [bootA.conversations[0].id] },
  });
  if (forward.forwarded !== 1) throw new Error('forward failed');
  ok('forward to General');

  const search = await api('/api/search?q=LAN', { token: b.token });
  if (!search.results.length) throw new Error('search returned nothing');
  ok(`search (${search.results.length} result(s))`);

  const group = await api('/api/conversations/group', {
    token: a.token,
    method: 'POST',
    body: { name: `Test Group ${stamp}`, memberIds: [b.user.id] },
  });
  ok('group created');

  const bIncoming = waitFor(connB.socket, 'call:incoming', (p) => p.call.conversationId === dm.conversation.id);
  const invite = await emitAck(connA.socket, 'call:invite', { conversationId: dm.conversation.id, kind: 'video' });
  const incoming = await bIncoming;
  ok('incoming call event');

  const aPeerJoined = waitFor(connA.socket, 'call:peer-joined', (p) => p.userId === b.user.id);
  const accept = await emitAck(connB.socket, 'call:accept', { callId: invite.call.id });
  await aPeerJoined;
  ok('call accepted + peer-joined signalling');

  const offerSeen = waitFor(connB.socket, 'rtc:offer', (p) => p.from === a.user.id);
  connA.socket.emit('rtc:offer', {
    callId: invite.call.id,
    to: b.user.id,
    sdp: { type: 'offer', sdp: 'v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\n' },
  });
  await offerSeen;
  ok('WebRTC offer relayed');

  const ended = waitFor(connB.socket, 'call:ended', (p) => p.callId === invite.call.id);
  await emitAck(connA.socket, 'call:end', { callId: invite.call.id });
  await ended;
  ok('call ended');

  const calls = await api('/api/calls', { token: a.token });
  if (!calls.calls.length) throw new Error('call history empty');
  ok(`call history recorded (${calls.calls[0].status})`);

  const history = await api(`/api/conversations/${dm.conversation.id}/messages`, { token: b.token });
  if (!history.messages.some((m) => m.type === 'call')) throw new Error('call log message missing');
  ok('call log message persisted');

  const groupAfter = await api(`/api/conversations/${group.conversation.id}`, { token: b.token });
  if (groupAfter.conversation.members.length !== 2) throw new Error('group members wrong');
  ok('group membership visible to both');

  const beforeCatchUp = await api(`/api/conversations/${dm.conversation.id}/messages?limit=5`, {
    token: b.token,
  });
  const anchor = beforeCatchUp.messages[beforeCatchUp.messages.length - 1];
  const late = await emitAck(connA.socket, 'chat:send', {
    conversationId: dm.conversation.id,
    type: 'text',
    body: 'Sent while Bob was away',
  });
  const afterRes = await api(
    `/api/conversations/${dm.conversation.id}/messages?after=${anchor.createdAt}&afterId=${anchor.id}&limit=200`,
    { token: b.token },
  );
  if (!afterRes.messages.some((m) => m.id === late.message.id)) throw new Error('after query missed new message');
  if (afterRes.messages.some((m) => m.id === anchor.id)) throw new Error('after query repeated the anchor');
  ok('after/afterId catch-up query');

  const spoofForm = new FormData();
  spoofForm.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'photo.png');
  const spoof = await api(`/api/conversations/${dm.conversation.id}/upload`, {
    token: a.token,
    method: 'POST',
    form: spoofForm,
  });
  if (spoof.message.type !== 'file' || spoof.message.meta.mime !== 'application/octet-stream') {
    throw new Error(`spoofed image was not neutralised (${spoof.message.type}/${spoof.message.meta.mime})`);
  }
  const spoofHead = await fetch(`${BASE}/api/files/${spoof.message.meta.fileId}?inline=1&token=${b.token}`);
  if ((spoofHead.headers.get('content-type') || '').includes('image')) {
    throw new Error('spoofed image was served as an image');
  }
  if (!(spoofHead.headers.get('content-disposition') || '').startsWith('attachment')) {
    throw new Error('spoofed image was not forced to download');
  }
  ok('upload MIME sniffing blocks disguised content');

  const wrongKey = await fetch(`${BASE}/api/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: a.user.name, deviceKey: `wrong-${'z'.repeat(40)}` }),
  });
  if (wrongKey.status !== 409) throw new Error(`name should stay reserved for other devices (${wrongKey.status})`);
  const rejoin = await api('/api/join', {
    method: 'POST',
    body: { name: a.user.name, deviceKey: keyA },
  });
  if (!rejoin.rejoined || rejoin.user.id !== a.user.id) throw new Error('same-device rejoin failed');
  ok('name reclaim works only with the original device key');

  const connR = await connect(rejoin.token);
  const revoked = waitFor(connR.socket, 'disconnect', () => true, 6000);
  await api('/api/logout', { token: rejoin.token, method: 'POST' });
  await revoked;
  const stale = await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${rejoin.token}` } });
  if (stale.status !== 401) throw new Error(`logged-out token still works (${stale.status})`);
  ok('logout disconnects the session socket and invalidates the token');

  const callGroup = await api('/api/conversations/group', {
    token: a.token,
    method: 'POST',
    body: { name: `Call Group ${stamp}`, memberIds: [b.user.id, c.user.id] },
  });
  const incomingB = waitFor(connB.socket, 'call:incoming', (p) => p.call.conversationId === callGroup.conversation.id);
  const incomingC = waitFor(connC.socket, 'call:incoming', (p) => p.call.conversationId === callGroup.conversation.id);
  const groupInvite = await emitAck(connA.socket, 'call:invite', {
    conversationId: callGroup.conversation.id,
    kind: 'audio',
  });
  await Promise.all([incomingB, incomingC]);
  const aSeesBJoin = waitFor(connA.socket, 'call:peer-joined', (p) => p.userId === b.user.id);
  const aSeesCJoin = waitFor(connA.socket, 'call:peer-joined', (p) => p.userId === c.user.id);
  const bSeesCJoin = waitFor(connB.socket, 'call:peer-joined', (p) => p.userId === c.user.id);
  await emitAck(connB.socket, 'call:accept', { callId: groupInvite.call.id });
  await emitAck(connC.socket, 'call:accept', { callId: groupInvite.call.id });
  await Promise.all([aSeesBJoin, aSeesCJoin, bSeesCJoin]);
  ok('three-person group call signalling');

  const aLeft = waitFor(connB.socket, 'call:peer-left', (p) => p.userId === a.user.id && p.reason === 'left');
  await emitAck(connA.socket, 'call:end', { callId: groupInvite.call.id });
  await aLeft;
  ok('hanging up in a group call only removes that participant');

  const groupEnded = waitFor(connC.socket, 'call:ended', (p) => p.callId === groupInvite.call.id);
  await emitAck(connB.socket, 'call:end', { callId: groupInvite.call.id });
  await groupEnded;
  ok('remaining group participants still end their own call');

  connA.socket.disconnect();
  connB.socket.disconnect();
  connC.socket.disconnect();
  console.log('\nSMOKE TEST PASSED\n');
  process.exit(0);
} catch (err) {
  console.error('\nSMOKE TEST FAILED:', err.message, '\n');
  process.exit(1);
}
