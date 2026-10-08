// Gated browser test for motion:'human' click/hover. Mirrors clickType.test.ts:
// detectChromePath() auto-detects Chrome (RUNS when present, SKIPS cleanly when
// absent); SKIP_BROWSER_TESTS=1 forces a skip. Fixtures are local file:// URLs,
// so no live network is used. The browser is closed in after() so no Chrome
// process leaks.
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

const actionUrl = pathToFileURL(
  path.resolve(process.cwd(), 'test/fixtures/action.html')
).href;
const hoverUrl = pathToFileURL(
  path.resolve(process.cwd(), 'test/fixtures/hover.html')
).href;

const SEED = 1337;

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

async function pollTitle(
  tools: BrowserTools,
  expected: string,
  attempts = 20
): Promise<string> {
  let title = '';
  for (let i = 0; i < attempts; i++) {
    title = (await tools.evaluate('document.title')).result as string;
    if (title === expected) return title;
    await new Promise((r) => setTimeout(r, 50));
  }
  return title;
}

test('human-motion click takes effect', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(actionUrl);
  const result = (await tools.click('#go', { motion: 'human', seed: SEED })) as any;
  assert.ok(!('error' in result), 'should not return a bad-input error');
  assert.notEqual(result.found, false, 'element should be found');

  const title = await pollTitle(tools, 'Clicked!');
  assert.equal(title, 'Clicked!', 'title should change after human-motion click');
});

test('human-motion hover triggers onmouseover', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(hoverUrl);
  const result = (await tools.hover('#target', { motion: 'human', seed: SEED })) as any;
  assert.ok(!('error' in result), 'should not return a bad-input error');
  assert.notEqual(result.found, false, 'element should be found');

  const title = await pollTitle(tools, 'Hovered!');
  assert.equal(title, 'Hovered!', 'title should change after human-motion hover');
});
