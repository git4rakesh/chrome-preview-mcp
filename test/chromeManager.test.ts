// Pure, non-browser unit test. Always runs (no Chrome required) so `npm test`
// has a green assertion even in environments without a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChromePath } from '../src/chromeManager.js';

test('detectChromePath returns a string path or null without throwing', () => {
  const result = detectChromePath();
  assert.ok(
    typeof result === 'string' || result === null,
    'expected a string path or null'
  );
  if (typeof result === 'string') {
    assert.ok(result.length > 0, 'expected a non-empty path when found');
  }
});
