/**
 * Score Confidence Node (Step 3)
 *
 * Evaluates each PBI candidate's quality and assigns confidence scores.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import type { PBICandidate } from "../../../schemas/index.js";
import {
  ScoredCandidateSchema,
  type ScoredCandidate,
  type ScoreDistribution,
} from "../../../schemas/scoring.schema.js";
import { step3Prompt } from "../../../prompts/step3-prompt.js";
import { getScoreLabel } from "../../../constants/index.js";

/**
 * Score a single PBI candidate
 */
async function scoreSingleCandidate(
  candidate: PBICandidate,
  eventType: string,
  model: BaseChatModel
): Promise<ScoredCandidate> {
  const structuredModel = model.withStructuredOutput(ScoredCandidateSchema);
  const chain = step3Prompt.pipe(structuredModel);

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
 * Score PBI candidates for confidence
 *
 * Reads: candidates, eventType
 * Writes: scoredCandidates, averageScore, metadata.stepTimings
 */
export async function scoreConfidenceNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running scoreConfidence node...");

  // Handle empty candidates
  if (state.candidates.length === 0) {
    console.log("[Graph] scoreConfidence: No candidates to score");
    return {
      scoredCandidates: [],
      averageScore: 0,
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          scoreConfidence: Date.now() - startTime,
        },
      },
    };
  }

  const model = router.getModel() as BaseChatModel;
  const scoredCandidates: ScoredCandidate[] = [];

  // Score each candidate individually
  for (const candidate of state.candidates) {
    console.log(`[Graph] Scoring ${candidate.id}...`);

    try {
      const scored = await scoreSingleCandidate(candidate, state.eventType, model);
      scoredCandidates.push(scored);

      const label = getScoreLabel(scored.overallScore);
      console.log(`[Graph]   Score: ${scored.overallScore}/100 (${label})`);
    } catch (error) {
      console.error(`[Graph]   Failed to score ${candidate.id}:`, error);
      // Continue with other candidates
    }
  }

  // Calculate summary
  const scores = scoredCandidates.map((sc) => sc.overallScore);
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] scoreConfidence complete: avg ${averageScore}/100 (${elapsed}ms)`);

  return {
    scoredCandidates,
    averageScore,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        scoreConfidence: elapsed,
      },
    },
  };
}

/**
 * Score candidates with context (used by rescore-with-context node)
 * Exported for reuse in rescoring flow.
 */
export async function scoreMultipleCandidates(
  candidates: PBICandidate[],
  eventType: string,
  router: LLMRouter
): Promise<{ scoredCandidates: ScoredCandidate[]; averageScore: number }> {
  if (candidates.length === 0) {
    return { scoredCandidates: [], averageScore: 0 };
  }

  const model = router.getModel() as BaseChatModel;
  const scoredCandidates: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    try {
      const scored = await scoreSingleCandidate(candidate, eventType, model);
      scoredCandidates.push(scored);
    } catch (error) {
      console.error(`[Graph] Failed to score ${candidate.id}:`, error);
    }
  }

  const scores = scoredCandidates.map((sc) => sc.overallScore);
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return { scoredCandidates, averageScore };
}
