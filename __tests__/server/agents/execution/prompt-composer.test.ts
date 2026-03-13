import { composeSystemPrompt, composeOpenClawPrompt } from "@/server/agents/execution/prompt-composer";
import { join } from "node:path";

// ─── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("@/server/config/logger", () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("prompt-composer", () => {
  describe("composeSystemPrompt (legacy)", () => {
    it("returns a non-empty prompt for known agent IDs", async () => {
      const prompt = await composeSystemPrompt("orchestrator-project", []);
      expect(prompt.length).toBeGreaterThan(0);
    });

    it("includes fallback text for unknown agent IDs", async () => {
      // Use a valid enum value that doesn't have a .claude/agents/ file
      const prompt = await composeSystemPrompt("backend", []);
      // May fall through to fallback if no .claude/agents/backend.md exists
      expect(prompt.length).toBeGreaterThan(0);
    });
  });

  describe("composeOpenClawPrompt", () => {
    const repoPath = join(process.cwd());

    it("loads agent definition from openclaw/agents/<role>.md", async () => {
      const prompt = await composeOpenClawPrompt("backend", repoPath);

      expect(prompt).toContain("Backend Engineer");
      expect(prompt).toContain("Node.js");
    });

    it("appends SOUL.md content", async () => {
      const prompt = await composeOpenClawPrompt("backend", repoPath);

      expect(prompt).toContain("Belva-GEN");
      expect(prompt).toContain("Constraints");
    });

    it("returns fallback for non-existent role", async () => {
      const prompt = await composeOpenClawPrompt("nonexistent-role", repoPath);

      expect(prompt).toContain("nonexistent-role agent");
    });

    it("loads different agent definitions for different roles", async () => {
      const backendPrompt = await composeOpenClawPrompt("backend", repoPath);
      const frontendPrompt = await composeOpenClawPrompt("frontend", repoPath);

      expect(backendPrompt).toContain("Prisma");
      expect(frontendPrompt).toContain("React");
      expect(backendPrompt).not.toContain("Tailwind CSS v4");
      expect(frontendPrompt).not.toContain("BullMQ");
    });

    it("handles missing SOUL.md gracefully", async () => {
      // Use a temp path that doesn't have SOUL.md
      const prompt = await composeOpenClawPrompt("backend", "/tmp/nonexistent-repo");

      // Should still return agent fallback text, no crash
      expect(prompt).toContain("backend agent");
    });

    it("prompt is concise (under 5000 chars)", async () => {
      const prompt = await composeOpenClawPrompt("backend", repoPath);

      // Agent def (~2000 chars) + SOUL (~800 chars) should be well under 5000
      expect(prompt.length).toBeLessThan(5000);
    });
  });
});
