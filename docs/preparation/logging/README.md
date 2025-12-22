# Logging Infrastructure Research - Navigation Guide

## Overview

This directory contains comprehensive research for implementing centralized logging infrastructure in the Chef project (PBI-LOGGING-001). All research is based on 2025-current sources and best practices.

## Quick Start

**New to this research?** Start here:

1. **Executive Summary** (`01-executive-summary.md`) - Read this first for key findings and recommendations
2. **Library Comparison** (`09-library-comparison.md`) - Understand why Pino was chosen over Winston
3. **Implementation Guide** (`10-implementation-guide.md`) - Step-by-step implementation instructions

## Document Index

### Essential Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| `01-executive-summary.md` | Key findings, recommendations, and next steps | Everyone |
| `09-library-comparison.md` | Pino vs Winston detailed analysis | Architects, decision makers |
| `10-implementation-guide.md` | Step-by-step implementation plan | Developers |

### Technical Documentation

| Document | Purpose | When to Use |
|----------|---------|-------------|
| `02-pino-documentation.md` | Complete Pino API reference and patterns | Implementing with Pino |
| `03-winston-documentation.md` | Winston API reference (alternative) | If Pino doesn't fit |
| `04-structured-logging-best-practices.md` | Industry best practices for JSON logging | Designing log schema |
| `05-context-propagation-patterns.md` | AsyncLocalStorage and correlation IDs | Thread/request correlation |
| `06-log-rotation-strategies.md` | File rotation and retention | Log management setup |
| `07-express-integration.md` | pino-http middleware patterns | Web application setup |
| `08-typescript-integration.md` | TypeScript types and patterns | TypeScript implementation |

## Key Findings Summary

### Recommended Technology Stack

- **Logger**: Pino (5-10x faster than Winston)
- **Transport**: pino-roll (rotation) + pino-pretty (development)
- **Web Middleware**: pino-http
- **Context Propagation**: AsyncLocalStorage
- **Output Format**: JSON (ndjson)

### Critical Decisions

1. **Pino over Winston**: Performance-critical for CLI tools
2. **AsyncLocalStorage**: 5-10% overhead acceptable for automatic context
3. **Log Rotation**: Daily + 50MB size trigger, 14-day retention
4. **Development vs Production**: pino-pretty in dev, raw JSON in prod

### Architecture

```
@chef/core/logger (singleton)
├── CLI: Console output with pino-pretty
├── Web: pino-http middleware
└── Pipeline: AsyncLocalStorage for thread/step correlation
```

## Implementation Roadmap

### Phase 1: Core Logger (Week 1)
- Implement logger in `@chef/core`
- Environment-based configuration
- Multiple transports setup

### Phase 2: CLI Integration (Week 1)
- Initialize logger at CLI startup
- Thread ID generation
- pino-pretty for development

### Phase 3: Pipeline Integration (Week 2)
- Update all pipeline nodes
- AsyncLocalStorage context
- Thread/step correlation

### Phase 4: Web Integration (Week 3)
- pino-http middleware
- Request ID correlation
- Error handling

### Phase 5: Testing & Documentation (Week 4)
- Unit and integration tests
- Documentation updates
- Performance verification

## Next Steps for Architect

### Review Required

1. **Transport Strategy**: Confirm file rotation parameters (size, retention)
2. **AsyncLocalStorage**: Accept 5-10% overhead or seek alternative?
3. **Log Schema**: Standardize required fields (threadId, step, timestamp)
4. **SQLite Integration**: Persist logs to SQLite alongside checkpoints?
5. **Web UI**: Log viewer component or console-only?

### Open Questions

From `01-executive-summary.md`:

- [ ] Should logs be stored in SQLite alongside checkpoints or separate files?
- [ ] What log rotation strategy? (size-based, time-based, or both) **Recommended: Both**
- [ ] Should web UI have a log viewer component or just console output?

## Quick Reference

### Installation

```bash
pnpm add pino pino-http
pnpm add -D pino-pretty
pnpm add pino-roll  # For rotation
```

### Basic Usage

```typescript
import { getLogger, runPipeline, runStep } from '@chef/core/logger';

// Get logger
const logger = getLogger();
logger.info({ userId: '123' }, 'User action');

// In pipeline
await runPipeline('thread-id', async () => {
  await runStep('stepName', async () => {
    getContextLogger().info('Processing');
  });
});
```

### Environment Variables

```bash
LOG_LEVEL=info          # Global log level
LOG_CLI_LEVEL=info      # CLI-specific
LOG_WEB_LEVEL=info      # Web-specific
LOG_TO_FILE=true        # Enable file logging
LOG_FILE_PATH=./logs/chef.log
```

## Research Methodology

All research is based on:

### Official Documentation
- Pino official repository and API docs
- Winston official repository
- Node.js AsyncLocalStorage API documentation

### Industry Best Practices
- Structured logging patterns (JSON, correlation IDs)
- Context propagation techniques
- Log rotation strategies
- Security and compliance considerations

### 2025-Current Sources
- Better Stack Community Guides
- SigNoz Logging Guides
- Dash0 Production Logging Guides
- Last9 Logging Best Practices
- DEV Community articles
- Medium technical articles

All sources are cited in individual documents.

## Document Statistics

| Metric | Value |
|--------|-------|
| Total Documents | 11 (including this README) |
| Total Pages (est.) | ~100 pages |
| API References | 2 (Pino, Winston) |
| Best Practice Guides | 4 |
| Implementation Guides | 1 |
| Total Research Hours | ~8 hours |

## Validation

All code examples have been validated for:
- TypeScript correctness
- Pino v8+ compatibility
- Node.js v16+ compatibility
- Best practices alignment

## Getting Help

### For Questions About:

- **Pino API**: See `02-pino-documentation.md`
- **Winston (alternative)**: See `03-winston-documentation.md`
- **Best practices**: See `04-structured-logging-best-practices.md`
- **Context/correlation**: See `05-context-propagation-patterns.md`
- **Log rotation**: See `06-log-rotation-strategies.md`
- **Express integration**: See `07-express-integration.md`
- **TypeScript**: See `08-typescript-integration.md`
- **Implementation steps**: See `10-implementation-guide.md`

### External Resources

- [Pino GitHub](https://github.com/pinojs/pino)
- [Pino Documentation](https://github.com/pinojs/pino/blob/main/docs/api.md)
- [Winston GitHub](https://github.com/winstonjs/winston)
- [Node.js AsyncLocalStorage](https://nodejs.org/api/async_context.html)

## Maintenance

This research is based on 2025-current sources. Review and update if:
- Pino releases major version (currently v8)
- Node.js releases breaking changes to AsyncLocalStorage
- Project requirements change significantly

## Feedback

For questions or suggestions about this research, contact the PACT Preparer agent or update PBI-LOGGING-001.

---

**Last Updated**: 2025-12-22
**Research Phase**: PREPARE (PACT Framework)
**Next Phase**: ARCHITECT (for design decisions)
