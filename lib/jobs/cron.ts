import { query } from '../db';
import { createJob } from './runner';

export interface CronSync {
  /** Unique name — must match the registered job type */
  name: string;
  /** Cron expression (5-field format) */
  schedule: string;
  /** Settings table key for the enabled flag */
  enabledKey: string;
  /** Settings table key for the last-check timestamp */
  lastCheckKey: string;
  /** Check whether prerequisites are met (credentials exist, etc.) */
  canRun(): Promise<boolean>;
  /** Lightweight pre-check: return new items to import (empty = no-op) */
  findNew(): Promise<any[]>;
  /** Build the job payload from the new items */
  buildPayload(items: any[]): Promise<any> | any;
}

type BunCronJob = { stop(): unknown; cron: string };

const syncs = new Map<string, { config: CronSync; cron: BunCronJob | null }>();

function createTick(config: CronSync): () => Promise<void> {
  return async () => {
    // Check enabled flag
    const enabledResult = await query(
      `SELECT value FROM settings WHERE key = $1`,
      [config.enabledKey],
    );
    if (enabledResult.rows[0]?.value !== 'true') return;

    // Check prerequisites
    if (!(await config.canRun())) return;

    // Lightweight pre-check
    const newItems = await config.findNew();

    // Always update last-check timestamp
    await query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = $2`,
      [config.lastCheckKey, new Date().toISOString()],
    );

    // Only create a job if there's something to import
    if (newItems.length === 0) return;

    try {
      await createJob(config.name, await config.buildPayload(newItems));
    } catch (err: any) {
      console.warn(`${config.name} job creation skipped:`, err.message);
    }
  };
}

export function registerCronSync(config: CronSync): void {
  syncs.set(config.name, { config, cron: null });
}

export function startCronSync(name: string): void {
  const entry = syncs.get(name);
  if (!entry) throw new Error(`No cron sync registered for "${name}"`);
  if (entry.cron) return; // already running

  const tick = createTick(entry.config);
  entry.cron = Bun.cron(entry.config.schedule, () =>
    tick().catch((err) => console.warn(`${name} cron error:`, err)),
  );
}

export function stopCronSync(name: string): void {
  const entry = syncs.get(name);
  if (!entry?.cron) return;
  entry.cron.stop();
  entry.cron = null;
}

export function isCronSyncRunning(name: string): boolean {
  return !!syncs.get(name)?.cron;
}

export function getCronSyncSchedule(name: string): string | null {
  return syncs.get(name)?.config.schedule ?? null;
}
