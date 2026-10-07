// Multi-tab test: open a second tab via window.open, then exercise the Task 3
// tools — list_tabs (both tabs, one active), select_tab (switches the active
// page so get_content reflects it), and close_tab (closes a tab and leaves a
// sane active tab). Invalid selectors must return structured errors, not throw.
//
// Gating mirrors pageTracking.test.ts: detectChromePath() auto-detects Chrome
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

const openerPath = path.resolve(process.cwd(), 'test/fixtures/opener.html');
const openerUrl = pathToFileURL(openerPath).href;

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
// long sleeps while still awaiting asynchronous target events.
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

test('list/select/close round-trip across two tabs', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  // Opener's script fires window.open on load; click the button as a
  // user-gesture fallback in case the popup blocker swallows the on-load open.
  await tools.openBrowser(openerUrl);
  try {
    const page = await manager!.getActivePage();
    await page.click('#open').catch(() => {});
  } catch {
    // Non-fatal: the on-load open may already have produced the popup.
  }

  const reachedTwo = await waitFor(() => manager!.getPages().length >= 2);
  assert.ok(reachedTwo, 'registry should reach 2 pages after window.open');

  // list_tabs: both tabs present, exactly one active, each with a non-empty id.
  const list = await tools.listTabs();
  assert.equal(list.count, 2, 'list_tabs should report 2 tabs');
  assert.equal(list.tabs.length, 2, 'list_tabs should return 2 tab entries');
  assert.equal(
    list.tabs.filter((t) => t.active).length,
    1,
    'exactly one tab should be marked active'
  );
  for (const tab of list.tabs) {
    assert.ok(tab.id && tab.id.length > 0, 'each tab should have a non-empty id');
  }
  const urls = list.tabs.map((t) => t.url);
  assert.ok(
    urls.some((u) => u.endsWith('opener.html')),
    'tab list should include the opener'
  );
  assert.ok(
    urls.some((u) => u.endsWith('popup.html')),
    'tab list should include the popup'
  );

  // The popup is active (Task 2 activation policy); the opener is the other tab.
  const openerTab = list.tabs.find((t) => t.url.endsWith('opener.html'));
  assert.ok(openerTab, 'opener tab should be present');

  // select_tab by id → opener becomes active; get_content reflects it.
  const selected = await tools.selectTab({ id: openerTab!.id });
  assert.ok(
    'url' in selected && (selected as any).url.endsWith('opener.html'),
    'select_tab should return the opener tab'
  );
  const content = await tools.getContent();
  assert.ok(
    content.currentUrl.endsWith('opener.html'),
    'get_content should reflect the newly selected (opener) tab'
  );

  // Invalid selectors return structured errors (no throw).
  const noArgs = await tools.selectTab({});
  assert.ok('error' in noArgs, 'select_tab with no args should return an error');
  const badIndex = await tools.selectTab({ index: 999 });
  assert.ok('error' in badIndex, 'select_tab with a bad index should return an error');

  // close_tab: close the opener; one tab remains with a sane active tab.
  const closed = await tools.closeTab({ id: openerTab!.id });
  const downToOne = await waitFor(() => manager!.getPages().length === 1);
  assert.ok(downToOne, 'registry should drop to 1 page after close_tab');
  assert.ok('remaining' in closed, 'close_tab should report remaining count');
  assert.equal((closed as any).remaining, 1, 'one tab should remain after close');
  assert.ok((closed as any).active, 'a sane active tab should remain');
  assert.ok(
    (closed as any).active.url.endsWith('popup.html'),
    'the surviving active tab should be the popup'
  );
});
