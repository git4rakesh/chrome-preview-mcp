// Chrome-independent unit tests for the selector-engine builders
// (buildTextEngineSelector / buildAriaEngineSelector in src/tools.ts). These
// ALWAYS run — no browser is touched. They prove that text/role values with
// special characters are either safely encoded or FAIL CLOSED (null =>
// structured not-found) so the generated engine selector can never be broken,
// altered, or made to mis-resolve to the wrong element (the Task-6 fix).
//
// Grammar facts these tests encode (verified against puppeteer-core 24.x):
//  - `text/<value>`: the whole remainder is the literal text (no sub-grammar),
//    so a plain value passes through unchanged and matching is preserved.
//  - `aria/<name>[role="<role>"]`: the aria handler regex strips
//    `[attr="value"]` segments; a name with a bracket/quote could inject an
//    attribute, so we fail closed on those, and the role is escaped inside the
//    quoted segment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTextEngineSelector,
  buildAriaEngineSelector,
} from '../src/tools.js';

// ---- text engine ----------------------------------------------------------

test('text: a plain value passes through unchanged (matching preserved)', () => {
  assert.equal(buildTextEngineSelector('Click Me'), 'text/Click Me');
});

test('text: brackets/quotes/slashes in the value are literal, not a sub-grammar', () => {
  // These characters are part of the literal text to match, so they are kept
  // verbatim — there is nothing for them to break out of.
  assert.equal(
    buildTextEngineSelector('Buy [now] "today"/cheap'),
    'text/Buy [now] "today"/cheap'
  );
});

test('text: an empty value is rejected (fail closed)', () => {
  assert.equal(buildTextEngineSelector(''), null);
});

// ---- aria engine ----------------------------------------------------------

test('aria: a plain name + role builds the expected selector', () => {
  assert.equal(
    buildAriaEngineSelector('Click Me', 'button'),
    'aria/Click Me[role="button"]'
  );
});

test('aria: a plain name with no role builds a name-only selector', () => {
  assert.equal(buildAriaEngineSelector('Submit'), 'aria/Submit');
});

test('aria: a name containing a bracket fails closed (cannot inject an attribute)', () => {
  // Without failing closed, `Login[role="admin"]` would be parsed as an
  // attribute segment and silently alter the query.
  assert.equal(buildAriaEngineSelector('Login[role="admin"]', 'link'), null);
});

test('aria: a name containing a quote fails closed', () => {
  assert.equal(buildAriaEngineSelector('Say "hi"', 'button'), null);
  assert.equal(buildAriaEngineSelector("O'Brien", 'button'), null);
});

test('aria: a role with a double-quote is backslash-escaped inside the segment', () => {
  // The role sits inside a quoted segment, so escaping the quote keeps the
  // segment intact instead of terminating it early.
  assert.equal(
    buildAriaEngineSelector('OK', 'bu"tton'),
    'aria/OK[role="bu\\"tton"]'
  );
});

test('aria: a role with a bracket fails closed', () => {
  assert.equal(buildAriaEngineSelector('OK', 'button]'), null);
});
