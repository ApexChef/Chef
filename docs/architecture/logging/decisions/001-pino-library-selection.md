# ADR-001: Use Pino for Logging Library

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Architecture Phase
**Related**: PBI-LOGGING-001

## Context

Chef requires a centralized logging infrastructure that supports:
- Multi-output logging (CLI console, web console, file persistence)
- Thread ID correlation for pipeline execution tracking
- High performance with minimal overhead (CLI tool requirement)
- TypeScript-first development
- Structured JSON logging for future aggregation

Two primary Node.js logging libraries were evaluated: **Pino** and **Winston**.

## Decision

We will use **Pino** as the logging library for the Chef project.

## Rationale

### Performance Requirements

Chef is a CLI tool where latency matters. Benchmarks show:

| Library | Throughput | CPU Overhead | CLI Latency Impact |
|---------|-----------|--------------|-------------------|
| Pino | 10,000+ logs/sec | <1% | <1ms |
| Winston | ~2,000 logs/sec | 3-5% | 2-5ms |

**Pino is 5-10x faster** than Winston due to:
1. Async by design (worker threads for transports)
2. JSON-native output (no formatting overhead)
3. Minimal abstractions per log call

### TypeScript Support

- **Pino**: Native TypeScript definitions included in package
- **Winston**: Requires separate `@types/winston` package

Pino's native types ensure:
- Always in sync with implementation
- No version mismatch issues
- Better developer experience

### Structured Logging

Pino outputs newline-delimited JSON (ndjson) by default:

```json
{"level":30,"time":1703251200000,"threadId":"cli-123","step":"detectEvent","msg":"Processing"}
```

This is ideal for:
- Machine parsing and log aggregation
- Future integration with ELK, Datadog, CloudWatch
- No formatting overhead in production

Winston requires manual JSON format configuration and adds overhead.

### Architecture Alignment

Pino's architecture aligns with Chef's needs:

1. **Worker Threads** (v7+): Transports run in separate threads, zero main thread blocking
2. **Child Loggers**: Natural fit for thread ID and step correlation
3. **Simplicity**: Convention over configuration, sane defaults
4. **Monorepo-Friendly**: Singleton pattern works well with @chef/core

### Developer Experience

**Development**: pino-pretty for human-readable, colorized output
**Production**: Raw JSON for performance and machine parsing

```bash
# Development output
[2025-12-22 10:30:45] INFO: Processing pipeline (threadId: cli-123, step: detectEvent)

# Production output
{"level":30,"time":1703251200000,"threadId":"cli-123","step":"detectEvent","msg":"Processing pipeline"}
```

### Ecosystem Maturity

| Aspect | Pino | Winston |
|--------|------|---------|
| GitHub Stars | 13k+ | 22k+ |
| npm Downloads/Week | ~1.5M | ~7M |
| Last Release | Active (2025) | Active (2025) |
| TypeScript Support | Native | @types required |
| Community | Growing | Established |

Both are actively maintained and production-ready. Pino's smaller community is offset by superior performance and simpler API.

## Comparison with Alternatives

### Winston

**Pros**:
- More established (larger community)
- winston-daily-rotate-file (better rotation than pino-roll)
- More flexible formatting options

**Cons**:
- 5-10x slower than Pino
- Synchronous by default (requires manual async config)
- Larger bundle size (~10MB vs ~5MB)
- Requires @types package
- More complex configuration

**Decision**: Performance is critical for CLI tools. Pino's speed advantage outweighs Winston's flexibility.

### Bunyan

**Pros**:
- Similar to Pino (JSON-native, fast)
- Mature and stable

**Cons**:
- Effectively unmaintained (last major update 2016)
- Slower than Pino
- No TypeScript definitions

**Decision**: Pino is the modern successor to Bunyan with active maintenance.

### Console (built-in)

**Pros**:
- Zero dependencies
- Simple

**Cons**:
- No structured logging
- No log levels or filtering
- No multi-output support
- No context correlation

**Decision**: Insufficient for production observability needs.

## Consequences

### Positive

1. **Performance**: Minimal impact on pipeline execution (<1% overhead)
2. **Type Safety**: Native TypeScript support reduces bugs and improves DX
3. **JSON Output**: Future-proof for log aggregation services
4. **Simplicity**: Less configuration, faster development
5. **Modern Architecture**: Worker threads, async I/O

### Negative

1. **Smaller Ecosystem**: Fewer community transports than Winston (acceptable tradeoff)
2. **Log Rotation**: pino-roll less mature than winston-daily-rotate-file (mitigated: can use system logrotate)
3. **Raw Logs Hard to Read**: Requires pino-pretty in development (mitigated: configure via NODE_ENV)

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| pino-roll bugs | Fallback to system logrotate utility |
| Limited flexibility | Pino's ecosystem sufficient for Chef's needs |
| Team unfamiliar with Pino | Documentation, examples, and simpler API than Winston |

## Implementation Impact

### Required Changes

1. Add Pino dependencies to @chef/core
2. Replace existing `createLogger()` implementation
3. Update pipeline nodes to use new logger API
4. Add pino-pretty for development
5. Configure pino-roll for production log rotation

### Backward Compatibility

The existing `createLogger()` API will be maintained for backward compatibility:

```typescript
// Old API (still works)
const logger = createLogger('namespace');
logger.info('message', { context });

// New API (Pino-based)
const logger = getLogger();
logger.info({ context }, 'message');
```

Internal implementation changes to Pino while preserving public interface.

## References

- [Pino vs Winston Comparison](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/09-library-comparison.md)
- [Pino Documentation](https://github.com/pinojs/pino)
- [Pino Performance Benchmarks](https://github.com/pinojs/pino/blob/main/docs/benchmarks.md)
- [PBI-LOGGING-001](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/backlog/active/PBI-LOGGING-001.md)

## Review and Approval

- Architecture Phase: Accepted
- Next Review: Implementation Phase (validate performance benchmarks)
