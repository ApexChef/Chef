---
type: pbi
id: PBI-011
title: "QuestionsGeneration: Questions & Proposals"
status: planned
priority: medium
difficulty: medium
estimated_effort: 4-6 hours
epic: EPIC-001
phase: 4
dependencies: [PBI-010, PBI-017]
tags: [langchain, pipeline, questions, proposals, sibling-awareness]
created: 2024-12-11
updated: 2024-12-21
acceptance_criteria:
  - Generates actionable follow-up questions
  - Proposes answers based on context
  - Routes questions to appropriate stakeholders
  - Questions prioritized by impact
  - Marks questions answered by sibling PBIs (PBI-017)
  - Skips redundant questions covered by siblings
---

# PBI-011: QuestionsGeneration Phase

## Overview

Implement the QuestionsGeneration phase: generate clarifying questions for identified gaps and propose answers based on enriched context.

> **Note**: This phase must be sibling-aware (see PBI-017). Questions that are already answered by sibling PBIs should be marked as "answered by sibling" rather than requiring stakeholder input.

## User Story

As a product owner, I want to see specific questions that need answers before a PBI is sprint-ready, along with suggested answers based on past decisions.

## Requirements

### Functional Requirements

1. **Question Generation**
   - Identify information gaps from previous steps
   - Generate specific, answerable questions
   - Prioritize by impact on implementation

2. **Answer Proposals**
   - Suggest answers based on RAG context
   - Reference ADRs and past decisions
   - Indicate confidence in proposals

3. **Stakeholder Routing**
   - Tag questions for appropriate role (PO, Tech Lead, etc.)
   - Group related questions

### Sibling Awareness (PBI-017 Integration)

When generating questions, check if any question is answered by a sibling PBI:

1. **Sibling-Answered Questions**: Mark with `answeredBySibling` status
2. **Skip Redundant Questions**: Don't ask questions that siblings clearly address
3. **Cross-Reference Answers**: When a sibling provides context, use it as proposed answer

**Example:**
```
Question: "How will users authenticate?"

Without sibling awareness:
  ❓ status: "needs_answer", targetRole: "tech-lead"

With sibling awareness (PBI-001 handles auth):
  ✅ status: "answered_by_sibling"
  ✅ answeredBy: "PBI-001"
  ✅ proposedAnswer: "See PBI-001: Implement OAuth authentication"
```

**Prompt Instructions:**
```
Before generating a question:

1. Check if any sibling PBI addresses this concern
2. If yes, mark as answered_by_sibling with reference
3. Still generate the question if sibling coverage is partial
4. Use sibling content as proposedAnswer source when applicable
```

## Technical Design

```typescript
// src/pipeline/steps/step6-generate-questions.ts
const QuestionSchema = z.object({
  question: z.string(),
  priority: z.enum(["critical", "high", "medium", "low"]),
  category: z.enum([
    "scope",
    "technical",
    "business",
    "dependency",
    "acceptance-criteria"
  ]),
  targetRole: z.enum([
    "product-owner",
    "tech-lead",
    "developer",
    "stakeholder"
  ]),
  proposedAnswer: z.object({
    answer: z.string(),
    confidence: z.number().min(0).max(1),
    source: z.string().optional(), // Reference to supporting document
  }).optional(),
  context: z.string(), // Why this question matters
});

const QuestionsOutputSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  questions: z.array(QuestionSchema),
  readinessBlockers: z.number(), // Count of critical/high priority questions
});
```

### Sample Output

```json
{
  "output": {
    "candidateId": "candidate-1",
    "title": "Add User Authentication with OAuth",
    "questions": [
      {
        "question": "Which OAuth provider should we use?",
        "priority": "critical",
        "category": "technical",
        "targetRole": "tech-lead",
        "proposedAnswer": {
          "answer": "Based on ADR-005, Google OAuth is recommended for consumer apps due to existing SSO infrastructure.",
          "confidence": 0.75,
          "source": "ADR-005: Authentication Strategy"
        },
        "context": "Provider choice affects implementation complexity and user experience"
      },
      {
        "question": "What specific preferences should users be able to save?",
        "priority": "high",
        "category": "scope",
        "targetRole": "product-owner",
        "proposedAnswer": null,
        "context": "Scope is currently vague - need explicit list to estimate effort"
      },
      {
        "question": "Should we support social login (Google, GitHub) or enterprise SSO?",
        "priority": "high",
        "category": "business",
        "targetRole": "product-owner",
        "proposedAnswer": {
          "answer": "Target audience analysis suggests social login for initial release, enterprise SSO in v2.",
          "confidence": 0.6,
          "source": "docs/business/target-audience.md"
        },
        "context": "Affects technical architecture and user onboarding flow"
      }
    ],
    "readinessBlockers": 2
  }
}
```

## Acceptance Criteria

- [ ] Questions generated from gaps in previous steps
- [ ] Proposed answers include confidence scores
- [ ] Questions tagged with target stakeholder role
- [ ] Priority reflects impact on implementation
- [ ] Readiness blocker count calculated

## References

- [Backlog Chef Step 6](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
