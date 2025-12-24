---
type: pbi
id: PBI-005
title: "Tune Retrieval Parameters and Add Relevance Scoring"
status: planned
priority: medium
difficulty: easy
estimated_effort: 2-4 hours
---

# PBI-005: Tune Retrieval Parameters and Add Relevance Scoring

## Problem Statement

Current retrieval uses fixed parameters without visibility into relevance:
- Fixed k=5 documents retrieved
- No similarity score threshold
- No visibility into why documents were retrieved

## Current Configuration

```typescript
// src/query-rag.ts
const CONFIG = {
  retrievalK: 5,  // Fixed number of documents
};

const retriever = vectorStore.asRetriever({
  k: CONFIG.retrievalK,
});
```

## Proposed Improvements

### 1. Increase Retrieval Count

```typescript
const CONFIG = {
  retrievalK: 10,  // Retrieve more, let LLM filter
};
```

### 2. Add Similarity Score Threshold

Only return documents above a relevance threshold:

```typescript
const retriever = vectorStore.asRetriever({
  k: 10,
  filter: undefined,
  searchType: "similarity",
  scoreThreshold: 0.7,  // Only docs with >70% similarity
});
```

### 3. Display Relevance Scores

Show similarity scores in output for debugging:

```typescript
// Use similaritySearchWithScore instead of invoke
const results = await vectorStore.similaritySearchWithScore(query, 10);

results.forEach(([doc, score], i) => {
  console.log(`[${i + 1}] ${doc.metadata.source} (score: ${score.toFixed(3)})`);
});
```

### 4. Configurable via CLI

```typescript
// query-rag.ts
const args = parseArgs(process.argv.slice(2), {
  k: { type: "number", default: 5 },
  threshold: { type: "number", default: 0.0 },
  showScores: { type: "boolean", default: false },
});
```

Usage:
```bash
npm run query -- "Fireflies" --k 10 --threshold 0.7 --showScores
```

## Acceptance Criteria

- [ ] Retrieval count (k) is configurable via CLI
- [ ] Similarity threshold can be set
- [ ] Relevance scores displayed with `--showScores` flag
- [ ] Documents below threshold are excluded
- [ ] Default values work without any flags

## Benchmarking

Test different k values:

| k | Query | Relevant Found | Noise |
|---|-------|----------------|-------|
| 3 | "Fireflies" | ? | ? |
| 5 | "Fireflies" | ? | ? |
| 10 | "Fireflies" | ? | ? |

## Impact

- **Retrieval accuracy**: Moderate improvement with tuning
- **User experience**: Better debugging capabilities
- **Complexity**: Low

## References

- [LangChain Vector Store Retriever](https://js.langchain.com/docs/how_to/vectorstore_retriever/)