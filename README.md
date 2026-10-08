# Chrome Preview MCP

Stealth, human-in-the-loop Chrome MCP — logs in like you, moves the mouse like you, hands control back whenever you want.

![demo](docs/demo.gif)

*Demo: the agent opens a page, clicks a link that spawns a new tab, the server follows that tab automatically, then performs a `motion:"human"` click so the cursor glides along a curved, human-like path. See [docs/RECORDING_DEMO.md](docs/RECORDING_DEMO.md) for how to record this clip (the GIF is not committed to the repo).*

## What it is / Why it's different

Chrome Preview MCP is a Model Context Protocol (MCP) server that drives a **real, visible Chrome window** on your desktop — not a headless, throwaway browser. It replicates the "Open Browser (Preview)" experience: you and the agent share the same window, and either of you can take the wheel at any moment.

What sets it apart from typical headless automation:

- **Visible, interactive window.** The browser is a normal desktop window you can see and touch. You watch what the agent does and step in by hand whenever you want — true human-in-the-loop control.
- **Persistent login profile.** Sessions, cookies, and logins are stored in `~/.chrome-preview-mcp-profile`, so once you sign in to Google, GitHub, or any site, you stay signed in across restarts. Log in once, by hand, and the agent reuses that session.
- **Stealth by default.** The server masks the usual automation tells (`navigator.webdriver`, automation banners, the `--enable-automation` flag) so logins that normally block automated browsers — Google OAuth behind Cloudflare, "this browser may not be secure" walls — behave like a normal browser.
- **Human-like mouse motion.** Optionally move the cursor along a curved, jittery path with a randomized press/release dwell instead of teleport-and-click. One opt-in flag, deterministic when you want it.
- **Human-in-the-loop handoff.** Because it's your real profile in a real window, you can finish a tricky login, solve a captcha, or review something yourself, then hand control back to the agent — no new session, no lost state.

Headless automation is great for scraping and CI. This project aims at the opposite corner: logged-in, human-supervised automation of **your own accounts** in a browser you can watch.

## Features

- **Cross-Platform** — Works on **Windows**, **macOS**, and **Linux**, auto-detecting your installed browser per OS.
- **Any Chromium-based browser** — Detects Google Chrome (stable/beta/canary), Chromium, Microsoft Edge, and Brave. Point it at any binary with the `CHROME_PATH` environment variable.
- **Persistent user profile** — Session cookies and login state live in `~/.chrome-preview-mcp-profile`, so logins (Google, GitHub, Vast.ai) persist across restarts.
- **Stealth / anti-bot** — Removes `navigator.webdriver` via a CDP init script, omits automation banners and `--enable-automation`, and unblocks normal Google Account / Gmail OAuth on Vast.ai, Cloudflare, and similar hosts.
- **Interactive pairing** — The window is fully visible on your desktop; you and the agent both drive it.
- **Human-like mouse motion** — Optional curved cursor paths with randomized dwell, per call or globally.

## Quickstart

### Prerequisites

- **Node.js** (a current LTS release is recommended).
- A **Chromium-family browser** installed (Chrome, Chromium, Edge, or Brave). The server auto-detects it; see [Browser Detection](#browser-detection) if yours is in a non-standard location.

### Install and build

```bash
npm install
npm run build
```

### Run

```bash
node dist/index.js
```

The server speaks MCP over stdio, so you normally launch it from an MCP client rather than running it directly. The direct command above is useful for a sanity check. See [MCP Client Configuration](#mcp-client-configuration) to wire it into a client.

## Browser Detection

On startup the server locates a browser in this order:

1. The `CHROME_PATH` environment variable, if set and valid (works on any OS).
2. Known install locations for your platform:
   - **Windows**: Chrome / Chrome Beta / Canary, Chromium, Edge, Brave (resolved via `PROGRAMFILES`, `PROGRAMFILES(X86)`, and `LOCALAPPDATA`).
   - **macOS**: Chrome / Chrome Beta / Canary, Chromium, Edge, Brave in `/Applications` (and `~/Applications`).
   - **Linux**: `google-chrome`, `google-chrome-stable`, Chromium (apt & snap), Edge, Brave.
3. A scan of your `PATH` for a Chromium-family binary.

If none is found, set `CHROME_PATH` to your browser executable, for example:

```bash
# macOS / Linux
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

```powershell
# Windows (PowerShell)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## MCP Client Configuration

Point your MCP client at the built `dist/index.js` using the absolute path for your OS. Replace `/absolute/path/to/chrome-preview-mcp` with the real location of your checkout.

**macOS / Linux:**

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"]
    }
  }
}
```

**Windows:**

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\chrome-preview-mcp\\dist\\index.js"]
    }
  }
}
```

To force a specific browser, add an `env` block:

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"],
      "env": {
        "CHROME_PATH": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      }
    }
  }
}
```

### Per-client examples

All MCP clients below use the same `mcpServers` object with `command`, `args`, and optional `env`. The differences are only *which file* holds the config.

**Claude Desktop** — edit `claude_desktop_config.json`:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"]
    }
  }
}
```

**Cursor** — add it to the Cursor MCP settings (`~/.cursor/mcp.json`, or the per-project `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"]
    }
  }
}
```

**Kiro** — add it to your Kiro MCP config (workspace `.kiro/settings/mcp.json` or the user-level equivalent):

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"]
    }
  }
}
```

**GitHub Copilot (VS Code)** — configure an MCP server in VS Code (via the `mcp.json` the Copilot MCP integration reads). The common shape is the same `mcpServers` object:

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": ["/absolute/path/to/chrome-preview-mcp/dist/index.js"]
    }
  }
}
```

> The exact config file path and schema vary between client versions. The `mcpServers` object with `command` / `args` / `env` shown above is the common MCP server form; if your client expects a different key or location, keep the same `node` + absolute `dist/index.js` command and adapt the surrounding structure. On Windows, use the escaped `C:\\...` path form shown earlier.

## Tools

The server registers **24 tools**, grouped below by purpose.

Several interaction and reading tools share a target resolver. Where a tool accepts `by` / `role`:

- `by`: `"css"` (default) | `"text"` (match by visible text) | `"role"` (match by ARIA accessible name).
- `role`: ARIA role name (e.g. `"button"`), used only when `by="role"`.

Omitting `by` keeps CSS behavior. Most interaction and read tools return a **structured not-found result instead of throwing** when nothing matches, so a miss never crashes the call.

### Session & navigation

| Tool | Description | Key params (* required) |
|---|---|---|
| `open_browser` | Open or focus the interactive Chrome window and navigate to a URL (supports Google login without security blocks). | `url`* (string) |
| `navigate` | Navigate the active tab to a new URL. | `url`* (string) |
| `go_back` | Go back in the active tab's history; returns a structured note (no error) when there is no previous entry. | `waitUntil` (string, default `"domcontentloaded"`), `timeout` (ms, default 30000) |
| `go_forward` | Go forward in history; structured note (no error) when there is no next entry. | `waitUntil` (default `"domcontentloaded"`), `timeout` (default 30000) |
| `reload` | Reload the active tab; returns the resulting url/title. | `waitUntil` (default `"domcontentloaded"`), `timeout` (default 30000) |
| `wait_for` | Wait for a CSS selector to become visible, text to appear, or the network to go idle. Provide at least one condition; the first satisfied wins. Never throws on timeout (structured timed-out result). | `selector` (string), `text` (string), `networkIdle` (boolean), `timeout` (ms, default 30000) |

### Reading the page

| Tool | Description | Key params |
|---|---|---|
| `get_content` | Page title, URL, headings, buttons, inputs, and links; optionally the visible text (capped, with a `truncated` flag). | `selector` (scopes extracted text to the first match; title/url stay page-level), `includeText` (boolean, default `true`) |
| `get_html` | `outerHTML` of the full document, or of the first element matching `selector`; capped with a `truncated` flag. | `selector`, `maxLength` (number; non-positive/invalid falls back to the default cap) |
| `take_screenshot` | Screenshot of the active tab. A `selector` captures that element (takes precedence over `fullPage`); if it matches nothing, a viewport screenshot is returned with a note. | `selector`, `by`, `role`, `fullPage` (boolean, default `false`; ignored when `selector` is given) |

### Interaction

| Tool | Description | Key params (* required) |
|---|---|---|
| `click` | Click an element by CSS (default), visible text, or role. | `selector`* (string), `by`, `role`, `motion` (`"instant"` default \| `"human"`), `seed` (number; only used when `motion="human"`) |
| `type` | Type text into an input/textarea located by css/text/role. | `selector`*, `text`* (string), `clear` (boolean), `by`, `role` |
| `press_key` | Press a keyboard key (e.g. `"Enter"`, `"Tab"`, `"Escape"`, `"ArrowDown"`). | `key`* (string) |
| `hover` | Hover an element (css/text/role); structured not-found if nothing matches. | `selector`*, `by`, `role`, `motion` (`"instant"` default \| `"human"`), `seed` |
| `scroll` | Scroll by amount, or scroll an element into view. A `selector` uses element-into-view mode (amount params ignored); otherwise scroll by `x`/`y`/`deltaY`. Returns the resulting scroll position. | `selector`, `by`, `role`, `x` (number), `y` (number), `deltaY` (number; `y` takes precedence) |
| `select_option` | Select option(s) in a `<select>` by css/text/role. | `selector`*, `by`, `role`, `value` (string), `values` (string[], for multi-selects) |
| `handle_dialog` | Configure persistent auto-handling of native dialogs (alert/confirm/beforeunload/prompt) across all tabs until changed. | `action` (`"accept"` default \| `"dismiss"`), `promptText` (string, for prompt dialogs) |

### Tabs / windows

| Tool | Description | Key params |
|---|---|---|
| `list_tabs` | List all open tabs with index, id, title, URL, and which one is active. | none |
| `select_tab` | Switch the active tab by id or 0-based index and bring it to front. | `id` (string), `index` (number) — `id` preferred when both given |
| `close_tab` | Close a tab by id or index (defaults to the active tab) and reselect a sane active tab. | `id` (string), `index` (number) |

### Diagnostics

| Tool | Description | Key params (* required) |
|---|---|---|
| `list_network_requests` | List captured requests for the active page (`allPages` merges all tabs). Each entry has id, method, url, resourceType, status, timestamp. | `allPages` (boolean), `url` (substring filter), `resourceType` (exact), `status` (exact number; a `{min,max}` range is also accepted by the implementation) |
| `get_network_request` | Full detail for one captured request by id: request headers, response status, response headers, and body (text/JSON content types only; binary omitted with a note). Sensitive headers are redacted by default. | `id`* (string), `redact` (boolean, default `true`) |
| `get_console_messages` | Buffered console messages plus uncaught page errors for the active page (`allPages` merges tabs). Each entry has type, text, and location. | `allPages` (boolean), `level` (exact type filter: `log` / `info` / `warn` / `error` / `debug` / `pageerror`) |

### Advanced / stealth

| Tool | Description | Key params (* required) |
|---|---|---|
| `evaluate` | Execute JavaScript in the page context. **Trust boundary** — see [Security](#security). | `script`* (string) |
| `close_browser` | Close the Chrome Preview browser window. | none |

Stealth isn't a tool you call — it's applied automatically to every page the server tracks. Human-like mouse motion is opt-in through the `motion` / `seed` params on `click` and `hover` (see below).

Behavior notes worth surfacing:

- `get_network_request` redacts sensitive headers by default (Authorization, Cookie, Set-Cookie, Proxy-Authorization, plus auth/token/api-key/secret/session/credential-style headers). Pass `redact: false` to opt out. Response bodies are returned only for textual content types and are capped to the response-body char limit.
- `get_console_messages` reports a distinct `"pageerror"` type for uncaught page errors alongside the normal console levels.

## Human-like mouse motion

By default, `click` and `hover` act instantly (`motion:"instant"`) — the historical teleport-and-click behavior. You can instead move the cursor along a curved, slightly jittery path to the element center, then press, dwell a randomized amount, and release.

**How to enable it:**

- **Per call** — pass `motion:"human"` to `click` or `hover`.
- **Globally** — set `HUMANIZE_INPUT=true` (or `1`), which flips the *default* motion to `"human"`. A per-call `motion` param still overrides the global default.

**Reproducible paths** — pass a `seed` (number) on a `motion:"human"` call to make the generated path *and* the press/release dwell deterministic. Same seed, same path. This is handy for demos and tests. Without a seed, the motion is randomized on every call.

**Honest caveat** — this improves exactly **one** anti-bot signal: the naturalness of mouse movement. It is **not a silver bullet.** Fingerprinting, request timing, and many other signals are untouched. It *stacks* with the page-level stealth masking (see below) rather than replacing it — use both together.

## Configuration

**It works out of the box with no flags set.** Every environment variable below is an *optional override*; with nothing set, behavior is unchanged from the sensible defaults. Invalid integer overrides silently fall back to their default, and the boolean flag treats only the exact strings `"true"` or `"1"` as true.

| Env var | Default | Effect |
|---|---|---|
| `CHROME_PATH` | unset (auto-detect) | Explicit browser executable path; wins over all auto-detection on any OS. |
| `HUMANIZE_INPUT` | off (`"instant"`) | When `true` / `1`, flips the default click/hover motion to `"human"`. A per-call `motion` still overrides. |
| `NETWORK_BUFFER_SIZE` | `500` | Network capture ring-buffer size (oldest entries dropped past the cap). |
| `CONSOLE_BUFFER_SIZE` | `500` | Console capture ring-buffer size. |
| `RESPONSE_BODY_CHARS` | `100000` | Max chars of a captured response body returned by `get_network_request`. |
| `CONTENT_CHARS` | `50000` | `get_content` visible-text char cap. |
| `HTML_CHARS` | `500000` | `get_html` outerHTML char cap (a per-call `maxLength` can override). |
| `RESOLVE_TIMEOUT_MS` | `10000` | Element-resolution wait timeout (click/type/hover/etc.). |
| `WAIT_FOR_TIMEOUT_MS` | `30000` | `wait_for` overall timeout. |
| `NAVIGATION_TIMEOUT_MS` | `30000` | navigate / go_back / go_forward / reload timeout. |
| `DEFAULT_TIMEOUT_MS` | unset | Single base fallback for the three timeouts above, used only when a specific timeout var is unset. Leaving everything unset preserves the historical values (resolve 10000, wait_for 30000, navigation 30000). A specific override always wins. |
| `DWELL_MIN_MS` | `40` | Human-motion press-to-release dwell lower bound (ms). |
| `DWELL_MAX_MS` | `120` | Human-motion press-to-release dwell upper bound (ms). |

## Anti-detection notes

Two independent, stackable mechanisms:

1. **Page-level stealth (always on).** Every tracked page gets a CDP init script that masks `navigator.webdriver` (its getter returns `undefined`), mocks `window.chrome.runtime` when missing, and patches `navigator.permissions.query` for notifications. The browser also launches without automation banners or `--enable-automation`. This is what lets normal Google OAuth and similar flows proceed.
2. **Human-like mouse motion (opt-in).** Curved cursor paths with randomized dwell, as described above.

Neither is a guarantee against detection. They reduce specific, well-known tells; sophisticated systems look at many more signals. Treat this as "behaves more like a real browser," not "undetectable." See [CONTRIBUTING.md](CONTRIBUTING.md) for the internals of both mechanisms.

## Security

The `evaluate` tool runs your JavaScript in the page via indirect eval (`(0, eval)(code)`) with **full page privileges** in global scope. This is **by design** for a trusted local operator driving their own browser (human-in-the-loop) — it is **not** a sandbox for untrusted input. Only pass code you would run yourself. (The MCP input property is named `script`.)

## Honest, legitimate-use note

Stealth here is meant to let **your own** browser behave like a normal one so you can automate **your own accounts** and legitimate workflows (your logins, your dashboards, your data). It is not a tool for evading other parties' terms of service, impersonating other people, or circumventing access controls you aren't entitled to. Use it on accounts and sites you're authorized to use.

## Comparison vs chrome-devtools-mcp

[`chrome-devtools-mcp`](https://github.com/ChromeDevTools/chrome-devtools-mcp) is a broad, general-purpose DevTools MCP server with a wide surface area. Chrome Preview MCP is deliberately **niche**: stealth + persistent login + human-in-the-loop + human-like mouse motion, aimed at automating your own logged-in accounts in a window you can watch.

| | chrome-preview-mcp (this project) | chrome-devtools-mcp |
|---|---|---|
| Focus | Niche: stealth, persistent login, human-in-the-loop, human mouse | Breadth: wide DevTools / inspection surface |
| Browser window | Real, visible, interactive (shared with you) | General automation surface |
| Login model | Persistent profile; log in once by hand, agent reuses it | General-purpose |
| Mouse motion | Optional human-like curved paths | Not a focus |

**What this project intentionally skips** (and why): heap/memory profiling, extension management, PWA install/launch, Lighthouse audits, performance tracing, WebMCP, and third-party dev-tool integrations. Those belong to a broad DevTools tool like chrome-devtools-mcp; adding them here would dilute a focused tool for logged-in, human-supervised, stealthy automation of your own accounts. If you need deep DevTools profiling or a wide inspection surface, chrome-devtools-mcp is the better fit — it does that well. If you need to log in like yourself, keep that session, and hand control back and forth with an agent, that's what this project is for.

## Contributing & demo

- [CONTRIBUTING.md](CONTRIBUTING.md) — build/test workflow and the architecture for adding tools.
- [docs/RECORDING_DEMO.md](docs/RECORDING_DEMO.md) — how to record the demo GIF referenced at the top of this README.

## License

MIT.
