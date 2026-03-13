-- AlterTable
ALTER TABLE "agents" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preferredModel" TEXT,
ADD COLUMN     "role" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "repoPath" TEXT;

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");
