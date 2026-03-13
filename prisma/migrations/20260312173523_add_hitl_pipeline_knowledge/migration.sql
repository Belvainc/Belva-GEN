-- CreateEnum
CREATE TYPE "KnowledgeCategory" AS ENUM ('PATTERN', 'GOTCHA', 'DECISION', 'OPTIMIZATION');

-- CreateEnum
CREATE TYPE "KnowledgeStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PROMOTED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ApprovalType" ADD VALUE 'STAKEHOLDER';
ALTER TYPE "ApprovalType" ADD VALUE 'TEAM_CONFIRMATION';

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,
    "category" "KnowledgeCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sourceTicketRef" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" "KnowledgeStatus" NOT NULL DEFAULT 'DRAFT',
    "promotedTo" TEXT,
    "validatedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validatedAt" TIMESTAMP(3),

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pattern_extractions" (
    "id" TEXT NOT NULL,
    "pipelineId" TEXT NOT NULL,
    "extractedPatterns" JSONB NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pattern_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_entries_category_idx" ON "knowledge_entries"("category");

-- CreateIndex
CREATE INDEX "knowledge_entries_status_idx" ON "knowledge_entries"("status");

-- CreateIndex
CREATE INDEX "knowledge_entries_sourceTicketRef_idx" ON "knowledge_entries"("sourceTicketRef");

-- CreateIndex
CREATE INDEX "pattern_extractions_pipelineId_idx" ON "pattern_extractions"("pipelineId");

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pattern_extractions" ADD CONSTRAINT "pattern_extractions_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
