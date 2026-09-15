# Chrome Preview MCP Server

A custom Model Context Protocol (MCP) server that replicates Antigravity's **"Open Browser (Preview)"** functionality.

## Features

- **Cross-Platform**: Works on **Windows**, **macOS**, and **Linux**. Auto-detects your installed browser based on the OS.
- **Any Chromium-Based Browser**: Detects Google Chrome (stable/beta/canary), Chromium, Microsoft Edge, and Brave. Point it at any binary with the `CHROME_PATH` environment variable.
- **Persistent User Profile**: Stores session cookies and login states in `~/.chrome-preview-mcp-profile` so logins (Google, GitHub, Vast.ai) persist across restarts.
- **Stealth / Anti-Bot Detection**:
  - Removes `navigator.webdriver` via CDP initialization.
  - Omits automation banners and `--enable-automation` flags.
  - Unlocks normal Google Account / Gmail OAuth on Vast.ai, Cloudflare, etc., without getting blocked by *"This browser or app may not be secure"*.
- **Interactive Pairing**: The browser window is fully visible on your desktop, allowing you to interact with it while the AI agent can also control it.

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

# Windows (PowerShell)
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

## Installation

```bash
npm install
npm run build
```

## Available Tools

1. `open_browser`: Open or focus the Chrome window and navigate to a URL.
2. `navigate`: Navigate the active tab to a new URL.
3. `click`: Click an element by CSS selector.
4. `type`: Type text into an input or textarea.
5. `press_key`: Press keyboard keys (`Enter`, `Tab`, `Escape`, etc.).
6. `get_content`: Get page title, URL, headings, buttons, and form inputs.
7. `take_screenshot`: Capture visual screenshot of the active tab.
8. `evaluate`: Execute JavaScript in the page context.
9. `close_browser`: Safely close the browser session.

## MCP Client Configuration

Point your MCP client at the built `dist/index.js`. Use the absolute path for your OS.

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
