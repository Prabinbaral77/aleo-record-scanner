import axios from 'axios';
// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------
/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------
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
export async function fetchWithRetry(url, maxRetries = 5) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await axios.get(url, {
                headers: { Accept: 'application/json' },
                // Treat 2xx and 404 as successful so we can handle 404 gracefully.
                validateStatus: (status) => status < 500 || status === 429,
            });
            if (response.status === 429) {
                // Honour Retry-After if provided, otherwise back-off exponentially.
                const retryAfterHeader = response.headers['retry-after'];
                const waitMs = retryAfterHeader
                    ? parseInt(retryAfterHeader, 10) * 1000
                    : Math.pow(2, attempt) * 1000;
                await sleep(waitMs);
                lastError = new Error(`Rate limited (429) on ${url}`);
                continue;
            }
            if (response.status === 404) {
                throw new Error(`Resource not found (404): ${url}`);
            }
            return response.data;
        }
        catch (err) {
            const axiosErr = err;
            // If we already re-threw from inside the try block propagate as-is.
            if (axiosErr.isAxiosError === false || axiosErr.response == null) {
                // Network-level error – apply back-off and retry.
                lastError = err;
                const waitMs = Math.pow(2, attempt) * 1000;
                await sleep(waitMs);
                continue;
            }
            const status = axiosErr.response?.status ?? 0;
            if (status >= 500) {
                // Server error – back-off and retry.
                lastError = err;
                const waitMs = Math.pow(2, attempt) * 1000;
                await sleep(waitMs);
                continue;
            }
            // All other errors are not retryable; throw immediately.
            throw err;
        }
    }
    throw lastError ?? new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}
// ---------------------------------------------------------------------------
// ensureWasm
// ---------------------------------------------------------------------------
// Cache the initialised WASM module so we only load it once.
let wasmModule = null;
let wasmInitPromise = null;
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
export async function ensureWasm() {
    if (wasmModule !== null) {
        return wasmModule;
    }
    if (wasmInitPromise !== null) {
        return wasmInitPromise;
    }
    wasmInitPromise = (async () => {
        // Patch globalThis.fetch so that file: URLs work in Node.js environments
        // that lack native fetch support for local files.
        patchFetchForFileUrls();
        // Dynamic import so the heavy WASM bundle is only loaded on first use.
        const wasm = await import('@provablehq/wasm');
        // Some builds expose a default init function; call it when present.
        if (typeof wasm.default === 'function') {
            await wasm.default();
        }
        wasmModule = wasm;
        return wasm;
    })();
    return wasmInitPromise;
}
/**
 * Installs a global fetch shim that handles `file:` protocol URLs using the
 * Node.js `fs` module.  Only the subset of the Fetch API surface required by
 * the WASM loader is implemented.
 *
 * This is a no-op when `globalThis.fetch` already handles `file:` URLs or
 * when `globalThis.fetch` already exists and appears to be a fully-capable
 * implementation (i.e. not the Node built-in which rejects file: URLs).
 */
function patchFetchForFileUrls() {
    const originalFetch = globalThis.fetch?.bind(globalThis);
    // Use a broad parameter type that avoids DOM-only types (RequestInfo is not
    // available under lib: ES2020) while still accepting every value the WASM
    // loader may pass to fetch.
    globalThis.fetch = async function patchedFetch(input, init) {
        const urlString = typeof input === 'string'
            ? input
            : input instanceof URL
                ? input.href
                : input.url;
        if (urlString.startsWith('file:')) {
            // Resolve the file URL to a local path and read it with fs.
            const { fileURLToPath } = await import('url');
            const { readFile } = await import('fs/promises');
            const filePath = fileURLToPath(urlString);
            const buffer = await readFile(filePath);
            const uint8 = new Uint8Array(buffer);
            return new Response(uint8, {
                status: 200,
                headers: { 'Content-Type': 'application/wasm' },
            });
        }
        if (originalFetch) {
            return originalFetch(input, init);
        }
        throw new Error(`No fetch implementation available for URL: ${urlString}`);
    };
}
//# sourceMappingURL=utils.js.map