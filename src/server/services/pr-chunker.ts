import { createAgentLogger } from "@/lib/logger";

const logger = createAgentLogger("orchestrator-project");

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Chunk {
  files: string[];
  description: string;
  estimatedLines: number;
}

export interface ChunkPlan {
  chunks: Chunk[];
  requiresChunking: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_LINES_PER_PR = 400;

// ─── Domain Boundaries ──────────────────────────────────────────────────────

const DOMAIN_PREFIXES: Record<string, string> = {
  "src/server/": "backend",
  "src/app/api/": "api",
  "src/components/": "components",
  "src/app/dashboard/": "dashboard",
  "src/app/admin/": "admin",
  "src/app/(auth)/": "auth",
  "src/types/": "types",
  "src/lib/": "lib",
  "prisma/": "schema",
  "__tests__/": "tests",
  "e2e/": "e2e",
};

// ─── Chunking Logic ─────────────────────────────────────────────────────────

/**
 * Plan how to split changed files into manageable PR chunks.
 *
 * Groups files by module boundary (domain prefix), then splits
 * groups that exceed the max lines threshold.
 *
 * @param changedFiles - List of file paths that changed
 * @param fileSizes - Map of file path → estimated changed line count
 * @param maxLinesPerPR - Maximum lines per PR chunk (default 400)
 * @returns ChunkPlan with ordered chunks for sequential PR creation
 */
export function planChunks(
  changedFiles: string[],
  fileSizes: Record<string, number>,
  maxLinesPerPR: number = DEFAULT_MAX_LINES_PER_PR
): ChunkPlan {
  const totalLines = changedFiles.reduce(
    (sum, f) => sum + (fileSizes[f] ?? 0),
    0
  );

  // No chunking needed
  if (totalLines <= maxLinesPerPR) {
    return {
      requiresChunking: false,
      chunks: [
        {
          files: changedFiles,
          description: "All changes",
          estimatedLines: totalLines,
        },
      ],
    };
  }

  // Group files by domain
  const groups = groupByDomain(changedFiles, fileSizes);

  // Build chunks from groups, splitting large groups if needed
  const chunks: Chunk[] = [];

  for (const [domain, groupFiles] of groups) {
    const groupLines = groupFiles.reduce(
      (sum, f) => sum + (fileSizes[f] ?? 0),
      0
    );

    if (groupLines <= maxLinesPerPR) {
      chunks.push({
        files: groupFiles,
        description: `${domain} changes`,
        estimatedLines: groupLines,
      });
    } else {
      // Split large group into sub-chunks by parent directory
      const subChunks = splitByParentDir(groupFiles, fileSizes, maxLinesPerPR, domain);
      chunks.push(...subChunks);
    }
  }

  logger.info("PR chunking plan created", {
    totalFiles: changedFiles.length,
    totalLines,
    chunkCount: chunks.length,
    maxLinesPerPR,
  });

  return {
    requiresChunking: true,
    chunks,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupByDomain(
  files: string[],
  fileSizes: Record<string, number>
): Map<string, string[]> {
  const groups = new Map<string, string[]>();

  for (const file of files) {
    let domain = "other";

    for (const [prefix, domainName] of Object.entries(DOMAIN_PREFIXES)) {
      if (file.startsWith(prefix)) {
        domain = domainName;
        break;
      }
    }

    const existing = groups.get(domain) ?? [];
    existing.push(file);
    groups.set(domain, existing);
  }

  // Sort groups: types/schema first (shared deps), then by size descending
  const priority: Record<string, number> = { schema: 0, types: 1, lib: 2 };
  const sorted = new Map(
    Array.from(groups.entries()).sort(([a], [b]) => {
      const pa = priority[a] ?? 10;
      const pb = priority[b] ?? 10;
      if (pa !== pb) return pa - pb;

      const sizeA = (groups.get(a) ?? []).reduce(
        (sum, f) => sum + (fileSizes[f] ?? 0),
        0
      );
      const sizeB = (groups.get(b) ?? []).reduce(
        (sum, f) => sum + (fileSizes[f] ?? 0),
        0
      );
      return sizeB - sizeA;
    })
  );

  return sorted;
}

function splitByParentDir(
  files: string[],
  fileSizes: Record<string, number>,
  maxLines: number,
  domain: string
): Chunk[] {
  // Group by immediate parent directory
  const dirGroups = new Map<string, string[]>();

  for (const file of files) {
    const parts = file.split("/");
    const parentDir = parts.length > 1 ? parts.slice(0, -1).join("/") : ".";
    const existing = dirGroups.get(parentDir) ?? [];
    existing.push(file);
    dirGroups.set(parentDir, existing);
  }

  // Pack directory groups into chunks
  const chunks: Chunk[] = [];
  let currentFiles: string[] = [];
  let currentLines = 0;
  let chunkIndex = 1;

  for (const [, dirFiles] of dirGroups) {
    const dirLines = dirFiles.reduce(
      (sum, f) => sum + (fileSizes[f] ?? 0),
      0
    );

    if (currentLines + dirLines > maxLines && currentFiles.length > 0) {
      chunks.push({
        files: currentFiles,
        description: `${domain} changes (part ${chunkIndex})`,
        estimatedLines: currentLines,
      });
      currentFiles = [];
      currentLines = 0;
      chunkIndex++;
    }

    currentFiles.push(...dirFiles);
    currentLines += dirLines;
  }

  // Don't forget the last chunk
  if (currentFiles.length > 0) {
    chunks.push({
      files: currentFiles,
      description:
        chunks.length > 0
          ? `${domain} changes (part ${chunkIndex})`
          : `${domain} changes`,
      estimatedLines: currentLines,
    });
  }

  return chunks;
}
