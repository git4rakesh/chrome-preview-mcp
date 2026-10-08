# Contributing to Chrome Preview MCP

Thanks for helping out. This guide covers setup, the test workflow, and the few architectural patterns you need to follow when extending the server. Keep changes small and match the existing style.

## Setup

```bash
git clone <your-fork-url>
cd chrome-preview-mcp
npm install
npm run build
```

- `npm run build` runs `tsc`, compiling `src/` to `dist/` (ESM, `module`/`moduleResolution: NodeNext`, target ES2022).
- `npm start` runs the built server: `node dist/index.js` (MCP over stdio).

## Running tests

```bash
npm test
```

- `pretest` runs first (`tsc -p tsconfig.test.json`), compiling `src/` **and** `test/` to `dist-test/`.
- `test` then runs the Node built-in test runner: `node --test --test-concurrency=1 "dist-test/test/**/*.test.js"`.
- **Single concurrency is intentional** — browser-backed tests share the persistent profile and the debugging port, so they must not run in parallel.

**Browser-test gating.** Tests that need a real browser call `detectChromePath()` (the same cross-platform detection the server uses):

- Chrome/Chromium found → the test **runs**.
- Chrome absent → the test **skips cleanly** with a clear reason, so the suite stays green either way.
- `SKIP_BROWSER_TESTS=1` forces a skip regardless of detection.

Fixtures live in `test/fixtures/` and load over local `file://` URLs — no live network is used. Browsers are closed in each suite's `after()` hook so no Chrome process leaks. `SKIP_BROWSER_TESTS` is a **test-only** switch read in the test files; it is not a runtime config flag and does not belong in `src/config.ts`.

## Module map

| File | Responsibility |
|---|---|
| `src/index.ts` | MCP server. The `ListToolsRequestSchema` handler is the tool registry; the `CallToolRequestSchema` handler dispatches each call. |
| `src/tools.ts` | `BrowserTools` — tool implementations, plus pure exported helpers (`redactHeaders`, `buildTextEngineSelector`, `buildAriaEngineSelector`). |
| `src/chromeManager.ts` | `ChromeManager` — launch/connect, page registry, capture buffers, dialog handling, stealth. |
| `src/config.ts` | Single source of truth for env reading and tunable constants. |
| `src/humanMouse.ts` | Dependency-free human-like mouse motion (pure, seedable path generator). |

## Adding a new tool (triple-registration pattern)

A tool must be wired in **three** places. Use an existing simple tool like `reload` as a template.

1. **Schema** — add an entry to the `tools` array in the `ListToolsRequestSchema` handler in `src/index.ts` with `name`, `description`, and `inputSchema`.
2. **Dispatch** — add a `case` for that name to the `switch` in the `CallToolRequestSchema` handler in `src/index.ts`. Read and validate args, call the implementation, and return:
   ```ts
   return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
   ```
   (Screenshots return an `image` content item instead; see `take_screenshot`.)
3. **Implementation** — add a method on `BrowserTools` in `src/tools.ts` that does the work.

Then add a **gated browser test** under `test/`, mirroring an existing one (reuse the `detectChromePath()` + `SKIP_BROWSER_TESTS` skip pattern and a local `file://` fixture).

## Central page registration & stealth model

All pages route through one method — `registerPage` in `ChromeManager` — so no page can escape stealth or capture. This is the "one place" invariant: startup seeding, the `targetcreated` handler (which fires for `window.open` popups and new tabs), and page re-seeding all funnel through `registerPage`. For each page it:

1. Tracks the page in the registry.
2. Applies stealth **exactly once** (guarded by a `stealthed` `WeakSet`). This matters because `page.evaluateOnNewDocument()` *stacks* on every call, so idempotency is required.
3. Wires a `close` listener that deregisters the page.
4. Attaches network and console capture listeners.
5. Installs the current dialog handler.
6. Makes the page active.

Because new tabs and popups come through `targetcreated` → `registerPage`, the server **follows new tabs automatically** — that's the new-tab-follow behavior the demo shows.

`applyStealth` (via `page.evaluateOnNewDocument`) masks `navigator.webdriver` (getter returns `undefined`), mocks `window.chrome.runtime` when missing, and patches `navigator.permissions.query` for notifications.

## Human-mouse module

`src/humanMouse.ts` is dependency-free — it references only puppeteer-core **types**, no runtime import. The path generator is pure and seedable:

- A cubic Bezier curve with randomized control points, remapped through an ease-in-out so the cursor accelerates then decelerates.
- Bounded jitter on interior points; the first and last points are exact and jitter-free so clicks land precisely.
- A small seeded PRNG (`mulberry32`) makes paths reproducible given a seed.
- A randomized press-to-release dwell within the `DWELL_MIN_MS`/`DWELL_MAX_MS` bounds from config (default 40–120 ms).

Opt-in via `motion:"instant"|"human"` on `click`/`hover` (default `instant`); the default is flippable with `HUMANIZE_INPUT`. Be honest in docs: it improves exactly one anti-bot signal (mouse-movement naturalness), is not a silver bullet, and stacks with page-level `applyStealth`.

## Config conventions

Add new tunables and env vars **only** in `src/config.ts`. It reads `process.env` once at load and exposes a frozen `config` object. Preserve the contract: sensible defaults, every env var an optional override, and invalid overrides fall back to the default (they must never break a cap). `parseBool` treats only `"true"` / `"1"` as true; `parseIntEnv` falls back on anything non-integer.

## Coding style & conventions

- **Structured, never-throw results** for interaction/read tools: return a structured not-found/timed-out object rather than throwing, so a miss doesn't crash the call.
- **Pure, exported helpers** that are unit-testable without a browser (see `redactHeaders`, the selector builders, the mouse path generator).
- **Per-page state via `WeakMap`/`WeakSet` keyed by `Page`**, so buffers are garbage-collected with the page.
- Match the surrounding TypeScript style; keep `strict` mode clean.
- The `evaluate` tool is a deliberate trust boundary — it runs code with full page privileges for a trusted local operator, not a sandbox. Don't "harden" it into a sandbox; document the boundary instead. (Its MCP input property is named `script`.)

## Commit & PR flow

- Use short, conventional commit messages: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`.
- Run `npm run build` (and `npm test` where a browser is available) before opening a PR.
- Keep PRs focused; describe what changed, what you tested, and anything you couldn't verify.
- Don't commit secrets or the profile directory (`~/.chrome-preview-mcp-profile`).
