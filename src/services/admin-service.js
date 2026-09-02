import { normalizeTradingViewUrl } from "../config/indicator-catalog.js";

function adminError(code, message) {
  return Object.assign(new Error(message), { code });
}

function safeUserSnapshot(user, { banRepository, sessionRegistry }) {
  const ban = banRepository.findByUserId(user.id);
  return {
    id: String(user.id),
    username: user.username ?? "",
    displayName: user.displayName ?? user.username ?? "",
    avatarUrl: user.avatarUrl ?? null,
    authMode: user.authMode ?? "unknown",
    roles: [...(user.roles ?? [])],
    capabilities: [...(user.capabilities ?? [])],
    rolesSyncedAt: user.rolesSyncedAt ?? null,
    lastSignedInAt: user.lastSignedInAt ?? null,
    firstSeenAt: user.firstSeenAt ?? null,
    lastSeenAt: user.lastSeenAt ?? null,
    banned: Boolean(ban),
    ban: ban ? {
      actorId: ban.actorId,
      reason: ban.reason ?? "",
      bannedAt: ban.bannedAt,
    } : null,
    activeSessions: sessionRegistry.activeCount(user.id),
  };
}

export function createAdminService({
  userRepository,
  banRepository,
  sessionRegistry,
  requestRepository,
  sessionStore,
  catalog = [],
  assertOperatorAdmission = () => {},
} = {}) {
  const indicatorsById = new Map(catalog.map((indicator) => [indicator.id, {
    id: indicator.id,
    name: indicator.name,
    tradingViewUrl: indicator.active ? normalizeTradingViewUrl(indicator.tradingViewUrl) : null,
  }]));

  async function invalidateSessions(userId) {
    const normalizedUserId = String(userId);
    const sessionIds = sessionRegistry.listSessionIds(normalizedUserId);
    sessionIds.forEach((sessionId) => sessionRegistry.markRevoked?.(sessionId));
    const outcomes = await Promise.allSettled(sessionIds.map((sessionId) => new Promise((resolve, reject) => {
      sessionStore.destroy(sessionId, (error) => error ? reject(error) : resolve(sessionId));
    })));

    let failed = false;
    outcomes.forEach((outcome, index) => {
      if (outcome.status === "fulfilled") {
        sessionRegistry.unregister(normalizedUserId, sessionIds[index]);
      } else {
        failed = true;
      }
    });
    if (failed) {
      throw adminError("SESSION_INVALIDATION_FAILED", "One or more sessions could not be invalidated");
    }
    return sessionIds.length;
  }

  function admittedActor({ actor, actorId }) {
    const normalizedActorId = String(actor?.id ?? actorId);
    if (banRepository.isBanned(normalizedActorId)) {
      throw adminError("ACCOUNT_BANNED", "Administrator account is banned");
    }
    if (actor) assertOperatorAdmission(actor);
    return normalizedActorId;
  }

  return {
    getDashboard() {
      return {
        users: userRepository.list().map((user) => safeUserSnapshot(user, { banRepository, sessionRegistry })),
        requests: requestRepository.list().map((request) => ({
          ...request,
          indicators: request.indicatorIds.map((id) => indicatorsById.get(id) ?? {
            id,
            name: id,
            tradingViewUrl: null,
          }),
        })),
      };
    },

    async signOutUser({ userId, actor, actorId }) {
      admittedActor({ actor, actorId });
      const normalizedUserId = String(userId);
      const signedOutSessions = await invalidateSessions(normalizedUserId);
      return { userId: normalizedUserId, signedOutSessions };
    },

    async banUser({ userId, actor, actorId, reason = "" }) {
      const normalizedUserId = String(userId);
      const normalizedActorId = admittedActor({ actor, actorId });
      if (normalizedUserId === normalizedActorId) {
        throw adminError("SELF_BAN_FORBIDDEN", "Administrators cannot ban their own identity");
      }
      const ban = banRepository.ban({
        userId: normalizedUserId,
        actorId: normalizedActorId,
        reason: String(reason).trim(),
      });
      await invalidateSessions(normalizedUserId);
      return { ...ban, banned: true };
    },

    unbanUser({ userId, actor, actorId }) {
      admittedActor({ actor, actorId });
      const normalizedUserId = String(userId);
      banRepository.unban({ userId: normalizedUserId });
      return { userId: normalizedUserId, banned: false };
    },

    decideIndicatorRequest({ userId, actor, actorId, status }) {
      const normalizedActorId = admittedActor({ actor, actorId });
      if (status !== "GRANTED" && status !== "DENIED") {
        throw adminError("INVALID_DECISION", "Invalid indicator request decision");
      }
      const existing = requestRepository.findByUserId(String(userId));
      if (existing && existing.status !== "PENDING") {
        throw adminError("INDICATOR_REQUEST_NOT_PENDING", "Indicator request is not pending");
      }
      return requestRepository.decide({
        userId: String(userId),
        actorId: normalizedActorId,
        status,
      });
    },
  };
}
