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
}
