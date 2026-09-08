import { describe, it, expect } from 'vitest';
import { inspectElement, STYLE_KEYS } from '../../../src/overlay/inspect.js';

describe('inspectElement', () => {
  it('collects tag, classes, text(40), styles keys subset, rect, and react when fiber present', () => {
    document.body.innerHTML = '<button class="btn primary">' + 'x'.repeat(60) + '</button>';
    const el = document.querySelector('button')!;
    const fiber = { type: { name: 'SaveButton' }, _debugSource: { fileName: 'src/Save.tsx', lineNumber: 12 }, return: null };
    (el as unknown as Record<string, unknown>)['__reactFiber$abc'] = fiber;
    const info = inspectElement(el);
    expect(info.tag).toBe('button');
    expect(info.classes).toEqual(['btn', 'primary']);
    expect(info.text).toHaveLength(40);
    expect(Object.keys(info.styles).every((k) => (STYLE_KEYS as readonly string[]).includes(k))).toBe(true);
    expect(info.rect).toEqual({ x: 0, y: 0, w: 0, h: 0 }); // jsdom은 레이아웃 없음
    expect(info.react).toEqual({ component: 'SaveButton', source: 'src/Save.tsx:12' });
    expect(STYLE_KEYS).toHaveLength(12);
  });

  it('walks up fibers to the nearest named component', () => {
    document.body.innerHTML = '<div></div>';
    const el = document.querySelector('div')!;
    const parent = { type: { displayName: 'Card' }, return: null };
    (el as unknown as Record<string, unknown>)['__reactFiber$z'] = { type: 'div', return: parent };
    expect(inspectElement(el).react).toEqual({ component: 'Card' });
  });
});
