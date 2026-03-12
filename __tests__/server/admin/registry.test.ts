import {
  getModelConfig,
  getAllModelConfigs,
  listRecords,
  getRecord,
  createRecord,
  updateRecord,
  deleteRecord,
  getModelCounts,
} from "@/server/admin/registry";

// ─── Mock Prisma ─────────────────────────────────────────────────────────────

function makeMockDelegate(): Record<string, jest.Mock> {
  return {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  };
}

jest.mock("@/server/db/client", () => ({
  prisma: {
    user: makeMockDelegate(),
    project: makeMockDelegate(),
    agent: makeMockDelegate(),
    pipeline: makeMockDelegate(),
    approval: makeMockDelegate(),
    auditLog: makeMockDelegate(),
  },
}));

import { prisma } from "@/server/db/client";

describe("admin model registry", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getModelConfig", () => {
    it("returns config for registered models", () => {
      const userConfig = getModelConfig("users");
      expect(userConfig).toBeDefined();
      expect(userConfig!.name).toBe("User");
      expect(userConfig!.pluralName).toBe("Users");
    });

    it("returns undefined for unknown models", () => {
      expect(getModelConfig("nonexistent")).toBeUndefined();
    });

    it("has configs for all expected models", () => {
      const slugs = ["users", "projects", "agents", "pipelines", "approvals", "audit-logs"];
      for (const slug of slugs) {
        expect(getModelConfig(slug)).toBeDefined();
      }
    });
  });

  describe("getAllModelConfigs", () => {
    it("returns all 6 registered model configs", () => {
      const configs = getAllModelConfigs();
      expect(configs).toHaveLength(6);

      const slugs = configs.map((c) => c.slug);
      expect(slugs).toContain("users");
      expect(slugs).toContain("projects");
      expect(slugs).toContain("audit-logs");
    });
  });

  describe("listRecords", () => {
    it("queries Prisma with pagination and sorting", async () => {
      const mockData = [{ id: "1", email: "a@b.com", name: "A" }];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockData);
      (prisma.user.count as jest.Mock).mockResolvedValue(1);

      const result = await listRecords("users", {
        page: 1,
        limit: 25,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(1);
      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 0,
          take: 25,
          orderBy: { createdAt: "desc" }, // default sort
        })
      );
    });

    it("applies search filter across searchable fields", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await listRecords("users", {
        page: 1,
        limit: 25,
        search: "test",
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { email: { contains: "test", mode: "insensitive" } },
              { name: { contains: "test", mode: "insensitive" } },
            ],
          },
        })
      );
    });

    it("respects custom sort field and direction", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(0);

      await listRecords("users", {
        page: 1,
        limit: 10,
        sort: "email",
        direction: "asc",
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { email: "asc" },
        })
      );
    });

    it("calculates correct pagination offset", async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.user.count as jest.Mock).mockResolvedValue(100);

      const result = await listRecords("users", {
        page: 3,
        limit: 25,
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 50 })
      );
      expect(result.totalPages).toBe(4);
    });

    it("throws for unknown model slug", async () => {
      await expect(
        listRecords("unknown", { page: 1, limit: 10 })
      ).rejects.toThrow("Unknown model");
    });
  });

  describe("getRecord", () => {
    it("returns record by ID", async () => {
      const record = { id: "1", name: "Test" };
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(record);

      const result = await getRecord("users", "1");
      expect(result).toEqual(record);
    });

    it("returns null for non-existent record", async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await getRecord("users", "non-existent");
      expect(result).toBeNull();
    });

    it("throws for unknown model", async () => {
      await expect(getRecord("unknown", "1")).rejects.toThrow("Unknown model");
    });
  });

  describe("createRecord", () => {
    it("creates and returns a record", async () => {
      const newRecord = { id: "1", email: "new@test.com" };
      (prisma.user.create as jest.Mock).mockResolvedValue(newRecord);

      const result = await createRecord("users", { email: "new@test.com" });
      expect(result).toEqual(newRecord);
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: { email: "new@test.com" },
      });
    });

    it("throws for unknown model", async () => {
      await expect(createRecord("unknown", {})).rejects.toThrow(
        "Unknown model"
      );
    });
  });

  describe("updateRecord", () => {
    it("updates and returns a record", async () => {
      const updated = { id: "1", name: "Updated" };
      (prisma.user.update as jest.Mock).mockResolvedValue(updated);

      const result = await updateRecord("users", "1", { name: "Updated" });
      expect(result).toEqual(updated);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "1" },
        data: { name: "Updated" },
      });
    });
  });

  describe("deleteRecord", () => {
    it("deletes a record by ID", async () => {
      (prisma.user.delete as jest.Mock).mockResolvedValue({});

      await deleteRecord("users", "1");
      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: "1" },
      });
    });
  });

  describe("getModelCounts", () => {
    it("returns counts for all models", async () => {
      (prisma.user.count as jest.Mock).mockResolvedValue(5);
      (prisma.project.count as jest.Mock).mockResolvedValue(3);
      (prisma.agent.count as jest.Mock).mockResolvedValue(2);
      (prisma.pipeline.count as jest.Mock).mockResolvedValue(1);
      (prisma.approval.count as jest.Mock).mockResolvedValue(10);
      (prisma.auditLog.count as jest.Mock).mockResolvedValue(100);

      const counts = await getModelCounts();

      expect(counts.users).toBe(5);
      expect(counts.projects).toBe(3);
      expect(counts.agents).toBe(2);
      expect(counts.pipelines).toBe(1);
      expect(counts.approvals).toBe(10);
      expect(counts["audit-logs"]).toBe(100);
    });
  });
});
