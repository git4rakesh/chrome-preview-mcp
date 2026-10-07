import { spawn, ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import puppeteer, { Browser, Page, Target } from 'puppeteer-core';

export interface ChromeManagerOptions {
  chromePath?: string;
  userDataDir?: string;
  port?: number;
}

/**
 * Resolve a Chrome/Chromium-family executable path cross-platform.
 * Returns the first existing candidate, or `null` if none is found.
 *
 * This is a non-throwing counterpart to the browser launch flow and is
 * safe to call from tests to decide whether browser-dependent tests can run.
 * Resolution order: explicit CHROME_PATH override, per-platform install
 * locations, then a PATH scan fallback.
 */
export function detectChromePath(): string | null {
  // Explicit override always wins, regardless of platform.
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = getChromeCandidatesForPlatform();
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // Last resort: try to resolve a Chromium-family binary from PATH.
  return findChromeOnPath();
}

function getChromeCandidatesForPlatform(): string[] {
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

function findChromeOnPath(): string | null {
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

export class ChromeManager {
  private chromePath: string;
  private userDataDir: string;
  private port: number;
  private browser: Browser | null = null;
  private process: ChildProcess | null = null;

  // Live page registry. A Set preserves insertion order and dedupes, so the
  // "most-recently-added survivor" on destroy is simply [...pages].pop().
  private pages = new Set<Page>();
  // Explicitly tracked active page. BrowserTools drives whatever this points
  // at, so new tabs/popups are never lost.
  private activePage: Page | null = null;
  // Guards stealth idempotency: evaluateOnNewDocument() stacks on every call,
  // so each page must be stealthed exactly once.
  private stealthed = new WeakSet<Page>();
  // Bound target-event handlers, stored so close() can detach them.
  private onTargetCreated?: (target: Target) => Promise<void>;
  private onTargetDestroyed?: (target: Target) => Promise<void>;
  private listenersAttached = false;

  constructor(options?: ChromeManagerOptions) {
    this.chromePath = options?.chromePath || this.findChromePath();
    this.userDataDir =
      options?.userDataDir ||
      path.join(os.homedir(), '.chrome-preview-mcp-profile');
    this.port = options?.port || 9222;
  }

  private findChromePath(): string {
    const resolved = detectChromePath();
    if (resolved) {
      return resolved;
    }

    throw new Error(
      'Chrome/Chromium executable not found. Set the CHROME_PATH environment variable to your browser binary, or install Google Chrome / Chromium.'
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

    this.attachTargetListeners();

    // Seed the registry with pages that already exist (don't rely only on
    // future targetcreated events). registerPage applies stealth centrally.
    const existing = await this.browser.pages();
    for (const existingPage of existing) {
      await this.registerPage(existingPage);
    }

    // Obtain the page to drive: the seeded active page, or a fresh one.
    let page = this.activePage;
    if (!page || page.isClosed()) {
      page = await this.browser.newPage();
      await this.registerPage(page);
    }

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

  /**
   * Returns the explicitly tracked active page. Backward compatible: same name,
   * same `Promise<Page>` return type, existing BrowserTools callers unchanged.
   * Lazily launches when the browser is absent and falls back to re-seeding /
   * opening a page so it never returns nothing.
   */
  public async getActivePage(): Promise<Page> {
    if (!this.browser || !this.browser.isConnected()) {
      const { page } = await this.launch();
      return page;
    }

    if (this.activePage && !this.activePage.isClosed()) {
      return this.activePage;
    }

    // Registry empty or active page closed: re-seed from live pages.
    const existing = await this.browser.pages();
    for (const existingPage of existing) {
      if (!existingPage.isClosed()) {
        await this.registerPage(existingPage);
      }
    }

    if (!this.activePage || this.activePage.isClosed()) {
      const page = await this.browser.newPage();
      await this.registerPage(page);
    }

    return this.activePage!;
  }

  /** Snapshot of all tracked open pages (test accessor; Task 3 builds on it). */
  public getPages(): Page[] {
    return [...this.pages];
  }

  /**
   * Returns the currently tracked active page without lazily launching the
   * browser (unlike getActivePage()). Multi-tab tools use this to mark the
   * active tab and to resolve "close the active tab" without forcing a launch.
   */
  public getActivePageOrNull(): Page | null {
    return this.activePage;
  }

  /**
   * Single public activation entry point for already-registered pages. Sets
   * the given page active iff it is tracked and still open. Does NOT register
   * or (re)apply stealth — those remain owned solely by registerPage() so the
   * stealth-in-one-place invariant holds. Returns false on a stale/unknown
   * page so callers can surface a structured error instead of throwing.
   */
  public setActivePage(page: Page): boolean {
    if (this.pages.has(page) && !page.isClosed()) {
      this.activePage = page;
      return true;
    }
    return false;
  }

  /**
   * Single central path for page registration. Both startup seeding and the
   * targetcreated handler route through here so a window.open popup gets the
   * exact same treatment as the initial page: tracked, stealthed once, and
   * made active. Never throws (race-safe) so it can't crash the server.
   */
  private async registerPage(page: Page): Promise<void> {
    try {
      if (!this.pages.has(page)) {
        this.pages.add(page);
        // Apply stealth exactly once per page through this one place.
        if (!this.stealthed.has(page)) {
          await this.applyStealth(page);
          this.stealthed.add(page);
        }
        // Deregister when the page closes.
        page.once('close', () => this.deregisterPage(page));
      }
      // Activation policy: a newly registered tab/popup BECOMES the active
      // page, so new tabs are never lost.
      this.activePage = page;
    } catch (err) {
      // Race: page may already be closed/navigated. Log, never rethrow.
      console.error('registerPage failed:', err);
    }
  }

  /** Remove a page from the registry and reselect a sane active page. */
  private deregisterPage(page: Page): void {
    this.pages.delete(page);
    this.stealthed.delete(page);
    if (this.activePage === page) {
      // Most-recently-added survivor, or null when none remain.
      this.activePage = [...this.pages].pop() ?? null;
    }
  }

  /** Attach targetcreated/targetdestroyed handlers once per connection. */
  private attachTargetListeners(): void {
    if (!this.browser || this.listenersAttached) return;

    this.onTargetCreated = async (target: Target) => {
      try {
        if (target.type() !== 'page') return;
        const page = await target.page();
        if (!page) return; // race: target.page() can be null
        await this.registerPage(page);
      } catch (err) {
        // Never crash the server on a target event.
        console.error('targetcreated handler failed:', err);
      }
    };

    this.onTargetDestroyed = async (_target: Target) => {
      try {
        // The target may be gone, so prune any pages that are now closed. The
        // per-page 'close' listener is the primary dereg path; this is a
        // backstop.
        for (const p of [...this.pages]) {
          if (p.isClosed()) this.deregisterPage(p);
        }
      } catch (err) {
        console.error('targetdestroyed handler failed:', err);
      }
    };

    this.browser.on('targetcreated', this.onTargetCreated);
    this.browser.on('targetdestroyed', this.onTargetDestroyed);
    this.listenersAttached = true;
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
    if (this.browser) {
      // Detach target listeners so they don't leak across re-launches.
      if (this.onTargetCreated) {
        this.browser.off('targetcreated', this.onTargetCreated);
      }
      if (this.onTargetDestroyed) {
        this.browser.off('targetdestroyed', this.onTargetDestroyed);
      }
    }
    this.listenersAttached = false;
    this.onTargetCreated = undefined;
    this.onTargetDestroyed = undefined;
    this.pages.clear();
    this.activePage = null;
    this.stealthed = new WeakSet<Page>();

    if (this.browser && this.browser.isConnected()) {
      await this.browser.close();
      this.browser = null;
    } else {
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
