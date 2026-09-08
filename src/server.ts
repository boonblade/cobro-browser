import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Store } from './core/store.js';
import { createBridge } from './bridge.js';
import { BrowserLauncher } from './browser/launcher.js';
import { createMcpServer } from './mcp/server.js';
import type { Rect } from './core/types.js';

const here = dirname(fileURLToPath(import.meta.url));
const overlaySource = readFileSync(join(here, 'overlay.js'), 'utf8'); // build가 server.js 옆에 둔다
const stateDir = process.env.COBRO_STATE_DIR ?? join(process.cwd(), '.cobro');
const profileDir = process.env.COBRO_PROFILE_DIR ?? join(homedir(), '.cobro', 'profile');
const defaultWaitSec = Number(process.env.COBRO_WAIT_SEC ?? 1800);
const tickMs = process.env.COBRO_TICK_MS ? Number(process.env.COBRO_TICK_MS) : undefined;
const token = randomBytes(24).toString('hex');
const store = new Store(stateDir);

const union = (rects: Rect[]): Rect | undefined => {
  if (!rects.length) return undefined;
  const x = Math.min(...rects.map((r) => r.x)), y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
};

let launcher: BrowserLauncher | null = null;
const bridge = await createBridge({
  store, token,
  screenshot: async (b) => launcher?.isAlive() ? launcher.screenshot({ rect: union(b.elements.filter((e) => !e.missing).map((e) => e.rect)), outPath: store.shotPath(b.id) }) : undefined,
  consoleEntries: () => launcher?.consoleEntries() ?? [],
});
launcher = new BrowserLauncher({ overlaySource, port: bridge.port, token, profileDir, headless: process.env.COBRO_HEADLESS === '1' });

const mcp = createMcpServer({
  core: bridge.core, browser: launcher, done: (info) => bridge.done(info), shotPath: (id) => store.shotPath(id), defaultWaitSec, tickMs,
  onClose: async () => { /* 브라우저만 닫는다. 프로세스는 호스트가 관리 */ },
});
await mcp.connect(new StdioServerTransport());
console.error(`[cobro] ready · state=${stateDir} · ws=127.0.0.1:${bridge.port}`);
const shutdown = async () => { await launcher?.close(); await bridge.close(); process.exit(0); };
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
process.stdin.on('close', shutdown); // 호스트가 stdio를 닫으면 브라우저도 거둔다
