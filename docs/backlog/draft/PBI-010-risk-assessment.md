---
type: pbi
id: PBI-010
title: "RiskAnalysis: Risk & Conflict Assessment"
status: planned
priority: medium
difficulty: medium
estimated_effort: 4-6 hours
epic: EPIC-001
phase: 4
dependencies: [PBI-009, PBI-017]
tags: [langchain, pipeline, risk, analysis, sibling-awareness]
created: 2024-12-11
updated: 2024-12-21
acceptance_criteria:
  - Detects scope creep indicators
  - Identifies blocking dependencies
  - Flags architectural conflicts
  - Assesses complexity and risk level
  - Excludes risks that are covered by sibling PBIs (PBI-017)
  - Marks sibling-mitigated risks with mitigatedBy reference
---

# PBI-010: RiskAnalysis Phase

## Overview

Implement the RiskAnalysis phase: analyze enriched PBI candidates for risks, conflicts, and potential issues.

> **Note**: This phase must be sibling-aware (see PBI-017). Risks that are addressed by sibling PBIs should be marked as mitigated, not flagged as unresolved risks.

## User Story

As a tech lead, I want to see risks and conflicts identified early so that we can address them before sprint commitment.

## Requirements

### Functional Requirements

1. **Scope Creep Detection**
   - Identify vague or expanding requirements
   - Flag "nice to have" features hidden in stories

2. **Dependency Analysis**
   - Identify blocking dependencies
   - Cross-reference with enriched context

3. **Architectural Conflicts**
   - Check against ADRs from Step 4
   - Identify violations of existing patterns

4. **Complexity Assessment**
   - Estimate relative complexity (low/medium/high)
   - Identify technical unknowns

### Sibling Awareness (PBI-017 Integration)

When analyzing risks, check if any identified risk is already addressed by a sibling PBI:

1. **Sibling-Mitigated Risks**: Do NOT flag as unresolved risks items covered by siblings
2. **Mitigation Reference**: Mark with `mitigatedBy` field pointing to the sibling PBI
3. **Residual Risk**: Assess if any risk remains after sibling coverage

**Example:**
```
Risk: "No authentication mechanism defined"

Without sibling awareness:
  ❌ status: "unresolved", riskLevel: "high"

With sibling awareness (PBI-001 handles auth):
  ✅ status: "mitigated_by_sibling"
  ✅ mitigatedBy: "PBI-001"
  ✅ residualRisk: "low" (integration risk remains)
```

**Prompt Instructions:**
```
When analyzing risks for this PBI, you have access to sibling PBIs from the
same source. Before flagging a risk:

1. Check if any sibling PBI addresses this concern
2. If yes, mark as mitigated_by_sibling with a reference
3. Only flag as unresolved if NO sibling covers it
4. Consider residual/integration risks even when sibling coverage exists
```

## Technical Design

```typescript
// src/pipeline/steps/step5-assess-risks.ts
const RiskAssessmentSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  complexityLevel: z.enum(["low", "medium", "high"]),

  scopeCreepIndicators: z.array(z.object({
    indicator: z.string(),
    severity: z.enum(["minor", "moderate", "major"]),
    suggestion: z.string(),
  })),

  dependencies: z.array(z.object({
    type: z.enum(["blocking", "soft", "external"]),
    description: z.string(),
    status: z.enum(["resolved", "unresolved", "unknown", "mitigated_by_sibling"]),
    mitigatedBy: z.string().optional(),  // Sibling PBI ID if mitigated
    residualRisk: z.enum(["none", "low", "medium"]).optional(),
  })),

  architecturalConflicts: z.array(z.object({
    conflictsWith: z.string(), // ADR or pattern reference
    description: z.string(),
    resolution: z.string().optional(),
  })),

  unknowns: z.array(z.string()),

  overallAssessment: z.string(),
});
```

### Sample Output

```json
{
  "assessment": {
    "candidateId": "candidate-1",
    "title": "Add User Authentication with OAuth",
    "riskLevel": "medium",
    "complexityLevel": "medium",

    "scopeCreepIndicators": [
      {
        "indicator": "'save preferences' is vague - could expand significantly",
        "severity": "moderate",
        "suggestion": "Define exactly which preferences: theme, language, notification settings?"
      }
    ],

    "dependencies": [
      {
        "type": "external",
        "description": "OAuth provider API availability",
        "status": "unknown"
      },
      {
        "type": "soft",
        "description": "User profile storage (may need new DB table)",
        "status": "unresolved"
      }
    ],

    "architecturalConflicts": [],

    "unknowns": [
      "Which OAuth provider to use",
      "Session storage strategy (JWT vs cookies)",
      "Impact on existing API endpoints"
    ],

    "overallAssessment": "Medium risk due to undefined scope around 'preferences' and external OAuth dependency. Recommend spike to clarify OAuth provider and storage strategy before commitment."
  }
}
```

## Acceptance Criteria

- [ ] Scope creep indicators detected and flagged
- [ ] Dependencies identified and categorized
- [ ] Architectural conflicts cross-referenced with ADRs
- [ ] Complexity level assessed
- [ ] Overall risk level calculated
- [ ] Actionable recommendations provided

## References

- [Backlog Chef Step 5](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
