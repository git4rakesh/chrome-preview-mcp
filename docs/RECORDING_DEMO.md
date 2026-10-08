# Recording the demo GIF

This guide prepares everything for a short (10–15 second) demo of the two signature behaviors: **the server following a new tab automatically** and a **human-like mouse-motion click**. The result is saved as `docs/demo.gif`, which the README embeds at the top.

> **A human must do the actual recording.** The server has no built-in recorder. This document sets up the scene and the exact tool-call sequence; you capture your screen while it runs.

## Prerequisites

- The server is built: `npm run build`.
- A browser is detected (or `CHROME_PATH` is set) — see the README's Browser Detection section.
- An MCP client is configured to launch the server (see the README's MCP Client Configuration).
- Logins persist in `~/.chrome-preview-mcp-profile`. To record from a clean, logged-out state, remove that directory first:
  ```bash
  rm -rf ~/.chrome-preview-mcp-profile
  ```
  Leave it in place to demo an already-logged-in session.

## The tool-call sequence to demonstrate

Run these calls from your MCP client while recording. The flow is: open a page, click a link that opens a **new tab**, show that the server follows that tab via `list_tabs`, then perform a human-motion click.

1. **Open a page.**
   ```json
   { "tool": "open_browser", "arguments": { "url": "https://example.com" } }
   ```

2. **Wait for it to settle** (deterministic — prefer this over a fixed sleep so the recording is repeatable).
   ```json
   { "tool": "wait_for", "arguments": { "text": "Example Domain" } }
   ```

3. **Click a link that opens a NEW TAB.** Use a page/link that opens in a new tab (a link with `target="_blank"`, or a page that calls `window.open`). This is the moment the new tab appears.
   ```json
   { "tool": "click", "arguments": { "selector": "a[target=_blank]" } }
   ```

4. **Show the server followed the new tab.** `list_tabs` now shows the new tab, and the server has already made it active — no manual tab switch needed. This is the "new-tab-follow" highlight.
   ```json
   { "tool": "list_tabs", "arguments": {} }
   ```
   (Optionally `select_tab` by `id`/`index` to switch back and forth on camera.)

5. **Human-like mouse click with a fixed seed.** The cursor glides along a curved, jittery path to the target, then presses and releases after a short dwell. The `seed` makes the path and dwell reproducible, so re-takes look identical.
   ```json
   { "tool": "click", "arguments": { "selector": "a", "motion": "human", "seed": 42 } }
   ```

6. **(Optional) show DevTools-style output** for a richer overlay:
   ```json
   { "tool": "get_console_messages", "arguments": {} }
   { "tool": "list_network_requests", "arguments": {} }
   ```

7. **Finish.**
   ```json
   { "tool": "close_browser", "arguments": {} }
   ```

Tips:
- Use `seed` on any `motion:"human"` click/hover for repeatable paths across takes.
- Prefer `wait_for` over fixed sleeps so timing is deterministic and the clip stays tight.
- The browser is a real, visible desktop window — just record that window (and your client, if you want the calls on screen).

## Screen-recording tools by OS

- **macOS** — QuickTime Player (File → New Screen Recording) or the built-in capture via **Cmd-Shift-5** (choose "Record Selected Portion").
- **Linux** — [Peek](https://github.com/phw/peek) (records straight to GIF) or [OBS Studio](https://obsproject.com/).
- **Windows** — Xbox Game Bar (**Win-G**) for video, or [ScreenToGif](https://www.screentogif.com/) to record and export GIF directly.

## Capture settings

- Record just the browser window region (crop out the rest of your desktop).
- Keep it to roughly **10–15 seconds** — enough to show the new tab appearing and the human-motion click.
- If your tool records video (mp4/mov), convert to GIF afterward. For example, with `ffmpeg`:
  ```bash
  ffmpeg -i demo.mov -vf "fps=15,scale=900:-1:flags=lanczos" docs/demo.gif
  ```
  Keep the width modest (around 800–1000 px) so the GIF stays reasonably small.

## Where to save it

Save the final file as **`docs/demo.gif`** so the README reference resolves:

```
docs/demo.gif
```

Do not commit the binary GIF as part of code changes unless your project explicitly tracks it; the README references the path so the image shows once the file is present.
