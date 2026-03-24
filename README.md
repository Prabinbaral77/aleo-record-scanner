# Aleo Record Scanner

A high-performance, config-driven TypeScript package for scanning the Aleo blockchain and detecting records owned by a specific view key. Perfect for building wallets, monitoring applications, and privacy-preserving data indexers.

## Features

- **View Key Verification**: Cryptographically verify record ownership using Aleo view keys
- **Batch Processing**: Efficiently scan large block ranges with configurable batch sizes
- **Event-Driven**: Receive real-time notifications via a typed event emitter
- **Rate Limiting**: Built-in intelligent retry logic with exponential backoff
- **Network Flexibility**: Support for testnet and mainnet (extensible to custom networks)
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
  programName: 'veru_private_000.aleo',
  startBlockHeight: 0,
  pollingInterval: 5000,        // Poll every 5 seconds
  batchAmount: 100,             // Process 100 blocks at a time
  viewKey: 'AViewKey1...',      // Your Aleo view key
  network: 'testnet'            // or 'mainnet'
});

// Listen for found records
scanner.on('record', (record) => {
  console.log('Found record:', record);
});

// Monitor progress
scanner.on('progress', ({ currentBlock, latestBlock }) => {
  console.log(`Progress: ${currentBlock}/${latestBlock}`);
});

// Handle errors
scanner.on('error', (err) => {
  console.error('Scanner error:', err);
});

// Start scanning
await scanner.start();
```

## Configuration

Create a `ScannerConfig` object with the following properties:

### Required Properties

| Property | Type | Description |
|----------|------|-------------|
| `programName` | `string` | Aleo program name to filter transitions by (e.g., `"veru_private_000.aleo"`) |
| `startBlockHeight` | `number` | Block height to start scanning from (inclusive) |
| `pollingInterval` | `number` | Milliseconds between polls after catching up to chain tip |
| `batchAmount` | `number` | Number of blocks to fetch per batch request |
| `viewKey` | `string` | Aleo view key string used to verify record ownership |

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `functionName` | `string` | `undefined` | Optional function name to further filter transitions (e.g., `"transfer_private"`) |
| `network` | `'testnet' \| 'mainnet'` | `'testnet'` | Network to scan |
| `baseUrl` | `string` | Derived from `network` | Override the API base URL |
| `maxRetries` | `number` | `5` | Maximum number of HTTP retry attempts on transient failures |
| `delayBetweenBatches` | `number` | `300` | Milliseconds to wait between consecutive batch fetches |

### Configuration Examples

#### Testnet Scanner (Basic)

```typescript
const config = {
  programName: 'token_v1.aleo',
  startBlockHeight: 0,
  pollingInterval: 5000,
  batchAmount: 50,
  viewKey: 'AViewKey1xyz...'
  // Uses testnet by default
};
```

#### Mainnet Scanner with Function Filter

```typescript
const config = {
  programName: 'veru_private_000.aleo',
  functionName: 'transfer_private',
  startBlockHeight: 156000,
  pollingInterval: 10000,
  batchAmount: 100,
  viewKey: 'AViewKey1xyz...',
  network: 'mainnet',
  maxRetries: 10,
  delayBetweenBatches: 500
};
```

#### Custom Network

```typescript
const config = {
  programName: 'my_program.aleo',
  startBlockHeight: 0,
  pollingInterval: 3000,
  batchAmount: 25,
  viewKey: 'AViewKey1xyz...',
  baseUrl: 'https://custom-aleo-api.com/v1'
};
```

## Getting Records

### Understanding Records

When the scanner detects a record owned by your view key, it emits a `record` event with a `FoundRecord` object containing:

```typescript
interface FoundRecord {
  encryptedRecord: string;  // The encrypted record ciphertext
  txHash: string;           // Transaction ID containing the record
  programId: string;        // Program ID the transition belongs to
  functionName: string;     // Function name of the transition
  blockHeight: number;      // Block height where the record was found
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

// After scanning completes, use foundRecords
console.log(`Total records found: ${foundRecords.length}`);
```

### Filtering Records During Scan

```typescript
scanner.on('record', (record) => {
  // Only process specific programs
  if (record.programId === 'important_program.aleo') {
    handleRecord(record);
  }
});
```

### Persisting Records

```typescript
import * as fs from 'fs';

const recordStore: FoundRecord[] = [];

scanner.on('record', (record) => {
  recordStore.push(record);
  
  // Append to file for durability
  fs.appendFileSync(
    'records.jsonl',
    JSON.stringify(record) + '\n'
  );
});
```

## API Reference

### RecordScanner Class

#### Constructor

```typescript
constructor(config: ScannerConfig)
```

Creates a new instance of the record scanner with the provided configuration.

#### Methods

##### `async start(): Promise<void>`

Starts the scanner. The returned promise resolves only when `stop()` is called; it never rejects (errors are emitted via the `"error"` event).

Throws an error if the scanner is already running.

```typescript
const scanner = new RecordScanner(config);
const scanTask = scanner.start();

// Stop it later
scanner.stop();
await scanTask;
```

##### `stop(): void`

Signals the scanner to stop after the current batch completes.

```typescript
scanner.stop();
```

#### Events

##### `record`

Emitted whenever a record owned by the configured view key is found.

```typescript
scanner.on('record', (record: FoundRecord) => {
  console.log('Found record:', record);
});
```

##### `progress`

Emitted after each batch with the current scan progress.

```typescript
scanner.on('progress', (progress: ScannerProgress) => {
  console.log(`Current block: ${progress.currentBlock}`);
  console.log(`Latest block: ${progress.latestBlock}`);
  console.log(`Progress: ${(progress.currentBlock / progress.latestBlock * 100).toFixed(2)}%`);
});
```

##### `error`

Emitted when a non-fatal or fatal error occurs during scanning.

```typescript
scanner.on('error', (err: Error) => {
  console.error('Scanner encountered an error:', err.message);
  // Errors don't stop the scanner; it will attempt to recover
});
```

## Usage Examples

### Example 1: Simple Record Tracker

```typescript
import { RecordScanner } from 'aleo-record-scanner';

async function trackRecords() {
  const scanner = new RecordScanner({
    programName: 'token.aleo',
    startBlockHeight: 100000,
    pollingInterval: 5000,
    batchAmount: 50,
    viewKey: process.env.ALEO_VIEW_KEY!,
    network: 'mainnet'
  });

  let recordCount = 0;

  scanner.on('record', (record) => {
    recordCount++;
    console.log(`[${new Date().toISOString()}] Record #${recordCount}: ${record.txHash}`);
  });

  scanner.on('progress', ({ currentBlock, latestBlock }) => {
    const pct = ((currentBlock / latestBlock) * 100).toFixed(1);
    console.log(`Progress: ${pct}% (Block ${currentBlock}/${latestBlock})`);
  });

  scanner.on('error', (err) => {
    console.error('Error:', err.message);
  });

  await scanner.start();
}

trackRecords().catch(console.error);
```

### Example 2: Resume from Checkpoint

```typescript
import * as fs from 'fs';
import { RecordScanner } from 'aleo-record-scanner';

async function resumeScanning() {
  // Load checkpoint
  let lastBlock = 0;
  if (fs.existsSync('checkpoint.json')) {
    const checkpoint = JSON.parse(fs.readFileSync('checkpoint.json', 'utf-8'));
    lastBlock = checkpoint.blockHeight;
    console.log(`Resuming from block ${lastBlock}`);
  }

  const scanner = new RecordScanner({
    programName: 'myprogram.aleo',
    startBlockHeight: lastBlock,
    pollingInterval: 5000,
    batchAmount: 100,
    viewKey: process.env.VIEW_KEY!
  });

  scanner.on('record', (record) => {
    console.log('Found record at block', record.blockHeight);
  });

  scanner.on('progress', ({ currentBlock }) => {
    // Save checkpoint after every progress event
    fs.writeFileSync(
      'checkpoint.json',
      JSON.stringify({ blockHeight: currentBlock }, null, 2)
    );
  });

  scanner.on('error', (err) => {
    console.error('Scan error:', err);
  });

  await scanner.start();
}

resumeScanning().catch(console.error);
```

### Example 3: Multi-Program Scanner

```typescript
import { RecordScanner } from 'aleo-record-scanner';

class MultiProgramScanner {
  private scanners: RecordScanner[] = [];

  addProgram(programName: string) {
    const scanner = new RecordScanner({
      programName,
      startBlockHeight: 0,
      pollingInterval: 5000,
      batchAmount: 50,
      viewKey: process.env.VIEW_KEY!
    });

    scanner.on('record', (record) => {
      console.log(`[${programName}] Record found: ${record.txHash}`);
    });

    scanner.on('error', (err) => {
      console.error(`[${programName}] Error: ${err.message}`);
    });

    this.scanners.push(scanner);
  }

  async startAll() {
    await Promise.all(
      this.scanners.map(scanner => scanner.start())
    );
  }

  stopAll() {
    this.scanners.forEach(scanner => scanner.stop());
  }
}

// Usage
const multiScanner = new MultiProgramScanner();
multiScanner.addProgram('token_v1.aleo');
multiScanner.addProgram('nft_collection.aleo');
await multiScanner.startAll();
```

## Error Handling

The scanner emits errors via the `error` event but continues scanning. This allows for resilient, long-running processes:

```typescript
scanner.on('error', (err) => {
  console.error('Transient error (scanner will retry):', err.message);
  
  // Log for monitoring
  if (err.message.includes('rate limited')) {
    console.log('API rate limit reached, backing off...');
  }
});
```

### Common Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| "Failed to fetch latest block height" | Network or API issue | Retries with exponential backoff |
| "Failed to fetch blocks X–Y" | Temporary API failure | Breaks inner loop, retries the range |
| "Failed to initialise @provablehq/wasm" | WASM module loading failed | Scan stops, error emitted |

## Building from Source

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Rebuild on file changes
npm run build:watch

# Clean build artifacts
npm run clean
```

## TypeScript Support

This package is fully typed and includes type definitions for all exported APIs:

```typescript
import {
  RecordScanner,
  RecordScannerEvents,
  ScannerConfig,
  FoundRecord,
  ScannerProgress
} from 'aleo-record-scanner';
```

## Dependencies

- **@provablehq/wasm** (^0.7.0): WASM module for cryptographic operations and record verification
- **axios** (^1.6.0): HTTP client for API requests

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- Code is TypeScript with proper type safety
- All public APIs are documented
- No breaking changes without discussion

## Support

For issues, questions, or feature requests, please refer to the project repository or create an issue on GitHub.
