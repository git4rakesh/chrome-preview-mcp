import { Page } from 'puppeteer-core';
import { ChromeManager } from './chromeManager.js';

export class BrowserTools {
  constructor(private chromeManager: ChromeManager) {}

  public async openBrowser(url: string) {
    const { page } = await this.chromeManager.launch(url);
    const title = await page.title();
    return {
      message: `Browser opened successfully at ${url}`,
      currentUrl: page.url(),
      title,
    };
  }

  public async navigate(url: string) {
    const page = await this.chromeManager.getActivePage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch {
      // Continue even if SPA assets or background requests are still loading
    }
    const title = await page.title();
    return {
      message: `Navigated to ${url}`,
      currentUrl: page.url(),
      title,
    };
  }

  public async click(selector: string) {
    const page = await this.chromeManager.getActivePage();
    // Wait for selector and click
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    await page.click(selector);
    return {
      message: `Clicked element matching selector: "${selector}"`,
      currentUrl: page.url(),
    };
  }

  public async type(selector: string, text: string, clear = false) {
    const page = await this.chromeManager.getActivePage();
    await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    if (clear) {
      await page.click(selector, { clickCount: 3 });
      await page.keyboard.press('Backspace');
    }
    await page.type(selector, text, { delay: 30 });
    return {
      message: `Typed text into "${selector}"`,
      currentUrl: page.url(),
    };
  }

  public async pressKey(key: string) {
    const page = await this.chromeManager.getActivePage();
    await page.keyboard.press(key as any);
    return {
      message: `Pressed key "${key}"`,
      currentUrl: page.url(),
    };
  }

  public async getContent() {
    const page = await this.chromeManager.getActivePage();
    const title = await page.title();
    const currentUrl = page.url();

    // Extract useful page summary: headings, buttons, inputs, links
    const summary = await page.evaluate(() => {
      const getElements = (query: string) =>
        Array.from(document.querySelectorAll(query)).map((el) => {
          const tag = el.tagName.toLowerCase();
          const text = (el.textContent || '').trim().slice(0, 100);
          const aria = el.getAttribute('aria-label') || '';
          const placeholder = el.getAttribute('placeholder') || '';
          const type = el.getAttribute('type') || '';
          const id = el.id ? `#${el.id}` : '';
          const name = el.getAttribute('name') || '';

          return {
            tag,
            id,
            name,
            type,
            text: text || aria || placeholder,
          };
        });

      return {
        headings: Array.from(document.querySelectorAll('h1, h2, h3, h4, h5')).map(
          (h) => `${h.tagName}: ${(h.textContent || '').trim()}`
        ),
        buttons: getElements('button, input[type="button"], input[type="submit"], [role="button"]').slice(0, 30),
        inputs: getElements('input:not([type="hidden"]), textarea, select').slice(0, 30),
        links: getElements('a[href]').slice(0, 40),
      };
    });

    return {
      title,
      currentUrl,
      ...summary,
    };
  }

  public async takeScreenshot() {
    const page = await this.chromeManager.getActivePage();
    const buffer = await page.screenshot({ encoding: 'base64', type: 'png' });
    return {
      mimeType: 'image/png',
      data: buffer,
    };
  }

  public async evaluate(script: string) {
    const page = await this.chromeManager.getActivePage();
    const result = await page.evaluate((code: string) => {
      return (0, eval)(code);
    }, script);
    return {
      result,
      currentUrl: page.url(),
    };
  }

  public async closeBrowser() {
    await this.chromeManager.close();
    return {
      message: 'Browser closed successfully',
    };
  }

  // ---- Multi-tab tools (Task 3) --------------------------------------------

  /**
   * Stable per-tab id. puppeteer-core's public `Target` type exposes no `id`
   * accessor, but the CDP implementation stores the real stable target id at
   * `CdpTarget._targetId` (set from `targetInfo.targetId`). That id is stable
   * for the life of the tab and matches the DevTools `/json` listing, so we
   * read it via an untyped cast. If it is ever absent, callers fall back to a
   * registry-order id (`tab-<index>`).
   */
  private pageId(page: Page): string {
    const id = (page.target() as any)?._targetId;
    return typeof id === 'string' && id ? id : '';
  }

  private async describeTab(page: Page, index: number, activePage: Page | null) {
    return {
      index,
      id: this.pageId(page) || `tab-${index}`,
      title: await page.title().catch(() => ''),
      url: page.url(),
      active: page === activePage,
    };
  }

  /**
   * Resolve a live page from the registry by id (preferred) or 0-based index.
   * Returns the page plus its registry index, or null when nothing matches a
   * live page (race-safe: closed pages are filtered out).
   */
  private resolvePage(
    args: { id?: string; index?: number }
  ): { page: Page; index: number } | null {
    const pages = this.chromeManager.getPages().filter((p) => !p.isClosed());
    if (args.id !== undefined) {
      const idx = pages.findIndex((p) => this.pageId(p) === args.id);
      if (idx !== -1) return { page: pages[idx], index: idx };
      return null;
    }
    if (args.index !== undefined) {
      if (args.index >= 0 && args.index < pages.length) {
        return { page: pages[args.index], index: args.index };
      }
      return null;
    }
    return null;
  }

  /** List all open tabs from the live registry, marking the active one. */
  public async listTabs() {
    const pages = this.chromeManager.getPages().filter((p) => !p.isClosed());
    const active = this.chromeManager.getActivePageOrNull();
    const tabs = await Promise.all(
      pages.map((page, i) => this.describeTab(page, i, active))
    );
    const activeTab = tabs.find((t) => t.active);
    return {
      tabs,
      activeId: activeTab ? activeTab.id : null,
      count: tabs.length,
    };
  }

  /** Switch the active tab by id (preferred) or 0-based index. */
  public async selectTab(args: { id?: string; index?: number }) {
    if (args.id === undefined && args.index === undefined) {
      return { error: 'Provide either id or index' };
    }
    const resolved = this.resolvePage(args);
    if (!resolved) {
      return {
        error: `No tab matches ${
          args.id !== undefined ? `id "${args.id}"` : `index ${args.index}`
        }`,
      };
    }
    if (!this.chromeManager.setActivePage(resolved.page)) {
      // Race: the page closed between resolution and activation.
      return { error: 'Tab is no longer available' };
    }
    try {
      await resolved.page.bringToFront();
    } catch {
      // Non-fatal: activation already succeeded; focus is best-effort.
    }
    return this.describeTab(resolved.page, resolved.index, resolved.page);
  }

  /**
   * Close a tab by id or index. With neither, closes the active tab. Task 2's
   * per-page 'close' listener deregisters the page and reselects a sane active
   * tab, so this does not re-implement reselection.
   */
  public async closeTab(args: { id?: string; index?: number }) {
    let target: { page: Page; index: number } | null;
    if (args.id === undefined && args.index === undefined) {
      const active = this.chromeManager.getActivePageOrNull();
      if (!active || active.isClosed()) {
        return { error: 'No tab to close' };
      }
      const pages = this.chromeManager.getPages().filter((p) => !p.isClosed());
      target = { page: active, index: pages.indexOf(active) };
    } else {
      target = this.resolvePage(args);
    }

    if (!target) {
      return {
        error: `No tab matches ${
          args.id !== undefined ? `id "${args.id}"` : `index ${args.index}`
        }`,
      };
    }

    // Capture identity BEFORE closing (afterwards the page is gone).
    const closed = { id: this.pageId(target.page) || `tab-${target.index}`, index: target.index };
    try {
      await target.page.close();
    } catch {
      // Race: tab already closed. The 'close' listener still runs; proceed.
    }

    const active = this.chromeManager.getActivePageOrNull();
    const remaining = this.chromeManager.getPages().filter((p) => !p.isClosed()).length;
    const activeTab = active && !active.isClosed()
      ? await this.describeTab(
          active,
          this.chromeManager.getPages().filter((p) => !p.isClosed()).indexOf(active),
          active
        )
      : null;

    return {
      closed,
      active: activeTab,
      remaining,
      message: remaining === 0 ? 'No tabs remain open' : 'Tab closed; active tab reselected',
    };
  }
}
