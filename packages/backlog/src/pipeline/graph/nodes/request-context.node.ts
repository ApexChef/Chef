/**
 * Request Context Node
 *
 * Interrupts execution to get additional context for PBIs
 * with low confidence scores (<50) or rejected by human.
 */

import { interrupt, Command } from "@langchain/langgraph";
import type { PipelineStateType, PBIHITLStatus } from "../../state/index.js";
import type { PBICandidate } from "../../../schemas/index.js";

/**
 * Interrupt payload for context requests
 */
export interface ContextInterruptPayload {
  type: "context";
  message: string;
  requests: Array<{
    candidateId: string;
    title: string;
    currentDescription: string;
    score: number;
    missingElements: string[];
    recommendations: string[];
    specificQuestions: string[];
  }>;
}

/**
 * Expected response format from human
 */
export interface ContextResponse {
  contexts: Record<string, string>; // candidateId -> additional context
}

/**
 * Generate specific questions for what context is needed
 */
function generateContextQuestions(
  missingElements: string[],
  recommendations: string[]
): string[] {
  const questions: string[] = [];

  // Convert missing elements to questions
  for (const missing of missingElements.slice(0, 3)) {
    if (missing.toLowerCase().includes("acceptance criteria")) {
      questions.push("What specific conditions should be met for this to be considered done?");
    } else if (missing.toLowerCase().includes("description")) {
      questions.push("Can you provide more details about what this PBI should accomplish?");
    } else if (missing.toLowerCase().includes("scope")) {
      questions.push("What is in scope and out of scope for this PBI?");
    } else {
      questions.push(`Please provide: ${missing}`);
    }
  }

  // Add questions from recommendations
  for (const rec of recommendations.slice(0, 2)) {
    if (!questions.some((q) => q.toLowerCase().includes(rec.toLowerCase().slice(0, 20)))) {
      questions.push(rec.endsWith("?") ? rec : `${rec}?`);
    }
  }

  return questions.slice(0, 5); // Max 5 questions
}

/**
 * Request additional context for low-score or rejected PBIs
 *
 * Reads: scoredCandidates, candidates, pbiStatuses, pendingInterrupt
 * Writes: pbiStatuses (via Command to rescore)
 *
 * Uses interrupt() to pause and wait for human context.
 * Note: This is a sync function - interrupt() handles the pause/resume.
 */
export function requestContextNode(state: PipelineStateType): Command {
  // Only process if we have context-type interrupt
  if (state.pendingInterrupt?.type !== "context") {
    console.log("[Graph] requestContext: No context interrupt pending, skipping");
    return new Command({ goto: "routeByScore" });
  }

  const pendingIds = state.pendingInterrupt.candidateIds;
  console.log(
    `[Graph] requestContext: Requesting context for ${pendingIds.length} PBI(s)`
  );

  // Build interrupt payload with context requests
  const requests = pendingIds.map((id) => {
    const candidate = state.candidates.find((c) => c.id === id);
    const scored = state.scoredCandidates.find((c) => c.candidateId === id);
    const pbiStatus = state.pbiStatuses.find((s) => s.candidateId === id);

    const missingElements = scored?.missingElements ?? [];
    const recommendations = scored?.recommendations ?? [];

    return {
      candidateId: id,
      title: candidate?.title ?? "Unknown",
      currentDescription: candidate?.extractedDescription ?? "",
      score: pbiStatus?.score ?? scored?.overallScore ?? 0,
      missingElements,
      recommendations,
      specificQuestions: generateContextQuestions(missingElements, recommendations),
    };
  });

  const payload: ContextInterruptPayload = {
    type: "context",
    message: state.pendingInterrupt.message,
    requests,
  };

  // INTERRUPT - pauses execution and waits for human context
  // On first call: throws to pause the graph
  // On resume: returns the user's response
  const response = interrupt(payload) as ContextResponse;

  console.log("[Graph] requestContext: Received human context");

  // Update statuses with human-provided context
  const updatedStatuses: PBIHITLStatus[] = pendingIds.map((id) => {
    const existing = state.pbiStatuses.find((s) => s.candidateId === id);
    const humanContext = response.contexts[id] ?? "";

    return {
      candidateId: id,
      score: existing?.score ?? 0,
      status: "pending" as const, // Ready to rescore
      rescoreCount: (existing?.rescoreCount ?? 0) + 1,
      humanContext,
      humanDecision: undefined, // Clear previous decision
    };
  });

  // Also update candidates with human context (append to existing)
  const updatedCandidates: PBICandidate[] = pendingIds.map((id) => {
    const candidate = state.candidates.find((c) => c.id === id);
    const newContext = response.contexts[id] ?? "";
    const existingContext = candidate?.humanContext ?? "";

    // Append new context to existing (if any)
    const combinedContext = existingContext
      ? `${existingContext}\n\n---\n\n${newContext}`
      : newContext;

    return {
      ...candidate!,
      humanContext: combinedContext,
      // Clear consolidated description to force re-consolidation
      consolidatedDescription: undefined,
    };
  });

  // Route to rescore with the new context
  return new Command({
    goto: "rescoreWithContext",
    update: {
      pbiStatuses: updatedStatuses,
      candidates: updatedCandidates,
      pendingInterrupt: null, // Clear the interrupt
    },
  });
}
