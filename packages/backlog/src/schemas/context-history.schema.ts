/**
 * Schema for Context History Tracking
 *
 * Tracks iterations of context gathering for each PBI,
 * preserving structured Q&A data across multiple rounds.
 */

import { z } from "zod";
import { ContextQuestionSchema, PBIContextResponseSchema } from "./context-question.schema.js";

/**
 * A single iteration of context gathering for a PBI
 */
export const ContextIterationSchema = z.object({
  /** Iteration number (1-based) */
  iteration: z.number().int().min(1),

  /** When this iteration occurred */
  timestamp: z.string().datetime(),

  /** Score before this context was added */
  scoreBefore: z.number(),

  /** Score after this context was processed (set after rescore) */
  scoreAfter: z.number().optional(),

  /** The questions that were asked in this iteration */
  questions: z.array(ContextQuestionSchema),

  /** The structured response from the user */
  response: PBIContextResponseSchema,

  /** Missing elements identified at this iteration */
  missingElements: z.array(z.string()),

  /** Recommendations from scoring at this iteration */
  recommendations: z.array(z.string()),
});

export type ContextIteration = z.infer<typeof ContextIterationSchema>;

/**
 * Complete context history for a single PBI
 */
export const PBIContextHistorySchema = z.object({
  /** PBI candidate ID */
  candidateId: z.string(),

  /** All iterations of context gathering */
  iterations: z.array(ContextIterationSchema),

  /** Total number of iterations */
  totalIterations: z.number().int().min(0).default(0),

  /** Current status of context gathering */
  status: z.enum(["pending", "in_progress", "completed", "approved", "rejected"]).default("pending"),
});

export type PBIContextHistory = z.infer<typeof PBIContextHistorySchema>;

/**
 * Helper to get the latest iteration for a PBI
 */
export function getLatestIteration(history: PBIContextHistory): ContextIteration | undefined {
  return history.iterations[history.iterations.length - 1];
}

/**
 * Helper to format all iterations as context for LLM consumption
 * Provides full history with clear iteration markers
 */
export function formatContextHistoryForLLM(history: PBIContextHistory): string {
  if (history.iterations.length === 0) {
    return "";
  }

  const parts: string[] = [];

  for (const iteration of history.iterations) {
    parts.push(`=== Context Iteration ${iteration.iteration} ===`);
    parts.push(`Score: ${iteration.scoreBefore}${iteration.scoreAfter ? ` → ${iteration.scoreAfter}` : ""}`);
    parts.push("");

    // Add Q&A pairs from this iteration
    for (const answer of iteration.response.answers) {
      if (!answer.value?.trim() || answer.status === "skipped") {
        continue;
      }

      const answerValue = answer.resolvedValue?.trim() || answer.value.trim();
      parts.push(`Q: ${answer.questionText}`);
      parts.push(`A: ${answerValue}`);
      parts.push("");
    }

    if (iteration.response.additionalContext?.trim()) {
      parts.push(`Additional Context: ${iteration.response.additionalContext.trim()}`);
      parts.push("");
    }
  }

  return parts.join("\n").trim();
}

/**
 * Helper to get a summary of context iterations
 */
export function getContextHistorySummary(history: PBIContextHistory): {
  totalIterations: number;
  totalQuestionsAsked: number;
  totalAnswersProvided: number;
  scoreProgression: number[];
} {
  let totalQuestionsAsked = 0;
  let totalAnswersProvided = 0;
  const scoreProgression: number[] = [];

  for (const iteration of history.iterations) {
    totalQuestionsAsked += iteration.questions.length;
    totalAnswersProvided += iteration.response.answers.filter(
      (a) => a.status === "answered" && a.value?.trim()
    ).length;
    scoreProgression.push(iteration.scoreBefore);
    if (iteration.scoreAfter !== undefined) {
      scoreProgression.push(iteration.scoreAfter);
    }
  }

  return {
    totalIterations: history.iterations.length,
    totalQuestionsAsked,
    totalAnswersProvided,
    scoreProgression: [...new Set(scoreProgression)], // Dedupe consecutive same scores
  };
}
