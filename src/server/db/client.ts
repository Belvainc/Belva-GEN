import { PrismaClient } from "@prisma/client";
import { isDevelopment } from "@/server/config/env";

// ─── Prisma Client Singleton ─────────────────────────────────────────────────
// In development, Next.js hot-reloads modules, which would create multiple
// Prisma clients and exhaust the connection pool. We store the singleton on
// `globalThis` to survive hot reloads.
//
// After `prisma generate` adds new models, the cached instance may be stale
// (missing new model delegates). We detect this by checking a known model
// property and recreating the client when it's missing.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: isDevelopment()
      ? [
          { emit: "stdout", level: "query" },
          { emit: "stdout", level: "error" },
          { emit: "stdout", level: "warn" },
        ]
      : [{ emit: "stdout", level: "error" }],
  });

  return client;
}

/**
 * Check if the cached Prisma client has all expected model delegates.
 * After `prisma generate` adds new models, the globalThis singleton
 * may still be an old instance that doesn't have them.
 */
function isCachedClientCurrent(client: PrismaClient): boolean {
  // Verify a recently-added model exists on the client.
  // Update this check when adding new models to the schema.
  return "knowledgeEntry" in client && "patternExtraction" in client;
}

function getOrCreatePrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;

  if (cached !== undefined && isCachedClientCurrent(cached)) {
    return cached;
  }

  // Disconnect stale client to free connections
  if (cached !== undefined) {
    cached.$disconnect().catch(() => {
      // Ignore disconnect errors during client replacement
    });
  }

  return createPrismaClient();
}

export const prisma: PrismaClient = getOrCreatePrismaClient();

if (isDevelopment()) {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma. Called during shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
