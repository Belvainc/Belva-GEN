import { CircuitBreaker } from "@/server/lib/circuit-breaker";

// ─── Circuit Breaker Registry ───────────────────────────────────────────────
// Singleton registry of all circuit breakers in the system.
// Used by the health dashboard to display circuit breaker states
// and allow manual resets from the admin portal.

const registry = new Map<string, CircuitBreaker>();

/**
 * Register a circuit breaker in the global registry.
 */
export function registerCircuitBreaker(
  name: string,
  breaker: CircuitBreaker
): void {
  registry.set(name, breaker);
}

/**
 * Get all registered circuit breakers.
 */
export function getAllCircuitBreakers(): Map<string, CircuitBreaker> {
  return registry;
}

/**
 * Get a circuit breaker by name.
 */
export function getCircuitBreaker(
  name: string
): CircuitBreaker | undefined {
  return registry.get(name);
}

/**
 * Reset a circuit breaker by name.
 * @returns true if the breaker was found and reset, false otherwise.
 */
export function resetCircuitBreaker(name: string): boolean {
  const breaker = registry.get(name);
  if (breaker === undefined) {
    return false;
  }
  breaker.reset();
  return true;
}
