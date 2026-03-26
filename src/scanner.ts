import { EventEmitter } from 'events';
import { fetchWithRetry, sleep, ensureWasm } from './utils.js';
import type {
  ScannerConfig,
  FoundRecord,
  ScannerProgress,
  AleoBlock,
} from './types.js';

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const ACTIVE_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ?? 'info';

function ts(): string {
  return new Date().toISOString();
}

const log = {
  debug: (msg: string) => {
    if (LOG_LEVELS[ACTIVE_LEVEL] <= LOG_LEVELS.debug)
      process.stdout.write(`[${ts()}] DEBUG ${msg}\n`);
  },
  info: (msg: string) => {
    if (LOG_LEVELS[ACTIVE_LEVEL] <= LOG_LEVELS.info)
      process.stdout.write(`[${ts()}] INFO  ${msg}\n`);
  },
  warn: (msg: string) => {
    if (LOG_LEVELS[ACTIVE_LEVEL] <= LOG_LEVELS.warn)
      process.stderr.write(`[${ts()}] WARN  ${msg}\n`);
  },
  error: (msg: string) => {
    if (LOG_LEVELS[ACTIVE_LEVEL] <= LOG_LEVELS.error)
      process.stderr.write(`[${ts()}] ERROR ${msg}\n`);
  },
};

// ---------------------------------------------------------------------------
// Network defaults
// ---------------------------------------------------------------------------

const NETWORK_BASE_URLS: Record<string, string> = {
  testnet: 'https://api.explorer.provable.com/v1/testnet',
  mainnet: 'https://api.explorer.provable.com/v1/mainnet',
};

// ---------------------------------------------------------------------------
// TypedEventEmitter helper
// ---------------------------------------------------------------------------

// Extend EventEmitter with strongly-typed overloads so callers get
// autocompletion and type safety without third-party dependencies.
export interface RecordScannerEvents {
  /** Emitted for every encrypted record found in a matching transition. */
  record: (record: FoundRecord) => void;
  /** Emitted when a non-fatal or fatal error occurs during scanning. */
  error: (err: Error) => void;
  /** Emitted after each batch with the current scan progress. */
  progress: (progress: ScannerProgress) => void;
}

// ---------------------------------------------------------------------------
// RecordScanner
// ---------------------------------------------------------------------------

/**
 * Scans Aleo blockchain blocks and emits all encrypted records found.
 *
 * Usage:
 * ```ts
 * const scanner = new RecordScanner({ ... });
 * scanner.on('record', (record) => { ... });
 * scanner.on('progress', ({ currentBlock, latestBlock }) => { ... });
 * scanner.on('error', (err) => { ... });
 * await scanner.start();
 * ```
 */
export class RecordScanner extends EventEmitter {
  // -- config ----------------------------------------------------------------
  private readonly programName: string;
  private readonly functionName: string | undefined;
  private readonly pollingInterval: number;
  private readonly batchAmount: number;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly delayBetweenBatches: number;
  private readonly decrypt: boolean;
  private readonly viewKey: string | undefined;

  // -- runtime state ---------------------------------------------------------
  /** The next block height the scanner will process. */
  private currentHeight: number;

  /** Set to true by stop() to break the polling loop. */
  private stopped = false;

  /** Whether start() has been called and not yet resolved/stopped. */
  private running = false;

  // ---------------------------------------------------------------------------

  constructor(config: ScannerConfig) {
    super();

    this.programName = config.programName;
    this.functionName = config.functionName;
    this.pollingInterval = config.pollingInterval;
    this.batchAmount = config.batchAmount;
    this.maxRetries = config.maxRetries ?? 5;
    this.delayBetweenBatches = config.delayBetweenBatches ?? 300;
    this.decrypt = config.decrypt ?? false;
    this.viewKey = config.viewKey;

    const network = config.network ?? 'testnet';
    this.baseUrl =
      config.baseUrl?.replace(/\/$/, '') ??
      NETWORK_BASE_URLS[network] ??
      NETWORK_BASE_URLS['testnet'];

    // currentHeight tracks where we are; initialised from startBlockHeight so
    // that re-calling start() resumes from where we left off.
    this.currentHeight = config.startBlockHeight;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Starts the scanner.  The returned promise resolves only when `stop()` is
   * called; it never rejects (errors are emitted via the "error" event).
   */
  async start(): Promise<void> {
    if (this.running) {
      throw new Error('RecordScanner is already running. Call stop() first.');
    }

    this.running = true;
    this.stopped = false;

    log.info(`Scanner started — program: ${this.programName}${this.functionName ? `, function: ${this.functionName}` : ''}, from block: ${this.currentHeight}`);

    await this.scanLoop();

    log.info('Scanner stopped.');
    this.running = false;
  }

  /**
   * Signals the scanner to stop after the current batch completes.
   */
  stop(): void {
    log.info('Stop signal received — finishing current batch…');
    this.stopped = true;
  }

  // ---------------------------------------------------------------------------
  // Typed EventEmitter overloads
  // ---------------------------------------------------------------------------

  on<K extends keyof RecordScannerEvents>(
    event: K,
    listener: RecordScannerEvents[K],
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof RecordScannerEvents>(
    event: K,
    listener: RecordScannerEvents[K],
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  off<K extends keyof RecordScannerEvents>(
    event: K,
    listener: RecordScannerEvents[K],
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  emit<K extends keyof RecordScannerEvents>(
    event: K,
    ...args: Parameters<RecordScannerEvents[K]>
  ): boolean {
    return super.emit(event, ...args);
  }

  // ---------------------------------------------------------------------------
  // Core scan loop
  // ---------------------------------------------------------------------------

  private async scanLoop(): Promise<void> {
    while (!this.stopped) {
      let latestBlock: number;

      try {
        latestBlock = await this.fetchLatestBlockHeight();
        log.debug(`Chain tip: ${latestBlock}`);
      } catch (err) {
        this.emitError('Failed to fetch latest block height', err);
        log.warn(`Retrying in ${this.pollingInterval}ms…`);
        await sleep(this.pollingInterval);
        continue;
      }

      if (this.currentHeight > latestBlock) {
        log.debug(`At chain tip (${latestBlock}), polling in ${this.pollingInterval}ms…`);
        await sleep(this.pollingInterval);
        continue;
      }

      // Process batches until we catch up to the chain tip or are stopped.
      while (!this.stopped && this.currentHeight <= latestBlock) {
        const batchEnd = Math.min(
          this.currentHeight + this.batchAmount - 1,
          latestBlock,
        );

        let blocks: AleoBlock[];
        log.info("=========================================================");
        log.info(`Fetching records from block ${this.currentHeight} to ${batchEnd} ⏱️⏱️⏱️`);
        const t0 = Date.now();

        try {
          blocks = await this.fetchBlockRange(this.currentHeight, batchEnd);
        } catch (err) {
          this.emitError(
            `Failed to fetch blocks ${this.currentHeight}–${batchEnd}`,
            err,
          );
          log.warn(`Fetch failed for blocks ${this.currentHeight}–${batchEnd}, retrying range…`);
          break;
        }

        const elapsed = Date.now() - t0;
        log.info(`Fetched ${blocks.length} block(s) [${this.currentHeight}–${batchEnd}] in ${elapsed}ms ✅✅✅"`);

        let recordCount = 0;
        for (const block of blocks) {
          if (this.stopped) break;
          const before = recordCount;
          await this.processBlock(block, (n) => { recordCount += n; });
          const found = recordCount - before;
          if (found > 0) {
            log.info(`  Block ${this.extractBlockHeight(block)}: found ${found} record(s)`);
          }
        }

        log.info(`Batch ${this.currentHeight}–${batchEnd} complete — ${recordCount} record(s) emitted 🚀🚀🚀`);

        // Advance height regardless of whether all blocks were processed so we
        // don't get stuck re-fetching a persistently failing range.
        this.currentHeight = batchEnd + 1;

        this.emit('progress', {
          currentBlock: this.currentHeight,
          latestBlock,
        });

        // Respect the configured inter-batch delay.
        if (!this.stopped && this.currentHeight <= latestBlock) {
          await sleep(this.delayBetweenBatches);
        }
      }

      // If we caught up, wait for the polling interval before checking again.
      if (!this.stopped) {
        await sleep(this.pollingInterval);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Block processing
  // ---------------------------------------------------------------------------

  private async processBlock(block: AleoBlock, onRecord?: (n: number) => void): Promise<void> {
    const blockHeight = this.extractBlockHeight(block);

    if (!block.transactions) return;

    for (const confirmedTx of block.transactions) {
      const tx = confirmedTx.transaction;
      if (!tx) continue;

      const txHash = tx.id ?? '';
      const transitions = tx.execution?.transitions ?? [];

      for (const transition of transitions) {
        // Filter by program name (prefix match to handle versioned program IDs)
        if (!transition.program.startsWith(this.programName)) continue;

        // Optionally filter by function name
        if (
          this.functionName !== undefined &&
          transition.function !== this.functionName
        ) {
          continue;
        }

        const outputs = transition.outputs ?? [];

        const encryptedRecords = outputs
          .filter((o) => o.type === 'record' && !!o.value)
          .map((o) => o.value as string);

        if (encryptedRecords.length === 0) continue;

        let decryptedRecords: Record<string, unknown>[] | undefined;

        if (this.decrypt && this.viewKey) {
          decryptedRecords = [];
          for (const enc of encryptedRecords) {
            try {
              decryptedRecords.push(await this.decryptRecord(enc));
            } catch (err) {
              this.emitError(`Failed to decrypt record in tx ${txHash}`, err);
              decryptedRecords.push({});
            }
          }
        }

        const record: FoundRecord = {
          encryptedRecords,
          ...(decryptedRecords !== undefined && { decryptedRecords }),
          txHash,
          programId: transition.program,
          functionName: transition.function,
          blockHeight,
        };

        this.emit('record', record);
        onRecord?.(encryptedRecords.length);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // API calls
  // ---------------------------------------------------------------------------

  /**
   * Fetches blocks in the range [startHeight, endHeight] (inclusive).
   * The Aleo API returns an array of block objects.
   */
  private async fetchBlockRange(
    startHeight: number,
    endHeight: number,
  ): Promise<AleoBlock[]> {
    const url = `${this.baseUrl}/blocks?start=${startHeight}&end=${endHeight}`;
    return fetchWithRetry<AleoBlock[]>(url, this.maxRetries);
  }

  /**
   * Fetches the latest block height from the network.
   */
  private async fetchLatestBlockHeight(): Promise<number> {
    const url = `${this.baseUrl}/latest/height`;
    const height = await fetchWithRetry<number>(url, this.maxRetries);

    if (typeof height !== 'number') {
      throw new TypeError(
        `Expected a number from /latest/height but got: ${JSON.stringify(height)}`,
      );
    }

    return height;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Extracts the numeric block height from a block object.
   *
   * The canonical path is `block.header.metadata.height`.  When that is
   * absent (e.g. partial responses) we return 0 as a safe default.
   */
  private extractBlockHeight(block: AleoBlock): number {
    return block.header?.metadata?.height ?? 0;
  }

  /**
   * Decrypts a single encrypted Aleo record ciphertext using the configured
   * view key.  BigInt values are serialised to strings for JSON compatibility.
   */
  private async decryptRecord(encryptedRecord: string): Promise<Record<string, unknown>> {
    try {
      const { ViewKey, RecordCiphertext } = await ensureWasm();
      const viewKey = ViewKey.from_string(this.viewKey!);
      const plaintext = RecordCiphertext.fromString(encryptedRecord).decrypt(viewKey);
      // toJsObject() returns u128/u64 values as BigInt which JSON.stringify cannot serialize.
      return JSON.parse(
        JSON.stringify(plaintext.toJsObject(), (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
      ) as Record<string, unknown>;
    } catch (error: any) {
      throw new Error(`Failed to decrypt Aleo record: ${error?.message ?? String(error)}`);
    }
  }

  /**
   * Normalises an unknown thrown value into an Error and emits it.
   */
  private emitError(context: string, cause: unknown): void {
    let err: Error;

    if (cause instanceof Error) {
      err = new Error(`${context}: ${cause.message}`);
      err.stack = cause.stack;
    } else {
      err = new Error(`${context}: ${String(cause)}`);
    }

    this.emit('error', err);
  }
}
