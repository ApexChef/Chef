---
type: pbi
id: PBI-LOGGING-001
title: "Implement Centralized Logging Infrastructure"
status: planned
priority: high
tags: [logging, observability, debugging, infrastructure]
created: 2024-12-22
updated: 2024-12-22
sprint: null
story_points: null
dependencies: []
blocks: []
related_adrs: []
acceptance_criteria:
  - Logger instance created in @chef/core with configurable outputs
  - All pipeline nodes emit logs with thread ID correlation
  - CLI displays logs according to LOG_CLI_LEVEL setting
  - Web app displays logs according to LOG_WEB_LEVEL setting
  - Logs persisted to file system when LOG_TO_FILE=true
  - Log rotation implemented (max file size / retention period)
  - Configuration via environment variables and/or config file
  - Existing pipeline code updated to use new logger
---
# Implement Centralized Logging Infrastructure

## Overview

Chef currently lacks proper logging infrastructure, making it difficult to debug pipeline issues like stalled steps or LLM timeouts. This feature introduces a centralized logging mechanism that outputs to CLI console, web console, and persistent storage with thread ID correlation for tracing pipeline execution.

## User Story

As a Chef developer/operator, I want a centralized logging mechanism so that I can debug pipeline issues, monitor execution flow, and trace problems across CLI and web interfaces.

## Requirements

### Functional Requirements

1. **Multi-Output Logging**
   - CLI Console: Display logs in terminal when running `chef backlog process`
   - Web Console: Display logs in browser console or web UI when using web app
   - Persistent Storage: Save logs to file system, database, or other storage mechanism

2. **Log Correlation**
   - Every log entry must include the pipeline thread ID (e.g., `cli-1766395002150`)
   - Logs within a pipeline run share the same thread ID as correlation key
   - Every log entry includes ISO 8601 timestamp
   - Include current pipeline step name (e.g., `detectEvent`, `riskAnalysis`)

3. **Severity Levels (Enum)**
   - DEBUG (0): Detailed diagnostic information
   - INFO (1): General operational messages
   - WARN (2): Warning conditions
   - ERROR (3): Error conditions
   - FATAL (4): Critical failures

4. **Configuration Parameters**
   - `LOG_LEVEL`: Minimum severity to log (default: INFO)
   - `LOG_TO_CLI`: Boolean to enable/disable CLI console output
   - `LOG_TO_WEB`: Boolean to enable/disable web console output
   - `LOG_TO_FILE`: Boolean to enable/disable file persistence
   - `LOG_FILE_PATH`: Path to log file (default: `./logs/chef.log`)
   - `LOG_CLI_LEVEL`: Minimum severity for CLI console display
   - `LOG_WEB_LEVEL`: Minimum severity for web console display

5. **Log Entry Structure**
   - timestamp: ISO 8601 formatted string
   - level: Severity enum value
   - threadId: Pipeline thread ID (correlation key)
   - step: Pipeline step name (optional)
   - message: Log message string
   - data: Additional structured data (optional)
   - error: Error details with name, message, stack (optional)

### Non-Functional Requirements

1. **Performance**: Logging must not significantly impact pipeline execution time (async writes preferred)
2. **Reliability**: Log persistence must not fail silently; errors in logging should be handled gracefully
3. **Configurability**: All settings must be configurable via environment variables or config file

## Out of Scope

- Log aggregation services (Datadog, Splunk, etc.)
- Distributed tracing (OpenTelemetry)
- Real-time log streaming via WebSocket
- Log search/query interface

## Technical Notes

**Package Location**: Logger should be implemented in `@chef/core` since:
- Core has no dependencies on other @chef packages
- Both `@chef/backlog` and `@chef/cli` depend on core
- Ensures consistent logging across all packages

**Integration Points**:
1. CLI (`apps/cli`): Initialize logger with CLI-specific config at startup
2. Web (`apps/web`): Initialize logger with web-specific config, expose via API
3. Pipeline (`packages/backlog`): Each node receives logger instance via context

**Library Evaluation**:

| Library | Pros | Cons |
|---------|------|------|
| **Pino** | Fast, JSON-native, async, small footprint, pino-pretty for dev | Less feature-rich, transport config complex |
| **Winston** | Feature-rich, many transports, flexible formatting | Slower, larger bundle, sync by default |

**Recommendation**: Pino for performance in CLI/pipeline context.

## Open Questions

- [ ] Should logs be stored in SQLite alongside checkpoints or separate files?
- [ ] What log rotation strategy? (size-based, time-based, or both)
- [ ] Should web UI have a log viewer component or just console output?
