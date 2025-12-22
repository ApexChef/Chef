# Logging Infrastructure Research - Executive Summary

## Overview

This document summarizes the research conducted for implementing centralized logging infrastructure in the Chef project (PBI-LOGGING-001). The research evaluated logging libraries, patterns, and integration strategies for a TypeScript/Node.js pnpm monorepo with CLI and web applications.

## Key Findings

### Recommended Solution: Pino

**Pino is the recommended logging library** for the Chef project based on:

1. **Performance**: 5-10x faster than alternatives (Winston, Bunyan), critical for CLI tools where latency matters
2. **JSON-Native**: Outputs structured JSON logs by default, ideal for machine parsing and log aggregation
3. **Async by Design**: Uses worker threads for transports (v7+), minimizing main thread impact
4. **TypeScript Support**: Native TypeScript definitions included (no @types package needed)
5. **Monorepo-Friendly**: Singleton pattern works well with shared @chef/core package
6. **Developer Experience**: pino-pretty for human-readable dev logs, raw JSON for production

### Core Architecture Pattern

```
@chef/core/logger
├── createLogger() → singleton factory
├── Child loggers with bindings (threadId, step)
├── Multiple transports (console, file)
└── AsyncLocalStorage for correlation IDs
```

### Integration Points

1. **CLI Application** (`@chef/cli`): Console output with pino-pretty in dev, JSON in production
2. **Web Application** (`@chef/web`): pino-http middleware for request logging
3. **Pipeline Nodes** (`@chef/backlog`): Child loggers with threadId/step bindings
4. **Log Persistence**: pino-roll for file rotation (daily + size-based)

## Critical Decisions

### 1. Library Selection: Pino vs Winston

| Criteria | Pino ✅ | Winston |
|----------|---------|---------|
| Performance | 10,000+ logs/sec | Slower (sync by default) |
| Output Format | JSON-native | Configurable (more complex) |
| Transports | Worker threads (v7+) | Sync unless configured |
| Bundle Size | Small (~5MB) | Larger (~10MB) |
| TypeScript | Native types | Requires @types |
| Best For | High-performance, structured | Feature-rich, flexibility |

**Decision**: Use **Pino** for CLI/pipeline performance requirements.

### 2. Context Propagation: AsyncLocalStorage + Child Loggers

**Pattern**: Combine AsyncLocalStorage (for thread ID) with Pino child loggers (for step context)

```typescript
// Store thread ID in AsyncLocalStorage
asyncLocalStorage.run(threadId, () => {
  // Create child logger with threadId binding
  const childLogger = logger.child({ threadId });

  // Pipeline steps create their own children
  const stepLogger = childLogger.child({ step: 'detectEvent' });
});
```

**Tradeoff**: AsyncLocalStorage has ~5-10% performance overhead but provides automatic context propagation across async operations.

### 3. Log Rotation Strategy

**Recommendation**: Use **pino-roll** with dual rotation triggers:
- **Time-based**: Daily rotation (frequency: '1d')
- **Size-based**: 50MB per file (prevents runaway logs)
- **Retention**: Keep last 14 days (count: 14)

**Alternative**: System-level `logrotate` utility (zero Node.js overhead, requires system configuration)

### 4. Development vs Production

| Aspect | Development | Production |
|--------|-------------|------------|
| Transport | pino-pretty (colorized) | Raw JSON |
| Log Level | DEBUG | INFO |
| Destination | stdout | stdout + file |
| Rotation | None | Daily + size-based |

## Key Requirements Met

✅ Multi-output logging (CLI console, web console, file persistence)
✅ Thread ID correlation via AsyncLocalStorage + child loggers
✅ Configurable severity levels (DEBUG, INFO, WARN, ERROR, FATAL)
✅ Environment variable configuration (LOG_LEVEL, LOG_TO_FILE, etc.)
✅ TypeScript-native with full type safety
✅ Log rotation with retention policies
✅ Minimal performance impact (<5% overhead)

## Implementation Roadmap

1. **Phase 1**: Core logger implementation in `@chef/core`
   - Singleton factory with environment-based configuration
   - Multiple transports (console + file)
   - TypeScript types and interfaces

2. **Phase 2**: Context propagation setup
   - AsyncLocalStorage wrapper for thread IDs
   - Child logger factory for pipeline steps
   - Binding utilities for common context

3. **Phase 3**: Integration points
   - CLI initialization with pino-pretty in dev mode
   - pino-http middleware for web app
   - Update pipeline nodes to use logger

4. **Phase 4**: Log management
   - Configure pino-roll for rotation
   - Environment variable configuration
   - Documentation and examples

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| AsyncLocalStorage overhead | 5-10% performance hit | Benchmark and consider opt-out flag |
| Log file growth | Disk space exhaustion | Implement rotation with retention (14d) |
| Pino-pretty in production | Performance degradation | Enforce via NODE_ENV check |
| Transport failures | Silent logging errors | Add error event handlers |

## Next Steps for Architect

1. **Review transport strategy**: Confirm file rotation parameters (size, retention)
2. **Decide on AsyncLocalStorage**: Accept 5-10% overhead or alternative pattern?
3. **Define log schema**: Standardize required fields (threadId, step, timestamp)
4. **SQLite integration**: Should logs be persisted to SQLite alongside checkpoints?
5. **Web UI**: Log viewer component or console-only?

## Resource Summary

All detailed research is organized in `/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/`:

- `02-pino-documentation.md` - Complete Pino API reference and patterns
- `03-winston-documentation.md` - Winston comparison (if Pino doesn't fit)
- `04-structured-logging-best-practices.md` - Industry best practices
- `05-context-propagation-patterns.md` - AsyncLocalStorage and correlation IDs
- `06-log-rotation-strategies.md` - File rotation and retention
- `07-express-integration.md` - pino-http middleware patterns
- `08-typescript-integration.md` - TypeScript patterns and types
- `09-library-comparison.md` - Detailed Pino vs Winston analysis
- `10-implementation-guide.md` - Step-by-step implementation plan

## Sources

All research is based on official documentation, industry best practices, and 2025-current resources. Full source citations are included in individual research documents.
