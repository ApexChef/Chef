/**
 * Step 2: Candidate Extraction
 *
 * Extracts PBI candidates from meeting notes
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import {
  CandidateExtractionSchema,
  type CandidateExtractionResult,
} from "../../schemas/index.js";
import { step2Prompt } from "../../prompts/index.js";

/**
 * Extract PBI candidates from meeting notes
 *
 * @param meetingNotes - Plain text meeting notes
 * @param eventType - Meeting type from Step 1 (provides context)
 * @param router - LLM Router instance
 * @returns Extraction result with candidates array
 *
 * @example
 * ```typescript
 * const router = new LLMRouter();
 * const result = await extractCandidates(notes, "refinement", router);
 * console.log(result.candidates.length); // 3
 * ```
 */
export async function extractCandidates(
  meetingNotes: string,
  eventType: string,
  router: LLMRouter
): Promise<CandidateExtractionResult> {
  // Get model with low temperature for consistent extraction
  // Cast to BaseChatModel to resolve union type issues with withStructuredOutput
  const model = router.getModel({ temperature: 0 }) as BaseChatModel;

  // Create structured output model
  const structuredModel = model.withStructuredOutput(CandidateExtractionSchema);

  // Create and execute chain
  const chain = step2Prompt.pipe(structuredModel);
  const result = await chain.invoke({ meetingNotes, eventType });

  return result as CandidateExtractionResult;
}
