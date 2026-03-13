import type { Job } from "bullmq";
import {
  KnowledgeExtractionJobDataSchema,
  type KnowledgeExtractionJobData,
} from "@/server/queues";
import { prisma } from "@/server/db/client";
import { extractPatterns, type TaskResult } from "@/server/services/knowledge/pattern-extractor";
import { createEntry } from "@/server/services/knowledge/knowledge-store";
import { evaluateForPromotion } from "@/server/services/knowledge/promotion.service";
import { getPromotionCandidates } from "@/server/services/knowledge/knowledge-store";
import { createChildLogger } from "@/server/config/logger";
import { z } from "zod";

const logger = createChildLogger({ module: "knowledge-extraction-worker" });

// ─── Task Result Parsing ────────────────────────────────────────────────────

const TaskResultSchema = z.object({
  taskId: z.string(),
  agentId: z.string(),
  success: z.boolean(),
  retried: z.boolean().default(false),
  changedFiles: z.array(z.string()).default([]),
  summary: z.string().default(""),
});

function parseTaskResults(raw: unknown): TaskResult[] {
  if (!Array.isArray(raw)) return [];
  const results: TaskResult[] = [];
  for (const item of raw) {
    const parsed = TaskResultSchema.safeParse(item);
    if (parsed.success) {
      results.push(parsed.data);
    }
  }
  return results;
}

// ─── Worker Processor ───────────────────────────────────────────────────────

/**
 * Process a knowledge extraction job.
 *
 * Steps:
 * 1. Load pipeline + decomposition data
 * 2. Parse task results
 * 3. Extract knowledge patterns
 * 4. Store KnowledgeEntry records
 * 5. Store PatternExtraction record
 * 6. Check promotion candidates
 */
export async function processKnowledgeExtraction(
  job: Job<KnowledgeExtractionJobData>
): Promise<void> {
  const data = KnowledgeExtractionJobDataSchema.parse(job.data);

  logger.info(
    { pipelineId: data.pipelineId, ticketRef: data.ticketRef, jobId: job.id },
    "Processing knowledge extraction"
  );

  // Load pipeline
  const pipeline = await prisma.pipeline.findUnique({
    where: { id: data.pipelineId },
  });

  if (pipeline === null) {
    logger.warn(
      { pipelineId: data.pipelineId, jobId: job.id },
      "Pipeline not found, skipping extraction"
    );
    return;
  }

  // Parse task results from job data
  const taskResults = parseTaskResults(data.taskResults);
  if (taskResults.length === 0) {
    logger.info(
      { pipelineId: data.pipelineId, jobId: job.id },
      "No task results to extract patterns from"
    );
    return;
  }

  // Build a minimal decomposition from pipeline metadata
  const decomposition = buildDecompositionFromPipeline(pipeline);

  // Extract patterns
  const patternInputs = extractPatterns(
    data.ticketRef,
    taskResults,
    decomposition
  );

  // Store knowledge entries
  const createdEntries = [];
  for (const input of patternInputs) {
    const entry = await createEntry({
      ...input,
      projectId: pipeline.projectId ?? undefined,
    });
    createdEntries.push(entry);
  }

  // Store pattern extraction record
  await prisma.patternExtraction.create({
    data: {
      pipelineId: data.pipelineId,
      extractedPatterns: createdEntries.map((e) => ({
        id: e.id,
        category: e.category,
        title: e.title,
      })),
    },
  });

  logger.info(
    {
      pipelineId: data.pipelineId,
      ticketRef: data.ticketRef,
      patternsExtracted: createdEntries.length,
      jobId: job.id,
    },
    "Knowledge extraction complete"
  );

  // Check for promotion candidates across all entries
  await checkPromotions(job.id ?? "unknown");
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface MinimalPipeline {
  metadata: unknown;
}

function buildDecompositionFromPipeline(pipeline: MinimalPipeline & { epicKey: string }) {
  // Extract what we can from pipeline metadata
  const metadata = pipeline.metadata as Record<string, unknown> | null;

  return {
    graph: {
      ticketRef: pipeline.epicKey,
      nodes: [] as Array<{
        taskId: string;
        title: string;
        description: string;
        taskType: "backend" | "frontend" | "testing" | "documentation" | "orchestration";
        estimatedPoints: number;
        dependsOn: string[];
      }>,
    },
    totalEstimatedPoints: (metadata?.totalEstimatedPoints as number) ?? 0,
    riskAreas: (metadata?.riskAreas as string[]) ?? [],
    affectedFiles: (metadata?.affectedFiles as string[]) ?? [],
  };
}

async function checkPromotions(jobId: string): Promise<void> {
  const candidates = await getPromotionCandidates();

  for (const candidate of candidates) {
    const evaluation = evaluateForPromotion(candidate);
    if (evaluation.shouldPromote) {
      logger.info(
        {
          entryId: candidate.id,
          target: evaluation.promotionTarget,
          reason: evaluation.reason,
          jobId,
        },
        "Knowledge entry eligible for promotion"
      );

      // Mark as promoted (actual promotion to shared-memory/rule/skill
      // is handled by the orchestrator agent in a separate workflow)
      await prisma.knowledgeEntry.update({
        where: { id: candidate.id },
        data: {
          status: "PROMOTED",
          promotedTo: evaluation.promotionTarget,
        },
      });
    }
  }
}
