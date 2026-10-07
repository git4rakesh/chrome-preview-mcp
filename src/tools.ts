import { Page, ElementHandle } from 'puppeteer-core';
import { ChromeManager, MAX_RESPONSE_BODY_CHARS } from './chromeManager.js';

/** Header names that are always redacted (compared case-insensitively). */
const ALWAYS_REDACT_HEADERS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
]);

/** Pattern matching header names that look auth/token/secret related. */
const SENSITIVE_HEADER_PATTERN =
  /(auth|token|api[-_]?key|secret|session|credential|x-amz-security-token)/i;

/**
 * Redact sensitive header values by default. Keeps every header key; replaces
 * the value of any always-redacted or sensitive-looking header with
 * "[REDACTED]". Pass `redact=false` to opt out entirely. Pure and exported so
 * it can be unit-tested without a browser. puppeteer lower-cases header names,
 * but we lower-case defensively to be safe.
 */
export function redactHeaders(
  headers: Record<string, string>,
  redact = true
): Record<string, string> {
  if (!redact) return { ...headers };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (ALWAYS_REDACT_HEADERS.has(lower) || SENSITIVE_HEADER_PATTERN.test(lower)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = value;
    }
  }
  return out;
}

/** Selection mode for the shared element resolver. */
export type ResolveMode = 'css' | 'text' | 'role';

interface ResolveSuccess {
  ok: true;
  handle: ElementHandle<Element>;
  engineSelector: string; // the selector actually used (css string, or "text/..", or "aria/..")
}
interface ResolveFailure {
  ok: false;
  error?: string; // set only for bad input
  notFound?: boolean; // set when the element never resolved within timeout
  engineSelector?: string;
}
type ResolveResult = ResolveSuccess | ResolveFailure;

// Size caps for page-reading tools. Constants only (no env/manual config) so
// the defaults work out of the box; callers may override get_html's cap via
// its maxLength param.
const MAX_CONTENT_CHARS = 50000;
const MAX_HTML_CHARS = 500000;

export class BrowserTools {
  constructor(private chromeManager: ChromeManager) {}

  /** Slice a string to `max` chars, reporting whether truncation occurred. */
  private capText(s: string, max: number): { text: string; truncated: boolean } {
    if (s.length > max) {
      return { text: s.slice(0, max), truncated: true };
    }
    return { text: s, truncated: false };
  }

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

  /**
   * Single source of truth for locating an element by CSS (default), visible
   * text, or ARIA role + accessible name. Shared by both `click` and `type`
   * so no selection logic is duplicated.
   *
   * Uses puppeteer-core's built-in selector engines (confirmed present in
   * 24.x): `text/<value>` matches by visible text (trimmed, most-specific
   * element), `aria/<name>[role="<role>"]` matches by accessible name with an
   * optional role filter. CSS is passed through unchanged, so with `by`
   * omitted the behaviour is exactly as before.
   *
   * Never throws: bad input and not-found (including the wait timing out) are
   * returned as structured failures, consistent with wait_for/get_content.
   */
  private async resolveElement(
    page: Page,
    args: { by?: ResolveMode; selector: string; role?: string; timeout?: number }
  ): Promise<ResolveResult> {
    const { by, selector, role } = args;

    if (!selector) {
      return { ok: false, error: 'selector is required' };
    }
    if (by !== undefined && by !== 'css' && by !== 'text' && by !== 'role') {
      return { ok: false, error: 'by must be one of css|text|role' };
    }

    let engineSelector: string;
    switch (by) {
      case 'text':
        engineSelector = `text/${selector}`;
        break;
      case 'role':
        engineSelector = role
          ? `aria/${selector}[role="${role}"]`
          : `aria/${selector}`;
        break;
      default:
        engineSelector = selector; // css / undefined
    }

    const timeout = typeof args.timeout === 'number' ? args.timeout : 10000;

    try {
      const handle = await page.waitForSelector(engineSelector, {
        visible: true,
        timeout,
      });
      if (!handle) return { ok: false, notFound: true, engineSelector };
      return { ok: true, handle: handle as ElementHandle<Element>, engineSelector };
    } catch {
      // TimeoutError (or any wait failure) → structured not-found, never thrown.
      return { ok: false, notFound: true, engineSelector };
    }
  }

  public async click(
    selector: string,
    opts: { by?: ResolveMode; role?: string } = {}
  ) {
    const page = await this.chromeManager.getActivePage();
    const by = opts.by ?? 'css';
    const res = await this.resolveElement(page, {
      by: opts.by,
      selector,
      role: opts.role,
    });

    if (!res.ok) {
      if (res.error) {
        return { error: res.error, by, selector };
      }
      return {
        found: false,
        by,
        selector,
        role: opts.role,
        message: 'No element matched',
        currentUrl: page.url(),
      };
    }

    await res.handle.click();
    return {
      message: `Clicked element matching selector: "${selector}"`,
      by,
      selector,
      currentUrl: page.url(),
    };
  }

  public async type(
    selector: string,
    text: string,
    clear = false,
    opts: { by?: ResolveMode; role?: string } = {}
  ) {
    const page = await this.chromeManager.getActivePage();
    const by = opts.by ?? 'css';
    const res = await this.resolveElement(page, {
      by: opts.by,
      selector,
      role: opts.role,
    });

    if (!res.ok) {
      if (res.error) {
        return { error: res.error, by, selector };
      }
      return {
        found: false,
        by,
        selector,
        role: opts.role,
        message: 'No element matched',
        currentUrl: page.url(),
      };
    }

    // Preserve the existing clear/typing semantics exactly, acting on the
    // resolved handle so text/role resolution is honored.
    if (clear) {
      await res.handle.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
    }
    await res.handle.type(text, { delay: 30 });
    return {
      message: `Typed text into "${selector}"`,
      by,
      selector,
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

  /**
   * Get a structured page summary (title, url, headings, buttons, inputs,
   * links). Backward compatible: existing fields are unchanged.
   *
   * New optional behaviour:
   *  - `includeText` (default true): add a `text` field with visible text.
   *    Text is capped to MAX_CONTENT_CHARS; `truncated` reports whether the
   *    cap was hit.
   *  - `selector`: when provided, scope the extracted text to the first
   *    matching element's innerText. Title/url/summary stay page-level. If the
   *    selector matches nothing, return `selectorFound:false` and `text:null`
   *    without throwing.
   */
  public async getContent(
    opts: { selector?: string; includeText?: boolean } = {}
  ) {
    const includeText = opts.includeText !== false; // default true
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

    const base = {
      title,
      currentUrl,
      ...summary,
    };

    if (!includeText) {
      return base;
    }

    // Extract visible text, optionally scoped to a selector. Returns null when
    // a selector was given but matched nothing (reported via selectorFound).
    const extracted = await page.evaluate((selector: string | undefined) => {
      if (selector) {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (!el) return { found: false, text: null as string | null };
        return { found: true, text: el.innerText || '' };
      }
      return {
        found: true,
        text: document.body ? document.body.innerText || '' : '',
      };
    }, opts.selector);

    if (opts.selector !== undefined && !extracted.found) {
      return {
        ...base,
        selector: opts.selector,
        selectorFound: false,
        text: null,
        truncated: false,
      };
    }

    const { text, truncated } = this.capText(extracted.text ?? '', MAX_CONTENT_CHARS);

    return {
      ...base,
      ...(opts.selector !== undefined ? { selector: opts.selector, selectorFound: true } : {}),
      text,
      truncated,
    };
  }

  /**
   * Return outerHTML for the page or a scoped element.
   *  - `selector`: when provided, return the first matching element's
   *    outerHTML; if no match, return `selectorFound:false` and `html:null`
   *    without throwing. When omitted, return document.documentElement.outerHTML.
   *  - `maxLength`: optional override of the default MAX_HTML_CHARS cap. A
   *    non-number or value <= 0 falls back to the default (never throws).
   * HTML is capped and `truncated` reports whether the cap was hit.
   */
  public async getHtml(opts: { selector?: string; maxLength?: number } = {}) {
    const page = await this.chromeManager.getActivePage();
    const currentUrl = page.url();

    const cap =
      typeof opts.maxLength === 'number' && opts.maxLength > 0
        ? opts.maxLength
        : MAX_HTML_CHARS;

    const extracted = await page.evaluate((selector: string | undefined) => {
      if (selector) {
        const el = document.querySelector(selector) as Element | null;
        if (!el) return { found: false, html: null as string | null };
        return { found: true, html: el.outerHTML };
      }
      return { found: true, html: document.documentElement.outerHTML };
    }, opts.selector);

    if (opts.selector !== undefined && !extracted.found) {
      return {
        currentUrl,
        selector: opts.selector,
        selectorFound: false,
        html: null,
        truncated: false,
      };
    }

    const { text: html, truncated } = this.capText(extracted.html ?? '', cap);

    return {
      currentUrl,
      ...(opts.selector !== undefined ? { selector: opts.selector, selectorFound: true } : {}),
      html,
      length: html.length,
      truncated,
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

  // ---- Waiting (Task 4) ----------------------------------------------------

  /**
   * Wait for ANY of: a CSS selector becoming visible, text appearing anywhere
   * in document.body.innerText, or the network going idle. The first provided
   * condition to be satisfied wins (Promise.race). Never throws on timeout or
   * bad input — returns a structured result instead.
   *
   * Cancellation: a single AbortController's signal is passed into every
   * underlying puppeteer wait, so when the race settles we abort the losers.
   * Each wait also carries a never-settling `.catch` guard, so a late
   * TimeoutError/AbortError arriving after a win is swallowed and can never
   * surface as an unhandledRejection.
   */
  public async waitFor(args: {
    selector?: string;
    text?: string;
    networkIdle?: boolean;
    timeout?: number;
  }) {
    const timeout = typeof args.timeout === 'number' ? args.timeout : 30000;

    const provided: Array<'selector' | 'text' | 'networkIdle'> = [];
    if (args.selector !== undefined) provided.push('selector');
    if (args.text !== undefined) provided.push('text');
    if (args.networkIdle === true) provided.push('networkIdle');

    if (provided.length === 0) {
      return { error: 'Provide at least one of: selector, text, networkIdle' };
    }

    const page = await this.chromeManager.getActivePage();
    const controller = new AbortController();
    const signal = controller.signal;

    type Matched = 'selector' | 'text' | 'networkIdle';
    type RaceResult = { matched: Matched } | { timedOut: true };

    // A never-settling promise lets us neutralize a losing/late rejection:
    // the condition can never win the race and never crash the process.
    const neverFromRejection = () => new Promise<never>(() => {});

    const conditions: Array<Promise<RaceResult>> = [];

    if (args.selector !== undefined) {
      conditions.push(
        page
          .waitForSelector(args.selector, { visible: true, timeout, signal })
          .then(() => ({ matched: 'selector' as const }))
          .catch(neverFromRejection)
      );
    }
    if (args.text !== undefined) {
      const text = args.text;
      conditions.push(
        page
          .waitForFunction(
            (t: string) => !!document.body && document.body.innerText.includes(t),
            { timeout, signal },
            text
          )
          .then(() => ({ matched: 'text' as const }))
          .catch(neverFromRejection)
      );
    }
    if (args.networkIdle === true) {
      conditions.push(
        page
          .waitForNetworkIdle({ timeout, signal })
          .then(() => ({ matched: 'networkIdle' as const }))
          .catch(neverFromRejection)
      );
    }

    // Explicit timer gives a deterministic, label-free timeout decision and a
    // precise elapsed measurement, independent of each wait's own TimeoutError.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timerPromise = new Promise<RaceResult>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), timeout);
    });

    const start = Date.now();
    try {
      const result = await Promise.race([...conditions, timerPromise]);
      const elapsedMs = Date.now() - start;

      if ('matched' in result) {
        return { timedOut: false, matched: result.matched, elapsedMs };
      }
      return {
        timedOut: true,
        matched: null,
        elapsedMs,
        message: `Timed out after ${timeout}ms waiting for: ${provided.join(', ')}`,
      };
    } finally {
      // Cancel the losing waits and clear the timer so nothing leaks.
      if (timer !== undefined) clearTimeout(timer);
      controller.abort();
    }
  }

  // ---- Network inspection (Task 7) -----------------------------------------

  /**
   * List captured network requests from the ring buffer. Defaults to the
   * active page; set `allPages` to merge every tracked page's buffer. Optional
   * filters: `url` (substring match), `resourceType` (exact match), `status`
   * (exact number or a {min,max} range). Returns a public, body-free shape per
   * entry. Never throws.
   */
  public async listNetworkRequests(args: {
    allPages?: boolean;
    url?: string;
    resourceType?: string;
    status?: number | { min?: number; max?: number };
  } = {}) {
    const pages = args.allPages
      ? this.chromeManager.getPages().filter((p) => !p.isClosed())
      : [this.chromeManager.getActivePageOrNull()].filter(
          (p): p is Page => p !== null && !p.isClosed()
        );

    const entries = pages.flatMap((p) => this.chromeManager.getNetworkEntries(p));

    const statusMatches = (status: number | null): boolean => {
      if (args.status === undefined) return true;
      if (status === null) return false;
      if (typeof args.status === 'number') return status === args.status;
      const { min, max } = args.status;
      if (typeof min === 'number' && status < min) return false;
      if (typeof max === 'number' && status > max) return false;
      return true;
    };

    const filtered = entries.filter((e) => {
      if (args.url !== undefined && !e.url.includes(args.url)) return false;
      if (args.resourceType !== undefined && e.resourceType !== args.resourceType)
        return false;
      if (!statusMatches(e.status)) return false;
      return true;
    });

    const requests = filtered.map((e) => ({
      id: e.id,
      method: e.method,
      url: e.url,
      resourceType: e.resourceType,
      status: e.status,
      timestamp: e.timestamp,
    }));

    return { requests, count: requests.length };
  }

  /**
   * Return full detail for one captured request by id: request headers,
   * response status, response headers, and the response body — but the body
   * ONLY for text/JSON-like content types, capped to MAX_RESPONSE_BODY_CHARS.
   * Sensitive headers are redacted by default (`redact:false` opts out).
   * Everything is structured and this never throws.
   */
  public async getNetworkRequest(args: { id: string; redact?: boolean }) {
    if (!args || !args.id) {
      return { found: false, error: 'id is required' };
    }
    const redact = args.redact !== false; // default true

    const entry = this.chromeManager.findNetworkEntry(args.id);
    if (!entry) {
      return { found: false, id: args.id };
    }

    let requestHeaders: Record<string, string> = {};
    try {
      requestHeaders = redactHeaders(entry.req.headers(), redact);
    } catch {
      requestHeaders = {};
    }

    const result: {
      found: true;
      id: string;
      method: string;
      url: string;
      resourceType: string;
      requestHeaders: Record<string, string>;
      status: number | null;
      responseHeaders: Record<string, string> | null;
      contentType: string | null;
      body: string | null;
      bodyTruncated: boolean;
      bodyOmittedReason: string | null;
      failure?: string;
    } = {
      found: true,
      id: entry.id,
      method: entry.method,
      url: entry.url,
      resourceType: entry.resourceType,
      requestHeaders,
      status: entry.status,
      responseHeaders: null,
      contentType: null,
      body: null,
      bodyTruncated: false,
      bodyOmittedReason: null,
    };

    if (entry.failure) {
      result.failure = entry.failure;
    }

    const res = entry.res;
    if (!res) {
      result.bodyOmittedReason = 'no response captured (pending or failed)';
      return result;
    }

    let responseHeaders: Record<string, string> = {};
    try {
      responseHeaders = res.headers();
    } catch {
      responseHeaders = {};
    }
    result.responseHeaders = redactHeaders(responseHeaders, redact);
    if (result.status === null) {
      try {
        result.status = res.status();
      } catch {
        // Keep null if unavailable.
      }
    }

    // content-type is read from the UNREDACTED headers (it is never sensitive).
    const contentType = responseHeaders['content-type'] ?? null;
    result.contentType = contentType;

    const isTextual =
      contentType !== null &&
      /(text|json|xml|javascript|ecmascript|x-www-form-urlencoded)/i.test(
        contentType
      );

    if (!isTextual) {
      result.bodyOmittedReason =
        contentType === null
          ? 'content-type unavailable; body omitted'
          : 'non-text content type';
      return result;
    }

    try {
      const text = await res.text();
      if (text.length > MAX_RESPONSE_BODY_CHARS) {
        result.body = text.slice(0, MAX_RESPONSE_BODY_CHARS);
        result.bodyTruncated = true;
      } else {
        result.body = text;
      }
    } catch (err: any) {
      // Bodies may be unavailable: redirects, 204, already-consumed, etc.
      result.body = null;
      result.bodyOmittedReason = `body unavailable: ${
        err?.message || String(err)
      }`;
    }

    return result;
  }
}
