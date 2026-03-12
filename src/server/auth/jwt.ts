import { SignJWT, jwtVerify, type JWTPayload } from "jose";

// ─── JWT Token Management ──────────────────────────────────────────────────────
// Uses `jose` for Edge Runtime compatibility. HS256 symmetric signing.
// Access token lifetime: 1 hour (SOC2 compliant).

export interface TokenPayload {
  userId: string;
  role: string;
  sessionId: string;
}

const ALG = "HS256";
const TOKEN_LIFETIME = "1h";

/**
 * Get the JWT signing secret as a CryptoKey-compatible Uint8Array.
 * Reads from JWT_SECRET env var at call time (not import time)
 * so the module works during Next.js build.
 */
function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (secret === undefined || secret.length < 32) {
    throw new Error("JWT_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Sign a JWT with user claims. Returns the compact token string.
 */
export async function signToken(payload: TokenPayload): Promise<string> {
  return new SignJWT({
    userId: payload.userId,
    role: payload.role,
    sessionId: payload.sessionId,
  })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .setIssuer("belva-gen")
    .sign(getSecret());
}

/**
 * Verify and decode a JWT. Returns the payload or null if invalid/expired.
 */
export async function verifyToken(
  token: string
): Promise<TokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      issuer: "belva-gen",
    });
    return extractPayload(payload);
  } catch {
    return null;
  }
}

function extractPayload(jwt: JWTPayload): TokenPayload | null {
  const userId = jwt.userId;
  const role = jwt.role;
  const sessionId = jwt.sessionId;

  if (
    typeof userId !== "string" ||
    typeof role !== "string" ||
    typeof sessionId !== "string"
  ) {
    return null;
  }

  return { userId, role, sessionId };
}
