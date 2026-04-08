import type { JobHandler } from './types';

const handlers = new Map<string, JobHandler>();

export function registerJobType(type: string, handler: JobHandler): void {
  if (handlers.has(type)) {
    throw new Error(`Job type "${type}" is already registered`);
  }
  handlers.set(type, handler);
}

export function getJobHandler(type: string): JobHandler {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`Unknown job type: "${type}"`);
  return handler;
}

export function getRegisteredTypes(): string[] {
  return Array.from(handlers.keys());
}
