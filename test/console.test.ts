// Console access test (Task 8). Exercises the console/pageerror capture wired
// through the same central registerPage path as Task 7 plus the
// get_console_messages tool (buffer contents + level filtering).
//
// Gating mirrors network.test.ts / multiTab.test.ts: detectChromePath()
// auto-detects Chrome (test RUNS when present, SKIPS cleanly when absent).
// SKIP_BROWSER_TESTS=1 forces a skip. The fixture is a local file:// URL whose
// inline script logs, errors, and throws an uncaught exception, so no live
// network is used. Capture is awaited via a bounded poll, not a long sleep.
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

const consolePath = path.resolve(process.cwd(), 'test/fixtures/console.html');
const consoleUrl = pathToFileURL(consolePath).href;

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

// Poll a condition until it holds or the timeout elapses. Avoids arbitrary
// long sleeps while still awaiting asynchronous capture events.
async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
  intervalMs = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

test('buffers console messages + pageerror and filters by level', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser('about:blank');
  // Navigate explicitly so the fixture's inline script runs and emits console
  // + pageerror events into the buffer regardless of prior profile state.
  await tools.navigate(consoleUrl);

  // Poll until the log, error, and pageerror entries have all been captured. A
  // generous timeout absorbs a cold Chrome launch when this suite runs after
  // others tear the browser down.
  const captured = await waitFor(async () => {
    const list = await tools.getConsoleMessages();
    const hasLog = list.messages.some(
      (m) => m.type === 'log' && m.text.includes('hello from page')
    );
    const hasError = list.messages.some(
      (m) => m.type === 'error' && m.text.includes('boom')
    );
    const hasPageError = list.messages.some(
      (m) => m.type === 'pageerror' && m.text.includes('uncaught boom')
    );
    return hasLog && hasError && hasPageError;
  }, 15000);
  assert.ok(captured, 'console log, error, and pageerror should all be captured');

  // The full buffer contains the logged text at the correct levels.
  const all = await tools.getConsoleMessages();
  const log = all.messages.find(
    (m) => m.type === 'log' && m.text.includes('hello from page')
  );
  assert.ok(log, 'console.log entry present at level "log"');

  const err = all.messages.find(
    (m) => m.type === 'error' && m.text.includes('boom')
  );
  assert.ok(err, 'console.error entry present at level "error"');

  const pageError = all.messages.find(
    (m) => m.type === 'pageerror' && m.text.includes('uncaught boom')
  );
  assert.ok(pageError, 'uncaught error surfaced as a "pageerror" entry');

  // Filtering by level narrows results to that level only.
  const errorsOnly = await tools.getConsoleMessages({ level: 'error' });
  assert.ok(
    errorsOnly.messages.length > 0,
    'level filter returns the matching error entries'
  );
  assert.ok(
    errorsOnly.messages.every((m) => m.type === 'error'),
    'every filtered entry is of the requested level'
  );
  assert.ok(
    errorsOnly.messages.some((m) => m.text.includes('boom')),
    'the console.error entry is among the filtered results'
  );

  // The pageerror filter narrows to the uncaught-error entry only.
  const pageErrorsOnly = await tools.getConsoleMessages({ level: 'pageerror' });
  assert.ok(
    pageErrorsOnly.messages.length > 0 &&
      pageErrorsOnly.messages.every((m) => m.type === 'pageerror'),
    'filtering by "pageerror" returns only pageerror entries'
  );
});
