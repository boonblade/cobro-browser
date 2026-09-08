import { describe, it, expect, vi, afterEach } from 'vitest';
import { detectStrategy, applyDone } from '../../../src/overlay/refresh.js';

afterEach(() => {
  document.head.innerHTML = '';
  for (const k of Object.keys(window)) {
    if (k.startsWith('webpackHotUpdate')) delete (window as unknown as Record<string, unknown>)[k];
  }
});

describe('detectStrategy', () => {
  it('none when vite client script exists', () => {
    document.head.innerHTML = '<script type="module" src="/@vite/client"></script>';
    expect(detectStrategy()).toBe('none');
  });

  it('none when webpack HMR global exists', () => {
    (window as unknown as Record<string, unknown>)['webpackHotUpdateapp'] = () => {};
    expect(detectStrategy()).toBe('none');
  });

  it('reload otherwise', () => {
    expect(detectStrategy()).toBe('reload');
  });
});

describe('applyDone', () => {
  const info = { summary: 's', selectors: ['#a'], changedFiles: ['f'] };

  it('always dispatches the done event with detail', () => {
    const seen = vi.fn();
    window.addEventListener('cobro:done', (e) => seen((e as CustomEvent).detail));
    applyDone(info, 'none', vi.fn());
    expect(seen).toHaveBeenCalledWith(info);
  });

  it('calls reload only for reload strategy', () => {
    const reload = vi.fn();
    applyDone(info, 'event', reload);
    applyDone(info, 'none', reload);
    expect(reload).not.toHaveBeenCalled();
    applyDone(info, 'reload', reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
