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
    // Explicit override always wins, regardless of platform.
    if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
      return process.env.CHROME_PATH;
    }

    const candidates = this.getChromeCandidatesForPlatform();

    for (const candidate of candidates) {
      if (candidate && fs.existsSync(candidate)) {
        return candidate;
      }
    }

    // Last resort: try to resolve a Chromium-family binary from PATH.
    const fromPath = this.findChromeOnPath();
    if (fromPath) {
      return fromPath;
    }

    throw new Error(
      'Chrome/Chromium executable not found. Set the CHROME_PATH environment variable to your browser binary, or install Google Chrome / Chromium.'
    );
  }

  private getChromeCandidatesForPlatform(): string[] {
    const home = os.homedir();
    const platform = process.platform;

    if (platform === 'win32') {
      const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
      const programFilesX86 =
        process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
      const localAppData =
        process.env['LOCALAPPDATA'] || path.join(home, 'AppData', 'Local');

      return [
        path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
        path.join(programFiles, 'Google\\Chrome Beta\\Application\\chrome.exe'),
        path.join(programFiles, 'Google\\Chrome SxS\\Application\\chrome.exe'),
        path.join(localAppData, 'Google\\Chrome SxS\\Application\\chrome.exe'),
        path.join(programFiles, 'Chromium\\Application\\chrome.exe'),
        path.join(localAppData, 'Chromium\\Application\\chrome.exe'),
        path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
        path.join(programFiles, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
        path.join(programFilesX86, 'BraveSoftware\\Brave-Browser\\Application\\brave.exe'),
      ];
    }

    if (platform === 'darwin') {
      return [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        path.join(home, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
        '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      ];
    }

    // Linux and other Unix-like systems.
    return [
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome-beta',
      '/usr/bin/google-chrome-unstable',
      '/opt/google/chrome/chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/brave-browser',
    ];
  }

  private findChromeOnPath(): string | null {
    const isWindows = process.platform === 'win32';
    const binaries = isWindows
      ? ['chrome.exe', 'chromium.exe', 'msedge.exe', 'brave.exe']
      : [
          'google-chrome',
          'google-chrome-stable',
          'chromium',
          'chromium-browser',
          'microsoft-edge',
          'brave-browser',
        ];

    const pathEnv = process.env.PATH || '';
    const pathDirs = pathEnv.split(path.delimiter).filter(Boolean);

    for (const dir of pathDirs) {
      for (const binary of binaries) {
        const candidate = path.join(dir, binary);
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
          }
        } catch {
          // Ignore inaccessible PATH entries
        }
      }
    }

    return null;
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

    // Prefer the active tab with actual content over about:blank
    const nonBlank = pages.find((p) => p.url() !== 'about:blank' && p.url() !== '');
    const page = nonBlank || pages[pages.length - 1];
    await this.applyStealth(page);
    return page;
  }

  private async applyStealth(page: Page): Promise<void> {
    try {
      await page.evaluateOnNewDocument(() => {
        // Mask navigator.webdriver completely
        try {
          delete (Object.getPrototypeOf(navigator) as any).webdriver;
        } catch {}
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true,
        });

        // Mock chrome.runtime if missing
        if (!(window as any).chrome) {
          (window as any).chrome = { runtime: {} };
        }

        // Mask permissions query for notifications
        const originalQuery = window.navigator.permissions?.query;
        if (originalQuery) {
          window.navigator.permissions.query = (parameters: any) =>
            parameters.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
              : originalQuery(parameters);
        }
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
