import type { AgentMessage } from "@/types/agent-protocol";
import { AgentMessageSchema } from "@/types/agent-protocol";
import { parseOrThrow } from "@/lib/validation";
import { logger } from "@/lib/logger";

type MessageKind = AgentMessage["kind"];

type ExtractMessage<K extends MessageKind> = Extract<AgentMessage, { kind: K }>;

type MessageHandler = (
  message: AgentMessage
) => void | Promise<void>;

interface Subscription {
  kind: MessageKind;
  handler: MessageHandler;
}

/**
 * Typed pub/sub message bus for inter-agent communication.
 * All messages are validated via Zod before dispatch.
 * Handler errors are isolated — one agent's failure doesn't crash the bus.
 */
export class MessageBus {
  private readonly subscriptions: Subscription[] = [];

  /**
   * Subscribe to messages of a specific kind.
   * The handler receives only messages matching the subscribed kind.
   */
  subscribe<K extends MessageKind>(
    kind: K,
    handler: (message: ExtractMessage<K>) => void | Promise<void>
  ): () => void {
    const subscription: Subscription = {
      kind,
      handler: handler as MessageHandler,
    };
    this.subscriptions.push(subscription);

    logger.info(`Subscription added for message kind: ${kind}`);

    // Return unsubscribe function
    return () => {
      const index = this.subscriptions.indexOf(subscription);
      if (index !== -1) {
        this.subscriptions.splice(index, 1);
        logger.info(`Subscription removed for message kind: ${kind}`);
      }
    };
  }

  /**
   * Publish a message to all subscribers of its kind.
   * The message is validated before dispatch.
   * Handler errors are caught and logged, not propagated.
   */
  async publish(raw: unknown): Promise<void> {
    const message = parseOrThrow(AgentMessageSchema, raw);

    logger.info(`Publishing message: ${message.kind} (id: ${message.id})`);

    const matchingSubscriptions = this.subscriptions.filter(
      (sub) => sub.kind === message.kind
    );

    const results = await Promise.allSettled(
      matchingSubscriptions.map(async (sub) => {
        await sub.handler(message);
      })
    );

    for (const result of results) {
      if (result.status === "rejected") {
        logger.error(`Message handler failed for ${message.kind}`, {
          error: String(result.reason),
        });
      }
    }
  }

  /**
   * Get count of active subscriptions.
   */
  get subscriptionCount(): number {
    return this.subscriptions.length;
  }
}
