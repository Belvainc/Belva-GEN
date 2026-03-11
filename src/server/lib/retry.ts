import { TimeoutError } from "@/lib/errors";

// ─── Retry with Exponential Backoff ──────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (including the first try). */
  readonly maxAttempts: number;
  /** Base delay in ms before first retry. */
  readonly baseDelayMs: number;
  /** Maximum delay cap in ms. */
  readonly maxDelayMs: number;
  /** AbortSignal to cancel retries. */
  readonly signal?: AbortSignal;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

/**
 * Execute a function with exponential backoff and jitter.
 * Respects AbortSignal for cancellation.
 *
 * @throws The last error if all attempts fail.
 * @throws TimeoutError if aborted via signal.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    if (opts.signal?.aborted === true) {
      throw new TimeoutError("Operation aborted", 0);
    }

    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxAttempts) {
        break;
      }

      // Exponential backoff with jitter
      const exponentialDelay = opts.baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * exponentialDelay * 0.1;
      const delay = Math.min(exponentialDelay + jitter, opts.maxDelayMs);

      await sleep(delay, opts.signal);
    }
  }

  throw lastError;
}

/**
 * Sleep for a given duration, cancellable via AbortSignal.
 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new TimeoutError("Operation aborted during backoff", ms));
      return;
    }

    const timer = setTimeout(resolve, ms);

    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(new TimeoutError("Operation aborted during backoff", ms));
      },
      { once: true }
    );
  });
}
