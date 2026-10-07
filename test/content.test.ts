// get_content (scoped) + get_html tests against a local file:// fixture.
//
// get_content: no selector returns the fixture title (backward compat) plus
// page text; a selector scopes text to that element; a non-matching selector
// returns a structured not-found result (never throws). get_html: no selector
// returns the full document outerHTML; a selector returns that element's
// outerHTML; a tiny maxLength caps the output and flags truncation.
//
// Gating mirrors waitFor.test.ts: detectChromePath() auto-detects Chrome (test
// RUNS when present, SKIPS cleanly when absent). SKIP_BROWSER_TESTS=1 forces a
// skip. The fixture is a local file:// URL, so no live network is used.
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

const contentPath = path.resolve(process.cwd(), 'test/fixtures/content.html');
const contentUrl = pathToFileURL(contentPath).href;

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

test('get_content without a selector returns the title and page text', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser(contentUrl);
  const content = (await tools.getContent()) as any;
  assert.equal(content.title, 'Content Fixture', 'backward-compat: title preserved');
  assert.ok(content.currentUrl.startsWith('file://'), 'should be on the file:// fixture');
  assert.ok(content.text.includes('Scoped content here'), 'page text includes scoped content');
  assert.ok(content.text.includes('Out of scope'), 'page text includes out-of-scope content');
  assert.equal(content.truncated, false, 'small fixture is not truncated');
});

test('get_content with selector scopes text to that element', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(contentUrl);
  const content = (await tools.getContent({ selector: '#scope' })) as any;
  assert.equal(content.selectorFound, true, 'selector should be found');
  assert.ok(content.text.includes('Scoped content'), 'scoped text present');
  assert.ok(!content.text.includes('Out of scope'), 'out-of-scope text excluded');
  assert.equal(content.title, 'Content Fixture', 'title stays page-level');
});

test('get_content with a non-matching selector returns a structured not-found', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(contentUrl);
  const content = (await tools.getContent({ selector: '#does-not-exist' })) as any;
  assert.equal(content.selectorFound, false, 'selector should not be found');
  assert.equal(content.text, null, 'text is null when selector matches nothing');
  assert.equal(content.title, 'Content Fixture', 'title still present');
});

test('get_html without a selector returns the full document outerHTML', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(contentUrl);
  const result = (await tools.getHtml()) as any;
  assert.equal(typeof result.html, 'string', 'html should be a string');
  assert.ok(result.html.includes('<html'), 'html contains the document element');
  assert.equal(result.truncated, false, 'small fixture is not truncated');
});

test('get_html with selector returns that element outerHTML', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(contentUrl);
  const result = (await tools.getHtml({ selector: '#scope' })) as any;
  assert.equal(result.selectorFound, true, 'selector should be found');
  assert.ok(result.html.includes('id="scope"'), 'outerHTML includes the scoped element');
});

test('get_html with a tiny maxLength truncates the output', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.navigate(contentUrl);
  const result = (await tools.getHtml({ selector: '#scope', maxLength: 10 })) as any;
  assert.equal(result.truncated, true, 'should be truncated');
  assert.ok(result.html.length <= 10, 'html should be capped to maxLength');
});
