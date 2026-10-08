// Chrome-independent unit tests for the pure human-mouse path generator and
// its helpers (src/humanMouse.ts). These ALWAYS run — there is no skip gate —
// because nothing here touches a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mulberry32,
  generateMousePath,
  dwellTime,
  DEFAULT_DWELL_MS,
  type Point,
} from '../src/humanMouse.js';

const start: Point = { x: 10, y: 20 };
const end: Point = { x: 400, y: 300 };

test('same seed produces an identical path', () => {
  const a = generateMousePath({ start, end, seed: 42 });
  const b = generateMousePath({ start, end, seed: 42 });
  assert.deepEqual(a, b, 'identical seeds must yield identical arrays');
});

test('different seeds produce different paths', () => {
  const a = generateMousePath({ start, end, seed: 1 });
  const b = generateMousePath({ start, end, seed: 2 });
  assert.notDeepEqual(a, b, 'different seeds should diverge');
});

test('endpoints equal start and end exactly (no jitter)', () => {
  const path = generateMousePath({ start, end, seed: 7 });
  assert.deepEqual(path[0], start, 'first point must equal start exactly');
  assert.deepEqual(path[path.length - 1], end, 'last point must equal end exactly');
});

test('path is non-linear beyond a pixel threshold', () => {
  const path = generateMousePath({ start, end, seed: 123 });
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  // Perpendicular distance of each interior point from the straight line.
  let maxDeviation = 0;
  for (let i = 1; i < path.length - 1; i++) {
    const p = path[i];
    const cross = Math.abs(dx * (start.y - p.y) - (start.x - p.x) * dy);
    const deviation = cross / len;
    if (deviation > maxDeviation) maxDeviation = deviation;
  }
  assert.ok(
    maxDeviation > 1,
    `expected at least one interior point to deviate >1px (got ${maxDeviation})`
  );
});

test('interior jitter stays within configured bounds', () => {
  const steps = 24;
  const jitter = 2;
  // With curvature 0 the control points sit exactly on the straight line at the
  // 0.3 and 0.7 fractions, so the un-jittered Bezier position is deterministic.
  // The only deviation from it is the bounded per-axis jitter.
  const curvature = 0;
  const path = generateMousePath({ start, end, seed: 99, steps, jitter, curvature });

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // Collinear control points for curvature 0.
  const c1 = { x: start.x + dx * 0.3, y: start.y + dy * 0.3 };
  const c2 = { x: start.x + dx * 0.7, y: start.y + dy * 0.7 };
  const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) => {
    const u = 1 - t;
    return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
  };

  for (let i = 1; i < path.length - 1; i++) {
    const raw = i / (steps - 1);
    const t = raw < 0.5 ? 2 * raw * raw : 1 - Math.pow(-2 * raw + 2, 2) / 2;
    const idealX = cubic(start.x, c1.x, c2.x, end.x, t);
    const idealY = cubic(start.y, c1.y, c2.y, end.y, t);
    assert.ok(
      Math.abs(path[i].x - idealX) <= jitter + 1e-9,
      `x jitter within ${jitter}px at point ${i}`
    );
    assert.ok(
      Math.abs(path[i].y - idealY) <= jitter + 1e-9,
      `y jitter within ${jitter}px at point ${i}`
    );
  }
});

test('dwellTime with a seeded rng is within bounds', () => {
  const rng = mulberry32(2024);
  for (let i = 0; i < 50; i++) {
    const d = dwellTime(rng, DEFAULT_DWELL_MS);
    assert.ok(
      d >= DEFAULT_DWELL_MS.min && d <= DEFAULT_DWELL_MS.max,
      `dwell ${d} within [${DEFAULT_DWELL_MS.min}, ${DEFAULT_DWELL_MS.max}]`
    );
  }
});

test('mulberry32 is deterministic for a given seed', () => {
  const a = mulberry32(5);
  const b = mulberry32(5);
  for (let i = 0; i < 10; i++) {
    assert.equal(a(), b(), 'same seed yields the same stream');
  }
});
