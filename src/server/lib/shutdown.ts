import { createChildLogger } from "@/server/config/logger";
import { disconnectPrisma } from "@/server/db/client";
import { disconnectRedis } from "@/server/config/redis";
import { closeQueues } from "@/server/queues";
import { stopWorkers } from "@/server/workers";

const logger = createChildLogger({ module: "shutdown" });

let isShuttingDown = false;

/**
 * Register SIGTERM/SIGINT handlers for graceful shutdown.
 * Call once at server startup.
 */
export function registerShutdownHandlers(): void {
  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      logger.warn({ signal }, "Shutdown already in progress, ignoring");
      return;
    }
    isShuttingDown = true;
    logger.info({ signal }, "Graceful shutdown initiated");

    try {
      // 1. Stop accepting new jobs
      await stopWorkers();

      // 2. Close queue connections
      await closeQueues();

      // 3. Disconnect Redis
      await disconnectRedis();

      // 4. Disconnect database
      await disconnectPrisma();

      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        "Error during shutdown"
      );
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  logger.info("Shutdown handlers registered");
}
