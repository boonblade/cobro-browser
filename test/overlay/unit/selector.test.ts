import { describe, it, expect, beforeEach } from 'vitest';
import { uniqueSelector } from '../../../src/overlay/selector.js';

beforeEach(() => { document.body.innerHTML = ''; });

describe('uniqueSelector', () => {
  it('prefers id', () => {
    document.body.innerHTML = '<div id="root"><p id="x" class="a">hi</p></div>';
    expect(uniqueSelector(document.getElementById('x')!)).toBe('#x');
  });

  it('prefers data-testid over classes', () => {
    document.body.innerHTML = '<div><p data-testid="t" class="a">hi</p></div>';
    expect(uniqueSelector(document.querySelector('p')!)).toBe('[data-testid="t"]');
  });

  it('uses nth-of-type among same-tag siblings and shortest unique path', () => {
    document.body.innerHTML = '<div id="list"><p class="c">1</p><p class="c">2</p></div><div><p class="c">3</p></div>';
    const second = document.querySelectorAll('p')[1]!;
    const sel = uniqueSelector(second);
    expect(document.querySelectorAll(sel)).toHaveLength(1);
    expect(document.querySelector(sel)).toBe(second);
    expect(sel).toBe('p.c:nth-of-type(2)');
  });

  it('escapes odd class names and never throws', () => {
    document.body.innerHTML = '<span class="w-1/2 md:flex">x</span>';
    const sel = uniqueSelector(document.querySelector('span')!);
    expect(document.querySelector(sel)).toBe(document.querySelector('span'));
  });
});
