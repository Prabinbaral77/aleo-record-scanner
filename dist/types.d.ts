/**
 * Configuration for the RecordScanner.
 */
export interface ScannerConfig {
    /** Aleo program name to filter transitions by, e.g. "veru_private_000.aleo" */
    programName: string;
    /** Optional function name to further filter transitions, e.g. "transfer_private" */
    functionName?: string;
    /** Block height to start scanning from (inclusive) */
    startBlockHeight: number;
    /** Milliseconds between polls after catching up to chain tip */
    pollingInterval: number;
    /** Number of blocks to fetch per batch request */
    batchAmount: number;
    /** Network to scan; defaults to "testnet" */
    network?: 'testnet' | 'mainnet';
    /** Override the API base URL; if omitted, derived from `network` */
    baseUrl?: string;
    /** Maximum number of HTTP retry attempts on transient failures; defaults to 5 */
    maxRetries?: number;
    /** Milliseconds to wait between consecutive batch fetches; defaults to 300 */
    delayBetweenBatches?: number;
}
/**
 * A record found during scanning that is owned by the configured view key.
 */
export interface FoundRecord {
    /** The encrypted record ciphertext string as returned by the API */
    encryptedRecord: string;
    /** Transaction ID that contains this record */
    txHash: string;
    /** The program ID the transition belongs to */
    programId: string;
    /** The function name of the transition */
    functionName: string;
    /** Block height where this record was found */
    blockHeight: number;
}
/**
 * Progress event payload emitted during scanning.
 */
export interface ScannerProgress {
    /** The block height currently being processed */
    currentBlock: number;
    /** The latest known block height on the network */
    latestBlock: number;
}
/** A single record output inside a transition */
export interface AleoTransitionOutput {
    type: string;
    /** Present when type === "record" */
    value?: string;
}
/** A transition within a transaction execution */
export interface AleoTransition {
    /** Fully-qualified program id, e.g. "token_v1.aleo" */
    program: string;
    /** Function name, e.g. "transfer_private" */
    function: string;
    outputs?: AleoTransitionOutput[];
}
/** The execution body of a transaction */
export interface AleoExecution {
    transitions?: AleoTransition[];
}
/** A raw Aleo transaction */
export interface AleoTransaction {
    id?: string;
    execution?: AleoExecution;
}
/** A confirmed transaction wrapper as returned in block.transactions[] */
export interface AleoConfirmedTransaction {
    type?: string;
    transaction?: AleoTransaction;
}
/** Block header metadata */
export interface AleoBlockHeaderMetadata {
    height?: number;
}
/** Block header */
export interface AleoBlockHeader {
    metadata?: AleoBlockHeaderMetadata;
}
/** A full Aleo block as returned by the /blocks endpoint */
export interface AleoBlock {
    block_hash?: string;
    header?: AleoBlockHeader;
    transactions?: AleoConfirmedTransaction[];
}
//# sourceMappingURL=types.d.ts.map