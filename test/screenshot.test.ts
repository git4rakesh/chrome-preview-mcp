// Screenshot enhancement tests for the extended take_screenshot tool.
//
// Gating is AUTO-DETECTED via detectChromePath() (same as the smoke test):
//   - Chrome found  -> runs automatically.
//   - Chrome absent -> skipped with a clear reason (suite stays green).
// SKIP_BROWSER_TESTS=1 forces a skip. Fixtures load over file:// (no network).
//
// Covers: backward-compat default path, element shot (selector), fallback with
// note (non-existent selector), and fullPage.
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

const fixturePath = path.resolve(process.cwd(), 'test/fixtures/screenshot.html');
const fixtureUrl = pathToFileURL(fixturePath).href;

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

test('take_screenshot default path is backward compatible', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(fixtureUrl);

  const result = await tools.takeScreenshot();
  assert.equal(result.mimeType, 'image/png');
  assert.equal(typeof result.data, 'string');
  assert.ok(Buffer.from(result.data as string, 'base64').length > 0, 'non-empty PNG');
  // The pure-default path must not carry any of the new fields.
  assert.equal((result as { note?: string }).note, undefined);
  assert.equal((result as { selectorFound?: boolean }).selectorFound, undefined);
  assert.equal((result as { mode?: string }).mode, undefined);
});

test('take_screenshot with a valid selector returns an element shot', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(fixtureUrl);

  const result = await tools.takeScreenshot({ selector: '#box' });
  assert.equal(result.mimeType, 'image/png');
  assert.ok(Buffer.from(result.data as string, 'base64').length > 0, 'non-empty PNG');
  assert.equal((result as { selectorFound?: boolean }).selectorFound, true);
  assert.equal((result as { mode?: string }).mode, 'element');

  // Element shot should differ from the full viewport shot (smaller region).
  const viewport = await tools.takeScreenshot();
  const elementBytes = Buffer.from(result.data as string, 'base64').length;
  const viewportBytes = Buffer.from(viewport.data as string, 'base64').length;
  assert.notEqual(elementBytes, viewportBytes, 'element shot should differ from viewport');
});

test('take_screenshot with a missing selector falls back with a note', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(fixtureUrl);

  const result = await tools.takeScreenshot({ selector: '#does-not-exist-xyz' });
  assert.equal(result.mimeType, 'image/png');
  assert.ok(Buffer.from(result.data as string, 'base64').length > 0, 'viewport PNG still returned');
  assert.equal((result as { selectorFound?: boolean }).selectorFound, false);
  const note = (result as { note?: string }).note;
  assert.ok(note && note.length > 0, 'a non-empty fallback note is present');
});

test('take_screenshot with fullPage returns image data', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(fixtureUrl);

  const result = await tools.takeScreenshot({ fullPage: true });
  assert.equal(result.mimeType, 'image/png');
  assert.ok(Buffer.from(result.data as string, 'base64').length > 0, 'non-empty PNG');
  assert.equal((result as { mode?: string }).mode, 'fullPage');
});
