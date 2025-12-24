---
type: pbi
id: PBI-CLI-002
title: "Implement Section Headers for Pipeline Steps"
status: planned
priority: medium
tags: [cli, ux, feature]
created: 2025-12-24
updated: 2025-12-24
sprint: null
story_points: null
dependencies: []
blocks: []
related_adrs: []
acceptance_criteria:
  - Each pipeline phase displays one header at the start
  - Individual lines within a phase have no prefix
  - Visual separators exist between phases
  - Header style is consistent across all phases
---

# Implement Section Headers for Pipeline Steps

## Overview

Currently, every log line in the CLI has a repetitive prefix like `[DependencyMapping]` or `[ConfidenceScoring]`. This creates visual noise and makes it harder to scan output. This feature replaces per-line prefixes with clear section headers that show pipeline progress.

## User Story

As a CLI user, I want clear section headers for each pipeline phase so that I can understand where I am in the process.

## Requirements

### Functional Requirements

1. Single section header per pipeline phase
2. Clear visual separation between phases
3. Remove repetitive prefixes from individual log lines
4. Use consistent header styling across all phases
5. Support all pipeline phases: detectEvent, extractCandidates, dependencyMapping, scoreConfidence, enrichContext, riskAnalysis, exportPBI

### Non-Functional Requirements

1. Readability: Headers must be easily scannable
2. Consistency: Same styling applied to all phase headers

## Out of Scope

- Color coding (handled by PBI-CLI-003)
- Web UI improvements
- Changing pipeline phase names

## Technical Notes

**Current Behavior:**
```
[DependencyMapping] Analyzing 3 candidates...
[DependencyMapping] LLM identified 3 dependencies
[DependencyMapping] Notes: The dependency structure...
```

**Desired Behavior:**
```
═══════════════════════════════════════
  DEPENDENCY MAPPING
═══════════════════════════════════════
Analyzing 3 candidates...
Identified 3 dependencies

═══════════════════════════════════════
  CONFIDENCE SCORING
═══════════════════════════════════════
Scoring PBI-001... 34/100 (Poor)
```

**Implementation Considerations:**
- May need to refactor logging layer to track current phase
- Define behavior for error scenarios and edge cases
- Consider how headers behave in verbose/quiet modes

## Open Questions

- [ ] Should headers be configurable or fixed format?
- [ ] How should headers behave with `--verbose` mode?
- [ ] What happens if a phase fails mid-execution?
