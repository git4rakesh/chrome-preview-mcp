// Human-like mouse motion (dependency-free).
//
// This module generates a curved, slightly jittery mouse path with a
// randomized press->release dwell so that pointer movement looks less like a
// teleport-and-click robot. It improves exactly ONE anti-bot signal — the
// naturalness of mouse movement — and is NOT a silver bullet: fingerprinting,
// timing, and many other signals are untouched. It STACKS with the existing
// applyStealth (page.evaluateOnNewDocument) rather than replacing it; use both.
//
// The path generator is PURE and seedable so it can be unit-tested without a
// browser. Only puppeteer-core TYPES are referenced here (no runtime import),
// keeping this module free of new dependencies.
import type { Page } from 'puppeteer-core';

/** A 2D point in CSS pixels. */
export interface Point {
  x: number;
  y: number;
}

/** Options for the pure path generator. */
export interface PathOptions {
  start: Point;
  end: Point;
  /** Seed for deterministic output. When omitted, Math.random is used. */
  seed?: number;
  /** Number of sampled points along the path (default 24, min 2). */
  steps?: number;
  /** Max per-point jitter in px applied to interior points (default 2). */
  jitter?: number;
  /** Control-point offset scale as a fraction of distance (default 0.2). */
  curvature?: number;
}

/** Default press->release dwell bounds in milliseconds. */
export const DEFAULT_DWELL_MS = { min: 40, max: 120 } as const;

const DEFAULT_STEPS = 24;
const DEFAULT_JITTER = 2;
const DEFAULT_CURVATURE = 0.2;

/**
 * mulberry32 — a tiny, fast seeded PRNG. Given the same 32-bit seed it yields
 * the same stream of floats in [0, 1). Used so paths are reproducible in tests.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth ease-in-out remap of t in [0,1] so points cluster near the ends. */
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/** Cubic Bezier evaluated at parameter t with points p0..p3. */
function cubicBezier(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number
): Point {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  const a = uu * u;
  const b = 3 * uu * t;
  const c = 3 * u * tt;
  const d = tt * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/**
 * PURE: build a cubic Bezier path from `start` to `end`. Control points are
 * offset perpendicular/along the line by a seeded random amount (scaled by
 * `curvature`), the sampled parameter is remapped through ease-in-out so the
 * pointer accelerates then decelerates, and small bounded jitter is added to
 * interior points. The FIRST and LAST points are EXACTLY `start`/`end` with no
 * jitter. Same seed => identical array; no seed => Math.random each call.
 */
export function generateMousePath(opts: PathOptions): Point[] {
  const { start, end } = opts;
  const steps = Math.max(2, opts.steps ?? DEFAULT_STEPS);
  const jitter = opts.jitter ?? DEFAULT_JITTER;
  const curvature = opts.curvature ?? DEFAULT_CURVATURE;
  const rng = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dist = Math.hypot(dx, dy) || 1;
  // Unit perpendicular to the start->end line.
  const px = -dy / dist;
  const py = dx / dist;

  // Randomized control points: nudged along the line and off to one side so
  // the curve bows naturally instead of tracing a straight segment.
  const scale = dist * curvature;
  const off1 = (rng() - 0.5) * 2 * scale;
  const off2 = (rng() - 0.5) * 2 * scale;
  const c1: Point = {
    x: start.x + dx * 0.3 + px * off1,
    y: start.y + dy * 0.3 + py * off1,
  };
  const c2: Point = {
    x: start.x + dx * 0.7 + px * off2,
    y: start.y + dy * 0.7 + py * off2,
  };

  const path: Point[] = [];
  for (let i = 0; i < steps; i++) {
    const raw = i / (steps - 1);
    const t = easeInOut(raw);
    const point = cubicBezier(start, c1, c2, end, t);

    // Endpoints are exact and jitter-free so click targets land precisely.
    if (i === 0) {
      path.push({ x: start.x, y: start.y });
      continue;
    }
    if (i === steps - 1) {
      path.push({ x: end.x, y: end.y });
      continue;
    }

    const jx = (rng() - 0.5) * 2 * jitter;
    const jy = (rng() - 0.5) * 2 * jitter;
    path.push({ x: point.x + jx, y: point.y + jy });
  }
  return path;
}

/**
 * Pick a dwell time (ms) within `bounds` using the supplied rng. Returns an
 * integer in [min, max]. Deterministic when `rng` is seeded.
 */
export function dwellTime(
  rng: () => number,
  bounds: { min: number; max: number } = DEFAULT_DWELL_MS
): number {
  const { min, max } = bounds;
  if (max <= min) return min;
  return Math.round(min + rng() * (max - min));
}

/** Options shared by humanMove/humanClick. */
export interface MoveOptions {
  seed?: number;
  steps?: number;
  jitter?: number;
  curvature?: number;
  /** Starting point; defaults to the top-left-ish origin when omitted. */
  start?: Point;
}

/**
 * Walk a generated path with page.mouse.move, step by step, and return the
 * path that was walked. The move itself IS a hover. `start` defaults to {0,0}
 * when the caller has no better origin.
 */
export async function humanMove(
  page: Page,
  target: Point,
  opts: MoveOptions = {}
): Promise<Point[]> {
  const start = opts.start ?? { x: 0, y: 0 };
  const path = generateMousePath({
    start,
    end: target,
    seed: opts.seed,
    steps: opts.steps,
    jitter: opts.jitter,
    curvature: opts.curvature,
  });
  for (const p of path) {
    await page.mouse.move(p.x, p.y);
  }
  return path;
}

/**
 * Human-like click: move along the curved path to `target`, press, dwell a
 * randomized amount, then release. Returns the walked path. Dwell uses a
 * seeded rng (derived from `seed` when given) so timing is reproducible.
 */
export async function humanClick(
  page: Page,
  target: Point,
  opts: MoveOptions = {}
): Promise<Point[]> {
  const path = await humanMove(page, target, opts);
  const rng = opts.seed !== undefined ? mulberry32(opts.seed ^ 0x9e3779b9) : Math.random;
  const dwell = dwellTime(rng, DEFAULT_DWELL_MS);
  await page.mouse.down();
  await new Promise((resolve) => setTimeout(resolve, dwell));
  await page.mouse.up();
  return path;
}
