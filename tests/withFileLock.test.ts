import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp'
  }
}));

describe('withFileLock', () => {
  it('fallisce se il lock non è acquisibile e non esegue il task', async () => {
    const { withFileLock } = await import('../electron/fileUtils.js');

    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'instanttraducer-lock-'));
    const filePath = path.join(dir, 'file.json');
    const lockPath = `${filePath}.lock`;

    await fs.promises.writeFile(lockPath, '123');

    let executed = false;
    const p = withFileLock(filePath, async () => {
      executed = true;
    });
    p.catch(() => {});

    await expect(p).rejects.toThrow('Lock timeout');
    expect(executed).toBe(false);
  }, 20000);
});
