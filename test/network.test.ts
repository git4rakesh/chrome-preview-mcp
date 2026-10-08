// Network inspection test (Task 7). Exercises the capture infrastructure wired
// through registerPage plus the two tools: list_network_requests (buffer +
// url-substring filtering) and get_network_request (headers + status + body
// with sensitive-header redaction). A browser-independent unit test on
// redactHeaders guarantees the redaction requirement is always exercised.
//
// Gating mirrors multiTab.test.ts: detectChromePath() auto-detects Chrome
// (test RUNS when present, SKIPS cleanly when absent). SKIP_BROWSER_TESTS=1
// forces a skip. Fixtures are local file:// URLs, so no live network is used.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as path from 'node:path';
import { ChromeManager, detectChromePath } from '../src/chromeManager.js';
import { BrowserTools, redactHeaders } from '../src/tools.js';

const chromePath = detectChromePath();
const forceSkip = process.env.SKIP_BROWSER_TESTS === '1';
const skip = forceSkip
  ? 'SKIP_BROWSER_TESTS=1 set'
  : chromePath
    ? false
    : 'no Chrome/Chromium executable detected';

const networkPath = path.resolve(process.cwd(), 'test/fixtures/network.html');
const networkUrl = pathToFileURL(networkPath).href;

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

// --- Browser-independent redaction unit test (always runs) ----------------
test('redactHeaders redacts sensitive headers by default', () => {
  const headers = {
    authorization: 'Bearer secret-token',
    cookie: 'session=abc',
    'set-cookie': 'session=abc; Path=/',
    'x-api-key': 'key-123',
    'content-type': 'application/json',
  };

  const redacted = redactHeaders(headers);
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal(redacted.cookie, '[REDACTED]');
  assert.equal(redacted['set-cookie'], '[REDACTED]');
  assert.equal(redacted['x-api-key'], '[REDACTED]', 'api-key-style header redacted');
  assert.equal(
    redacted['content-type'],
    'application/json',
    'benign header is left untouched'
  );

  // Opt-out leaves everything intact.
  const raw = redactHeaders(headers, false);
  assert.equal(raw.authorization, 'Bearer secret-token');
  assert.equal(raw.cookie, 'session=abc');
  assert.equal(raw['x-api-key'], 'key-123');
});

test('captures network requests, filters, and reads detail', { skip }, async () => {
  assert.ok(manager, 'ChromeManager should be initialized');
  const tools = new BrowserTools(manager!);

  await tools.openBrowser('about:blank');
  // Navigate explicitly so a fresh document request is emitted into the buffer
  // regardless of any prior state in the persistent Chrome profile. (A reused
  // tab already sitting at the fixture URL would emit no new request.)
  await tools.navigate(networkUrl);

  // Poll until the main document request has been captured. A generous timeout
  // absorbs a cold Chrome launch when this suite runs after others tear the
  // browser down.
  const captured = await waitFor(async () => {
    const list = await tools.listNetworkRequests();
    return list.requests.some(
      (r) => r.resourceType === 'document' && r.url.endsWith('network.html')
    );
  }, 15000);
  assert.ok(captured, 'the main document request should be captured');

  // list_network_requests shows the document request with status + url.
  const all = await tools.listNetworkRequests();
  const doc = all.requests.find(
    (r) => r.resourceType === 'document' && r.url.endsWith('network.html')
  );
  assert.ok(doc, 'document request present in the buffer');
  assert.equal(doc!.resourceType, 'document');

  // Filtering by a url substring narrows the result set.
  const filtered = await tools.listNetworkRequests({ url: 'network.html' });
  assert.ok(
    filtered.requests.length > 0,
    'url-substring filter returns the matching request'
  );
  assert.ok(
    filtered.requests.every((r) => r.url.includes('network.html')),
    'every filtered request matches the substring'
  );
  const none = await tools.listNetworkRequests({ url: 'definitely-not-present-xyz' });
  assert.equal(none.requests.length, 0, 'a non-matching substring narrows to zero');

  // get_network_request returns headers + status for a captured id, structured.
  const detail = await tools.getNetworkRequest({ id: doc!.id });
  assert.equal((detail as any).found, true, 'detail should be found for a valid id');
  assert.ok(
    typeof (detail as any).requestHeaders === 'object',
    'request headers returned as an object'
  );
  assert.ok(
    'status' in detail,
    'status field present (number or null)'
  );

  // Redaction is applied by default: no header value should leak a raw cookie
  // or authorization token. (file:// requests rarely carry these, so we assert
  // the redaction contract: any such header, if present, is masked.)
  const headers = (detail as any).requestHeaders as Record<string, string>;
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === 'authorization' ||
      lower === 'cookie' ||
      lower === 'set-cookie' ||
      /(auth|token|api[-_]?key|secret|session|credential)/.test(lower)
    ) {
      assert.equal(value, '[REDACTED]', `${key} must be redacted by default`);
    }
  }

  // Missing id returns a structured not-found rather than throwing.
  const missing = await tools.getNetworkRequest({ id: 'no-such-id-999999' });
  assert.equal((missing as any).found, false, 'unknown id returns found:false');
});
