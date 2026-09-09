import { describe, it, expect } from 'vitest';
import { channelOrder, parseEngine, chromiumLaunchOptions, classifyLaunchFailure } from '../../src/browser/launcher.js';

describe('channelOrder', () => {
  it('defaults to chrome, msedge, bundled', () => { expect(channelOrder(undefined, undefined)).toEqual(['chrome', 'msedge', undefined]); });
  it('puts explicit then env first without duplicates, bundled last', () => { expect(channelOrder('msedge', 'chrome')).toEqual(['msedge', 'chrome', undefined]); expect(channelOrder(undefined, 'chromium')).toEqual(['chromium', 'chrome', 'msedge', undefined]); });
});

describe('parseEngine', () => {
  it('accepts the three engines and defaults to chromium', () => {
    expect(parseEngine('webkit')).toBe('webkit');
    expect(parseEngine('firefox')).toBe('firefox');
    expect(parseEngine('chromium')).toBe('chromium');
    expect(parseEngine(undefined)).toBe('chromium');
    expect(parseEngine('safari')).toBe('chromium');
  });
});

describe('chromiumLaunchOptions', () => {
  it('sandbox: true → chromiumSandbox === true', () => {
    expect(chromiumLaunchOptions({ headless: true, channel: undefined, sandbox: true }).chromiumSandbox).toBe(true);
  });
  it('sandbox: false → chromiumSandbox === false', () => {
    expect(chromiumLaunchOptions({ headless: true, channel: undefined, sandbox: false }).chromiumSandbox).toBe(false);
  });
  it("channel 'chromium' → undefined (번들 빌드), 'chrome' → 'chrome' 그대로", () => {
    expect(chromiumLaunchOptions({ headless: true, channel: 'chromium', sandbox: true }).channel).toBeUndefined();
    expect(chromiumLaunchOptions({ headless: true, channel: 'chrome', sandbox: true }).channel).toBe('chrome');
  });
  it('args·ignoreDefaultArgs·bypassCSP·viewport는 기존 값 그대로', () => {
    const o = chromiumLaunchOptions({ headless: true, channel: undefined, sandbox: true });
    expect(o.args).toEqual(['--disable-infobars']);
    expect(o.ignoreDefaultArgs).toEqual(['--enable-automation']);
    expect(o.bypassCSP).toBe(true);
    expect(o.viewport).toBeNull();
  });
});

describe('classifyLaunchFailure', () => {
  const closed6 = [
    'chrome: Target page, context or browser has been closed',
    'chrome (no-sandbox): Target page, context or browser has been closed',
    'msedge: Target page, context or browser has been closed',
    'msedge (no-sandbox): Target page, context or browser has been closed',
    'bundled: Target page, context or browser has been closed',
    'bundled (no-sandbox): Target page, context or browser has been closed',
  ];
  it('전부 has been closed + 잠금 파일 있음 → profile-locked', () => {
    expect(classifyLaunchFailure(closed6, true)).toBe('profile-locked');
  });
  it('전부 has been closed + 잠금 파일 없음 → not-found', () => {
    expect(classifyLaunchFailure(closed6, false)).toBe('not-found');
  });
  it('1항목이 Executable doesn\'t exist면 잠금 파일이 있어도 → not-found', () => {
    const mixed = [...closed6.slice(0, 5), "chrome: Executable doesn't exist at /x/chrome"];
    expect(classifyLaunchFailure(mixed, true)).toBe('not-found');
  });
});
