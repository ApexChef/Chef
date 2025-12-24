/**
 * Route By Score Node
 *
 * Routes PBIs based on their confidence scores:
 * - High (>=75): Auto-approve for enrichment
 * - Medium (50-74): Requires human approval
 * - Low (<50): Requires additional context
 */

import type { PipelineStateType, PBIHITLStatus } from "../../state/index.js";
import {
  SCORE_THRESHOLDS,
  getScoreCategory,
  type HITLStatus,
} from "../../../constants/index.js";

/**
 * Route PBIs by their confidence scores
 *
 * Reads: scoredCandidates, pbiStatuses
 * Writes: pbiStatuses, approvedForEnrichment, pendingInterrupt
 */
export async function routeByScoreNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  console.log("[Graph] Running routeByScore node...");

  const updatedStatuses: PBIHITLStatus[] = [];
  const newlyApproved: string[] = [];
  const needsApproval: string[] = [];
  const needsContext: string[] = [];

  for (const candidate of state.scoredCandidates) {
    // Check if already processed in a previous run
    const existing = state.pbiStatuses.find(
      (s) => s.candidateId === candidate.candidateId
    );

    // Skip if already in a terminal state
    if (
      existing?.status === "approved" ||
      existing?.status === "auto_approved" ||
      existing?.status === "rejected_final"
    ) {
      continue;
    }

    const score = candidate.overallScore;
    const category = getScoreCategory(score);
    const rescoreCount = existing?.rescoreCount ?? 0;

    let newStatus: HITLStatus;

    if (category === "high") {
      // Auto-approve high scores
      newStatus = "auto_approved";
      newlyApproved.push(candidate.candidateId);
      console.log(
        `  [${candidate.candidateId}] Score ${score} >= ${SCORE_THRESHOLDS.AUTO_APPROVE} → auto_approved`
      );
    } else if (category === "medium") {
      // Check if human already decided
      if (existing?.humanDecision === "approve") {
        newStatus = "approved";
        newlyApproved.push(candidate.candidateId);
        console.log(
          `  [${candidate.candidateId}] Score ${score} + human approved → approved`
        );
      } else if (existing?.humanDecision === "reject") {
        // Rejected, needs context
        newStatus = "awaiting_context";
        needsContext.push(candidate.candidateId);
        console.log(
          `  [${candidate.candidateId}] Score ${score} + human rejected → awaiting_context`
        );
      } else {
        // Needs human approval
        newStatus = "awaiting_approval";
        needsApproval.push(candidate.candidateId);
        console.log(
          `  [${candidate.candidateId}] Score ${score} in [${SCORE_THRESHOLDS.HUMAN_APPROVAL}-${SCORE_THRESHOLDS.AUTO_APPROVE}) → awaiting_approval`
        );
      }
    } else {
      // Low score - check max attempts
      if (rescoreCount >= SCORE_THRESHOLDS.MAX_RESCORE_ATTEMPTS) {
        newStatus = "rejected_final";
        console.log(
          `  [${candidate.candidateId}] Score ${score} + max attempts (${rescoreCount}) → rejected_final`
        );
      } else {
        newStatus = "awaiting_context";
        needsContext.push(candidate.candidateId);
        console.log(
          `  [${candidate.candidateId}] Score ${score} < ${SCORE_THRESHOLDS.HUMAN_APPROVAL} → awaiting_context`
        );
      }
    }

    updatedStatuses.push({
      candidateId: candidate.candidateId,
      score,
      status: newStatus,
      rescoreCount,
      contextRequests: existing?.contextRequests,
      humanContext: existing?.humanContext,
      humanDecision: existing?.humanDecision,
    });
  }

  // Determine if we need to interrupt
  let pendingInterrupt: PipelineStateType["pendingInterrupt"] = null;

  if (needsApproval.length > 0) {
    pendingInterrupt = {
      type: "approval",
      candidateIds: needsApproval,
      message: `${needsApproval.length} PBI(s) need your approval (score 50-74)`,
    };
  } else if (needsContext.length > 0) {
    pendingInterrupt = {
      type: "context",
      candidateIds: needsContext,
      message: `${needsContext.length} PBI(s) need additional context before proceeding`,
    };
  }

  console.log(
    `[Graph] routeByScore: ${newlyApproved.length} approved, ${needsApproval.length} need approval, ${needsContext.length} need context`
  );

  return {
    pbiStatuses: updatedStatuses,
    approvedForEnrichment: newlyApproved,
    pendingInterrupt,
  };
}

/**
 * Routing decision function for conditional edges
 *
 * Returns the next node based on current state:
 * - "enrich": All PBIs approved, proceed to enrichment
 * - "approval": Some PBIs need human approval (medium scores)
 * - "context": Some PBIs need additional context (low scores)
 * - "done": No more PBIs to process (all rejected or terminal)
 */
export function routeDecision(
  state: PipelineStateType
): "enrich" | "approval" | "context" | "done" {
  // If interrupt pending, route based on type
  if (state.pendingInterrupt) {
    if (state.pendingInterrupt.type === "approval") {
      return "approval";
    } else {
      return "context";
    }
  }

  // Check if any PBIs are approved and ready for enrichment
  const hasApproved = state.pbiStatuses.some(
    (s) => s.status === "approved" || s.status === "auto_approved"
  );

  if (hasApproved) {
    return "enrich";
  }

  // All PBIs are either rejected or in terminal state
  return "done";
}
