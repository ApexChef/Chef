/**
 * Enrichment Schema
 *
 * Defines the structure for RAG-enriched PBI context.
 */

import { z } from "zod";

/**
 * Similar past work item
 */
export const SimilarWorkSchema = z.object({
  title: z.string().describe("Title of the similar work item"),
  source: z.string().describe("Source document path"),
  relevance: z.number().min(0).max(1).describe("Relevance score 0-1"),
  snippet: z.string().describe("Relevant snippet from the document"),
  type: z.string().optional().describe("Type of document (pbi, guide, etc.)"),
});

export type SimilarWork = z.infer<typeof SimilarWorkSchema>;

/**
 * Relevant ADR (Architectural Decision Record)
 */
export const RelevantADRSchema = z.object({
  id: z.string().describe("ADR identifier"),
  title: z.string().describe("ADR title"),
  decision: z.string().describe("The key decision made"),
  relevance: z.number().min(0).max(1).describe("Relevance score 0-1"),
  status: z.string().optional().describe("ADR status (accepted, deprecated, etc.)"),
});

export type RelevantADR = z.infer<typeof RelevantADRSchema>;

/**
 * Technical documentation reference
 */
export const TechnicalDocSchema = z.object({
  title: z.string().describe("Document title"),
  source: z.string().describe("Source path"),
  snippet: z.string().describe("Relevant snippet"),
  relevance: z.number().min(0).max(1).describe("Relevance score 0-1"),
});

export type TechnicalDoc = z.infer<typeof TechnicalDocSchema>;

/**
 * Lesson learned from past work
 */
export const LessonLearnedSchema = z.object({
  summary: z.string().describe("Summary of the lesson"),
  source: z.string().describe("Source document"),
  category: z.enum(["success", "failure", "improvement"]).describe("Type of lesson"),
});

export type LessonLearned = z.infer<typeof LessonLearnedSchema>;

/**
 * Complete enrichment data for a PBI candidate
 */
export const PBIEnrichmentSchema = z.object({
  candidateId: z.string().describe("The candidate ID this enrichment belongs to"),
  similarWork: z.array(SimilarWorkSchema).describe("Similar past PBIs or work items"),
  relevantADRs: z.array(RelevantADRSchema).describe("Relevant architectural decisions"),
  technicalDocs: z.array(TechnicalDocSchema).describe("Related technical documentation"),
  lessonsLearned: z.array(LessonLearnedSchema).describe("Lessons from past work"),
  contextSummary: z.string().describe("LLM-generated summary of relevant context"),
  queryTerms: z.array(z.string()).describe("Terms used for RAG queries"),
  totalRetrieved: z.number().describe("Total number of documents retrieved"),
});

export type PBIEnrichment = z.infer<typeof PBIEnrichmentSchema>;

/**
 * RAG retrieval result (raw from ChromaDB)
 */
export const RAGResultSchema = z.object({
  content: z.string(),
  metadata: z.record(z.unknown()),
  score: z.number(),
});

export type RAGResult = z.infer<typeof RAGResultSchema>;
