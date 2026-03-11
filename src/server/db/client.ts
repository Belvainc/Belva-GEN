import { PrismaClient } from "@prisma/client";
import { isDevelopment } from "@/server/config/env";

// ─── Prisma Client Singleton ─────────────────────────────────────────────────
// In development, Next.js hot-reloads modules, which would create multiple
// Prisma clients and exhaust the connection pool. We store the singleton on
// `globalThis` to survive hot reloads.

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

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? createPrismaClient();

if (isDevelopment()) {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnect Prisma. Called during shutdown.
 */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
