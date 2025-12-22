# Implementation Guide: Centralized Logging for Chef

## Overview

This guide provides step-by-step instructions for implementing centralized logging infrastructure in the Chef project using Pino, based on PBI-LOGGING-001 requirements.

## Architecture Overview

```
@chef/core/logger
├── logger.ts              - Logger factory and singleton
├── types.ts               - TypeScript types and interfaces
├── context.ts             - AsyncLocalStorage for context propagation
└── index.ts               - Public API

@chef/cli
└── Uses logger for CLI output

@chef/web
└── Uses pino-http middleware

@chef/backlog (pipeline)
└── Uses logger with thread/step context
```

## Phase 1: Core Logger Implementation

### 1.1 Install Dependencies

```bash
# In project root
pnpm add pino

# Development dependencies
pnpm add -D pino-pretty

# For log rotation (optional)
pnpm add pino-roll

# For web app
pnpm add pino-http
```

### 1.2 Create Core Logger Module

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/core/src/logger/`

#### types.ts

```typescript
import { Logger } from 'pino';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LoggerConfig {
  level?: LogLevel;
  pretty?: boolean;
  file?: string;
  rotation?: boolean;
}

export interface PipelineContext {
  threadId: string;
  step?: string;
}

export interface LogContext extends Record<string, any> {
  threadId?: string;
  step?: string;
  [key: string]: any;
}

export { Logger };
```

#### logger.ts

```typescript
import pino, { Logger, LoggerOptions } from 'pino';
import path from 'path';

let instance: Logger | null = null;

export function createLogger(config?: LoggerConfig): Logger {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';

  // Test mode: silent logging
  if (isTest) {
    return pino({ level: 'silent', enabled: false });
  }

  const level = config?.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
  const usePretty = config?.pretty ?? (isDevelopment && !process.env.CI);
  const logToFile = config?.file || process.env.LOG_FILE_PATH;
  const enableRotation = config?.rotation ?? (process.env.LOG_TO_FILE === 'true');

  const options: LoggerOptions = {
    level,
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label.toUpperCase() }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname
      })
    }
  };

  // Configure transports
  if (logToFile && enableRotation) {
    options.transport = {
      targets: [
        // File with rotation
        {
          target: 'pino-roll',
          level: 'info',
          options: {
            file: path.resolve(logToFile),
            frequency: 'daily',
            size: '50m',
            mkdir: true,
            symlink: true,
            limit: { count: 14 }
          }
        },
        // Console output
        {
          target: usePretty ? 'pino-pretty' : 'pino/file',
          level,
          options: usePretty ? {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname'
          } : { destination: 1 }
        }
      ]
    };
  } else if (usePretty) {
    options.transport = {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    };
  }

  return pino(options);
}

export function getLogger(config?: LoggerConfig): Logger {
  if (!instance) {
    instance = createLogger(config);
  }
  return instance;
}

export function resetLogger(): void {
  instance = null;
}
```

#### context.ts

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from 'pino';
import { getLogger } from './logger';
import { PipelineContext } from './types';

const pipelineContext = new AsyncLocalStorage<PipelineContext>();

export function getContext(): PipelineContext | undefined {
  return pipelineContext.getStore();
}

export function getContextLogger(): Logger {
  const context = getContext();
  if (context) {
    return getLogger().child(context);
  }
  return getLogger();
}

export async function runWithContext<T>(
  context: PipelineContext,
  fn: () => Promise<T>
): Promise<T> {
  return pipelineContext.run(context, fn);
}

export async function runPipeline<T>(
  threadId: string,
  fn: () => Promise<T>
): Promise<T> {
  return runWithContext({ threadId }, fn);
}

export async function runStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = getContext();
  if (!context) {
    throw new Error('runStep called outside pipeline context');
  }

  const stepContext: PipelineContext = { ...context, step: stepName };
  return pipelineContext.run(stepContext, fn);
}
```

#### index.ts

```typescript
export { getLogger, createLogger, resetLogger } from './logger';
export { getContext, getContextLogger, runPipeline, runStep, runWithContext } from './context';
export type { Logger, LoggerConfig, PipelineContext, LogContext, LogLevel } from './types';
```

### 1.3 Update package.json

```json
{
  "name": "@chef/core",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./logger": "./dist/logger/index.js"
  },
  "dependencies": {
    "pino": "^8.17.2"
  },
  "devDependencies": {
    "pino-pretty": "^10.3.1",
    "pino-roll": "^1.1.0"
  }
}
```

## Phase 2: CLI Integration

### 2.1 Initialize Logger in CLI

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/apps/cli/src/index.ts`

```typescript
import { getLogger } from '@chef/core/logger';

// Initialize logger at CLI startup
const logger = getLogger({
  level: (process.env.LOG_CLI_LEVEL as any) || 'info',
  pretty: true,
  file: process.env.LOG_FILE_PATH,
  rotation: process.env.LOG_TO_FILE === 'true'
});

logger.info({ version: require('../package.json').version }, 'CLI initialized');
```

### 2.2 Update CLI Commands

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/apps/cli/src/commands/backlog/process.ts`

```typescript
import { Command } from '@oclif/core';
import { getLogger, runPipeline } from '@chef/core/logger';
import { processMeetingNotes } from '@chef/backlog';

export default class BacklogProcess extends Command {
  static description = 'Process meeting notes into PBIs';

  static args = {
    file: Args.string({ description: 'Path to meeting notes file', required: true })
  };

  async run(): Promise<void> {
    const { args } = await this.parse(BacklogProcess);
    const logger = getLogger();

    const threadId = `cli-${Date.now()}`;
    logger.info({ threadId, file: args.file }, 'Starting pipeline');

    try {
      await runPipeline(threadId, async () => {
        const result = await processMeetingNotes(args.file);
        logger.info({ threadId, pbiCount: result.pbis.length }, 'Pipeline completed');
      });
    } catch (err) {
      logger.error({ threadId, err }, 'Pipeline failed');
      throw err;
    }
  }
}
```

## Phase 3: Pipeline Integration

### 3.1 Update Pipeline Nodes

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/backlog/src/pipeline/graph/nodes/`

#### detectEvent.ts

```typescript
import { getContextLogger, runStep } from '@chef/core/logger';
import { PipelineState } from '../../state/pipeline-state';

export async function detectEvent(state: PipelineState): Promise<Partial<PipelineState>> {
  return runStep('detectEvent', async () => {
    const logger = getContextLogger();
    logger.info({ input: state.inputText }, 'Detecting event type');

    // Existing logic...
    const eventType = await detectEventFromText(state.inputText);

    logger.info({ eventType }, 'Event type detected');
    return { eventType };
  });
}
```

#### extractCandidates.ts

```typescript
import { getContextLogger, runStep } from '@chef/core/logger';
import { PipelineState } from '../../state/pipeline-state';

export async function extractCandidates(state: PipelineState): Promise<Partial<PipelineState>> {
  return runStep('extractCandidates', async () => {
    const logger = getContextLogger();
    logger.info('Extracting PBI candidates');

    // Existing logic...
    const candidates = await extractFromNotes(state.inputText);

    logger.info({ count: candidates.length }, 'Candidates extracted');
    return { candidates };
  });
}
```

**Repeat for all pipeline nodes**: `scoreConfidence.ts`, `enrichContext.ts`, `riskAnalysis.ts`, `exportPBI.ts`

### 3.2 Update Pipeline Entry Point

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/backlog/src/pipeline/index.ts`

```typescript
import { getContextLogger } from '@chef/core/logger';
import { runPipeline } from './graph/pipeline-graph';

export async function processMeetingNotes(filePath: string) {
  const logger = getContextLogger();

  logger.info({ filePath }, 'Processing meeting notes');

  try {
    const result = await runPipeline({ inputFile: filePath });
    logger.info({ pbiCount: result.pbis.length }, 'Processing complete');
    return result;
  } catch (err) {
    logger.error({ err, filePath }, 'Processing failed');
    throw err;
  }
}
```

## Phase 4: Web Application Integration

### 4.1 Install pino-http

```bash
pnpm --filter @chef/web add pino-http
```

### 4.2 Create Web Logger

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/apps/web/src/lib/logger.ts`

```typescript
import pino from 'pino';
import pinoHttp from 'pino-http';
import crypto from 'crypto';

const logger = pino({
  level: process.env.LOG_WEB_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      ignore: 'pid,hostname'
    }
  } : undefined
});

export const httpLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const reqId = req.headers['x-request-id'] as string || crypto.randomUUID();
    res.setHeader('x-request-id', reqId);
    return reqId;
  },
  autoLogging: {
    ignore: (req) => ['/health', '/metrics', '/favicon.ico'].includes(req.url)
  },
  customLogLevel: (req, res, err) => {
    if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
    if (res.statusCode >= 500 || err) return 'error';
    return 'info';
  },
  serializers: {
    req: (req) => ({
      method: req.method,
      url: req.url,
      headers: {
        host: req.headers.host,
        userAgent: req.headers['user-agent']
      }
    }),
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err
  }
});

export { logger };
```

### 4.3 Add Middleware to Express App

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/apps/web/src/app.ts`

```typescript
import express from 'express';
import { httpLogger, logger } from './lib/logger';

const app = express();

// Add logging middleware early in the stack
app.use(httpLogger);

// Your other middleware and routes...

// Error handler
app.use((err, req, res, next) => {
  req.log.error(err, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Server started');
});
```

## Phase 5: Configuration

### 5.1 Environment Variables

Create `.env.example`:

```bash
# Logging Configuration

# Global log level (trace, debug, info, warn, error, fatal)
LOG_LEVEL=info

# CLI-specific log level
LOG_CLI_LEVEL=info

# Web-specific log level
LOG_WEB_LEVEL=info

# Enable file persistence
LOG_TO_FILE=false

# Log file path (when LOG_TO_FILE=true)
LOG_FILE_PATH=./logs/chef.log

# Environment
NODE_ENV=development
```

### 5.2 Configuration Schema

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/core/src/config/logging.ts`

```typescript
import { z } from 'zod';

export const loggingConfigSchema = z.object({
  level: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  cliLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  webLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).optional(),
  toFile: z.boolean().default(false),
  filePath: z.string().default('./logs/chef.log'),
  rotation: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(['daily', 'hourly', '1w', '1M']).default('daily'),
    maxSize: z.string().default('50m'),
    retention: z.number().default(14)
  }).optional()
});

export type LoggingConfig = z.infer<typeof loggingConfigSchema>;

export function getLoggingConfig(): LoggingConfig {
  return loggingConfigSchema.parse({
    level: process.env.LOG_LEVEL,
    cliLevel: process.env.LOG_CLI_LEVEL,
    webLevel: process.env.LOG_WEB_LEVEL,
    toFile: process.env.LOG_TO_FILE === 'true',
    filePath: process.env.LOG_FILE_PATH,
    rotation: {
      enabled: process.env.LOG_ROTATION !== 'false',
      frequency: process.env.LOG_ROTATION_FREQUENCY,
      maxSize: process.env.LOG_ROTATION_SIZE,
      retention: process.env.LOG_RETENTION_DAYS ? parseInt(process.env.LOG_RETENTION_DAYS) : undefined
    }
  });
}
```

## Phase 6: Testing

### 6.1 Unit Tests

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/core/src/logger/__tests__/logger.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { createLogger, resetLogger } from '../logger';

describe('Logger', () => {
  beforeEach(() => {
    resetLogger();
  });

  it('creates logger with default config', () => {
    const logger = createLogger();
    expect(logger).toBeDefined();
    expect(logger.level).toBe('info');
  });

  it('creates logger with custom level', () => {
    const logger = createLogger({ level: 'debug' });
    expect(logger.level).toBe('debug');
  });

  it('logs messages at appropriate levels', () => {
    const logger = createLogger({ level: 'silent' });
    expect(() => logger.info('test')).not.toThrow();
    expect(() => logger.error('test')).not.toThrow();
  });
});
```

### 6.2 Context Tests

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/core/src/logger/__tests__/context.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { runPipeline, runStep, getContext } from '../context';

describe('Pipeline Context', () => {
  it('maintains context across async operations', async () => {
    await runPipeline('test-thread-123', async () => {
      const ctx = getContext();
      expect(ctx?.threadId).toBe('test-thread-123');
    });
  });

  it('adds step to context', async () => {
    await runPipeline('test-thread-123', async () => {
      await runStep('testStep', async () => {
        const ctx = getContext();
        expect(ctx?.threadId).toBe('test-thread-123');
        expect(ctx?.step).toBe('testStep');
      });
    });
  });

  it('throws error when runStep called outside pipeline', async () => {
    await expect(runStep('testStep', async () => {})).rejects.toThrow();
  });
});
```

### 6.3 Integration Test

**Location**: `/Users/alwin/Projects/github.com/ApexChef/Chef/packages/backlog/__tests__/logging-integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { runPipeline } from '@chef/core/logger';
import { processMeetingNotes } from '../src/pipeline';

describe('Pipeline Logging Integration', () => {
  it('logs with thread ID throughout pipeline', async () => {
    const threadId = `test-${Date.now()}`;

    await runPipeline(threadId, async () => {
      // This would call processMeetingNotes which uses getContextLogger
      // All logs should include threadId
      // Verify in actual test by capturing logs
    });
  });
});
```

## Phase 7: Documentation

### 7.1 Update README

Add to `/Users/alwin/Projects/github.com/ApexChef/Chef/README.md`:

```markdown
## Logging

Chef uses [Pino](https://github.com/pinojs/pino) for centralized logging.

### Configuration

Set log levels via environment variables:

```bash
LOG_LEVEL=debug          # Global log level
LOG_CLI_LEVEL=info       # CLI-specific
LOG_WEB_LEVEL=debug      # Web-specific
LOG_TO_FILE=true         # Enable file logging
LOG_FILE_PATH=./logs/chef.log
```

### Usage

```typescript
import { getLogger, runPipeline, runStep } from '@chef/core/logger';

// Get logger
const logger = getLogger();
logger.info({ userId: '123' }, 'User action');

// In pipeline
await runPipeline('thread-id', async () => {
  await runStep('stepName', async () => {
    // Logs automatically include threadId and step
    getContextLogger().info('Processing');
  });
});
```
```

## Verification Checklist

### Phase 1: Core Logger
- [ ] Logger singleton created in @chef/core
- [ ] Environment-based configuration working
- [ ] pino-pretty enabled in development
- [ ] File logging with rotation configured
- [ ] TypeScript types exported

### Phase 2: CLI Integration
- [ ] Logger initialized at CLI startup
- [ ] Logs display in terminal with pino-pretty
- [ ] Log level configurable via LOG_CLI_LEVEL
- [ ] Thread ID generated for each pipeline run

### Phase 3: Pipeline Integration
- [ ] All pipeline nodes use getContextLogger()
- [ ] Logs include threadId and step
- [ ] runStep wrapper used in all nodes
- [ ] Context propagates through async operations

### Phase 4: Web Integration
- [ ] pino-http middleware added
- [ ] Request/response logging working
- [ ] Request ID included in all logs
- [ ] Health checks excluded from logs

### Phase 5: Configuration
- [ ] Environment variables documented
- [ ] Configuration schema defined
- [ ] Defaults make sense for each environment

### Phase 6: Testing
- [ ] Unit tests for logger factory
- [ ] Context propagation tests
- [ ] Integration tests for pipeline logging

### Phase 7: Documentation
- [ ] README updated with logging section
- [ ] Environment variables documented
- [ ] Usage examples provided

## Performance Verification

Run these tests to verify logging performance:

```bash
# Benchmark logging overhead
node -e "
const pino = require('pino');
const logger = pino({ level: 'info' });
const start = Date.now();
for (let i = 0; i < 100000; i++) {
  logger.info({ iteration: i }, 'Test log');
}
console.log('100k logs in', Date.now() - start, 'ms');
"

# Expected: <1000ms for 100k logs
```

## Rollout Strategy

1. **Phase 1-2** (Week 1): Core logger + CLI integration
2. **Phase 3** (Week 2): Pipeline integration
3. **Phase 4-5** (Week 3): Web integration + configuration
4. **Phase 6-7** (Week 4): Testing + documentation

## Troubleshooting

### Logs not appearing in CLI

Check:
- `LOG_LEVEL` is not set to 'silent'
- `NODE_ENV` is set correctly
- pino-pretty is installed (`pnpm list pino-pretty`)

### AsyncLocalStorage context lost

Check:
- `runPipeline` is called at entry point
- All async operations are within `runPipeline` callback
- Node.js version >= 16.4.0

### File rotation not working

Check:
- `LOG_TO_FILE=true` is set
- `LOG_FILE_PATH` directory exists or mkdir: true in pino-roll
- pino-roll is installed

## Next Steps

After implementation:

1. **Monitor log volume**: Set up alerts for disk space
2. **Tune log levels**: Adjust based on production needs
3. **Add log aggregation**: Consider ELK stack or cloud logging
4. **Implement sampling**: If log volume is too high
5. **Add alerting**: Set up alerts for ERROR/FATAL logs

## Sources

This implementation guide is based on the comprehensive research in:
- `02-pino-documentation.md`
- `05-context-propagation-patterns.md`
- `06-log-rotation-strategies.md`
- `07-express-integration.md`
- `08-typescript-integration.md`
