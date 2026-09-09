import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startParentWatch } from '../../src/parent-watch.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('startParentWatch', () => {
  it('calls onDead exactly once when isParentAlive turns false, and stays quiet after', () => {
    let call = 0;
    const isParentAlive = vi.fn(() => { call++; return call < 3; });
    const onDead = vi.fn();
    startParentWatch({ isParentAlive, onDead, intervalMs: 1000 });
    vi.advanceTimersByTime(5000); // 1000ms마다 5회 tick → 3번째부터 false
    expect(onDead).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000); // 더 진행해도 재호출 없음
    expect(onDead).toHaveBeenCalledTimes(1);
  });
  it('stop() prevents onDead from ever firing', () => {
    const isParentAlive = vi.fn(() => false);
    const onDead = vi.fn();
    const stop = startParentWatch({ isParentAlive, onDead, intervalMs: 1000 });
    stop();
    vi.advanceTimersByTime(5000);
    expect(onDead).not.toHaveBeenCalled();
  });
});
