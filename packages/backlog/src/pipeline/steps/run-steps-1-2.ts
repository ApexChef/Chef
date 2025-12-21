/**
 * Combined runner for Steps 1-2
 *
 * Runs event detection and candidate extraction in sequence
 */

import { LLMRouter } from "@chef/core";
import type { EventDetectionResult, CandidateExtractionResult } from "../../schemas/index.js";
import { detectEvent } from "./step1-event-detection.js";
import { extractCandidates } from "./step2-extract-candidates.js";

/**
 * Result from running Steps 1 and 2
 */
export interface Steps12Result {
  step1: EventDetectionResult;
  step2: CandidateExtractionResult;
  metadata: {
    provider: string;
    model: string;
    timestamp: string;
    inputLength: number;
    step1TimeMs: number;
    step2TimeMs: number;
    totalTimeMs: number;
  };
}

/**
 * Run Steps 1 and 2 on meeting notes
 *
 * @param meetingNotes - Plain text meeting notes
 * @param router - Optional LLM Router (creates default if not provided)
 * @returns Combined results from both steps
 *
 * @example
 * ```typescript
 * const result = await runSteps12(meetingNotes);
 * console.log(result.step1.eventType);
 * console.log(result.step2.candidates);
 * ```
 */
export async function runSteps12(
  meetingNotes: string,
  router?: LLMRouter
): Promise<Steps12Result> {
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

  const totalTimeMs = Date.now() - startTime;

  return {
    step1: step1Result,
    step2: step2Result,
    metadata: {
      provider: llmRouter.getConfig().provider,
      model: llmRouter.getConfig().model,
      timestamp: new Date().toISOString(),
      inputLength: meetingNotes.length,
      step1TimeMs,
      step2TimeMs,
      totalTimeMs,
    },
  };
}
