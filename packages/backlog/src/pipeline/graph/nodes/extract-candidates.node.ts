/**
 * CandidateExtraction Node
 *
 * Extracts PBI candidates from meeting notes
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter, getContextLogger, runStep } from "@chef/core";
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
  return runStep('extractCandidates', async () => {
    const logger = getContextLogger();
    const startTime = Date.now();
    const router = new LLMRouter();

    logger.info({
      eventType: state.eventType,
      notesLength: state.meetingNotes.length
    }, 'Starting candidate extraction');

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

    logger.info({
      candidatesFound: result.totalFound,
      duration: elapsed
    }, 'Candidate extraction completed');

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
  });
}
