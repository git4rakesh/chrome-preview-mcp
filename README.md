# Chrome Preview MCP Server

A custom Model Context Protocol (MCP) server that replicates Antigravity's **"Open Browser (Preview)"** functionality.

## Features

- **Real Google Chrome**: Launches your installed system Google Chrome (`chrome.exe`) on Windows.
- **Persistent User Profile**: Stores session cookies and login states in `~/.chrome-preview-mcp-profile` so logins (Google, GitHub, Vast.ai) persist across restarts.
- **Stealth / Anti-Bot Detection**:
  - Removes `navigator.webdriver` via CDP initialization.
  - Omits automation banners and `--enable-automation` flags.
  - Unlocks normal Google Account / Gmail OAuth on Vast.ai, Cloudflare, etc., without getting blocked by *"This browser or app may not be secure"*.
- **Interactive Pairing**: The browser window is fully visible on your desktop, allowing you to interact with it while the AI agent can also control it.

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

## Configuration in Antigravity (`~/.gemini/config/mcp_config.json`)

```json
{
  "mcpServers": {
    "chrome-preview": {
      "command": "node",
      "args": [
        "C:\\Users\\messa\\.gemini\\antigravity\\scratch\\chrome-preview-mcp\\dist\\index.js"
      ]
    }
  }
}
```
