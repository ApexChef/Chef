---
type: pbi
id: PBI-002
title: "Implement Hybrid Search (Semantic + Metadata Filtering)"
status: planned
priority: high
difficulty: medium
estimated_effort: 4-8 hours
---

# PBI-002: Implement Hybrid Search (Semantic + Metadata Filtering)

## Problem Statement

Our current search is pure semantic (vector similarity). This fails when:
1. User queries contain specific terms/names that should match exactly
2. User wants to filter by document type, status, or tags
3. Generic queries return generic results instead of targeted documents

**Current behavior**:
- Query: "Fireflies Integration" → Returns unrelated docs about "Documentation Structure"
- No way to filter by `tags: fireflies` or `doc_type: architecture`

## Proposed Solution

### Phase 1: Metadata Filtering (Quick Win)

Add ChromaDB `where` clause filtering to queries:

```typescript
// In query-rag.ts - add metadata filter support
const results = await collection.query({
  queryEmbeddings: [queryVector],
  nResults: CONFIG.retrievalK,
  where: {
    "$or": [
      { "tags": { "$contains": searchTerm } },
      { "doc_type": { "$eq": filterType } }
    ]
  }
});
```

### Phase 2: Full Hybrid Search (Advanced)

Implement Reciprocal Rank Fusion combining:
- Semantic search (vector similarity)
- Keyword search (BM25)

```typescript
import { EnsembleRetriever } from "langchain/retrievers/ensemble";

const hybridRetriever = new EnsembleRetriever({
  retrievers: [vectorRetriever, bm25Retriever],
  weights: [0.6, 0.4],  // Semantic-weighted
});
```

## Acceptance Criteria

### Phase 1
- [ ] Query can filter by `doc_type` (architecture, pbi, guide, etc.)
- [ ] Query can filter by `status` (active, planned, completed)
- [ ] Query can filter by `tags` (contains keyword)
- [ ] CLI supports filter flags: `--type`, `--status`, `--tags`

### Phase 2
- [ ] BM25 keyword retriever implemented
- [ ] Ensemble retriever combines both methods
- [ ] Configurable weights for semantic vs keyword
- [ ] Query "Fireflies" matches exact term in chunks

## Technical Notes

### Already Indexed Metadata
We already store this in ChromaDB:
- `doc_type`, `doc_id`, `status`, `priority`, `phase`
- `pbi_ref`, `tags`, `category`, `title`, `source`

### ChromaDB Filter Operators
| Operator | Use Case |
|----------|----------|
| `$eq` | Exact match: `status = "active"` |
| `$in` | Multiple values: `status in ["active", "planned"]` |
| `$contains` | Substring: `tags contains "api"` |
| `$and`, `$or` | Combine conditions |

## Impact

- **Retrieval accuracy**: Significant improvement
- **User experience**: Targeted searches possible
- **Complexity**: Medium - requires query parsing

## References

- [RAG Retrieval Concepts](../research/rag-retrieval-concepts.md)
- [ChromaDB Filtering Docs](https://docs.trychroma.com/guides#filtering-by-metadata)
- [LangChain Ensemble Retriever](https://js.langchain.com/docs/how_to/ensemble_retriever/)