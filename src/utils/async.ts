export const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      try { onTimeout?.(); } catch { }
      reject(new Error(`Timeout dopo ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId);
  }
};

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delay: number = 1000,
  onRetry?: (error: any, attempt: number) => void,
  shouldRetry?: (error: any) => boolean // Aggiunto parametro opzionale
): Promise<T> {
  let lastError: any;
  const attempts = Math.max(1, Math.floor(maxAttempts));
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      
      // Se non dobbiamo riprovare (es. annullamento), usciamo subito
      if (shouldRetry && !shouldRetry(err)) {
        throw err;
      }
      
      if (onRetry) onRetry(err, i + 1);
      if (i < attempts - 1) {
        await sleep(delay * Math.pow(2, i)); // Exponential backoff
      }
    }
  }
  throw lastError;
}
