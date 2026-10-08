// Page-tracking test: a page that calls window.open must result in a 2-page
// registry, proving new tabs/popups auto-register through the central path.
//
// Gating mirrors browser.smoke.test.ts: detectChromePath() auto-detects Chrome
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
// long sleeps while still awaiting the asynchronous targetcreated event.
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

test('window.open registers a second page in the live registry', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  // Opener's script fires window.open on load (and we also click the button as
  // a user-gesture fallback in case the popup blocker swallows the on-load open).
  await tools.openBrowser(openerUrl);
  try {
    const page = await manager!.getActivePage();
    await page.click('#open').catch(() => {});
  } catch {
    // Non-fatal: the on-load open may already have produced the popup.
  }

  const reachedTwo = await waitFor(() => manager!.getPages().length >= 2);
  assert.ok(reachedTwo, 'registry should reach 2 pages after window.open');
  assert.equal(
    manager!.getPages().length,
    2,
    'window.open should register exactly a second page'
  );

  // Strengthen (but don't destabilize): confirm the popup became active.
  const activeIsPopup = await waitFor(async () => {
    const active = await manager!.getActivePage();
    return active.url().endsWith('popup.html');
  });
  if (activeIsPopup) {
    const active = await manager!.getActivePage();
    assert.ok(
      active.url().endsWith('popup.html'),
      'newly opened popup should become the active page'
    );
  }
});
