let io = null;

export function setIo(instance) {
  io = instance;
}

export function getIo() {
  return io;
}

export function emitToUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}

export function joinUserToConversation(conversationId, userId) {
  io?.in(`user:${userId}`).socketsJoin(`conv:${conversationId}`);
}

export function joinMembersToConversation(conversationId, userIds) {
  for (const userId of userIds) joinUserToConversation(conversationId, userId);
}

export async function disconnectTokenSockets(tokenHash) {
  if (!io || !tokenHash) return;
  try {
    const sockets = await io.fetchSockets();
    for (const socket of sockets) {
      if (socket.data?.tokenHash === tokenHash) socket.disconnect(true);
    }
  } catch {}
}
