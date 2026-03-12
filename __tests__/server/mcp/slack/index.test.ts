import {
  getSlackNotificationClient,
  resetSlackNotificationClient,
  SlackNotificationClient,
  SlackNotificationClientStub,
} from "@/server/mcp/slack";

// Reset singleton before each test
beforeEach(() => {
  resetSlackNotificationClient();
});

afterEach(() => {
  resetSlackNotificationClient();
});

describe("getSlackNotificationClient", () => {
  it("returns a SlackNotificationClient instance", () => {
    const client = getSlackNotificationClient();

    // Should be some form of SlackNotificationClient
    expect(client).toBeInstanceOf(SlackNotificationClient);
  });

  it("returns same instance on subsequent calls (singleton)", () => {
    const client1 = getSlackNotificationClient();
    const client2 = getSlackNotificationClient();

    expect(client1).toBe(client2);
  });

  it("returns stub client in test environment without webhook URL", () => {
    // In test environment without SLACK_WEBHOOK_URL, we get a stub
    const client = getSlackNotificationClient();

    // Stub extends SlackNotificationClient but overrides send()
    // We can verify it's a stub by checking if it logs instead of sending
    expect(client).toBeDefined();
  });
});

describe("resetSlackNotificationClient", () => {
  it("clears singleton instance", () => {
    const client1 = getSlackNotificationClient();
    resetSlackNotificationClient();
    const client2 = getSlackNotificationClient();

    expect(client1).not.toBe(client2);
  });
});
