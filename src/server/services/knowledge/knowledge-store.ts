import { prisma } from "@/server/db/client";
import type { KnowledgeEntry, KnowledgeCategory, KnowledgeStatus, Prisma } from "@prisma/client";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CreateKnowledgeEntryInput {
  projectId?: string;
  agentId?: string;
  category: KnowledgeCategory;
  title: string;
  content: string;
  sourceTicketRef?: string;
  confidence?: number;
}

export interface KnowledgeFilter {
  category?: KnowledgeCategory;
  status?: KnowledgeStatus;
  sourceTicketRef?: string;
  projectId?: string;
}

export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

// ─── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Create a new knowledge entry.
 */
export async function createEntry(
  input: CreateKnowledgeEntryInput
): Promise<KnowledgeEntry> {
  return prisma.knowledgeEntry.create({
    data: {
      projectId: input.projectId,
      agentId: input.agentId,
      category: input.category,
      title: input.title,
      content: input.content,
      sourceTicketRef: input.sourceTicketRef,
      confidence: input.confidence ?? 0.5,
    },
  });
}

/**
 * Get a single knowledge entry by ID.
 */
export async function getEntry(id: string): Promise<KnowledgeEntry | null> {
  return prisma.knowledgeEntry.findUnique({ where: { id } });
}

/**
 * List knowledge entries with optional filters and cursor-based pagination.
 */
export async function listEntries(
  filter: KnowledgeFilter,
  pagination: PaginationParams
): Promise<PaginatedResult<KnowledgeEntry>> {
  const where: Prisma.KnowledgeEntryWhereInput = {};
  if (filter.category !== undefined) where.category = filter.category;
  if (filter.status !== undefined) where.status = filter.status;
  if (filter.sourceTicketRef !== undefined) where.sourceTicketRef = filter.sourceTicketRef;
  if (filter.projectId !== undefined) where.projectId = filter.projectId;

  const items = await prisma.knowledgeEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: pagination.limit + 1,
    cursor: pagination.cursor !== undefined ? { id: pagination.cursor } : undefined,
    skip: pagination.cursor !== undefined ? 1 : 0,
  });

  const hasMore = items.length > pagination.limit;
  const data = hasMore ? items.slice(0, -1) : items;
  const lastItem = data[data.length - 1];
  const nextCursor = hasMore && lastItem !== undefined ? lastItem.id : null;

  return { data, nextCursor };
}

/**
 * Update a knowledge entry.
 */
export async function updateEntry(
  id: string,
  data: Partial<Pick<KnowledgeEntry, "title" | "content" | "confidence" | "status" | "promotedTo" | "validatedCount" | "validatedAt">>
): Promise<KnowledgeEntry> {
  return prisma.knowledgeEntry.update({
    where: { id },
    data,
  });
}

// ─── Query Operations ───────────────────────────────────────────────────────

/**
 * Search knowledge entries by text in title and content.
 */
export async function searchEntries(
  query: string,
  category?: KnowledgeCategory
): Promise<KnowledgeEntry[]> {
  const where: Prisma.KnowledgeEntryWhereInput = {
    OR: [
      { title: { contains: query, mode: "insensitive" } },
      { content: { contains: query, mode: "insensitive" } },
    ],
  };

  if (category !== undefined) {
    where.category = category;
  }

  return prisma.knowledgeEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

/**
 * Get all knowledge entries from a specific ticket.
 */
export async function getEntriesByTicket(
  ticketRef: string
): Promise<KnowledgeEntry[]> {
  return prisma.knowledgeEntry.findMany({
    where: { sourceTicketRef: ticketRef },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Get entries that are candidates for promotion.
 * Criteria: validatedCount >= 2, status is VALIDATED.
 */
export async function getPromotionCandidates(): Promise<KnowledgeEntry[]> {
  return prisma.knowledgeEntry.findMany({
    where: {
      status: "VALIDATED",
      validatedCount: { gte: 2 },
    },
    orderBy: { confidence: "desc" },
  });
}

/**
 * Increment the validated count and update confidence for an entry.
 */
export async function recordValidation(
  id: string,
  newConfidence: number
): Promise<KnowledgeEntry> {
  return prisma.knowledgeEntry.update({
    where: { id },
    data: {
      validatedCount: { increment: 1 },
      confidence: newConfidence,
      validatedAt: new Date(),
      status: "VALIDATED",
    },
  });
}
