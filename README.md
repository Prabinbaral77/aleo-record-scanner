# Aleo Record Scanner

A config-driven TypeScript package for scanning the Aleo blockchain and surfacing encrypted (and optionally decrypted) records from program transitions. Perfect for building indexers, monitoring applications, and data pipelines on top of Aleo.

## Features

- **Multi-Program Filtering**: Scan multiple programs and functions in a single scanner instance
- **Encrypted Record Surfacing**: Emits every encrypted record found in matching program transitions
- **Optional Decryption**: Decrypt records on-the-fly using an Aleo view key
- **Batch Processing**: Efficiently scan large block ranges with configurable batch sizes
- **Event-Driven**: Receive real-time notifications via a typed event emitter
- **Retry Logic**: Built-in retry with exponential backoff on transient API failures
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Progressive Scanning**: Resume scanning from any block height
- **Configurable Polling**: Automatic detection of new blocks with adjustable polling intervals

## Installation

```bash
npm install aleo-record-scanner
```

**Requirements**:
- Node.js >= 18.0.0
- npm >= 7.0.0

## Quick Start

### Basic Usage

```typescript
import { RecordScanner } from 'aleo-record-scanner';

const scanner = new RecordScanner({
  baseUrl: 'https://api.explorer.provable.com/v1/testnet',
  programs: [
    { programName: 'token_v1.aleo', functionNames: ['transfer_private'] }
  ],
  startBlockHeight: 0,
  pollingInterval: 5000,  // Poll every 5 seconds
  batchAmount: 100        // Process 100 blocks at a time
});

scanner.on('record', (record) => {
  console.log('Found record:', record);
});

scanner.on('progress', ({ currentBlock, latestBlock }) => {
  console.log(`Progress: ${currentBlock}/${latestBlock}`);
});

scanner.on('error', (err) => {
  console.error('Scanner error:', err);
});

await scanner.start();
```

## Configuration

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `programs` | `ProgramFilter[]` | One or more program/function filters (see below) |
| `baseUrl` | `string` | RPC base URL of the Aleo node to query |
| `startBlockHeight` | `number` | Block height to start scanning from (inclusive) |
| `pollingInterval` | `number` | Milliseconds between polls after catching up to chain tip |
| `batchAmount` | `number` | Number of blocks to fetch per batch request |

### ProgramFilter

Each entry in `programs` describes one program to watch:

| Property | Type | Description |
|----------|------|-------------|
| `programName` | `string` | Aleo program name (prefix match), e.g. `"token_v1.aleo"` |
| `functionNames` | `string[]` | *(optional)* Function names to include. If omitted, all functions are included |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `maxRetries` | `number` | `5` | Maximum HTTP retry attempts on transient failures |
| `delayBetweenBatches` | `number` | `300` | Milliseconds to wait between consecutive batch fetches |
| `decrypt` | `boolean` | `false` | When `true`, decrypt records using `viewKey` before emitting |
| `viewKey` | `string` | `undefined` | Aleo view key required when `decrypt` is `true` |

### Configuration Examples

#### Single Program, Single Function

```typescript
const config = {
  baseUrl: 'https://api.explorer.provable.com/v1/testnet',
  programs: [
    { programName: 'token_v1.aleo', functionNames: ['transfer_private'] }
  ],
  startBlockHeight: 0,
  pollingInterval: 5000,
  batchAmount: 50
};
```

#### Multiple Programs, Multiple Functions

```typescript
const config = {
  baseUrl: 'https://api.explorer.provable.com/v1/mainnet',
  programs: [
    { programName: 'abc.aleo', functionNames: ['aaa', 'bbb'] },
    { programName: 'zyx.aleo', functionNames: ['xyz'] }
  ],
  startBlockHeight: 156000,
  pollingInterval: 10000,
  batchAmount: 100,
  maxRetries: 10,
  delayBetweenBatches: 500
};
```

#### Scan All Functions of a Program

```typescript
// Omit functionNames to match every function in the program
const config = {
  baseUrl: 'https://api.explorer.provable.com/v1/testnet',
  programs: [
    { programName: 'my_program.aleo' }
  ],
  startBlockHeight: 0,
  pollingInterval: 3000,
  batchAmount: 25
};
```

#### With Record Decryption

When `decrypt` is `true` and a `viewKey` is provided, every encrypted record is
decrypted before being emitted. The `FoundRecord` will contain both
`encryptedRecords` and `decryptedRecords`.

```typescript
const config = {
  baseUrl: 'https://api.explorer.provable.com/v1/testnet',
  programs: [
    { programName: 'token_v1.aleo', functionNames: ['transfer_private'] }
  ],
  startBlockHeight: 0,
  pollingInterval: 5000,
  batchAmount: 50,
  decrypt: true,
  viewKey: 'AViewKey1...'  // your Aleo view key
};

const scanner = new RecordScanner(config);

scanner.on('record', (record) => {
  console.log('Encrypted:', record.encryptedRecords);
  console.log('Decrypted:', record.decryptedRecords); // populated when decrypt: true
});

await scanner.start();
```

> **Note:** If a record cannot be decrypted with the provided view key (i.e. it
> belongs to a different address), decryption fails silently for that record and
> an `error` event is emitted. The scanner continues processing.

## Records

### FoundRecord Shape

```typescript
interface FoundRecord {
  /** All encrypted record ciphertexts from the transition */
  encryptedRecords: string[];

  /**
   * Decrypted plaintext records — only present when `decrypt: true`
   * and a valid `viewKey` is configured.
   */
  decryptedRecords?: Record<string, unknown>[];

  txHash: string;       // Transaction ID containing the record
  programId: string;    // Program ID the transition belongs to
  functionName: string; // Function name of the transition
  blockHeight: number;  // Block height where the record was found
}
```

### Collecting Records

```typescript
const foundRecords: FoundRecord[] = [];

scanner.on('record', (record) => {
  foundRecords.push(record);
  console.log(`Found ${foundRecords.length} record(s):`, record.txHash);
});

await scanner.start();
console.log(`Total records found: ${foundRecords.length}`);
```

### Persisting Records

```typescript
import * as fs from 'fs';

scanner.on('record', (record) => {
  fs.appendFileSync('records.jsonl', JSON.stringify(record) + '\n');
});
```

## API Reference

### RecordScanner Class

#### Constructor

```typescript
constructor(config: ScannerConfig)
```

#### Methods

##### `async start(): Promise<void>`

Starts the scanner. Resolves only when `stop()` is called. Never rejects — errors are emitted via the `"error"` event. Throws if the scanner is already running.

##### `stop(): void`

Signals the scanner to stop after the current batch completes.

```typescript
const scanTask = scanner.start();
setTimeout(() => scanner.stop(), 60_000);
await scanTask;
```

#### Events

##### `record`

Emitted for every encrypted record found in a matching transition.

```typescript
scanner.on('record', (record: FoundRecord) => {
  console.log('Found record:', record);
});
```

##### `progress`

Emitted after each batch with the current scan progress.

```typescript
scanner.on('progress', ({ currentBlock, latestBlock }: ScannerProgress) => {
  const pct = ((currentBlock / latestBlock) * 100).toFixed(2);
  console.log(`Progress: ${pct}% (Block ${currentBlock}/${latestBlock})`);
});
```

##### `error`

Emitted on non-fatal or fatal errors. The scanner attempts to recover and continue.

```typescript
scanner.on('error', (err: Error) => {
  console.error('Scanner error:', err.message);
});
```

## Usage Examples

### Example 1: Multi-Program Scanner with Decryption

```typescript
import { RecordScanner } from 'aleo-record-scanner';

const scanner = new RecordScanner({
  baseUrl: 'https://api.explorer.provable.com/v1/mainnet',
  programs: [
    { programName: 'abc.aleo', functionNames: ['aaa', 'bbb'] },
    { programName: 'zyx.aleo', functionNames: ['xyz'] }
  ],
  startBlockHeight: 100000,
  pollingInterval: 5000,
  batchAmount: 50,
  decrypt: true,
  viewKey: 'AViewKey1...'
});

scanner.on('record', (record) => {
  console.log(`[${record.programId}::${record.functionName}] tx: ${record.txHash}`);
  console.log('  Encrypted:', record.encryptedRecords);
  console.log('  Decrypted:', record.decryptedRecords);
});

scanner.on('progress', ({ currentBlock, latestBlock }) => {
  console.log(`${currentBlock}/${latestBlock}`);
});

scanner.on('error', (err) => {
  console.error('Error:', err.message);
});

await scanner.start();
```

### Example 2: Resume from Checkpoint

```typescript
import * as fs from 'fs';
import { RecordScanner } from 'aleo-record-scanner';

let lastBlock = 0;
if (fs.existsSync('checkpoint.json')) {
  const checkpoint = JSON.parse(fs.readFileSync('checkpoint.json', 'utf-8'));
  lastBlock = checkpoint.blockHeight;
  console.log(`Resuming from block ${lastBlock}`);
}

const scanner = new RecordScanner({
  baseUrl: 'https://api.explorer.provable.com/v1/testnet',
  programs: [{ programName: 'myprogram.aleo' }],
  startBlockHeight: lastBlock,
  pollingInterval: 5000,
  batchAmount: 100
});

scanner.on('record', (record) => {
  console.log('Found record at block', record.blockHeight);
});

scanner.on('progress', ({ currentBlock }) => {
  fs.writeFileSync('checkpoint.json', JSON.stringify({ blockHeight: currentBlock }, null, 2));
});

scanner.on('error', (err) => {
  console.error('Scan error:', err);
});

await scanner.start();
```

## Error Handling

The scanner emits errors via the `error` event and continues scanning, making it resilient for long-running processes.

| Error | Cause | Recovery |
|-------|-------|----------|
| "Failed to fetch latest block height" | Network or API issue | Retries with backoff, then re-polls |
| "Failed to fetch blocks X–Y" | Temporary API failure | Breaks inner loop, retries the range |
| "Failed to decrypt record in tx …" | View key mismatch or corrupt ciphertext | Emits error, inserts `{}` placeholder, continues |

## TypeScript Support

All public types are exported:

```typescript
import {
  RecordScanner,
  RecordScannerEvents,
  ScannerConfig,
  ProgramFilter,
  FoundRecord,
  ScannerProgress
} from 'aleo-record-scanner';
```

## Building from Source

```bash
npm install
npm run build
npm run build:watch  # rebuild on file changes
npm run clean
```

## License

MIT © [Prabin Baral](https://prabinbaral.com.np)

## Support

For issues, questions, or feature requests, open an issue on [GitHub](https://github.com/Prabinbaral77/aleo-record-scanner/issues).
