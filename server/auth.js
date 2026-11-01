import { createHash, randomBytes } from 'node:crypto';
import { db, getUserById, now } from './db.js';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function createSession(userId, userAgent = '') {
  const token = randomBytes(32).toString('base64url');
  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, last_seen, user_agent) VALUES (?, ?, ?, ?, ?)`,
  ).run(hashToken(token), userId, now(), now(), String(userAgent).slice(0, 250));
  return token;
}

export function authenticateToken(token) {
  if (!token || typeof token !== 'string' || token.length < 20) return null;
  const th = hashToken(token);
  const session = db.prepare(`SELECT * FROM sessions WHERE token_hash = ?`).get(th);
  if (!session) return null;
  const ts = now();
  if (ts - session.last_seen > SESSION_TTL_MS) {
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(th);
    return null;
  }
  const user = getUserById(session.user_id);
  if (!user) return null;
  db.prepare(`UPDATE sessions SET last_seen = ? WHERE token_hash = ?`).run(ts, th);
  return { user, token, session };
}

export function deleteSession(token) {
  if (!token) return;
  db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
}

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const token = bearer || req.query.token || req.headers['x-session-token'];
  const auth = authenticateToken(token);
  if (!auth) {
    return res.status(401).json({ error: 'Your session has expired. Please join again.' });
  }
  req.user = auth.user;
  req.token = auth.token;
  next();
}
