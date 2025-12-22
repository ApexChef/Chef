# System Context Diagram

## Overview

This diagram shows the logging system's boundaries, external actors, and high-level interactions within the Chef ecosystem.

## System Context Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                                                                 │
│                          Chef Application Ecosystem                             │
│                                                                                 │
│  ┌──────────────┐          ┌──────────────┐          ┌──────────────┐         │
│  │              │          │              │          │              │         │
│  │   CLI App    │          │   Web App    │          │   Pipeline   │         │
│  │ (@chef/cli)  │          │ (@chef/web)  │          │  (@chef/     │         │
│  │              │          │              │          │   backlog)   │         │
│  └──────┬───────┘          └──────┬───────┘          └──────┬───────┘         │
│         │                         │                         │                  │
│         │   Uses Logger API       │    Uses Logger API      │  Uses Logger API │
│         │                         │                         │                  │
│         └─────────────────────────┼─────────────────────────┘                  │
│                                   │                                             │
│                                   ▼                                             │
│                    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓                             │
│                    ┃                             ┃                             │
│                    ┃  Chef Logging System        ┃                             │
│                    ┃  (@chef/core/logger)        ┃                             │
│                    ┃                             ┃                             │
│                    ┃  • Logger Factory           ┃                             │
│                    ┃  • Context Manager          ┃                             │
│                    ┃  • Pino Singleton           ┃                             │
│                    ┃  • Transport Manager        ┃                             │
│                    ┃                             ┃                             │
│                    ┗━━━━━━━━━━━━━┬━━━━━━━━━━━━━┛                             │
│                                   │                                             │
│                  ┌────────────────┼────────────────┐                           │
│                  │                │                │                           │
│                  ▼                ▼                ▼                           │
│         ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                    │
│         │   Console   │  │    File     │  │   Future:   │                    │
│         │  Transport  │  │  Transport  │  │   Remote    │                    │
│         │  (stdout)   │  │  (rotated)  │  │  Transport  │                    │
│         └──────┬──────┘  └──────┬──────┘  └─────────────┘                    │
│                │                │                                              │
└────────────────┼────────────────┼──────────────────────────────────────────────┘
                 │                │
                 │                │
        ┌────────▼─────────┐      │
        │                  │      │
        │   Development    │      │
        │   Terminal       │      │
        │   (pino-pretty)  │      │
        │                  │      │
        └──────────────────┘      │
                                  │
                         ┌────────▼──────────┐
                         │                   │
                         │  File System      │
                         │  ./logs/chef.log  │
                         │  (with rotation)  │
                         │                   │
                         └───────────────────┘

External Systems (Future):
┌──────────────────────────────────────────┐
│ • ELK Stack                              │
│ • CloudWatch Logs                        │
│ • Datadog                                │
│ • Splunk                                 │
└──────────────────────────────────────────┘
```

## Actors and Systems

### Internal Actors

1. **CLI Application** (`@chef/cli`)
   - **Role**: Command-line interface for Chef operations
   - **Interaction**: Initializes logger with CLI-specific config, generates thread IDs for pipeline runs
   - **Needs**: Human-readable logs in development, JSON logs in production
   - **Outputs**: Terminal (stdout) via pino-pretty or JSON

2. **Web Application** (`@chef/web`)
   - **Role**: HTTP API and web interface
   - **Interaction**: Uses pino-http middleware for request logging, correlates logs via request IDs
   - **Needs**: Request/response logging, error tracking, performance monitoring
   - **Outputs**: Server logs (stdout), file persistence

3. **Pipeline** (`@chef/backlog`)
   - **Role**: LangGraph pipeline for PBI processing
   - **Interaction**: Uses context manager for thread and step correlation
   - **Needs**: Detailed execution tracing, error tracking, performance metrics
   - **Outputs**: Structured logs with thread ID and step name

### Logging System Components

**Chef Logging System** (`@chef/core/logger`)
- **Responsibility**: Centralized logging infrastructure
- **Components**:
  - Logger Factory: Creates and configures Pino instances
  - Context Manager: Manages AsyncLocalStorage for correlation
  - Transport Manager: Routes logs to console, file, or remote
- **Technology**: Pino (v8+), AsyncLocalStorage (Node.js native)

### External Systems

1. **Development Terminal**
   - **Role**: Display human-readable logs during development
   - **Format**: Colorized, pretty-printed via pino-pretty
   - **Example**:
     ```
     [2025-12-22 10:30:45] INFO (cli-123/detectEvent): Processing pipeline
     ```

2. **File System**
   - **Role**: Persistent log storage
   - **Location**: `./logs/chef.log` (configurable)
   - **Rotation**: Daily + 50MB size limit, 14-day retention
   - **Format**: Newline-delimited JSON (ndjson)

3. **Future: Log Aggregation Services** (out of scope for PBI-LOGGING-001)
   - ELK Stack (Elasticsearch, Logstash, Kibana)
   - CloudWatch Logs (AWS)
   - Datadog
   - Splunk

## Data Flow

### Development Flow

```
Developer runs CLI command
    ↓
CLI initializes logger (pretty: true)
    ↓
Pipeline executes with thread ID
    ↓
Each step logs with context (thread + step)
    ↓
pino-pretty formats logs
    ↓
Colorized output to terminal stdout
```

### Production Flow

```
Application starts in production
    ↓
Logger initialized (pretty: false, toFile: true)
    ↓
Operations generate logs
    ↓
Logs formatted as JSON
    ↓
Multi-target output:
  ├─> stdout (container logs, captured by orchestrator)
  └─> File (./logs/chef.log, rotated daily/50MB)
```

## Key Boundaries

### System Boundary

**Inside**: Everything within @chef packages
**Outside**: Developer terminals, file systems, future log aggregation services

### Trust Boundary

**Trusted**: All @chef packages (same codebase, controlled)
**Untrusted**: User input in logs (must sanitize PII, secrets)

### Data Boundary

**Internal**: Log context (thread ID, step name, internal state)
**External**: Log messages (may contain user data, requires redaction)

## Integration Points

### 1. CLI → Logging System

```typescript
// apps/cli/src/commands/backlog/process.ts
import { getLogger, runPipeline } from '@chef/core/logger';

const logger = getLogger();
const threadId = `cli-${Date.now()}`;

logger.info({ threadId, file: args.file }, 'Starting pipeline');

await runPipeline(threadId, async () => {
  await processMeetingNotes(args.file);
});
```

### 2. Web → Logging System

```typescript
// apps/web/src/app.ts
import { httpLogger } from './lib/logger';

app.use(httpLogger);  // pino-http middleware

app.get('/api/pbis', (req, res) => {
  req.log.info('Fetching PBIs');  // Includes request ID
  res.json({ pbis: [] });
});
```

### 3. Pipeline → Logging System

```typescript
// packages/backlog/src/pipeline/graph/nodes/detect-event.node.ts
import { getContextLogger, runStep } from '@chef/core/logger';

export async function detectEvent(state: PipelineState) {
  return runStep('detectEvent', async () => {
    const logger = getContextLogger();
    logger.info({ input: state.inputText }, 'Detecting event type');

    // Processing...

    logger.info({ eventType }, 'Event type detected');
    return { eventType };
  });
}
```

## Environment Variations

### Development Environment

```
Logger Config:
- level: debug
- pretty: true
- toFile: false

Output:
└─> Terminal (pino-pretty)
```

### Production Environment

```
Logger Config:
- level: info
- pretty: false
- toFile: true

Output:
├─> stdout (JSON, for container logs)
└─> File (JSON, rotated, ./logs/chef.log)
```

### Testing Environment

```
Logger Config:
- level: silent
- enabled: false

Output:
└─> None (silent for tests)
```

## Non-Functional Requirements

### Performance
- **Target**: <5% overhead
- **Strategy**: Async I/O, worker threads, zero per-call overhead

### Scalability
- **Target**: 1000+ concurrent pipeline runs
- **Strategy**: Stateless design, log rotation, configurable levels

### Reliability
- **Target**: Zero log loss
- **Strategy**: Error handlers, fallback to console, non-blocking writes

### Security
- **Requirement**: No sensitive data in logs
- **Strategy**: Redaction serializers, PII filtering

## References

- [Architecture Overview](../README.md)
- [Component Diagram](component-diagram.md)
- [Deployment Diagram](deployment-diagram.md)
