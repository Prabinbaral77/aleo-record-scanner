/**
 * Describes which program and (optionally) which function names to scan.
 *
 * @example
 * // Scan all functions of a program
 * { programName: 'token.aleo' }
 *
 * @example
 * // Scan only specific functions
 * { programName: 'token.aleo', functionNames: ['transfer_private', 'mint'] }
 */
export interface ProgramFilter {
  /** Aleo program name (prefix match), e.g. "token_v1.aleo" */
  programName: string;

  /**
   * Function names to include.  When omitted or empty, all functions of
   * the program are included.
   */
  functionNames?: string[];
}

/**
 * Configuration for the RecordScanner.
 */
export interface ScannerConfig {
  /**
   * One or more program/function filters.
   *
   * @example
   * programs: [
   *   { programName: 'abc.aleo', functionNames: ['aaa', 'bbb'] },
   *   { programName: 'zyx.aleo', functionNames: ['xyz'] },
   * ]
   */
  programs: ProgramFilter[];

  /** Block height to start scanning from (inclusive) */
  startBlockHeight: number;

  /** Milliseconds between polls after catching up to chain tip */
  pollingInterval: number;

  /** Number of blocks to fetch per batch request */
  batchAmount: number;

  /**
   * RPC base URL for the Aleo node to query.
   * @example 'https://api.explorer.provable.com/v1/testnet'
   */
  baseUrl: string;

  /** Maximum number of HTTP retry attempts on transient failures; defaults to 5 */
  maxRetries?: number;

  /** Milliseconds to wait between consecutive batch fetches; defaults to 300 */
  delayBetweenBatches?: number;

  /**
   * When true, encrypted records are decrypted using `viewKey` before being
   * emitted.  Requires `viewKey` to be set.
   */
  decrypt?: boolean;

  /**
   * Aleo view key used to decrypt records.  Required when `decrypt` is true.
   * Example: "AViewKey1..."
   */
  viewKey?: string;
}

/**
 * A record found during scanning. All encrypted output records from a single
 * transition are grouped together in one `FoundRecord`.
 */
export interface FoundRecord {
  /** All encrypted record ciphertext strings produced by this transition */
  encryptedRecords: string[];

  /**
   * Decrypted plaintext records corresponding to `encryptedRecords`.
   * Only populated when `decrypt: true` and a `viewKey` is provided in config.
   */
  decryptedRecords?: Record<string, unknown>[];

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

// ---------------------------------------------------------------------------
// Internal types modelling the Aleo REST API response shapes.
// Only the fields actually used by the scanner are declared here.
// ---------------------------------------------------------------------------

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
