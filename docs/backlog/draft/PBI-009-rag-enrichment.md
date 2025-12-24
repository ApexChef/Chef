---
type: pbi
id: PBI-009
title: "ContextEnrichment: RAG Context Enrichment"
status: planned
priority: high
difficulty: medium
estimated_effort: 6-8 hours
epic: EPIC-001
phase: 3
dependencies: [PBI-008, PBI-017]
tags: [langchain, pipeline, rag, chromadb, context, sibling-awareness]
created: 2024-12-11
updated: 2024-12-21
acceptance_criteria:
  - Integrates existing ChromaDB RAG setup
  - Retrieves similar past work for each candidate
  - Finds relevant ADRs and technical decisions
  - Enriches PBI with historical context
  - Includes sibling PBI context from dependency graph (PBI-017)
  - Filters external results that overlap with sibling coverage
---

# PBI-009: ContextEnrichment Phase

## Overview

Implement the ContextEnrichment phase: use the existing RAG infrastructure to enrich PBI candidates with relevant context from past work, ADRs, and documentation.

> **Note**: This phase must be sibling-aware (see PBI-017). When enriching a PBI, include context from sibling PBIs that were extracted from the same source.

## User Story

As a developer, I want PBIs enriched with relevant historical context so that I can avoid past mistakes and leverage existing patterns.

## Requirements

### Functional Requirements

1. Query ChromaDB for each PBI candidate
2. Retrieve similar past work (previous PBIs)
3. Find relevant ADRs and technical constraints
4. Identify related documentation
5. Flag past failures and lessons learned

### Context Categories

- **Sibling Work** (NEW): PBIs from the same source that this PBI depends on or relates to
- **Similar Past Work**: External PBIs with similar titles/descriptions (filter out sibling-covered topics)
- **Relevant ADRs**: Architectural decisions that apply
- **Technical Docs**: Specs and implementation guides
- **Lessons Learned**: Past failures or issues

### Sibling Awareness (PBI-017 Integration)

When enriching a PBI that has dependencies (from DependencyMapping phase):

1. **Inject sibling context**: Include related PBIs from the dependency graph
2. **Filter external results**: Avoid duplicate context that siblings already cover
3. **Cross-reference**: Note when external docs relate to sibling responsibilities

```typescript
// Example: If PBI-002 depends on PBI-001
const siblingWork = dependencies
  .filter(d => d.source === "PBI-002")
  .map(d => {
    const sibling = candidates.find(c => c.id === d.target);
    return {
      pbiId: sibling.id,
      title: sibling.title,
      relationship: d.type,      // "blocks", "relates-to", "extends"
      reason: d.reason,
      relevantContext: sibling.description,
    };
  });
```

## Technical Design

```typescript
// src/pipeline/steps/step4-enrich-context.ts
import { ChromaClient } from "chromadb";
import { OllamaEmbeddings } from "@langchain/ollama";

const EnrichedCandidateSchema = z.object({
  candidateId: z.string(),
  title: z.string(),
  enrichment: z.object({
    similarWork: z.array(z.object({
      title: z.string(),
      source: z.string(),
      relevance: z.number(),
      snippet: z.string(),
    })),
    relevantADRs: z.array(z.object({
      id: z.string(),
      title: z.string(),
      decision: z.string(),
      relevance: z.number(),
    })),
    technicalDocs: z.array(z.object({
      title: z.string(),
      source: z.string(),
      snippet: z.string(),
    })),
    lessonsLearned: z.array(z.string()),
  }),
  contextSummary: z.string(), // LLM-generated summary of relevant context
});
```

### Leveraging Existing Infrastructure

This project already has:
- `src/index-docs.ts` - Document indexer
- `src/query-rag.ts` - RAG query interface
- ChromaDB collection: `backlog-chef-docs` (3485 chunks)
- Ollama embeddings: `nomic-embed-text`

The step will reuse these components and wrap them in a LangChain-style retrieval chain.

### Sample Output

```json
{
  "enrichedCandidate": {
    "candidateId": "candidate-1",
    "title": "Add User Authentication with OAuth",
    "enrichment": {
      "similarWork": [
        {
          "title": "PBI-023: Add JWT Token Authentication",
          "source": "docs/backlog/completed/PBI-023.md",
          "relevance": 0.87,
          "snippet": "Implemented JWT-based auth with refresh tokens..."
        }
      ],
      "relevantADRs": [
        {
          "id": "ADR-005",
          "title": "Authentication Strategy",
          "decision": "Use OAuth 2.0 with PKCE for SPAs",
          "relevance": 0.92
        }
      ],
      "technicalDocs": [
        {
          "title": "Security Best Practices",
          "source": "docs/architecture/security.md",
          "snippet": "Always use HTTPS, secure cookies..."
        }
      ],
      "lessonsLearned": [
        "Previous OAuth implementation had token refresh issues - ensure proper error handling"
      ]
    },
    "contextSummary": "Based on past work, the team has experience with JWT auth (PBI-023) and has an ADR recommending OAuth 2.0 with PKCE. Key lesson: pay attention to token refresh error handling."
  }
}
```

## Acceptance Criteria

- [ ] Step 4 queries ChromaDB using existing infrastructure
- [ ] Similar work retrieved with relevance scores
- [ ] ADRs filtered by relevance
- [ ] Context summary generated by LLM
- [ ] Top-K results configurable (default: 5)
- [ ] Relevance threshold configurable (default: 0.3)

## Implementation Notes

1. Reuse `query-rag.ts` retriever logic
2. Add metadata filtering (type: adr, type: pbi, etc.)
3. Use LangChain's retrieval chain pattern
4. Generate summary using LLM Router

## References

- [Existing RAG Implementation](src/query-rag.ts)
- [Backlog Chef Step 4 Spec](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/docs/project/specifications/step4-enrich-context.md)
- [LangChain Retrieval](https://js.langchain.com/docs/how_to/qa_chat_history_how_to/)
