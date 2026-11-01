import { Server } from 'socket.io';
import fs from 'node:fs';
import path from 'node:path';
import { FILES_DIR } from './config.js';
import { authenticateToken } from './auth.js';
import { addConnection, removeConnection, onlineUserIds } from './presence.js';
import { setIo, emitToUser } from './io.js';
import {
  db,
  now,
  uid,
  getUserById,
  publicUser,
  isMember,
  memberRow,
  memberIds,
  getConversation,
  conversationTitle,
  serializeConversation,
  serializeMessages,
  createMessage,
  getMessageById,
  markRead,
  setPinned,
  setUserStatus,
  touchUserSeen,
} from './db.js';

const MAX_CALL_PARTICIPANTS = 6;
const RING_TIMEOUT_MS = 60_000;
const calls = new Map();
const rateBuckets = new Map();

function rateLimited(userId, max = 35, windowMs = 10_000) {
  const ts = now();
  let bucket = rateBuckets.get(userId);
  if (!bucket || ts - bucket.start > windowMs) {
    bucket = { start: ts, count: 0 };
    rateBuckets.set(userId, bucket);
  }
  bucket.count += 1;
  if (rateBuckets.size > 500) {
    for (const [key, b] of rateBuckets) if (ts - b.start > windowMs * 6) rateBuckets.delete(key);
  }
  return bucket.count > max;
}

function cleanText(value, max = 8000) {
  if (typeof value !== 'string') return '';
  return value.replace(/\u0000/g, '').slice(0, max).trim();
}

let setIoRef = null;

/* ------------------------------- calls ------------------------------- */

function callState(call) {
  return {
    id: call.id,
    conversationId: call.conversationId,
    kind: call.kind,
    initiatorId: call.initiatorId,
    startedAt: call.startedAt,
    status: call.status,
    participants: [...call.participants.entries()]
      .filter(([, p]) => p.status === 'accepted')
      .map(([userId, p]) => {
        const u = getUserById(userId);
        return {
          userId,
          name: u?.name || 'Unknown',
          joinedAt: p.joinedAt,
          media: p.media,
        };
      }),
  };
}

function callParticipantUserIds(call) {
  return [...call.participants.keys()];
}

function acceptedCount(call) {
  return [...call.participants.values()].filter((p) => p.status === 'accepted').length;
}

function finishCall(call, { reason = 'ended', status = null } = {}) {
  if (call.finished) return;
  call.finished = true;
  clearTimeout(call.timer);
  calls.delete(call.id);

  const endedAt = now();
  const accepted = acceptedCount(call);
  const finalStatus = status || (accepted > 0 ? 'ended' : reason === 'rejected' ? 'rejected' : 'missed');
  const duration = call.answeredAt ? Math.max(0, Math.round((endedAt - call.answeredAt) / 1000)) : 0;

  db.prepare(`UPDATE calls SET status = ?, ended_at = ?, duration = ? WHERE id = ?`).run(
    finalStatus,
    endedAt,
    duration,
    call.id,
  );

  for (const [userId, p] of call.participants) {
    let pStatus = p.status;
    if (p.status === 'accepted') pStatus = 'left';
    else if (p.status === 'invited') pStatus = 'missed';
    db.prepare(`UPDATE call_participants SET status = ?, left_at = ? WHERE call_id = ? AND user_id = ?`).run(
      pStatus,
      now(),
      call.id,
      userId,
    );
  }

  const payload = {
    callId: call.id,
    conversationId: call.conversationId,
    status: finalStatus,
    reason,
    duration,
  };
  for (const userId of callParticipantUserIds(call)) {
    emitToUser(userId, 'call:ended', payload);
  }

  const conv = getConversation(call.conversationId);
  if (conv && call.participants.size > 1) {
    const message = createMessage({
      conversationId: call.conversationId,
      senderId: call.initiatorId,
      type: 'call',
      body: null,
      meta: {
        callId: call.id,
        kind: call.kind,
        status: finalStatus,
        duration,
        participantCount: accepted,
      },
    });
    broadcastMessage(message);
  }
}

function broadcastMessage(row) {
  const io = setIoRef;
  if (!io) return;
  const message = serializeMessages([row], row.sender_id)[0];
  io.to(`conv:${row.conversation_id}`).emit('message:new', { message });
  return message;
}

export function initRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: true },
    maxHttpBufferSize: 2 * 1024 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });
  setIo(io);
  setIoRef = io;

  io.use((socket, next) => {
    const auth = authenticateToken(socket.handshake.auth?.token);
    if (!auth) return next(new Error('unauthorized'));
    socket.data.userId = auth.user.id;
    socket.data.tokenHash = auth.session.token_hash;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const user = getUserById(userId);
    if (!user) return socket.disconnect(true);

    addConnection(userId, socket.id);
    touchUserSeen(userId);
    socket.join(`user:${userId}`);
    for (const row of db.prepare(`SELECT conversation_id FROM members WHERE user_id = ?`).all(userId)) {
      socket.join(`conv:${row.conversation_id}`);
    }

    io.emit('presence', { userId, online: true, status: user.status, lastSeen: now() });
    socket.emit('connected', {
      user: publicUser(user),
      onlineUserIds: onlineUserIds(),
      serverTime: now(),
    });

    /* -------- presence -------- */
    socket.on('presence:set', (data, ack) => {
      const status = data?.status === 'busy' ? 'busy' : 'online';
      setUserStatus(userId, status);
      const fresh = getUserById(userId);
      io.emit('presence', { userId, online: true, status: fresh.status, lastSeen: fresh.last_seen });
      ack?.({ ok: true });
    });

    socket.on('profile:refresh', () => {
      const fresh = getUserById(userId);
      io.emit('user:updated', { user: publicUser(fresh) });
    });

    /* -------- messaging -------- */
    socket.on('chat:send', (data, ack) => {
      try {
        if (rateLimited(userId)) return ack?.({ error: 'You are sending messages too quickly. Slow down a little.' });
        const conversationId = String(data?.conversationId || '');
        const conv = getConversation(conversationId);
        if (!conv || !isMember(conversationId, userId)) return ack?.({ error: 'You are not part of this conversation.' });

        let type = String(data?.type || 'text');
        if (!['text', 'location'].includes(type)) type = 'text';
        let body = cleanText(data?.body, 8000);
        let meta = null;

        if (type === 'text') {
          if (!body) return ack?.({ error: 'Message cannot be empty.' });
        } else if (type === 'location') {
          const lat = Number(data?.meta?.lat);
          const lng = Number(data?.meta?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            return ack?.({ error: 'That location could not be shared.' });
          }
          const accuracy = Number(data?.meta?.accuracy);
          meta = {
            lat,
            lng,
            accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : null,
          };
          body = cleanText(data?.meta?.label, 120) || 'Shared location';
        }

        let replyTo = null;
        if (data?.replyTo) {
          const reply = getMessageById(String(data.replyTo));
          if (reply && reply.conversation_id === conversationId) replyTo = reply.id;
        }

        const row = createMessage({
          conversationId,
          senderId: userId,
          type,
          body,
          meta,
          replyTo,
        });
        const message = serializeMessages([row], userId)[0];
        io.to(`conv:${conversationId}`).emit('message:new', { message });
        const freshConv = getConversation(conversationId);
        if (freshConv) emitToUser(userId, 'conversation:bump', { conversationId });
        ack?.({ ok: true, message });
      } catch (err) {
        console.error('[lantern] chat:send failed', err);
        ack?.({ error: 'Message could not be sent. Please try again.' });
      }
    });

    socket.on('chat:edit', (data, ack) => {
      const message = getMessageById(String(data?.messageId || ''));
      if (!message || message.deleted_at) return ack?.({ error: 'That message is no longer available.' });
      if (!isMember(message.conversation_id, userId)) {
        return ack?.({ error: 'You are not part of this conversation.' });
      }
      if (message.sender_id !== userId) return ack?.({ error: 'You can only edit your own messages.' });
      if (message.type !== 'text') return ack?.({ error: 'Only text messages can be edited.' });
      const body = cleanText(data?.body, 8000);
      if (!body) return ack?.({ error: 'Message cannot be empty.' });
      db.prepare(`UPDATE messages SET body = ?, edited_at = ? WHERE id = ?`).run(body, now(), message.id);
      const updated = serializeMessages([getMessageById(message.id)], userId)[0];
      io.to(`conv:${message.conversation_id}`).emit('message:updated', { message: updated });
      ack?.({ ok: true, message: updated });
    });

    socket.on('chat:delete', (data, ack) => {
      const message = getMessageById(String(data?.messageId || ''));
      if (!message || message.deleted_at) return ack?.({ error: 'That message is no longer available.' });
      const membership = memberRow(message.conversation_id, userId);
      if (!membership) return ack?.({ error: 'You are not part of this conversation.' });
      const isAdmin = membership.role === 'admin';
      if (message.sender_id !== userId && !isAdmin) return ack?.({ error: 'You cannot delete this message.' });

      const file = db.prepare(`SELECT * FROM files WHERE message_id = ?`).get(message.id);
      if (file) {
        try {
          fs.unlinkSync(path.join(FILES_DIR, file.stored_name));
        } catch {}
        db.prepare(`DELETE FROM files WHERE id = ?`).run(file.id);
      }
      db.prepare(`DELETE FROM reactions WHERE message_id = ?`).run(message.id);
      db.prepare(
        `UPDATE messages SET deleted_at = ?, body = NULL, metadata = NULL, pinned_at = NULL, pinned_by = NULL WHERE id = ?`,
      ).run(now(), message.id);
      const updated = serializeMessages([getMessageById(message.id)], userId)[0];
      io.to(`conv:${message.conversation_id}`).emit('message:updated', { message: updated });
      ack?.({ ok: true });
    });

    socket.on('chat:react', (data, ack) => {
      const message = getMessageById(String(data?.messageId || ''));
      const emoji = String(data?.emoji || '').slice(0, 12);
      if (!message || message.deleted_at) return ack?.({ error: 'That message is no longer available.' });
      if (message.type === 'system' || message.type === 'call') return ack?.({ error: 'This message cannot be reacted to.' });
      if (!isMember(message.conversation_id, userId)) return ack?.({ error: 'You are not part of this conversation.' });
      if (!emoji) return ack?.({ error: 'Pick an emoji first.' });
      const existing = db
        .prepare(`SELECT 1 AS ok FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`)
        .get(message.id, userId, emoji);
      if (existing) {
        db.prepare(`DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`).run(
          message.id,
          userId,
          emoji,
        );
      } else {
        db.prepare(
          `INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)`,
        ).run(message.id, userId, emoji, now());
      }
      const updated = serializeMessages([getMessageById(message.id)], userId)[0];
      io.to(`conv:${message.conversation_id}`).emit('message:updated', { message: updated });
      ack?.({ ok: true });
    });

    socket.on('chat:pin', (data, ack) => {
      const message = getMessageById(String(data?.messageId || ''));
      if (!message || message.deleted_at) return ack?.({ error: 'That message is no longer available.' });
      if (!isMember(message.conversation_id, userId)) return ack?.({ error: 'You are not part of this conversation.' });
      if (!['text', 'image', 'file', 'voice', 'location', 'video'].includes(message.type))
        return ack?.({ error: 'This message cannot be pinned.' });
      const pinned = !message.pinned_at;
      setPinned(message.id, pinned, userId);
      const updated = serializeMessages([getMessageById(message.id)], userId)[0];
      io.to(`conv:${message.conversation_id}`).emit('message:updated', { message: updated });
      ack?.({ ok: true, pinned });
    });

    socket.on('chat:read', (data) => {
      const conversationId = String(data?.conversationId || '');
      if (!isMember(conversationId, userId)) return;
      const at = now();
      markRead(conversationId, userId, at);
      io.to(`conv:${conversationId}`).emit('chat:read', { conversationId, userId, at });
    });

    socket.on('typing', (data) => {
      const conversationId = String(data?.conversationId || '');
      if (!isMember(conversationId, userId)) return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        conversationId,
        userId,
        name: getUserById(userId)?.name || 'Someone',
        isTyping: !!data?.isTyping,
      });
    });

    /* -------- calls -------- */
    socket.on('call:invite', (data, ack) => {
      try {
        const conversationId = String(data?.conversationId || '');
        const kind = data?.kind === 'audio' ? 'audio' : 'video';
        const conv = getConversation(conversationId);
        if (!conv || !isMember(conversationId, userId)) return ack?.({ error: 'You are not part of this conversation.' });

        const active = [...calls.values()].find(
          (c) => c.conversationId === conversationId && !c.finished,
        );
        if (active) {
          const already = active.participants.get(userId);
          if (already?.status === 'accepted') return ack?.({ call: callState(active) });
          return ack?.({ error: 'A call is already in progress in this chat.' });
        }

        const others = memberIds(conversationId).filter((id) => id !== userId);
        if (!others.length) return ack?.({ error: 'There is nobody else in this conversation to call.' });

        const callId = uid();
        const createdAt = now();
        const participants = new Map();
        participants.set(userId, {
          status: 'accepted',
          joinedAt: createdAt,
          media: { audio: true, video: kind === 'video', screen: false },
        });
        for (const id of others) {
          participants.set(id, { status: 'invited', joinedAt: null, media: { audio: true, video: false, screen: false } });
        }
        const call = {
          id: callId,
          conversationId,
          kind,
          initiatorId: userId,
          status: 'ringing',
          startedAt: createdAt,
          answeredAt: null,
          participants,
          finished: false,
          timer: null,
        };
        calls.set(callId, call);

        db.prepare(
          `INSERT INTO calls (id, conversation_id, initiator_id, kind, status, started_at)
           VALUES (?, ?, ?, ?, 'ringing', ?)`,
        ).run(callId, conversationId, userId, kind, createdAt);
        db.prepare(
          `INSERT INTO call_participants (call_id, user_id, status, joined_at) VALUES (?, ?, 'accepted', ?)`,
        ).run(callId, userId, createdAt);
        for (const id of others) {
          db.prepare(
            `INSERT INTO call_participants (call_id, user_id, status) VALUES (?, ?, 'invited')`,
          ).run(callId, id);
        }

        const caller = getUserById(userId);
        for (const id of others) {
          const otherConvTitle = conversationTitle(conv, id);
          emitToUser(id, 'call:incoming', {
            call: callState(call),
            conversation: {
              id: conv.id,
              type: conv.type,
              name: conv.name,
              title: otherConvTitle,
              avatarColor: conv.avatar_color,
            },
            caller: publicUser(caller),
          });
        }

        call.timer = setTimeout(() => {
          if (!call.finished && acceptedCount(call) <= 1) finishCall(call, { reason: 'missed' });
        }, RING_TIMEOUT_MS);

        ack?.({ ok: true, call: callState(call) });
      } catch (err) {
        console.error('[lantern] call:invite failed', err);
        ack?.({ error: 'The call could not be started.' });
      }
    });

    socket.on('call:accept', (data, ack) => {
      const call = calls.get(String(data?.callId || ''));
      if (!call || call.finished) return ack?.({ error: 'This call has already ended.' });
      const p = call.participants.get(userId);
      if (!p) return ack?.({ error: 'You were not invited to this call.' });
      if (p.status === 'accepted') return ack?.({ ok: true, call: callState(call) });
      if (acceptedCount(call) >= MAX_CALL_PARTICIPANTS) {
        return ack?.({ error: `This call is full (${MAX_CALL_PARTICIPANTS} people max).` });
      }
      p.status = 'accepted';
      p.joinedAt = now();
      p.media = { audio: true, video: call.kind === 'video', screen: false };
      if (!call.answeredAt) call.answeredAt = p.joinedAt;
      call.status = 'active';
      clearTimeout(call.timer);
      db.prepare(`UPDATE call_participants SET status = 'accepted', joined_at = ? WHERE call_id = ? AND user_id = ?`).run(
        p.joinedAt,
        call.id,
        userId,
      );
      db.prepare(`UPDATE calls SET status = 'active', answered_at = COALESCE(answered_at, ?) WHERE id = ?`).run(
        p.joinedAt,
        call.id,
      );

      const state = callState(call);
      const joiner = getUserById(userId);
      emitToUser(userId, 'call:joined', { call: state });
      for (const [otherId, otherP] of call.participants) {
        if (otherId === userId || otherP.status !== 'accepted') continue;
        emitToUser(otherId, 'call:peer-joined', {
          callId: call.id,
          userId,
          name: joiner?.name || 'Someone',
          media: p.media,
        });
      }
      ack?.({ ok: true, call: state });
    });

    socket.on('call:reject', (data, ack) => {
      const call = calls.get(String(data?.callId || ''));
      if (!call || call.finished) return ack?.({ ok: true });
      const p = call.participants.get(userId);
      if (!p) return ack?.({ error: 'You were not invited to this call.' });
      p.status = 'rejected';
      db.prepare(`UPDATE call_participants SET status = 'rejected', left_at = ? WHERE call_id = ? AND user_id = ?`).run(
        now(),
        call.id,
        userId,
      );
      for (const otherId of callParticipantUserIds(call)) {
        if (otherId === userId) continue;
        emitToUser(otherId, 'call:peer-rejected', {
          callId: call.id,
          userId,
          name: getUserById(userId)?.name || 'Someone',
        });
      }
      const remaining = [...call.participants.values()].filter((x) => x.status === 'invited').length;
      if (acceptedCount(call) <= 1 && remaining === 0) {
        const conv = getConversation(call.conversationId);
        finishCall(call, { reason: conv?.type === 'dm' ? 'rejected' : 'missed' });
      }
      ack?.({ ok: true });
    });

    socket.on('call:end', (data, ack) => {
      const call = calls.get(String(data?.callId || ''));
      if (!call || call.finished) return ack?.({ ok: true });
      const participant = call.participants.get(userId);
      if (!participant) return ack?.({ error: 'You are not part of this call.' });

      // In a group call hanging up only removes you; the other participants stay.
      if (participant.status === 'accepted' && acceptedCount(call) > 2) {
        participant.status = 'left';
        db.prepare(`UPDATE call_participants SET status = 'left', left_at = ? WHERE call_id = ? AND user_id = ?`).run(
          now(),
          call.id,
          userId,
        );
        for (const [otherId, otherP] of call.participants) {
          if (otherId === userId || otherP.status !== 'accepted') continue;
          emitToUser(otherId, 'call:peer-left', { callId: call.id, userId, reason: 'left' });
        }
        return ack?.({ ok: true, left: true });
      }

      finishCall(call, { reason: 'ended' });
      ack?.({ ok: true });
    });

    socket.on('call:media', (data) => {
      const call = calls.get(String(data?.callId || ''));
      if (!call || call.finished) return;
      const p = call.participants.get(userId);
      if (!p || p.status !== 'accepted') return;
      p.media = {
        audio: !!data?.audio,
        video: !!data?.video,
        screen: !!data?.screen,
      };
      for (const [otherId, otherP] of call.participants) {
        if (otherId === userId || otherP.status !== 'accepted') continue;
        emitToUser(otherId, 'call:media', { callId: call.id, userId, media: p.media });
      }
    });

    socket.on('rtc:offer', (data) => relayRtc(socket, data, 'rtc:offer'));
    socket.on('rtc:answer', (data) => relayRtc(socket, data, 'rtc:answer'));
    socket.on('rtc:ice', (data) => relayRtc(socket, data, 'rtc:ice'));

    function relayRtc(sock, data, event) {
      const call = calls.get(String(data?.callId || ''));
      if (!call || call.finished) return;
      const target = String(data?.to || '');
      const me = call.participants.get(userId);
      const them = call.participants.get(target);
      if (!me || !them || me.status !== 'accepted' || them.status !== 'accepted') return;
      const payload = { callId: call.id, from: userId };
      if (event === 'rtc:ice') {
        const candidate = data?.candidate;
        if (!candidate || typeof candidate.candidate !== 'string' || candidate.candidate.length > 5000) return;
        payload.candidate = candidate;
      } else {
        const sdp = data?.sdp;
        if (
          !sdp ||
          typeof sdp !== 'object' ||
          typeof sdp.sdp !== 'string' ||
          !sdp.sdp ||
          sdp.sdp.length > 200_000
        ) {
          return;
        }
        payload.sdp = sdp;
      }
      emitToUser(target, event, payload);
    }

    /* -------- cleanup -------- */
    socket.on('disconnect', () => {
      const lastSocket = removeConnection(userId, socket.id);
      if (lastSocket) {
        const at = now();
        touchUserSeen(userId, at);
        const fresh = getUserById(userId);
        io.emit('presence', { userId, online: false, status: fresh?.status || 'online', lastSeen: at });

        for (const call of [...calls.values()]) {
          const p = call.participants.get(userId);
          if (!p || call.finished) continue;
          if (p.status === 'accepted') {
            p.status = 'left';
            db.prepare(`UPDATE call_participants SET status = 'left', left_at = ? WHERE call_id = ? AND user_id = ?`).run(
              now(),
              call.id,
              userId,
            );
            for (const [otherId, otherP] of call.participants) {
              if (otherId === userId || otherP.status !== 'accepted') continue;
              emitToUser(otherId, 'call:peer-left', { callId: call.id, userId, reason: 'disconnected' });
            }
            if (acceptedCount(call) === 0) finishCall(call, { reason: 'ended' });
          } else if (p.status === 'invited') {
            p.status = 'missed';
            db.prepare(`UPDATE call_participants SET status = 'missed', left_at = ? WHERE call_id = ? AND user_id = ?`).run(
              now(),
              call.id,
              userId,
            );
            const remaining = [...call.participants.values()].filter((x) => x.status === 'invited').length;
            if (acceptedCount(call) <= 1 && remaining === 0) finishCall(call, { reason: 'missed' });
          }
        }
      }
    });
  });

  return io;
}
