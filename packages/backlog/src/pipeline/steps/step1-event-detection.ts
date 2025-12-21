/**
 * Step 1: Event Detection
 *
 * Classifies meeting notes into one of the meeting types:
 * refinement, planning, standup, retrospective, or other
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import { EventDetectionSchema, type EventDetectionResult } from "../../schemas/index.js";
import { step1Prompt } from "../../prompts/index.js";

/**
 * Detect the type of meeting from notes
 *
 * @param meetingNotes - Plain text meeting notes
 * @param router - LLM Router instance
 * @returns Event detection result with type, confidence, and indicators
 *
 * @example
 * ```typescript
 * const router = new LLMRouter();
 * const result = await detectEvent(meetingNotes, router);
 * console.log(result.eventType); // "refinement"
 * ```
 */
export async function detectEvent(
  meetingNotes: string,
  router: LLMRouter
): Promise<EventDetectionResult> {
  // Get model with low temperature for consistent classification
  // Cast to BaseChatModel to resolve union type issues with withStructuredOutput
  const model = router.getModel({ temperature: 0 }) as BaseChatModel;

  // Create structured output model
  const structuredModel = model.withStructuredOutput(EventDetectionSchema);

  // Create and execute chain
  const chain = step1Prompt.pipe(structuredModel);
  const result = await chain.invoke({ meetingNotes });

  return result as EventDetectionResult;
}
