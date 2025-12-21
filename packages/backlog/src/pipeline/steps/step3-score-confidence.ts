/**
 * Step 3: Score Confidence
 *
 * Evaluates each PBI candidate's quality and assigns confidence scores.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PBICandidate } from "../../schemas/index.js";
import {
  ScoredCandidateSchema,
  type ScoredCandidate,
  type ConfidenceScoringResult,
  type ScoreLabel,
  type ScoreDistribution,
} from "../../schemas/scoring.schema.js";
import { step3Prompt } from "../../prompts/step3-prompt.js";

/**
 * Get score label from numeric score
 */
export function getScoreLabel(score: number): ScoreLabel {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 60) return "Fair";
  if (score >= 40) return "Needs Work";
  return "Poor";
}

/**
 * Score a single PBI candidate
 */
export async function scoreSingleCandidate(
  candidate: PBICandidate,
  eventType: string,
  router: LLMRouter
): Promise<ScoredCandidate> {
  // Get model with structured output
  // Cast to BaseChatModel to resolve union type issues with withStructuredOutput
  const model = router.getModel() as BaseChatModel;
  const structuredModel = model.withStructuredOutput(ScoredCandidateSchema);

  // Build chain
  const chain = step3Prompt.pipe(structuredModel);

  // Invoke with candidate details (use consolidatedDescription if available, else extractedDescription)
  const result = await chain.invoke({
    candidateId: candidate.id,
    title: candidate.title,
    type: candidate.type,
    description: candidate.consolidatedDescription ?? candidate.extractedDescription,
    rawContext: candidate.rawContext,
    eventType,
  });

  return result as ScoredCandidate;
}

/**
 * Calculate score distribution
 */
function calculateDistribution(scores: number[]): ScoreDistribution {
  return {
    excellent: scores.filter((s) => s >= 90).length,
    good: scores.filter((s) => s >= 75 && s < 90).length,
    fair: scores.filter((s) => s >= 60 && s < 75).length,
    needsWork: scores.filter((s) => s >= 40 && s < 60).length,
    poor: scores.filter((s) => s < 40).length,
  };
}

/**
 * Score all PBI candidates for confidence
 *
 * @param candidates - PBI candidates from Step 2
 * @param eventType - Event type from Step 1
 * @param router - LLM Router instance
 * @returns Scoring results with summary
 *
 * @example
 * ```typescript
 * const result = await scoreConfidence(candidates, "refinement", router);
 * console.log(result.summary.averageScore);
 * result.scoredCandidates.forEach(sc => {
 *   console.log(`${sc.candidateId}: ${sc.overallScore}`);
 * });
 * ```
 */
export async function scoreConfidence(
  candidates: PBICandidate[],
  eventType: string,
  router: LLMRouter
): Promise<ConfidenceScoringResult> {
  // Handle empty candidates
  if (candidates.length === 0) {
    return {
      scoredCandidates: [],
      summary: {
        totalScored: 0,
        averageScore: 0,
        distribution: {
          excellent: 0,
          good: 0,
          fair: 0,
          needsWork: 0,
          poor: 0,
        },
      },
    };
  }

  const scoredCandidates: ScoredCandidate[] = [];

  // Score each candidate individually
  for (const candidate of candidates) {
    console.log(`[Step 3] Scoring ${candidate.id}...`);

    try {
      const scored = await scoreSingleCandidate(candidate, eventType, router);
      scoredCandidates.push(scored);

      const label = getScoreLabel(scored.overallScore);
      console.log(`[Step 3]   Score: ${scored.overallScore}/100 (${label})`);
    } catch (error) {
      console.error(`[Step 3]   Failed to score ${candidate.id}:`, error);
      // Continue with other candidates
    }
  }

  // Calculate summary
  const scores = scoredCandidates.map((sc) => sc.overallScore);
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return {
    scoredCandidates,
    summary: {
      totalScored: scoredCandidates.length,
      averageScore,
      distribution: calculateDistribution(scores),
    },
  };
}
