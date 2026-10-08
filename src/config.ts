// Single source of truth for environment reading and tunable constants.
//
// This module reads process.env ONCE at load and exposes a frozen `config`
// object whose defaults are IDENTICAL to the values that were previously
// hard-coded across chromeManager.ts, tools.ts, and humanMouse.ts. Every
// environment variable listed here is an OPTIONAL OVERRIDE only: with NO env
// set, every value falls back to the current default and behavior is
// unchanged. Centralizing the env parsing keeps the "sensible defaults, no
// manual config required" contract in one auditable place.

/**
 * PURE: parse a boolean-ish env var. Returns true only for the exact strings
 * "true" or "1"; anything else (including unset or any other value) is false.
 * This matches the historical HUMANIZE_INPUT semantics exactly.
 */
export function parseBool(name: string): boolean {
  const raw = process.env[name];
  return raw === 'true' || raw === '1';
}

/**
 * PURE: parse an integer env var, falling back to `defaultValue` when the var
 * is unset or does not parse to a finite integer. Non-integers, NaN, and
 * garbage all fall back so an invalid override can never silently break a cap.
 */
export function parseIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return defaultValue;
  }
  return parsed;
}

// Historical defaults (kept identical to pre-consolidation values):
//   chromeManager.ts: MAX_NETWORK_ENTRIES=500, MAX_CONSOLE_ENTRIES=500,
//                     MAX_RESPONSE_BODY_CHARS=100000
//   tools.ts:         MAX_CONTENT_CHARS=50000, MAX_HTML_CHARS=500000,
//                     resolveElement timeout=10000
//   index.ts:         navigation/goBack/goForward/reload timeout=30000
//   tools.ts waitFor: timeout=30000
//   humanMouse.ts:    DEFAULT_DWELL_MS={min:40,max:120}
const DEFAULTS = {
  NETWORK_BUFFER_SIZE: 500,
  CONSOLE_BUFFER_SIZE: 500,
  RESPONSE_BODY_CHARS: 100000,
  CONTENT_CHARS: 50000,
  HTML_CHARS: 500000,
  RESOLVE_TIMEOUT_MS: 10000,
  WAIT_FOR_TIMEOUT_MS: 30000,
  NAVIGATION_TIMEOUT_MS: 30000,
  DWELL_MIN_MS: 40,
  DWELL_MAX_MS: 120,
} as const;

// Optional DEFAULT_TIMEOUT_MS override. It MUST NOT change unset behavior: the
// three distinct current defaults (resolve 10000, wait_for 30000, navigation
// 30000) are preserved when it is unset. When set, it supplies a single base
// that each distinct timeout falls back to only if its own specific override
// is absent — so leaving everything unset keeps today's exact three values.
const defaultTimeoutRaw = process.env.DEFAULT_TIMEOUT_MS;
const hasDefaultTimeout =
  defaultTimeoutRaw !== undefined &&
  defaultTimeoutRaw !== '' &&
  Number.isFinite(Number(defaultTimeoutRaw)) &&
  Number.isInteger(Number(defaultTimeoutRaw));
const defaultTimeout = hasDefaultTimeout
  ? Number(defaultTimeoutRaw)
  : undefined;

function timeout(name: string, fallback: number): number {
  // Specific override wins; else DEFAULT_TIMEOUT_MS (if valid); else the
  // historical per-site default. Unset everything => unchanged behavior.
  if (process.env[name] !== undefined && process.env[name] !== '') {
    return parseIntEnv(name, defaultTimeout ?? fallback);
  }
  return defaultTimeout ?? fallback;
}

/**
 * Frozen application configuration. Read once at module load. All fields have
 * current-default values when no env is set.
 */
export const config = Object.freeze({
  /**
   * Raw CHROME_PATH override string (or undefined). The full detection
   * precedence (explicit override, per-platform candidates, PATH scan) stays
   * in detectChromePath(); this only surfaces the raw override value.
   */
  CHROME_PATH: process.env.CHROME_PATH || undefined,

  /** HUMANIZE_INPUT: flips the DEFAULT click/hover motion to 'human'. */
  HUMANIZE_INPUT: parseBool('HUMANIZE_INPUT'),

  /** Network capture ring-buffer size (chromeManager MAX_NETWORK_ENTRIES). */
  NETWORK_BUFFER_SIZE: parseIntEnv('NETWORK_BUFFER_SIZE', DEFAULTS.NETWORK_BUFFER_SIZE),

  /** Console capture ring-buffer size (chromeManager MAX_CONSOLE_ENTRIES). */
  CONSOLE_BUFFER_SIZE: parseIntEnv('CONSOLE_BUFFER_SIZE', DEFAULTS.CONSOLE_BUFFER_SIZE),

  /** Response-body char cap (chromeManager MAX_RESPONSE_BODY_CHARS). */
  RESPONSE_BODY_CHARS: parseIntEnv('RESPONSE_BODY_CHARS', DEFAULTS.RESPONSE_BODY_CHARS),

  /** get_content visible-text char cap (tools MAX_CONTENT_CHARS). */
  CONTENT_CHARS: parseIntEnv('CONTENT_CHARS', DEFAULTS.CONTENT_CHARS),

  /** get_html outerHTML char cap (tools MAX_HTML_CHARS). */
  HTML_CHARS: parseIntEnv('HTML_CHARS', DEFAULTS.HTML_CHARS),

  /** resolveElement default wait timeout in ms. */
  RESOLVE_TIMEOUT_MS: timeout('RESOLVE_TIMEOUT_MS', DEFAULTS.RESOLVE_TIMEOUT_MS),

  /** wait_for overall timeout in ms. */
  WAIT_FOR_TIMEOUT_MS: timeout('WAIT_FOR_TIMEOUT_MS', DEFAULTS.WAIT_FOR_TIMEOUT_MS),

  /** navigate/goBack/goForward/reload timeout in ms. */
  NAVIGATION_TIMEOUT_MS: timeout('NAVIGATION_TIMEOUT_MS', DEFAULTS.NAVIGATION_TIMEOUT_MS),

  /** Human-motion press->release dwell bounds in ms. */
  DWELL_MS: Object.freeze({
    min: parseIntEnv('DWELL_MIN_MS', DEFAULTS.DWELL_MIN_MS),
    max: parseIntEnv('DWELL_MAX_MS', DEFAULTS.DWELL_MAX_MS),
  }),
});

/** Config type for consumers that want the shape. */
export type Config = typeof config;
