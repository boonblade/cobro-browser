import { test, expect, HOST, selectAt } from './helpers.js';

test('select → note → Send arrives in core.wait with selector, then done flashes and dispatches event', async ({ cobroPage: page, bridge }) => {
  bridge.core.setStrategy('none'); // done이 페이지를 reload하면 __doneEvents가 사라진다
  await page.goto('http://127.0.0.1:4173/basic.html');
  await expect(page.locator(`${HOST} .toolbar`)).toBeVisible();
  await selectAt(page, '#target');
  await expect(page.locator(`${HOST} .els`)).toContainText('#target');
  await page.locator(`${HOST} textarea`).fill('버튼 작게');
  const waiting = bridge.core.wait(10_000);
  await page.locator(`${HOST} button.send`).click();
  const r = await waiting;
  expect(r.status).toBe('sent');
  if (r.status !== 'sent') return;
  expect(r.payload.batches[0]).toMatchObject({ note: '버튼 작게', elements: [{ selector: '#target', tag: 'button' }] });
  expect(r.payload.page.url).toContain('basic.html');
  await expect(page.locator(`${HOST} .status`)).toContainText('전송됨');
  await expect(page.locator(`${HOST} .els`)).toHaveCount(0); // 보낸 배치가 좀비 draft로 되살아나면 안 된다
  bridge.done({ summary: '폰트 12px', selectors: ['#target'], changedFiles: ['x.tsx'] });
  await expect(page.locator(`${HOST} .status`)).toContainText('완료');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __doneEvents: unknown[] }).__doneEvents.length)).toBe(1);
});

test('textarea keeps focus and input under document focusin + window capture focus traps', async ({ cobroPage: page }) => {
  await page.goto('http://127.0.0.1:4173/modal-trap.html');
  await page.click('#open');
  await selectAt(page, '#dlgText');
  await page.keyboard.type('hello');
  await expect(page.locator(`${HOST} textarea`)).toHaveValue('hello');
  await expect(page.locator('#dlgInput')).toHaveValue('');
});

test('typing keeps focus and caret across the debounced draft round trip', async ({ cobroPage: page }) => {
  await page.goto('http://127.0.0.1:4173/basic.html');
  await selectAt(page, '#target');
  await page.keyboard.type('앞');
  await page.waitForTimeout(600); // 디바운스(300ms) 후 draft 전송 → 서버 state 브로드캐스트 → render
  await page.keyboard.type('뒤');
  await expect(page.locator(`${HOST} textarea`)).toHaveValue('앞뒤');
});

test('clicking through the glass does not close a click-outside dropdown', async ({ cobroPage: page }) => {
  await page.goto('http://127.0.0.1:4173/click-outside.html');
  await page.click('#toggle');
  await expect(page.locator('#menu')).toBeVisible();
  await selectAt(page, '#item1');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator(`${HOST} .els`)).toContainText('#item1');
});

test('overlay stays above max z-index header and survives a later native dialog', async ({ cobroPage: page }) => {
  await page.goto('http://127.0.0.1:4173/high-z.html');
  const tb = (await page.locator(`${HOST} .toolbar`).boundingBox())!;
  const topIsHost = () => page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.hasAttribute('data-cobro-host') === true, [tb.x + tb.width / 2, tb.y + tb.height / 2] as [number, number]);
  expect(await topIsHost()).toBe(true); // z-index 2147483647 고정 헤더 위
  await page.click('#openDialog');
  await expect(page.locator('#nativeDlg')).toBeVisible();
  // Chromium은 modal <dialog>와 그 ::backdrop을 top layer 삽입 순서와 무관하게 popover 위에 그린다
  // (dialog가 열린 뒤 새로 showPopover()한 popover도 아래에 깔린다 — 보고서의 실험 참조).
  // 그 동안에도 우리 popover는 열린 채 유지되고, dialog가 닫히면 즉시 최상단으로 복귀한다.
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-cobro-host]')!.matches(':popover-open'))).toBe(true);
  await page.evaluate(() => (document.getElementById('nativeDlg') as HTMLDialogElement).close());
  await expect.poll(topIsHost).toBe(true);
});

test('works on a strict-CSP page (bypassCSP context)', async ({ cobroPage: page, bridge }) => {
  await page.goto('http://127.0.0.1:4173/csp.html');
  await expect(page.locator(`${HOST} .status`)).toContainText('에이전트');
  await expect.poll(() => bridge.channel.clientCount()).toBe(1);
});

test('drafts survive reload and missing elements are marked', async ({ cobroPage: page, bridge }) => {
  await page.goto('http://127.0.0.1:4173/basic.html');
  await selectAt(page, '#target');
  await page.locator(`${HOST} textarea`).fill('임시');
  await expect.poll(() => bridge.core.session.batches[0]?.note).toBe('임시'); // 디바운스된 draft 반영까지 대기
  // reload는 고정 페이지 HTML을 그대로 다시 준다 → 재주입 후에도 요소가 없으려면 로드 시점에 지워야 한다
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => document.getElementById('target')?.remove()); });
  await page.reload();
  await expect(page.locator(`${HOST} textarea`)).toHaveValue('임시');
  await expect(page.locator(`${HOST} .els .missing`)).toContainText('요소 없음');
});

test('reload strategy reloads the page on done', async ({ cobroPage: page, bridge }) => {
  await page.goto('http://127.0.0.1:4173/basic.html');
  await expect.poll(() => bridge.core.session.detected).toBe('reload');
  const loaded = page.waitForEvent('load');
  bridge.done({ summary: 'x', selectors: [], changedFiles: [] });
  await loaded;
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('navigation').length > 0 && (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming).type)).toBe('reload');
});
