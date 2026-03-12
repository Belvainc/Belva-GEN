import { evaluateDoR } from "@/server/services/gates/dor-validation";
import {
  checkBDDFormat,
  checkStoryPoints,
  checkStoryPointsWarning,
  checkOutOfScope,
  checkTitleLength,
  checkBugReproductionSteps,
  checkBugExpectedActual,
} from "@/server/services/gates/dor-rules";
import {
  createValidTicket,
  createInvalidTicket,
  createBugTicket,
} from "@/../__fixtures__/gates";

describe("evaluateDoR", () => {
  describe("valid tickets", () => {
    it("passes ticket with all required fields", async () => {
      const result = await evaluateDoR(createValidTicket());
      expect(result.passed).toBe(true);
      expect(result.gateType).toBe("dor");
      expect(
        result.violations.filter((v) => v.severity === "error")
      ).toHaveLength(0);
    });

    it("passes bug ticket with reproduction steps", async () => {
      const result = await evaluateDoR(createBugTicket());
      expect(result.passed).toBe(true);
    });

    it("includes ticketRef in result", async () => {
      const ticket = createValidTicket({ key: "BELVA-123" });
      const result = await evaluateDoR(ticket);
      expect(result.ticketRef).toBe("BELVA-123");
    });

    it("includes evaluatedAt timestamp", async () => {
      const result = await evaluateDoR(createValidTicket());
      expect(result.evaluatedAt).toBeDefined();
      expect(() => new Date(result.evaluatedAt)).not.toThrow();
    });
  });

  describe("invalid tickets", () => {
    it("fails ticket missing BDD acceptance criteria", async () => {
      const ticket = createValidTicket({
        acceptanceCriteria: "It should work correctly",
      });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "bdd-format", severity: "error" })
      );
    });

    it("fails ticket without story points", async () => {
      const ticket = createValidTicket({ storyPoints: null });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "story-points-required" })
      );
    });

    it("fails ticket with invalid story point value", async () => {
      const ticket = createValidTicket({ storyPoints: 7 }); // Not Fibonacci
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "story-points-fibonacci" })
      );
    });

    it("fails ticket without out-of-scope section", async () => {
      const ticket = createValidTicket({
        description: "Description without required section",
      });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "out-of-scope-section" })
      );
    });

    it("fails ticket with title exceeding 100 characters", async () => {
      const ticket = createValidTicket({ summary: "A".repeat(150) });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "title-length" })
      );
    });

    it("fails bug ticket without reproduction steps", async () => {
      const ticket = createBugTicket({
        description: `## Context
Bug description

## Expected Behavior
Should work

## Actual Behavior
Does not work

## Out-of-Scope
Nothing`,
      });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "bug-reproduction-steps" })
      );
    });

    it("fails bug ticket without expected/actual behavior", async () => {
      const ticket = createBugTicket({
        description: `## Context
Bug description

## Reproduction Steps
1. Do something
2. See error

## Out-of-Scope
Nothing`,
      });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(false);
      expect(result.violations).toContainEqual(
        expect.objectContaining({ rule: "bug-expected-actual" })
      );
    });

    it("collects multiple violations", async () => {
      const result = await evaluateDoR(createInvalidTicket());
      expect(result.passed).toBe(false);
      expect(result.violations.length).toBeGreaterThan(1);
    });
  });

  describe("warnings", () => {
    it("generates warning for large story points but still passes", async () => {
      const ticket = createValidTicket({ storyPoints: 13 });
      const result = await evaluateDoR(ticket);
      expect(result.passed).toBe(true);
      expect(result.violations).toContainEqual(
        expect.objectContaining({
          rule: "story-points-large",
          severity: "warning",
        })
      );
    });
  });
});

describe("DoR individual rules", () => {
  describe("checkBDDFormat", () => {
    it("returns null for valid BDD format", () => {
      const ticket = createValidTicket();
      expect(checkBDDFormat(ticket)).toBeNull();
    });

    it("returns violation for missing GIVEN", () => {
      const ticket = createValidTicket({
        acceptanceCriteria: "WHEN something THEN result",
      });
      const violation = checkBDDFormat(ticket);
      expect(violation).not.toBeNull();
      expect(violation?.rule).toBe("bdd-format");
    });

    it("returns violation for missing WHEN", () => {
      const ticket = createValidTicket({
        acceptanceCriteria: "GIVEN something THEN result",
      });
      expect(checkBDDFormat(ticket)).not.toBeNull();
    });

    it("returns violation for missing THEN", () => {
      const ticket = createValidTicket({
        acceptanceCriteria: "GIVEN something WHEN action",
      });
      expect(checkBDDFormat(ticket)).not.toBeNull();
    });

    it("is case-insensitive", () => {
      const ticket = createValidTicket({
        acceptanceCriteria: "given context when action then result",
      });
      expect(checkBDDFormat(ticket)).toBeNull();
    });
  });

  describe("checkStoryPoints", () => {
    it("returns null for valid Fibonacci value", () => {
      const ticket = createValidTicket({ storyPoints: 8 });
      expect(checkStoryPoints(ticket)).toBeNull();
    });

    it.each([1, 2, 3, 5, 8, 13])("accepts Fibonacci value %i", (points) => {
      const ticket = createValidTicket({ storyPoints: points });
      expect(checkStoryPoints(ticket)).toBeNull();
    });

    it("returns violation for null story points", () => {
      const ticket = createValidTicket({ storyPoints: null });
      expect(checkStoryPoints(ticket)?.rule).toBe("story-points-required");
    });

    it.each([4, 6, 7, 9, 10, 11, 12, 14])(
      "returns violation for non-Fibonacci value %i",
      (points) => {
        const ticket = createValidTicket({ storyPoints: points });
        expect(checkStoryPoints(ticket)?.rule).toBe("story-points-fibonacci");
      }
    );
  });

  describe("checkStoryPointsWarning", () => {
    it("returns null for story points <= 8", () => {
      const ticket = createValidTicket({ storyPoints: 8 });
      expect(checkStoryPointsWarning(ticket)).toBeNull();
    });

    it("returns warning for story points > 8", () => {
      const ticket = createValidTicket({ storyPoints: 13 });
      const violation = checkStoryPointsWarning(ticket);
      expect(violation?.severity).toBe("warning");
    });

    it("returns null for null story points", () => {
      const ticket = createValidTicket({ storyPoints: null });
      expect(checkStoryPointsWarning(ticket)).toBeNull();
    });
  });

  describe("checkOutOfScope", () => {
    it("returns null when out-of-scope section exists", () => {
      const ticket = createValidTicket();
      expect(checkOutOfScope(ticket)).toBeNull();
    });

    it("accepts various formats", () => {
      const formats = ["Out of Scope", "Out-of-Scope", "OutOfScope", "out of scope"];
      for (const format of formats) {
        const ticket = createValidTicket({ description: `## ${format}\nNothing` });
        expect(checkOutOfScope(ticket)).toBeNull();
      }
    });

    it("returns violation when section missing", () => {
      const ticket = createValidTicket({ description: "No sections here" });
      expect(checkOutOfScope(ticket)?.rule).toBe("out-of-scope-section");
    });
  });

  describe("checkTitleLength", () => {
    it("returns null for title <= 100 chars", () => {
      const ticket = createValidTicket({ summary: "A".repeat(100) });
      expect(checkTitleLength(ticket)).toBeNull();
    });

    it("returns violation for title > 100 chars", () => {
      const ticket = createValidTicket({ summary: "A".repeat(101) });
      expect(checkTitleLength(ticket)?.rule).toBe("title-length");
    });
  });

  describe("checkBugReproductionSteps", () => {
    it("returns null for non-bug tickets", () => {
      const ticket = createValidTicket({ labels: ["feature"], summary: "Add feature" });
      expect(checkBugReproductionSteps(ticket)).toBeNull();
    });

    it("returns null for bug ticket with repro steps", () => {
      const ticket = createBugTicket();
      expect(checkBugReproductionSteps(ticket)).toBeNull();
    });

    it("detects bug by label", () => {
      const ticket = createValidTicket({
        labels: ["bug"],
        description: "Bug description without required sections\n## Out-of-Scope\nNothing",
      });
      expect(checkBugReproductionSteps(ticket)?.rule).toBe("bug-reproduction-steps");
    });

    it("detects bug by title containing fix", () => {
      const ticket = createValidTicket({
        summary: "Fix the broken thing",
        labels: [],
        description: "Bug description without required sections\n## Out-of-Scope\nNothing",
      });
      expect(checkBugReproductionSteps(ticket)?.rule).toBe("bug-reproduction-steps");
    });
  });

  describe("checkBugExpectedActual", () => {
    it("returns null for non-bug tickets", () => {
      const ticket = createValidTicket();
      expect(checkBugExpectedActual(ticket)).toBeNull();
    });

    it("returns null when expected and actual present", () => {
      const ticket = createBugTicket();
      expect(checkBugExpectedActual(ticket)).toBeNull();
    });

    it("returns violation when expected missing", () => {
      const ticket = createBugTicket({
        description: `## Reproduction Steps
1. Do thing

## Actual Behavior
Broken

## Out-of-Scope
Nothing`,
      });
      expect(checkBugExpectedActual(ticket)?.rule).toBe("bug-expected-actual");
    });
  });
});
