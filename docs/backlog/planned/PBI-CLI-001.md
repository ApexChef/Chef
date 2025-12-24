---
type: pbi
id: PBI-CLI-001
title: "Separate Debug Logging from User Output"
status: planned
priority: high
tags: [cli, logging, ux, tech-debt]
created: 2025-12-24
updated: 2025-12-24
sprint: null
story_points: null
dependencies: []
blocks: [PBI-CLI-003]
related_adrs: []
acceptance_criteria:
  - Running `chef backlog process` shows only user-friendly output by default
  - Running with `--verbose` shows detailed debug information
  - JSON log objects never appear in default output
  - Debug logs can be redirected to a file via `LOG_TO_FILE` env var
---

# Separate Debug Logging from User Output

## Overview

The current CLI output mixes debug logging with user-facing feedback, making it difficult to follow pipeline progress. JSON log objects and technical details clutter the user experience. This tech-debt item implements log level filtering to provide clean, user-friendly output by default.

## User Story

As a CLI user, I want debug logs separated from pipeline feedback so that I can follow progress without technical noise.

## Requirements

### Functional Requirements

1. Implement log level filtering for CLI output
2. Default to user-friendly output (no JSON logs)
3. Support `--verbose` flag for debug output
4. Support `LOG_LEVEL` environment variable (debug, info, warn, error)
5. Optionally write debug logs to file via `LOG_TO_FILE` env var

### Non-Functional Requirements

1. Performance: Log filtering should not impact pipeline execution time
2. Compatibility: Maintain backward compatibility with existing scripts (consider `--legacy-output` flag)

## Out of Scope

- Changing the underlying pipeline logic
- Web UI logging improvements
- Structured logging format changes (JSON schema)

## Technical Notes

**Current Behavior:**
```
{"level":30,"time":"2025-12-24T11:48:15.356Z","pid":8432,...}
[DependencyMapping] Analyzing 3 candidates...
[DependencyMapping] LLM identified 3 dependencies
```

**Desired Behavior:**
- Debug/JSON logs only appear with `--verbose` or `LOG_LEVEL=debug`
- User output shows clean, formatted progress updates

**Implementation Considerations:**
- Audit existing codebase to catalog all log statements
- Design centralized logging configuration system
- Create test matrix for all flag and environment variable combinations

## Open Questions

- [ ] Should LOG_TO_FILE support log rotation?
- [ ] What is the complete log level hierarchy (debug, info, warn, error)?
- [ ] Are there existing scripts that depend on current output format?
