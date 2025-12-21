/**
 * Schema for Step 2: Candidate Extraction
 */

import { z } from "zod";

/**
 * PBI work item types
 */
export const PBITypeEnum = z.enum(["feature", "bug", "tech-debt", "spike"]);

export type PBIType = z.infer<typeof PBITypeEnum>;

/**
 * Single PBI candidate schema
 *
 * Tracks both LLM-extracted content and human-provided context
 */
export const PBICandidateSchema = z.object({
  id: z.string().describe("Unique identifier like PBI-001, PBI-002"),
  title: z.string().describe("Clear, actionable title for the work item"),
  type: PBITypeEnum.describe("Type of work item"),

  // Source tracking
  rawContext: z
    .string()
    .describe("Original text from meeting that mentioned this item"),

  // LLM-extracted description (from Step 2)
  extractedDescription: z
    .string()
    .describe("LLM-extracted description from meeting notes"),

  // Human-provided context (accumulated from HITL interactions)
  humanContext: z
    .string()
    .optional()
    .describe("Additional context provided by human during HITL review"),

  // Consolidated description (LLM-generated summary of extracted + human context)
  consolidatedDescription: z
    .string()
    .optional()
    .describe("LLM-generated summary combining extracted description and human context"),
});

export type PBICandidate = z.infer<typeof PBICandidateSchema>;

/**
 * Legacy alias for backward compatibility
 * @deprecated Use extractedDescription instead of description
 */
export const PBICandidateLegacySchema = PBICandidateSchema.extend({
  description: z.string().optional(),
});

/**
 * Candidate extraction output schema
 */
export const CandidateExtractionSchema = z.object({
  candidates: z.array(PBICandidateSchema).describe("List of extracted PBI candidates"),
  totalFound: z.number().describe("Total number of candidates found"),
  extractionNotes: z
    .string()
    .optional()
    .describe("Any notes about the extraction process"),
});

export type CandidateExtractionResult = z.infer<typeof CandidateExtractionSchema>;
