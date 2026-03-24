# Aleo Record Scanner

A config-driven TypeScript package for scanning the Aleo blockchain and surfacing encrypted records from program transitions. Perfect for building indexers, monitoring applications, and data pipelines on top of Aleo.

> **Note:** This package surfaces **raw encrypted record ciphertexts** as found on-chain. It does **not** perform view-key verification or record decryption.

## Features

- **Encrypted Record Surfacing**: Emits every encrypted record found in matching program transitions
- **Batch Processing**: Efficiently scan large block ranges with configurable batch sizes
- **Event-Driven**: Receive real-time notifications via a typed event emitter
- **Retry Logic**: Built-in retry with exponential backoff on transient API failures
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
  pollingInterval: 5000,   // Poll every 5 seconds
  batchAmount: 100,        // Process 100 blocks at a time
  network: 'testnet'       // or 'mainnet'
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

### Optional Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `functionName` | `string` | `undefined` | Filter transitions by function name (e.g., `"transfer_private"`) |
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
  batchAmount: 50
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
  baseUrl: 'https://custom-aleo-api.com/v1'
};
```

## Records

### Understanding Records

When the scanner finds an encrypted record in a matching transition, it emits a `record` event with a `FoundRecord` object:

```typescript
interface FoundRecord {
  encryptedRecord: string;  // The encrypted record ciphertext as returned by the API
  txHash: string;           // Transaction ID containing the record
  programId: string;        // Program ID the transition belongs to
  functionName: string;     // Function name of the transition
  blockHeight: number;      // Block height where the record was found
}
```

The `encryptedRecord` is the raw ciphertext string from the chain. Decryption (e.g. using a view key) is left to the consumer.

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

Creates a new scanner instance with the provided configuration.

#### Methods

##### `async start(): Promise<void>`

Starts the scanner. The returned promise resolves only when `stop()` is called; it never rejects (errors are emitted via the `"error"` event).

Throws if the scanner is already running.

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

Emitted for every encrypted record found in a matching transition.

```typescript
scanner.on('record', (record: FoundRecord) => {
  console.log('Found record:', record);
});
```

##### `progress`

Emitted after each batch with the current scan progress.

```typescript
scanner.on('progress', (progress: ScannerProgress) => {
  const pct = ((progress.currentBlock / progress.latestBlock) * 100).toFixed(2);
  console.log(`Progress: ${pct}% (Block ${progress.currentBlock}/${progress.latestBlock})`);
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

### Example 1: Simple Record Tracker

```typescript
import { RecordScanner } from 'aleo-record-scanner';

async function trackRecords() {
  const scanner = new RecordScanner({
    programName: 'token.aleo',
    startBlockHeight: 100000,
    pollingInterval: 5000,
    batchAmount: 50,
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
    batchAmount: 100
  });

  scanner.on('record', (record) => {
    console.log('Found record at block', record.blockHeight);
  });

  scanner.on('progress', ({ currentBlock }) => {
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
      batchAmount: 50
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
    await Promise.all(this.scanners.map(s => s.start()));
  }

  stopAll() {
    this.scanners.forEach(s => s.stop());
  }
}

const multiScanner = new MultiProgramScanner();
multiScanner.addProgram('token_v1.aleo');
multiScanner.addProgram('nft_collection.aleo');
await multiScanner.startAll();
```

## Error Handling

The scanner emits errors via the `error` event and continues scanning, making it resilient for long-running processes.

### Common Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| "Failed to fetch latest block height" | Network or API issue | Retries with backoff, then re-polls |
| "Failed to fetch blocks X–Y" | Temporary API failure | Breaks inner loop, retries the range |

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

This package is fully typed and exports all public types:

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

- **axios** (^1.6.0): HTTP client for Aleo REST API requests

## License

MIT © [Prabin Baral](https://prabinbaral.com.np)

## Contributing

Contributions are welcome! Please ensure:
- Code is TypeScript with proper type safety
- All public APIs are documented
- No breaking changes without discussion

## Support

For issues, questions, or feature requests, open an issue on [GitHub](https://github.com/Prabinbaral77/aleo-record-scanner/issues).
