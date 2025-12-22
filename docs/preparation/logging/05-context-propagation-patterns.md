# Context Propagation and Correlation Patterns

## Overview

Context propagation is the technique of passing contextual information (like request IDs, user IDs, or thread IDs) through asynchronous operations without explicit parameter passing. This is critical for correlating logs across different parts of an application.

## The Problem

In asynchronous Node.js applications, context gets lost across async boundaries:

```typescript
async function handleRequest(req, res) {
  const requestId = generateId();

  // How do we access requestId in these nested calls?
  await validateUser(req.body.userId);
  await processOrder(req.body.order);
  await sendNotification(req.body.userId);
}

async function processOrder(order) {
  // We need requestId here for logging, but we don't have it!
  logger.info('Processing order');  // ❌ Missing requestId
}
```

**Traditional Solutions (with drawbacks)**:
1. **Pass as parameter**: Clutters function signatures, breaks existing APIs
2. **Global variable**: Not safe across concurrent requests
3. **Thread-local storage**: Not applicable (Node.js is single-threaded)

## AsyncLocalStorage - The Modern Solution

Node.js provides **AsyncLocalStorage** (stable since v16.4.0) to maintain context across async operations.

### How It Works

AsyncLocalStorage creates stores that remain coherent through asynchronous operations. It's like thread-local storage, but for Node.js's asynchronous, event-driven world.

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const asyncLocalStorage = new AsyncLocalStorage();

async function handleRequest(req, res) {
  const requestId = generateId();

  // Store context for this async execution chain
  asyncLocalStorage.run(requestId, async () => {
    await validateUser(req.body.userId);
    await processOrder(req.body.order);
    await sendNotification(req.body.userId);
  });
}

async function processOrder(order) {
  // Retrieve context anywhere in the execution chain
  const requestId = asyncLocalStorage.getStore();
  logger.info({ requestId }, 'Processing order');  // ✅ Has requestId
}
```

### Key Benefits

1. **Automatic Propagation**: No need to pass context through every function
2. **Type-Safe**: Works seamlessly with TypeScript
3. **Performant**: Optimized in Node.js v24.4.1+ (reduced overhead)
4. **Isolation**: Each async execution chain has its own isolated context

## Official Documentation Reference

**Node.js Async Context Tracking**: https://nodejs.org/api/async_context.html

The official Node.js documentation includes an example of using AsyncLocalStorage for logging:

> "AsyncLocalStorage is useful for assigning IDs to incoming HTTP requests and including them in messages logged within each request."

## AsyncLocalStorage API

### Basic API

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<string>();

// Run with context
storage.run(value, callback);

// Get current context
const value = storage.getStore();

// Enter context (manual management)
storage.enterWith(value);

// Disable (advanced)
storage.disable();
```

### TypeScript Types

```typescript
import { AsyncLocalStorage } from 'async_hooks';

// Typed storage
interface RequestContext {
  requestId: string;
  userId?: string;
  sessionId?: string;
}

const requestContext = new AsyncLocalStorage<RequestContext>();

// Usage
requestContext.run({ requestId: '123' }, async () => {
  const ctx = requestContext.getStore();  // Type: RequestContext | undefined
  if (ctx) {
    logger.info({ requestId: ctx.requestId }, 'Processing');
  }
});
```

## Integration with Pino

### Pattern 1: AsyncLocalStorage + Child Loggers

Combine AsyncLocalStorage (for automatic context) with Pino child loggers (for structured bindings):

```typescript
import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

const logger = pino();
const requestContext = new AsyncLocalStorage<string>();

// Utility to get logger with context
function getLogger() {
  const requestId = requestContext.getStore();
  if (requestId) {
    return logger.child({ requestId });
  }
  return logger;
}

// Express middleware
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();
  requestContext.run(requestId, () => {
    next();
  });
});

// Use anywhere in the request chain
app.get('/api/users', async (req, res) => {
  getLogger().info('Fetching users');  // Includes requestId automatically
  const users = await fetchUsers();
  res.json(users);
});

async function fetchUsers() {
  getLogger().info('Querying database');  // Includes requestId automatically
  // ...
}
```

### Pattern 2: pino-http with AsyncLocalStorage

The `pino-http` middleware automatically creates child loggers per request:

```typescript
import pinoHttp from 'pino-http';
import { AsyncLocalStorage } from 'async_hooks';

const requestContext = new AsyncLocalStorage<pino.Logger>();

app.use(pinoHttp({
  genReqId: () => crypto.randomUUID(),
  autoLogging: true
}));

// Store logger in AsyncLocalStorage
app.use((req, res, next) => {
  requestContext.run(req.log, () => {
    next();
  });
});

// Access logger anywhere
function getLogger() {
  return requestContext.getStore() || logger;
}

app.get('/api/orders', async (req, res) => {
  getLogger().info('Fetching orders');
  // ...
});
```

## Pipeline Context Pattern (for Chef)

For the Chef LangGraph pipeline, we need to track:
- **Thread ID**: Unique identifier for the pipeline run
- **Step Name**: Current pipeline step

### Implementation Strategy

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';

interface PipelineContext {
  threadId: string;
  step?: string;
}

const pipelineContext = new AsyncLocalStorage<PipelineContext>();
const baseLogger = pino();

// Create logger with current context
export function getLogger(): pino.Logger {
  const ctx = pipelineContext.getStore();
  if (ctx) {
    return baseLogger.child(ctx);
  }
  return baseLogger;
}

// Run pipeline with thread context
export async function runPipeline(
  threadId: string,
  pipeline: () => Promise<void>
) {
  await pipelineContext.run({ threadId }, pipeline);
}

// Enter step context
export async function runStep<T>(
  stepName: string,
  stepFn: () => Promise<T>
): Promise<T> {
  const ctx = pipelineContext.getStore();
  if (!ctx) {
    throw new Error('runStep called outside pipeline context');
  }

  // Create new context with step name
  const stepContext = { ...ctx, step: stepName };
  return pipelineContext.run(stepContext, stepFn);
}

// Usage in pipeline
async function executePipeline(input: string) {
  const threadId = `cli-${Date.now()}`;

  await runPipeline(threadId, async () => {
    await runStep('detectEvent', async () => {
      getLogger().info({ input }, 'Detecting event');
      // ...
    });

    await runStep('extractCandidates', async () => {
      getLogger().info('Extracting candidates');
      // ...
    });
  });
}

// Logs will automatically include threadId and step:
// {"level":30,"threadId":"cli-1703251200000","step":"detectEvent","input":"...","msg":"Detecting event"}
// {"level":30,"threadId":"cli-1703251200000","step":"extractCandidates","msg":"Extracting candidates"}
```

## Performance Considerations

### Overhead

AsyncLocalStorage has a **measurable but small** performance impact:

- **Node.js < v24.4.1**: ~5-10% overhead in high-throughput scenarios
- **Node.js >= v24.4.1**: Significant improvements, reduced overhead

**Benchmark Data** (from search results):
> "The AsyncLocalStorage improvement is particularly significant because most real-world applications will benefit directly from upgrading to Node.js v24.4.1."

> "Full OpenTelemetry auto-instrumentation reduced throughput by over 80%. AsyncLocalStorage has a non-negotiable performance hit, but it's quite small."

### Best Practices for Performance

1. **Limit AsyncLocalStorage Instances**: Don't create more than 10-15 instances
   > "Due to performance, you shouldn't really create more than 10-15 AsyncLocalStorages."

2. **Store Minimal Data**: Only store essential context (IDs, not large objects)

3. **Benchmark Your Use Case**: Measure actual impact in your application

4. **Consider Opt-Out**: Allow disabling context propagation in performance-critical paths

```typescript
const ENABLE_CONTEXT = process.env.ENABLE_CONTEXT !== 'false';

export function getLogger(): pino.Logger {
  if (!ENABLE_CONTEXT) {
    return baseLogger;
  }

  const ctx = pipelineContext.getStore();
  return ctx ? baseLogger.child(ctx) : baseLogger;
}
```

## OpenTelemetry Integration

AsyncLocalStorage is the foundation for OpenTelemetry in Node.js:

```typescript
import { trace } from '@opentelemetry/api';
import { AsyncLocalStorage } from 'async_hooks';

// OpenTelemetry uses AsyncLocalStorage under the hood
const span = trace.getActiveSpan();

if (span) {
  const traceId = span.spanContext().traceId;
  const spanId = span.spanContext().spanId;

  logger.info({ traceId, spanId }, 'Processing');
}
```

**Key Insight**:
> "Under the hood, the OpenTelemetry SDK for Node.js also uses AsyncLocalStorage to manage context on a per-request basis."

### Zero-Code Instrumentation

OpenTelemetry provides automatic instrumentation, but be aware of performance:

> "Full OpenTelemetry auto-instrumentation carries a massive performance penalty... highlighting a critical point: tracing is expensive and often unnecessary for most observability needs."

**Recommendation**: Use AsyncLocalStorage with Pino for lightweight correlation, not full OpenTelemetry tracing unless needed.

## Alternative: Express-HTTP-Context

For Express.js applications, `express-http-context` provides a simpler API:

```typescript
import httpContext from 'express-http-context';

app.use(httpContext.middleware);

app.use((req, res, next) => {
  httpContext.set('requestId', crypto.randomUUID());
  next();
});

// Access anywhere in the request
function someFunction() {
  const requestId = httpContext.get('requestId');
  logger.info({ requestId }, 'Processing');
}
```

**Note**: This library uses AsyncLocalStorage internally (since v1.2.0).

## Common Patterns

### Pattern 1: Request ID Generation

```typescript
import { AsyncLocalStorage } from 'async_hooks';
import crypto from 'crypto';

const requestStorage = new AsyncLocalStorage<string>();

app.use((req, res, next) => {
  const requestId = req.headers['x-request-id'] as string || crypto.randomUUID();
  requestStorage.run(requestId, () => {
    res.setHeader('x-request-id', requestId);
    next();
  });
});

export function getRequestId(): string | undefined {
  return requestStorage.getStore();
}
```

### Pattern 2: User Context

```typescript
interface UserContext {
  userId: string;
  tenantId: string;
  roles: string[];
}

const userContext = new AsyncLocalStorage<UserContext>();

// After authentication
app.use(async (req, res, next) => {
  const user = await authenticateUser(req);
  if (user) {
    userContext.run({
      userId: user.id,
      tenantId: user.tenantId,
      roles: user.roles
    }, () => next());
  } else {
    next();
  }
});

// Access user context anywhere
function getCurrentUser(): UserContext | undefined {
  return userContext.getStore();
}
```

### Pattern 3: Transaction Context

```typescript
interface TransactionContext {
  transactionId: string;
  startTime: number;
}

const txContext = new AsyncLocalStorage<TransactionContext>();

async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  const context: TransactionContext = {
    transactionId: crypto.randomUUID(),
    startTime: Date.now()
  };

  return txContext.run(context, async () => {
    try {
      const result = await fn();
      const duration = Date.now() - context.startTime;
      logger.info({ ...context, duration }, 'Transaction completed');
      return result;
    } catch (err) {
      const duration = Date.now() - context.startTime;
      logger.error({ ...context, duration, err }, 'Transaction failed');
      throw err;
    }
  });
}
```

## Error Handling

Ensure errors don't leak context:

```typescript
app.use((req, res, next) => {
  const requestId = crypto.randomUUID();

  requestStorage.run(requestId, () => {
    // Errors thrown here maintain context
    next();
  });
});

// Error handler has access to context
app.use((err, req, res, next) => {
  const requestId = requestStorage.getStore();
  logger.error({ requestId, err }, 'Request error');
  res.status(500).json({ error: 'Internal error', requestId });
});
```

## Testing with AsyncLocalStorage

```typescript
import { describe, it, expect } from 'vitest';
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<string>();

describe('AsyncLocalStorage', () => {
  it('maintains context across async operations', async () => {
    await storage.run('test-id', async () => {
      expect(storage.getStore()).toBe('test-id');

      await new Promise(resolve => setTimeout(resolve, 10));
      expect(storage.getStore()).toBe('test-id');  // Still available
    });
  });

  it('isolates contexts between runs', async () => {
    const promise1 = storage.run('id-1', async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return storage.getStore();
    });

    const promise2 = storage.run('id-2', async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      return storage.getStore();
    });

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe('id-1');
    expect(result2).toBe('id-2');
  });
});
```

## Sources

- [Contextual Logging in Node.js - Dash0](https://www.dash0.com/guides/contextual-logging-in-nodejs)
- [Node.js Async Context API Documentation](https://nodejs.org/api/async_context.html)
- [AsyncLocalStorage in Node.js 2025 - Medium](https://medium.com/@asierr/asynclocalstorage-in-node-js-2025-your-secret-weapon-for-context-propagation-%EF%B8%8F-a0e8ca9deef6)
- [Using AsyncLocalStorage - Real-World Use Cases](https://dev.to/george_k/using-asynclocalstorage-in-nodejs-real-world-use-cases-3ekd)
- [Using AsyncLocalStorage to Trace Requests](https://issalcedo.me/posts/node-localstorage-trace)
- [AsyncLocalStorage and Structured Logging in Nest.js](https://blog.haroldadmin.com/posts/asynclocalstorage-logs-nestjs)
- [AsyncLocalStorage: Simplify Context Management](https://www.trevorlasn.com/blog/node-async-local-storage)
- [Context Passing with AsyncLocalStorage - Code & Pepper](https://codeandpepper.com/asynclocalstorage-in-node-js/)
- [The Hidden Cost of Async Context](https://blog.platformatic.dev/the-hidden-cost-of-context)
