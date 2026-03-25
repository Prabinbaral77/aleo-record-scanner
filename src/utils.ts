import axios, { AxiosError } from 'axios';
import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

/**
 * Returns a promise that resolves after `ms` milliseconds.
 */
export function sleep(ms: number): Promise<void> {
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
export async function fetchWithRetry<T = unknown>(
  url: string,
  maxRetries = 5,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await axios.get<T>(url, {
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
    } catch (err) {
      const axiosErr = err as AxiosError;

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

// ---------------------------------------------------------------------------
// ensureWasm
// ---------------------------------------------------------------------------

let wasmReady = false;

/**
 * Lazily loads the `@provablehq/wasm` module.
 *
 * Patches `globalThis.fetch` once to handle `file:` protocol URLs so the WASM
 * binary can be read from disk in Node.js (native fetch does not support
 * file: URLs). All non-file requests are forwarded to the original fetch.
 */
export async function ensureWasm(): Promise<typeof import('@provablehq/wasm')> {
  if (!wasmReady) {
    const _fetch = globalThis.fetch;
    globalThis.fetch = async (input: any, init?: any): Promise<Response> => {
      const url = input instanceof URL ? input : new URL(String(input));
      if (url.protocol === 'file:') {
        const buf = await readFile(fileURLToPath(url));
        return new Response(buf, { headers: { 'Content-Type': 'application/wasm' } });
      }
      return _fetch(input, init);
    };
    wasmReady = true;
  }
  return import('@provablehq/wasm');
}
