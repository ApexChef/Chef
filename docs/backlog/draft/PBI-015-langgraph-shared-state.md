---
type: pbi
id: PBI-015
title: "Refactor Pipeline to LangGraph with Shared State"
status: done
priority: high
difficulty: medium
estimated_effort: 6-8 hours
epic: EPIC-001
phase: 1
dependencies: [PBI-008]
tags: [langchain, langgraph, refactoring, state-management, architecture]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - Pipeline uses LangGraph StateGraph instead of LCEL chains
  - Shared state object flows through all nodes
  - Nodes read from state without explicit parameter passing
  - State persisted to SQLite via checkpointer
  - Can resume pipeline from any checkpoint
  - Can re-run individual steps by updating state
---

# PBI-015: Refactor Pipeline to LangGraph with Shared State

## Overview

Refactor the current pipeline implementation from LCEL chains with explicit parameter passing to LangGraph's StateGraph pattern with shared state. This enables loose coupling between steps, state persistence, and the ability to re-run individual steps.

## Problem Statement

Current implementation passes results explicitly between steps:

```typescript
// Current: Tight coupling via parameters
const step1 = await detectEvent(notes, router);
const step2 = await extractCandidates(notes, step1.eventType, router);
const step3 = await scoreConfidence(step2.candidates, step1.eventType, router);
```

**Issues:**
- Steps are tightly coupled - each depends on the previous
- Cannot re-run a single step without re-running all predecessors
- No persistence - state lost on crash/restart
- Adding new steps requires updating signatures of downstream steps
- Cannot easily skip or conditionally execute steps

## Solution: LangGraph Shared State

```typescript
// Target: Loose coupling via shared state
const graph = new StateGraph(PipelineState)
  .addNode("detectEvent", detectEventNode)
  .addNode("extractCandidates", extractCandidatesNode)
  .addNode("scoreConfidence", scoreConfidenceNode)
  .compile({ checkpointer });

// Each node reads what it needs from state
function extractCandidatesNode(state: PipelineState) {
  // Reads: state.meetingNotes, state.eventType
  // Writes: { candidates: [...] }
}
```

## User Story

As a developer, I want the pipeline to use shared state so that I can:
- Re-run individual steps when RAG context changes
- Resume failed pipelines from the last checkpoint
- Add new steps without modifying existing ones
- Debug by inspecting state at any point

## Requirements

### Functional Requirements

1. **Shared State Schema**
   ```typescript
   interface PipelineState {
     // Input
     meetingNotes: string;

     // Step 1 output
     eventType: string;
     eventConfidence: number;
     eventIndicators: string[];

     // Step 2 output
     candidates: PBICandidate[];

     // Step 3 output
     scoredCandidates: ScoredCandidate[];

     // Metadata
     timestamp: string;
     stepTimings: Record<string, number>;
   }
   ```

2. **Node Functions**
   - Each node receives full state
   - Each node returns partial state update
   - Nodes should NOT depend on parameter order

3. **Checkpointer**
   - Use `SqliteSaver` for local persistence
   - Store in `./data/pipeline_checkpoints.sqlite`
   - Thread ID based on input hash or user-provided ID

4. **Resumability**
   - `getState(threadId)` - Get current state
   - `updateState(threadId, updates)` - Modify state
   - Re-invoke continues from updated state

### Non-Functional Requirements

- Maintain backward compatibility with CLI scripts
- No performance regression (< 5% overhead)
- Clear error messages when checkpointer unavailable

## Technical Design

### New Dependencies

```json
{
  "@langchain/langgraph": "^0.2.x",
  "@langchain/langgraph-checkpoint": "^0.0.x",
  "@langchain/langgraph-checkpoint-sqlite": "^0.0.x"
}
```

### File Structure

```
src/
├── pipeline/
│   ├── state/
│   │   ├── index.ts              # State exports
│   │   ├── pipeline-state.ts     # State annotation/schema
│   │   └── checkpointer.ts       # Checkpointer factory
│   ├── graph/
│   │   ├── index.ts              # Graph exports
│   │   ├── pipeline-graph.ts     # StateGraph definition
│   │   └── nodes/                # Node functions
│   │       ├── detect-event.node.ts
│   │       ├── extract-candidates.node.ts
│   │       └── score-confidence.node.ts
│   └── index.ts                  # Updated exports
```

### State Definition

```typescript
import { Annotation } from "@langchain/langgraph";

export const PipelineState = Annotation.Root({
  // Input (immutable)
  meetingNotes: Annotation<string>(),

  // Step 1: Event Detection
  eventType: Annotation<string>(),
  eventConfidence: Annotation<number>(),
  eventIndicators: Annotation<string[]>({
    default: () => [],
    reducer: (_, newVal) => newVal,
  }),

  // Step 2: Candidate Extraction
  candidates: Annotation<PBICandidate[]>({
    default: () => [],
    reducer: (_, newVal) => newVal,
  }),

  // Step 3: Confidence Scoring
  scoredCandidates: Annotation<ScoredCandidate[]>({
    default: () => [],
    reducer: (_, newVal) => newVal,
  }),

  // Metadata
  metadata: Annotation<PipelineMetadata>({
    default: () => ({ stepTimings: {} }),
    reducer: (prev, newVal) => ({ ...prev, ...newVal }),
  }),
});
```

### Graph Definition

```typescript
import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

export function createPipelineGraph(checkpointPath?: string) {
  const checkpointer = checkpointPath
    ? SqliteSaver.fromConnString(checkpointPath)
    : undefined;

  return new StateGraph(PipelineState)
    .addNode("detectEvent", detectEventNode)
    .addNode("extractCandidates", extractCandidatesNode)
    .addNode("scoreConfidence", scoreConfidenceNode)
    .addEdge(START, "detectEvent")
    .addEdge("detectEvent", "extractCandidates")
    .addEdge("extractCandidates", "scoreConfidence")
    .addEdge("scoreConfidence", END)
    .compile({ checkpointer });
}
```

### Node Example

```typescript
export async function detectEventNode(
  state: typeof PipelineState.State
): Promise<Partial<typeof PipelineState.State>> {
  const startTime = Date.now();

  // Read from state (not parameters!)
  const { meetingNotes } = state;

  // Use existing detection logic
  const result = await detectEvent(meetingNotes, router);

  // Return partial state update
  return {
    eventType: result.eventType,
    eventConfidence: result.confidence,
    eventIndicators: result.indicators,
    metadata: {
      stepTimings: {
        ...state.metadata.stepTimings,
        detectEvent: Date.now() - startTime,
      },
    },
  };
}
```

## Migration Strategy

1. **Phase 1:** Add LangGraph alongside existing code
2. **Phase 2:** Create new graph-based runner
3. **Phase 3:** Update CLI to use new runner
4. **Phase 4:** Deprecate old `runSteps13()` function
5. **Phase 5:** Remove old code

## Acceptance Criteria

- [ ] Install LangGraph dependencies
- [ ] Define `PipelineState` annotation
- [ ] Create checkpointer factory
- [ ] Refactor Step 1 as node function
- [ ] Refactor Step 2 as node function
- [ ] Refactor Step 3 as node function
- [ ] Create `StateGraph` with edges
- [ ] Add persistence with `SqliteSaver`
- [ ] Create new CLI runner using graph
- [ ] Test: Run full pipeline, verify results match
- [ ] Test: Resume from checkpoint after interruption
- [ ] Test: Re-run single step after state update
- [ ] Update existing tests

## Out of Scope

- Conditional edges (future PBI)
- Human-in-the-loop interrupts (future PBI)
- Parallel node execution (future PBI)

## References

- [LangGraph.js Concepts](https://langchain-ai.github.io/langgraphjs/concepts/low_level/)
- [@langchain/langgraph-checkpoint-sqlite](https://www.npmjs.com/package/@langchain/langgraph-checkpoint-sqlite)
- [LangGraph Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
