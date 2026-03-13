import { PrismaClient } from "@prisma/client";
import { scrypt, randomBytes } from "node:crypto";

// ─── Admin User Seed ───────────────────────────────────────────────────────────
// Seeds the initial admin user on first run. Reads credentials from env
// or falls back to development defaults.

const prisma = new PrismaClient();

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(32);
    scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err !== null) reject(err);
      else resolve(`${salt.toString("hex")}:${derivedKey.toString("hex")}`);
    });
  });
}

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@belva.dev";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "admin-dev-password-change-me";
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  console.log(`Seeding admin user: ${email}`);

  const passwordHash = await hashPassword(password);

  await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      name,
      role: "ADMIN",
      status: "ACTIVE",
    },
    create: {
      email,
      passwordHash,
      name,
      role: "ADMIN",
      status: "ACTIVE",
    },
  });

  console.log("Admin user seeded successfully");

  // ─── Seed Project ─────────────────────────────────────────────────────────

  console.log("Seeding default project...");

  await prisma.project.upsert({
    where: { slug: "belva-gen" },
    update: {
      repoPath: process.cwd(),
    },
    create: {
      name: "Belva-GEN",
      slug: "belva-gen",
      description: "Autonomous development framework with HITL governance",
      jiraProjectKey: "BELVA",
      githubRepo: "belva/belva-gen",
      repoPath: process.cwd(),
    },
  });

  console.log("Default project seeded");

  // ─── Seed Agents ──────────────────────────────────────────────────────────

  console.log("Seeding agents...");

  const agents = [
    {
      id: "orchestrator",
      name: "Project Orchestrator",
      description: "Epic lifecycle, task decomposition, HITL governance",
      role: "orchestrator",
      capabilities: {
        taskTypes: ["orchestration"],
        maxConcurrentTasks: 1,
        ruleReferences: ["git-safety.md", "mcp-safety.md"],
      },
      ownedPaths: [] as string[],
      preferredModel: "claude-opus-4-6",
    },
    {
      id: "backend",
      name: "Backend Engineer",
      description: "Node.js/TypeScript, APIs, database, queues, MCP integrations",
      role: "backend",
      capabilities: {
        taskTypes: ["backend"],
        maxConcurrentTasks: 1,
        ruleReferences: [
          "ts-strict-mode.md",
          "git-safety.md",
          "service-layer.md",
          "async-concurrency.md",
          "infrastructure.md",
        ],
      },
      ownedPaths: [
        "src/server/**",
        "src/app/api/**",
        "src/types/**",
        "src/lib/**",
        "prisma/**",
      ],
      preferredModel: "claude-sonnet-4-6",
    },
    {
      id: "frontend",
      name: "Frontend Engineer",
      description: "Next.js, React, Tailwind, dashboard UI",
      role: "frontend",
      capabilities: {
        taskTypes: ["frontend"],
        maxConcurrentTasks: 1,
        ruleReferences: [
          "ts-strict-mode.md",
          "git-safety.md",
          "component-architecture.md",
          "accessibility.md",
          "frontend-performance.md",
          "data-fetching.md",
        ],
      },
      ownedPaths: [
        "src/app/dashboard/**",
        "src/components/**",
      ],
      preferredModel: "claude-sonnet-4-6",
    },
    {
      id: "testing",
      name: "QA Engineer",
      description: "Jest, Playwright, coverage, performance budgets",
      role: "testing",
      capabilities: {
        taskTypes: ["testing"],
        maxConcurrentTasks: 1,
        ruleReferences: [
          "ts-strict-mode.md",
          "git-safety.md",
          "testing-budgets.md",
        ],
      },
      ownedPaths: [
        "__tests__/**",
        "e2e/**",
      ],
      preferredModel: "claude-sonnet-4-6",
    },
  ];

  for (const agent of agents) {
    await prisma.agent.upsert({
      where: { id: agent.id },
      update: {
        name: agent.name,
        description: agent.description,
        role: agent.role,
        capabilities: agent.capabilities,
        ownedPaths: agent.ownedPaths,
        preferredModel: agent.preferredModel,
        isActive: true,
      },
      create: {
        id: agent.id,
        name: agent.name,
        description: agent.description,
        role: agent.role,
        capabilities: agent.capabilities,
        ownedPaths: agent.ownedPaths,
        preferredModel: agent.preferredModel,
        isActive: true,
      },
    });
  }

  console.log(`${agents.length} agents seeded`);

  // ─── Seed System Config ───────────────────────────────────────────────────

  console.log("Seeding system config defaults...");

  const configDefaults: Array<{ key: string; value: unknown }> = [
    { key: "approvalTimeoutMs", value: 24 * 60 * 60 * 1000 },
    { key: "maxRevisionCycles", value: 3 },
    { key: "maxConcurrentTasksPerEpic", value: 3 },
  ];

  for (const config of configDefaults) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: {
        key: config.key,
        value: config.value as never,
      },
    });
  }

  console.log("System config defaults seeded");
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e: unknown) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
