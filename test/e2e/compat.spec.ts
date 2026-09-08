import { test, expect } from './helpers.js';
import { spawn, execSync, type ChildProcess } from 'node:child_process';

let vite: ChildProcess;

async function waitForVite(url: string, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // 아직 안 뜸 — 계속 폴링
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite dev server did not become ready at ${url} within ${timeoutMs}ms`);
}

test.beforeAll(async () => {
  // --host 127.0.0.1: vite 기본값은 'localhost'를 ::1(IPv6)로만 바인딩해 4173 픽스처(127.0.0.1)와 어긋난다
  vite = spawn('npx', ['vite', '--port', '4174', '--strictPort', '--host', '127.0.0.1'], { cwd: 'test/fixtures/vite-app', shell: true, stdio: 'ignore' });
  await waitForVite('http://127.0.0.1:4174/');
});

test.afterAll(() => {
  if (!vite.pid) return;
  if (process.platform === 'win32') {
    // shell: true라서 vite.pid는 셸 프로세스의 pid다 — /T로 자식(esbuild 등)까지 정리
    try { execSync(`taskkill /pid ${vite.pid} /T /F`); } catch { /* 이미 종료됨 */ }
  } else {
    vite.kill();
  }
});

test('detects none on Vite dev and reload on static', async ({ cobroPage: page, bridge }) => {
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.locator('#h')).toHaveAttribute('data-ready', '1');
  await expect.poll(() => bridge.core.session.detected).toBe('none');
  await expect(page.locator('[data-cobro-host] .status')).toContainText('갱신: none');
  await page.goto('http://127.0.0.1:4173/basic.html');
  await expect.poll(() => bridge.core.session.detected).toBe('reload');
});
