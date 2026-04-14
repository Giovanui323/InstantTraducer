import { log } from './logger';

/**
 * ModalConcurrencyManager
 *
 * Modal accepts strictly 1 request at a time.
 * This manager serializes all requests through a single-slot queue.
 * Requests that arrive while another is in-flight will wait for their turn.
 */
class ModalConcurrencyManager {
  private activeCount: number = 0;
  private waiters: Array<(value: void) => void> = [];

  public async acquire(source: string): Promise<void> {
    if (this.activeCount < 1) {
      this.activeCount++;
      log.debug(`[ModalConcurrency] Slot acquired by ${source}`);
      return;
    }
    log.debug(`[ModalConcurrency] ${source} waiting for slot...`);
    return new Promise<void>((resolve) => {
      this.waiters.push(() => {
        this.activeCount++;
        log.debug(`[ModalConcurrency] Slot granted to waiter from ${source}`);
        resolve();
      });
    });
  }

  public release(source: string) {
    if (this.activeCount > 0) {
      this.activeCount--;
      log.debug(`[ModalConcurrency] Slot released by ${source}`);
      this.pump();
    }
  }

  private pump() {
    if (this.activeCount < 1 && this.waiters.length > 0) {
      const resolver = this.waiters.shift();
      if (resolver) resolver();
    }
  }
}

export const modalConcurrency = new ModalConcurrencyManager();
