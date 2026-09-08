import { describe, it, expect } from 'vitest';
import { channelOrder, parseEngine } from '../../src/browser/launcher.js';

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
