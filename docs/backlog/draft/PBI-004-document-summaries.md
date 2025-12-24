---
type: pbi
id: PBI-004
title: "Generate Document Summaries for Improved Retrieval"
status: planned
priority: low
difficulty: hard
estimated_effort: 8-12 hours
---

# PBI-004: Generate Document Summaries for Improved Retrieval

## Problem Statement

High-level queries like "What is Fireflies?" or "Tell me about the integration" don't match specific content chunks well. Users asking overview questions get detailed implementation chunks instead of summaries.

## Proposed Solution

Generate AI summaries during indexing and store them as special chunks:

```typescript
async function generateDocumentSummary(doc: Document): Promise<Document> {
  const llm = new ChatAnthropic({
    model: "claude-haiku-3",  // Fast, cheap for summaries
    temperature: 0,
  });

  const prompt = `Summarize this document in 2-3 sentences.
Focus on: what it is, what it does, and key features.

Document title: ${doc.metadata.title}
Content:
${doc.pageContent.slice(0, 3000)}  // First 3000 chars

Summary:`;

  const summary = await llm.invoke(prompt);

  return new Document({
    pageContent: summary.content as string,
    metadata: {
      ...doc.metadata,
      chunk_type: "summary",
      is_summary: true,
    },
  });
}
```

## Indexing Pipeline

```
Document
    │
    ├──► Generate Summary ──► Summary Chunk (indexed)
    │
    └──► Split Content ──► Content Chunks (indexed)

Query Flow:
    │
    ├── Overview query ──► Matches Summary Chunk
    │
    └── Detail query ──► Matches Content Chunks
```

## Acceptance Criteria

- [ ] Summary generation integrated into indexing pipeline
- [ ] Summaries marked with `chunk_type: "summary"` metadata
- [ ] Summaries are 2-3 sentences, ~200-300 characters
- [ ] Query can optionally filter to summaries only
- [ ] Cost tracking for LLM calls during indexing

## Technical Considerations

### Cost Analysis
- 207 documents × ~1000 tokens each = 207,000 input tokens
- 207 summaries × ~100 tokens each = 20,700 output tokens
- Using Claude Haiku: ~$0.05-0.10 total

### Performance
- Adds ~1-2 seconds per document for summary generation
- 207 docs × 1.5s = ~5 minutes additional indexing time

### Caching
- Cache summaries separately to avoid re-generation
- Only regenerate if document content changed

## Alternative: Use Existing Frontmatter Description

Many documents already have `description` in frontmatter:

```yaml
---
title: "Fireflies Integration"
description: "Integrate Backlog Chef with Fireflies.ai to automatically
fetch meeting transcripts without manual exports"
---
```

**Quick win**: Index the `description` field as a summary chunk without LLM calls.

```typescript
if (frontmatter.description) {
  const summaryChunk = new Document({
    pageContent: `${frontmatter.title}: ${frontmatter.description}`,
    metadata: {
      ...metadata,
      chunk_type: "summary",
    },
  });
  chunks.push(summaryChunk);
}
```

## Impact

- **Retrieval accuracy**: High for overview queries
- **Cost**: Low if using frontmatter, moderate if using LLM
- **Complexity**: Medium

## References

- [Chunking Strategies Research](../research/chunking-strategies.md)
- [Multi-Representation Indexing](https://python.langchain.com/docs/how_to/multi_vector/)