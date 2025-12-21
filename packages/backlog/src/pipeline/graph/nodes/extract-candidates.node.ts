/**
 * CandidateExtraction Node
 *
 * Extracts PBI candidates from meeting notes
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import { CandidateExtractionSchema } from "../../../schemas/index.js";
import { candidateExtractionPrompt } from "../../../prompts/index.js";

/**
 * Extract PBI candidates from meeting notes
 *
 * Reads: meetingNotes, eventType
 * Writes: candidates, extractionNotes, metadata.stepTimings
 */
export async function extractCandidatesNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running extractCandidates node...");

  // Get model with low temperature for consistent extraction
  const model = router.getModel({ temperature: 0 }) as BaseChatModel;
  const structuredModel = model.withStructuredOutput(CandidateExtractionSchema);

  // Create and execute chain
  const chain = candidateExtractionPrompt.pipe(structuredModel);
  const result = await chain.invoke({
    meetingNotes: state.meetingNotes,
    eventType: state.eventType,
  });

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] extractCandidates complete: ${result.totalFound} candidates (${elapsed}ms)`);

  return {
    candidates: result.candidates,
    extractionNotes: result.extractionNotes || "",
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        extractCandidates: elapsed,
      },
    },
  };
}
