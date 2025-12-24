# TypeScript API Contracts

## Overview

This document defines the complete TypeScript interfaces, types, and API contracts for the Chef Logging System.

## Public API Surface

### Core Exports

```typescript
// @chef/core/logger/index.ts

// Logger Functions
export function getLogger(): Logger;
export function createLogger(config?: LoggerConfig): Logger;
export function resetLogger(): void;

// Context Functions
export function getContextLogger(): Logger;
export function getContext(): PipelineContext | undefined;
export function runPipeline<T>(threadId: string, fn: () => Promise<T>): Promise<T>;
export function runStep<T>(stepName: string, fn: () => Promise<T>): Promise<T>;
export function runWithContext<T>(context: PipelineContext, fn: () => Promise<T>): Promise<T>;

// Types
export type { Logger, LoggerOptions, Bindings } from 'pino';
export type { LogLevel, LoggerConfig, PipelineContext, RotationConfig };
```

## Type Definitions

### LogLevel

```typescript
/**
 * Supported log levels (ordered by severity)
 */
export type LogLevel =
  | 'trace'   // Most verbose, diagnostic info
  | 'debug'   // Debugging information
  | 'info'    // General operational messages
  | 'warn'    // Warning conditions
  | 'error'   // Error conditions
  | 'fatal';  // Critical failures

/**
 * Numeric log levels (Pino internal)
 */
export const LogLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
} as const;
```

### LoggerConfig

```typescript
/**
 * Configuration for logger creation
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   * @default 'info' (production), 'debug' (development)
   */
  level?: LogLevel;

  /**
   * Enable file logging
   * @default false
   */
  toFile?: boolean;

  /**
   * Path to log file
   * @default './logs/chef.log'
   */
  filePath?: string;

  /**
   * Enable pretty-printing for development
   * Auto-detected from NODE_ENV if not specified
   * @default true (development), false (production)
   */
  pretty?: boolean;

  /**
   * Log rotation configuration
   */
  rotation?: RotationConfig;

  /**
   * Custom logger name
   * @default undefined
   */
  name?: string;

  /**
   * Enable logger (for testing)
   * @default true
   */
  enabled?: boolean;
}
```

### RotationConfig

```typescript
/**
 * File rotation settings
 */
export interface RotationConfig {
  /**
   * Enable log rotation
   * @default true (when toFile=true)
   */
  enabled?: boolean;

  /**
   * Rotation frequency
   * - 'daily': Rotate once per day
   * - 'hourly': Rotate once per hour
   * - '1w': Rotate once per week
   * - '1M': Rotate once per month
   * @default 'daily'
   */
  frequency?: 'daily' | 'hourly' | '1w' | '1M';

  /**
   * Maximum file size before rotation
   * Examples: '50m', '100m', '1g'
   * @default '50m'
   */
  maxSize?: string;

  /**
   * Number of days to retain logs
   * @default 14
   */
  retention?: number;
}
```

### PipelineContext

```typescript
/**
 * Context for pipeline execution correlation
 */
export interface PipelineContext {
  /**
   * Unique identifier for the pipeline run
   * Format: 'cli-{timestamp}' or 'web-{uuid}'
   */
  threadId: string;

  /**
   * Current pipeline step name (optional)
   * Examples: 'detectEvent', 'extractCandidates', 'riskAnalysis'
   */
  step?: string;
}
```

## Function Signatures

### getLogger()

```typescript
/**
 * Get the singleton logger instance
 *
 * Lazily creates logger on first call using environment configuration.
 * Subsequent calls return the same instance.
 *
 * @returns Pino logger instance
 *
 * @example
 * ```typescript
 * import { getLogger } from '@chef/core/logger';
 *
 * const logger = getLogger();
 * logger.info('Application started');
 * logger.error({ err }, 'Operation failed');
 * ```
 */
export function getLogger(): Logger;
```

### createLogger()

```typescript
/**
 * Create a new logger with custom configuration
 *
 * Does not affect the singleton instance. Use for testing or
 * specialized logging scenarios.
 *
 * @param config - Optional configuration overrides
 * @returns Pino logger instance
 *
 * @example
 * ```typescript
 * // Custom logger for testing
 * const testLogger = createLogger({ level: 'silent', enabled: false });
 *
 * // Debug logger
 * const debugLogger = createLogger({ level: 'debug', pretty: true });
 * ```
 */
export function createLogger(config?: LoggerConfig): Logger;
```

### resetLogger()

```typescript
/**
 * Reset the singleton logger instance
 *
 * Primarily for testing. Clears the singleton so the next call to
 * getLogger() will create a fresh instance.
 *
 * @example
 * ```typescript
 * import { afterEach } from 'vitest';
 * import { resetLogger } from '@chef/core/logger';
 *
 * afterEach(() => {
 *   resetLogger();  // Fresh logger per test
 * });
 * ```
 */
export function resetLogger(): void;
```

### getContextLogger()

```typescript
/**
 * Get a logger with current pipeline context
 *
 * Returns a child logger with threadId and step bindings from
 * AsyncLocalStorage. If no context is available, returns the base logger.
 *
 * @returns Pino logger with context bindings
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Processing');  // Includes threadId
 *
 *   await runStep('detectEvent', async () => {
 *     const stepLogger = getContextLogger();
 *     stepLogger.info('Detecting');  // Includes threadId + step
 *   });
 * });
 * ```
 */
export function getContextLogger(): Logger;
```

### getContext()

```typescript
/**
 * Get the current pipeline context from AsyncLocalStorage
 *
 * Returns undefined if called outside a pipeline context.
 *
 * @returns Current pipeline context or undefined
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   const ctx = getContext();
 *   console.log(ctx?.threadId);  // 'cli-1703251200000'
 * });
 * ```
 */
export function getContext(): PipelineContext | undefined;
```

### runPipeline()

```typescript
/**
 * Execute a function with pipeline context (thread ID)
 *
 * Sets up AsyncLocalStorage with the thread ID. All async operations
 * within the function will have access to this context via getContextLogger().
 *
 * @template T - Return type of the function
 * @param threadId - Unique identifier for this pipeline run
 * @param fn - Async function to execute with context
 * @returns Promise resolving to function result
 *
 * @example
 * ```typescript
 * const threadId = `cli-${Date.now()}`;
 *
 * await runPipeline(threadId, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Pipeline started');  // Includes threadId
 *
 *   await processSteps();
 *
 *   logger.info('Pipeline completed');
 * });
 * ```
 */
export async function runPipeline<T>(
  threadId: string,
  fn: () => Promise<T>
): Promise<T>;
```

### runStep()

```typescript
/**
 * Execute a function with step context
 *
 * Must be called within a runPipeline() context. Updates the context
 * to include the step name. Nested runStep() calls update the step name.
 *
 * @template T - Return type of the function
 * @param stepName - Name of the pipeline step
 * @param fn - Async function to execute with step context
 * @returns Promise resolving to function result
 *
 * @throws {Error} If called outside pipeline context
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   await runStep('detectEvent', async () => {
 *     const logger = getContextLogger();
 *     logger.info('Detecting event');  // threadId + step
 *   });
 *
 *   await runStep('extractCandidates', async () => {
 *     const logger = getContextLogger();
 *     logger.info('Extracting');  // threadId + new step
 *   });
 * });
 * ```
 */
export async function runStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T>;
```

### runWithContext()

```typescript
/**
 * Execute a function with custom context
 *
 * Low-level API for custom context scenarios. Prefer runPipeline()
 * and runStep() for standard usage.
 *
 * @template T - Return type of the function
 * @param context - Custom pipeline context
 * @param fn - Async function to execute with context
 * @returns Promise resolving to function result
 *
 * @example
 * ```typescript
 * await runWithContext({ threadId: 'custom-123', step: 'custom' }, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Custom context');
 * });
 * ```
 */
export async function runWithContext<T>(
  context: PipelineContext,
  fn: () => Promise<T>
): Promise<T>;
```

## Pino Logger Interface

The `Logger` type is re-exported from Pino. Key methods:

```typescript
interface Logger {
  // Log methods (msg-first or object-first)
  trace(msg: string, ...args: any[]): void;
  trace(obj: object, msg?: string, ...args: any[]): void;

  debug(msg: string, ...args: any[]): void;
  debug(obj: object, msg?: string, ...args: any[]): void;

  info(msg: string, ...args: any[]): void;
  info(obj: object, msg?: string, ...args: any[]): void;

  warn(msg: string, ...args: any[]): void;
  warn(obj: object, msg?: string, ...args: any[]): void;

  error(msg: string, ...args: any[]): void;
  error(obj: object, msg?: string, ...args: any[]): void;

  fatal(msg: string, ...args: any[]): void;
  fatal(obj: object, msg?: string, ...args: any[]): void;

  // Child logger
  child(bindings: Bindings): Logger;

  // Level control
  level: string;
  isLevelEnabled(level: string): boolean;

  // Flush (for testing)
  flush(): void;
}

type Bindings = Record<string, any>;
```

## Usage Patterns

### Pattern 1: Basic Logging

```typescript
import { getLogger } from '@chef/core/logger';

const logger = getLogger();

// Simple message
logger.info('Application started');

// With context object
logger.info({ port: 3000 }, 'Server listening');

// Error logging
try {
  await operation();
} catch (err) {
  logger.error({ err }, 'Operation failed');
}
```

### Pattern 2: Pipeline Logging

```typescript
import { runPipeline, runStep, getContextLogger } from '@chef/core/logger';

const threadId = `cli-${Date.now()}`;

await runPipeline(threadId, async () => {
  // All logs include threadId

  await runStep('detectEvent', async () => {
    const logger = getContextLogger();
    logger.info({ input }, 'Detecting event');
    // Log: { threadId: 'cli-123', step: 'detectEvent', input, msg }
  });

  await runStep('extractCandidates', async () => {
    const logger = getContextLogger();
    logger.info({ count: 5 }, 'Extracted candidates');
    // Log: { threadId: 'cli-123', step: 'extractCandidates', count, msg }
  });
});
```

### Pattern 3: Child Loggers

```typescript
import { getContextLogger } from '@chef/core/logger';

await runStep('enrichContext', async () => {
  const stepLogger = getContextLogger();

  for (const candidate of candidates) {
    const candidateLogger = stepLogger.child({ candidateId: candidate.id });
    candidateLogger.info('Processing candidate');
    // Log includes: threadId, step, candidateId
  }
});
```

### Pattern 4: Conditional Logging

```typescript
import { getLogger } from '@chef/core/logger';

const logger = getLogger();

if (logger.isLevelEnabled('debug')) {
  const debugInfo = expensiveDebugComputation();
  logger.debug(debugInfo, 'Debug information');
}
```

## Error Handling

### Error Serialization

Pino automatically serializes Error objects:

```typescript
try {
  await operation();
} catch (err) {
  logger.error({ err }, 'Operation failed');
  // Output includes: err.name, err.message, err.stack
}
```

### Custom Error Classes

```typescript
class ApplicationError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

// Usage
try {
  throw new ApplicationError('Payment failed', 'PAYMENT_ERROR', 402);
} catch (err) {
  logger.error({ err }, 'Error occurred');
  // Includes: name, message, stack, code, statusCode
}
```

## Configuration Examples

### Development Configuration

```typescript
const devLogger = createLogger({
  level: 'debug',
  pretty: true,
  toFile: false
});
```

### Production Configuration

```typescript
const prodLogger = createLogger({
  level: 'info',
  pretty: false,
  toFile: true,
  filePath: '/var/log/chef/chef.log',
  rotation: {
    enabled: true,
    frequency: 'daily',
    maxSize: '50m',
    retention: 14
  }
});
```

### Testing Configuration

```typescript
const testLogger = createLogger({
  level: 'silent',
  enabled: false
});
```

## Migration from Existing Logger

### Old API (Deprecated)

```typescript
import { createLogger } from '@chef/core/logging';

const logger = createLogger('namespace');
logger.info('message', { context });
```

### New API

```typescript
import { getLogger } from '@chef/core/logger';

const logger = getLogger();
logger.info({ context }, 'message');
```

## References

- [Pino API Documentation](https://github.com/pinojs/pino/blob/main/docs/api.md)
- [Component Diagram](../diagrams/component-diagram.md)
- [Implementation Guide](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/10-implementation-guide.md)
