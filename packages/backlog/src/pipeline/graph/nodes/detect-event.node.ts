/**
 * Detect Event Node (Step 1)
 *
 * Classifies meeting notes into one of the meeting types:
 * refinement, planning, standup, retrospective, or other
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import { EventDetectionSchema } from "../../../schemas/index.js";
import { step1Prompt } from "../../../prompts/index.js";

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

  // Get model with low temperature for consistent classification
  const model = router.getModel({ temperature: 0 }) as BaseChatModel;
  const structuredModel = model.withStructuredOutput(EventDetectionSchema);

  // Create and execute chain
  const chain = step1Prompt.pipe(structuredModel);
  const result = await chain.invoke({ meetingNotes: state.meetingNotes });

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] detectEvent complete: ${result.eventType} (${elapsed}ms)`);

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
