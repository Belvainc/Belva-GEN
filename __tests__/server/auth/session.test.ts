import {
  createSession,
  getSession,
  touchSession,
  revokeSession,
  revokeAllUserSessions,
} from "@/server/auth/session";

// ─── Mock Redis ──────────────────────────────────────────────────────────────

const store: Map<string, { value: string; ttl: number }> = new Map();
const sets: Map<string, Set<string>> = new Map();

jest.mock("@/server/config/redis", () => ({
  redis: {
    set: jest.fn(
      async (key: string, value: string, _ex: string, ttl: number) => {
        store.set(key, { value, ttl });
        return "OK";
      }
    ),
    get: jest.fn(async (key: string) => {
      const entry = store.get(key);
      return entry?.value ?? null;
    }),
    del: jest.fn(async (...keys: string[]) => {
      for (const key of keys) {
        store.delete(key);
        sets.delete(key);
      }
      return keys.length;
    }),
    ttl: jest.fn(async (key: string) => {
      const entry = store.get(key);
      return entry?.ttl ?? -2;
    }),
    sadd: jest.fn(async (key: string, ...members: string[]) => {
      if (!sets.has(key)) sets.set(key, new Set());
      const s = sets.get(key)!;
      for (const m of members) s.add(m);
      return members.length;
    }),
    srem: jest.fn(async (key: string, ...members: string[]) => {
      const s = sets.get(key);
      if (s === undefined) return 0;
      for (const m of members) s.delete(m);
      return members.length;
    }),
    smembers: jest.fn(async (key: string) => {
      const s = sets.get(key);
      return s !== undefined ? Array.from(s) : [];
    }),
  },
}));

describe("session management", () => {
  beforeEach(() => {
    store.clear();
    sets.clear();
    jest.clearAllMocks();
  });

  describe("createSession", () => {
    it("returns a session ID (UUID format)", async () => {
      const sessionId = await createSession("user-1");
      expect(sessionId).toBeDefined();
      expect(typeof sessionId).toBe("string");
      expect(sessionId.length).toBeGreaterThan(0);
    });

    it("stores session data in Redis with 24h TTL", async () => {
      const sessionId = await createSession("user-1");
      const entry = store.get(`session:${sessionId}`);

      expect(entry).toBeDefined();
      expect(entry!.ttl).toBe(86400); // 24h in seconds

      const data = JSON.parse(entry!.value);
      expect(data.userId).toBe("user-1");
      expect(data.createdAt).toBeGreaterThan(0);
      expect(data.lastActiveAt).toBeGreaterThan(0);
    });

    it("tracks session in user session set", async () => {
      const sessionId = await createSession("user-1");
      const userSessions = sets.get("user-sessions:user-1");
      expect(userSessions).toBeDefined();
      expect(userSessions!.has(sessionId)).toBe(true);
    });
  });

  describe("getSession", () => {
    it("returns session data for valid session", async () => {
      const sessionId = await createSession("user-1");
      const session = await getSession(sessionId);

      expect(session).not.toBeNull();
      expect(session!.userId).toBe("user-1");
    });

    it("returns null for non-existent session", async () => {
      const session = await getSession("non-existent");
      expect(session).toBeNull();
    });

    it("returns null and revokes session past idle timeout (30min)", async () => {
      const sessionId = await createSession("user-1");

      // Manipulate the stored session to simulate idle timeout
      const entry = store.get(`session:${sessionId}`)!;
      const data = JSON.parse(entry.value);
      data.lastActiveAt = Date.now() - 31 * 60 * 1000; // 31 minutes ago
      store.set(`session:${sessionId}`, { value: JSON.stringify(data), ttl: entry.ttl });

      const session = await getSession(sessionId);
      expect(session).toBeNull();
      // Session should be deleted from store
      expect(store.has(`session:${sessionId}`)).toBe(false);
    });

    it("returns null and revokes session past absolute timeout (24h)", async () => {
      const sessionId = await createSession("user-1");

      // Manipulate the stored session to simulate absolute timeout
      const entry = store.get(`session:${sessionId}`)!;
      const data = JSON.parse(entry.value);
      data.createdAt = Date.now() - 25 * 60 * 60 * 1000; // 25 hours ago
      data.lastActiveAt = Date.now(); // Recently active
      store.set(`session:${sessionId}`, { value: JSON.stringify(data), ttl: entry.ttl });

      const session = await getSession(sessionId);
      expect(session).toBeNull();
    });

    it("returns session when within both timeouts", async () => {
      const sessionId = await createSession("user-1");

      // Within both timeouts (fresh session)
      const session = await getSession(sessionId);
      expect(session).not.toBeNull();
    });
  });

  describe("touchSession", () => {
    it("updates lastActiveAt timestamp", async () => {
      const sessionId = await createSession("user-1");

      // Set lastActiveAt to 10 minutes ago
      const entry = store.get(`session:${sessionId}`)!;
      const data = JSON.parse(entry.value);
      const oldLastActive = data.lastActiveAt - 10 * 60 * 1000;
      data.lastActiveAt = oldLastActive;
      store.set(`session:${sessionId}`, { value: JSON.stringify(data), ttl: entry.ttl });

      await touchSession(sessionId);

      const updated = store.get(`session:${sessionId}`)!;
      const updatedData = JSON.parse(updated.value);
      expect(updatedData.lastActiveAt).toBeGreaterThan(oldLastActive);
    });

    it("does nothing for non-existent session", async () => {
      // Should not throw
      await touchSession("non-existent");
    });
  });

  describe("revokeSession", () => {
    it("removes session from Redis", async () => {
      const sessionId = await createSession("user-1");
      expect(store.has(`session:${sessionId}`)).toBe(true);

      await revokeSession(sessionId, "user-1");
      expect(store.has(`session:${sessionId}`)).toBe(false);
    });

    it("removes session from user session set", async () => {
      const sessionId = await createSession("user-1");
      await revokeSession(sessionId, "user-1");

      const userSessions = sets.get("user-sessions:user-1");
      expect(userSessions?.has(sessionId)).toBeFalsy();
    });
  });

  describe("revokeAllUserSessions", () => {
    it("removes all sessions for a user", async () => {
      const s1 = await createSession("user-1");
      const s2 = await createSession("user-1");
      const s3 = await createSession("user-2"); // Different user

      await revokeAllUserSessions("user-1");

      expect(store.has(`session:${s1}`)).toBe(false);
      expect(store.has(`session:${s2}`)).toBe(false);
      expect(store.has(`session:${s3}`)).toBe(true); // Untouched
    });

    it("cleans up user session set", async () => {
      await createSession("user-1");
      await createSession("user-1");

      await revokeAllUserSessions("user-1");

      expect(sets.has("user-sessions:user-1")).toBe(false);
    });

    it("handles user with no sessions", async () => {
      // Should not throw
      await revokeAllUserSessions("user-with-no-sessions");
    });
  });
});
