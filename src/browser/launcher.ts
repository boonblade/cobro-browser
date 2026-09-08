import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { dedupeConsole } from '../core/payload.js';
import type { ConsoleEntry, Rect } from '../core/types.js';

const INSTALL_HINT = 'Chrome 또는 Edge를 찾지 못했습니다. Chrome을 설치하거나 COBRO_BROWSER_CHANNEL(chrome|msedge|chromium)을 지정하세요. 번들 Chromium: npx playwright-core install chromium';

export class BrowserLauncher {
  private ctx: BrowserContext | null = null;
  page: Page | null = null;
  private launchedOnce = false;
  private raw: Array<{ level: ConsoleEntry['level']; text: string; at: string }> = [];
  constructor(private readonly opts: { overlaySource: string; port: number; token: string; profileDir: string; headless?: boolean; channel?: string }) {}

  isAlive(): boolean { return !!this.ctx && !!this.page && !this.page.isClosed(); }

  private injected(): string {
    return this.opts.overlaySource.replace(/__COBRO_PORT__/g, String(this.opts.port)).replace(/__COBRO_TOKEN__/g, JSON.stringify(this.opts.token));
  }
  private async launch(): Promise<void> {
    const tried: string[] = [];
    const order: Array<string | undefined> = [...new Set([this.opts.channel, process.env.COBRO_BROWSER_CHANNEL, 'chrome', 'msedge', undefined])];
    for (const channel of order) {
      if (channel === 'chromium') { /* 번들 */ }
      try {
        this.ctx = await chromium.launchPersistentContext(this.opts.profileDir, {
          headless: this.opts.headless ?? false, channel: channel === 'chromium' ? undefined : channel,
          bypassCSP: true, viewport: null, args: ['--disable-infobars'], ignoreDefaultArgs: ['--enable-automation'],
        });
        break;
      } catch (e) { tried.push(`${channel ?? 'bundled'}: ${(e as Error).message.split('\n')[0]}`); this.ctx = null; }
    }
    if (!this.ctx) throw new Error(INSTALL_HINT + '\n' + tried.join('\n'));
    await this.ctx.addInitScript(this.injected());
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    this.attach(this.page);
    this.ctx.on('close', () => { this.ctx = null; this.page = null; });
    this.ctx.on('page', (p) => { this.page = p; this.attach(p); }); // 새 탭을 열면 그 탭을 대상으로
  }
  private attach(p: Page): void {
    const push = (level: ConsoleEntry['level'], text: string) => { this.raw.push({ level, text, at: new Date().toISOString() }); if (this.raw.length > 200) this.raw.splice(0, this.raw.length - 200); };
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') push(m.type() as 'error' | 'warning', m.text()); });
    p.on('pageerror', (e) => push('pageerror', e.message));
    p.on('requestfailed', (r) => push('requestfailed', `${r.method()} ${r.url()} — ${r.failure()?.errorText ?? ''}`));
    p.on('load', () => { this.raw = []; }); // 문서가 바뀌면 이전 문서의 에러는 버린다
  }
  async open(url: string): Promise<{ title: string; restarted: boolean }> {
    const restarted = !this.isAlive() && this.launchedOnce;
    if (!this.isAlive()) { await this.launch(); this.launchedOnce = true; }
    await this.page!.goto(url, { waitUntil: 'load' });
    return { title: await this.page!.title(), restarted };
  }
  async screenshot(opts: { rect?: Rect; outPath: string }): Promise<string> {
    if (!this.isAlive()) throw new Error('browser not open');
    const p = this.page!;
    if (opts.rect) {
      const pad = 16;
      const clip = { x: Math.max(0, opts.rect.x - pad), y: Math.max(0, opts.rect.y - pad), width: Math.max(1, opts.rect.w + pad * 2), height: Math.max(1, opts.rect.h + pad * 2) };
      try { await p.screenshot({ path: opts.outPath, clip, fullPage: true }); return opts.outPath; }
      catch (e) { console.error('[cobro] clip screenshot failed, falling back to viewport', (e as Error).message); }
    }
    await p.screenshot({ path: opts.outPath });
    return opts.outPath;
  }
  consoleEntries(): ConsoleEntry[] { return dedupeConsole(this.raw); }
  async close(): Promise<void> { const c = this.ctx; this.ctx = null; this.page = null; if (c) await c.close().catch(() => {}); }
}
