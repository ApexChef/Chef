/**
 * Prompt template for ContextEnrichment phase
 *
 * Generates a context summary from RAG-retrieved documents.
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";

export const CONTEXT_ENRICHMENT_SYSTEM_PROMPT = `You are an expert at synthesizing relevant context for Product Backlog Items (PBIs).

Given a PBI and relevant documents retrieved from the codebase, create a concise context summary that will help developers understand:
1. What similar work has been done before
2. What architectural decisions apply
3. What technical documentation is relevant
4. What lessons have been learned

Be specific and actionable. Reference specific documents where relevant.
Keep the summary focused and under 300 words.`;

export const contextEnrichmentPrompt = ChatPromptTemplate.fromMessages([
  ["system", CONTEXT_ENRICHMENT_SYSTEM_PROMPT],
  [
    "human",
    `PBI Title: {title}
PBI Type: {type}
PBI Description:
{description}

---

Similar Past Work:
{similarWork}

---

Relevant ADRs (Architectural Decisions):
{adrs}

---

Technical Documentation:
{technicalDocs}

---

Create a context summary that synthesizes the most relevant information for this PBI.
Include specific recommendations based on past work and decisions.
Note any potential conflicts or considerations from the retrieved context.`,
  ],
]);

/**
 * Format RAG results for prompt injection
 */
export function formatRAGResults(
  results: Array<{
    content: string;
    metadata: Record<string, unknown>;
    score: number;
  }>
): string {
  if (results.length === 0) {
    return "No relevant documents found.";
  }

  return results
    .map((r, i) => {
      const title = (r.metadata.title as string) || "Untitled";
      const source = (r.metadata.source as string) || "unknown";
      const score = (r.score * 100).toFixed(0);
      const snippet = r.content.slice(0, 500);
      return `[${i + 1}] ${title} (${source}) - ${score}% relevance\n${snippet}...`;
    })
    .join("\n\n");
}
