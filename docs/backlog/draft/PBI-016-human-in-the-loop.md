---
type: pbi
id: PBI-016
title: "Human-in-the-Loop with Threshold-Based Routing"
status: planned
priority: high
difficulty: high
estimated_effort: 8-12 hours
epic: EPIC-001
phase: 3
dependencies: [PBI-015, PBI-009]
tags: [langchain, langgraph, hitl, interrupt, routing, state-management]
created: 2024-12-12
updated: 2024-12-12
acceptance_criteria:
  - Threshold-based routing after confidence scoring
  - High-score PBIs (>=75) auto-continue to enrichment
  - Medium-score PBIs (50-74) interrupt for human approval
  - Low-score PBIs (<50) require human context before re-scoring
  - Each PBI flows independently (no waiting for siblings)
  - Dependency-aware interrupts when dependent PBI needs refinement
  - Re-scoring loop after human provides additional context
  - Step 4 RAG enrichment with topic-based filtering
---

# PBI-016: Human-in-the-Loop with Threshold-Based Routing

## Overview

Add conditional routing after the confidence scoring step (Step 3) that routes PBIs based on their score thresholds. PBIs with uncertain scores require human confirmation before proceeding to enrichment (Step 4).

## Problem Statement

Current pipeline flows all PBIs linearly through steps without human intervention. This means:
- Low-quality PBIs waste resources in enrichment
- Borderline PBIs proceed without validation
- No opportunity to refine unclear PBIs before enrichment
- Dependencies between PBIs are not considered

## Solution: Threshold-Based Routing with HITL

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
[Step 3: Score] ────┬── High (≥75) ───────► [Step 4: Enrich via RAG]
                    │
                    ├── Medium (50-74) ───► [INTERRUPT: Human Approval]
                    │                           │
                    │                           ├── APPROVE ──► [Step 4: Enrich]
                    │                           │
                    │                           └── REJECT ───► [Request Context]
                    │                                                │
                    └── Low (<50) ─────────► [Request Context] ◄─────┘
                                                    │
                                                    ▼
                                            [Human Input]
                                                    │
                                                    └──────────────────┘
                                                       (re-score loop)
```

## User Story

As a product owner, I want to review borderline PBI candidates before they're enriched so that I can provide additional context or reject unclear items.

## Requirements

### Functional Requirements

1. **Threshold-Based Routing**
   - High score (≥75): Auto-approve, continue to Step 4
   - Medium score (50-74): Interrupt for human decision
   - Low score (<50): Request additional context, re-score

2. **Human Interrupt States**
   - `awaiting_approval`: Medium-score PBI waiting for human yes/no
   - `awaiting_context`: Low-score or rejected PBI needing human input
   - `approved`: Human approved, ready for enrichment
   - `rejected_final`: Human explicitly rejected after context attempt

3. **Independent PBI Flow**
   - Each PBI proceeds independently
   - Approved PBIs don't wait for siblings
   - Parallel processing when possible

4. **Dependency-Aware Interrupts**
   - If PBI-A depends on PBI-B (detected via LLM analysis)
   - And PBI-B needs refinement
   - Then PBI-A also pauses until PBI-B is resolved

5. **Re-scoring Loop**
   - Human provides additional context for low/rejected PBIs
   - PBI re-enters scoring with enriched description
   - Loop continues until score is high enough or human rejects

6. **Step 4: RAG Enrichment**
   - Query RAG using PBI's topic/category
   - Filter by relevant document types (not user guides for technical PBIs)
   - Placeholder: Will be refined in PBI-009

### Non-Functional Requirements

- Interrupts must be resumable (persist to SQLite)
- Clear CLI feedback when waiting for human input
- Timeout handling for unresponded interrupts

## Technical Design

### State Additions

```typescript
// Extend PipelineState with HITL fields
export const PipelineState = Annotation.Root({
  // ... existing fields ...

  // === HITL State (per-PBI) ===
  pbiStatuses: Annotation<PBIHITLStatus[]>({
    reducer: (prev, update) => {
      // Merge by candidateId
      const map = new Map(prev?.map(p => [p.candidateId, p]) ?? []);
      for (const u of update ?? []) {
        map.set(u.candidateId, { ...map.get(u.candidateId), ...u });
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // Track which PBIs are ready for enrichment
  approvedForEnrichment: Annotation<string[]>({
    reducer: (prev, update) => [...new Set([...(prev ?? []), ...(update ?? [])])],
    default: () => [],
  }),

  // Human-provided context for re-scoring
  humanContext: Annotation<Record<string, string>>({
    reducer: (prev, update) => ({ ...prev, ...update }),
    default: () => ({}),
  }),
});

interface PBIHITLStatus {
  candidateId: string;
  score: number;
  status: 'pending' | 'awaiting_approval' | 'awaiting_context' | 'approved' | 'rejected_final';
  dependsOn?: string[];  // IDs of PBIs this one depends on
  contextRequests?: string[];  // What context is needed
  humanDecision?: 'approve' | 'reject' | 'provide_context';
  rescoreCount: number;
}
```

### Graph with Conditional Edges

```typescript
import { StateGraph, START, END, interrupt } from "@langchain/langgraph";

export function createPipelineGraphWithHITL(options: GraphOptions = {}) {
  return new StateGraph(PipelineState)
    // Existing nodes
    .addNode("detectEvent", detectEventNode)
    .addNode("extractCandidates", extractCandidatesNode)
    .addNode("scoreConfidence", scoreConfidenceNode)

    // New HITL nodes
    .addNode("routeByScore", routeByScoreNode)
    .addNode("humanApproval", humanApprovalNode)      // Uses interrupt()
    .addNode("requestContext", requestContextNode)    // Uses interrupt()
    .addNode("rescoreWithContext", rescoreWithContextNode)

    // Step 4
    .addNode("enrichContext", enrichContextNode)

    // Linear edges (start)
    .addEdge(START, "detectEvent")
    .addEdge("detectEvent", "extractCandidates")
    .addEdge("extractCandidates", "scoreConfidence")
    .addEdge("scoreConfidence", "routeByScore")

    // Conditional routing after score
    .addConditionalEdges("routeByScore", routeDecision, {
      "enrich": "enrichContext",
      "approve": "humanApproval",
      "context": "requestContext",
      "done": END,
    })

    // Human approval outcomes
    .addConditionalEdges("humanApproval", approvalDecision, {
      "enrich": "enrichContext",
      "context": "requestContext",
    })

    // Context provision loop
    .addEdge("requestContext", "rescoreWithContext")
    .addConditionalEdges("rescoreWithContext", rescoreDecision, {
      "route": "routeByScore",
      "reject": END,
    })

    // Final step
    .addEdge("enrichContext", END)

    .compile({ checkpointer });
}
```

### Interrupt Implementation

```typescript
import { interrupt } from "@langchain/langgraph";

async function humanApprovalNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const pendingApproval = state.pbiStatuses.filter(p => p.status === 'awaiting_approval');

  if (pendingApproval.length === 0) {
    return {}; // Nothing to approve
  }

  // Present PBIs needing approval
  const approvalRequest = pendingApproval.map(p => ({
    id: p.candidateId,
    title: state.scoredCandidates.find(c => c.id === p.candidateId)?.title,
    score: p.score,
    reasoning: state.scoredCandidates.find(c => c.id === p.candidateId)?.reasoning,
  }));

  // INTERRUPT - wait for human input
  const humanResponse = interrupt({
    type: "approval_request",
    message: "The following PBIs need your approval:",
    candidates: approvalRequest,
    options: ["approve", "reject", "provide_context"],
  });

  // Process human response after resume
  return processApprovalResponse(state, humanResponse);
}

async function requestContextNode(state: PipelineStateType): Promise<Partial<PipelineStateType>> {
  const needingContext = state.pbiStatuses.filter(
    p => p.status === 'awaiting_context'
  );

  // Generate specific questions about what context is needed
  const contextRequests = await generateContextQuestions(needingContext, state);

  // INTERRUPT - wait for human context
  const humanContext = interrupt({
    type: "context_request",
    message: "Please provide additional context for these PBIs:",
    requests: contextRequests,
  });

  // Store human-provided context for re-scoring
  return {
    humanContext: humanContext,
    pbiStatuses: needingContext.map(p => ({
      ...p,
      status: 'pending', // Ready to re-score
      rescoreCount: p.rescoreCount + 1,
    })),
  };
}
```

### Threshold Constants

```typescript
// src/pipeline/constants/thresholds.ts
export const SCORE_THRESHOLDS = {
  AUTO_APPROVE: 75,      // ≥75: Auto-continue to enrichment
  HUMAN_APPROVAL: 50,    // 50-74: Needs human approval
  // <50: Needs additional context

  MAX_RESCORE_ATTEMPTS: 3, // Max re-scoring loops before final rejection
} as const;
```

### Sample Data Consideration

The current sample data produces 4 PBIs with scores averaging ~68. To ensure HITL testing:
- At least 1 PBI should score in medium range (50-74) → triggers approval interrupt
- Optionally 1 PBI should score <50 → triggers context request

## Acceptance Criteria

- [ ] Define HITL state fields in PipelineState
- [ ] Implement `routeByScore` node with threshold logic
- [ ] Implement `humanApproval` node with `interrupt()`
- [ ] Implement `requestContext` node with `interrupt()`
- [ ] Implement `rescoreWithContext` node
- [ ] Add conditional edges to graph
- [ ] Implement dependency detection between PBIs
- [ ] Create CLI handler for interrupt responses
- [ ] Test: High-score PBI auto-proceeds
- [ ] Test: Medium-score PBI waits for approval
- [ ] Test: Low-score PBI requests context
- [ ] Test: Human approval continues to enrichment
- [ ] Test: Human rejection triggers context request
- [ ] Test: Re-scoring loop with human context
- [ ] Test: Dependency interrupt when related PBI needs context
- [ ] Update state persistence to handle interrupt state

## Out of Scope

- Web UI for approvals (CLI only)
- Async notifications (polling only)
- Multi-user approval workflows

## Dependencies

- **PBI-015**: LangGraph shared state (completed)
- **PBI-009**: RAG enrichment (Step 4 implementation)

## References

- [LangGraph Human-in-the-Loop](https://langchain-ai.github.io/langgraphjs/concepts/human_in_the_loop/)
- [LangGraph interrupt()](https://langchain-ai.github.io/langgraphjs/reference/functions/langgraph.interrupt.html)
- [LangGraph Conditional Edges](https://langchain-ai.github.io/langgraphjs/concepts/low_level/#conditional-edges)
