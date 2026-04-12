import { useCallback } from 'react';
import { log } from '../services/logger';

export interface CircuitBreakerState {
  failures: Record<number, number>;
  lastFailureTime: Record<number, number>;
  isOpen: Record<number, boolean>;
  consecutiveFailures: Record<number, number>;
}

export interface CircuitBreakerManager {
  isCircuitOpen: (page: number) => boolean;
  recordFailure: (page: number) => void;
  recordSuccess: (page: number) => void;
  getBreaker: () => CircuitBreakerState;
}

const createBreakerState = (): CircuitBreakerState => ({
  failures: {},
  lastFailureTime: {},
  isOpen: {},
  consecutiveFailures: {}
});

// Global registry for Circuit Breaker state (per-project persistence)
const globalCircuitBreakerRegistry: Record<string, CircuitBreakerState> = {};

export const useCircuitBreaker = (projectId: string | null): CircuitBreakerManager => {
  const CIRCUIT_BREAKER_THRESHOLD = 3; // Max consecutive failures before opening circuit
  const CIRCUIT_BREAKER_TIMEOUT = 30000; // 30 seconds before trying again

  const getBreaker = useCallback((): CircuitBreakerState => {
    const key = projectId || 'default';
    if (!globalCircuitBreakerRegistry[key]) {
      globalCircuitBreakerRegistry[key] = createBreakerState();
    }
    return globalCircuitBreakerRegistry[key];
  }, [projectId]);

  const isCircuitOpen = useCallback((page: number): boolean => {
    const breaker = getBreaker();
    const now = Date.now();

    // Check if circuit is open and timeout has passed
    if (breaker.isOpen[page]) {
      const lastFailure = breaker.lastFailureTime[page];
      if (now - lastFailure > CIRCUIT_BREAKER_TIMEOUT) {
        // Reset circuit breaker
        breaker.isOpen[page] = false;
        breaker.consecutiveFailures[page] = 0;
        log.info(`[CIRCUIT] Circuit breaker reset for page ${page} after timeout`);
        return false;
      }
      return true;
    }

    return false;
  }, [getBreaker]);

  const recordFailure = useCallback((page: number): void => {
    const breaker = getBreaker();
    const now = Date.now();

    breaker.failures[page] = (breaker.failures[page] || 0) + 1;
    breaker.lastFailureTime[page] = now;
    breaker.consecutiveFailures[page] = (breaker.consecutiveFailures[page] || 0) + 1;

    log.warning(`[CIRCUIT] Failure recorded for page ${page} (consecutive: ${breaker.consecutiveFailures[page]})`);

    // Open circuit if threshold reached
    if (breaker.consecutiveFailures[page] >= CIRCUIT_BREAKER_THRESHOLD) {
      breaker.isOpen[page] = true;
      log.error(`[CIRCUIT] Circuit breaker OPENED for page ${page} after ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures`);
    }
  }, [getBreaker]);

  const recordSuccess = useCallback((page: number): void => {
    const breaker = getBreaker();

    if (breaker.consecutiveFailures[page] > 0) {
      log.info(`[CIRCUIT] Success recorded for page ${page}, resetting consecutive failure count`);
    }

    // Reset consecutive failures on success
    breaker.consecutiveFailures[page] = 0;
    breaker.isOpen[page] = false;
  }, [getBreaker]);

  return {
    isCircuitOpen,
    recordFailure,
    recordSuccess,
    getBreaker
  };
};

export const __resetCircuitBreakerRegistryForTests = () => {
  for (const key in globalCircuitBreakerRegistry) {
    delete globalCircuitBreakerRegistry[key];
  }
};
