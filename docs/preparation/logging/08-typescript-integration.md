# TypeScript Integration with Pino

## Overview

Pino provides native TypeScript support with full type definitions included in the package. This document covers TypeScript-specific patterns, types, and best practices for using Pino in TypeScript projects.

## Type Definitions

### No @types Package Needed

Pino includes TypeScript definitions natively:

```bash
pnpm add pino
# No need for: pnpm add -D @types/pino
```

**Note**: `@types/pino` is a stub package that redirects to Pino's native types.

## Basic Usage

### Importing Types

```typescript
import pino, { Logger, LoggerOptions, Bindings } from 'pino';

const logger: Logger = pino();
```

### Logger Options

```typescript
import pino, { LoggerOptions } from 'pino';

const options: LoggerOptions = {
  level: 'info',
  name: 'my-app',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label.toUpperCase() })
  }
};

const logger = pino(options);
```

## Typed Child Loggers

### Basic Child Logger

```typescript
import { Logger, Bindings } from 'pino';

const logger = pino();

const bindings: Bindings = {
  requestId: '123',
  userId: 'john'
};

const childLogger: Logger = logger.child(bindings);
```

### Child Logger Function

```typescript
import { Logger, Bindings } from 'pino';

function createChildLogger(
  parent: Logger,
  bindings: Bindings
): Logger {
  return parent.child(bindings);
}

// Usage
const requestLogger = createChildLogger(logger, { requestId: '123' });
```

### TypeScript Signature

From `pino.d.ts`:

```typescript
child<ChildCustomLevels extends string = never>(
  bindings: Bindings,
  options?: ChildLoggerOptions<ChildCustomLevels>
): Logger<CustomLevels | ChildCustomLevels>
```

## Structured Logging with Types

### Define Log Context Interfaces

```typescript
interface UserContext {
  userId: string;
  email: string;
  role: string;
}

interface RequestContext {
  requestId: string;
  method: string;
  url: string;
  statusCode?: number;
}

interface ErrorContext {
  errorCode: string;
  errorMessage: string;
  stack?: string;
}

// Usage
logger.info<UserContext>({ userId: '123', email: 'john@example.com', role: 'admin' }, 'User logged in');
logger.info<RequestContext>({ requestId: 'abc', method: 'GET', url: '/api/users' }, 'Request received');
logger.error<ErrorContext>({ errorCode: 'DB_ERROR', errorMessage: 'Connection failed' }, 'Database error');
```

### Generic Logging Function

```typescript
function logEvent<T extends Record<string, any>>(
  logger: Logger,
  level: 'info' | 'warn' | 'error',
  context: T,
  message: string
): void {
  logger[level](context, message);
}

// Usage
logEvent(logger, 'info', { userId: '123', action: 'login' }, 'User action');
```

## Custom Log Levels

### Define Custom Levels

```typescript
import pino, { Logger } from 'pino';

type CustomLevels = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'audit';

const logger = pino<CustomLevels>({
  customLevels: {
    audit: 35  // Between info (30) and warn (40)
  },
  level: 'trace'
});

// Type-safe custom level usage
logger.audit({ userId: '123', action: 'delete' }, 'Audit log');
```

### Extending Logger Interface

```typescript
import pino from 'pino';

interface AuditLogData {
  userId: string;
  action: string;
  resource: string;
}

class AuditLogger {
  private logger: pino.Logger;

  constructor(logger: pino.Logger) {
    this.logger = logger;
  }

  audit(data: AuditLogData, message: string): void {
    this.logger.info({ ...data, type: 'audit' }, message);
  }
}

// Usage
const auditLogger = new AuditLogger(logger);
auditLogger.audit({
  userId: '123',
  action: 'delete',
  resource: 'user:456'
}, 'User deleted');
```

## Singleton Pattern

### Typed Singleton

```typescript
import pino, { Logger } from 'pino';

let logger: Logger | null = null;

export function getLogger(): Logger {
  if (!logger) {
    logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }
  return logger;
}

// Usage
import { getLogger } from './logger';

const logger = getLogger();  // Type: Logger
logger.info('Application started');
```

### Factory Pattern

```typescript
import pino, { Logger, LoggerOptions } from 'pino';

export class LoggerFactory {
  private static instance: Logger;

  static create(options?: LoggerOptions): Logger {
    if (!this.instance) {
      this.instance = pino(options);
    }
    return this.instance;
  }

  static createChild(bindings: pino.Bindings): Logger {
    return this.create().child(bindings);
  }
}

// Usage
const logger = LoggerFactory.create({ level: 'debug' });
const requestLogger = LoggerFactory.createChild({ requestId: '123' });
```

## Integration with Express.js

### Typed Request Logger

```typescript
import { Request, Response, NextFunction } from 'express';
import pino, { Logger } from 'pino';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      log: Logger;
      id: string;
    }
  }
}

// Middleware
function attachLogger(req: Request, res: Response, next: NextFunction): void {
  req.log = logger.child({ requestId: req.id });
  next();
}

// Route handler with typed logger
app.get('/api/users', (req: Request, res: Response) => {
  req.log.info('Fetching users');  // Type-safe
  res.json({ users: [] });
});
```

### pino-http Types

```typescript
import express, { Request, Response } from 'express';
import pinoHttp, { HttpLogger } from 'pino-http';
import pino from 'pino';

const logger = pino();
const httpLogger: HttpLogger = pinoHttp({ logger });

const app = express();
app.use(httpLogger);

app.get('/api/users', (req: Request, res: Response) => {
  req.log.info('Handler called');  // req.log is typed as Logger
});
```

## AsyncLocalStorage Integration

### Typed Context

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from 'pino';

interface PipelineContext {
  threadId: string;
  step?: string;
}

const pipelineContext = new AsyncLocalStorage<PipelineContext>();

export function getContext(): PipelineContext | undefined {
  return pipelineContext.getStore();
}

export function runWithContext<T>(
  context: PipelineContext,
  fn: () => Promise<T>
): Promise<T> {
  return pipelineContext.run(context, fn);
}

// Usage
await runWithContext({ threadId: 'cli-123' }, async () => {
  const ctx = getContext();  // Type: PipelineContext | undefined
  if (ctx) {
    logger.info({ threadId: ctx.threadId }, 'Processing');
  }
});
```

### Typed Logger Provider

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import pino, { Logger } from 'pino';

const loggerStorage = new AsyncLocalStorage<Logger>();

export function runWithLogger<T>(
  logger: Logger,
  fn: () => Promise<T>
): Promise<T> {
  return loggerStorage.run(logger, fn);
}

export function getLogger(): Logger {
  const logger = loggerStorage.getStore();
  if (!logger) {
    throw new Error('Logger not available in current context');
  }
  return logger;
}

// Or with fallback
export function getLoggerSafe(fallback: Logger): Logger {
  return loggerStorage.getStore() || fallback;
}

// Usage
const requestLogger = baseLogger.child({ requestId: '123' });

await runWithLogger(requestLogger, async () => {
  const logger = getLogger();  // Type: Logger
  logger.info('Inside context');
});
```

## Error Logging

### Typed Error Context

```typescript
interface ErrorLogContext {
  errorCode: string;
  errorMessage: string;
  userId?: string;
  requestId?: string;
  stack?: string;
}

function logError(logger: Logger, error: Error, context?: Partial<ErrorLogContext>): void {
  const errorContext: ErrorLogContext = {
    errorCode: (error as any).code || 'UNKNOWN_ERROR',
    errorMessage: error.message,
    stack: error.stack,
    ...context
  };

  logger.error(errorContext, 'Error occurred');
}

// Usage
try {
  await processPayment(order);
} catch (error) {
  logError(logger, error as Error, {
    userId: order.userId,
    requestId: req.id
  });
}
```

### Custom Error Classes

```typescript
class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public context?: Record<string, any>
  ) {
    super(message);
    this.name = 'ApplicationError';
  }

  toLogObject() {
    return {
      errorCode: this.code,
      errorMessage: this.message,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack
    };
  }
}

// Usage
try {
  throw new ApplicationError('Payment failed', 'PAYMENT_ERROR', 402, { orderId: '123' });
} catch (error) {
  if (error instanceof ApplicationError) {
    logger.error(error.toLogObject(), 'Application error');
  } else {
    logger.error(error, 'Unknown error');
  }
}
```

## Module Augmentation

### Extend Pino Types

```typescript
import 'pino';

declare module 'pino' {
  interface LoggerOptions {
    // Add custom option
    customOption?: string;
  }

  interface Logger {
    // Add custom method
    audit(obj: Record<string, any>, msg?: string): void;
  }
}

// Implementation
const logger = pino({
  customOption: 'value'
});

logger.audit = function(obj, msg) {
  this.info({ ...obj, type: 'audit' }, msg);
};

// Usage
logger.audit({ userId: '123', action: 'delete' }, 'User deleted');
```

## Utility Types

### Log Level Type

```typescript
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

function setLogLevel(logger: Logger, level: LogLevel): void {
  logger.level = level;
}
```

### Logger Configuration Builder

```typescript
import pino, { LoggerOptions, DestinationStream } from 'pino';

class LoggerConfigBuilder {
  private options: LoggerOptions = {};

  setLevel(level: string): this {
    this.options.level = level;
    return this;
  }

  setName(name: string): this {
    this.options.name = name;
    return this;
  }

  enablePretty(colorize: boolean = true): this {
    this.options.transport = {
      target: 'pino-pretty',
      options: { colorize }
    };
    return this;
  }

  build(): pino.Logger {
    return pino(this.options);
  }
}

// Usage
const logger = new LoggerConfigBuilder()
  .setLevel('debug')
  .setName('my-app')
  .enablePretty()
  .build();
```

## Best Practices

### 1. Define Context Interfaces

```typescript
// ✅ Good: Define interfaces for log contexts
interface RequestLogContext {
  requestId: string;
  method: string;
  url: string;
  userId?: string;
}

logger.info<RequestLogContext>({
  requestId: '123',
  method: 'GET',
  url: '/api/users',
  userId: 'john'
}, 'Request processed');

// ❌ Bad: Untyped context
logger.info({ requestId: '123', method: 'GET' }, 'Request processed');
```

### 2. Use Const Assertions

```typescript
const logLevels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = typeof logLevels[number];

function setLevel(level: LogLevel): void {
  logger.level = level;
}

setLevel('info');   // ✅ OK
setLevel('invalid'); // ❌ Type error
```

### 3. Type-Safe Bindings

```typescript
interface ServiceBindings {
  service: string;
  version: string;
}

function createServiceLogger(bindings: ServiceBindings): Logger {
  return logger.child(bindings);
}

// ✅ Type-safe
const serviceLogger = createServiceLogger({
  service: 'api',
  version: '1.0.0'
});

// ❌ Type error (missing version)
const invalidLogger = createServiceLogger({
  service: 'api'
});
```

### 4. Avoid 'any' Types

```typescript
// ❌ Bad
function logData(logger: Logger, data: any): void {
  logger.info(data);
}

// ✅ Good
function logData<T extends Record<string, any>>(logger: Logger, data: T): void {
  logger.info(data);
}
```

### 5. Use Type Guards

```typescript
function isLogger(obj: any): obj is Logger {
  return obj && typeof obj.info === 'function' && typeof obj.error === 'function';
}

function safeLog(maybeLogger: unknown, message: string): void {
  if (isLogger(maybeLogger)) {
    maybeLogger.info(message);
  } else {
    console.log(message);
  }
}
```

## Testing

### Mock Logger

```typescript
import { Logger } from 'pino';
import { vi } from 'vitest';

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(() => createMockLogger()),
    level: 'info',
    // ... other required methods
  } as unknown as Logger;
}

// Usage in tests
it('logs user action', () => {
  const mockLogger = createMockLogger();
  const service = new UserService(mockLogger);

  service.createUser({ name: 'John' });

  expect(mockLogger.info).toHaveBeenCalledWith({ name: 'John' }, 'Creating user');
});
```

### Spy on Logger

```typescript
import pino from 'pino';
import { vi, expect } from 'vitest';

it('logs error on failure', async () => {
  const logger = pino({ level: 'silent' });
  const errorSpy = vi.spyOn(logger, 'error');

  try {
    await failingOperation();
  } catch (err) {
    logger.error(err, 'Operation failed');
  }

  expect(errorSpy).toHaveBeenCalledWith(
    expect.any(Error),
    'Operation failed'
  );
});
```

## Complete TypeScript Example

```typescript
import pino, { Logger, LoggerOptions, Bindings } from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// Types
interface PipelineContext {
  threadId: string;
  step?: string;
}

interface LogContext extends Record<string, any> {
  threadId?: string;
  step?: string;
}

// AsyncLocalStorage
const contextStorage = new AsyncLocalStorage<PipelineContext>();

// Logger factory
export class PipelineLogger {
  private static baseLogger: Logger;

  static initialize(options?: LoggerOptions): void {
    this.baseLogger = pino(options || {
      level: process.env.LOG_LEVEL || 'info',
      timestamp: pino.stdTimeFunctions.isoTime
    });
  }

  static getLogger(): Logger {
    const context = contextStorage.getStore();
    if (context) {
      return this.baseLogger.child(context);
    }
    return this.baseLogger;
  }

  static async runPipeline<T>(
    threadId: string,
    fn: () => Promise<T>
  ): Promise<T> {
    return contextStorage.run({ threadId }, fn);
  }

  static async runStep<T>(
    stepName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const context = contextStorage.getStore();
    if (!context) {
      throw new Error('runStep called outside pipeline context');
    }

    const stepContext: PipelineContext = { ...context, step: stepName };
    return contextStorage.run(stepContext, fn);
  }
}

// Initialize
PipelineLogger.initialize({
  level: 'debug',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: { colorize: true }
  } : undefined
});

// Usage
async function executePipeline(input: string): Promise<void> {
  const threadId = `cli-${Date.now()}`;

  await PipelineLogger.runPipeline(threadId, async () => {
    await PipelineLogger.runStep('detectEvent', async () => {
      PipelineLogger.getLogger().info({ input }, 'Detecting event');
      // ...
    });

    await PipelineLogger.runStep('extractCandidates', async () => {
      PipelineLogger.getLogger().info('Extracting candidates');
      // ...
    });
  });
}
```

## Sources

- [Pino TypeScript Definitions](https://github.com/pinojs/pino/blob/main/pino.d.ts)
- [Pino API Documentation](https://github.com/pinojs/pino/blob/main/docs/api.md)
- [Pino Logger Guide 2025 - SigNoz](https://signoz.io/guides/pino-logger/)
- [Complete Guide to Pino - Better Stack](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [Building Production-Grade Logger with Pino - Medium](https://medium.com/@artemkhrenov/building-a-production-grade-logger-for-node-js-applications-with-pino-2ebd8447d531)
