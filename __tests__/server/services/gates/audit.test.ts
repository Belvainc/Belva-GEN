import { logGateDecision } from "@/server/services/gates/audit";
import { prisma } from "@/server/db/client";
import type { GateResult } from "@/types/gates";

// Mock Prisma
jest.mock("@/server/db/client", () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// Mock logger to prevent console output
jest.mock("@/lib/logger", () => ({
  createAgentLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe("logGateDecision", () => {
  const mockCreate = prisma.auditLog.create as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("passing gates", () => {
    it("logs DoR pass decision", async () => {
      const result: GateResult = {
        gateType: "dor",
        ticketRef: "BELVA-042",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [],
      };

      await logGateDecision(result, "node-backend");

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "gate.dor.passed",
          entityType: "pipeline",
          entityId: "BELVA-042",
          agentId: "node-backend",
        }),
      });
    });

    it("logs DoD pass decision", async () => {
      const result: GateResult = {
        gateType: "dod",
        ticketRef: "BELVA-043",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [],
      };

      await logGateDecision(result);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "gate.dod.passed",
          entityType: "pipeline",
          entityId: "BELVA-043",
        }),
      });
    });
  });

  describe("failing gates", () => {
    it("logs DoR fail decision", async () => {
      const result: GateResult = {
        gateType: "dor",
        ticketRef: "BELVA-044",
        passed: false,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [
          {
            rule: "bdd-format",
            description: "Missing Given/When/Then",
            severity: "error",
          },
        ],
      };

      await logGateDecision(result);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "gate.dor.failed",
          entityType: "pipeline",
          entityId: "BELVA-044",
        }),
      });
    });

    it("logs DoD fail decision with violations", async () => {
      const result: GateResult = {
        gateType: "dod",
        ticketRef: "BELVA-045",
        passed: false,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [
          {
            rule: "tests-passing",
            description: "2 tests failing",
            severity: "error",
          },
          {
            rule: "coverage-threshold",
            description: "Coverage 65% below 80%",
            severity: "error",
          },
        ],
      };

      await logGateDecision(result);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "gate.dod.failed",
          payload: expect.objectContaining({
            violations: expect.arrayContaining([
              expect.objectContaining({ rule: "tests-passing" }),
              expect.objectContaining({ rule: "coverage-threshold" }),
            ]),
          }),
        }),
      });
    });
  });

  describe("payload serialization", () => {
    it("stores full gate result as payload", async () => {
      const result: GateResult = {
        gateType: "dor",
        ticketRef: "BELVA-046",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [
          {
            rule: "story-points-large",
            description: "Consider splitting",
            severity: "warning",
          },
        ],
      };

      await logGateDecision(result);

      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith?.data?.payload).toEqual(
        expect.objectContaining({
          gateType: "dor",
          ticketRef: "BELVA-046",
          passed: true,
          violations: expect.arrayContaining([
            expect.objectContaining({ rule: "story-points-large" }),
          ]),
        })
      );
    });

    it("includes evaluatedAt in payload", async () => {
      const timestamp = "2026-03-11T15:30:00.000Z";
      const result: GateResult = {
        gateType: "dod",
        ticketRef: "BELVA-047",
        passed: true,
        evaluatedAt: timestamp,
        violations: [],
      };

      await logGateDecision(result);

      const calledWith = mockCreate.mock.calls[0]?.[0];
      expect(calledWith?.data?.payload?.evaluatedAt).toBe(timestamp);
    });
  });

  describe("optional agentId", () => {
    it("includes agentId when provided", async () => {
      const result: GateResult = {
        gateType: "dor",
        ticketRef: "BELVA-048",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [],
      };

      await logGateDecision(result, "next-ux");

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: "next-ux",
        }),
      });
    });

    it("sets agentId to undefined when not provided", async () => {
      const result: GateResult = {
        gateType: "dor",
        ticketRef: "BELVA-049",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [],
      };

      await logGateDecision(result);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          agentId: undefined,
        }),
      });
    });
  });

  describe("human-approval gate type", () => {
    it("logs human-approval gate decisions", async () => {
      const result: GateResult = {
        gateType: "human-approval",
        ticketRef: "BELVA-050",
        passed: true,
        evaluatedAt: "2026-03-11T10:00:00.000Z",
        violations: [],
      };

      await logGateDecision(result);

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "gate.human-approval.passed",
        }),
      });
    });
  });
});
