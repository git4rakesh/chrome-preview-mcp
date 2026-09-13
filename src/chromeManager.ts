import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import puppeteer, { Browser, Page } from 'puppeteer-core';

export interface ChromeManagerOptions {
  chromePath?: string;
  userDataDir?: string;
  port?: number;
}

export class ChromeManager {
  private chromePath: string;
  private userDataDir: string;
  private port: number;
  private browser: Browser | null = null;
  private process: ChildProcess | null = null;

  constructor(options?: ChromeManagerOptions) {
    this.chromePath = options?.chromePath || this.findChromePath();
    this.userDataDir =
      options?.userDataDir ||
      path.join(os.homedir(), '.chrome-preview-mcp-profile');
    this.port = options?.port || 9222;
  }

  private findChromePath(): string {
    const candidates = [
      process.env.CHROME_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(
        os.homedir(),
        'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
      ),
      '/usr/bin/google-chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    throw new Error(
      'Google Chrome executable not found. Please set CHROME_PATH or install Google Chrome.'
    );
  }

  private async isPortOpen(port: number): Promise<boolean> {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return res.ok;
    } catch {
      return false;
    }
  }

  public async launch(initialUrl?: string): Promise<{ browser: Browser; page: Page }> {
    if (!fs.existsSync(this.userDataDir)) {
      fs.mkdirSync(this.userDataDir, { recursive: true });
    }

    const alreadyRunning = await this.isPortOpen(this.port);

    if (!alreadyRunning) {
      const chromeArgs = [
        `--remote-debugging-port=${this.port}`,
        `--user-data-dir=${this.userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        '--disable-infobars',
        '--window-size=1280,900',
        initialUrl && initialUrl !== 'about:blank' ? initialUrl : 'about:blank',
      ];

      this.process = spawn(this.chromePath, chromeArgs, {
        detached: true,
        stdio: 'ignore',
      });
      this.process.unref();

      // Wait for debugging endpoint to become ready
      const start = Date.now();
      let ready = false;
      while (Date.now() - start < 15000) {
        ready = await this.isPortOpen(this.port);
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }

      if (!ready) {
        throw new Error(`Timed out waiting for Chrome to start on port ${this.port}`);
      }
    }

    if (!this.browser || !this.browser.isConnected()) {
      this.browser = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${this.port}`,
        defaultViewport: null, // use actual window size
      });
    }

    const page = await this.getActivePage();
    await this.applyStealth(page);

    if (initialUrl && initialUrl !== 'about:blank') {
      const currentUrl = page.url();
      if (currentUrl === 'about:blank' || (!currentUrl.includes(initialUrl) && !initialUrl.includes(currentUrl))) {
        try {
          await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
        } catch {
          // SPA pages like Vast.ai may take longer to load assets, allow to proceed
        }
      }
    }

    return { browser: this.browser, page };
  }

  public async getActivePage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      const { page } = await this.launch();
      return page;
    }

    const pages = await this.browser.pages();
    if (pages.length === 0) {
      const newPage = await this.browser.newPage();
      await this.applyStealth(newPage);
      return newPage;
    }

    // Return the last active/focused page
    const page = pages[pages.length - 1];
    await this.applyStealth(page);
    return page;
  }

  private async applyStealth(page: Page): Promise<void> {
    try {
      await page.evaluateOnNewDocument(() => {
        // Mask navigator.webdriver
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });

        // Mock chrome.runtime if missing
        if (!(window as any).chrome) {
          (window as any).chrome = { runtime: {} };
        }

        // Mask permissions query for notifications
        const originalQuery = window.navigator.permissions.query;
        window.navigator.permissions.query = (parameters: any) =>
          parameters.name === 'notifications'
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(parameters);
      });
    } catch {
      // Ignore if already evaluated
    }
  }

  public async close(): Promise<void> {
    if (this.browser && this.browser.isConnected()) {
      await this.browser.close();
      this.browser = null;
    }
    if (this.process) {
      try {
        this.process.kill();
      } catch {
        // Ignore
      }
      this.process = null;
    }
  }
}
