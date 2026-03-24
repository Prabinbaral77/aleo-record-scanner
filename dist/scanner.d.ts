import { EventEmitter } from 'events';
import type { ScannerConfig, FoundRecord, ScannerProgress } from './types';
export interface RecordScannerEvents {
    /** Emitted for every encrypted record found in a matching transition. */
    record: (record: FoundRecord) => void;
    /** Emitted when a non-fatal or fatal error occurs during scanning. */
    error: (err: Error) => void;
    /** Emitted after each batch with the current scan progress. */
    progress: (progress: ScannerProgress) => void;
}
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
export declare class RecordScanner extends EventEmitter {
    private readonly programName;
    private readonly functionName;
    private readonly pollingInterval;
    private readonly batchAmount;
    private readonly baseUrl;
    private readonly maxRetries;
    private readonly delayBetweenBatches;
    /** The next block height the scanner will process. */
    private currentHeight;
    /** Set to true by stop() to break the polling loop. */
    private stopped;
    /** Whether start() has been called and not yet resolved/stopped. */
    private running;
    constructor(config: ScannerConfig);
    /**
     * Starts the scanner.  The returned promise resolves only when `stop()` is
     * called; it never rejects (errors are emitted via the "error" event).
     */
    start(): Promise<void>;
    /**
     * Signals the scanner to stop after the current batch completes.
     */
    stop(): void;
    on<K extends keyof RecordScannerEvents>(event: K, listener: RecordScannerEvents[K]): this;
    once<K extends keyof RecordScannerEvents>(event: K, listener: RecordScannerEvents[K]): this;
    off<K extends keyof RecordScannerEvents>(event: K, listener: RecordScannerEvents[K]): this;
    emit<K extends keyof RecordScannerEvents>(event: K, ...args: Parameters<RecordScannerEvents[K]>): boolean;
    private scanLoop;
    private processBlock;
    /**
     * Fetches blocks in the range [startHeight, endHeight] (inclusive).
     * The Aleo API returns an array of block objects.
     */
    private fetchBlockRange;
    /**
     * Fetches the latest block height from the network.
     */
    private fetchLatestBlockHeight;
    /**
     * Extracts the numeric block height from a block object.
     *
     * The canonical path is `block.header.metadata.height`.  When that is
     * absent (e.g. partial responses) we return 0 as a safe default.
     */
    private extractBlockHeight;
    /**
     * Normalises an unknown thrown value into an Error and emits it.
     */
    private emitError;
}
//# sourceMappingURL=scanner.d.ts.map