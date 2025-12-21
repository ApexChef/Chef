---
type: pbi
id: PBI-012
title: "ReadinessChecker: Definition of Ready Validation"
status: planned
priority: medium
difficulty: easy
estimated_effort: 3-4 hours
epic: EPIC-001
phase: 5
dependencies: [PBI-011, PBI-017]
tags: [langchain, pipeline, validation, dor, sibling-awareness]
created: 2024-12-11
updated: 2024-12-21
acceptance_criteria:
  - Validates against Definition of Ready
  - Determines sprint readiness status
  - Lists blocking issues
  - Provides readiness score
  - Accounts for sibling dependencies in readiness (PBI-017)
  - Computes batch readiness when siblings depend on each other
---

# PBI-012: ReadinessChecker Phase

## Overview

Implement the ReadinessChecker phase: validate PBI candidates against Definition of Ready (DoR) criteria and determine sprint readiness.

> **Note**: This phase must be sibling-aware (see PBI-017). Readiness evaluation should account for dependencies between sibling PBIs and assess both individual and batch readiness.

## User Story

As a scrum master, I want to see which PBIs are sprint-ready so that we only commit to well-defined work.

## Requirements

### Functional Requirements

1. **DoR Validation**
   - Check against standard DoR criteria
   - Score each criterion (pass/fail/partial)

2. **Readiness Determination**
   - Calculate overall readiness score
   - Determine status: ready / needs-refinement / not-ready

3. **Blocking Issues**
   - List what prevents readiness
   - Map to unanswered questions from Step 6

## Definition of Ready Criteria

```yaml
definition_of_ready:
  required:
    - Clear title that describes the outcome
    - Description with business context
    - At least 2 acceptance criteria
    - No unresolved critical questions
    - Dependencies identified

  recommended:
    - Story points estimated
    - Technical approach discussed
    - Risks identified and mitigated
    - Test scenarios outlined
```

### Sibling Awareness (PBI-017 Integration)

When checking readiness for PBIs with sibling dependencies:

1. **Dependency Check Enhancement**: "Dependencies identified" criterion should pass if sibling dependencies are properly mapped
2. **Batch Readiness**: Consider whether the entire dependency chain is ready
3. **Blocking vs Sequencing**: Distinguish between blocking issues vs sequencing recommendations

**Example:**
```
Individual Readiness Assessment:
  PBI-001 (Auth):      ready (no dependencies)
  PBI-002 (Profile):   ready (depends on PBI-001, which is ready)
  PBI-003 (Dashboard): needs-refinement (missing AC, regardless of siblings)

Batch Readiness:
  ✅ Can sprint PBI-001 alone
  ✅ Can sprint PBI-001 + PBI-002 together
  ⚠️  PBI-003 not ready (own issues, not sibling-related)
```

**Prompt Instructions:**
```
When checking readiness:

1. For "Dependencies identified" criterion:
   - Pass if sibling dependencies from DependencyMapping phase are documented
   - Don't fail just because a PBI depends on another sibling

2. For "Blocking issues":
   - Exclude issues already resolved by ready siblings
   - Note sequencing requirements (e.g., "Start after PBI-001 completes")

3. Include batch readiness assessment:
   - Which PBIs from this batch can be sprinted together?
   - What's the minimum viable set that's ready?
```

## Technical Design

```typescript
// src/pipeline/steps/step7-check-readiness.ts
const DORCheckSchema = z.object({
  criterion: z.string(),
  status: z.enum(["pass", "fail", "partial"]),
  notes: z.string().optional(),
});

const ReadinessOutputSchema = z.object({
  candidateId: z.string(),
  title: z.string(),

  readinessStatus: z.enum(["ready", "needs-refinement", "not-ready"]),
  readinessScore: z.number().min(0).max(100),

  dorChecks: z.object({
    required: z.array(DORCheckSchema),
    recommended: z.array(DORCheckSchema),
  }),

  blockingIssues: z.array(z.string()),
  improvementActions: z.array(z.string()),
});
```

### Sample Output

```json
{
  "readiness": {
    "candidateId": "candidate-1",
    "title": "Add User Authentication with OAuth",
    "readinessStatus": "needs-refinement",
    "readinessScore": 65,

    "dorChecks": {
      "required": [
        { "criterion": "Clear title", "status": "pass" },
        { "criterion": "Description with context", "status": "pass" },
        { "criterion": "Acceptance criteria", "status": "fail", "notes": "None defined" },
        { "criterion": "No critical questions", "status": "fail", "notes": "2 unresolved" },
        { "criterion": "Dependencies identified", "status": "partial" }
      ],
      "recommended": [
        { "criterion": "Story points", "status": "fail" },
        { "criterion": "Technical approach", "status": "partial" },
        { "criterion": "Risks identified", "status": "pass" },
        { "criterion": "Test scenarios", "status": "fail" }
      ]
    },

    "blockingIssues": [
      "Missing acceptance criteria",
      "OAuth provider not decided",
      "Scope of 'preferences' not defined"
    ],

    "improvementActions": [
      "Define 3-5 acceptance criteria",
      "Schedule tech spike for OAuth provider evaluation",
      "Product owner to specify preference features"
    ]
  }
}
```

## Acceptance Criteria

- [ ] DoR criteria validated (required + recommended)
- [ ] Readiness status determined
- [ ] Readiness score calculated
- [ ] Blocking issues clearly listed
- [ ] Improvement actions are actionable

## References

- [Backlog Chef Step 7](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
- [SPEC-001: PBI Format](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/docs/project/specifications/SPEC-001-pbi-format.md)
