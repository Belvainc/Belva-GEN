import {
  SlackNotificationClient,
  SlackNotificationClientStub,
} from "@/server/mcp/slack/client";
import type { SlackWebhookPayload } from "@/server/mcp/slack/types";

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe("SlackNotificationClient", () => {
  const webhookUrl = "https://hooks.slack.com/services/T123/B456/abc123";
  let client: SlackNotificationClient;

  beforeEach(() => {
    client = new SlackNotificationClient({ webhookUrl });
    mockFetch.mockReset();
  });

  describe("send()", () => {
    const validPayload: SlackWebhookPayload = {
      text: "Test notification",
    };

    it("sends POST request to webhook URL", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      await client.send(validPayload);

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validPayload),
        })
      );
    });

    it("sends payload with blocks", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });

      const payloadWithBlocks: SlackWebhookPayload = {
        text: "Fallback text",
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: "Hello *world*" },
          },
        ],
      };

      await client.send(payloadWithBlocks);

      expect(mockFetch).toHaveBeenCalledWith(
        webhookUrl,
        expect.objectContaining({
          body: JSON.stringify(payloadWithBlocks),
        })
      );
    });

    it("throws error on non-2xx response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => "invalid_payload",
      });

      await expect(client.send(validPayload)).rejects.toThrow(
        "Slack webhook failed: 400 Bad Request - invalid_payload"
      );
    });

    it("validates payload before sending", async () => {
      const invalidPayload = {
        blocks: [{ type: 123 }], // type should be string
      } as unknown as SlackWebhookPayload;

      await expect(client.send(invalidPayload)).rejects.toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("respects AbortSignal", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        client.send(validPayload, controller.signal)
      ).rejects.toThrow();
    });

    it("retries on transient failures", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: "Internal Server Error",
          text: async () => "server error",
        })
        .mockResolvedValueOnce({ ok: true });

      await client.send(validPayload);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe("SlackNotificationClientStub", () => {
  let stub: SlackNotificationClientStub;

  beforeEach(() => {
    stub = new SlackNotificationClientStub();
    mockFetch.mockReset();
  });

  describe("send()", () => {
    it("does not call fetch", async () => {
      await stub.send({ text: "Test message" });

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("validates payload structure", async () => {
      const invalidPayload = {
        blocks: [{ type: 123 }],
      } as unknown as SlackWebhookPayload;

      await expect(stub.send(invalidPayload)).rejects.toThrow();
    });

    it("accepts valid payload with blocks", async () => {
      const payload: SlackWebhookPayload = {
        text: "Test",
        blocks: [
          {
            type: "section",
            text: { type: "plain_text", text: "Hello" },
          },
        ],
      };

      await expect(stub.send(payload)).resolves.toBeUndefined();
    });
  });
});
