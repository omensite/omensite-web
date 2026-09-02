export function createInMemorySessionRegistry() {
  const byUser = new Map();

  return {
    register(userId, sessionId) {
      const key = String(userId);
      const ids = byUser.get(key) ?? new Set();
      ids.add(String(sessionId));
      byUser.set(key, ids);
    },

    unregister(userId, sessionId) {
      const key = String(userId);
      const ids = byUser.get(key);
      ids?.delete(String(sessionId));
      if (ids?.size === 0) byUser.delete(key);
    },

    listSessionIds(userId) {
      return [...(byUser.get(String(userId)) ?? [])];
    },

    activeCount(userId) {
      return byUser.get(String(userId))?.size ?? 0;
    },

    clearUser(userId) {
      const key = String(userId);
      const ids = [...(byUser.get(key) ?? [])];
      byUser.delete(key);
      return ids;
    },
  };
}
