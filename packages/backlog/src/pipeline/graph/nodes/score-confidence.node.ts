/**
 * ConfidenceScoring Node
 *
 * Evaluates each PBI candidate's quality and assigns confidence scores.
 * Includes sibling context from DependencyMapping phase.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import type { PBICandidate, Dependency } from "../../../schemas/index.js";
import {
  ScoredCandidateSchema,
  type ScoredCandidate,
  type ScoreDistribution,
} from "../../../schemas/scoring.schema.js";
import { confidenceScoringPrompt } from "../../../prompts/index.js";
import { getScoreLabel } from "../../../constants/index.js";
import { getSiblingContext } from "./dependency-mapping.node.js";

/**
 * Score a single PBI candidate with sibling context
 */
async function scoreSingleCandidate(
  candidate: PBICandidate,
  eventType: string,
  model: BaseChatModel,
  allCandidates: PBICandidate[],
  dependencies: Dependency[]
): Promise<ScoredCandidate> {
  const structuredModel = model.withStructuredOutput(ScoredCandidateSchema);
  const chain = confidenceScoringPrompt.pipe(structuredModel);

  // Get sibling context from dependency mapping
  const siblingContext = getSiblingContext(candidate.id, allCandidates, dependencies);

  const result = await chain.invoke({
    candidateId: candidate.id,
    title: candidate.title,
    type: candidate.type,
    description: candidate.consolidatedDescription ?? candidate.extractedDescription,
    rawContext: candidate.rawContext,
    eventType,
    siblingContext,
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
 * Reads: candidates, eventType, dependencies
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
    console.log("[ConfidenceScoring] No candidates to score");
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
  const dependencies = state.dependencies || [];

  // Log if sibling context will be injected
  if (dependencies.length > 0) {
    console.log(`[ConfidenceScoring] Using ${dependencies.length} dependencies for sibling context`);
  }

  // Score each candidate individually
  for (const candidate of state.candidates) {
    console.log(`[ConfidenceScoring] Scoring ${candidate.id}...`);

    try {
      const scored = await scoreSingleCandidate(
        candidate,
        state.eventType,
        model,
        state.candidates,
        dependencies
      );
      scoredCandidates.push(scored);

      const label = getScoreLabel(scored.overallScore);
      console.log(`[ConfidenceScoring]   Score: ${scored.overallScore}/100 (${label})`);
    } catch (error) {
      console.error(`[ConfidenceScoring]   Failed to score ${candidate.id}:`, error);
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
 *
 * Note: This function doesn't have access to dependencies, so sibling context
 * is not injected during rescoring. This is intentional as rescoring happens
 * after human context is added, and the original dependencies are already known.
 */
export async function scoreMultipleCandidates(
  candidates: PBICandidate[],
  eventType: string,
  router: LLMRouter,
  dependencies: Dependency[] = []
): Promise<{ scoredCandidates: ScoredCandidate[]; averageScore: number }> {
  if (candidates.length === 0) {
    return { scoredCandidates: [], averageScore: 0 };
  }

  const model = router.getModel() as BaseChatModel;
  const scoredCandidates: ScoredCandidate[] = [];

  for (const candidate of candidates) {
    try {
      const scored = await scoreSingleCandidate(
        candidate,
        eventType,
        model,
        candidates,
        dependencies
      );
      scoredCandidates.push(scored);
    } catch (error) {
      console.error(`[ConfidenceScoring] Failed to score ${candidate.id}:`, error);
    }
  }

  const scores = scoredCandidates.map((sc) => sc.overallScore);
  const averageScore =
    scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

  return { scoredCandidates, averageScore };
}
