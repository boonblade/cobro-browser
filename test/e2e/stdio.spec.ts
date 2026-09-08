import { test, expect } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const inherited = Object.fromEntries(
  Object.entries(process.env).filter((e): e is [string, string] => e[1] !== undefined),
);
const parse = (r: unknown) => JSON.parse(((r as { content: Array<{ text: string }> }).content)[0]!.text);
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

test('빌드된 dist/server.js가 stdio로 도구 6개를 제공하고 stdin 종료 시 스스로 내려간다', async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/server.js'],
    env: {
      ...inherited,
      COBRO_HEADLESS: '1',
      COBRO_STATE_DIR: mkdtempSync(join(tmpdir(), 'cobro-state-')),
      COBRO_PROFILE_DIR: mkdtempSync(join(tmpdir(), 'cobro-prof-')),
      COBRO_WAIT_SEC: '5',
      COBRO_TICK_MS: '1000',
    },
    stderr: 'pipe',
  });
  const stderrText: string[] = [];
  transport.stderr?.on('data', (c: Buffer) => stderrText.push(c.toString()));
  const client = new Client({ name: 'cobro-stdio-smoke', version: '0' });
  await client.connect(transport);
  const pid = transport.pid;
  expect(pid).not.toBeNull();

  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  expect(names).toEqual(['close', 'done', 'open', 'screenshot', 'status', 'wait']);

  const opened = parse(await client.callTool({ name: 'open', arguments: { url: 'http://127.0.0.1:4173/basic.html' } }));
  expect(opened).toMatchObject({ title: 'Basic', strategy: 'reload' });

  const progress: number[] = [];
  const waited = parse(await client.callTool({ name: 'wait', arguments: { timeoutSec: 5 } }, undefined, {
    onprogress: (p) => { progress.push(p.progress); },
  }));
  expect(waited).toEqual({ status: 'pending' });
  expect(progress.length).toBeGreaterThan(0);

  const shot = parse(await client.callTool({ name: 'screenshot', arguments: {} }));
  expect(shot.path).toMatch(/\.png$/);
  expect(existsSync(shot.path)).toBe(true);

  expect(parse(await client.callTool({ name: 'close', arguments: {} }))).toEqual({ ok: true });

  await client.close();
  await expect.poll(() => alive(pid!), { timeout: 5000 }).toBe(false);
  expect(stderrText.join('')).toContain('[cobro] ready');
});
