/**
 * Human Approval Node
 *
 * Interrupts execution to get human approval for PBIs
 * with medium confidence scores (50-74).
 */

import { Command, interrupt } from "@langchain/langgraph";
import type { PipelineStateType, PBIHITLStatus } from "../../state/index.js";

/**
 * Interrupt payload for approval requests
 */
export interface ApprovalInterruptPayload {
  type: "approval";
  message: string;
  candidates: Array<{
    candidateId: string;
    title: string;
    score: number;
    strengths: string[];
    concerns: string[];
    recommendations: string[];
  }>;
}

/**
 * Expected response format from human
 */
export interface ApprovalResponse {
  decisions: Record<string, "approve" | "reject">;
}

/**
 * Request human approval for medium-score PBIs
 *
 * Reads: scoredCandidates, pbiStatuses, pendingInterrupt
 * Writes: pbiStatuses (via Command to route-by-score)
 *
 * Uses interrupt() to pause and wait for human decision.
 * Note: This is a sync function - interrupt() handles the pause/resume.
 */
export function humanApprovalNode(state: PipelineStateType): Command {
  // Only process if we have approval-type interrupt
  if (state.pendingInterrupt?.type !== "approval") {
    console.log("[Graph] humanApproval: No approval interrupt pending, skipping");
    return new Command({ goto: "routeByScore" });
  }

  const pendingIds = state.pendingInterrupt.candidateIds;
  console.log(
    `[Graph] humanApproval: Requesting approval for ${pendingIds.length} PBI(s)`
  );

  // Build interrupt payload with candidate details
  const candidates = pendingIds.map((id) => {
    const scored = state.scoredCandidates.find((c) => c.candidateId === id);
    const pbiStatus = state.pbiStatuses.find((s) => s.candidateId === id);
    return {
      candidateId: id,
      title:
        state.candidates.find((c) => c.id === id)?.title ?? "Unknown",
      score: pbiStatus?.score ?? scored?.overallScore ?? 0,
      strengths: scored?.strengths ?? [],
      concerns: scored?.concerns ?? [],
      recommendations: scored?.recommendations ?? [],
    };
  });

  const payload: ApprovalInterruptPayload = {
    type: "approval",
    message: state.pendingInterrupt.message,
    candidates,
  };

  // INTERRUPT - pauses execution and waits for human decision
  // On first call: pauses the graph
  // On resume: returns the user's response
  console.log("[Graph] humanApproval: Calling interrupt()...");
  const response = interrupt(payload) as ApprovalResponse;
  console.log("[Graph] humanApproval: Received human decisions");

  // Update statuses based on human decisions
  const updatedStatuses: PBIHITLStatus[] = pendingIds.map((id) => {
    const existing = state.pbiStatuses.find((s) => s.candidateId === id);
    const decision = response.decisions?.[id] ?? "reject";

    return {
      candidateId: id,
      score: existing?.score ?? 0,
      status: existing?.status ?? "pending",
      rescoreCount: existing?.rescoreCount ?? 0,
      humanDecision: decision,
    };
  });

  // Route back to routeByScore to process decisions
  return new Command({
    goto: "routeByScore",
    update: {
      pbiStatuses: updatedStatuses,
      pendingInterrupt: null, // Clear the interrupt
    },
  });
}
