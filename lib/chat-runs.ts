/**
 * Chat runs, decoupled from the HTTP connection that started them.
 *
 * A run consumes the agent's stream to completion on its own and records each
 * event with a sequence number. Clients read it over SSE and, when a
 * connection ends early (an ingress response timeout, a network drop), resume
 * from the last event they saw. No single connection has to outlive the turn,
 * so turns can take as long as they need.
 *
 * Runs live in memory: the agent runs as a single instance. If the process
 * restarts mid-run the stream is lost, but the conversation is still saved.
 */
import { nanoid } from 'nanoid';

/** How long a finished run stays available for clients to resume. */
export const RUN_RETENTION_MS = 5 * 60_000;
/** SSE comment sent while a run is quiet, so idle timeouts never trigger. */
export const HEARTBEAT_MS = 5_000;
/**
 * Each connection is closed after this long and the client resumes. Kept under
 * the platform ingress's default 15s response timeout, so connections end
 * cleanly instead of being cut, even on deployments that keep the default.
 */
export const MAX_CONNECTION_MS = 12_000;

/** Payload of the final event of every run (matches the AI SDK's SSE format). */
export const DONE = '[DONE]';

export interface ChatRun {
  id: string;
  /** SSE `data:` payloads in order; an event's id is its index. */
  events: string[];
  done: boolean;
  /** Woken whenever an event is appended or the run finishes. */
  waiters: Set<() => void>;
}

const runs = new Map<string, ChatRun>();

function notify(run: ChatRun): void {
  for (const wake of run.waiters) wake();
  run.waiters.clear();
}

function append(run: ChatRun, payload: string): void {
  run.events.push(payload);
  notify(run);
}

export interface StartRunOptions {
  /** Events emitted before the agent's own (e.g. conversation-created). */
  initialEvents?: object[];
  /** Turns an exception thrown while reading the stream into a user-facing message. */
  errorMessage?: (error: unknown) => string;
}

/**
 * Start consuming `source` (a stream of AI SDK UI message chunks) into a new
 * run. Reading happens in the background and doesn't depend on any client.
 */
export function startRun(source: ReadableStream<unknown>, options: StartRunOptions = {}): ChatRun {
  const run: ChatRun = { id: nanoid(), events: [], done: false, waiters: new Set() };
  runs.set(run.id, run);

  append(run, JSON.stringify({ type: 'run-created', runId: run.id }));
  for (const event of options.initialEvents ?? []) append(run, JSON.stringify(event));

  void (async () => {
    const reader = source.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        append(run, JSON.stringify(value));
      }
    } catch (error) {
      console.error('[chat] run failed:', error);
      const errorText = options.errorMessage?.(error) ?? 'Something went wrong generating a response.';
      append(run, JSON.stringify({ type: 'error', errorText }));
    } finally {
      run.done = true;
      append(run, DONE);
      setTimeout(() => runs.delete(run.id), RUN_RETENTION_MS).unref?.();
    }
  })();

  return run;
}

export function getRun(id: string): ChatRun | undefined {
  return runs.get(id);
}

export interface StreamRunOptions {
  heartbeatMs?: number;
  maxConnectionMs?: number;
}

/**
 * SSE response with the run's events after `after` (an event id; -1 for all),
 * followed live. Ends when the run is done, or after `maxConnectionMs` so the
 * client reconnects. Events carry `id:` so the client knows where to resume.
 */
export function streamRun(run: ChatRun, after: number, options: StreamRunOptions = {}): Response {
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  const maxConnectionMs = options.maxConnectionMs ?? MAX_CONNECTION_MS;
  const encoder = new TextEncoder();
  let closed = false;
  let wakeWaiter: (() => void) | null = null;

  const body = new ReadableStream({
    type: 'direct' as any,
    async pull(controller: any) {
      const deadline = Date.now() + maxConnectionMs;
      let next = Math.max(after + 1, 0);
      try {
        while (!closed) {
          while (next < run.events.length) {
            controller.write(encoder.encode(`id: ${next}\ndata: ${run.events[next]}\n\n`));
            next++;
          }
          controller.flush();
          if (run.done && next >= run.events.length) break;

          const remaining = deadline - Date.now();
          if (remaining <= 0) break;

          // Wait for the next event, a heartbeat, or the connection deadline
          const woke = await new Promise<boolean>((resolve) => {
            const timer = setTimeout(() => resolve(false), Math.min(heartbeatMs, remaining));
            wakeWaiter = () => {
              clearTimeout(timer);
              resolve(true);
            };
            run.waiters.add(wakeWaiter);
          });
          if (wakeWaiter) run.waiters.delete(wakeWaiter);
          wakeWaiter = null;
          if (!woke && !closed && next >= run.events.length) {
            controller.write(encoder.encode(': ping\n\n'));
            controller.flush();
          }
        }
      } catch {
        // Client went away mid-write; the run carries on without it
      } finally {
        closed = true;
        controller.close();
      }
    },
    cancel() {
      closed = true;
      wakeWaiter?.();
    },
  });

  return new Response(body, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}

/** Test helper: forget all runs. */
export function clearRuns(): void {
  runs.clear();
}
