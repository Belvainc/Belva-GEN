import { AgentCommunicationError } from "@/lib/errors";

// ─── Circuit Breaker ─────────────────────────────────────────────────────────
// Protects external service calls (MCP clients) from cascading failures.
// States: CLOSED → OPEN (after N failures) → HALF_OPEN (probe) → CLOSED.

type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Name for logging/identification. */
  readonly name: string;
  /** Number of failures before opening the circuit. */
  readonly failureThreshold: number;
  /** Time in ms to wait before probing a half-open circuit. */
  readonly cooldownMs: number;
  /** Rolling window in ms for counting failures. */
  readonly monitorWindowMs: number;
}

const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  name: "unnamed",
  failureThreshold: 5,
  cooldownMs: 30_000,
  monitorWindowMs: 60_000,
};

export class CircuitBreaker {
  private readonly options: CircuitBreakerOptions;
  private state: CircuitState = "closed";
  private failures: number[] = [];
  private lastFailureTime = 0;

  constructor(options?: Partial<CircuitBreakerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function through the circuit breaker.
   * @throws AgentCommunicationError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.shouldProbe()) {
        this.state = "half-open";
      } else {
        throw new AgentCommunicationError(
          `Circuit breaker "${this.options.name}" is open — service unavailable`,
          this.options.name
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get the number of failures within the monitor window.
   */
  getFailureCount(): number {
    this.pruneOldFailures();
    return this.failures.length;
  }

  /**
   * Manually reset the circuit breaker to closed state.
   */
  reset(): void {
    this.state = "closed";
    this.failures = [];
    this.lastFailureTime = 0;
  }

  private onSuccess(): void {
    if (this.state === "half-open") {
      this.reset();
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailureTime = now;
    this.pruneOldFailures();

    if (this.failures.length >= this.options.failureThreshold) {
      this.state = "open";
    }
  }

  private shouldProbe(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.cooldownMs;
  }

  private pruneOldFailures(): void {
    const cutoff = Date.now() - this.options.monitorWindowMs;
    this.failures = this.failures.filter((t) => t > cutoff);
  }
}
