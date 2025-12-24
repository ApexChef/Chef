/**
 * ContextEnrichment Node
 *
 * Enriches approved PBIs with RAG context from:
 * - Similar past work (PBIs)
 * - Relevant ADRs (Architectural Decision Records)
 * - Technical documentation
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { StringOutputParser } from "@langchain/core/output_parsers";
import type { PipelineStateType } from "../../state/index.js";
import type {
  PBIEnrichment,
  SimilarWork,
  RelevantADR,
  TechnicalDoc,
  LessonLearned,
  RAGResult,
} from "../../../schemas/index.js";
import { contextEnrichmentPrompt, formatRAGResults } from "../../../prompts/index.js";
import { LLMRouter } from "@chef/core";
import { getRAGRetriever } from "@chef/core";

/**
 * Convert RAG results to SimilarWork items
 */
function toSimilarWork(results: RAGResult[]): SimilarWork[] {
  return results.map((r) => ({
    title: (r.metadata.title as string) || "Untitled",
    source: (r.metadata.source as string) || "unknown",
    relevance: r.score,
    snippet: r.content.slice(0, 300),
    type: (r.metadata.doc_type as string) || "unknown",
  }));
}

/**
 * Convert RAG results to RelevantADR items
 */
function toRelevantADRs(results: RAGResult[]): RelevantADR[] {
  return results.map((r) => ({
    id: (r.metadata.id as string) || (r.metadata.title as string) || "ADR",
    title: (r.metadata.title as string) || "Untitled",
    decision: r.content.slice(0, 300),
    relevance: r.score,
    status: (r.metadata.status as string) || "unknown",
  }));
}

/**
 * Convert RAG results to TechnicalDoc items
 */
function toTechnicalDocs(results: RAGResult[]): TechnicalDoc[] {
  return results.map((r) => ({
    title: (r.metadata.title as string) || "Untitled",
    source: (r.metadata.source as string) || "unknown",
    snippet: r.content.slice(0, 300),
    relevance: r.score,
  }));
}

/**
 * Extract lessons learned from RAG results
 * Looks for keywords indicating lessons, issues, or improvements
 */
function extractLessonsLearned(results: RAGResult[]): LessonLearned[] {
  const lessons: LessonLearned[] = [];
  const keywords = {
    failure: ["failed", "issue", "bug", "problem", "broken", "error"],
    success: ["success", "achieved", "completed", "improved", "fixed"],
    improvement: ["should", "recommend", "better", "improve", "consider"],
  };

  for (const r of results) {
    const content = r.content.toLowerCase();
    const source = (r.metadata.source as string) || "unknown";

    for (const [category, words] of Object.entries(keywords)) {
      if (words.some((w) => content.includes(w))) {
        // Extract a sentence containing the keyword
        const sentences = r.content.split(/[.!?]+/);
        for (const sentence of sentences) {
          if (words.some((w) => sentence.toLowerCase().includes(w))) {
            lessons.push({
              summary: sentence.trim().slice(0, 200),
              source,
              category: category as "failure" | "success" | "improvement",
            });
            break;
          }
        }
        break;
      }
    }
  }

  return lessons.slice(0, 5); // Limit to 5 lessons
}

/**
 * Enrich approved PBIs with RAG context
 *
 * For each approved PBI:
 * 1. Query RAG for similar work, ADRs, and technical docs
 * 2. Generate a context summary using LLM
 * 3. Store enrichment data in state
 */
export async function enrichContextNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();

  const approvedIds = state.approvedForEnrichment;
  const alreadyEnriched = state.enrichments?.map((e) => e.candidateId) ?? [];
  const toEnrich = approvedIds.filter((id) => !alreadyEnriched.includes(id));

  if (toEnrich.length === 0) {
    console.log("[Graph] enrichContext: No PBIs to enrich");
    return {
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          enrichContext: Date.now() - startTime,
        },
      },
    };
  }

  console.log(`[Graph] enrichContext: Enriching ${toEnrich.length} approved PBI(s)`);

  // Initialize RAG retriever
  const retriever = getRAGRetriever();
  let ragAvailable = false;

  try {
    ragAvailable = await retriever.isAvailable();
    if (ragAvailable) {
      await retriever.initialize();
      console.log("[Graph] enrichContext: RAG retriever connected");
    } else {
      console.log("[Graph] enrichContext: ChromaDB not available, using placeholder enrichment");
    }
  } catch (error) {
    console.log("[Graph] enrichContext: RAG initialization failed, using placeholder enrichment");
    ragAvailable = false;
  }

  // Initialize LLM for summary generation
  const router = new LLMRouter();
  const model = router.getModel({ temperature: 0.3 }) as BaseChatModel;
  const chain = contextEnrichmentPrompt.pipe(model).pipe(new StringOutputParser());

  const enrichments: PBIEnrichment[] = [];

  for (const candidateId of toEnrich) {
    const candidate = state.candidates.find((c) => c.id === candidateId);
    const scored = state.scoredCandidates.find((c) => c.candidateId === candidateId);

    if (!candidate) {
      console.warn(`[ContextEnrichment] Candidate ${candidateId} not found, skipping`);
      continue;
    }

    console.log(`[ContextEnrichment] Enriching ${candidateId}: "${candidate.title}"`);

    const description = candidate.consolidatedDescription || candidate.extractedDescription;
    const queryTerms = [candidate.title, candidate.type, description.slice(0, 100)];

    let similarWorkResults: RAGResult[] = [];
    let adrResults: RAGResult[] = [];
    let technicalDocResults: RAGResult[] = [];

    if (ragAvailable) {
      try {
        // Query RAG for all categories
        const ragResults = await retriever.queryForEnrichment(
          candidate.title,
          description,
          candidate.type
        );

        similarWorkResults = ragResults.similarWork;
        adrResults = ragResults.adrs;
        technicalDocResults = ragResults.technicalDocs;

        console.log(
          `[ContextEnrichment]   Retrieved: ${similarWorkResults.length} similar, ${adrResults.length} ADRs, ${technicalDocResults.length} docs`
        );
      } catch (error) {
        console.warn(`[ContextEnrichment]   RAG query failed for ${candidateId}:`, error);
      }
    }

    // Convert to typed structures
    const similarWork = toSimilarWork(similarWorkResults);
    const relevantADRs = toRelevantADRs(adrResults);
    const technicalDocs = toTechnicalDocs(technicalDocResults);
    const lessonsLearned = extractLessonsLearned([
      ...similarWorkResults,
      ...adrResults,
      ...technicalDocResults,
    ]);

    // Generate context summary
    let contextSummary = "No relevant context found in the knowledge base.";
    const totalRetrieved = similarWorkResults.length + adrResults.length + technicalDocResults.length;

    if (totalRetrieved > 0) {
      try {
        contextSummary = await chain.invoke({
          title: candidate.title,
          type: candidate.type,
          description,
          similarWork: formatRAGResults(similarWorkResults),
          adrs: formatRAGResults(adrResults),
          technicalDocs: formatRAGResults(technicalDocResults),
        });

        console.log(`[ContextEnrichment]   Generated summary (${contextSummary.length} chars)`);
      } catch (error) {
        console.warn(`[ContextEnrichment]   Summary generation failed for ${candidateId}:`, error);
        contextSummary = "Context summary generation failed. Please review the retrieved documents manually.";
      }
    }

    enrichments.push({
      candidateId,
      similarWork,
      relevantADRs,
      technicalDocs,
      lessonsLearned,
      contextSummary,
      queryTerms,
      totalRetrieved,
    });
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] enrichContext complete: ${enrichments.length} enriched (${elapsed}ms)`);

  return {
    enrichments,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        enrichContext: elapsed,
      },
    },
  };
}
