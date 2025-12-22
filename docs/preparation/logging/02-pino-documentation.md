# Pino Logger - Complete API Reference and Patterns

## Technology Overview

Pino is a high-performance, JSON-native logging library for Node.js. It prioritizes speed and minimal overhead by outputting newline-delimited JSON (ndjson) and delegating log processing (formatting, transport) to separate worker threads or processes.

**Version Researched**: Pino v8+ (2025)
**Official Repository**: https://github.com/pinojs/pino
**npm Package**: https://www.npmjs.com/package/pino

## Core Features

### Performance

- **5-10x faster** than Winston/Bunyan in benchmarks
- Handles **10,000+ logs per second** with minimal CPU overhead
- Uses **worker threads** (v7+) for transports to avoid blocking the event loop
- Asynchronous by design, minimizing main thread impact

### JSON-Native Structured Logging

- Outputs **newline-delimited JSON** (ndjson) by default
- Each log entry is a valid JSON object
- Easy to parse with log aggregation tools (Elasticsearch, Splunk, Datadog)
- Machine-readable without post-processing

### TypeScript Support

- **Native TypeScript definitions** included in the package
- No need for `@types/pino` (it's a stub package)
- Full type inference for logger methods and options
- Type-safe child loggers and bindings

## Installation

```bash
# Core library
pnpm add pino

# Development-only formatter
pnpm add -D pino-pretty

# HTTP middleware for Express
pnpm add pino-http

# Log rotation (optional)
pnpm add pino-roll
```

## Basic API Reference

### Creating a Logger

```typescript
import pino from 'pino';

// Basic logger
const logger = pino();

// With options
const logger = pino({
  level: 'info',              // Minimum log level
  name: 'my-app',             // Logger name
  timestamp: pino.stdTimeFunctions.isoTime, // ISO 8601 timestamps
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  },
  base: {
    env: process.env.NODE_ENV,
    version: process.env.APP_VERSION
  }
});
```

### Log Levels

Pino supports standard log levels with numeric values:

```typescript
logger.trace('trace message');  // 10
logger.debug('debug message');  // 20
logger.info('info message');    // 30
logger.warn('warn message');    // 40
logger.error('error message');  // 50
logger.fatal('fatal message');  // 60
```

**Custom Levels**:

```typescript
const logger = pino({
  customLevels: {
    foo: 35
  },
  level: 'foo'
});

logger.foo('custom level message');
```

### Logging Methods

```typescript
// Simple message
logger.info('Application started');

// With object (merged into log entry)
logger.info({ user: 'john', action: 'login' }, 'User logged in');

// Error logging
try {
  throw new Error('Something failed');
} catch (err) {
  logger.error(err, 'Error occurred');  // Serializes error with stack
}

// Multiple objects
logger.info({ req, res }, 'Request completed');
```

### Output Format

Default JSON output:

```json
{"level":30,"time":1703251200000,"pid":1234,"hostname":"server","msg":"Application started"}
{"level":30,"time":1703251201000,"pid":1234,"hostname":"server","user":"john","action":"login","msg":"User logged in"}
```

## Transport Configuration

### What are Transports?

Transports are log processors that handle formatting, sending alerts, or writing to different destinations. **Pino recommends running transports in separate processes/threads** to avoid blocking the main application.

### Single Transport

```typescript
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
});
```

### Multiple Transports

```typescript
const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino/file',
        level: 'info',
        options: { destination: './logs/app.log' }
      },
      {
        target: 'pino-pretty',
        level: 'debug',
        options: { colorize: true }
      }
    ]
  }
});
```

### Environment-Based Transport

```typescript
function createLogger() {
  const isDevelopment = process.env.NODE_ENV === 'development';

  return pino({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    transport: isDevelopment ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        ignore: 'pid,hostname',
        translateTime: 'yyyy-mm-dd HH:MM:ss'
      }
    } : undefined  // Raw JSON in production
  });
}
```

## Child Loggers and Bindings

### Creating Child Loggers

Child loggers inherit parent configuration and add contextual bindings:

```typescript
const logger = pino();

// Create child with bindings
const childLogger = logger.child({ requestId: '123', userId: 'john' });

childLogger.info('Processing request');
// Output: {"level":30,"requestId":"123","userId":"john","msg":"Processing request"}

// Nested children
const stepLogger = childLogger.child({ step: 'validation' });
stepLogger.info('Validating input');
// Output: {"level":30,"requestId":"123","userId":"john","step":"validation","msg":"Validating input"}
```

### TypeScript Types for Child Loggers

```typescript
import { Logger, LoggerOptions, Bindings } from 'pino';

function createChildLogger(
  parent: Logger,
  bindings: Bindings
): Logger {
  return parent.child(bindings);
}
```

### Accessing Bindings

```typescript
const child = logger.child({ foo: 'bar', baz: 42 });

console.log(child.bindings());
// Output: { foo: 'bar', baz: 42 }
```

### Bindings vs. Merge Objects

```typescript
// Bindings: permanent context on child logger
const child = logger.child({ service: 'api' });
child.info('msg1');  // { service: 'api', msg: 'msg1' }
child.info('msg2');  // { service: 'api', msg: 'msg2' }

// Merge object: one-time context
logger.info({ service: 'api' }, 'msg1');  // { service: 'api', msg: 'msg1' }
logger.info('msg2');                      // { msg: 'msg2' } (no service)
```

## Configuration Options

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | `'info'` | Minimum log level ('trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent') |
| `name` | string | `undefined` | Logger name, added to all logs |
| `base` | object | `{ pid, hostname }` | Base bindings for all logs |
| `timestamp` | boolean/function | `true` | Include timestamp (use `pino.stdTimeFunctions.isoTime` for ISO 8601) |
| `enabled` | boolean | `true` | Enable/disable logging |
| `transport` | object | `undefined` | Transport configuration |

### Formatters

```typescript
const logger = pino({
  formatters: {
    // Customize log level format
    level: (label, number) => ({ level: label.toUpperCase() }),

    // Customize bindings (pid, hostname)
    bindings: (bindings) => ({
      pid: bindings.pid,
      hostname: bindings.hostname,
      env: process.env.NODE_ENV
    }),

    // Customize log message
    log: (object) => {
      // Modify or redact fields
      if (object.password) {
        object.password = '[REDACTED]';
      }
      return object;
    }
  }
});
```

### Mixin Function

Add dynamic context to every log entry:

```typescript
const logger = pino({
  mixin() {
    return {
      timestamp: Date.now(),
      appVersion: process.env.APP_VERSION
    };
  }
});
```

## Error Serialization

Pino includes a built-in error serializer:

```typescript
try {
  throw new Error('Database connection failed');
} catch (err) {
  logger.error(err, 'Failed to connect');
}

// Output:
{
  "level": 50,
  "time": 1703251200000,
  "type": "Error",
  "message": "Database connection failed",
  "stack": "Error: Database connection failed\n    at ...",
  "msg": "Failed to connect"
}
```

### Custom Serializers

```typescript
const logger = pino({
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: req.headers
    }),
    res: (res) => ({
      statusCode: res.statusCode
    }),
    err: pino.stdSerializers.err  // Use built-in error serializer
  }
});
```

## pino-pretty - Development Formatting

### Installation and Usage

```bash
pnpm add -D pino-pretty
```

```typescript
// In code (development only)
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  }
});
```

### CLI Usage (Piping)

```bash
# Pipe pino output to pino-pretty
node app.js | pino-pretty

# With options
node app.js | pino-pretty --colorize --translateTime 'yyyy-mm-dd HH:MM:ss'
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `colorize` | boolean | `true` | Colorize output |
| `translateTime` | string/boolean | `false` | Format timestamp (e.g., 'yyyy-mm-dd HH:MM:ss') |
| `ignore` | string | `''` | Comma-separated list of keys to ignore |
| `messageFormat` | string/function | `'{msg}'` | Template for message format |
| `levelFirst` | boolean | `false` | Display log level first |
| `destination` | number/string | `1` (stdout) | File descriptor or file path |

### Message Format Templates

```typescript
{
  messageFormat: '{levelLabel} - {pid} - {msg}'
}

// With conditionals
{
  messageFormat: '{levelLabel} - {if pid}{pid} - {end}url:{req.url}'
}
```

### Custom Prettifiers

```typescript
{
  customPrettifiers: {
    time: timestamp => `🕰 ${timestamp}`,
    level: logLevel => `LEVEL: ${logLevel}`,
    requestId: requestId => `[${requestId}]`
  }
}
```

## File Transport

### Basic File Logging

```typescript
const logger = pino({
  transport: {
    target: 'pino/file',
    options: { destination: './logs/app.log' }
  }
});
```

### Dual Output (Console + File)

```typescript
const logger = pino({
  transport: {
    targets: [
      {
        target: 'pino/file',
        level: 'info',
        options: { destination: './logs/app.log' }
      },
      {
        target: 'pino-pretty',
        level: 'debug'
      }
    ]
  }
});
```

## Performance Best Practices

1. **Use transports in worker threads**: Pino v7+ does this automatically
2. **Avoid synchronous logging**: Let Pino handle async writes
3. **Log at appropriate levels**: Use DEBUG for development, INFO+ for production
4. **Don't log sensitive data**: Use serializers to redact fields
5. **Disable pino-pretty in production**: It adds overhead

## Common Patterns

### Singleton Logger

```typescript
// logger.ts
import pino from 'pino';

let logger: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      // ... configuration
    });
  }
  return logger;
}
```

### Request-Scoped Logger

```typescript
// Create child logger per request
app.use((req, res, next) => {
  req.log = logger.child({ requestId: generateId() });
  next();
});

// Use in handlers
app.get('/api/users', (req, res) => {
  req.log.info('Fetching users');
});
```

### Module Logger

```typescript
// user-service.ts
import { getLogger } from './logger';

const logger = getLogger().child({ module: 'user-service' });

export function createUser(data) {
  logger.info({ data }, 'Creating user');
  // ...
}
```

## Sources

- [Pino GitHub Repository](https://github.com/pinojs/pino)
- [Pino API Documentation](https://github.com/pinojs/pino/blob/main/docs/api.md)
- [Pino npm Package](https://www.npmjs.com/package/pino)
- [pino-pretty GitHub](https://github.com/pinojs/pino-pretty)
- [Pino Logger Guide 2025 - SigNoz](https://signoz.io/guides/pino-logger/)
- [Complete Guide to Pino - Better Stack](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [Production-Grade Logging with Pino - Dash0](https://www.dash0.com/guides/logging-in-node-js-with-pino)
- [Pino Logger - Last9](https://last9.io/blog/npm-pino-logger/)
