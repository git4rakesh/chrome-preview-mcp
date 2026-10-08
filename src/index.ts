#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ChromeManager } from './chromeManager.js';
import { BrowserTools } from './tools.js';

const chromeManager = new ChromeManager();
const tools = new BrowserTools(chromeManager);

const server = new Server(
  {
    name: 'chrome-preview',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'open_browser',
        description:
          'Open or focus the interactive Google Chrome Preview window and navigate to a URL. Supports Google login without security blocks.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to open (e.g. https://cloud.vast.ai)',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'navigate',
        description: 'Navigate the active Chrome tab to a new URL.',
        inputSchema: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The target URL',
            },
          },
          required: ['url'],
        },
      },
      {
        name: 'click',
        description:
          'Click an element on the active page by CSS selector (default), visible text, or ARIA role + accessible name.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'The target value. When by="css" (default) this is a CSS selector (e.g. "button.login-btn" or "#submit"); when by="text" it is the element\'s visible text; when by="role" it is the accessible name.',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description:
                'How to interpret selector: "css" (default), "text" (visible text), or "role" (ARIA accessible name).',
            },
            role: {
              type: 'string',
              description: 'ARIA role name (e.g. "button") used only when by="role".',
            },
            motion: {
              type: 'string',
              enum: ['instant', 'human'],
              description:
                'Mouse motion mode. "instant" (default) clicks immediately; "human" moves the cursor along a curved, jittery path to the element center then presses/dwells/releases. Omit for backward-compatible behavior.',
            },
            seed: {
              type: 'number',
              description:
                'Optional seed to make the human motion path and dwell deterministic (only used when motion="human").',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'type',
        description:
          'Type text into an input or textarea on the active page, located by CSS selector (default), visible text, or ARIA role + accessible name.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'The target value. When by="css" (default) this is a CSS selector; when by="text" it is the element\'s visible text; when by="role" it is the accessible name.',
            },
            text: {
              type: 'string',
              description: 'Text to type',
            },
            clear: {
              type: 'boolean',
              description: 'Whether to clear existing text before typing',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description:
                'How to interpret selector: "css" (default), "text" (visible text), or "role" (ARIA accessible name).',
            },
            role: {
              type: 'string',
              description: 'ARIA role name (e.g. "textbox") used only when by="role".',
            },
          },
          required: ['selector', 'text'],
        },
      },
      {
        name: 'press_key',
        description: 'Press a keyboard key (e.g. "Enter", "Tab", "Escape", "ArrowDown").',
        inputSchema: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Key name (e.g. "Enter", "Tab", "Escape")',
            },
          },
          required: ['key'],
        },
      },
      {
        name: 'get_content',
        description:
          'Get the current page title, URL, headings, buttons, and form inputs for reasoning. Optionally includes visible text, which can be scoped to a CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional CSS selector. When provided, extracted visible text is scoped to the first matching element (title/url stay page-level). If nothing matches, a structured not-found result is returned (no error).',
            },
            includeText: {
              type: 'boolean',
              description:
                'Whether to include extracted visible text (default true). Text is capped and flagged with "truncated" when the cap is hit.',
            },
          },
        },
      },
      {
        name: 'get_html',
        description:
          'Get the outerHTML of the page (document.documentElement) or, when a CSS selector is given, of the first matching element. If the selector matches nothing, a structured not-found result is returned (no error). Output is capped and flagged with "truncated" when the cap is hit.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional CSS selector. When provided, return the first matching element\'s outerHTML; when omitted, return the full document outerHTML.',
            },
            maxLength: {
              type: 'number',
              description:
                'Optional override of the default HTML length cap. Non-positive or invalid values fall back to the default.',
            },
          },
        },
      },
      {
        name: 'take_screenshot',
        description:
          'Capture a screenshot of the visible Chrome tab. When selector is provided, captures that element (selector takes precedence over fullPage); if the selector matches nothing, a normal viewport screenshot is returned with a note. fullPage=true captures the whole scrollable page.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional element to capture. Takes precedence over fullPage; if it matches nothing, falls back to a viewport screenshot with a note.',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description: 'How to interpret selector (default css).',
            },
            role: {
              type: 'string',
              description: 'ARIA role filter when by=role.',
            },
            fullPage: {
              type: 'boolean',
              description:
                'Capture the full scrollable page (default false). Ignored when selector is provided.',
            },
          },
        },
      },
      {
        name: 'evaluate',
        description: 'Execute custom JavaScript code in the browser context.',
        inputSchema: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description: 'JavaScript code to execute',
            },
          },
          required: ['script'],
        },
      },
      {
        name: 'close_browser',
        description: 'Close the Chrome Preview browser window.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_tabs',
        description:
          'List all open browser tabs with index, id, title, URL, and which one is active.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'select_tab',
        description:
          'Switch the active tab by id or 0-based index and bring it to front.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable tab id (from list_tabs). Preferred when both are given.',
            },
            index: {
              type: 'number',
              description: '0-based tab index (from list_tabs).',
            },
          },
        },
      },
      {
        name: 'close_tab',
        description:
          'Close a tab by id or index (defaults to the active tab) and reselect a sane active tab.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Stable tab id (from list_tabs).',
            },
            index: {
              type: 'number',
              description: '0-based tab index (from list_tabs).',
            },
          },
        },
      },
      {
        name: 'wait_for',
        description:
          'Wait for a CSS selector to become visible, text to appear in the page, or the network to go idle. Provide at least one condition; the first one satisfied wins. Returns which condition matched and elapsed ms, and never throws on timeout (returns a structured timed-out result).',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector to wait for becoming visible.',
            },
            text: {
              type: 'string',
              description: 'Text to wait for anywhere in the page body.',
            },
            networkIdle: {
              type: 'boolean',
              description: 'If true, wait for the network to become idle.',
            },
            timeout: {
              type: 'number',
              description: 'Overall timeout in ms; defaults to 30000.',
            },
          },
        },
      },
      {
        name: 'list_network_requests',
        description:
          'List captured network requests for the active page (set allPages to merge all tabs). Each entry has a stable id, method, url, resourceType, status, and timestamp. Optional filters: url (substring), resourceType (exact), status (exact number or {min,max} range).',
        inputSchema: {
          type: 'object',
          properties: {
            allPages: {
              type: 'boolean',
              description: 'Merge requests from all tracked tabs (default: active page only).',
            },
            url: {
              type: 'string',
              description: 'Filter to requests whose URL contains this substring.',
            },
            resourceType: {
              type: 'string',
              description: 'Filter by resource type (e.g. "document", "fetch", "xhr", "script").',
            },
            status: {
              type: 'number',
              description: 'Filter to requests with this exact HTTP status.',
            },
          },
        },
      },
      {
        name: 'get_network_request',
        description:
          'Get full detail for one captured request by id (from list_network_requests): request headers, response status, response headers, and the response body for text/JSON content types only (binary bodies are omitted with a note). Sensitive headers (Authorization, Cookie, Set-Cookie, auth/token/api-key-style) are REDACTED by default; pass redact=false to opt out.',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'The request id from list_network_requests.',
            },
            redact: {
              type: 'boolean',
              description: 'Redact sensitive headers (default true). Set false to see raw values.',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'get_console_messages',
        description:
          'Get buffered console messages and uncaught page errors for the active page (set allPages to merge all tabs). Each entry has a type (log/info/warn/error/debug from console events, plus "pageerror" for uncaught page errors), text, and location (url, lineNumber, columnNumber when available). Optional level filters by exact type.',
        inputSchema: {
          type: 'object',
          properties: {
            allPages: {
              type: 'boolean',
              description: 'Merge console messages from all tracked tabs (default: active page only).',
            },
            level: {
              type: 'string',
              description:
                'Filter by exact message type: log, info, warn, error, debug, or pageerror.',
            },
          },
        },
      },
      {
        name: 'hover',
        description:
          'Hover an element on the active page by CSS selector (default), visible text, or ARIA role + accessible name. Returns a structured not-found result if nothing matches (no error).',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'The target value. When by="css" (default) this is a CSS selector; when by="text" it is the element\'s visible text; when by="role" it is the accessible name.',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description:
                'How to interpret selector: "css" (default), "text" (visible text), or "role" (ARIA accessible name).',
            },
            role: {
              type: 'string',
              description: 'ARIA role name (e.g. "button") used only when by="role".',
            },
            motion: {
              type: 'string',
              enum: ['instant', 'human'],
              description:
                'Mouse motion mode. "instant" (default) hovers immediately; "human" moves the cursor along a curved, jittery path to the element center. Omit for backward-compatible behavior.',
            },
            seed: {
              type: 'number',
              description:
                'Optional seed to make the human motion path deterministic (only used when motion="human").',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'scroll',
        description:
          'Scroll the page by an amount, or scroll an element into view. Provide a selector (css default, or text/role) to scroll that element into view; otherwise provide x/y or deltaY pixels to scroll by amount. Returns the resulting scroll position.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'Optional target to scroll into view. When provided, element-into-view mode is used and amount params are ignored.',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description:
                'How to interpret selector: "css" (default), "text", or "role". Only used when selector is given.',
            },
            role: {
              type: 'string',
              description: 'ARIA role name used only when by="role".',
            },
            x: {
              type: 'number',
              description: 'Horizontal scroll delta in pixels (amount mode).',
            },
            y: {
              type: 'number',
              description: 'Vertical scroll delta in pixels (amount mode).',
            },
            deltaY: {
              type: 'number',
              description: 'Alias for the vertical scroll delta (amount mode); y takes precedence.',
            },
          },
        },
      },
      {
        name: 'select_option',
        description:
          'Select option(s) in a <select>. Provide a selector (css default, or text/role) and value (single string) and/or values (array for multi-selects). Returns the selected value(s); structured not-found/invalid-option result on failure (no error).',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description:
                'The target <select>. When by="css" (default) this is a CSS selector; when by="text"/"role" it locates the element accordingly.',
            },
            by: {
              type: 'string',
              enum: ['css', 'text', 'role'],
              description:
                'How to interpret selector: "css" (default), "text", or "role".',
            },
            role: {
              type: 'string',
              description: 'ARIA role name used only when by="role".',
            },
            value: {
              type: 'string',
              description: 'A single option value to select.',
            },
            values: {
              type: 'array',
              items: { type: 'string' },
              description: 'Option value(s) to select (use for multi-selects).',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'handle_dialog',
        description:
          'Configure automatic handling of native dialogs (alert/confirm/beforeunload/prompt). Sets a persistent mode across all tabs until changed: action "accept" (default) or "dismiss", with an optional promptText for prompt dialogs.',
        inputSchema: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['accept', 'dismiss'],
              description: 'Whether to accept (default) or dismiss dialogs.',
            },
            promptText: {
              type: 'string',
              description: 'Text to supply when accepting a prompt() dialog.',
            },
          },
        },
      },
      {
        name: 'go_back',
        description:
          'Navigate back in the active tab\'s history. Returns the resulting url/title, or a structured note when there is no previous history entry (no error).',
        inputSchema: {
          type: 'object',
          properties: {
            waitUntil: {
              type: 'string',
              description: 'When to consider navigation done (default "domcontentloaded").',
            },
            timeout: {
              type: 'number',
              description: 'Navigation timeout in ms (default 30000).',
            },
          },
        },
      },
      {
        name: 'go_forward',
        description:
          'Navigate forward in the active tab\'s history. Returns the resulting url/title, or a structured note when there is no next history entry (no error).',
        inputSchema: {
          type: 'object',
          properties: {
            waitUntil: {
              type: 'string',
              description: 'When to consider navigation done (default "domcontentloaded").',
            },
            timeout: {
              type: 'number',
              description: 'Navigation timeout in ms (default 30000).',
            },
          },
        },
      },
      {
        name: 'reload',
        description:
          'Reload the active tab. Returns the resulting url/title.',
        inputSchema: {
          type: 'object',
          properties: {
            waitUntil: {
              type: 'string',
              description: 'When to consider navigation done (default "domcontentloaded").',
            },
            timeout: {
              type: 'number',
              description: 'Navigation timeout in ms (default 30000).',
            },
          },
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'open_browser': {
        const url = (args?.url as string) || 'about:blank';
        const result = await tools.openBrowser(url);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'navigate': {
        const url = args?.url as string;
        if (!url) throw new Error('url parameter is required');
        const result = await tools.navigate(url);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'click': {
        const selector = args?.selector as string;
        const by = args?.by as 'css' | 'text' | 'role' | undefined;
        const role = args?.role as string | undefined;
        const motion = args?.motion as 'instant' | 'human' | undefined;
        const seed = args?.seed as number | undefined;
        if (!selector) throw new Error('selector parameter is required');
        const result = await tools.click(selector, { by, role, motion, seed });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'type': {
        const selector = args?.selector as string;
        const text = args?.text as string;
        const clear = Boolean(args?.clear);
        const by = args?.by as 'css' | 'text' | 'role' | undefined;
        const role = args?.role as string | undefined;
        if (!selector || text === undefined) {
          throw new Error('selector and text parameters are required');
        }
        const result = await tools.type(selector, text, clear, { by, role });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'press_key': {
        const key = args?.key as string;
        if (!key) throw new Error('key parameter is required');
        const result = await tools.pressKey(key);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_content': {
        const selector = args?.selector as string | undefined;
        const includeText = args?.includeText as boolean | undefined;
        const result = await tools.getContent({ selector, includeText });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_html': {
        const selector = args?.selector as string | undefined;
        const maxLength = args?.maxLength as number | undefined;
        const result = await tools.getHtml({ selector, maxLength });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'take_screenshot': {
        const result = await tools.takeScreenshot({
          selector: args?.selector as string | undefined,
          by: args?.by as 'css' | 'text' | 'role' | undefined,
          role: args?.role as string | undefined,
          fullPage: args?.fullPage as boolean | undefined,
        });
        const content: Array<Record<string, unknown>> = [
          {
            type: 'image',
            data: result.data as string,
            mimeType: result.mimeType,
          },
        ];
        // Surface the fallback note (if any) without disturbing the image
        // content. The default path has no note, so output stays a single
        // image item exactly as before.
        const note = (result as { note?: string }).note;
        if (note) {
          content.push({ type: 'text', text: note });
        }
        return { content };
      }

      case 'evaluate': {
        const script = args?.script as string;
        if (!script) throw new Error('script parameter is required');
        const result = await tools.evaluate(script);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'close_browser': {
        const result = await tools.closeBrowser();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_tabs': {
        const result = await tools.listTabs();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'select_tab': {
        const id = args?.id as string | undefined;
        const index = args?.index as number | undefined;
        const result = await tools.selectTab({ id, index });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'close_tab': {
        const id = args?.id as string | undefined;
        const index = args?.index as number | undefined;
        const result = await tools.closeTab({ id, index });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'wait_for': {
        const selector = args?.selector as string | undefined;
        const text = args?.text as string | undefined;
        const networkIdle = args?.networkIdle as boolean | undefined;
        const timeout = args?.timeout as number | undefined;
        const result = await tools.waitFor({ selector, text, networkIdle, timeout });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'list_network_requests': {
        const allPages = args?.allPages as boolean | undefined;
        const url = args?.url as string | undefined;
        const resourceType = args?.resourceType as string | undefined;
        const status = args?.status as number | undefined;
        const result = await tools.listNetworkRequests({
          allPages,
          url,
          resourceType,
          status,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_network_request': {
        const id = args?.id as string;
        if (!id) throw new Error('id parameter is required');
        const redact = args?.redact as boolean | undefined;
        const result = await tools.getNetworkRequest({ id, redact });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'get_console_messages': {
        const allPages = args?.allPages as boolean | undefined;
        const level = args?.level as string | undefined;
        const result = await tools.getConsoleMessages({ allPages, level });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'hover': {
        const selector = args?.selector as string;
        const by = args?.by as 'css' | 'text' | 'role' | undefined;
        const role = args?.role as string | undefined;
        const motion = args?.motion as 'instant' | 'human' | undefined;
        const seed = args?.seed as number | undefined;
        if (!selector) throw new Error('selector parameter is required');
        const result = await tools.hover(selector, { by, role, motion, seed });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'scroll': {
        const selector = args?.selector as string | undefined;
        const by = args?.by as 'css' | 'text' | 'role' | undefined;
        const role = args?.role as string | undefined;
        const x = args?.x as number | undefined;
        const y = args?.y as number | undefined;
        const deltaY = args?.deltaY as number | undefined;
        const result = await tools.scroll({ selector, by, role, x, y, deltaY });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'select_option': {
        const selector = args?.selector as string;
        if (!selector) throw new Error('selector parameter is required');
        const by = args?.by as 'css' | 'text' | 'role' | undefined;
        const role = args?.role as string | undefined;
        const values = Array.isArray(args?.values)
          ? (args?.values as string[])
          : args?.value !== undefined
            ? [args.value as string]
            : [];
        if (values.length === 0) {
          throw new Error('provide value or values to select');
        }
        const result = await tools.selectOption({ selector, by, role, values });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'handle_dialog': {
        const action = args?.action as 'accept' | 'dismiss' | undefined;
        const promptText = args?.promptText as string | undefined;
        const result = await tools.handleDialog({ action, promptText });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'go_back': {
        const waitUntil = args?.waitUntil as
          | 'load'
          | 'domcontentloaded'
          | 'networkidle0'
          | 'networkidle2'
          | undefined;
        const timeout = args?.timeout as number | undefined;
        const result = await tools.goBack({ waitUntil, timeout });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'go_forward': {
        const waitUntil = args?.waitUntil as
          | 'load'
          | 'domcontentloaded'
          | 'networkidle0'
          | 'networkidle2'
          | undefined;
        const timeout = args?.timeout as number | undefined;
        const result = await tools.goForward({ waitUntil, timeout });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'reload': {
        const waitUntil = args?.waitUntil as
          | 'load'
          | 'domcontentloaded'
          | 'networkidle0'
          | 'networkidle2'
          | undefined;
        const timeout = args?.timeout as number | undefined;
        const result = await tools.reload({ waitUntil, timeout });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [{ type: 'text', text: `Error: ${error.message || String(error)}` }],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[chrome-preview] MCP server started on stdio');
}

main().catch((err) => {
  console.error('[chrome-preview] Fatal error:', err);
  process.exit(1);
});
