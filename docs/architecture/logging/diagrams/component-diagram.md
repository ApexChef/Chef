# Component Diagram

## Overview

This diagram shows the internal structure of the Chef Logging System, including components, their responsibilities, and relationships.

## Component Architecture

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│                        @chef/core/logger Package                                     │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                          Public API (index.ts)                                 │ │
│  │                                                                                │ │
│  │  Exports:                                                                      │ │
│  │  • getLogger(): Logger                                                         │ │
│  │  • createLogger(config?: LoggerConfig): Logger                                 │ │
│  │  • getContextLogger(): Logger                                                  │ │
│  │  • runPipeline<T>(threadId, fn): Promise<T>                                   │ │
│  │  • runStep<T>(stepName, fn): Promise<T>                                       │ │
│  │  • Types: Logger, LoggerConfig, PipelineContext                               │ │
│  └────────────────────────┬───────────────────────────────────────────────────────┘ │
│                           │                                                          │
│        ┌──────────────────┼──────────────────┐                                      │
│        │                  │                  │                                       │
│        ▼                  ▼                  ▼                                       │
│  ┌──────────┐      ┌────────────┐    ┌─────────────┐                              │
│  │  Types   │      │  Factory   │    │   Context   │                              │
│  │  Module  │      │  Module    │    │   Manager   │                              │
│  └──────────┘      └────────────┘    └─────────────┘                              │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                          Types Module (types.ts)                              │  │
│  │                                                                                │  │
│  │  export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' |      │  │
│  │                         'fatal';                                               │  │
│  │                                                                                │  │
│  │  export interface LoggerConfig {                                              │  │
│  │    level?: LogLevel;                                                          │  │
│  │    toFile?: boolean;                                                          │  │
│  │    filePath?: string;                                                         │  │
│  │    pretty?: boolean;                                                          │  │
│  │    rotation?: RotationConfig;                                                 │  │
│  │  }                                                                             │  │
│  │                                                                                │  │
│  │  export interface PipelineContext {                                           │  │
│  │    threadId: string;                                                          │  │
│  │    step?: string;                                                             │  │
│  │  }                                                                             │  │
│  │                                                                                │  │
│  │  export type { Logger } from 'pino';                                          │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                        Factory Module (factory.ts)                            │  │
│  │                                                                                │  │
│  │  Responsibilities:                                                            │  │
│  │  • Create and configure Pino logger                                           │  │
│  │  • Singleton pattern management                                               │  │
│  │  • Environment-based configuration                                            │  │
│  │  • Transport setup (console, file)                                            │  │
│  │                                                                                │  │
│  │  ┌────────────────────────────────────────────────────────────────┐          │  │
│  │  │ let instance: Logger | null = null;                             │          │  │
│  │  │                                                                  │          │  │
│  │  │ export function getLogger(): Logger {                           │          │  │
│  │  │   if (!instance) {                                              │          │  │
│  │  │     instance = createLogger();                                  │          │  │
│  │  │   }                                                              │          │  │
│  │  │   return instance;                                              │          │  │
│  │  │ }                                                                │          │  │
│  │  │                                                                  │          │  │
│  │  │ export function createLogger(config?: LoggerConfig): Logger {   │          │  │
│  │  │   const finalConfig = buildConfig(config);                      │          │  │
│  │  │   return pino(finalConfig);                                     │          │  │
│  │  │ }                                                                │          │  │
│  │  └────────────────────────────────────────────────────────────────┘          │  │
│  │                                   │                                            │  │
│  │                                   ├─> Config Module                            │  │
│  │                                   └─> Transport Builder                        │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                      Context Manager (context.ts)                             │  │
│  │                                                                                │  │
│  │  Responsibilities:                                                            │  │
│  │  • Manage AsyncLocalStorage for context                                       │  │
│  │  • Provide context-aware logger                                               │  │
│  │  • Pipeline and step wrappers                                                 │  │
│  │  • Context lifecycle management                                               │  │
│  │                                                                                │  │
│  │  ┌────────────────────────────────────────────────────────────────┐          │  │
│  │  │ const pipelineContext =                                         │          │  │
│  │  │   new AsyncLocalStorage<PipelineContext>();                     │          │  │
│  │  │                                                                  │          │  │
│  │  │ export function getContextLogger(): Logger {                    │          │  │
│  │  │   const context = pipelineContext.getStore();                   │          │  │
│  │  │   if (context) {                                                │          │  │
│  │  │     return getLogger().child(context);                          │          │  │
│  │  │   }                                                              │          │  │
│  │  │   return getLogger();                                           │          │  │
│  │  │ }                                                                │          │  │
│  │  │                                                                  │          │  │
│  │  │ export async function runPipeline<T>(                           │          │  │
│  │  │   threadId: string,                                             │          │  │
│  │  │   fn: () => Promise<T>                                          │          │  │
│  │  │ ): Promise<T> {                                                 │          │  │
│  │  │   return pipelineContext.run({ threadId }, fn);                 │          │  │
│  │  │ }                                                                │          │  │
│  │  │                                                                  │          │  │
│  │  │ export async function runStep<T>(                               │          │  │
│  │  │   stepName: string,                                             │          │  │
│  │  │   fn: () => Promise<T>                                          │          │  │
│  │  │ ): Promise<T> {                                                 │          │  │
│  │  │   const ctx = pipelineContext.getStore();                       │          │  │
│  │  │   if (!ctx) throw new Error('Outside pipeline');                │          │  │
│  │  │   return pipelineContext.run({ ...ctx, step: stepName }, fn);  │          │  │
│  │  │ }                                                                │          │  │
│  │  └────────────────────────────────────────────────────────────────┘          │  │
│  │                                   │                                            │  │
│  │                                   └─> Uses Factory.getLogger()                 │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                      Configuration Module (config.ts)                         │  │
│  │                                                                                │  │
│  │  Responsibilities:                                                            │  │
│  │  • Load configuration from environment                                        │  │
│  │  • Validate configuration with Zod                                            │  │
│  │  • Provide defaults per environment                                           │  │
│  │                                                                                │  │
│  │  ┌────────────────────────────────────────────────────────────────┐          │  │
│  │  │ const configSchema = z.object({ ... });                         │          │  │
│  │  │                                                                  │          │  │
│  │  │ export function loadConfigFromEnv(): LoggerConfig {             │          │  │
│  │  │   return configSchema.parse({                                   │          │  │
│  │  │     level: process.env.LOG_LEVEL,                               │          │  │
│  │  │     toFile: process.env.LOG_TO_FILE === 'true',                 │          │  │
│  │  │     // ... other env vars                                        │          │  │
│  │  │   });                                                            │          │  │
│  │  │ }                                                                │          │  │
│  │  └────────────────────────────────────────────────────────────────┘          │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐  │
│  │                      Transport Builder (transport.ts)                         │  │
│  │                                                                                │  │
│  │  Responsibilities:                                                            │  │
│  │  • Configure Pino transports                                                  │  │
│  │  • Setup pino-pretty for development                                          │  │
│  │  • Setup pino-roll for file rotation                                          │  │
│  │  • Handle multiple transport targets                                          │  │
│  │                                                                                │  │
│  │  ┌────────────────────────────────────────────────────────────────┐          │  │
│  │  │ export function buildTransports(config: LoggerConfig) {         │          │  │
│  │  │   const targets = [];                                           │          │  │
│  │  │                                                                  │          │  │
│  │  │   if (config.pretty) {                                          │          │  │
│  │  │     targets.push({                                              │          │  │
│  │  │       target: 'pino-pretty',                                    │          │  │
│  │  │       options: { colorize: true }                               │          │  │
│  │  │     });                                                          │          │  │
│  │  │   }                                                              │          │  │
│  │  │                                                                  │          │  │
│  │  │   if (config.toFile) {                                          │          │  │
│  │  │     targets.push({                                              │          │  │
│  │  │       target: 'pino-roll',                                      │          │  │
│  │  │       options: { file: config.filePath, ... }                   │          │  │
│  │  │     });                                                          │          │  │
│  │  │   }                                                              │          │  │
│  │  │                                                                  │          │  │
│  │  │   return { targets };                                           │          │  │
│  │  │ }                                                                │          │  │
│  │  └────────────────────────────────────────────────────────────────┘          │  │
│  └──────────────────────────────────────────────────────────────────────────────┘  │
│                                                                                      │
└──────────────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────────────┐
│                              External Dependencies                                    │
│                                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │     pino     │    │ pino-pretty  │    │  pino-roll   │    │ AsyncLocal   │     │
│  │   (8.17.2+)  │    │  (10.3.1+)   │    │   (1.1.0+)   │    │   Storage    │     │
│  │              │    │              │    │              │    │  (Node.js)   │     │
│  │ Core logger  │    │ Dev format   │    │ File rotate  │    │   Context    │     │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. Public API (index.ts)

**Responsibility**: Facade for the logging system

**Exports**:
- `getLogger()`: Get singleton logger instance
- `createLogger(config?)`: Create logger with custom config
- `getContextLogger()`: Get logger with current pipeline context
- `runPipeline()`: Execute function with thread ID context
- `runStep()`: Execute function with step name context
- TypeScript types and interfaces

**Dependencies**: Factory Module, Context Manager, Types Module

### 2. Types Module (types.ts)

**Responsibility**: TypeScript type definitions

**Exports**:
- `LogLevel`: Union type for log levels
- `LoggerConfig`: Logger configuration interface
- `PipelineContext`: Context for correlation
- `RotationConfig`: File rotation settings
- Re-export Pino's `Logger` type

**Dependencies**: None (types only)

### 3. Factory Module (factory.ts)

**Responsibility**: Logger creation and singleton management

**Functions**:
- `getLogger()`: Return singleton instance (lazy init)
- `createLogger(config)`: Create new Pino logger
- `resetLogger()`: Reset singleton (for testing)
- `buildConfig(config)`: Merge env vars + defaults + overrides

**State**: `instance: Logger | null` (singleton)

**Dependencies**: Pino, Config Module, Transport Builder

### 4. Context Manager (context.ts)

**Responsibility**: AsyncLocalStorage-based context propagation

**Functions**:
- `getContextLogger()`: Get logger with current context bindings
- `getContext()`: Get current pipeline context
- `runPipeline(threadId, fn)`: Execute with thread context
- `runStep(stepName, fn)`: Execute with step context
- `runWithContext(context, fn)`: Low-level context runner

**State**: `pipelineContext: AsyncLocalStorage<PipelineContext>`

**Dependencies**: Factory Module (getLogger), Node.js AsyncLocalStorage

### 5. Configuration Module (config.ts)

**Responsibility**: Configuration loading and validation

**Functions**:
- `loadConfigFromEnv()`: Load from environment variables
- `getDefaultConfig(env)`: Get defaults for environment
- `mergeConfig(...)`: Merge config sources

**Dependencies**: Zod (validation), process.env

### 6. Transport Builder (transport.ts)

**Responsibility**: Configure Pino transports

**Functions**:
- `buildTransports(config)`: Create transport configuration
- `buildPrettyTransport()`: pino-pretty config
- `buildFileTransport(config)`: pino-roll config

**Dependencies**: Pino transport API

## Data Flow

### Logger Creation Flow

```
User calls getLogger()
    ↓
Factory checks singleton instance
    ↓ (if null)
loadConfigFromEnv()
    ↓
mergeConfig(env, defaults, overrides)
    ↓
buildTransports(config)
    ↓
pino(config with transports)
    ↓
Store in singleton instance
    ↓
Return logger
```

### Context-Aware Logging Flow

```
runPipeline(threadId, fn)
    ↓
AsyncLocalStorage.run({ threadId }, fn)
    ↓
Inside fn: getContextLogger()
    ↓
pipelineContext.getStore() → { threadId }
    ↓
baseLogger.child({ threadId })
    ↓
Return child logger
    ↓
logger.info(msg) → includes threadId in log
```

### Step Context Flow

```
runStep(stepName, fn)
    ↓
Get current context from AsyncLocalStorage
    ↓
Create new context: { ...ctx, step: stepName }
    ↓
AsyncLocalStorage.run(newContext, fn)
    ↓
Inside fn: getContextLogger()
    ↓
Returns child with { threadId, step }
```

## Component Interactions

### Interaction 1: CLI Initialization

```
CLI startup
    ↓
import { getLogger } from '@chef/core/logger'
    ↓
getLogger() → Factory Module
    ↓
Factory creates logger with env config
    ↓
CLI logs startup message
```

### Interaction 2: Pipeline Execution

```
CLI command
    ↓
runPipeline(threadId, async () => {
    ↓
    Context Manager sets AsyncLocalStorage
    ↓
    Pipeline Node: runStep(stepName, async () => {
        ↓
        Context Manager updates context with step
        ↓
        getContextLogger() → Factory.getLogger().child(context)
        ↓
        logger.info() → includes threadId + step
    })
})
```

### Interaction 3: Web Request

```
HTTP request arrives
    ↓
pino-http middleware
    ↓
Creates child logger with request ID
    ↓
Stores in AsyncLocalStorage (optional)
    ↓
Route handler: getContextLogger()
    ↓
Logs include request ID
```

## Extension Points

### 1. Custom Transports

```typescript
// Future: Add remote transport
import { buildTransports } from './transport';

export function addRemoteTransport(config: RemoteConfig) {
  const transports = buildTransports(config);
  transports.targets.push({
    target: 'pino-datadog',
    options: config.datadog
  });
  return transports;
}
```

### 2. Custom Serializers

```typescript
// Add PII redaction
const logger = pino({
  serializers: {
    user: (user) => ({
      id: user.id,
      // Redact email, password
    })
  }
});
```

### 3. Custom Formatters

```typescript
// Add request duration
const logger = pino({
  formatters: {
    log: (obj) => ({
      ...obj,
      duration: obj.responseTime ? `${obj.responseTime}ms` : undefined
    })
  }
});
```

## Testing Interfaces

### Mock Logger

```typescript
export function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    // ... other methods
  } as unknown as Logger;
}
```

### Test Context

```typescript
export async function withTestContext<T>(
  context: PipelineContext,
  fn: () => Promise<T>
): Promise<T> {
  return pipelineContext.run(context, fn);
}
```

## References

- [System Context Diagram](system-context.md)
- [Sequence Diagrams](sequence-diagrams.md)
- [API Contracts](../api-contracts/)
