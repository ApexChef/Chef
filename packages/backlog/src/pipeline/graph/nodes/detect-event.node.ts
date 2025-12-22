/**
 * EventDetection Node
 *
 * Classifies meeting notes into one of the meeting types:
 * refinement, planning, standup, retrospective, or other
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter, getContextLogger, runStep } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import { EventDetectionSchema } from "../../../schemas/index.js";
import { eventDetectionPrompt } from "../../../prompts/index.js";

/**
 * Detect the type of meeting from notes
 *
 * Reads: meetingNotes
 * Writes: eventType, eventConfidence, eventIndicators, metadata
 */
export async function detectEventNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  return runStep('detectEvent', async () => {
    const logger = getContextLogger();
    const startTime = Date.now();
    const router = new LLMRouter();

    logger.info({
      inputLength: state.meetingNotes.length
    }, 'Starting event detection');

    // Get model with low temperature for consistent classification
    const model = router.getModel({ temperature: 0 }) as BaseChatModel;
    const structuredModel = model.withStructuredOutput(EventDetectionSchema);

    // Create and execute chain
    const chain = eventDetectionPrompt.pipe(structuredModel);
    const result = await chain.invoke({ meetingNotes: state.meetingNotes });

    const elapsed = Date.now() - startTime;

    logger.info({
      eventType: result.eventType,
      confidence: result.confidence,
      indicators: result.indicators,
      duration: elapsed
    }, 'Event detection completed');

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
  });
}
