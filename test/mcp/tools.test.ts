import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/core/store.js';
import { SessionCore } from '../../src/core/session.js';
import { createMcpServer } from '../../src/mcp/server.js';

const page = { url: 'http://x/', title: 'X', viewport: { w: 1, h: 1 } };
let core: SessionCore; let client: Client; let calls: string[]; let closeAll: () => Promise<void>;

beforeEach(async () => {
  const store = new Store(mkdtempSync(join(tmpdir(), 'cobro-')));
  core = new SessionCore(store); calls = [];
  const browser = { open: async (u: string) => { calls.push('open:' + u); return { title: 'T', restarted: false }; }, screenshot: async (o: { outPath: string }) => { calls.push('shot'); return o.outPath; }, close: async () => { calls.push('close'); } };
  const server = createMcpServer({ core, browser, shotPath: (id) => `/s/${id}.png`, done: (info) => core.done(info), defaultWaitSec: 1 });
  const [ct, st] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: 't', version: '0' });
  await server.connect(st); await client.connect(ct);
  closeAll = async () => { await client.close(); await server.close(); };
});
afterEach(() => closeAll());
const call = async (name: string, args: Record<string, unknown> = {}) => {
  const r = await client.callTool({ name, arguments: args });
  return JSON.parse((r.content as Array<{ text: string }>)[0]!.text);
};

describe('mcp tools', () => {
  it('exposes exactly six tools', async () => {
    const t = (await client.listTools()).tools.map((x) => x.name).sort();
    expect(t).toEqual(['close', 'done', 'open', 'screenshot', 'status', 'wait']);
  });
  it('open returns title, strategy and restored batches; strategy arg fixes it', async () => {
    expect(await call('open', { url: 'http://a/', strategy: 'event' })).toEqual({ title: 'T', strategy: 'event', restoredBatches: 0, restarted: false });
    expect(core.session.strategy).toBe('event');
    expect(calls).toEqual(['open:http://a/']);
  });
  it('wait returns pending on timeout and sent when delivered; rejects timeoutSec below 5', async () => {
    expect(await call('wait', { timeoutSec: 5 }).then(() => 'slow')).toBe('slow');
    setTimeout(() => core.deliver({ origin: 'human', sentAt: 't', page, batches: [], console: [], refreshStrategy: 'none' }), 50);
    expect(await call('wait', { timeoutSec: 5 })).toMatchObject({ status: 'sent', payload: { origin: 'human' } });
    // 설치된 SDK(v1.30.0)는 zod 검증 실패를 reject가 아니라 isError:true 응답으로 돌려준다.
    const bad = await client.callTool({ name: 'wait', arguments: { timeoutSec: 1 } });
    expect(bad.isError).toBe(true);
  }, 15_000);
  it('status sets working text; done marks sent batches and returns count', async () => {
    core.setDrafts([{ id: 'b', note: 'n', elements: [], status: 'draft', createdAt: 't' }]);
    core.markSent(['b'], page);
    expect(await call('status', { text: '수정 중' })).toEqual({ ok: true });
    expect(core.session.agent).toEqual({ status: 'working', text: '수정 중' });
    expect(await call('done', { summary: '완료', selectors: ['#a'] })).toEqual({ ok: true, doneBatches: 1 });
    expect(core.session.batches[0]!.status).toBe('done');
  });
  it('screenshot returns path; close closes browser', async () => {
    const r = await call('screenshot');
    expect(r.path).toMatch(/\.png$/);
    expect(await call('close')).toEqual({ ok: true });
    expect(calls).toContain('close');
  });
});
