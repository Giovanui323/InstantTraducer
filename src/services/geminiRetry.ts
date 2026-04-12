import { log } from './logger';

const pageRetryAttempts: Record<number, number> = {};
const pageRetryDelays: Record<number, number> = {};

export const getRetryDelay = (pageNumber: number): number => {
  const attempts = pageRetryAttempts[pageNumber] || 0;
  // Exponential backoff: 2^attempts * 1000ms, max 30 seconds
  return Math.min(Math.pow(2, attempts) * 1000, 30000);
};

export const recordRetryAttempt = (pageNumber: number): number => {
  pageRetryAttempts[pageNumber] = (pageRetryAttempts[pageNumber] || 0) + 1;
  const attempts = pageRetryAttempts[pageNumber];

  if (attempts >= 5) {
    log.error(`[RETRY] Page ${pageNumber} has reached maximum retry attempts (${attempts}). Giving up.`);
    return attempts;
  }

  const delay = getRetryDelay(pageNumber);
  log.warning(`[RETRY] Page ${pageNumber} attempt ${attempts}, next retry in ${delay}ms`);
  return attempts;
};

export const resetRetryAttempts = (pageNumber: number): void => {
  if (pageRetryAttempts[pageNumber] > 0) {
    log.info(`[RETRY] Resetting retry attempts for page ${pageNumber} (was ${pageRetryAttempts[pageNumber]})`);
  }
  delete pageRetryAttempts[pageNumber];
  delete pageRetryDelays[pageNumber];
};

export const __resetGeminiRetryStateForTests = () => {
  for (const k in pageRetryAttempts) delete pageRetryAttempts[k];
  for (const k in pageRetryDelays) delete pageRetryDelays[k];
};
