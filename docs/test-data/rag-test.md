# Sprint Planning - RAG Test

## Attendees
Sarah (PM), Mike (Dev Lead)

## Discussion

Sarah: We need two features for this sprint.

### Feature 1: RAG Search Improvements
Mike: Users say search results aren't relevant. Let's implement semantic search with vector embeddings using ChromaDB.
Sarah: Sounds like PBI-002 hybrid search approach. High priority - users are frustrated.

### Feature 2: Simple Logging
Sarah: Also need basic request logging for debugging.
Mike: Easy - just add middleware. Low effort.

## Decisions
- RAG search: High priority, reuse PBI-002 patterns
- Logging: Medium priority, straightforward
