import { log } from './logger';

export class ConcurrencyManager {
    private static instance: ConcurrencyManager;
    private activeCount: number = 0;
    private maxConcurrency: number = 2; // Default conservative limit
    private waiters: Array<(value: void | PromiseLike<void>) => void> = [];

    private constructor() {}

    public static getInstance(): ConcurrencyManager {
        if (!ConcurrencyManager.instance) {
            ConcurrencyManager.instance = new ConcurrencyManager();
        }
        return ConcurrencyManager.instance;
    }

    public setMaxConcurrency(max: number) {
        this.maxConcurrency = max;
        this.pump();
    }

    public getActiveCount(): number {
        return this.activeCount;
    }

    public async acquire(source: string): Promise<void> {
        if (this.activeCount < this.maxConcurrency) {
            this.activeCount++;
            // log.debug(`[Concurrency] Slot acquired by ${source} (${this.activeCount}/${this.maxConcurrency})`);
            return;
        }

        // log.debug(`[Concurrency] ${source} waiting for slot... (${this.activeCount}/${this.maxConcurrency})`);
        return new Promise<void>((resolve) => {
            this.waiters.push(() => {
                this.activeCount++;
                // log.debug(`[Concurrency] Slot granted to waiter from ${source} (${this.activeCount}/${this.maxConcurrency})`);
                resolve();
            });
        });
    }

    public release(source: string) {
        if (this.activeCount > 0) {
            this.activeCount--;
            // log.debug(`[Concurrency] Slot released by ${source} (${this.activeCount}/${this.maxConcurrency})`);
            this.pump();
        }
    }

    private pump() {
        while (this.activeCount < this.maxConcurrency && this.waiters.length > 0) {
            const resolver = this.waiters.shift();
            if (resolver) resolver();
        }
    }
}

export const globalConcurrency = ConcurrencyManager.getInstance();
