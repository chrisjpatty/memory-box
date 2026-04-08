import { createJob } from './runner';

interface ScheduleConfig {
  type: string;
  intervalMs: number;
  shouldRun: () => Promise<boolean>;
  payload: () => Promise<any>;
}

const schedules = new Map<string, { config: ScheduleConfig; interval: ReturnType<typeof setInterval> | null }>();

export function registerSchedule(config: ScheduleConfig): void {
  schedules.set(config.type, { config, interval: null });
}

export async function startSchedule(type: string): Promise<void> {
  const entry = schedules.get(type);
  if (!entry) throw new Error(`No schedule registered for type "${type}"`);
  if (entry.interval) return; // Already running

  const { config } = entry;

  async function tick(): Promise<void> {
    try {
      if (!(await config.shouldRun())) return;
      const payload = await config.payload();
      await createJob(config.type, payload);
    } catch (err: any) {
      // Exclusivity conflicts and other errors are expected (e.g., previous run still active)
      console.warn(`Scheduled ${config.type} tick skipped:`, err.message);
    }
  }

  entry.interval = setInterval(() => {
    tick().catch((err) => console.warn(`Scheduler error for ${config.type}:`, err));
  }, config.intervalMs);

  // Run an immediate check
  tick().catch((err) => console.warn(`Scheduler initial ${config.type} check error:`, err));
}

export async function stopSchedule(type: string): Promise<void> {
  const entry = schedules.get(type);
  if (!entry?.interval) return;

  clearInterval(entry.interval);
  entry.interval = null;
}

export function isScheduleRunning(type: string): boolean {
  return !!schedules.get(type)?.interval;
}
