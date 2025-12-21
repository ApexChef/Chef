/**
 * Combined runner for Steps 1-3
 *
 * Runs event detection, candidate extraction, and confidence scoring in sequence
 */

import { LLMRouter } from "@chef/core";
import type {
  EventDetectionResult,
  CandidateExtractionResult,
} from "../../schemas/index.js";
import type { ConfidenceScoringResult } from "../../schemas/scoring.schema.js";
import { detectEvent } from "./step1-event-detection.js";
import { extractCandidates } from "./step2-extract-candidates.js";
import { scoreConfidence } from "./step3-score-confidence.js";

/**
 * Result from running Steps 1, 2, and 3
 */
export interface Steps13Result {
  step1: EventDetectionResult;
  step2: CandidateExtractionResult;
  step3: ConfidenceScoringResult;
  metadata: {
    provider: string;
    model: string;
    timestamp: string;
    inputLength: number;
    step1TimeMs: number;
    step2TimeMs: number;
    step3TimeMs: number;
    totalTimeMs: number;
    candidatesScored: number;
    averageScore: number;
  };
}

/**
 * Run Steps 1, 2, and 3 on meeting notes
 *
 * @param meetingNotes - Plain text meeting notes
 * @param router - Optional LLM Router (creates default if not provided)
 * @returns Combined results from all three steps
 *
 * @example
 * ```typescript
 * const result = await runSteps13(meetingNotes);
 * console.log(result.step1.eventType);
 * console.log(result.step2.candidates);
 * console.log(result.step3.summary.averageScore);
 * ```
 */
export async function runSteps13(
  meetingNotes: string,
  router?: LLMRouter
): Promise<Steps13Result> {
  const llmRouter = router ?? new LLMRouter();
  const startTime = Date.now();

  // Step 1: Detect event type
  const step1Start = Date.now();
  const step1Result = await detectEvent(meetingNotes, llmRouter);
  const step1TimeMs = Date.now() - step1Start;

  // Step 2: Extract candidates (pass event type for context)
  const step2Start = Date.now();
  const step2Result = await extractCandidates(
    meetingNotes,
    step1Result.eventType,
    llmRouter
  );
  const step2TimeMs = Date.now() - step2Start;

  // Step 3: Score confidence for each candidate
  const step3Start = Date.now();
  const step3Result = await scoreConfidence(
    step2Result.candidates,
    step1Result.eventType,
    llmRouter
  );
  const step3TimeMs = Date.now() - step3Start;

  const totalTimeMs = Date.now() - startTime;

  return {
    step1: step1Result,
    step2: step2Result,
    step3: step3Result,
    metadata: {
      provider: llmRouter.getConfig().provider,
      model: llmRouter.getConfig().model,
      timestamp: new Date().toISOString(),
      inputLength: meetingNotes.length,
      step1TimeMs,
      step2TimeMs,
      step3TimeMs,
      totalTimeMs,
      candidatesScored: step3Result.summary.totalScored,
      averageScore: step3Result.summary.averageScore,
    },
  };
}
