// ─── Mocks (must be declared before jest.mock for hoisting) ──────────────────

const mockRedis = {
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  pipeline: jest.fn(() => ({
    del: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
};

const mockPrismaSystemConfig = {
  findUnique: jest.fn(),
  findMany: jest.fn(),
  upsert: jest.fn(),
  deleteMany: jest.fn(),
};

jest.mock("@/server/config/redis", () => ({
  redis: mockRedis,
}));

jest.mock("@/server/db/client", () => ({
  prisma: {
    systemConfig: mockPrismaSystemConfig,
  },
}));

jest.mock("@/server/config/logger", () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import {
  getConfigValue,
  setConfigValue,
  deleteConfigValue,
  getAllConfigValues,
  invalidateConfigCache,
} from "@/server/services/system-config.service";

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("system-config.service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("getConfigValue", () => {
    it("returns cached value when available", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(5000));

      const result = await getConfigValue<number>("maxRevisionCycles");

      expect(result).toBe(5000);
      expect(mockPrismaSystemConfig.findUnique).not.toHaveBeenCalled();
    });

    it("falls back to DB when cache misses", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrismaSystemConfig.findUnique.mockResolvedValue({
        id: "1",
        key: "maxRevisionCycles",
        value: 5,
        updatedAt: new Date(),
        updatedBy: null,
      });

      const result = await getConfigValue<number>("maxRevisionCycles");

      expect(result).toBe(5);
      expect(mockRedis.setex).toHaveBeenCalled();
    });

    it("returns default when not in cache or DB", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrismaSystemConfig.findUnique.mockResolvedValue(null);

      const result = await getConfigValue<number>("maxRevisionCycles");

      expect(result).toBe(3); // default
    });

    it("returns default for approvalTimeoutMs", async () => {
      mockRedis.get.mockResolvedValue(null);
      mockPrismaSystemConfig.findUnique.mockResolvedValue(null);

      const result = await getConfigValue<number>("approvalTimeoutMs");

      expect(result).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe("setConfigValue", () => {
    it("upserts to DB and caches", async () => {
      mockPrismaSystemConfig.upsert.mockResolvedValue({});

      await setConfigValue("maxRevisionCycles", 5, "admin@test.com");

      expect(mockPrismaSystemConfig.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { key: "maxRevisionCycles" },
          update: expect.objectContaining({ updatedBy: "admin@test.com" }),
          create: expect.objectContaining({
            key: "maxRevisionCycles",
            updatedBy: "admin@test.com",
          }),
        })
      );
      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe("deleteConfigValue", () => {
    it("deletes from DB and clears cache", async () => {
      mockPrismaSystemConfig.deleteMany.mockResolvedValue({ count: 1 });

      await deleteConfigValue("maxRevisionCycles");

      expect(mockPrismaSystemConfig.deleteMany).toHaveBeenCalledWith({
        where: { key: "maxRevisionCycles" },
      });
      expect(mockRedis.del).toHaveBeenCalledWith("sysconfig:maxRevisionCycles");
    });
  });

  describe("getAllConfigValues", () => {
    it("returns merged defaults + DB values", async () => {
      mockPrismaSystemConfig.findMany.mockResolvedValue([
        { key: "maxRevisionCycles", value: 5 },
      ]);

      const result = await getAllConfigValues();

      expect(result.maxRevisionCycles).toBe(5);
      expect(result.approvalTimeoutMs).toBe(24 * 60 * 60 * 1000); // default
      expect(result.maxConcurrentTasksPerEpic).toBe(3); // default
    });
  });

  describe("invalidateConfigCache", () => {
    it("deletes all config cache keys", async () => {
      const pipeline = {
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(pipeline);

      await invalidateConfigCache();

      expect(pipeline.del).toHaveBeenCalledTimes(3); // 3 config keys
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });
});
