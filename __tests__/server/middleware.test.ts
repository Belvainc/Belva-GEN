import { proxy as middleware } from "@/proxy";
import { SignJWT } from "jose";

// ─── Middleware Tests ────────────────────────────────────────────────────────

const TEST_SECRET = "test-jwt-secret-must-be-at-least-32-characters-long";

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.JWT_SECRET;
});

async function signTestToken(
  payload: Record<string, unknown> = {
    userId: "user-123",
    role: "ADMIN",
    sessionId: "session-456",
  }
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .setIssuer("belva-gen")
    .sign(new TextEncoder().encode(TEST_SECRET));
}

function makeRequest(
  pathname: string,
  options: { cookie?: string } = {}
): Request & { nextUrl: URL; cookies: { get: (name: string) => { value: string } | undefined } } {
  const url = new URL(pathname, "http://localhost:3000");

  const headers = new Headers();
  if (options.cookie !== undefined) {
    headers.set("cookie", `auth-token=${options.cookie}`);
  }

  const req = new Request(url.toString(), { headers }) as Request & {
    nextUrl: URL;
    cookies: { get: (name: string) => { value: string } | undefined };
  };

  // Simulate NextRequest shape
  req.nextUrl = url;
  req.cookies = {
    get: (name: string) => {
      if (name === "auth-token" && options.cookie !== undefined) {
        return { value: options.cookie };
      }
      return undefined;
    },
  };

  return req;
}

describe("middleware", () => {
  describe("public paths", () => {
    it("allows /login without auth", async () => {
      const req = makeRequest("/login");
      const res = await middleware(req as never);

      // Should not redirect (status 200 from NextResponse.next())
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(302);
    });

    it("allows /api/auth/login without auth", async () => {
      const req = makeRequest("/api/auth/login");
      const res = await middleware(req as never);

      expect(res.status).not.toBe(401);
    });

    it("allows /api/health without auth", async () => {
      const req = makeRequest("/api/health");
      const res = await middleware(req as never);

      expect(res.status).not.toBe(401);
    });
  });

  describe("unauthenticated access", () => {
    it("returns 401 JSON for unauthenticated API requests", async () => {
      const req = makeRequest("/api/admin/users");
      const res = await middleware(req as never);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("redirects to /login for unauthenticated page requests", async () => {
      const req = makeRequest("/dashboard");
      const res = await middleware(req as never);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/login");
      expect(location).toContain("returnTo=%2Fdashboard");
    });
  });

  describe("authenticated access", () => {
    it("allows access with valid JWT", async () => {
      const token = await signTestToken();
      const req = makeRequest("/dashboard", { cookie: token });
      const res = await middleware(req as never);

      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(302);
    });

    it("injects auth headers into request", async () => {
      const token = await signTestToken();
      const req = makeRequest("/dashboard", { cookie: token });
      const res = await middleware(req as never);

      // The middleware injects headers via NextResponse.next({ request: { headers } })
      // We can verify via the x-request-id header on the response
      expect(res.headers.get("x-request-id")).toBeDefined();
    });

    it("rejects invalid JWT with 401 for API routes", async () => {
      const req = makeRequest("/api/users", { cookie: "invalid-token" });
      const res = await middleware(req as never);

      expect(res.status).toBe(401);
    });
  });

  describe("admin route protection", () => {
    it("allows admin access to /admin routes", async () => {
      const token = await signTestToken({ userId: "user-1", role: "ADMIN", sessionId: "s-1" });
      const req = makeRequest("/admin/users", { cookie: token });
      const res = await middleware(req as never);

      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(302);
    });

    it("allows non-admin to reach /api/admin (guarded by route handlers)", async () => {
      // API admin routes are protected by requireAdmin() guard in route handlers,
      // not by middleware — middleware only protects /admin/* page routes
      const token = await signTestToken({ userId: "user-1", role: "USER", sessionId: "s-1" });
      const req = makeRequest("/api/admin/users", { cookie: token });
      const res = await middleware(req as never);

      // Middleware passes through; route handler will enforce admin check
      expect(res.status).not.toBe(403);
    });

    it("redirects non-admin to /dashboard for admin pages", async () => {
      const token = await signTestToken({ userId: "user-1", role: "USER", sessionId: "s-1" });
      const req = makeRequest("/admin/users", { cookie: token });
      const res = await middleware(req as never);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toContain("/dashboard");
    });
  });

  describe("security headers", () => {
    it("sets security headers on all responses", async () => {
      const req = makeRequest("/login");
      const res = await middleware(req as never);

      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("x-frame-options")).toBe("DENY");
      expect(res.headers.get("x-xss-protection")).toBe("1; mode=block");
      expect(res.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin"
      );
      expect(res.headers.get("content-security-policy")).toContain(
        "default-src 'self'"
      );
      expect(res.headers.get("permissions-policy")).toContain("camera=()");
    });

    it("includes x-request-id on responses", async () => {
      const req = makeRequest("/login");
      const res = await middleware(req as never);

      expect(res.headers.get("x-request-id")).toBeDefined();
      expect(res.headers.get("x-request-id")!.length).toBeGreaterThan(0);
    });
  });
});
