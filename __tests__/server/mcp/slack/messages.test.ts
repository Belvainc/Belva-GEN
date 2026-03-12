import {
  buildApprovalRequestPayload,
  buildStatusUpdatePayload,
  buildGenericNotificationPayload,
  type ApprovalRequestParams,
  type StatusUpdateParams,
  type GenericNotificationParams,
} from "@/server/mcp/slack/messages";
import { SlackWebhookPayloadSchema } from "@/server/mcp/slack/schemas";

describe("buildApprovalRequestPayload", () => {
  const defaultParams: ApprovalRequestParams = {
    ticketRef: "BELVA-123",
    title: "Add user authentication feature",
    riskLevel: "medium",
    dashboardUrl: "https://dashboard.example.com/approvals/BELVA-123",
  };

  it("produces valid Slack webhook payload", () => {
    const payload = buildApprovalRequestPayload(defaultParams);

    expect(() => SlackWebhookPayloadSchema.parse(payload)).not.toThrow();
  });

  it("includes fallback text with ticket reference", () => {
    const payload = buildApprovalRequestPayload(defaultParams);

    expect(payload.text).toContain("BELVA-123");
  });

  it("includes header block with ticket reference and title", () => {
    const payload = buildApprovalRequestPayload(defaultParams);

    expect(payload.blocks).toBeDefined();
    const headerBlock = payload.blocks?.find((b) => b.type === "header");
    expect(headerBlock?.text?.text).toContain("BELVA-123");
    expect(headerBlock?.text?.text).toContain("Add user authentication");
  });

  it("truncates long titles", () => {
    const longTitle = "A".repeat(150);
    const payload = buildApprovalRequestPayload({
      ...defaultParams,
      title: longTitle,
    });

    const headerBlock = payload.blocks?.find((b) => b.type === "header");
    expect(headerBlock?.text?.text?.length).toBeLessThan(120);
    expect(headerBlock?.text?.text).toContain("...");
  });

  describe("risk level indicators", () => {
    it("shows green emoji for low risk", () => {
      const payload = buildApprovalRequestPayload({
        ...defaultParams,
        riskLevel: "low",
      });

      const sectionBlock = payload.blocks?.find((b) => b.type === "section");
      expect(sectionBlock?.text?.text).toContain("🟢");
      expect(sectionBlock?.text?.text).toContain("Low");
    });

    it("shows yellow emoji for medium risk", () => {
      const payload = buildApprovalRequestPayload({
        ...defaultParams,
        riskLevel: "medium",
      });

      const sectionBlock = payload.blocks?.find((b) => b.type === "section");
      expect(sectionBlock?.text?.text).toContain("🟡");
      expect(sectionBlock?.text?.text).toContain("Medium");
    });

    it("shows red emoji for high risk", () => {
      const payload = buildApprovalRequestPayload({
        ...defaultParams,
        riskLevel: "high",
      });

      const sectionBlock = payload.blocks?.find((b) => b.type === "section");
      expect(sectionBlock?.text?.text).toContain("🔴");
      expect(sectionBlock?.text?.text).toContain("High");
    });
  });

  it("includes action button with dashboard URL", () => {
    const payload = buildApprovalRequestPayload(defaultParams);

    const actionsBlock = payload.blocks?.find((b) => b.type === "actions");
    expect(actionsBlock?.elements).toBeDefined();

    const button = actionsBlock?.elements?.[0] as Record<string, unknown>;
    expect(button?.url).toBe(defaultParams.dashboardUrl);
    expect(button?.style).toBe("primary");
  });

  it("includes color attachment based on risk level", () => {
    const payload = buildApprovalRequestPayload({
      ...defaultParams,
      riskLevel: "high",
    });

    expect(payload.attachments).toBeDefined();
    expect(payload.attachments?.[0]?.color).toBe("#dc3545"); // red
  });
});

describe("buildStatusUpdatePayload", () => {
  const defaultParams: StatusUpdateParams = {
    ticketRef: "BELVA-456",
    status: "approved",
    message: "Plan approved by @james",
  };

  it("produces valid Slack webhook payload", () => {
    const payload = buildStatusUpdatePayload(defaultParams);

    expect(() => SlackWebhookPayloadSchema.parse(payload)).not.toThrow();
  });

  it("includes ticket reference and message in text", () => {
    const payload = buildStatusUpdatePayload(defaultParams);

    expect(payload.text).toContain("BELVA-456");
    expect(payload.text).toContain("Plan approved");
  });

  describe("status emojis", () => {
    it("shows checkmark for approved", () => {
      const payload = buildStatusUpdatePayload({
        ...defaultParams,
        status: "approved",
      });

      expect(payload.text).toContain("✅");
    });

    it("shows X for rejected", () => {
      const payload = buildStatusUpdatePayload({
        ...defaultParams,
        status: "rejected",
      });

      expect(payload.text).toContain("❌");
    });

    it("shows celebration for completed", () => {
      const payload = buildStatusUpdatePayload({
        ...defaultParams,
        status: "completed",
      });

      expect(payload.text).toContain("🎉");
    });

    it("shows warning for failed", () => {
      const payload = buildStatusUpdatePayload({
        ...defaultParams,
        status: "failed",
      });

      expect(payload.text).toContain("⚠️");
    });
  });
});

describe("buildGenericNotificationPayload", () => {
  const defaultParams: GenericNotificationParams = {
    title: "System Alert",
    message: "Database backup completed successfully",
    level: "success",
  };

  it("produces valid Slack webhook payload", () => {
    const payload = buildGenericNotificationPayload(defaultParams);

    expect(() => SlackWebhookPayloadSchema.parse(payload)).not.toThrow();
  });

  it("includes header with title", () => {
    const payload = buildGenericNotificationPayload(defaultParams);

    const headerBlock = payload.blocks?.find((b) => b.type === "header");
    expect(headerBlock?.text?.text).toContain("System Alert");
  });

  it("includes message in section block", () => {
    const payload = buildGenericNotificationPayload(defaultParams);

    const sectionBlock = payload.blocks?.find((b) => b.type === "section");
    expect(sectionBlock?.text?.text).toContain("Database backup");
  });

  describe("level indicators", () => {
    it("shows info emoji for info level", () => {
      const payload = buildGenericNotificationPayload({
        ...defaultParams,
        level: "info",
      });

      expect(payload.text).toContain("ℹ️");
    });

    it("shows success emoji for success level", () => {
      const payload = buildGenericNotificationPayload({
        ...defaultParams,
        level: "success",
      });

      expect(payload.text).toContain("✅");
    });

    it("shows warning emoji for warning level", () => {
      const payload = buildGenericNotificationPayload({
        ...defaultParams,
        level: "warning",
      });

      expect(payload.text).toContain("⚠️");
    });

    it("shows error emoji for error level", () => {
      const payload = buildGenericNotificationPayload({
        ...defaultParams,
        level: "error",
      });

      expect(payload.text).toContain("🚨");
    });
  });
});
