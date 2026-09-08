import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { dedupeConsole } from '../core/payload.js';
import type { ConsoleEntry, Rect } from '../core/types.js';

const INSTALL_HINT = 'Chrome 또는 Edge를 찾지 못했습니다. Chrome을 설치하거나 COBRO_BROWSER_CHANNEL(chrome|msedge|chromium)을 지정하세요. 번들 Chromium: npx playwright-core install chromium';

export function channelOrder(explicit: string | undefined, env: string | undefined): Array<string | undefined> {
  const named = [...new Set([explicit, env, 'chrome', 'msedge'].filter((c): c is string => !!c))];
  return [...named, undefined];
}

export class BrowserLauncher {
  private ctx: BrowserContext | null = null;
  page: Page | null = null;
  private launchedOnce = false;
  private raw: Array<{ level: ConsoleEntry['level']; text: string; at: string }> = [];
  constructor(private readonly opts: { overlaySource: string; port: number; token: string; profileDir: string; headless?: boolean; channel?: string }) {}

  isAlive(): boolean { return !!this.ctx && !!this.page && !this.page.isClosed(); }
  wasLaunched(): boolean { return this.launchedOnce; }

  private injected(): string {
    return this.opts.overlaySource.replace(/__COBRO_PORT__/g, String(this.opts.port)).replace(/__COBRO_TOKEN__/g, JSON.stringify(this.opts.token));
  }
  private async launch(): Promise<void> {
    const tried: string[] = [];
    const order = channelOrder(this.opts.channel, process.env.COBRO_BROWSER_CHANNEL);
    for (const channel of order) {
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
    p.on('load', () => { if (p === this.page) this.raw = []; }); // 활성 탭이 새 문서로 바뀌면 이전 문서의 에러는 버린다(백그라운드 탭의 load는 무시)
  }
  async open(url: string): Promise<{ title: string; restarted: boolean }> {
    const restarted = !this.isAlive() && this.launchedOnce;
    if (!this.isAlive()) { await this.launch(); this.launchedOnce = true; }
    await this.page!.goto(url, { waitUntil: 'load' });
    return { title: await this.page!.title(), restarted };
  }
  private async rectOfSelector(selector: string): Promise<Rect | undefined> {
    const p = this.page!;
    // 기본 30초를 기다리지 않는다 — 못 찾으면 곧바로 뷰포트로 폴백하는 편이 낫다
    const box = await p.locator(selector).first().boundingBox({ timeout: 2000 }).catch(() => null);
    if (!box) { console.error(`[cobro] screenshot: selector로 요소를 찾지 못해 뷰포트를 찍는다 — ${selector}`); return undefined; }
    // boundingBox는 뷰포트 기준 좌표 → 스크롤을 더해 페이지 좌표(clip이 쓰는 좌표계)로 바꾼다
    const scroll = await p.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    return { x: box.x + scroll.x, y: box.y + scroll.y, w: box.width, h: box.height };
  }
  async screenshot(opts: { rect?: Rect; selector?: string; outPath: string }): Promise<string> {
    if (!this.isAlive()) throw new Error('browser not open');
    const p = this.page!;
    const rect = opts.rect ?? (opts.selector ? await this.rectOfSelector(opts.selector) : undefined);
    if (rect) {
      const pad = 16;
      const clip = { x: Math.max(0, rect.x - pad), y: Math.max(0, rect.y - pad), width: Math.max(1, rect.w + pad * 2), height: Math.max(1, rect.h + pad * 2) };
      try { await p.screenshot({ path: opts.outPath, clip, fullPage: true }); return opts.outPath; }
      catch (e) { console.error('[cobro] clip screenshot failed, falling back to viewport', (e as Error).message); }
    }
    await p.screenshot({ path: opts.outPath });
    return opts.outPath;
  }
  consoleEntries(): ConsoleEntry[] { return dedupeConsole(this.raw); }
  async close(): Promise<void> { const c = this.ctx; this.ctx = null; this.page = null; if (c) await c.close().catch(() => {}); }
}
