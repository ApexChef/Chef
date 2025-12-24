# Integration Specifications

## Overview

This document specifies how the logging system integrates with different Chef components: CLI, Web, and Pipeline.

## Integration Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                      Integration Points                          │
│                                                                  │
│  CLI (@chef/cli)           Web (@chef/web)      Pipeline        │
│       │                         │               (@chef/backlog) │
│       │                         │                      │         │
│       └─────────────────────────┼──────────────────────┘         │
│                                 │                                 │
│                                 ▼                                 │
│                    @chef/core/logger                             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## 1. CLI Integration

### 1.1 Initialization

**Location**: `apps/cli/src/index.ts` or command entry point

**Responsibilities**:
- Initialize logger at CLI startup
- Configure for terminal output
- Set log level from environment

**Implementation**:

```typescript
// apps/cli/src/index.ts
import { getLogger } from '@chef/core/logger';

// Initialize logger early
const logger = getLogger();

// Log CLI startup
logger.info({
  version: require('../package.json').version,
  node: process.version
}, 'Chef CLI initialized');

// Export for commands to use
export { logger };
```

### 1.2 Command Integration

**Location**: `apps/cli/src/commands/backlog/process.ts`

**Responsibilities**:
- Generate thread ID for pipeline run
- Wrap pipeline execution in runPipeline()
- Log command lifecycle

**Implementation**:

```typescript
// apps/cli/src/commands/backlog/process.ts
import { Command, Args } from '@oclif/core';
import { getLogger, runPipeline } from '@chef/core/logger';
import { processMeetingNotes } from '@chef/backlog';

export default class BacklogProcess extends Command {
  static description = 'Process meeting notes into PBIs';

  static args = {
    file: Args.string({
      description: 'Path to meeting notes file',
      required: true
    })
  };

  async run(): Promise<void> {
    const { args } = await this.parse(BacklogProcess);
    const logger = getLogger();

    // Generate thread ID
    const threadId = `cli-${Date.now()}`;

    logger.info({
      threadId,
      file: args.file,
      command: 'backlog:process'
    }, 'Starting pipeline');

    try {
      // Wrap pipeline execution
      const result = await runPipeline(threadId, async () => {
        return await processMeetingNotes(args.file);
      });

      logger.info({
        threadId,
        pbiCount: result.pbis.length,
        duration: result.duration
      }, 'Pipeline completed successfully');

      this.log(`Processed ${result.pbis.length} PBIs`);
    } catch (error) {
      logger.error({
        threadId,
        err: error,
        file: args.file
      }, 'Pipeline failed');

      this.error(error as Error);
    }
  }
}
```

### 1.3 Configuration

**Environment Variables** (`.env` or system):

```bash
# Development
NODE_ENV=development
LOG_LEVEL=debug
LOG_TO_FILE=false

# Production
NODE_ENV=production
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=/var/log/chef/cli.log
```

**Output Behavior**:
- **Development**: pino-pretty (colorized, human-readable)
- **Production**: JSON (for log aggregation)

### 1.4 Testing CLI Integration

```typescript
// apps/cli/test/commands/backlog/process.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resetLogger, createLogger } from '@chef/core/logger';
import BacklogProcess from '../../../src/commands/backlog/process';

describe('BacklogProcess command', () => {
  beforeEach(() => {
    // Silent logger for tests
    resetLogger();
    createLogger({ level: 'silent', enabled: false });
  });

  afterEach(() => {
    resetLogger();
  });

  it('logs pipeline execution', async () => {
    const command = new BacklogProcess(['test-notes.md'], {} as any);
    await command.run();
    // Assert on output/logs
  });
});
```

## 2. Pipeline Integration

### 2.1 Pipeline Entry Point

**Location**: `packages/backlog/src/pipeline/index.ts`

**Responsibilities**:
- Accept thread ID from caller (or generate if not provided)
- Ensure runPipeline() wraps execution
- Log pipeline-level events

**Implementation**:

```typescript
// packages/backlog/src/pipeline/index.ts
import { getContextLogger, runPipeline } from '@chef/core/logger';
import { runPipelineGraph } from './graph/pipeline-graph';

export interface ProcessOptions {
  threadId?: string;
  // ... other options
}

export async function processMeetingNotes(
  filePath: string,
  options: ProcessOptions = {}
) {
  const threadId = options.threadId || `pipeline-${Date.now()}`;
  const logger = getContextLogger();

  return runPipeline(threadId, async () => {
    logger.info({ filePath }, 'Pipeline started');

    try {
      const result = await runPipelineGraph({
        inputFile: filePath,
        threadId
      });

      logger.info({
        pbiCount: result.pbis.length,
        duration: result.duration
      }, 'Pipeline completed');

      return result;
    } catch (error) {
      logger.error({ err: error, filePath }, 'Pipeline failed');
      throw error;
    }
  });
}
```

### 2.2 Pipeline Node Integration

**Location**: `packages/backlog/src/pipeline/graph/nodes/*.node.ts`

**Responsibilities**:
- Wrap node execution in runStep()
- Use getContextLogger() for all logging
- Log node inputs, outputs, and errors

**Template**:

```typescript
// packages/backlog/src/pipeline/graph/nodes/detect-event.node.ts
import { getContextLogger, runStep } from '@chef/core/logger';
import { PipelineState } from '../../state/pipeline-state';

export async function detectEvent(
  state: PipelineState
): Promise<Partial<PipelineState>> {
  return runStep('detectEvent', async () => {
    const logger = getContextLogger();

    logger.info({
      inputLength: state.inputText.length
    }, 'Detecting event type');

    try {
      // Node logic
      const eventType = await detectEventFromText(state.inputText);

      logger.info({ eventType }, 'Event type detected');

      return { eventType };
    } catch (error) {
      logger.error({ err: error }, 'Event detection failed');
      throw error;
    }
  });
}
```

**Apply to All Nodes**:
- `detect-event.node.ts`
- `extract-candidates.node.ts`
- `score-confidence.node.ts`
- `route-by-score.node.ts`
- `request-context.node.ts`
- `enrich-context.node.ts`
- `rescore-with-context.node.ts`
- `human-approval.node.ts`
- `risk-analysis.node.ts`
- `dependency-mapping.node.ts`
- `consolidate-description.node.ts`
- `export-pbi.node.ts`

### 2.3 LLM Call Logging

**Pattern**: Log before and after LLM invocations

```typescript
import { getContextLogger } from '@chef/core/logger';
import { LLMRouter } from '@chef/core';

const logger = getContextLogger();

// Before LLM call
logger.debug({
  prompt: promptSummary,
  model: llmConfig.model
}, 'Invoking LLM');

const response = await llm.invoke(messages);

// After LLM call
logger.debug({
  responseLength: response.content.length,
  tokensUsed: response.usage?.total_tokens
}, 'LLM response received');
```

### 2.4 Testing Pipeline Integration

```typescript
// packages/backlog/test/pipeline/nodes/detect-event.test.ts
import { describe, it, expect } from 'vitest';
import { runPipeline, getContext } from '@chef/core/logger';
import { detectEvent } from '../../../src/pipeline/graph/nodes/detect-event.node';

describe('detectEvent node', () => {
  it('includes context in logs', async () => {
    const threadId = 'test-123';

    await runPipeline(threadId, async () => {
      const state = { inputText: 'Meeting notes...' };
      await detectEvent(state);

      // Verify context is available
      const ctx = getContext();
      expect(ctx?.threadId).toBe(threadId);
    });
  });
});
```

## 3. Web Integration

### 3.1 Server Initialization

**Location**: `apps/web/src/app.ts` or `apps/web/src/server.ts`

**Responsibilities**:
- Initialize logger for web application
- Configure pino-http middleware
- Set up request logging

**Implementation**:

```typescript
// apps/web/src/app.ts
import express from 'express';
import { createPinoHttpMiddleware } from './lib/logger';

const app = express();

// Add pino-http middleware early
app.use(createPinoHttpMiddleware());

// Routes
app.use('/api', apiRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  req.log.error({ err }, 'Unhandled error');
  res.status(500).json({
    error: 'Internal server error',
    requestId: req.id
  });
});

export default app;
```

### 3.2 pino-http Middleware

**Location**: `apps/web/src/lib/logger.ts`

**Responsibilities**:
- Configure pino-http
- Generate request IDs
- Attach logger to request object

**Implementation**:

```typescript
// apps/web/src/lib/logger.ts
import pinoHttp, { HttpLogger } from 'pino-http';
import { randomUUID } from 'crypto';
import { getLogger } from '@chef/core/logger';

export function createPinoHttpMiddleware(): HttpLogger {
  const logger = getLogger();

  return pinoHttp({
    logger,

    // Generate request ID
    genReqId: (req, res) => {
      const existingId = req.headers['x-request-id'] as string;
      const requestId = existingId || randomUUID();
      res.setHeader('x-request-id', requestId);
      return requestId;
    },

    // Auto-logging configuration
    autoLogging: {
      ignore: (req) => {
        // Don't log health checks, metrics, favicons
        return ['/health', '/metrics', '/favicon.ico'].includes(req.url || '');
      }
    },

    // Custom log level based on status code
    customLogLevel: (req, res, err) => {
      if (res.statusCode >= 400 && res.statusCode < 500) return 'warn';
      if (res.statusCode >= 500 || err) return 'error';
      return 'info';
    },

    // Serializers
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
        headers: {
          host: req.headers.host,
          userAgent: req.headers['user-agent']
        },
        remoteAddress: req.socket.remoteAddress
      }),
      res: (res) => ({
        statusCode: res.statusCode
      }),
      err: logger.serializers?.err
    }
  });
}
```

### 3.3 Route Handler Integration

**Location**: `apps/web/src/routes/*.ts`

**Responsibilities**:
- Use req.log for request-scoped logging
- Log important operations
- Include context in logs

**Implementation**:

```typescript
// apps/web/src/routes/pbis.ts
import { Router } from 'express';
import { runPipeline } from '@chef/core/logger';
import { processMeetingNotes } from '@chef/backlog';

const router = Router();

router.post('/pbis/process', async (req, res, next) => {
  req.log.info({ file: req.body.file }, 'Processing PBI request');

  try {
    // Generate thread ID for pipeline
    const threadId = `web-${req.id}`;

    // Run pipeline with context
    const result = await runPipeline(threadId, async () => {
      return await processMeetingNotes(req.body.file);
    });

    req.log.info({
      threadId,
      pbiCount: result.pbis.length
    }, 'PBI processing completed');

    res.json({
      success: true,
      threadId,
      pbis: result.pbis
    });
  } catch (error) {
    req.log.error({ err: error }, 'PBI processing failed');
    next(error);
  }
});

export default router;
```

### 3.4 Testing Web Integration

```typescript
// apps/web/test/routes/pbis.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { resetLogger, createLogger } from '@chef/core/logger';
import app from '../../src/app';

describe('POST /api/pbis/process', () => {
  beforeEach(() => {
    resetLogger();
    createLogger({ level: 'silent' });
  });

  afterEach(() => {
    resetLogger();
  });

  it('includes request ID in response', async () => {
    const res = await request(app)
      .post('/api/pbis/process')
      .send({ file: 'test.md' })
      .expect(200);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.threadId).toContain('web-');
  });
});
```

## 4. Cross-Cutting Concerns

### 4.1 Error Logging Pattern

**Consistent error logging across all components**:

```typescript
try {
  await operation();
} catch (error) {
  logger.error({
    err: error,
    context: { /* relevant context */ }
  }, 'Operation failed');

  // Re-throw or handle
  throw error;
}
```

### 4.2 Performance Logging

**Log operation timing**:

```typescript
const logger = getContextLogger();
const startTime = Date.now();

try {
  const result = await expensiveOperation();

  logger.info({
    duration: Date.now() - startTime,
    resultSize: result.length
  }, 'Operation completed');

  return result;
} catch (error) {
  logger.error({
    duration: Date.now() - startTime,
    err: error
  }, 'Operation failed');
  throw error;
}
```

### 4.3 Sensitive Data Redaction

**Redact secrets, passwords, tokens**:

```typescript
import { getLogger } from '@chef/core/logger';

const logger = getLogger();

// Bad: logs password
logger.info({ user: { email, password } }, 'User login');

// Good: redact sensitive fields
logger.info({
  user: { email, password: '[REDACTED]' }
}, 'User login');

// Better: use serializers (configure in factory)
const loggerWithSerializers = pino({
  serializers: {
    user: (user) => ({
      email: user.email,
      // password automatically excluded
    })
  }
});
```

## 5. Backward Compatibility

### 5.1 Existing Logger Support

**Maintain old createLogger() API**:

```typescript
// @chef/core/logging/index.ts (old location)
import { getLogger } from './logger';
import { Logger as PinoLogger } from 'pino';

// Legacy interface
export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

// Legacy factory (adapts Pino to old interface)
export function createLogger(namespace?: string): Logger {
  const pinoLogger = getLogger();
  const child = namespace ? pinoLogger.child({ namespace }) : pinoLogger;

  return {
    debug: (message, context) => child.debug(context || {}, message),
    info: (message, context) => child.info(context || {}, message),
    warn: (message, context) => child.warn(context || {}, message),
    error: (message, context) => child.error(context || {}, message)
  };
}
```

### 5.2 Migration Path

**Phase 1**: New logger available, old logger still works
**Phase 2**: Update pipeline nodes to new logger
**Phase 3**: Update CLI/web to new logger
**Phase 4**: Deprecate old logger (optional)

## References

- [TypeScript API Contracts](../api-contracts/typescript-interfaces.md)
- [Component Diagram](../diagrams/component-diagram.md)
- [Deployment Guide](../deployment/deployment-guide.md)
