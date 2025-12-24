---
type: pbi
id: PBI-001
title: "Add Title/Source Context to Every Chunk"
status: planned
priority: high
difficulty: easy
estimated_effort: 2-4 hours
---

# PBI-001: Add Title/Source Context to Every Chunk

## Problem Statement

When documents are split into chunks, only the first chunk contains the title. Subsequent chunks lose context about their origin, making semantic search less effective.

**Example failure case**:
- Query: "Fireflies Integration"
- Document: `fireflies-integration.md` (title: "Fireflies Integration")
- Chunk 3 content: "## Caching\n\nThe integration includes intelligent caching..."
- Result: Chunk 3 doesn't match because "Fireflies Integration" isn't in the chunk

## Proposed Solution

Prepend document metadata to every chunk before embedding:

```typescript
// Before splitting, enrich the document content
const enrichedContent = `
[Document: ${metadata.title}]
[Source: ${metadata.source}]
[Type: ${metadata.doc_type || metadata.category}]

${body}
`;
```

## Acceptance Criteria

- [ ] Every chunk contains document title in its content
- [ ] Every chunk contains source file path
- [ ] Metadata context is formatted consistently
- [ ] Re-index all documents with enriched chunks
- [ ] Query "Fireflies Integration" returns fireflies-integration.md chunks

## Technical Notes

- Modify `loadMarkdownFile()` in `src/index-docs.ts`
- Content enrichment should happen before splitting
- Consider chunk size increase to accommodate added context (~100-150 chars)

## Impact

- **Retrieval accuracy**: High improvement expected
- **Storage**: Minimal increase (~5-10%)
- **Risk**: Low - simple text prepending

## References

- [Chunking Strategies Research](../research/chunking-strategies.md)