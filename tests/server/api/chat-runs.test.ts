import { afterEach, describe, expect, test } from 'bun:test';
import { Hono } from 'hono';
import { createChatRoutes } from '../../../server/api/chat';
import { clearRuns, getRun, startRun, streamRun } from '../../../lib/chat-runs';

afterEach(() => clearRuns());

/** Fake agent stream: emits `chunks`, waiting `gapMs` before each. */
function fakeAgent(chunks: object[], gapMs = 0, failAfter?: number) {
  return () =>
    Promise.resolve(
      new ReadableStream<unknown>({
        async start(controller) {
          for (let i = 0; i < chunks.length; i++) {
            if (gapMs) await Bun.sleep(gapMs);
            if (failAfter === i) {
              controller.error(new Error('model exploded'));
              return;
            }
            controller.enqueue(chunks[i]);
          }
          controller.close();
        },
      }),
    );
}

const chunks = [
  { type: 'start' },
  { type: 'tool-input-available', toolCallId: 't1', toolName: 'searchMemories', input: {} },
  { type: 'tool-output-available', toolCallId: 't1', output: { results: [] } },
  { type: 'text-start', id: 'x' },
  { type: 'text-delta', id: 'x', delta: 'Hello' },
  { type: 'text-end', id: 'x' },
  { type: 'finish' },
];

function app(agent: ReturnType<typeof fakeAgent>) {
  return new Hono().route('/api/chat', createChatRoutes(agent));
}

const postTurn = (a: Hono) =>
  a.request('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // An existing thread, so no conversation row is created
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }], memory: { thread: 'thread-1', resource: 'user' } }),
  });

interface SseEvent { id: number | null; data: string | null; comment: boolean }

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n');
      const id = lines.find((l) => l.startsWith('id: '));
      const data = lines.find((l) => l.startsWith('data: '));
      return {
        id: id ? Number(id.slice(4)) : null,
        data: data ? data.slice(6) : null,
        comment: lines.every((l) => l.startsWith(':')),
      };
    });
}

const types = (events: SseEvent[]) =>
  events.filter((e) => e.data).map((e) => (e.data === '[DONE]' ? '[DONE]' : JSON.parse(e.data!).type));

describe('chat runs', () => {
  test('POST streams the whole run with sequential event ids', async () => {
    const res = await postTurn(app(fakeAgent(chunks)));
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const events = parseSse(await res.text());
    expect(types(events)).toEqual(['run-created', ...chunks.map((c: any) => c.type), '[DONE]']);
    expect(events.map((e) => e.id)).toEqual(events.map((_, i) => i));
  });

  test('resume returns only the events after the given id', async () => {
    const a = app(fakeAgent(chunks));
    const first = parseSse(await (await postTurn(a)).text());
    const runId = JSON.parse(first[0].data!).runId;

    const resumed = parseSse(await (await a.request(`/api/chat/runs/${runId}/stream?after=3`)).text());
    expect(resumed[0].id).toBe(4);
    expect(types(resumed)).toEqual(['text-start', 'text-delta', 'text-end', 'finish', '[DONE]']);

    // Last-Event-ID header works too
    const viaHeader = parseSse(await (await a.request(`/api/chat/runs/${runId}/stream`, { headers: { 'last-event-id': '6' } })).text());
    expect(types(viaHeader)).toEqual(['finish', '[DONE]']);
  });

  test('the run keeps going after the client disconnects, and can be resumed', async () => {
    const a = app(fakeAgent(chunks, 40));
    const res = await postTurn(a);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('tool-input-available')) text += decoder.decode((await reader.read()).value!);
    await reader.cancel(); // simulate the ingress cutting the connection

    const seen = parseSse(text.slice(0, text.lastIndexOf('\n\n') + 2));
    const runId = JSON.parse(seen[0].data!).runId;
    const lastId = seen[seen.length - 1].id!;

    await Bun.sleep(chunks.length * 40 + 100); // let the run finish with nobody connected
    expect(getRun(runId)!.done).toBe(true);

    const rest = parseSse(await (await a.request(`/api/chat/runs/${runId}/stream?after=${lastId}`)).text());
    expect(types([...seen, ...rest])).toEqual(['run-created', ...chunks.map((c: any) => c.type), '[DONE]']);
  });

  test('a long quiet run gets heartbeats and the connection ends at the deadline', async () => {
    const run = startRun(await fakeAgent([{ type: 'start' }, { type: 'finish' }], 300)());
    const res = streamRun(run, -1, { heartbeatMs: 50, maxConnectionMs: 200 });
    const started = Date.now();
    const events = parseSse(await res.text());
    const elapsed = Date.now() - started;

    expect(elapsed).toBeGreaterThanOrEqual(190);
    expect(elapsed).toBeLessThan(290); // closed before the run finished
    expect(events.some((e) => e.comment)).toBe(true);
    expect(types(events)).toEqual(['run-created']); // the client resumes for the rest
    expect(run.done).toBe(false);
  });

  test('unknown run → 404', async () => {
    const res = await app(fakeAgent(chunks)).request('/api/chat/runs/nope/stream');
    expect(res.status).toBe(404);
  });

  test('a stream that throws ends the run with an error event', async () => {
    const res = await postTurn(app(fakeAgent(chunks, 1, 3)));
    const events = parseSse(await res.text());
    expect(types(events)).toEqual(['run-created', 'start', 'tool-input-available', 'tool-output-available', 'error', '[DONE]']);
    const error = JSON.parse(events.find((e) => e.data?.includes('"error"'))!.data!);
    expect(error.errorText).not.toContain('model exploded'); // user-facing message, not internals
  });
});
