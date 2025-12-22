# ADR-002: AsyncLocalStorage for Context Propagation

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Architecture Phase
**Related**: PBI-LOGGING-001, ADR-003

## Context

The Chef pipeline needs to correlate logs across asynchronous operations without explicitly passing context (thread ID, step name) through every function call. The LangGraph pipeline has multiple nodes that execute asynchronously, and logs must be traceable to a specific pipeline run.

### Problem Statement

Traditional approaches to context propagation in Node.js have limitations:

1. **Parameter Passing**: Clutters function signatures, breaks existing APIs
   ```typescript
   // Ugly and invasive
   async function processOrder(order, threadId) {
     await validateOrder(order, threadId);
     await saveOrder(order, threadId);
     logger.info({ threadId }, 'Order processed');
   }
   ```

2. **Global Variables**: Not safe for concurrent requests/pipelines
   ```typescript
   // Breaks with concurrent pipelines
   let currentThreadId: string;
   ```

3. **Closure Binding**: Requires wrapping every async operation
   ```typescript
   // Brittle and error-prone
   const logger = baseLogger.child({ threadId });
   ```

### Requirements

- Automatically propagate thread ID and step name through async operations
- Support concurrent pipeline runs without context leakage
- Minimal performance impact (<10% overhead acceptable)
- Works with LangGraph's async execution model
- Type-safe and testable

## Decision

We will use **Node.js AsyncLocalStorage** (from `async_hooks` module) for automatic context propagation.

## Rationale

### How AsyncLocalStorage Works

AsyncLocalStorage creates isolated stores that remain coherent through asynchronous operations:

```typescript
import { AsyncLocalStorage } from 'async_hooks';

const storage = new AsyncLocalStorage<string>();

storage.run('thread-123', async () => {
  await someAsyncOperation();
  const threadId = storage.getStore(); // Still 'thread-123'
});
```

It's like thread-local storage, but for Node.js's asynchronous, event-driven model.

### Benefits for Chef Pipeline

1. **Automatic Propagation**: No need to pass context explicitly
   ```typescript
   // Context available anywhere in execution chain
   await runPipeline(threadId, async () => {
     await detectEvent();  // Has threadId
     await extractCandidates();  // Has threadId
   });
   ```

2. **Concurrent Safety**: Each pipeline run has isolated context
   ```typescript
   // No interference between concurrent runs
   Promise.all([
     runPipeline('thread-1', () => pipeline1()),
     runPipeline('thread-2', () => pipeline2())
   ]);
   ```

3. **Type Safety**: Full TypeScript support
   ```typescript
   interface PipelineContext {
     threadId: string;
     step?: string;
   }

   const storage = new AsyncLocalStorage<PipelineContext>();
   ```

4. **Integration with Pino**: Natural fit with child loggers
   ```typescript
   function getLogger(): pino.Logger {
     const context = storage.getStore();
     return context ? baseLogger.child(context) : baseLogger;
   }
   ```

### Performance Analysis

AsyncLocalStorage has measurable but acceptable overhead:

| Node.js Version | Overhead | Assessment |
|----------------|----------|------------|
| < v16.4.0 | 10-15% | Not recommended |
| v16.4.0 - v20 | 5-10% | Acceptable |
| >= v20.4.1 | <5% | Optimized |

**Chef Target**: Node.js ≥16.4.0 (LTS), overhead <10% acceptable for observability benefits.

**Benchmark Evidence** (from research):
> "AsyncLocalStorage has a non-negotiable performance hit, but it's quite small."
> "The AsyncLocalStorage improvement is particularly significant because most real-world applications will benefit directly from upgrading to Node.js v20.4.1."

### Official Node.js Endorsement

From Node.js documentation:
> "AsyncLocalStorage is useful for assigning IDs to incoming HTTP requests and including them in messages logged within each request."

This is exactly Chef's use case: assigning thread IDs to pipeline runs and including them in logs.

### Comparison with Alternatives

#### Alternative 1: Express-HTTP-Context

**Pros**:
- Simpler API for Express apps
- Built on AsyncLocalStorage (since v1.2.0)

**Cons**:
- Express-specific (doesn't help CLI/pipeline)
- Extra dependency
- Less flexible than direct AsyncLocalStorage

**Decision**: Use AsyncLocalStorage directly for flexibility across CLI and web.

#### Alternative 2: Explicit Context Passing

**Pros**:
- No performance overhead
- Explicit and traceable

**Cons**:
- Invasive API changes
- Clutters all function signatures
- Breaks existing code

**Decision**: Overhead acceptable for observability benefits.

#### Alternative 3: Closure-Based Context

**Pros**:
- No async_hooks dependency
- Explicit binding

**Cons**:
- Easy to lose context in callbacks
- Requires wrapping every async operation
- Error-prone

**Decision**: AsyncLocalStorage more reliable for complex async flows.

#### Alternative 4: OpenTelemetry SDK

**Pros**:
- Industry-standard tracing
- AsyncLocalStorage under the hood

**Cons**:
- Massive performance penalty (>80% overhead)
- Over-engineered for Chef's needs

**Decision**: AsyncLocalStorage with Pino is lightweight alternative.

From research:
> "Full OpenTelemetry auto-instrumentation reduced throughput by over 80%... highlighting a critical point: tracing is expensive and often unnecessary for most observability needs."

## Implementation Design

### Architecture

```typescript
// @chef/core/logger/context.ts
import { AsyncLocalStorage } from 'async_hooks';

interface PipelineContext {
  threadId: string;
  step?: string;
}

const pipelineContext = new AsyncLocalStorage<PipelineContext>();

// Run pipeline with thread context
export async function runPipeline<T>(
  threadId: string,
  fn: () => Promise<T>
): Promise<T> {
  return pipelineContext.run({ threadId }, fn);
}

// Run step with updated context
export async function runStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = pipelineContext.getStore();
  if (!context) {
    throw new Error('runStep called outside pipeline context');
  }

  return pipelineContext.run({ ...context, step: stepName }, fn);
}

// Get logger with current context
export function getContextLogger(): pino.Logger {
  const context = pipelineContext.getStore();
  return context ? baseLogger.child(context) : baseLogger;
}
```

### Usage Pattern

```typescript
// CLI command
const threadId = `cli-${Date.now()}`;

await runPipeline(threadId, async () => {
  await runStep('detectEvent', async () => {
    getContextLogger().info('Detecting event');
    // Log includes: { threadId: 'cli-123', step: 'detectEvent' }
  });

  await runStep('extractCandidates', async () => {
    getContextLogger().info('Extracting candidates');
    // Log includes: { threadId: 'cli-123', step: 'extractCandidates' }
  });
});
```

### Context Isolation

```typescript
// Concurrent pipelines don't interfere
await Promise.all([
  runPipeline('thread-1', () => processPipeline1()),
  runPipeline('thread-2', () => processPipeline2())
]);

// Each has isolated context
```

## Consequences

### Positive

1. **Clean API**: No context passing through function signatures
2. **Automatic Propagation**: Works across all async operations
3. **Type Safe**: Full TypeScript support
4. **Concurrent Safety**: Isolated contexts per pipeline run
5. **Standard Solution**: Official Node.js API, not a hack

### Negative

1. **Performance Overhead**: 5-10% in Node.js v16-v20 (<5% in v20.4.1+)
2. **Hidden Magic**: Less explicit than parameter passing
3. **Version Requirement**: Requires Node.js ≥16.4.0
4. **Testing Complexity**: Need to wrap tests in context

### Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Context lost in edge cases | High | Low | Comprehensive testing of async boundaries |
| Performance overhead | Medium | Medium | Benchmark early, upgrade to Node.js v20.4.1+ |
| Team unfamiliar with pattern | Low | High | Documentation, examples, clear API |
| Memory leaks | High | Very Low | AsyncLocalStorage auto-cleans on completion |

### Performance Mitigation

If overhead becomes unacceptable:

1. **Opt-out flag**: Allow disabling context propagation
   ```typescript
   const ENABLE_CONTEXT = process.env.ENABLE_ASYNC_CONTEXT !== 'false';
   ```

2. **Upgrade Node.js**: v20.4.1+ has <5% overhead

3. **Selective usage**: Only use in CLI, not in high-throughput web endpoints

### Best Practices

From research on AsyncLocalStorage performance:

1. **Limit instances**: Don't create more than 10-15 AsyncLocalStorage instances
   > "Due to performance, you shouldn't really create more than 10-15 AsyncLocalStorages."

2. **Store minimal data**: Only IDs and metadata, not large objects

3. **Measure impact**: Benchmark your specific use case

**Chef Implementation**: Single AsyncLocalStorage instance for pipeline context, stores only `{ threadId, step? }`.

## Validation

### Acceptance Criteria

- [ ] Context propagates through all async operations
- [ ] Concurrent pipelines have isolated contexts
- [ ] Performance overhead <10% (target <5% with Node.js v20.4.1+)
- [ ] Context automatically cleanup on completion
- [ ] Type-safe API with full TypeScript support

### Testing Strategy

1. **Unit Tests**: Context propagation across async operations
2. **Concurrency Tests**: No context leakage between parallel runs
3. **Performance Tests**: Benchmark overhead with/without context
4. **Integration Tests**: Full pipeline execution with logging

## References

- [Context Propagation Patterns](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/05-context-propagation-patterns.md)
- [Node.js AsyncLocalStorage API](https://nodejs.org/api/async_context.html)
- [AsyncLocalStorage Performance Analysis](https://blog.platformatic.dev/the-hidden-cost-of-context)
- [ADR-003: Child Logger Pattern](003-child-logger-pattern.md)

## Review and Approval

- Architecture Phase: Accepted
- Next Review: Implementation Phase (validate performance benchmarks)
- Performance Target: <10% overhead (measured in implementation)
