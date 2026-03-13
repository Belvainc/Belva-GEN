-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "jiraSyncStatus" TEXT DEFAULT 'never',
ADD COLUMN     "lastJiraSyncAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "jira_issues" (
    "id" TEXT NOT NULL,
    "jiraId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "issueType" TEXT NOT NULL,
    "jiraStatus" TEXT NOT NULL,
    "labels" TEXT[],
    "epicKey" TEXT,
    "projectId" TEXT NOT NULL,
    "pipelineId" TEXT,
    "jiraUpdatedAt" TIMESTAMP(3) NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jira_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "jira_issues_pipelineId_key" ON "jira_issues"("pipelineId");

-- CreateIndex
CREATE INDEX "jira_issues_projectId_issueType_idx" ON "jira_issues"("projectId", "issueType");

-- CreateIndex
CREATE UNIQUE INDEX "jira_issues_projectId_key_key" ON "jira_issues"("projectId", "key");

-- AddForeignKey
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jira_issues" ADD CONSTRAINT "jira_issues_pipelineId_fkey" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE CASCADE;
