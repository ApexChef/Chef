/**
 * Detect Event Node
 *
 * Graph node wrapper for Step 1: Event Detection
 */

import type { PipelineStateType } from "../../state/index.js";
import { detectEvent } from "../../steps/index.js";
import { LLMRouter } from "../../../llm/index.js";

/**
 * Detect the type of meeting from notes
 *
 * Reads: meetingNotes
 * Writes: eventType, eventConfidence, eventIndicators, metadata
 */
export async function detectEventNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running detectEvent node...");

  // Call existing step function
  const result = await detectEvent(state.meetingNotes, router);

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] detectEvent complete (${elapsed}ms)`);

  // Return partial state update
  return {
    eventType: result.eventType,
    eventConfidence: result.confidence,
    eventIndicators: result.indicators,
    metadata: {
      provider: router.getConfig().provider,
      model: router.getConfig().model,
      timestamp: new Date().toISOString(),
      inputLength: state.meetingNotes.length,
      stepTimings: {
        detectEvent: elapsed,
      },
    },
  };
}
