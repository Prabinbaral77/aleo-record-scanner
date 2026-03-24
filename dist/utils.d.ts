/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Performs an HTTP GET request to `url` with automatic retries.
 *
 * - On HTTP 429 (rate-limited) the response's `Retry-After` header is
 *   respected when present; otherwise an exponential back-off is applied.
 * - On other 5xx errors an exponential back-off is applied.
 * - Non-retryable errors (4xx except 429, network errors, etc.) are thrown
 *   immediately after the maximum number of retries is exhausted.
 *
 * @param url        The URL to fetch.
 * @param maxRetries Maximum number of attempts (default 5).
 * @returns          The parsed JSON response body.
 */
export declare function fetchWithRetry<T = unknown>(url: string, maxRetries?: number): Promise<T>;
/**
 * Lazily loads and initialises the `@provablehq/wasm` module.
 *
 * The Provable WASM package sometimes tries to resolve assets over the
 * `file:` protocol when running in Node.js.  If the global `fetch` is
 * undefined (Node < 18) or does not handle `file:` URLs the initialisation
 * will fail.  This helper patches `globalThis.fetch` to fall back to a
 * Node.js `fs`-based implementation for `file:` URLs.
 *
 * @returns The initialised `@provablehq/wasm` module.
 */
export declare function ensureWasm(): Promise<typeof import('@provablehq/wasm')>;
//# sourceMappingURL=utils.d.ts.map