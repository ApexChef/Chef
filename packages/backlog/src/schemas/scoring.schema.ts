/**
 * Schema for Step 3: Confidence Scoring
 */

import { z } from "zod";

/**
 * Score breakdown for each quality dimension
 */
export const ScoreBreakdownSchema = z.object({
  completeness: z
    .number()
    .min(0)
    .max(100)
    .describe("Does it have all necessary info (title, description, AC)?"),
  clarity: z
    .number()
    .min(0)
    .max(100)
    .describe("Is it clear and unambiguous?"),
  actionability: z
    .number()
    .min(0)
    .max(100)
    .describe("Can team start work immediately?"),
  testability: z
    .number()
    .min(0)
    .max(100)
    .describe("Can success be objectively measured?"),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

/**
 * Full scoring result for a single candidate
 */
export const ScoredCandidateSchema = z.object({
  candidateId: z.string().describe("ID of the candidate being scored"),
  scores: ScoreBreakdownSchema,
  overallScore: z
    .number()
    .min(0)
    .max(100)
    .describe("Weighted average of all dimension scores"),
  missingElements: z
    .array(z.string())
    .describe("What's missing from this PBI"),
  strengths: z.array(z.string()).describe("What's good about this PBI"),
  concerns: z.array(z.string()).describe("Potential issues or risks"),
  recommendations: z
    .array(z.string())
    .describe("Actionable improvement suggestions"),
});

export type ScoredCandidate = z.infer<typeof ScoredCandidateSchema>;

/**
 * Score distribution by label
 */
export const ScoreDistributionSchema = z.object({
  excellent: z.number().describe("Score >= 90"),
  good: z.number().describe("Score 75-89"),
  fair: z.number().describe("Score 60-74"),
  needsWork: z.number().describe("Score 40-59"),
  poor: z.number().describe("Score < 40"),
});

export type ScoreDistribution = z.infer<typeof ScoreDistributionSchema>;

/**
 * Summary of scoring results
 */
export const ScoringSummarySchema = z.object({
  totalScored: z.number(),
  averageScore: z.number(),
  distribution: ScoreDistributionSchema,
});

export type ScoringSummary = z.infer<typeof ScoringSummarySchema>;

/**
 * Complete confidence scoring result
 */
export const ConfidenceScoringResultSchema = z.object({
  scoredCandidates: z.array(ScoredCandidateSchema),
  summary: ScoringSummarySchema,
});

export type ConfidenceScoringResult = z.infer<typeof ConfidenceScoringResultSchema>;

/**
 * Score labels based on numeric score
 */
export type ScoreLabel = "Excellent" | "Good" | "Fair" | "Needs Work" | "Poor";
