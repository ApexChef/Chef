# ADR-003: Child Logger Pattern for Thread Correlation

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Architecture Phase
**Related**: PBI-LOGGING-001, ADR-001, ADR-002

## Context

Logs must include thread ID and step name to correlate log entries across a pipeline run. Pino supports multiple approaches for adding context to logs:

1. **Manual context per log**: `logger.info({ threadId }, 'message')`
2. **Child loggers with bindings**: `logger.child({ threadId })`
3. **Serializers**: Transform objects before logging
4. **Custom formatters**: Modify log output format

We need a pattern that:
- Automatically includes threadId and step in every log
- Requires minimal changes to logging call sites
- Performs well (no overhead per log call)
- Supports context updates (adding step name)

## Decision

We will use **Pino child loggers with bindings** combined with **AsyncLocalStorage** for automatic context injection.

## Rationale

### Child Logger Mechanics

Pino child loggers create loggers with permanent bindings:

```typescript
const baseLogger = pino();
const childLogger = baseLogger.child({ threadId: 'cli-123' });

// All logs from child include threadId
childLogger.info('Processing');
// Output: {"level":30,"threadId":"cli-123","msg":"Processing"}
```

**Key Properties**:
- **Zero per-call overhead**: Bindings added once during child creation
- **Immutable bindings**: Cannot be accidentally overridden
- **Nested children**: Children can create their own children
- **Type-safe**: Full TypeScript support

### Integration with AsyncLocalStorage

Combine AsyncLocalStorage (ADR-002) with child loggers:

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const pipelineContext = new AsyncLocalStorage<PipelineContext>();
const baseLogger = pino();

export function getContextLogger(): pino.Logger {
  const context = pipelineContext.getStore();
  if (context) {
    return baseLogger.child(context);  // Create child with context bindings
  }
  return baseLogger;
}

// Usage
await runPipeline(threadId, async () => {
  getContextLogger().info('Starting');  // Includes threadId
});
```

### Pattern: Hierarchical Context

Step context builds on thread context:

```typescript
await runPipeline('cli-123', async () => {
  // threadId: 'cli-123'

  await runStep('detectEvent', async () => {
    // threadId: 'cli-123', step: 'detectEvent'
    getContextLogger().info('Detecting');
  });

  await runStep('extractCandidates', async () => {
    // threadId: 'cli-123', step: 'extractCandidates'
    getContextLogger().info('Extracting');
  });
});
```

Implementation:

```typescript
export async function runStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = pipelineContext.getStore();
  if (!context) {
    throw new Error('runStep called outside pipeline');
  }

  // Create new context with step name
  const stepContext = { ...context, step: stepName };
  return pipelineContext.run(stepContext, fn);
}
```

### Performance Analysis

**Child Logger Creation**:
- One-time cost per context change
- Negligible overhead (~0.001ms)

**Log Calls**:
- Zero overhead vs base logger
- Bindings baked in during child creation

**Comparison with Alternatives**:

| Approach | Per-Call Overhead | Context Safety | Flexibility |
|----------|------------------|----------------|-------------|
| Child logger | None | High | Medium |
| Manual context | JSON.stringify per call | Low | High |
| Serializers | Function call per log | Medium | Low |

**Decision**: Child logger has best performance for frequent logging.

### Comparison with Alternatives

#### Alternative 1: Manual Context Per Log

```typescript
logger.info({ threadId, step }, 'Processing');
```

**Pros**:
- Maximum flexibility
- Explicit and clear

**Cons**:
- Must remember to add context every time
- Easy to forget or make mistakes
- More verbose
- Overhead of object creation per log

**Decision**: Child logger is more reliable and performant.

#### Alternative 2: Serializers

```typescript
pino({
  serializers: {
    addContext: (obj) => ({ ...obj, threadId: getCurrentThreadId() })
  }
});

logger.info({ addContext: {} }, 'Processing');
```

**Pros**:
- Centralized logic

**Cons**:
- Requires special object per log
- Function call overhead
- Not automatic
- Awkward API

**Decision**: Child logger is more natural.

#### Alternative 3: Custom Formatters

```typescript
pino({
  formatters: {
    log: (obj) => ({ ...obj, threadId: getCurrentThreadId() })
  }
});
```

**Pros**:
- Automatic injection

**Cons**:
- Runs on every log (overhead)
- Cannot vary by context (same for all logs)
- Formatter must access global state

**Decision**: Child logger with AsyncLocalStorage is cleaner.

#### Alternative 4: Logger Wrapper Class

```typescript
class ContextLogger {
  constructor(private logger: pino.Logger, private context: Context) {}

  info(msg: string) {
    this.logger.info(this.context, msg);
  }
}
```

**Pros**:
- Explicit control

**Cons**:
- Must pass wrapper everywhere
- Loses Pino's API
- More code to maintain

**Decision**: Pino child logger is built-in solution.

## Implementation Design

### Architecture

```typescript
// @chef/core/logger/context.ts
import { AsyncLocalStorage } from 'async_hooks';
import pino from 'pino';

interface PipelineContext {
  threadId: string;
  step?: string;
}

const pipelineContext = new AsyncLocalStorage<PipelineContext>();
const baseLogger = pino(/* config */);

// Get logger with current context as child bindings
export function getContextLogger(): pino.Logger {
  const context = pipelineContext.getStore();
  if (context) {
    return baseLogger.child(context);  // Bindings: { threadId, step? }
  }
  return baseLogger;
}

// For when you need specific additional context
export function getLoggerWithBindings(
  additionalBindings: pino.Bindings
): pino.Logger {
  const context = pipelineContext.getStore();
  const bindings = context ? { ...context, ...additionalBindings } : additionalBindings;
  return baseLogger.child(bindings);
}
```

### Usage Patterns

#### Pattern 1: Standard Logging

```typescript
import { getContextLogger } from '@chef/core/logger';

await runStep('detectEvent', async () => {
  const logger = getContextLogger();
  logger.info('Starting detection');
  logger.info({ candidateCount: 5 }, 'Found candidates');
});

// Output:
// {"level":30,"threadId":"cli-123","step":"detectEvent","msg":"Starting detection"}
// {"level":30,"threadId":"cli-123","step":"detectEvent","candidateCount":5,"msg":"Found candidates"}
```

#### Pattern 2: Additional Context

```typescript
await runStep('riskAnalysis', async () => {
  const logger = getLoggerWithBindings({ candidateId: 'pbi-001' });
  logger.info('Analyzing risk');
});

// Output:
// {"level":30,"threadId":"cli-123","step":"riskAnalysis","candidateId":"pbi-001","msg":"Analyzing risk"}
```

#### Pattern 3: Error Logging

```typescript
try {
  await processCandidate(candidate);
} catch (error) {
  getContextLogger().error({ err: error }, 'Processing failed');
}

// Output includes thread, step, and error with stack trace
```

#### Pattern 4: Child of Child (Nested Context)

```typescript
await runStep('enrichContext', async () => {
  const stepLogger = getContextLogger();
  stepLogger.info('Enriching context');

  // Create sub-logger for specific candidate
  const candidateLogger = stepLogger.child({ candidateId: 'pbi-001' });
  candidateLogger.info('Fetching related data');
});

// Output:
// {"threadId":"cli-123","step":"enrichContext","msg":"Enriching context"}
// {"threadId":"cli-123","step":"enrichContext","candidateId":"pbi-001","msg":"Fetching related data"}
```

### Context Flow Diagram

```
runPipeline('cli-123')
  └─> AsyncLocalStorage: { threadId: 'cli-123' }
      └─> getContextLogger() → child({ threadId: 'cli-123' })

      runStep('detectEvent')
        └─> AsyncLocalStorage: { threadId: 'cli-123', step: 'detectEvent' }
            └─> getContextLogger() → child({ threadId: 'cli-123', step: 'detectEvent' })

      runStep('extractCandidates')
        └─> AsyncLocalStorage: { threadId: 'cli-123', step: 'extractCandidates' }
            └─> getContextLogger() → child({ threadId: 'cli-123', step: 'extractCandidates' })
```

## Consequences

### Positive

1. **Automatic Context**: Thread and step included in every log without manual effort
2. **Zero Overhead**: Bindings added once, not per log call
3. **Type Safe**: Full TypeScript support for context and logger
4. **Immutable**: Bindings cannot be accidentally overridden
5. **Hierarchical**: Supports nested context (step within thread)
6. **Pino-Native**: Uses built-in feature, not a custom solution

### Negative

1. **New Pattern**: Team must learn getContextLogger() instead of direct logger
2. **Context Dependency**: Requires AsyncLocalStorage setup (ADR-002)
3. **Testing**: Tests must wrap code in runPipeline/runStep

### Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Forgetting to use getContextLogger() | Medium | Medium | Lint rule, code review, documentation |
| Child logger created per log | High | Low | Proper implementation, performance tests |
| Context not available | Medium | Low | Fallback to base logger, clear error messages |

### Migration from Existing Logger

Existing code uses:
```typescript
const logger = createLogger('namespace');
logger.info('message', { context });
```

New code uses:
```typescript
const logger = getContextLogger();
logger.info({ context }, 'message');
```

**Migration Strategy**:
1. Phase 1: Add new logger alongside old
2. Phase 2: Update pipeline nodes to new logger
3. Phase 3: Deprecate old logger (if desired)

**Backward Compatibility**: Keep old `createLogger()` for non-pipeline code.

## Validation

### Acceptance Criteria

- [ ] All logs within pipeline include threadId
- [ ] All logs within step include step name
- [ ] Child logger creation does not impact performance
- [ ] Context updates correctly when moving between steps
- [ ] Fallback to base logger when context not available

### Testing Strategy

1. **Unit Tests**: Verify child logger bindings
2. **Integration Tests**: Full pipeline with logging
3. **Performance Tests**: Ensure no per-call overhead
4. **Concurrency Tests**: Isolated contexts in parallel pipelines

### Example Test

```typescript
it('includes context in all logs', async () => {
  const logs: any[] = [];
  const mockLogger = pino({ /* capture logs */ });

  await runPipeline('test-123', async () => {
    await runStep('testStep', async () => {
      getContextLogger().info('test message');
    });
  });

  expect(logs[0]).toMatchObject({
    threadId: 'test-123',
    step: 'testStep',
    msg: 'test message'
  });
});
```

## References

- [Pino Child Loggers](https://github.com/pinojs/pino/blob/main/docs/child-loggers.md)
- [ADR-001: Pino Library Selection](001-pino-library-selection.md)
- [ADR-002: AsyncLocalStorage for Context](002-asynclocalstorage-context.md)
- [TypeScript Integration Patterns](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/08-typescript-integration.md)

## Review and Approval

- Architecture Phase: Accepted
- Next Review: Implementation Phase (validate API ergonomics)
