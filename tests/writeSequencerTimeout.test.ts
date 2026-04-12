import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  }
}));

describe('WriteSequencer', () => {
  it('non rilascia la coda quando scatta il timeout', async () => {
    vi.useFakeTimers();

    const { WriteSequencer } = await import('../electron/state.js');
    const ws = new WriteSequencer();

    let resolveTask1: ((v: any) => void) | undefined;
    let op1: any;
    let task2Started = false;

    const p1 = ws.enqueue(
      'a.json',
      (op: any) =>
        new Promise((resolve) => {
          op1 = op;
          resolveTask1 = resolve;
        }),
      { priority: 'CRITICAL' }
    );
    p1.catch(() => {});

    await Promise.resolve();
    expect(String(op1?.operationId || '')).toMatch(/^writeOp-/);

    await vi.advanceTimersByTimeAsync(30000);
    await expect(p1).rejects.toThrow('WriteSequencer task timeout');

    const p2 = ws.enqueue(
      'a.json',
      async () => {
        task2Started = true;
        return { success: true };
      },
      { priority: 'CRITICAL' }
    );

    await Promise.resolve();
    expect(task2Started).toBe(false);

    resolveTask1?.({ success: true });
    await Promise.resolve();

    await expect(p2).resolves.toEqual({ success: true });

    vi.useRealTimers();
  });
});
