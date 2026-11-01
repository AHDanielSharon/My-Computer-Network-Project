import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import QRCode from 'qrcode';
import {
  AVATARS_DIR,
  FILES_DIR,
  MAX_UPLOAD_BYTES,
  TMP_DIR,
  VERSION,
  USE_HTTPS,
} from './config.js';
import { requireAuth, createSession, deleteSession, hashToken } from './auth.js';
import {
  db,
  now,
  uid,
  publicUser,
  getUserById,
  getUserByNameKey,
  listUsers,
  normalizeName,
  addMember,
  isMember,
  memberRow,
  memberIds,
  getConversation,
  createDm,
  serializeConversation,
  listConversationsFor,
  serializeMessages,
  listMessages,
  createMessage,
  getMessageById,
  markRead,
  setMuted,
  ensureDefaultGroup,
  conversationTitle,
  listPinned,
  recentFiles,
  callHistory,
  searchMessages,
  serializeFile,
  touchUserSeen,
} from './db.js';
import { emitToUser, joinUserToConversation, getIo, disconnectTokenSockets } from './io.js';
import { inviteUrls, primaryUrl } from './network.js';
import { isOnline } from './presence.js';

const AVATAR_TYPES = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};
const AVATAR_MIME = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_DIR),
    filename: (_req, _file, cb) => cb(null, `${uid()}.part`),
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TMP_DIR),
    filename: (_req, _file, cb) => cb(null, `${uid()}.part`),
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (AVATAR_TYPES[file.mimetype]) cb(null, true);
    else cb(new Error('Please choose a JPG, PNG, WEBP or GIF image.'));
  },
});

const joinAttempts = new Map();

function joinRateLimited(ip) {
  const ts = now();
  let arr = joinAttempts.get(ip) || [];
  arr = arr.filter((t) => ts - t < 10 * 60_000);
  arr.push(ts);
  joinAttempts.set(ip, arr);
  if (joinAttempts.size > 200) {
    for (const [key, list] of joinAttempts) if (!list.some((t) => ts - t < 10 * 60_000)) joinAttempts.delete(key);
  }
  return arr.length > 12;
}

function cleanName(value) {
  const name = normalizeName(value);
  if (name.length < 2) return { error: 'Please use a display name with at least 2 characters.' };
  if (name.length > 24) return { error: 'Display names can be at most 24 characters.' };
  if (!/^[\p{L}\p{N}][\p{L}\p{N} ._'’-]*$/u.test(name)) {
    return { error: 'Use letters, numbers, spaces, dots, dashes or apostrophes in your name.' };
  }
  return { name };
}

function cleanAbout(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 160);
}

function safeOriginalName(name) {
  let out = String(name || 'file')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/]/g, '-')
    .trim();
  out = out.replace(/^\.+/, '');
  if (!out) out = 'file';
  if (out.length > 180) {
    const ext = path.extname(out).slice(0, 12);
    out = out.slice(0, 180 - ext.length) + ext;
  }
  return out;
}

function storedExtension(originalName, mime) {
  const map = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
    'image/avif': '.avif',
    'image/heic': '.heic',
    'image/heif': '.heif',
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'audio/webm': '.webm',
    'audio/ogg': '.ogg',
    'audio/mpeg': '.mp3',
    'audio/mp4': '.m4a',
    'audio/x-m4a': '.m4a',
    'audio/wav': '.wav',
    'audio/x-wav': '.wav',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/zip': '.zip',
  };
  if (map[mime]) return map[mime];
  const fromName = path.extname(originalName).toLowerCase();
  if (/^\.[a-z0-9]{1,12}$/.test(fromName)) return fromName;
  return '.bin';
}

const KNOWN_UPLOAD_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-matroska',
  'audio/webm',
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/wav',
  'audio/x-wav',
  'application/pdf',
  'text/plain',
  'application/zip',
  'application/octet-stream',
]);

// Browsers choose Content-Type from the file name, so it cannot be trusted.
// Sniff common binary signatures and force everything else to a non-inline type.
function inspectUpload(filePath, originalName, declaredMime) {
  let head = Buffer.alloc(0);
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(32);
    const read = fs.readSync(fd, buffer, 0, buffer.length, 0);
    head = buffer.subarray(0, read);
  } catch {
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd);
      } catch {}
    }
  }

  const ascii = head.toString('latin1');
  let sniffed = null;
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) sniffed = 'image/jpeg';
  else if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    sniffed = 'image/png';
  } else if (head.length >= 6 && (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a'))) sniffed = 'image/gif';
  else if (head.length >= 12 && ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') sniffed = 'image/webp';
  else if (head.length >= 12 && ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (brand === 'avif' || brand === 'avis') sniffed = 'image/avif';
    else if (brand.startsWith('hei') || brand.startsWith('hev') || brand === 'mif1' || brand === 'msf1') {
      sniffed = 'image/heic';
    }
  }

  let mime = String(declaredMime || '').toLowerCase().split(';')[0].trim();
  if (sniffed) mime = sniffed;
  else if (head.subarray(0, 5).toString('latin1') === '%PDF-') mime = 'application/pdf';
  else if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b) mime = 'application/zip';
  else if (mime.startsWith('image/')) mime = 'application/octet-stream';
  else if (!KNOWN_UPLOAD_MIMES.has(mime)) mime = 'application/octet-stream';

  let kind = 'file';
  if (mime.startsWith('image/')) kind = 'image';
  else if (mime.startsWith('video/')) kind = 'video';
  else if (mime.startsWith('audio/')) kind = 'audio';

  return { mime, kind, ext: storedExtension(originalName, mime) };
}

function emitConversationNew(conversationId) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  for (const userId of memberIds(conversationId)) {
    joinUserToConversation(conversationId, userId);
    emitToUser(userId, 'conversation:new', { conversation: serializeConversation(conv, userId) });
  }
}

function emitConversationUpdated(conversationId, onlyUserId = null) {
  const conv = getConversation(conversationId);
  if (!conv) return;
  const ids = onlyUserId ? [onlyUserId] : memberIds(conversationId);
  for (const userId of ids) {
    emitToUser(userId, 'conversation:updated', { conversation: serializeConversation(conv, userId) });
  }
}

function emitConversationRemoved(conversationId, userId) {
  emitToUser(userId, 'conversation:removed', { conversationId });
  getIo()?.in(`user:${userId}`).socketsLeave(`conv:${conversationId}`);
}

function emitMessage(row) {
  const message = serializeMessages([row], row.sender_id)[0];
  getIo()?.to(`conv:${row.conversation_id}`).emit('message:new', { message });
  return message;
}

function systemMessage(conversationId, actorId, body) {
  const row = createMessage({ conversationId, senderId: actorId, type: 'system', body });
  return emitMessage(row);
}

export function initApi(app) {
  app.use(express.json({ limit: '3mb' }));
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), display-capture=(self)');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true, app: 'lantern', time: now() }));

  app.get('/api/info', async (req, res) => {
    const urls = inviteUrls();
    const primary = primaryUrl();
    const options = { margin: 1, width: 420, color: { dark: '#1b140c', light: '#ffffff' } };
    const qrs = [];
    for (const entry of urls) {
      if (entry.label === 'localhost') continue;
      try {
        qrs.push({ url: entry.url, qr: await QRCode.toDataURL(entry.url, options) });
      } catch {}
    }
    const qr = qrs.find((entry) => entry.url === primary)?.qr || qrs[0]?.qr || null;
    res.json({
      app: 'Lantern',
      version: VERSION,
      https: USE_HTTPS,
      urls,
      primaryUrl: primary,
      qr,
      qrs,
      time: now(),
    });
  });

  /* ------------------------------- auth ------------------------------- */

  app.post('/api/join', (req, res) => {
    try {
      const ip = req.ip || 'unknown';
      if (joinRateLimited(ip)) {
        return res.status(429).json({ error: 'Too many join attempts from this device. Please wait a moment.' });
      }
      const { name, error } = cleanName(req.body?.name);
      if (error) return res.status(400).json({ error });
      const nameKey = name.toLocaleLowerCase();
      const deviceKey = typeof req.body?.deviceKey === 'string' ? req.body.deviceKey.slice(0, 200) : '';
      const reclaimHash = deviceKey.length >= 24 ? hashToken(deviceKey) : null;
      const existing = getUserByNameKey(nameKey);

      if (existing) {
        // A name stays reserved unless the same browser proves it owns the
        // account with the device key issued at first join.
        if (reclaimHash && existing.reclaim_hash === reclaimHash) {
          const general = ensureDefaultGroup();
          addMember(general.id, existing.id, 'member');
          const token = createSession(existing.id, req.headers['user-agent'] || '');
          touchUserSeen(existing.id);
          return res.json({
            token,
            user: publicUser(existing),
            conversation: serializeConversation(general, existing.id),
            rejoined: true,
          });
        }
        return res.status(409).json({ error: `“${name}” is already taken on this network. Try another name.` });
      }
      const avatarColor = /^#[0-9a-f]{6}$/i.test(req.body?.avatarColor) ? req.body.avatarColor : '#f59e0b';
      const about = cleanAbout(req.body?.about);
      const id = uid();
      const ts = now();
      db.prepare(
        `INSERT INTO users (id, name, name_key, about, avatar_color, status, last_seen, created_at, reclaim_hash)
         VALUES (?, ?, ?, ?, ?, 'online', ?, ?, ?)`,
      ).run(id, name, nameKey, about, avatarColor, ts, ts, reclaimHash);

      const general = ensureDefaultGroup();
      addMember(general.id, id, 'member');

      const token = createSession(id, req.headers['user-agent'] || '');
      const userRow = getUserById(id);
      getIo()?.emit('user:updated', { user: publicUser(userRow) });
      emitConversationUpdated(general.id);

      res.json({
        token,
        user: publicUser(userRow),
        conversation: serializeConversation(general, id),
      });
    } catch (err) {
      console.error('[lantern] join failed', err);
      res.status(500).json({ error: 'Could not join the network. Please try again.' });
    }
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: publicUser(req.user) });
  });

  app.post('/api/logout', requireAuth, async (req, res) => {
    const tokenHash = hashToken(req.token);
    deleteSession(req.token);
    await disconnectTokenSockets(tokenHash);
    res.json({ ok: true });
  });

  app.get('/api/bootstrap', requireAuth, (req, res) => {
    const userId = req.user.id;
    res.json({
      user: publicUser(req.user),
      users: listUsers(),
      conversations: listConversationsFor(userId),
      callHistory: callHistory(userId, 60),
      recentFiles: recentFiles(userId, 40),
      server: {
        https: USE_HTTPS,
        urls: inviteUrls(),
        primaryUrl: primaryUrl(),
      },
    });
  });

  app.get('/api/users', requireAuth, (req, res) => {
    res.json({ users: listUsers() });
  });

  app.patch('/api/me', requireAuth, (req, res) => {
    const userId = req.user.id;
    const updates = [];
    const values = [];
    if (req.body?.name !== undefined) {
      const { name, error } = cleanName(req.body.name);
      if (error) return res.status(400).json({ error });
      const key = name.toLocaleLowerCase();
      const clash = getUserByNameKey(key);
      if (clash && clash.id !== userId) {
        return res.status(409).json({ error: `“${name}” is already taken on this network.` });
      }
      updates.push('name = ?', 'name_key = ?');
      values.push(name, key);
    }
    if (req.body?.about !== undefined) {
      updates.push('about = ?');
      values.push(cleanAbout(req.body.about));
    }
    if (req.body?.avatarColor !== undefined && /^#[0-9a-f]{6}$/i.test(req.body.avatarColor)) {
      updates.push('avatar_color = ?');
      values.push(req.body.avatarColor);
    }
    if (req.body?.status !== undefined && ['online', 'busy'].includes(req.body.status)) {
      updates.push('status = ?');
      values.push(req.body.status);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const user = publicUser(getUserById(userId));
    getIo()?.emit('user:updated', { user });
    res.json({ user });
  });

  app.post('/api/me/avatar', requireAuth, (req, res) => {
    avatarUpload.single('avatar')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Could not upload that image.' });
      }
      if (!req.file) return res.status(400).json({ error: 'Choose an image to upload.' });
      try {
        const ext = AVATAR_TYPES[req.file.mimetype];
        if (!ext) {
          fs.unlinkSync(req.file.path);
          return res.status(400).json({ error: 'Please choose a JPG, PNG, WEBP or GIF image.' });
        }
        const fileName = `${uid()}${ext}`;
        fs.renameSync(req.file.path, path.join(AVATARS_DIR, fileName));
        const existing = getUserById(req.user.id);
        if (existing?.avatar_file) {
          try {
            fs.unlinkSync(path.join(AVATARS_DIR, existing.avatar_file));
          } catch {}
        }
        db.prepare(`UPDATE users SET avatar_file = ? WHERE id = ?`).run(fileName, req.user.id);
        const user = publicUser(getUserById(req.user.id));
        getIo()?.emit('user:updated', { user });
        res.json({ user });
      } catch (e) {
        console.error('[lantern] avatar upload failed', e);
        try {
          if (req.file?.path) fs.unlinkSync(req.file.path);
        } catch {}
        res.status(500).json({ error: 'Could not save that image.' });
      }
    });
  });

  app.delete('/api/me/avatar', requireAuth, (req, res) => {
    const existing = getUserById(req.user.id);
    if (existing?.avatar_file) {
      try {
        fs.unlinkSync(path.join(AVATARS_DIR, existing.avatar_file));
      } catch {}
    }
    db.prepare(`UPDATE users SET avatar_file = NULL WHERE id = ?`).run(req.user.id);
    const user = publicUser(getUserById(req.user.id));
    getIo()?.emit('user:updated', { user });
    res.json({ user });
  });

  app.get('/api/avatars/:userId', requireAuth, (req, res) => {
    const user = getUserById(req.params.userId);
    if (!user?.avatar_file) return res.status(404).end();
    const ext = path.extname(user.avatar_file).toLowerCase();
    const mime = AVATAR_MIME[ext] || 'image/jpeg';
    const filePath = path.join(AVATARS_DIR, path.basename(user.avatar_file));
    if (!fs.existsSync(filePath)) return res.status(404).end();
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.sendFile(filePath);
  });

  /* --------------------------- conversations --------------------------- */

  app.post('/api/conversations/dm', requireAuth, (req, res) => {
    const targetId = String(req.body?.userId || '');
    const target = getUserById(targetId);
    if (!target) return res.status(404).json({ error: 'That person is no longer on the network.' });
    if (targetId === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });
    const conv = createDm(req.user.id, targetId);
    const existing = memberIds(conv.id);
    if (existing.length === 2) emitConversationNew(conv.id);
    res.json({ conversation: serializeConversation(conv, req.user.id) });
  });

  app.post('/api/conversations/group', requireAuth, (req, res) => {
    const rawName = String(req.body?.name || '').trim().replace(/\s+/g, ' ').slice(0, 50);
    if (rawName.length < 2) return res.status(400).json({ error: 'Give your group a name with at least 2 characters.' });
    const requested = Array.isArray(req.body?.memberIds) ? req.body.memberIds : [];
    const ids = [...new Set(requested.map(String))].filter(
      (id) => id !== req.user.id && getUserById(id),
    );
    if (!ids.length) return res.status(400).json({ error: 'Pick at least one person for the group.' });

    const id = uid();
    const color = /^#[0-9a-f]{6}$/i.test(req.body?.avatarColor) ? req.body.avatarColor : '#f59e0b';
    db.prepare(
      `INSERT INTO conversations (id, type, name, avatar_color, created_by, created_at) VALUES (?, 'group', ?, ?, ?, ?)`,
    ).run(id, rawName, color, req.user.id, now());
    addMember(id, req.user.id, 'admin');
    for (const memberId of ids) addMember(id, memberId);
    systemMessage(id, req.user.id, `${req.user.name} created “${rawName}”.`);
    emitConversationNew(id);
    res.json({ conversation: serializeConversation(getConversation(id), req.user.id) });
  });

  app.get('/api/conversations/:id', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ conversation: serializeConversation(conv, req.user.id) });
  });

  app.patch('/api/conversations/:id', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    if (conv.type !== 'group') return res.status(400).json({ error: 'Direct messages cannot be edited.' });
    const membership = memberRow(conv.id, req.user.id);
    if (membership?.role !== 'admin') return res.status(403).json({ error: 'Only group admins can do that.' });

    const updates = [];
    const values = [];
    if (req.body?.name !== undefined) {
      const name = String(req.body.name).trim().replace(/\s+/g, ' ').slice(0, 50);
      if (name.length < 2) return res.status(400).json({ error: 'Group names need at least 2 characters.' });
      updates.push('name = ?');
      values.push(name);
    }
    if (req.body?.announcement !== undefined) {
      updates.push('announcement = ?');
      values.push(String(req.body.announcement || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 500));
    }
    if (req.body?.avatarColor !== undefined && /^#[0-9a-f]{6}$/i.test(req.body.avatarColor)) {
      updates.push('avatar_color = ?');
      values.push(req.body.avatarColor);
    }
    if (!updates.length) return res.status(400).json({ error: 'Nothing to update.' });
    values.push(conv.id);
    db.prepare(`UPDATE conversations SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    if (req.body?.announcement !== undefined) {
      systemMessage(conv.id, req.user.id, `${req.user.name} updated the group announcement.`);
    }
    emitConversationUpdated(conv.id);
    res.json({ conversation: serializeConversation(getConversation(conv.id), req.user.id) });
  });

  app.post('/api/conversations/:id/members', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    if (conv.type !== 'group') return res.status(400).json({ error: 'You can only add people to groups.' });
    const requested = Array.isArray(req.body?.userIds)
      ? req.body.userIds
      : req.body?.userId
        ? [req.body.userId]
        : [];
    const existing = new Set(memberIds(conv.id));
    const added = [];
    for (const raw of requested) {
      const id = String(raw);
      if (existing.has(id) || !getUserById(id)) continue;
      addMember(conv.id, id);
      existing.add(id);
      added.push(id);
    }
    if (!added.length) return res.status(400).json({ error: 'Those people are already in the group.' });
    const names = added.map((id) => getUserById(id)?.name).filter(Boolean).join(', ');
    systemMessage(conv.id, req.user.id, `${req.user.name} added ${names}.`);
    for (const id of added) {
      joinUserToConversation(conv.id, id);
      emitToUser(id, 'conversation:new', {
        conversation: serializeConversation(getConversation(conv.id), id),
      });
    }
    emitConversationUpdated(conv.id);
    res.json({ conversation: serializeConversation(getConversation(conv.id), req.user.id) });
  });

  app.delete('/api/conversations/:id/members/:userId', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    if (conv.type !== 'group') return res.status(400).json({ error: 'Direct messages cannot be left.' });
    if (conv.is_default) return res.status(400).json({ error: 'Everyone on this network stays in General.' });
    const targetId = String(req.params.userId);
    if (!isMember(conv.id, targetId)) return res.status(404).json({ error: 'That person is not in this group.' });
    const mine = memberRow(conv.id, req.user.id);
    const leavingSelf = targetId === req.user.id;
    if (!leavingSelf && mine?.role !== 'admin') {
      return res.status(403).json({ error: 'Only group admins can remove other members.' });
    }
    const target = getUserById(targetId);
    db.prepare(`DELETE FROM members WHERE conversation_id = ? AND user_id = ?`).run(conv.id, targetId);
    emitConversationRemoved(conv.id, targetId);

    const remaining = memberIds(conv.id);
    if (!remaining.length) {
      db.prepare(`DELETE FROM conversations WHERE id = ?`).run(conv.id);
      return res.json({ ok: true, removed: true });
    }
    if (mine?.role === 'admin' && leavingSelf) {
      const next = db
        .prepare(`SELECT user_id FROM members WHERE conversation_id = ? ORDER BY joined_at ASC LIMIT 1`)
        .get(conv.id);
      if (next) db.prepare(`UPDATE members SET role = 'admin' WHERE conversation_id = ? AND user_id = ?`).run(conv.id, next.user_id);
    }
    systemMessage(conv.id, req.user.id, `${target?.name || 'Someone'} ${leavingSelf ? 'left the group' : 'was removed'}.`);
    emitConversationUpdated(conv.id);
    res.json({ ok: true });
  });

  app.patch('/api/conversations/:id/mute', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    setMuted(conv.id, req.user.id, !!req.body?.muted);
    emitConversationUpdated(conv.id, req.user.id);
    res.json({ ok: true, muted: !!req.body?.muted });
  });

  app.post('/api/conversations/:id/read', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    const at = now();
    markRead(conv.id, req.user.id, at);
    getIo()?.to(`conv:${conv.id}`).emit('chat:read', { conversationId: conv.id, userId: req.user.id, at });
    res.json({ ok: true, at });
  });

  app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    const messages = listMessages(conv.id, req.user.id, {
      before: req.query.before ? Number(req.query.before) : undefined,
      around: req.query.around ? Number(req.query.around) : undefined,
      after: req.query.after ? Number(req.query.after) : undefined,
      afterId: req.query.afterId ? String(req.query.afterId) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json({ messages });
  });

  app.get('/api/conversations/:id/pinned', requireAuth, (req, res) => {
    const conv = getConversation(req.params.id);
    if (!conv || !isMember(conv.id, req.user.id)) return res.status(404).json({ error: 'Conversation not found.' });
    res.json({ messages: listPinned(conv.id, req.user.id) });
  });

  /* ------------------------------ uploads ------------------------------ */

  app.post('/api/conversations/:id/upload', requireAuth, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const msg =
          err.code === 'LIMIT_FILE_SIZE'
            ? 'That file is larger than the server allows.'
            : err.message || 'Upload failed.';
        return res.status(400).json({ error: msg });
      }
      if (!req.file) return res.status(400).json({ error: 'No file was received.' });
      const cleanup = () => {
        try {
          fs.unlinkSync(req.file.path);
        } catch {}
      };
      req.on('aborted', cleanup);
      let finalPath = null;
      let fileId = null;
      try {
        const conv = getConversation(req.params.id);
        if (!conv || !isMember(conv.id, req.user.id)) {
          cleanup();
          return res.status(404).json({ error: 'Conversation not found.' });
        }
        const originalName = safeOriginalName(req.file.originalname);
        const inspected = inspectUpload(req.file.path, originalName, req.file.mimetype);
        const mime = inspected.mime;
        const storedName = `${uid()}${inspected.ext}`;
        finalPath = path.join(FILES_DIR, storedName);
        fs.renameSync(req.file.path, finalPath);

        let kind = inspected.kind;
        if (req.body?.kind === 'voice' && kind === 'audio') kind = 'voice';

        const width = Number(req.body?.width);
        const height = Number(req.body?.height);
        const duration = Number(req.body?.duration);
        const caption = String(req.body?.caption || '')
          .replace(/\u0000/g, '')
          .trim()
          .slice(0, 2000);

        fileId = uid();
        let replyTo = null;
        if (req.body?.replyTo) {
          const reply = getMessageById(String(req.body.replyTo));
          if (reply && reply.conversation_id === conv.id) replyTo = reply.id;
        }

        const meta = {
          fileId,
          name: originalName,
          mime,
          size: req.file.size,
          width: Number.isFinite(width) && width > 0 ? Math.round(width) : null,
          height: Number.isFinite(height) && height > 0 ? Math.round(height) : null,
          duration: Number.isFinite(duration) && duration > 0 ? duration : null,
        };

        // Keep the files row and its message in one transaction so a failure
        // cannot leave an orphaned database entry behind.
        db.exec('BEGIN IMMEDIATE');
        let row;
        try {
          db.prepare(
            `INSERT INTO files (id, original_name, stored_name, mime, size, owner_id, conversation_id, width, height, duration, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            fileId,
            originalName,
            storedName,
            mime,
            req.file.size,
            req.user.id,
            conv.id,
            meta.width,
            meta.height,
            meta.duration,
            now(),
          );
          row = createMessage({
            conversationId: conv.id,
            senderId: req.user.id,
            type: kind,
            body: caption || null,
            meta,
            replyTo,
          });
          db.prepare(`UPDATE files SET message_id = ? WHERE id = ?`).run(row.id, fileId);
          db.exec('COMMIT');
        } catch (err) {
          try {
            db.exec('ROLLBACK');
          } catch {}
          throw err;
        }

        const message = emitMessage(row);
        res.json({
          message,
          file: serializeFile(db.prepare(`SELECT * FROM files WHERE id = ?`).get(fileId), req.user.id, conv),
        });
      } catch (e) {
        console.error('[lantern] upload failed', e);
        cleanup();
        if (finalPath) {
          try {
            fs.unlinkSync(finalPath);
          } catch {}
        }
        if (fileId) {
          try {
            db.prepare(`DELETE FROM files WHERE id = ?`).run(fileId);
          } catch {}
        }
        res.status(500).json({ error: 'The file could not be saved. Please try again.' });
      }
    });
  });

  app.get('/api/files/recent', requireAuth, (req, res) => {
    res.json({ files: recentFiles(req.user.id, 100) });
  });

  app.get('/api/files/:id', requireAuth, (req, res) => {
    const file = db.prepare(`SELECT * FROM files WHERE id = ?`).get(req.params.id);
    if (!file) return res.status(404).json({ error: 'File not found.' });
    if (!isMember(file.conversation_id, req.user.id)) {
      return res.status(403).json({ error: 'You do not have access to this file.' });
    }
    const filePath = path.join(FILES_DIR, path.basename(file.stored_name));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'This file is no longer available.' });
    const inlineSafe =
      /^(video|audio)\//i.test(file.mime) ||
      /^image\/(jpeg|png|webp|gif|avif|heic|heif)$/i.test(file.mime);
    const wantsInline = req.query.inline === '1' && inlineSafe;
    const asciiName = file.original_name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', file.mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${wantsInline ? 'inline' : 'attachment'}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
    );
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.sendFile(filePath);
  });

  /* ---------------------------- forwarding ---------------------------- */

  app.post('/api/messages/:id/forward', requireAuth, (req, res) => {
    const message = getMessageById(req.params.id);
    if (!message || message.deleted_at) return res.status(404).json({ error: 'That message is no longer available.' });
    if (!isMember(message.conversation_id, req.user.id)) return res.status(403).json({ error: 'You cannot forward this message.' });
    if (!['text', 'image', 'video', 'audio', 'voice', 'file', 'location'].includes(message.type)) {
      return res.status(400).json({ error: 'This type of message cannot be forwarded.' });
    }
    const targets = [...new Set((Array.isArray(req.body?.conversationIds) ? req.body.conversationIds : []).map(String))]
      .filter((id) => getConversation(id) && isMember(id, req.user.id))
      .slice(0, 20);
    if (!targets.length) return res.status(400).json({ error: 'Choose at least one chat to forward to.' });

    const sourceSender = getUserById(message.sender_id);
    const originalFile = db.prepare(`SELECT * FROM files WHERE message_id = ?`).get(message.id);
    let originalMeta = null;
    try {
      originalMeta = message.metadata ? JSON.parse(message.metadata) : null;
    } catch {}
    const forwarded = [];

    for (const conversationId of targets) {
      let meta = originalMeta;
      if (originalFile) {
        const sourcePath = path.join(FILES_DIR, path.basename(originalFile.stored_name));
        if (!fs.existsSync(sourcePath)) continue;
        const newFileId = uid();
        const newStored = `${uid()}${path.extname(originalFile.stored_name) || storedExtension(originalFile.original_name, originalFile.mime)}`;
        const dest = path.join(FILES_DIR, newStored);
        fs.copyFileSync(sourcePath, dest);
        db.prepare(
          `INSERT INTO files (id, original_name, stored_name, mime, size, owner_id, conversation_id, width, height, duration, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          newFileId,
          originalFile.original_name,
          newStored,
          originalFile.mime,
          originalFile.size,
          req.user.id,
          conversationId,
          originalFile.width,
          originalFile.height,
          originalFile.duration,
          now(),
        );
        meta = {
          ...originalMeta,
          fileId: newFileId,
          name: originalFile.original_name,
          mime: originalFile.mime,
          size: originalFile.size,
          width: originalFile.width,
          height: originalFile.height,
          duration: originalFile.duration,
        };
        originalMeta = originalMeta || meta;
        const row = createMessage({
          conversationId,
          senderId: req.user.id,
          type: message.type,
          body: message.body,
          meta,
          forwardedFrom: message.forwarded_from || sourceSender?.name || 'Someone',
        });
        db.prepare(`UPDATE files SET message_id = ? WHERE id = ?`).run(row.id, newFileId);
        forwarded.push(emitMessage(row));
      } else {
        const row = createMessage({
          conversationId,
          senderId: req.user.id,
          type: message.type,
          body: message.body,
          meta,
          forwardedFrom: message.forwarded_from || sourceSender?.name || 'Someone',
        });
        forwarded.push(emitMessage(row));
      }
    }
    res.json({ forwarded: forwarded.length, messages: forwarded });
  });

  /* ------------------------------ misc ------------------------------ */

  app.get('/api/calls', requireAuth, (req, res) => {
    res.json({ calls: callHistory(req.user.id, 100) });
  });

  app.get('/api/search', requireAuth, (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 2) return res.status(400).json({ error: 'Type at least 2 characters to search.' });
    const convId = req.query.conversationId ? String(req.query.conversationId) : null;
    if (convId && !isMember(convId, req.user.id)) return res.status(403).json({ error: 'You cannot search that chat.' });
    res.json({ results: searchMessages(req.user.id, q, convId) });
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found.' });
  });

  app.use((err, req, res, _next) => {
    console.error('[lantern] api error', err);
    if (res.headersSent) return;
    res.status(500).json({ error: 'Something went wrong on the server.' });
  });
}
