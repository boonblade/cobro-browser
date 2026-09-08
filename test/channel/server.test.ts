import { describe, it, expect, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { ChannelServer } from '../../src/channel/server.js';

let srv: ChannelServer | null = null;
afterEach(async () => { await srv?.close(); srv = null; });

const open = (port: number) => new Promise<WebSocket>((res, rej) => { const ws = new WebSocket(`ws://127.0.0.1:${port}`); ws.once('open', () => res(ws)); ws.once('error', rej); });
const next = (ws: WebSocket) => new Promise<unknown>((res) => ws.once('message', (d) => res(JSON.parse(d.toString()))));
const closed = (ws: WebSocket) => new Promise<number>((res) => ws.once('close', (code) => res(code)));

describe('ChannelServer', () => {
  it('rejects wrong token with 4001 and never routes', async () => {
    const onMessage = vi.fn();
    srv = new ChannelServer({ token: 'good', onMessage });
    const port = await srv.listen();
    const ws = await open(port);
    ws.send(JSON.stringify({ type: 'hello', token: 'bad' }));
    expect(await closed(ws)).toBe(4001);
    expect(onMessage).not.toHaveBeenCalled();
  });
  it('rejects non-hello first message', async () => {
    srv = new ChannelServer({ token: 'good', onMessage: vi.fn() });
    const port = await srv.listen();
    const ws = await open(port);
    ws.send(JSON.stringify({ type: 'redo', batchId: 'x' }));
    expect(await closed(ws)).toBe(4001);
  });
  it('routes after hello, calls onConnect, broadcasts, and ignores malformed json', async () => {
    const onMessage = vi.fn((_m, reply) => reply({ type: 'error', message: 'echo' }));
    const onConnect = vi.fn((reply) => reply({ type: 'error', message: 'welcome' }));
    srv = new ChannelServer({ token: 'good', onMessage, onConnect });
    const port = await srv.listen();
    const ws = await open(port);
    ws.send(JSON.stringify({ type: 'hello', token: 'good' }));
    expect(await next(ws)).toEqual({ type: 'error', message: 'welcome' });
    ws.send('{not json');
    ws.send(JSON.stringify({ type: 'redo', batchId: 'x' }));
    expect(await next(ws)).toEqual({ type: 'error', message: 'echo' });
    expect(onMessage).toHaveBeenCalledWith({ type: 'redo', batchId: 'x' }, expect.any(Function));
    const p = next(ws);
    srv.broadcast({ type: 'error', message: 'all' });
    expect(await p).toEqual({ type: 'error', message: 'all' });
    expect(srv.clientCount()).toBe(1);
  });
  it('closes an idle unauthenticated socket with 4001 after authTimeoutMs', async () => {
    srv = new ChannelServer({ token: 'good', onMessage: vi.fn(), authTimeoutMs: 50 });
    const port = await srv.listen();
    const ws = await open(port);
    expect(await closed(ws)).toBe(4001);
  });
});
