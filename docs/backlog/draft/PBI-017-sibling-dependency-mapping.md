---
type: pbi
id: PBI-017
title: "Sibling PBI Dependency Mapping & Cross-Reference Awareness"
status: planned
priority: high
difficulty: high
estimated_effort: 10-14 hours
epic: EPIC-001
phase: 2
dependencies: [PBI-008, PBI-009]
tags: [langchain, pipeline, dependencies, context, architecture]
created: 2024-12-21
updated: 2024-12-21
acceptance_criteria:
  - New DependencyMapping phase analyzes sibling relationships
  - Dependency graph structure captures source, target, type, reason, strength
  - ConfidenceScoring injects sibling context for dependent PBIs
  - ContextEnrichment injects sibling context for dependent PBIs
  - Circular dependency prevention in LLM prompts
  - Programmatic cycle detection with validation
  - Sequence/ordering and parallelization support
  - All "step" naming replaced with phase names
---

# PBI-017: Sibling PBI Dependency Mapping & Cross-Reference Awareness

## Problem Statement

Currently, when the pipeline extracts multiple PBI candidates from meeting notes (which typically describe an EPIC-level requirement), each PBI is treated in **complete isolation**:

- **ConfidenceScoring** evaluates each PBI independently, potentially penalizing it for "missing information" that is actually covered by a sibling PBI
- **ContextEnrichment** only looks at external/historical context (past docs, past PBIs), ignoring sibling PBIs from the same source
- **No awareness** that PBI-002 likely depends on PBI-001, or that PBI-004 relates to PBI-002

### Example Scenario

Meeting notes describe: "Build a user management system with authentication, profiles, and admin dashboard."

**Current behavior:**
```
CandidateExtraction outputs:
  PBI-001: "Implement user authentication"
  PBI-002: "Create user profile page"
  PBI-003: "Build admin dashboard"

ConfidenceScoring for PBI-002:
  ❌ "Missing authentication details" → Lower score
  (But auth IS covered in PBI-001!)

ConfidenceScoring for PBI-003:
  ❌ "No user data source specified" → Lower score
  (But user data comes from PBI-001 and PBI-002!)
```

**Desired behavior:**
```
DependencyMapping identifies:
  PBI-002 depends on PBI-001 (needs auth before profiles)
  PBI-003 depends on PBI-001, PBI-002 (dashboard shows user data)

ConfidenceScoring for PBI-002:
  ✅ "Authentication handled by sibling PBI-001" → Fair score
  LLM receives: "Note: PBI-001 handles authentication"

ConfidenceScoring for PBI-003:
  ✅ "User data sourced from siblings PBI-001, PBI-002" → Fair score
```

## Solution Overview

### 1. New Phase: DependencyMapping

Add a new pipeline phase after `CandidateExtraction` that:
- Receives all extracted candidates
- Analyzes relationships between siblings
- Outputs a dependency graph
- Assigns sequence/ordering information
- Identifies parallelizable PBIs

### 2. Dependency Graph Structure

```typescript
interface Dependency {
  source: string;              // PBI that has the dependency (e.g., "PBI-002")
  target: string;              // PBI it depends on (e.g., "PBI-001")
  type: DependencyType;        // Relationship classification
  reason: string;              // Why this dependency exists
  strength: DependencyStrength; // How critical the dependency is
}

type DependencyType =
  | "blocks"      // Must complete target before source can start
  | "relates-to"  // Related but not blocking
  | "extends";    // Source builds upon target's functionality

type DependencyStrength =
  | "hard"        // Absolute requirement
  | "soft";       // Nice to have, can work around
```

### 3. Pipeline State Updates

```typescript
// Add to PipelineState
dependencies: Dependency[];

// Add sequence info to candidates
interface PBICandidate {
  // ...existing fields...
  sequence?: number;           // Suggested execution order
  canParallelize?: boolean;    // True if no blocking dependencies
}
```

### 4. Sibling Context Injection

When scoring or enriching a PBI that has dependencies, inject sibling context:

```typescript
// In ConfidenceScoring / ContextEnrichment
function getSiblingContext(
  candidateId: string,
  allCandidates: PBICandidate[],
  dependencies: Dependency[]
): string {
  const deps = dependencies.filter(d => d.source === candidateId);

  if (deps.length === 0) return "";

  return deps.map(dep => {
    const sibling = allCandidates.find(c => c.id === dep.target);
    return `[${dep.target}] ${sibling.title}: ${sibling.description}
            Relationship: ${dep.type} - ${dep.reason}`;
  }).join("\n\n");
}
```

## Technical Design

### Phase Naming Convention

Replace all "step" references with descriptive phase names:

| Old Name | New Name |
|----------|----------|
| Step 1: Event Detection | EventDetection |
| Step 2: Extract Candidates | CandidateExtraction |
| (NEW) | DependencyMapping |
| Step 3: Score Confidence | ConfidenceScoring |
| Step 4: Enrich Context | ContextEnrichment |
| Step 5: Risk Analysis | RiskAnalysis |
| ... | ... |

This allows skipping phases without awkward numbering gaps.

### DependencyMapping Phase

**Input:**
- All candidates from CandidateExtraction
- Event type for context

**Processing:**
1. Pass all candidates to LLM as a batch
2. LLM analyzes relationships between all pairs
3. LLM assigns sequence numbers
4. LLM identifies parallelizable groups

**Output:**
- `dependencies: Dependency[]` - The dependency graph
- Updated candidates with `sequence` and `canParallelize`

**Prompt Strategy:**
```
You are analyzing a set of PBI candidates extracted from the same source.
Your task is to identify dependencies between them.

RULES:
1. Dependencies must be acyclic (no circular references)
   - If PBI-002 depends on PBI-001, then PBI-001 CANNOT depend on PBI-002
2. Use "blocks" only for true blockers (must complete first)
3. Use "relates-to" for related work that isn't blocking
4. Use "extends" when one PBI builds on another's functionality
5. Assign sequence numbers (1, 2, 3...) for suggested order
6. Mark canParallelize: true for PBIs with no blocking dependencies

CANDIDATES:
{candidatesList}

Analyze and return the dependency graph.
```

### Schema Definitions

```typescript
// src/pipeline/schemas/dependency.schema.ts

import { z } from "zod";

export const DependencyTypeEnum = z.enum(["blocks", "relates-to", "extends"]);
export const DependencyStrengthEnum = z.enum(["hard", "soft"]);

export const DependencySchema = z.object({
  source: z.string().describe("ID of the PBI that has the dependency"),
  target: z.string().describe("ID of the PBI it depends on"),
  type: DependencyTypeEnum.describe("Type of relationship"),
  reason: z.string().describe("Brief explanation of why this dependency exists"),
  strength: DependencyStrengthEnum.describe("How critical this dependency is"),
});

export type Dependency = z.infer<typeof DependencySchema>;

export const DependencyMappingResultSchema = z.object({
  dependencies: z.array(DependencySchema).describe("All identified dependencies"),
  sequenceAssignments: z.array(z.object({
    candidateId: z.string(),
    sequence: z.number().describe("Suggested execution order (1 = first)"),
    canParallelize: z.boolean().describe("True if no blocking dependencies"),
  })).describe("Sequence assignments for each candidate"),
  analysisNotes: z.string().optional().describe("Any observations about the dependency structure"),
});

export type DependencyMappingResult = z.infer<typeof DependencyMappingResultSchema>;
```

### Circular Dependency Prevention

**1. LLM Prompt Instructions:**
```
CRITICAL: Dependencies must form a Directed Acyclic Graph (DAG).
- Before adding a dependency A→B, verify B does not already depend on A
- If two PBIs are mutually related, use "relates-to" (not "blocks")
- When in doubt, prefer no dependency over creating a potential cycle
```

**2. Programmatic Validation:**
```typescript
// src/pipeline/utils/cycle-detection.ts

export function detectCycles(dependencies: Dependency[]): string[][] {
  // Build adjacency list
  const graph = new Map<string, string[]>();
  for (const dep of dependencies) {
    if (!graph.has(dep.source)) graph.set(dep.source, []);
    graph.get(dep.source)!.push(dep.target);
  }

  // DFS-based cycle detection
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    visited.add(node);
    recursionStack.add(node);

    for (const neighbor of graph.get(node) || []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor, [...path, neighbor]);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected
        const cycleStart = path.indexOf(neighbor);
        cycles.push(path.slice(cycleStart));
      }
    }

    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node, [node]);
    }
  }

  return cycles;
}
```

### Updated ConfidenceScoring

```typescript
// In confidence scoring prompt
const siblingContext = getSiblingContext(candidate.id, allCandidates, dependencies);

const prompt = `
Score this PBI candidate:
${candidateDetails}

${siblingContext ? `
SIBLING CONTEXT (from same source):
The following related PBIs will handle certain aspects. Do NOT penalize
this PBI for missing information that is covered by its dependencies:

${siblingContext}
` : ''}

Provide your scoring assessment.
`;
```

### Updated ContextEnrichment

Add a new context category: **Sibling Work**

```typescript
interface PBIEnrichment {
  // ...existing fields...

  // NEW: Context from sibling PBIs
  siblingWork: SiblingReference[];
}

interface SiblingReference {
  pbiId: string;
  title: string;
  relationship: DependencyType;
  reason: string;
  relevantContext: string;  // What this sibling provides
}
```

## Implementation Tasks

### Phase 1: Foundation
- [ ] Create `dependency.schema.ts` with Zod schemas
- [ ] Add `dependencies` to PipelineState with reducer
- [ ] Create `cycle-detection.ts` utility
- [ ] Rename all "step" references to phase names in codebase

### Phase 2: DependencyMapping Phase
- [ ] Create `dependency-mapping.prompt.ts`
- [ ] Create `dependency-mapping.node.ts`
- [ ] Add phase to pipeline graph (after CandidateExtraction)
- [ ] Add validation for cycles (warn but continue)

### Phase 3: Sibling Context Injection
- [ ] Create `getSiblingContext()` utility function
- [ ] Update `ConfidenceScoring` prompt to include sibling context
- [ ] Update `ConfidenceScoring` node to inject context
- [ ] Update `ContextEnrichment` to add `siblingWork` category
- [ ] Update enrichment prompt to reference siblings

### Phase 4: Sequence & Parallelization
- [ ] Add `sequence` and `canParallelize` to PBICandidate schema
- [ ] Update CandidateExtraction output to include these fields
- [ ] Display ordering in pipeline output

## Example Output

### Dependency Graph
```json
{
  "dependencies": [
    {
      "source": "PBI-002",
      "target": "PBI-001",
      "type": "blocks",
      "reason": "User profile requires authentication to be in place",
      "strength": "hard"
    },
    {
      "source": "PBI-003",
      "target": "PBI-001",
      "type": "blocks",
      "reason": "Admin dashboard needs auth for access control",
      "strength": "hard"
    },
    {
      "source": "PBI-003",
      "target": "PBI-002",
      "type": "extends",
      "reason": "Dashboard displays user profile data",
      "strength": "soft"
    }
  ],
  "sequenceAssignments": [
    { "candidateId": "PBI-001", "sequence": 1, "canParallelize": true },
    { "candidateId": "PBI-002", "sequence": 2, "canParallelize": false },
    { "candidateId": "PBI-003", "sequence": 3, "canParallelize": false }
  ]
}
```

### Visualization
```
PBI-001 (Auth)          ─┬─▶ PBI-002 (Profile) ─┬─▶ PBI-003 (Dashboard)
  [seq: 1, parallel: ✓]  │     [seq: 2]          │     [seq: 3]
                         └─────────────────────────┘
                              (also blocks)
```

## Acceptance Criteria

1. **DependencyMapping phase** analyzes all candidates and outputs dependency graph
2. **Dependency schema** captures: source, target, type, reason, strength
3. **Cycle detection** validates graph and warns on cycles
4. **ConfidenceScoring** receives sibling context for dependent PBIs
5. **ContextEnrichment** includes `siblingWork` category
6. **Sequence numbers** assigned to all candidates
7. **Parallelization** marked for PBIs with no blockers
8. **No "step" naming** - all phases use descriptive names
9. **LLM prompts** include circular dependency prevention instructions

## Downstream Phase Impacts

This PBI introduces sibling awareness that impacts multiple downstream phases:

| Phase | Impact | Changes |
|-------|--------|---------|
| **PBI-009: ContextEnrichment** | Inject sibling context | Add `siblingWork` category; filter external results that overlap with siblings |
| **PBI-010: RiskAnalysis** | Sibling-mitigated risks | Mark risks as `mitigated_by_sibling` with reference; assess residual risk |
| **PBI-011: QuestionsGeneration** | Sibling-answered questions | Mark questions as `answered_by_sibling`; use sibling content as proposed answers |
| **PBI-012: ReadinessChecker** | Batch readiness | Assess both individual and batch readiness; pass "Dependencies identified" for mapped siblings |

### Summary of Schema Additions

```typescript
// RiskAnalysis (PBI-010)
status: z.enum(["resolved", "unresolved", "unknown", "mitigated_by_sibling"]),
mitigatedBy: z.string().optional(),
residualRisk: z.enum(["none", "low", "medium"]).optional(),

// QuestionsGeneration (PBI-011)
status: z.enum(["needs_answer", "answered_by_sibling"]),
answeredBy: z.string().optional(),

// ContextEnrichment (PBI-009)
siblingWork: z.array(z.object({
  pbiId: z.string(),
  title: z.string(),
  relationship: DependencyType,
  reason: z.string(),
  relevantContext: z.string(),
})),

// ReadinessChecker (PBI-012)
batchReadiness: z.object({
  canSprintTogether: z.array(z.string()),
  minimumViableSet: z.array(z.string()),
}),
```

## Future Considerations

- **Cross-session dependencies**: PBIs from different meeting sessions that relate to each other
- **Dependency visualization**: Mermaid diagram generation in output
- **Sprint planning integration**: Use dependencies for sprint boundary recommendations
- **Critical path analysis**: Identify the longest dependency chain

## References

- [EPIC-001: LangChain Pipeline](./EPIC-001-langchain-pipeline.md)
- [PBI-008: Confidence Scoring](./PBI-008-confidence-scoring.md)
- [PBI-009: RAG Context Enrichment](./PBI-009-rag-enrichment.md)
