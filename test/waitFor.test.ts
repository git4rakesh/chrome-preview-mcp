// wait_for test: drive the Task 4 tool against a local file:// fixture.
//
// SUCCESS (selector/text): the fixture appends #late ("late text here") after
// ~300ms; wait_for resolves with the matched condition and positive elapsedMs.
// TIMEOUT: waiting for an element that never appears with a short timeout
// returns a structured timed-out result (never throws). BAD INPUT: no
// condition returns a structured error.
//
// Gating mirrors multiTab.test.ts: detectChromePath() auto-detects Chrome
// (test RUNS when present, SKIPS cleanly when absent). SKIP_BROWSER_TESTS=1
// forces a skip. Fixtures are local file:// URLs, so no live network is used.
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

const waitPath = path.resolve(process.cwd(), 'test/fixtures/wait.html');
const waitUrl = pathToFileURL(waitPath).href;

let manager: ChromeManager | null = null;

before(() => {
  if (skip) return;
  manager = new ChromeManager();
});

after(async () => {
  // Always close the browser so tests never leak Chrome processes.
  if (manager) {
    await manager.close();
    manager = null;
  }
});

test('wait_for resolves for a late-appearing selector', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(waitUrl);
  const result = (await tools.waitFor({ selector: '#late', timeout: 5000 })) as any;
  assert.equal(result.timedOut, false, 'should not time out');
  assert.equal(result.matched, 'selector', 'selector condition should match');
  assert.ok(result.elapsedMs > 0, 'elapsedMs should be positive');
});

test('wait_for resolves for late-appearing text', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  // Fresh navigate so the fixture's 300ms timer runs again from scratch.
  await tools.navigate(waitUrl);
  const result = (await tools.waitFor({ text: 'late text here', timeout: 5000 })) as any;
  assert.equal(result.timedOut, false, 'should not time out');
  assert.equal(result.matched, 'text', 'text condition should match');
  assert.ok(result.elapsedMs > 0, 'elapsedMs should be positive');
});

test('wait_for returns a structured timeout without throwing', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(waitUrl);
  const timeout = 500;
  const result = (await tools.waitFor({ selector: '#never-appears', timeout })) as any;
  assert.equal(result.timedOut, true, 'should time out');
  assert.equal(result.matched, null, 'no condition should match on timeout');
  // Allow a little scheduling slack below the configured timeout.
  assert.ok(result.elapsedMs >= timeout - 50, 'elapsedMs should be near the timeout');
});

test('wait_for returns a structured error when no condition is given', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  const result = (await tools.waitFor({})) as any;
  assert.ok('error' in result, 'should return a structured error for empty input');
});
