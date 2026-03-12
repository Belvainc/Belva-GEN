export class ValidationError extends Error {
  public readonly code = "VALIDATION_ERROR" as const;

  constructor(
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export class GateFailedError extends Error {
  public readonly code = "GATE_FAILED" as const;

  constructor(
    message: string,
    public readonly gateType: string,
    public readonly violations: ReadonlyArray<{
      rule: string;
      description: string;
    }>
  ) {
    super(message);
    this.name = "GateFailedError";
  }
}

export class TimeoutError extends Error {
  public readonly code = "TIMEOUT" as const;

  constructor(
    message: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class AgentCommunicationError extends Error {
  public readonly code = "AGENT_COMMUNICATION_ERROR" as const;

  constructor(
    message: string,
    public readonly agentId: string
  ) {
    super(message);
    this.name = "AgentCommunicationError";
  }
}

export class NotFoundError extends Error {
  public readonly code = "NOT_FOUND" as const;

  constructor(
    message: string,
    public readonly entityType?: string,
    public readonly entityId?: string
  ) {
    super(message);
    this.name = "NotFoundError";
  }
}
