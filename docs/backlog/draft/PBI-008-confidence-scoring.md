---
type: pbi
id: PBI-008
title: "Step 3: Confidence Scoring Chain"
status: done
priority: medium
difficulty: medium
estimated_effort: 4-6 hours
epic: EPIC-001
phase: 2
dependencies: [PBI-007]
tags: [langchain, pipeline, scoring, quality]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - Scoring chain evaluates PBI quality
  - Scores completeness, clarity, testability
  - Overall confidence score 0-100
  - Recommendations for improvement included
---

# PBI-008: Step 3: Confidence Scoring Chain

## Overview

Implement Step 3 of the pipeline: evaluate each PBI candidate's quality and assign confidence scores based on completeness, clarity, and testability.

## User Story

As a product owner, I want to see quality scores for extracted PBIs so that I can prioritize which ones need more refinement.

## Requirements

### Functional Requirements

1. Score each PBI candidate on:
   - **Completeness** (0-100): Does it have all necessary information?
   - **Clarity** (0-100): Is the requirement unambiguous?
   - **Testability** (0-100): Can we write acceptance tests?
   - **Actionability** (0-100): Is it clear what to do?

2. Calculate overall confidence score (weighted average)
3. Provide improvement recommendations

### Quality Checklist (from Backlog Chef)

```yaml
completeness:
  - Has clear title
  - Has description explaining the "why"
  - Has acceptance criteria (or can be inferred)
  - Type is identified (feature/bug/tech-debt)

clarity:
  - No ambiguous terms ("better", "faster", "improved")
  - Scope is bounded
  - Dependencies mentioned if any

testability:
  - Success criteria are measurable
  - Edge cases considered
  - Can write automated tests

actionability:
  - Clear next steps
  - Assignable to a developer
  - Estimatable
```

## Technical Design

```typescript
// src/pipeline/steps/step3-score-confidence.ts
import { z } from "zod";

const ScoreBreakdownSchema = z.object({
  completeness: z.number().min(0).max(100),
  clarity: z.number().min(0).max(100),
  testability: z.number().min(0).max(100),
  actionability: z.number().min(0).max(100),
});

const ScoredCandidateSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  scores: ScoreBreakdownSchema,
  overallConfidence: z.number().min(0).max(100),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  recommendations: z.array(z.string()),
});
```

### Sample Output

```json
{
  "scoredCandidates": [
    {
      "candidateId": "candidate-1",
      "title": "Add User Authentication with OAuth",
      "scores": {
        "completeness": 75,
        "clarity": 80,
        "testability": 60,
        "actionability": 70
      },
      "overallConfidence": 71,
      "strengths": [
        "Clear business value (user preferences)",
        "Implementation approach mentioned (OAuth)"
      ],
      "weaknesses": [
        "No acceptance criteria defined",
        "OAuth provider not specified"
      ],
      "recommendations": [
        "Add specific acceptance criteria",
        "Research and specify OAuth provider (Google, GitHub, etc.)",
        "Define what 'save preferences' means specifically"
      ]
    }
  ]
}
```

## Acceptance Criteria

- [ ] Scoring chain evaluates all 4 dimensions
- [ ] Overall confidence calculated as weighted average
- [ ] Strengths and weaknesses identified per candidate
- [ ] Actionable recommendations generated
- [ ] Low-scoring candidates flagged for refinement

## References

- [Backlog Chef Step 3](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
- [PBI Quality Checklist](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/docs/project/specifications/SPEC-001-pbi-format.md)
