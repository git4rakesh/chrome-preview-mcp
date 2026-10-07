// click/type text/role selection test: drive the Task 6 tools against a local
// file:// fixture (test/fixtures/action.html).
//
// The fixture has a <button id="go">Click Me</button> that, when clicked, sets
// document.title to 'Clicked!' and appends #clicked-marker — so a click (by
// css, text, or role) is assertable from the DOM/title. It also has an
// <input id="field"> for the type backward-compat test.
//
// Gating mirrors waitFor.test.ts: detectChromePath() auto-detects Chrome (test
// RUNS when present, SKIPS cleanly when absent). SKIP_BROWSER_TESTS=1 forces a
// skip. Fixtures are local file:// URLs, so no live network is used. The
// browser is closed in after() so no Chrome process leaks.
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

const actionPath = path.resolve(process.cwd(), 'test/fixtures/action.html');
const actionUrl = pathToFileURL(actionPath).href;

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

// REQUIRED DEMO: click by visible text actually clicks the button.
test('click by text clicks the button matching its visible text', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(actionUrl);
  const result = (await tools.click('Click Me', { by: 'text' })) as any;
  assert.ok(!('error' in result), 'should not return a bad-input error');
  assert.notEqual(result.found, false, 'element should be found');

  const title = await tools.evaluate('document.title');
  assert.equal(title.result, 'Clicked!', 'title should change after click by text');
});

// Backward compat: click by CSS still works.
test('click by css (default) still works', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(actionUrl);
  const result = (await tools.click('#go')) as any;
  assert.notEqual(result.found, false, 'element should be found');
  assert.equal(result.by, 'css', 'by should default to css');

  const title = await tools.evaluate('document.title');
  assert.equal(title.result, 'Clicked!', 'title should change after click by css');
});

// Backward compat: type by CSS into an input and assert its value.
test('type by css (default) types into an input', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(actionUrl);
  const result = (await tools.type('#field', 'hello')) as any;
  assert.notEqual(result.found, false, 'input should be found');
  assert.equal(result.by, 'css', 'by should default to css');

  const value = await tools.evaluate('document.getElementById("field").value');
  assert.equal(value.result, 'hello', 'input value should be the typed text');
});

// Optional: role-based click (role=button + accessible name).
test('click by role + accessible name clicks the button', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(actionUrl);
  const result = (await tools.click('Click Me', { by: 'role', role: 'button' })) as any;
  assert.notEqual(result.found, false, 'element should be found by role');

  const title = await tools.evaluate('document.title');
  assert.equal(title.result, 'Clicked!', 'title should change after click by role');
});

// Not-found by text returns a structured result (no throw).
test('click by text not-found returns a structured result (no throw)', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(actionUrl);
  const result = (await tools.click('Nope Nope Nope', { by: 'text', role: undefined })) as any;
  assert.equal(result.found, false, 'should return found:false, not throw');
  assert.equal(result.by, 'text', 'by should be text');
});
