// Browser smoke test: open_browser -> get_content returns the fixture title.
//
// Gating is AUTO-DETECTED: we reuse detectChromePath() (the same cross-platform
// detection the server uses) to decide whether to run. No manual flag is needed
// for the normal case:
//   - Chrome found  -> this test RUNS automatically.
//   - Chrome absent -> this test is SKIPPED with a clear reason (suite stays green).
// An optional explicit override, SKIP_BROWSER_TESTS=1, forces a skip.
//
// The fixture is loaded via a file:// URL, so no live network access is used.
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

// `npm test` runs from the repo root, so resolve the fixture from cwd. This
// avoids import.meta (not available in the CommonJS output this project emits).
const fixturePath = path.resolve(process.cwd(), 'test/fixtures/sample.html');
const fixtureUrl = pathToFileURL(fixturePath).href;

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

test('open_browser then get_content returns the fixture title', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  const opened = await tools.openBrowser(fixtureUrl);
  assert.equal(opened.title, 'Chrome Preview MCP Smoke Test');

  const content = await tools.getContent();
  assert.equal(content.title, 'Chrome Preview MCP Smoke Test');
  assert.ok(content.currentUrl.startsWith('file://'), 'should be on the file:// fixture');
});
