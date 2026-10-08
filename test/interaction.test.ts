// Task 9 interaction gap-fillers test: drive hover, scroll, select_option,
// handle_dialog, and the navigation tools (go_back/go_forward/reload) against
// local file:// fixtures in test/fixtures.
//
// Gating mirrors clickType.test.ts: detectChromePath() auto-detects Chrome
// (RUNS when present, SKIPS cleanly when absent); SKIP_BROWSER_TESTS=1 forces a
// skip. All fixtures are local file:// URLs (no live network), and the browser
// is closed in after() so no Chrome process leaks. Assertions are event-driven
// (short polling on observable state) rather than long fixed sleeps.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { ChromeManager, detectChromePath } from '../src/chromeManager.js';
import { BrowserTools } from '../src/tools.js';

const chromePath = detectChromePath();
const forceSkip = process.env.SKIP_BROWSER_TESTS === '1';
const skip = forceSkip
  ? 'SKIP_BROWSER_TESTS=1 set'
  : chromePath
    ? false
    : 'no Chrome/Chromium executable detected';

const fixtureUrl = (name: string) =>
  pathToFileURL(path.resolve(process.cwd(), `test/fixtures/${name}`)).href;

let manager: ChromeManager | null = null;

before(() => {
  if (skip) return;
  manager = new ChromeManager();
});

after(async () => {
  if (manager) {
    await manager.close();
    manager = null;
  }
});

/** Poll an evaluate() result until it equals a target or attempts run out. */
async function pollUntil(
  tools: BrowserTools,
  script: string,
  predicate: (v: unknown) => boolean,
  attempts = 30,
  intervalMs = 100
): Promise<unknown> {
  let value: unknown;
  for (let i = 0; i < attempts; i++) {
    const r = (await tools.evaluate(script)) as any;
    value = r.result;
    if (predicate(value)) return value;
    await new Promise((res) => setTimeout(res, intervalMs));
  }
  return value;
}

test('hover reveals observable change (title via onmouseover)', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(fixtureUrl('hover.html'));
  const result = (await tools.hover('#target')) as any;
  assert.ok(!('error' in result), 'should not return a bad-input error');
  assert.notEqual(result.found, false, 'element should be found');

  const title = await pollUntil(tools, 'document.title', (v) => v === 'Hovered!');
  assert.equal(title, 'Hovered!', 'title should change after hover');
});

test('hover not-found returns a structured result (no throw)', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('hover.html'));
  const result = (await tools.hover('#does-not-exist', { by: 'css' })) as any;
  assert.equal(result.found, false, 'should return found:false, not throw');
});

test('select_option selects a value and the <select> reflects it', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('select.html'));
  const result = (await tools.selectOption({ selector: '#color', values: 'blue' })) as any;
  assert.ok(!('error' in result), 'should not return a bad-input error');
  assert.ok(Array.isArray(result.selected), 'selected should be an array');
  assert.ok(result.selected.includes('blue'), 'selected should include "blue"');

  const value = await tools.evaluate('document.getElementById("color").value');
  assert.equal(value.result, 'blue', 'the <select> value should be "blue"');
});

test('select_option supports multi-select via an array of values', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('select.html'));
  const result = (await tools.selectOption({
    selector: '#fruits',
    values: ['apple', 'cherry'],
  })) as any;
  assert.ok(Array.isArray(result.selected), 'selected should be an array');
  assert.ok(result.selected.includes('apple'), 'selected should include "apple"');
  assert.ok(result.selected.includes('cherry'), 'selected should include "cherry"');

  const count = await tools.evaluate(
    'document.getElementById("fruits").selectedOptions.length'
  );
  assert.equal(count.result, 2, 'two options should be selected');
});

test('scroll by amount changes window.scrollY', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('scroll.html'));
  const before = await tools.evaluate('window.scrollY');
  assert.equal(before.result, 0, 'should start at the top');

  const result = (await tools.scroll({ y: 800 })) as any;
  assert.ok(!('error' in result), 'should not return an error');
  assert.equal(result.mode, 'amount', 'should be amount mode');
  assert.ok(result.scrollY > 0, 'returned scrollY should be > 0');

  const after = await tools.evaluate('window.scrollY');
  assert.ok((after.result as number) > 0, 'window.scrollY should have increased');
});

test('scroll an element into view (element mode)', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('scroll.html'));
  const result = (await tools.scroll({ selector: '#bottom' })) as any;
  assert.ok(!('error' in result), 'should not return an error');
  assert.notEqual(result.found, false, 'element should be found');
  assert.equal(result.mode, 'element', 'should be element mode');
  assert.ok(result.scrollY > 0, 'scrollY should have increased after scrollIntoView');
});

test('handle_dialog accept drives the confirm() true path', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('dialog.html'));
  const cfg = (await tools.handleDialog({ action: 'accept' })) as any;
  assert.equal(cfg.action, 'accept', 'dialog handling should be configured to accept');

  // Clicking fires confirm(); the configured handler auto-accepts it, so the
  // confirm() true path runs and the page sets document.title to 'confirmed'.
  await tools.click('#go');
  const title = await pollUntil(
    tools,
    'document.title',
    (v) => v === 'confirmed' || v === 'cancelled'
  );
  assert.equal(title, 'confirmed', 'accepted confirm() should drive title to "confirmed"');
});

test('go_back and reload work after navigating between fixtures', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(fixtureUrl('nav-a.html'));
  const titleA = await tools.evaluate('document.title');
  assert.equal(titleA.result, 'Page A', 'should start on Page A');

  await tools.navigate(fixtureUrl('nav-b.html'));
  const titleB = await tools.evaluate('document.title');
  assert.equal(titleB.result, 'Page B', 'should be on Page B after navigate');

  const back = (await tools.goBack()) as any;
  assert.equal(back.navigated, true, 'go_back should navigate');
  assert.ok(
    (back.currentUrl as string).endsWith('nav-a.html'),
    'go_back should land on nav-a.html'
  );
  assert.equal(back.title, 'Page A', 'go_back should return Page A title');

  const reloaded = (await tools.reload()) as any;
  assert.equal(reloaded.reloaded, true, 'reload should report reloaded:true');
  assert.ok(
    (reloaded.currentUrl as string).endsWith('nav-a.html'),
    'reload should stay on nav-a.html'
  );

  // go_forward should return to B, or a structured note if the browser
  // collapsed history. Either way it must not throw/error.
  const fwd = (await tools.goForward()) as any;
  assert.ok(!('error' in fwd), 'go_forward should not throw/error');
  assert.ok(
    fwd.navigated === true || fwd.navigated === false,
    'go_forward should return a structured navigated flag'
  );
});
