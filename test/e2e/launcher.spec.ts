import { test, expect } from '@playwright/test';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserLauncher } from '../../src/browser/launcher.js';

test('launches, injects overlay, buffers console errors, takes clipped screenshot, restarts after close', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cobro-prof-'));
  const overlay = 'window.__injected = __COBRO_PORT__;';
  const l = new BrowserLauncher({ overlaySource: overlay, port: 4242, token: 't', profileDir: dir, headless: true, channel: process.env.COBRO_TEST_CHANNEL });
  try {
    const first = await l.open('http://127.0.0.1:4173/basic.html');
    expect(first).toMatchObject({ title: 'Basic', restarted: false });
    expect(await l.page!.evaluate(() => (window as unknown as { __injected: number }).__injected)).toBe(4242);
    await l.page!.evaluate(() => { console.error('boom'); console.error('boom'); });
    await expect.poll(() => l.consoleEntries()).toEqual([expect.objectContaining({ level: 'error', text: 'boom', count: 2 })]);
    const out = join(dir, 'shot.png');
    expect(await l.screenshot({ rect: { x: 0, y: 0, w: 120, h: 40 }, outPath: out })).toBe(out);
    expect(existsSync(out)).toBe(true);
    await l.close();
    expect(l.isAlive()).toBe(false);
    const again = await l.open('http://127.0.0.1:4173/basic.html');
    expect(again.restarted).toBe(true);
  } finally { await l.close(); }
});
