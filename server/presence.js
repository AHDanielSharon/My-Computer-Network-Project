// Tracks live socket connections per user. Kept separate to avoid circular imports.
export const connections = new Map();

export function addConnection(userId, socketId) {
  let set = connections.get(userId);
  if (!set) {
    set = new Set();
    connections.set(userId, set);
  }
  set.add(socketId);
}

export function removeConnection(userId, socketId) {
  const set = connections.get(userId);
  if (!set) return false;
  set.delete(socketId);
  if (set.size === 0) {
    connections.delete(userId);
    return true;
  }
  return false;
}

export function isOnline(userId) {
  return (connections.get(userId)?.size ?? 0) > 0;
}

export function onlineUserIds() {
  return [...connections.keys()];
}
