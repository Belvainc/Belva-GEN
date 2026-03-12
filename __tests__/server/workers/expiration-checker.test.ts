import { checkExpiringApprovals } from "@/server/workers/expiration-checker";

// Mock dependencies
jest.mock("@/server/db/client", () => ({
  prisma: {
    approval: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

jest.mock("@/server/mcp/slack", () => ({
  getSlackNotificationClient: jest.fn(),
}));

jest.mock("@/server/config/env", () => ({
  getEnv: jest.fn(() => ({
    DASHBOARD_URL: "https://dashboard.example.com",
  })),
}));

jest.mock("@/server/config/logger", () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

import { prisma } from "@/server/db/client";
import { getSlackNotificationClient } from "@/server/mcp/slack";

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockGetSlackClient = getSlackNotificationClient as jest.Mock;

// ─── Test Fixtures ────────────────────────────────────────────────────────────

function createApproval(overrides: Partial<{
  id: string;
  pipelineId: string;
  status: string;
  expiresAt: Date;
}> = {}) {
  return {
    id: overrides.id ?? "approval-1",
    pipelineId: overrides.pipelineId ?? "pipeline-1",
    status: overrides.status ?? "PENDING",
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("checkExpiringApprovals", () => {
  let mockSlackSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSlackSend = jest.fn().mockResolvedValue({});
    mockGetSlackClient.mockReturnValue({ send: mockSlackSend });

    // Default: no approvals
    (mockPrisma.approval.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.approval.update as jest.Mock).mockResolvedValue({});
    (mockPrisma.auditLog.create as jest.Mock).mockResolvedValue({});
  });

  it("returns zeroes when no approvals need attention", async () => {
    const result = await checkExpiringApprovals();

    expect(result.soonToExpire).toBe(0);
    expect(result.expired).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  describe("soon-to-expire approvals", () => {
    it("sends reminder for approvals expiring soon", async () => {
      const approval = createApproval({ id: "approval-soon" });

      // First query returns soon-to-expire, second returns none
      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([approval])
        .mockResolvedValueOnce([]);

      const result = await checkExpiringApprovals();

      expect(result.soonToExpire).toBe(1);
      expect(mockSlackSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("expires in less than 1 hour"),
        })
      );
    });

    it("includes dashboard link in reminder", async () => {
      const approval = createApproval({ id: "approval-123" });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([approval])
        .mockResolvedValueOnce([]);

      await checkExpiringApprovals();

      expect(mockSlackSend).toHaveBeenCalledWith(
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining(
                  "https://dashboard.example.com/dashboard/approvals?id=approval-123"
                ),
              }),
            }),
          ]),
        })
      );
    });

    it("captures reminder errors but continues processing", async () => {
      const approval1 = createApproval({ id: "approval-1" });
      const approval2 = createApproval({ id: "approval-2" });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([approval1, approval2])
        .mockResolvedValueOnce([]);

      mockSlackSend
        .mockRejectedValueOnce(new Error("Slack API error"))
        .mockResolvedValueOnce({});

      const result = await checkExpiringApprovals();

      expect(result.soonToExpire).toBe(1); // One succeeded
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain("approval-1");
    });
  });

  describe("expired approvals", () => {
    it("extends expired approvals by 24 hours", async () => {
      const expiredApproval = createApproval({
        id: "expired-1",
        expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiredApproval]);

      await checkExpiringApprovals();

      expect(mockPrisma.approval.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "expired-1" },
          data: expect.objectContaining({
            expiresAt: expect.any(Date),
          }),
        })
      );

      // Verify extension is roughly 24 hours from now
      const updateCall = (mockPrisma.approval.update as jest.Mock).mock.calls[0][0];
      const newExpiresAt = updateCall.data.expiresAt as Date;
      const expectedMin = Date.now() + 23 * 60 * 60 * 1000;
      const expectedMax = Date.now() + 25 * 60 * 60 * 1000;

      expect(newExpiresAt.getTime()).toBeGreaterThan(expectedMin);
      expect(newExpiresAt.getTime()).toBeLessThan(expectedMax);
    });

    it("sends expiration notification with 'no auto-approval' messaging", async () => {
      const expiredApproval = createApproval({
        id: "expired-1",
        expiresAt: new Date(Date.now() - 1000),
      });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiredApproval]);

      await checkExpiringApprovals();

      expect(mockSlackSend).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.stringContaining("expired"),
          blocks: expect.arrayContaining([
            expect.objectContaining({
              text: expect.objectContaining({
                text: expect.stringContaining("no auto-approval"),
              }),
            }),
          ]),
        })
      );
    });

    it("creates audit log for expired approvals", async () => {
      const expiredApproval = createApproval({
        id: "expired-1",
        pipelineId: "pipeline-xyz",
        expiresAt: new Date(Date.now() - 1000),
      });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiredApproval]);

      await checkExpiringApprovals();

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "approval.expired",
            entityType: "Approval",
            entityId: "expired-1",
            payload: expect.objectContaining({
              pipelineId: "pipeline-xyz",
              newExpiresAt: expect.any(String),
            }),
          }),
        })
      );
    });

    it("NEVER auto-approves (status remains PENDING)", async () => {
      const expiredApproval = createApproval({
        id: "expired-1",
        status: "PENDING",
        expiresAt: new Date(Date.now() - 1000),
      });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([expiredApproval]);

      await checkExpiringApprovals();

      // The update call should only contain expiresAt, NOT status
      const updateCall = (mockPrisma.approval.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty("status");
      expect(updateCall.data).toHaveProperty("expiresAt");
    });
  });

  describe("error handling", () => {
    it("captures database query errors", async () => {
      (mockPrisma.approval.findMany as jest.Mock)
        .mockRejectedValueOnce(new Error("DB connection failed"));

      const result = await checkExpiringApprovals();

      expect(result.errors).toContainEqual(
        expect.stringContaining("Query for soon-to-expire failed")
      );
    });

    it("continues processing expired even if soon-to-expire query fails", async () => {
      const expiredApproval = createApproval({
        id: "expired-1",
        expiresAt: new Date(Date.now() - 1000),
      });

      (mockPrisma.approval.findMany as jest.Mock)
        .mockRejectedValueOnce(new Error("DB error on first query"))
        .mockResolvedValueOnce([expiredApproval]);

      const result = await checkExpiringApprovals();

      expect(result.errors).toHaveLength(1);
      expect(result.expired).toBe(1);
    });
  });
});
