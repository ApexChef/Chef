# Winston Logger - API Reference and Comparison

## Technology Overview

Winston is a versatile, feature-rich logging library for Node.js. It emphasizes flexibility and configurability, supporting multiple transports, custom formats, and extensive customization options. While slower than Pino, it offers more built-in features out of the box.

**Version Researched**: Winston v3.x (2025)
**Official Repository**: https://github.com/winstonjs/winston
**npm Package**: https://www.npmjs.com/package/winston

## Core Philosophy

Winston is designed to be a **simple and universal logging library** with support for multiple transports. A transport is essentially a storage device for your logs. Each winston logger can have multiple transports configured at different levels.

## Installation

```bash
# Core library
pnpm add winston

# Daily rotation transport
pnpm add winston-daily-rotate-file
```

## Basic API Reference

### Creating a Logger

```typescript
import winston from 'winston';

// Basic logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'app.log' })
  ]
});
```

### Default Logger

**Important**: The default logger doesn't have any transports by default. You need to add transports yourself, and leaving the default logger without transports may produce a high memory usage issue.

```typescript
// Add transports to default logger
winston.add(new winston.transports.Console());
```

## Log Levels

Winston conforms to **RFC5424** severity ordering, with severity numerically ascending from most important to least important.

### npm Levels (default)

```typescript
{
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
}
```

### Using Levels

```typescript
logger.error('Error message');
logger.warn('Warning message');
logger.info('Info message');
logger.http('HTTP request logged');
logger.verbose('Verbose message');
logger.debug('Debug message');
logger.silly('Silly message');
```

## Formats

Formats in Winston are implemented in **logform**, a separate module. Formats can be combined using the `combine()` method.

### Common Formats

```typescript
const { format } = winston;

// Simple format
const logger = winston.createLogger({
  format: format.json()
});

// Combined formats
const logger = winston.createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.splat(),
    format.json()
  )
});

// Colorize for console
const logger = winston.createLogger({
  format: format.combine(
    format.colorize(),
    format.timestamp(),
    format.align(),
    format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
  )
});
```

### Built-in Formats

| Format | Description |
|--------|-------------|
| `format.json()` | JSON output |
| `format.simple()` | Simple text format |
| `format.colorize()` | Colorize log levels |
| `format.timestamp()` | Add timestamp |
| `format.align()` | Align log messages |
| `format.printf()` | Custom format function |
| `format.errors()` | Format error objects with stack traces |
| `format.splat()` | String interpolation (%s, %d, etc.) |
| `format.metadata()` | Extract metadata to separate property |

### Custom Format Example

```typescript
const customFormat = format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

const logger = winston.createLogger({
  format: format.combine(
    format.timestamp(),
    customFormat
  )
});
```

## Transports

### Core Transports

Winston includes several built-in transports:

#### Console Transport

```typescript
new winston.transports.Console({
  level: 'debug',
  format: format.simple()
});
```

#### File Transport

```typescript
new winston.transports.File({
  filename: 'app.log',
  level: 'info',
  maxsize: 5242880, // 5MB
  maxFiles: 5
});
```

#### HTTP Transport

```typescript
new winston.transports.Http({
  host: 'localhost',
  port: 8080,
  path: '/logs'
});
```

#### Stream Transport

```typescript
new winston.transports.Stream({
  stream: process.stderr,
  level: 'error'
});
```

### Multiple Transports

```typescript
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    // Console in development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    // Error logs to separate file
    new winston.transports.File({
      filename: 'error.log',
      level: 'error'
    }),
    // All logs to combined file
    new winston.transports.File({
      filename: 'combined.log'
    })
  ]
});
```

## Child Loggers

Winston supports child loggers with default metadata:

```typescript
const logger = winston.createLogger({
  format: winston.format.json(),
  transports: [new winston.transports.Console()]
});

const childLogger = logger.child({ requestId: '123', service: 'api' });

childLogger.info('Processing request');
// Output: {"level":"info","message":"Processing request","requestId":"123","service":"api"}
```

## Error Handling

```typescript
try {
  throw new Error('Something went wrong');
} catch (err) {
  logger.error('Error occurred', { error: err.message, stack: err.stack });
}

// With format.errors()
const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()]
});

logger.error(new Error('Something went wrong'));
```

## TypeScript Support

Winston requires `@types/winston` for TypeScript:

```bash
pnpm add -D @types/winston
```

```typescript
import { Logger, createLogger, format, transports } from 'winston';

const logger: Logger = createLogger({
  level: 'info',
  format: format.json(),
  transports: [new transports.Console()]
});
```

## Daily Rotation Transport

The `winston-daily-rotate-file` transport handles log rotation based on date, size, and retention policies.

### Installation

```bash
pnpm add winston-daily-rotate-file
```

### Configuration

```typescript
import DailyRotateFile from 'winston-daily-rotate-file';

const transport = new DailyRotateFile({
  filename: 'application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d'
});

const logger = winston.createLogger({
  transports: [transport]
});
```

### Options

| Option | Description |
|--------|-------------|
| `filename` | Log file name (use %DATE% placeholder) |
| `datePattern` | Moment.js date format (default: 'YYYY-MM-DD') |
| `maxSize` | Maximum file size before rotation (e.g., '20m', '100k') |
| `maxFiles` | Maximum files to keep (number or '14d' for 14 days) |
| `zippedArchive` | Compress rotated files (boolean) |

### Events

```typescript
transport.on('error', (err) => {
  console.error('Logging error:', err);
});

transport.on('rotate', (oldFilename, newFilename) => {
  console.log('Log file rotated:', oldFilename, '->', newFilename);
});
```

**Important**: Starting with version 5.0.0, this module emits an "error" event for filesystem errors. **Always listen for this event** to prevent crashes.

## Environment-Based Configuration

```typescript
function createLogger() {
  const isDevelopment = process.env.NODE_ENV === 'development';

  const transports = [
    new winston.transports.Console({
      format: isDevelopment
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          )
        : winston.format.json()
    })
  ];

  if (!isDevelopment) {
    transports.push(
      new winston.transports.File({
        filename: 'error.log',
        level: 'error'
      }),
      new winston.transports.File({
        filename: 'combined.log'
      })
    );
  }

  return winston.createLogger({
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
    format: winston.format.json(),
    transports
  });
}
```

## Performance Considerations

### Winston vs Pino

- **Winston**: Synchronous by default, can be configured for async
- **Pino**: Asynchronous by design, 5-10x faster in benchmarks
- **Use case**: Winston for flexibility, Pino for performance

### Optimization Tips

1. Avoid excessive logging in production
2. Use appropriate log levels
3. Configure transports to write asynchronously when possible
4. Avoid complex format functions in hot paths

## Best Practices

### 1. Use Different Log Levels

```typescript
logger.debug('Detailed diagnostic information');
logger.info('General operational messages');
logger.warn('Warning conditions');
logger.error('Error conditions');
```

### 2. Add Contextual Information

```typescript
logger.info('User logged in', {
  userId: user.id,
  ip: req.ip,
  timestamp: new Date()
});
```

### 3. Configure Log Rotation

```typescript
const transport = new DailyRotateFile({
  filename: 'application-%DATE%.log',
  datePattern: 'YYYY-MM-DD-HH',
  maxSize: '20m',
  maxFiles: '14d'
});
```

### 4. Handle Transport Errors

```typescript
transport.on('error', (error) => {
  console.error('Logging transport error:', error);
});
```

### 5. Avoid Logging Sensitive Data

```typescript
// Bad
logger.info({ password: user.password, token: apiToken });

// Good
logger.info({ userId: user.id, action: 'login' });
```

## Common Patterns

### Singleton Logger

```typescript
// logger.ts
import winston from 'winston';

let logger: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (!logger) {
    logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.json(),
      transports: [new winston.transports.Console()]
    });
  }
  return logger;
}
```

### Request Logger

```typescript
import expressWinston from 'express-winston';

app.use(expressWinston.logger({
  transports: [
    new winston.transports.Console()
  ],
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.json()
  ),
  meta: true,
  msg: "HTTP {{req.method}} {{req.url}}",
  expressFormat: true,
  colorize: false
}));
```

## Comparison with Pino

| Feature | Winston | Pino |
|---------|---------|------|
| Performance | Moderate | 5-10x faster |
| Default Output | Configurable | JSON only |
| Transports | Sync by default | Worker threads (v7+) |
| TypeScript | Requires @types | Native types |
| Flexibility | High | Moderate |
| Bundle Size | ~10MB | ~5MB |
| Learning Curve | Steeper | Simpler |
| Best For | Flexibility, features | Performance, CLI tools |

## When to Choose Winston

- You need extensive customization
- You require specific transport features not available in Pino
- Your team is already familiar with Winston
- Performance is not the primary concern
- You need synchronous logging guarantees

## When to Choose Pino

- Performance is critical (CLI tools, high-throughput apps)
- You prefer JSON-native structured logging
- You want minimal overhead and bundle size
- You're building new projects without Winston dependencies

## Sources

- [Winston GitHub Repository](https://github.com/winstonjs/winston)
- [Winston npm Package](https://www.npmjs.com/package/winston)
- [Winston Transports Documentation](https://github.com/winstonjs/winston/blob/master/docs/transports.md)
- [winston-daily-rotate-file GitHub](https://github.com/winstonjs/winston-daily-rotate-file)
- [winston-daily-rotate-file npm](https://www.npmjs.com/package/winston-daily-rotate-file)
- [Complete Guide to Winston - Better Stack](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-winston-and-morgan-to-log-node-js-applications/)
- [Production Winston Logging - Last9](https://last9.io/blog/winston-logging-in-nodejs/)
- [Winston Logger Tutorial - SigNoz](https://signoz.io/blog/winston-logger/)
- [Step-by-Step Winston Guide - Infraspec](https://www.infraspec.dev/blog/guide-to-implement-winston-logger/)
