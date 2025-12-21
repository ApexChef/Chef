/**
 * Score Thresholds for HITL Routing
 *
 * Defines the boundaries for automatic approval vs human intervention.
 */

export const SCORE_THRESHOLDS = {
  /**
   * Score >= AUTO_APPROVE: PBI auto-continues to enrichment
   * Based on sample data averaging ~68, set to 75 for "excellent" PBIs
   */
  AUTO_APPROVE: 75,

  /**
   * Score >= HUMAN_APPROVAL but < AUTO_APPROVE: Needs human yes/no
   * Range 50-74 covers "fair" to "good" PBIs
   */
  HUMAN_APPROVAL: 50,

  /**
   * Score < HUMAN_APPROVAL: Needs additional context before re-scoring
   * Below 50 means too incomplete to even ask for approval
   */
  // Implicit: anything below HUMAN_APPROVAL

  /**
   * Maximum re-scoring attempts before final rejection
   * Prevents infinite loops
   */
  MAX_RESCORE_ATTEMPTS: 3,
} as const;

/**
 * HITL status values for PBIs
 */
export type HITLStatus =
  | "pending" // Not yet routed
  | "auto_approved" // Score >= 75, auto-continue
  | "awaiting_approval" // Score 50-74, waiting for human
  | "awaiting_context" // Score <50 or rejected, needs human input
  | "approved" // Human approved
  | "rejected_final"; // Human rejected after max attempts

/**
 * Human decision options for approval interrupt
 */
export type ApprovalDecision = "approve" | "reject";

/**
 * Determine routing category based on score
 */
export function getScoreCategory(
  score: number
): "high" | "medium" | "low" {
  if (score >= SCORE_THRESHOLDS.AUTO_APPROVE) return "high";
  if (score >= SCORE_THRESHOLDS.HUMAN_APPROVAL) return "medium";
  return "low";
}

/**
 * Get human-readable label for a score
 */
export function getScoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 25) return "Poor";
  return "Very Poor";
}

/**
 * Expected response format from human approval interrupt
 */
export interface ApprovalResponse {
  decisions: Record<string, ApprovalDecision>;
}

/**
 * Expected response format from context request interrupt
 */
export interface ContextResponse {
  contexts: Record<string, string>;
}
