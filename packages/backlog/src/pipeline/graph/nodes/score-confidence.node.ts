/**
 * Score Confidence Node
 *
 * Graph node wrapper for Step 3: Confidence Scoring
 */

import type { PipelineStateType } from "../../state/index.js";
import { scoreConfidence } from "../../steps/index.js";
import { LLMRouter } from "../../../llm/index.js";

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

  // Read from shared state
  const result = await scoreConfidence(
    state.candidates,
    state.eventType,
    router
  );

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] scoreConfidence complete: avg ${result.summary.averageScore}/100 (${elapsed}ms)`);

  return {
    scoredCandidates: result.scoredCandidates,
    averageScore: result.summary.averageScore,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        scoreConfidence: elapsed,
      },
    },
  };
}
