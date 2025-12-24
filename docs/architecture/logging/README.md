# Logging Infrastructure Architecture

## Overview

This document defines the architecture for Chef's centralized logging infrastructure (PBI-LOGGING-001). The logging system provides multi-output, thread-correlated logging across CLI, web, and pipeline components using Pino as the underlying logging library.

**Status**: Architecture Phase
**Version**: 1.0
**Last Updated**: 2025-12-22
**Architect**: Claude Opus 4.5

## Architecture Goals

1. **Observability**: Enable debugging and monitoring of pipeline execution through comprehensive logging
2. **Correlation**: Track execution flow across async operations using thread IDs
3. **Performance**: Minimize logging overhead (<5% impact) using async I/O
4. **Flexibility**: Support multiple output targets (console, file, future: aggregation services)
5. **Type Safety**: Full TypeScript support with strong type inference
6. **Maintainability**: Clean separation of concerns, testable components

## Key Architectural Decisions

All architectural decisions are documented as ADRs in the `decisions/` directory:

- [ADR-001: Use Pino for Logging Library](decisions/001-pino-library-selection.md)
- [ADR-002: AsyncLocalStorage for Context Propagation](decisions/002-asynclocalstorage-context.md)
- [ADR-003: Child Logger Pattern for Thread Correlation](decisions/003-child-logger-pattern.md)
- [ADR-004: Logger Singleton in @chef/core](decisions/004-singleton-in-core.md)
- [ADR-005: Environment-Based Configuration](decisions/005-environment-configuration.md)

## System Context

```
┌─────────────────────────────────────────────────────────────┐
│                    Chef Logging System                       │
│                                                               │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐           │
│  │   CLI     │    │    Web    │    │  Pipeline │           │
│  │   App     │───▶│    App    │───▶│  Backlog  │           │
│  └───────────┘    └───────────┘    └───────────┘           │
│        │                │                  │                 │
│        └────────────────┴──────────────────┘                 │
│                         │                                    │
│                         ▼                                    │
│              ┌─────────────────────┐                        │
│              │   @chef/core/logger │                        │
│              │   (Pino Singleton)  │                        │
│              └─────────────────────┘                        │
│                         │                                    │
│         ┌───────────────┼───────────────┐                   │
│         ▼               ▼               ▼                   │
│   ┌──────────┐   ┌──────────┐   ┌──────────┐              │
│   │ Console  │   │   File   │   │  Future: │              │
│   │ (stdout) │   │ (rotated)│   │  Remote  │              │
│   └──────────┘   └──────────┘   └──────────┘              │
│                                                               │
└─────────────────────────────────────────────────────────────┘

External Systems:
- Development: pino-pretty for human-readable logs
- Production: JSON logs for machine parsing
- Future: ELK, Datadog, CloudWatch (out of scope)
```

## Components

### Core Components

1. **Logger Factory** (`@chef/core/logger/factory.ts`)
   - Singleton pattern for logger instance
   - Environment-based configuration
   - Multi-transport setup (console + file)
   - Development vs production mode handling

2. **Context Manager** (`@chef/core/logger/context.ts`)
   - AsyncLocalStorage for context propagation
   - Pipeline and step context wrappers
   - Automatic context cleanup

3. **Type Definitions** (`@chef/core/logger/types.ts`)
   - TypeScript interfaces for logger configuration
   - Pipeline context types
   - Log entry schemas

### Integration Points

1. **CLI Integration** (`apps/cli/src/commands/`)
   - Logger initialization with CLI-specific config
   - Thread ID generation for pipeline runs
   - pino-pretty for development output

2. **Pipeline Integration** (`packages/backlog/src/pipeline/`)
   - Context wrapper for pipeline execution
   - Child loggers with step bindings
   - Automatic thread ID propagation

3. **Web Integration** (`apps/web/`)
   - pino-http middleware for request logging
   - Request ID correlation
   - Structured error logging

## Technology Stack

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Core Logger | Pino | 8.17.2+ | Performance (5-10x faster than Winston) |
| Dev Output | pino-pretty | 10.3.1+ | Human-readable development logs |
| Log Rotation | pino-roll | 1.1.0+ | File rotation with size + time triggers |
| Context | AsyncLocalStorage | Node.js native | Zero dependency, native async tracking |
| Web Middleware | pino-http | 9.0.0+ | Express/Fastify integration |

## Quality Attributes

### Performance

**Target**: <5% overhead from logging operations

**Strategy**:
- Async I/O via Pino worker threads
- JSON-native output (no formatting overhead)
- Minimal AsyncLocalStorage usage (single instance)

**Validation**:
- Benchmark 100k logs should complete <1000ms
- Pipeline execution time should increase <3% with logging enabled

### Scalability

**Target**: Handle 1000+ pipeline runs concurrently

**Strategy**:
- Stateless logger design (no in-memory accumulation)
- Log rotation to prevent disk exhaustion
- Configurable log levels to reduce volume

**Validation**:
- Load test with 1000 concurrent pipeline runs
- Verify log file rotation triggers correctly
- Monitor disk I/O during high load

### Reliability

**Target**: Zero log loss, graceful degradation on errors

**Strategy**:
- Error handlers on transport failures
- Fallback to console if file write fails
- Non-blocking async writes

**Validation**:
- Simulate disk full scenario
- Verify graceful fallback behavior
- Test error boundary handling

### Maintainability

**Target**: Easy to extend, test, and modify

**Strategy**:
- Clean separation of concerns (factory, context, transports)
- Dependency injection for testing
- Comprehensive TypeScript types

**Validation**:
- Unit test coverage >80%
- Integration test for full pipeline logging
- Documentation coverage for all public APIs

## Constraints and Assumptions

### Technical Constraints

1. **Node.js Version**: Requires Node.js ≥16.4.0 for AsyncLocalStorage
2. **Monorepo Structure**: Logger must be in @chef/core to be dependency-free
3. **LangGraph Pipeline**: Must work with async pipeline execution model
4. **TypeScript**: All code must be TypeScript-first with strict types

### Business Constraints

1. **Timeline**: Implementation in 4 weeks (per PBI estimates)
2. **Team Size**: Single developer implementation
3. **Backward Compatibility**: Must not break existing @chef/core consumers

### Quality Attribute Priorities

1. **Performance** (Critical): CLI tools require minimal latency
2. **Observability** (High): Enable debugging production issues
3. **Simplicity** (High): Easy to use and understand
4. **Extensibility** (Medium): Future integration with log aggregation services

### External Constraints

1. **No Cloud Dependencies**: Must work in offline/air-gapped environments
2. **No Breaking Changes**: Existing `createLogger()` API must continue to work
3. **Monorepo Constraints**: Cannot depend on other @chef/* packages

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| AsyncLocalStorage performance overhead | High | Medium | Benchmark early, provide opt-out flag |
| Log file disk exhaustion | High | Low | Implement rotation with retention limits |
| Context lost in edge cases | Medium | Medium | Comprehensive testing of async boundaries |
| Migration effort for existing code | Medium | High | Maintain backward compatibility, gradual migration |
| pino-roll bugs or limitations | Low | Low | Fallback to system logrotate if needed |

## Security Considerations

### Data Protection

1. **Sensitive Data Redaction**: Implement serializers to redact passwords, tokens, API keys
2. **PII Handling**: Ensure user data is logged only when necessary, with consent
3. **Log File Permissions**: Set restrictive permissions (600) on log files

### Access Control

1. **Log File Access**: Restrict to application user and administrators
2. **Web Console**: Require authentication for log viewer (future feature)
3. **Audit Logging**: Separate audit logs from application logs (future)

### Compliance

1. **Data Retention**: Configurable retention period (default: 14 days)
2. **GDPR**: Support for log deletion on data erasure requests
3. **Encryption**: Optional encryption at rest for sensitive environments

## Deployment Architecture

### Development Environment

```
┌─────────────────────────────────────────┐
│ Development Machine                     │
│                                          │
│  ┌────────────┐                         │
│  │   CLI      │                         │
│  │   pnpm dev │                         │
│  └─────┬──────┘                         │
│        │                                 │
│        ▼                                 │
│  ┌────────────────────┐                 │
│  │ pino-pretty        │                 │
│  │ (colorized output) │                 │
│  └────────────────────┘                 │
│        │                                 │
│        ▼                                 │
│  Terminal stdout                        │
│                                          │
└─────────────────────────────────────────┘
```

**Configuration**:
- `NODE_ENV=development`
- `LOG_LEVEL=debug`
- `LOG_TO_FILE=false`
- pino-pretty enabled

### Production Environment

```
┌─────────────────────────────────────────┐
│ Production Server                       │
│                                          │
│  ┌────────────┐                         │
│  │  CLI/Web   │                         │
│  │   App      │                         │
│  └─────┬──────┘                         │
│        │                                 │
│        ▼                                 │
│  ┌────────────────────┐                 │
│  │ Pino JSON Output   │                 │
│  └─────┬──────┬───────┘                 │
│        │      │                          │
│    ┌───┘      └───┐                     │
│    ▼              ▼                      │
│ stdout      logs/chef.log               │
│    │          (rotated)                  │
│    │              │                      │
│    │              └─ Retention: 14d     │
│    │                 Size: 50MB max     │
│    │                                     │
│    └─ (container logs, CloudWatch, etc)│
│                                          │
└─────────────────────────────────────────┘
```

**Configuration**:
- `NODE_ENV=production`
- `LOG_LEVEL=info`
- `LOG_TO_FILE=true`
- `LOG_FILE_PATH=/var/log/chef/chef.log`
- Raw JSON output (no pino-pretty)

## Next Steps for Implementation

Implementation will proceed through the Code phase with the following milestones:

1. **Week 1**: Core logger implementation
   - Logger factory and singleton
   - AsyncLocalStorage context
   - TypeScript types

2. **Week 2**: Integration
   - CLI integration
   - Pipeline node updates
   - Testing infrastructure

3. **Week 3**: Web integration and configuration
   - pino-http middleware
   - Environment configuration
   - Log rotation setup

4. **Week 4**: Documentation and validation
   - API documentation
   - Usage examples
   - Performance benchmarks

## Documentation Index

- [Architecture Overview](README.md) (this document)
- [Architecture Decision Records](decisions/)
- [Component Diagrams](diagrams/)
- [Technical Specifications](specifications/)
- [API Contracts](api-contracts/)
- [Deployment Guide](deployment/)
- [Security Specification](security/)

## References

- [PBI-LOGGING-001](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/backlog/active/PBI-LOGGING-001.md)
- [Preparation Research](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/preparation/logging/)
- [Pino Documentation](https://github.com/pinojs/pino)
- [AsyncLocalStorage API](https://nodejs.org/api/async_context.html)
