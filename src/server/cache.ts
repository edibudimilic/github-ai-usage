import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { DashboardUsage } from '../shared/types.js';

export class UsageCache {
  private current: DashboardUsage | null = null;

  constructor(private readonly filePath: string) {}

  get(): DashboardUsage | null {
    return this.current;
  }

  async load(): Promise<DashboardUsage | null> {
    try {
      const content = await readFile(this.filePath, 'utf8');
      this.current = { ...(JSON.parse(content) as DashboardUsage), stale: true, source: 'cache' };
      return this.current;
    } catch {
      return null;
    }
  }

  async save(usage: DashboardUsage): Promise<void> {
    this.current = usage;
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(usage, null, 2), 'utf8');
  }

  markStale(error: unknown): DashboardUsage | null {
    if (!this.current) {
      return null;
    }

    this.current = {
      ...this.current,
      stale: true,
      error: error instanceof Error ? error.message : String(error)
    };

    return this.current;
  }
}