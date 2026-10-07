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
        description: 'Click an element on the active page by CSS selector.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of the element to click (e.g. "button.login-btn" or "#submit")',
            },
          },
          required: ['selector'],
        },
      },
      {
        name: 'type',
        description: 'Type text into an input or textarea on the active page.',
        inputSchema: {
          type: 'object',
          properties: {
            selector: {
              type: 'string',
              description: 'CSS selector of the input element',
            },
            text: {
              type: 'string',
              description: 'Text to type',
            },
            clear: {
              type: 'boolean',
              description: 'Whether to clear existing text before typing',
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
          'Get the current page title, URL, headings, buttons, and form inputs for reasoning.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'take_screenshot',
        description: 'Capture a screenshot of the visible Chrome tab.',
        inputSchema: {
          type: 'object',
          properties: {},
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
        if (!selector) throw new Error('selector parameter is required');
        const result = await tools.click(selector);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'type': {
        const selector = args?.selector as string;
        const text = args?.text as string;
        const clear = Boolean(args?.clear);
        if (!selector || text === undefined) {
          throw new Error('selector and text parameters are required');
        }
        const result = await tools.type(selector, text, clear);
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
        const result = await tools.getContent();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      }

      case 'take_screenshot': {
        const result = await tools.takeScreenshot();
        return {
          content: [
            {
              type: 'image',
              data: result.data as string,
              mimeType: result.mimeType,
            },
          ],
        };
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
