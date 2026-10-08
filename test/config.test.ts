// Chrome-independent unit tests for the config module (src/config.ts) and its
// pure parse helpers. These ALWAYS run — no browser is touched. Because the
// frozen `config` object is captured at module load, env-override behavior is
// verified against the pure helpers (parseBool/parseIntEnv), while the default
// snapshot is verified against the loaded `config`. Any process.env mutation is
// saved and restored so these tests never leak env into the rest of the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, parseBool, parseIntEnv } from '../src/config.js';

// Helper: run `fn` with process.env[name] set to `value`, then restore.
function withEnv(name: string, value: string | undefined, fn: () => void) {
  const had = Object.prototype.hasOwnProperty.call(process.env, name);
  const prev = process.env[name];
  try {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
    fn();
  } finally {
    if (had) process.env[name] = prev;
    else delete process.env[name];
  }
}

test('config exposes the current defaults when env is unset', () => {
  // The test suite runs with no env set, so these are the baked-in defaults.
  assert.equal(config.NETWORK_BUFFER_SIZE, 500);
  assert.equal(config.CONSOLE_BUFFER_SIZE, 500);
  assert.equal(config.RESPONSE_BODY_CHARS, 100000);
  assert.equal(config.CONTENT_CHARS, 50000);
  assert.equal(config.HTML_CHARS, 500000);
  assert.equal(config.RESOLVE_TIMEOUT_MS, 10000);
  assert.equal(config.WAIT_FOR_TIMEOUT_MS, 30000);
  assert.equal(config.NAVIGATION_TIMEOUT_MS, 30000);
  assert.deepEqual(config.DWELL_MS, { min: 40, max: 120 });
  assert.equal(config.HUMANIZE_INPUT, false);
});

test('config is frozen (immutable)', () => {
  assert.ok(Object.isFrozen(config));
});

test('parseBool is true only for "true" or "1"', () => {
  withEnv('CP_TEST_BOOL', 'true', () =>
    assert.equal(parseBool('CP_TEST_BOOL'), true)
  );
  withEnv('CP_TEST_BOOL', '1', () =>
    assert.equal(parseBool('CP_TEST_BOOL'), true)
  );
  withEnv('CP_TEST_BOOL', 'false', () =>
    assert.equal(parseBool('CP_TEST_BOOL'), false)
  );
  withEnv('CP_TEST_BOOL', '0', () =>
    assert.equal(parseBool('CP_TEST_BOOL'), false)
  );
  withEnv('CP_TEST_BOOL', 'yes', () =>
    assert.equal(parseBool('CP_TEST_BOOL'), false)
  );
  withEnv('CP_TEST_BOOL', undefined, () =>
    assert.equal(parseBool('CP_TEST_BOOL'), false)
  );
});

test('parseIntEnv parses valid integers', () => {
  withEnv('CP_TEST_INT', '250', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 250)
  );
  withEnv('CP_TEST_INT', '0', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 0)
  );
});

test('parseIntEnv falls back to default on unset/empty/invalid', () => {
  withEnv('CP_TEST_INT', undefined, () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 500)
  );
  withEnv('CP_TEST_INT', '', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 500)
  );
  withEnv('CP_TEST_INT', 'abc', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 500)
  );
  withEnv('CP_TEST_INT', '12.5', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 500)
  );
  withEnv('CP_TEST_INT', 'NaN', () =>
    assert.equal(parseIntEnv('CP_TEST_INT', 500), 500)
  );
});
