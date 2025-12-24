---
type: pbi
id: PBI-013
title: "Step 8: Multi-format Output"
status: planned
priority: medium
difficulty: easy
estimated_effort: 3-4 hours
epic: EPIC-001
phase: 5
dependencies: [PBI-012]
tags: [langchain, pipeline, output, formatting]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - JSON output with full pipeline results
  - Markdown PBI format for documentation
  - Summary report for quick review
  - Output path configurable
---

# PBI-013: Step 8: Multi-format Output

## Overview

Implement Step 8 of the pipeline: format and output the processed PBIs in multiple formats suitable for different consumers.

## User Story

As a user, I want pipeline output in different formats so that I can use them in my workflow (docs, ticketing system, reports).

## Requirements

### Functional Requirements

1. **JSON Output**
   - Complete pipeline state
   - All step outputs
   - Metadata (timestamps, model used, etc.)

2. **Markdown PBI Format**
   - One markdown file per candidate
   - Follows PBI template structure
   - Frontmatter with metadata

3. **Summary Report**
   - High-level overview of all candidates
   - Readiness status summary
   - Key questions/risks highlighted

## Technical Design

```typescript
// src/pipeline/steps/step8-output.ts
interface OutputConfig {
  outputDir: string;
  formats: ("json" | "markdown" | "summary")[];
  includeRaw: boolean; // Include raw LLM responses
}

// JSON Output Structure
interface PipelineOutput {
  metadata: {
    runId: string;
    timestamp: string;
    inputFile: string;
    llmProvider: string;
    llmModel: string;
    totalTokens: number;
    processingTime: number;
  };
  steps: {
    step1: EventDetectionOutput;
    step2: CandidateExtractionOutput;
    step3: ConfidenceScoringOutput;
    step4: EnrichmentOutput;
    step5: RiskAssessmentOutput;
    step6: QuestionsOutput;
    step7: ReadinessOutput;
  };
  candidates: ProcessedCandidate[];
}
```

### Output Examples

**JSON Output** (`output/run-123/pipeline-output.json`):
```json
{
  "metadata": {
    "runId": "run-123",
    "timestamp": "2024-12-11T10:30:00Z",
    "inputFile": "meeting-notes.txt",
    "llmProvider": "ollama",
    "llmModel": "llama3.2"
  },
  "candidates": [...]
}
```

**Markdown Output** (`output/run-123/candidates/candidate-1.md`):
```markdown
---
type: pbi
id: DRAFT-001
title: "Add User Authentication with OAuth"
status: draft
confidence: 0.71
readiness: needs-refinement
---

# Add User Authentication with OAuth

## Overview
Implement user authentication so users can save preferences.

## Acceptance Criteria
- [ ] (To be defined)

## Confidence Score: 71/100
- Completeness: 75
- Clarity: 80
- Testability: 60
- Actionability: 70

## Risks
- Medium risk: undefined scope around preferences
- External dependency: OAuth provider

## Open Questions
1. Which OAuth provider? (Tech Lead)
2. What preferences to save? (Product Owner)
```

**Summary Report** (`output/run-123/summary.md`):
```markdown
# Pipeline Summary - run-123

**Input**: meeting-notes.txt
**Processed**: 2024-12-11 10:30 AM
**Model**: ollama/llama3.2

## Candidates (3)

| # | Title | Confidence | Readiness | Blockers |
|---|-------|------------|-----------|----------|
| 1 | Add User Authentication | 71% | Needs Refinement | 2 |
| 2 | Fix PDF Export Bug | 85% | Ready | 0 |
| 3 | Implement API Caching | 60% | Not Ready | 3 |

## Key Actions Needed
1. Define acceptance criteria for Authentication
2. Resolve OAuth provider question
3. Spike needed for caching approach
```

## Acceptance Criteria

- [ ] JSON output includes all pipeline data
- [ ] Markdown files generated per candidate
- [ ] Summary report generated
- [ ] Output directory configurable
- [ ] Format selection configurable

## Out of Scope (POC)

- Jira/DevOps export
- HTML preview
- Real-time streaming output

## References

- [Backlog Chef Output Writers](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/output/)
