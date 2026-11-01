import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DATA_DIR } from './config.js';
import { isOnline } from './presence.js';

export const db = new DatabaseSync(path.join(DATA_DIR, 'lantern.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_key TEXT NOT NULL UNIQUE,
    about TEXT NOT NULL DEFAULT '',
    avatar_file TEXT,
    avatar_color TEXT NOT NULL DEFAULT '#f59e0b',
    status TEXT NOT NULL DEFAULT 'online',
    last_seen INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('dm','group')),
    name TEXT,
    avatar_color TEXT,
    announcement TEXT,
    created_by TEXT,
    created_at INTEGER NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    dm_key TEXT UNIQUE
  );

  CREATE TABLE IF NOT EXISTS members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    last_read_at INTEGER NOT NULL DEFAULT 0,
    muted INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (conversation_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id);

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT NOT NULL REFERENCES users(id),
    type TEXT NOT NULL DEFAULT 'text',
    body TEXT,
    metadata TEXT,
    reply_to TEXT,
    forwarded_from TEXT,
    edited_at INTEGER,
    deleted_at INTEGER,
    pinned_at INTEGER,
    pinned_by TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

  CREATE TABLE IF NOT EXISTS reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (message_id, user_id, emoji)
  );

  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    message_id TEXT,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    mime TEXT NOT NULL,
    size INTEGER NOT NULL,
    owner_id TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration REAL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_files_conversation ON files(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS calls (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    initiator_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    answered_at INTEGER,
    ended_at INTEGER,
    duration INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_calls_conversation ON calls(conversation_id, started_at);

  CREATE TABLE IF NOT EXISTS call_participants (
    call_id TEXT NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT NOT NULL,
    joined_at INTEGER,
    left_at INTEGER,
    PRIMARY KEY (call_id, user_id)
  );
`);

const userColumns = db.prepare(`PRAGMA table_info(users)`).all().map((column) => column.name);
if (!userColumns.includes('reclaim_hash')) {
  db.exec(`ALTER TABLE users ADD COLUMN reclaim_hash TEXT`);
}

export const now = () => Date.now();
export const uid = () => randomUUID();

export function normalizeName(name) {
  return String(name || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    about: row.about || '',
    avatarFile: row.avatar_file || null,
    avatarColor: row.avatar_color || '#f59e0b',
    status: row.status || 'online',
    online: isOnline(row.id),
    lastSeen: row.last_seen,
    createdAt: row.created_at,
  };
}

export function getUserById(id) {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) || null;
}

export function getUserByNameKey(key) {
  return db.prepare(`SELECT * FROM users WHERE name_key = ?`).get(key) || null;
}

export function listUsers() {
  return db.prepare(`SELECT * FROM users ORDER BY name COLLATE NOCASE ASC`).all().map(publicUser);
}

export function touchUserSeen(userId, at = now()) {
  db.prepare(`UPDATE users SET last_seen = ? WHERE id = ?`).run(at, userId);
}

export function setUserStatus(userId, status) {
  if (!['online', 'busy'].includes(status)) return;
  db.prepare(`UPDATE users SET status = ? WHERE id = ?`).run(status, userId);
}

/* ---------------- conversations & membership ---------------- */

export function isMember(conversationId, userId) {
  return !!db
    .prepare(`SELECT 1 AS ok FROM members WHERE conversation_id = ? AND user_id = ?`)
    .get(conversationId, userId);
}

export function memberRow(conversationId, userId) {
  return (
    db.prepare(`SELECT * FROM members WHERE conversation_id = ? AND user_id = ?`).get(conversationId, userId) ||
    null
  );
}

export function addMember(conversationId, userId, role = 'member') {
  db.prepare(
    `INSERT OR IGNORE INTO members (conversation_id, user_id, role, joined_at, last_read_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(conversationId, userId, role, now(), now());
}

export function getConversation(conversationId) {
  return db.prepare(`SELECT * FROM conversations WHERE id = ?`).get(conversationId) || null;
}

export function conversationMembers(conversationId) {
  return db
    .prepare(
      `SELECT u.*, m.role, m.last_read_at, m.joined_at, m.muted
       FROM members m JOIN users u ON u.id = m.user_id
       WHERE m.conversation_id = ?
       ORDER BY (m.role = 'admin') DESC, u.name COLLATE NOCASE ASC`,
    )
    .all(conversationId);
}

export function memberIds(conversationId) {
  return db
    .prepare(`SELECT user_id FROM members WHERE conversation_id = ?`)
    .all(conversationId)
    .map((r) => r.user_id);
}

export function getDefaultGroup() {
  return db.prepare(`SELECT * FROM conversations WHERE is_default = 1 LIMIT 1`).get() || null;
}

export function ensureDefaultGroup() {
  let group = getDefaultGroup();
  if (!group) {
    const id = uid();
    db.prepare(
      `INSERT INTO conversations (id, type, name, avatar_color, announcement, created_by, created_at, is_default)
       VALUES (?, 'group', 'General', '#f59e0b', 'Welcome to the neighbourhood. Everyone on this Wi-Fi is here.', NULL, ?, 1)`,
    ).run(id, now());
    group = getConversation(id);
  }
  return group;
}

export function findDm(userA, userB) {
  const key = [userA, userB].sort().join(':');
  return db.prepare(`SELECT * FROM conversations WHERE dm_key = ?`).get(key) || null;
}

export function createDm(userA, userB) {
  const key = [userA, userB].sort().join(':');
  const existing = findDm(userA, userB);
  if (existing) return existing;
  const id = uid();
  try {
    db.prepare(
      `INSERT INTO conversations (id, type, created_at, dm_key) VALUES (?, 'dm', ?, ?)`,
    ).run(id, now(), key);
  } catch (err) {
    // Another request may have created the same DM between the lookup and insert.
    const raced = db.prepare(`SELECT * FROM conversations WHERE dm_key = ?`).get(key);
    if (raced) return raced;
    throw err;
  }
  addMember(id, userA);
  addMember(id, userB);
  return getConversation(id);
}

export function conversationTitle(conv, viewerId) {
  if (!conv) return 'Conversation';
  if (conv.type === 'group') return conv.name || 'Group';
  const other = conversationMembers(conv.id).find((m) => m.id !== viewerId);
  return other?.name || 'Direct message';
}

export function listConversationsFor(userId) {
  const rows = db
    .prepare(
      `SELECT c.* FROM conversations c
       JOIN members m ON m.conversation_id = c.id AND m.user_id = ?
       ORDER BY COALESCE((SELECT MAX(created_at) FROM messages WHERE conversation_id = c.id), c.created_at) DESC`,
    )
    .all(userId);
  return rows.map((row) => serializeConversation(row, userId));
}

export function serializeConversation(conv, viewerId) {
  const rows = conversationMembers(conv.id);
  const members = rows.map((r) => ({
    ...publicUser(r),
    role: r.role,
    lastReadAt: r.last_read_at,
    joinedAt: r.joined_at,
  }));
  const mine = rows.find((r) => r.id === viewerId);
  const lastRow =
    db
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`)
      .get(conv.id) || null;
  const lastMessage = lastRow ? serializeMessages([lastRow], viewerId)[0] : null;
  const unread = db
    .prepare(
      `SELECT COUNT(*) AS n FROM messages
       WHERE conversation_id = ? AND sender_id <> ? AND deleted_at IS NULL AND created_at > ?`,
    )
    .get(conv.id, viewerId, mine?.last_read_at ?? 0).n;

  return {
    id: conv.id,
    type: conv.type,
    name: conv.name || null,
    avatarColor: conv.avatar_color || null,
    announcement: conv.announcement || null,
    createdBy: conv.created_by || null,
    createdAt: conv.created_at,
    isDefault: !!conv.is_default,
    members,
    lastMessage,
    unread: Number(unread) || 0,
    muted: !!mine?.muted,
    myRole: mine?.role || 'member',
    lastReadAt: mine?.last_read_at || 0,
  };
}

export function markRead(conversationId, userId, at = now()) {
  db.prepare(
    `UPDATE members SET last_read_at = MAX(last_read_at, ?) WHERE conversation_id = ? AND user_id = ?`,
  ).run(at, conversationId, userId);
}

export function setMuted(conversationId, userId, muted) {
  db.prepare(`UPDATE members SET muted = ? WHERE conversation_id = ? AND user_id = ?`).run(
    muted ? 1 : 0,
    conversationId,
    userId,
  );
}

/* ---------------- messages ---------------- */

export function getMessageById(id) {
  return db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) || null;
}

export function serializeMessages(rows, viewerId) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = ids.map(() => '?').join(',');
  const senderIds = [...new Set(rows.map((r) => r.sender_id).filter(Boolean))];
  const users = new Map();
  if (senderIds.length) {
    const uph = senderIds.map(() => '?').join(',');
    for (const u of db
      .prepare(`SELECT id, name, avatar_color, avatar_file FROM users WHERE id IN (${uph})`)
      .all(...senderIds)) {
      users.set(u.id, u);
    }
  }

  const reactions = new Map();
  if (ids.length) {
    const reactionRows = db
      .prepare(`SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${ph})`)
      .all(...ids);
    for (const r of reactionRows) {
      let byEmoji = reactions.get(r.message_id);
      if (!byEmoji) {
        byEmoji = new Map();
        reactions.set(r.message_id, byEmoji);
      }
      let entry = byEmoji.get(r.emoji);
      if (!entry) {
        entry = { emoji: r.emoji, users: [] };
        byEmoji.set(r.emoji, entry);
      }
      entry.users.push(r.user_id);
    }
  }

  const replyIds = [...new Set(rows.map((r) => r.reply_to).filter(Boolean))];
  const replies = new Map();
  if (replyIds.length) {
    const rph = replyIds.map(() => '?').join(',');
    const replyRows = db
      .prepare(
        `SELECT m.*, u.name AS sender_name FROM messages m LEFT JOIN users u ON u.id = m.sender_id
         WHERE m.id IN (${rph})`,
      )
      .all(...replyIds);
    for (const r of replyRows) {
      let meta = null;
      try {
        meta = r.metadata ? JSON.parse(r.metadata) : null;
      } catch {}
      replies.set(r.id, {
        id: r.id,
        senderId: r.sender_id,
        senderName: r.sender_name || 'Unknown',
        type: r.type,
        body: r.body,
        deleted: !!r.deleted_at,
        fileName: meta?.name || null,
      });
    }
  }

  return rows.map((r) => {
    let meta = null;
    try {
      meta = r.metadata ? JSON.parse(r.metadata) : null;
    } catch {}
    const sender = users.get(r.sender_id);
    const grouped = reactions.get(r.id);
    return {
      id: r.id,
      conversationId: r.conversation_id,
      senderId: r.sender_id,
      senderName: sender?.name || 'Unknown',
      senderColor: sender?.avatar_color || '#f59e0b',
      type: r.type,
      body: r.body,
      meta,
      replyTo: r.reply_to || null,
      replyPreview: r.reply_to ? replies.get(r.reply_to) || null : null,
      forwardedFrom: r.forwarded_from || null,
      editedAt: r.edited_at || null,
      deletedAt: r.deleted_at || null,
      pinnedAt: r.pinned_at || null,
      pinnedBy: r.pinned_by || null,
      createdAt: r.created_at,
      reactions: grouped
        ? [...grouped.values()]
            .map((g) => ({
              emoji: g.emoji,
              count: g.users.length,
              userIds: g.users,
              mine: g.users.includes(viewerId),
            }))
            .sort((a, b) => b.count - a.count)
        : [],
    };
  });
}

export function listMessages(conversationId, viewerId, { before, around, after, afterId, limit = 50 } = {}) {
  const max = Math.min(Math.max(Number(limit) || 50, 1), 200);
  let rows;
  if (around) {
    const older = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND created_at <= ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(conversationId, around, Math.floor(max / 2));
    const newer = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT ?`,
      )
      .all(conversationId, around, Math.ceil(max / 2));
    rows = [...older.reverse(), ...newer];
  } else if (before) {
    rows = db
      .prepare(
        `SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
      )
      .all(conversationId, before, max)
      .reverse();
  } else if (after) {
    const anchor = afterId
      ? db.prepare(`SELECT rowid AS rid, conversation_id FROM messages WHERE id = ?`).get(String(afterId))
      : null;
    rows =
      anchor && anchor.conversation_id === conversationId
        ? db
            .prepare(
              `SELECT * FROM messages
               WHERE conversation_id = ? AND (created_at > ? OR (created_at = ? AND rowid > ?))
               ORDER BY created_at ASC, rowid ASC LIMIT ?`,
            )
            .all(conversationId, after, after, anchor.rid, max)
        : db
            .prepare(
              `SELECT * FROM messages WHERE conversation_id = ? AND created_at > ?
               ORDER BY created_at ASC LIMIT ?`,
            )
            .all(conversationId, after, max);
  } else {
    rows = db
      .prepare(`SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`)
      .all(conversationId, max)
      .reverse();
  }
  return serializeMessages(rows, viewerId);
}

export function createMessage({
  conversationId,
  senderId,
  type = 'text',
  body = null,
  meta = null,
  replyTo = null,
  forwardedFrom = null,
  createdAt = now(),
}) {
  const id = uid();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, sender_id, type, body, metadata, reply_to, forwarded_from, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    conversationId,
    senderId,
    type,
    body,
    meta ? JSON.stringify(meta) : null,
    replyTo,
    forwardedFrom,
    createdAt,
  );
  return getMessageById(id);
}

export function listPinned(conversationId, viewerId) {
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE conversation_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL
       ORDER BY pinned_at DESC`,
    )
    .all(conversationId);
  return serializeMessages(rows, viewerId);
}

export function setPinned(messageId, pinned, userId) {
  db.prepare(`UPDATE messages SET pinned_at = ?, pinned_by = ? WHERE id = ?`).run(
    pinned ? now() : null,
    pinned ? userId : null,
    messageId,
  );
}

export function searchMessages(userId, query, conversationId = null) {
  const like = `%${String(query).replace(/[%_]/g, (c) => '\\' + c)}%`;
  const params = [userId, like];
  let sql = `SELECT m.* FROM messages m
    JOIN members mem ON mem.conversation_id = m.conversation_id AND mem.user_id = ?
    WHERE m.deleted_at IS NULL AND m.type IN ('text') AND m.body LIKE ? ESCAPE '\\'`;
  if (conversationId) {
    sql += ` AND m.conversation_id = ?`;
    params.push(conversationId);
  }
  sql += ` ORDER BY m.created_at DESC LIMIT 80`;
  const rows = db.prepare(sql).all(...params);
  return serializeMessages(rows, userId).map((m) => ({
    ...m,
    conversationTitle: conversationTitle(getConversation(m.conversationId), userId),
  }));
}

/* ---------------- files ---------------- */

export function serializeFile(row, viewerId, conv = null) {
  const conversation = conv || getConversation(row.conversation_id);
  const owner = getUserById(row.owner_id);
  return {
    id: row.id,
    messageId: row.message_id || null,
    name: row.original_name,
    mime: row.mime,
    size: row.size,
    width: row.width || null,
    height: row.height || null,
    duration: row.duration || null,
    createdAt: row.created_at,
    ownerId: row.owner_id,
    ownerName: owner?.name || 'Unknown',
    conversationId: row.conversation_id,
    conversationTitle: conversation ? conversationTitle(conversation, viewerId) : 'Chat',
    conversationType: conversation?.type || 'dm',
  };
}

export function recentFiles(userId, limit = 80) {
  const rows = db
    .prepare(
      `SELECT f.* FROM files f
       JOIN members m ON m.conversation_id = f.conversation_id AND m.user_id = ?
       ORDER BY f.created_at DESC LIMIT ?`,
    )
    .all(userId, Math.min(Number(limit) || 80, 200));
  return rows.map((r) => serializeFile(r, userId));
}

/* ---------------- calls ---------------- */

export function serializeCall(call, viewerId) {
  const conv = getConversation(call.conversation_id);
  const initiator = getUserById(call.initiator_id);
  const participants = db
    .prepare(
      `SELECT cp.user_id, cp.status, cp.joined_at, u.name FROM call_participants cp
       LEFT JOIN users u ON u.id = cp.user_id WHERE cp.call_id = ?`,
    )
    .all(call.id)
    .map((p) => ({ userId: p.user_id, status: p.status, name: p.name || 'Unknown', joinedAt: p.joined_at }));
  return {
    id: call.id,
    conversationId: call.conversation_id,
    conversationTitle: conv ? conversationTitle(conv, viewerId) : 'Call',
    conversationType: conv?.type || 'dm',
    initiatorId: call.initiator_id,
    initiatorName: initiator?.name || 'Unknown',
    kind: call.kind,
    status: call.status,
    startedAt: call.started_at,
    answeredAt: call.answered_at,
    endedAt: call.ended_at,
    duration: call.duration,
    participants,
  };
}

export function callHistory(userId, limit = 80) {
  const rows = db
    .prepare(
      `SELECT c.* FROM calls c
       JOIN members m ON m.conversation_id = c.conversation_id AND m.user_id = ?
       ORDER BY c.started_at DESC LIMIT ?`,
    )
    .all(userId, Math.min(Number(limit) || 80, 200));
  return rows.map((r) => serializeCall(r, userId));
}

/* ---------------- maintenance ---------------- */

export function pruneSessions() {
  const cutoff = now() - 1000 * 60 * 60 * 24 * 90;
  db.prepare(`DELETE FROM sessions WHERE last_seen < ?`).run(cutoff);
}

// Calls live in memory while the server is running. Anything still marked
// ringing/active at boot was interrupted by a restart and must not stay pending.
export function reconcileCalls() {
  const stale = db.prepare(`SELECT * FROM calls WHERE status IN ('ringing', 'active')`).all();
  for (const call of stale) {
    const endedAt = call.answered_at || call.started_at;
    const status = call.status === 'active' ? 'ended' : 'missed';
    db.prepare(`UPDATE calls SET status = ?, ended_at = ?, duration = 0 WHERE id = ?`).run(
      status,
      endedAt,
      call.id,
    );
    db.prepare(
      `UPDATE call_participants
       SET status = CASE WHEN status = 'accepted' THEN 'left' WHEN status = 'invited' THEN 'missed' ELSE status END,
           left_at = COALESCE(left_at, ?)
       WHERE call_id = ?`,
    ).run(endedAt, call.id);
  }
  return stale.length;
}
