---
type: pbi
id: PBI-003
title: "Implement Improved Chunking Strategy"
status: planned
priority: medium
difficulty: medium
estimated_effort: 6-10 hours
---

# PBI-003: Implement Improved Chunking Strategy

## Problem Statement

Current chunking uses fixed-size splits (1000 chars, 200 overlap) which:
1. May cut sentences mid-thought
2. Doesn't respect document structure (headers, sections)
3. Same settings for all document types
4. 200 char overlap (~35 words) may not carry enough context

## Current Configuration

```typescript
// src/index-docs.ts
const CONFIG = {
  chunkSize: 1000,
  chunkOverlap: 200,
};

const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CONFIG.chunkSize,
  chunkOverlap: CONFIG.chunkOverlap,
  separators: ["\n## ", "\n### ", "\n#### ", "\n\n", "\n", " ", ""],
});
```

## Proposed Solutions

### Option A: Adaptive Chunking by Document Type

Different documents need different strategies:

```typescript
function getChunkingStrategy(category: string): TextSplitter {
  switch (category) {
    case "architecture":
    case "reference":
      // Technical docs: smaller, precise chunks
      return new RecursiveCharacterTextSplitter({
        chunkSize: 600,
        chunkOverlap: 150,  // 25% overlap
        separators: ["\n## ", "\n### ", "\n```", "\n\n", "\n", " "],
      });

    case "guide":
    case "pact":
      // Tutorial content: larger chunks for flow
      return new RecursiveCharacterTextSplitter({
        chunkSize: 1200,
        chunkOverlap: 200,
        separators: ["\n## ", "\n### ", "\n\n", "\n", " "],
      });

    case "backlog":
      // PBIs: keep acceptance criteria together
      return new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 100,
        separators: ["\n## ", "\n- [ ]", "\n\n", "\n"],
      });

    default:
      return new RecursiveCharacterTextSplitter({
        chunkSize: 800,
        chunkOverlap: 200,
      });
  }
}
```

### Option B: Section-Aware Markdown Splitting

Use LangChain's MarkdownTextSplitter to respect document structure:

```typescript
import { MarkdownTextSplitter } from "@langchain/textsplitters";

const markdownSplitter = new MarkdownTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Keeps headers with their content
// Respects code blocks
// Maintains list integrity
```

### Option C: Parent Document Retrieval

Index small chunks but return larger context:

```typescript
import { ParentDocumentRetriever } from "langchain/retrievers/parent_document";

const retriever = new ParentDocumentRetriever({
  vectorstore: chromaVectorStore,
  docstore: inMemoryStore,
  parentSplitter: new RecursiveCharacterTextSplitter({
    chunkSize: 2000,  // Large parent chunks
  }),
  childSplitter: new RecursiveCharacterTextSplitter({
    chunkSize: 400,   // Small child chunks for precise matching
  }),
});
```

## Acceptance Criteria

- [ ] Document type determines chunking strategy
- [ ] Code blocks are not split mid-block
- [ ] Headers stay with their section content
- [ ] Chunk overlap is configurable
- [ ] Re-indexing produces better retrieval results
- [ ] Benchmark: Compare retrieval accuracy before/after

## Benchmarking Plan

Test queries to compare:
1. "Fireflies Integration" → Should return fireflies docs
2. "PACT framework phases" → Should return pact docs
3. "ChromaDB setup" → Should return architecture docs
4. "PBI acceptance criteria" → Should return backlog docs

## Impact

- **Retrieval accuracy**: Moderate to high improvement
- **Indexing time**: May increase 20-50% with adaptive strategies
- **Storage**: May increase with parent document approach

## References

- [Chunking Strategies Research](../research/chunking-strategies.md)
- [LangChain MarkdownTextSplitter](https://js.langchain.com/docs/how_to/markdown_header_metadata_splitter/)
- [ParentDocumentRetriever](https://js.langchain.com/docs/how_to/parent_document_retriever/)