/**
 * Extract Candidates Node
 *
 * Graph node wrapper for Step 2: Candidate Extraction
 */

import type { PipelineStateType } from "../../state/index.js";
import { extractCandidates } from "../../steps/index.js";
import { LLMRouter } from "@chef/core";

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

  // Read from shared state - no parameter passing!
  const result = await extractCandidates(
    state.meetingNotes,
    state.eventType,
    router
  );

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
