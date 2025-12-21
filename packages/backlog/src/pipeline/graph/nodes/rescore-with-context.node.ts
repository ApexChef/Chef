/**
 * Rescore With Context Node
 *
 * Re-scores PBIs that have received additional human context.
 * Creates enriched candidates with the human-provided context
 * and runs them through scoring again.
 */

import type { PipelineStateType } from "../../state/index.js";
import { scoreConfidence } from "../../steps/index.js";
import { LLMRouter } from "@chef/core";
import type { PBICandidate, ScoredCandidate } from "../../../schemas/index.js";

/**
 * Re-score PBIs with human-provided context
 *
 * Reads: candidates, pbiStatuses, eventType
 * Writes: candidates (enriched), scoredCandidates (updated)
 *
 * Takes PBIs that have humanContext and creates enriched versions,
 * then re-scores them.
 */
export async function rescoreWithContextNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  // Find PBIs that need rescoring (have humanContext and are pending)
  const toRescore = state.pbiStatuses.filter(
    (s) => s.status === "pending" && s.humanContext && s.humanContext.length > 0
  );

  if (toRescore.length === 0) {
    console.log("[Graph] rescoreWithContext: No PBIs to rescore");
    return {};
  }

  console.log(
    `[Graph] rescoreWithContext: Re-scoring ${toRescore.length} PBI(s) with human context`
  );

  // Create enriched candidates with human context
  const enrichedCandidates: PBICandidate[] = [];

  for (const status of toRescore) {
    const original = state.candidates.find((c) => c.id === status.candidateId);
    if (!original) {
      console.warn(
        `[Graph] rescoreWithContext: Original candidate ${status.candidateId} not found`
      );
      continue;
    }

    // Enrich description with human context
    const enrichedDescription = `${original.extractedDescription}\n\n**Additional Context (from human):**\n${status.humanContext}`;

    const enriched: PBICandidate = {
      ...original,
      extractedDescription: enrichedDescription,
      humanContext: status.humanContext,
      consolidatedDescription: undefined, // Force re-consolidation
      rawContext: `${original.rawContext}\n\n[Human-provided context: ${status.humanContext}]`,
    };

    enrichedCandidates.push(enriched);
    console.log(
      `  [${status.candidateId}] Added ${status.humanContext!.length} chars of context`
    );
  }

  // Re-score the enriched candidates
  const result = await scoreConfidence(
    enrichedCandidates,
    state.eventType,
    router
  );

  // Merge new scores with existing scores (keep non-rescored ones)
  const rescoredIds = new Set(enrichedCandidates.map((c) => c.id));
  const existingScores = state.scoredCandidates.filter(
    (sc) => !rescoredIds.has(sc.candidateId)
  );
  const mergedScores: ScoredCandidate[] = [
    ...existingScores,
    ...result.scoredCandidates,
  ];

  // Update candidates with enriched versions
  const mergedCandidates = state.candidates.map((c) => {
    const enriched = enrichedCandidates.find((e) => e.id === c.id);
    return enriched ?? c;
  });

  const elapsed = Date.now() - startTime;
  console.log(
    `[Graph] rescoreWithContext complete: ${result.scoredCandidates.length} rescored (${elapsed}ms)`
  );

  // Log new scores
  for (const scored of result.scoredCandidates) {
    const status = toRescore.find((s) => s.candidateId === scored.candidateId);
    const oldScore = status?.score ?? 0;
    console.log(
      `  [${scored.candidateId}] ${oldScore} → ${scored.overallScore}`
    );
  }

  return {
    candidates: mergedCandidates,
    scoredCandidates: mergedScores,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        rescoreWithContext: elapsed,
      },
    },
  };
}
