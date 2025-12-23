/**
 * Schema for Dynamic Context Questions
 *
 * Defines structured questions that can be rendered as interactive prompts
 * (e.g., with @inquirer/prompts) to gather additional context from users.
 */

import { z } from "zod";

/**
 * Question types that map to inquirer prompt types
 */
export const QuestionTypeEnum = z.enum([
  "select", // Single selection from options
  "input", // Free-text input
  "confirm", // Yes/No question
]);

export type QuestionType = z.infer<typeof QuestionTypeEnum>;

/**
 * A selectable option for select/checkbox questions
 */
export const QuestionOptionSchema = z.object({
  label: z.string().describe("Display text shown to the user"),
  value: z.string().describe("Value stored when this option is selected"),
  description: z
    .string()
    .optional()
    .describe("Additional context shown below the label"),
});

export type QuestionOption = z.infer<typeof QuestionOptionSchema>;

/**
 * A single context question with metadata for rendering
 */
export const ContextQuestionSchema = z.object({
  id: z.string().describe("Unique identifier for this question"),
  question: z.string().describe("The question text to display"),
  type: QuestionTypeEnum.describe("Type of input expected"),
  options: z
    .array(QuestionOptionSchema)
    .optional()
    .describe("Predefined options for select types (Other is added automatically)"),
  required: z
    .boolean()
    .default(true)
    .describe("Whether an answer is required"),
  placeholder: z
    .string()
    .optional()
    .describe("Placeholder text for input types"),
  category: z
    .string()
    .optional()
    .describe("Category grouping (e.g., 'acceptance_criteria', 'scope')"),
});

export type ContextQuestion = z.infer<typeof ContextQuestionSchema>;

/**
 * Generated questions for a single PBI
 */
export const PBIContextQuestionsSchema = z.object({
  candidateId: z.string().describe("ID of the PBI these questions relate to"),
  title: z.string().describe("PBI title for context"),
  questions: z.array(ContextQuestionSchema).describe("List of questions to ask"),
});

export type PBIContextQuestions = z.infer<typeof PBIContextQuestionsSchema>;

/**
 * Answer status for tracking progress
 */
export const AnswerStatusEnum = z.enum([
  "answered",   // Question was answered
  "skipped",    // Question was explicitly skipped
  "pending",    // Question not yet addressed
]);

export type AnswerStatus = z.infer<typeof AnswerStatusEnum>;

/**
 * A single answer to a context question
 */
export const ContextAnswerSchema = z.object({
  questionId: z.string().describe("ID of the question being answered"),
  questionText: z.string().describe("The original question text (for context in output)"),
  value: z.string().describe("The answer value"),
  isCustom: z
    .boolean()
    .default(false)
    .describe("Whether this was a custom 'Other' response"),
  isFileReference: z
    .boolean()
    .default(false)
    .describe("Whether value is a file reference (@file:path)"),
  resolvedValue: z
    .string()
    .optional()
    .describe("Resolved file content if isFileReference is true"),
  status: AnswerStatusEnum.default("answered").describe("Answer status"),
});

export type ContextAnswer = z.infer<typeof ContextAnswerSchema>;

/**
 * Session status for partial context gathering
 */
export const ContextSessionStatusEnum = z.enum([
  "in_progress",  // User is actively answering questions
  "paused",       // User paused to come back later
  "completed",    // All questions addressed (answered or skipped)
  "submitted",    // Context has been submitted to pipeline
]);

export type ContextSessionStatus = z.infer<typeof ContextSessionStatusEnum>;

/**
 * All answers for a single PBI
 */
export const PBIContextResponseSchema = z.object({
  candidateId: z.string().describe("ID of the PBI"),
  answers: z.array(ContextAnswerSchema).describe("Answers to all questions"),
  additionalContext: z
    .string()
    .optional()
    .describe("Any additional free-form context provided"),
  status: ContextSessionStatusEnum.default("in_progress").describe("Session status"),
  lastQuestionIndex: z
    .number()
    .default(0)
    .describe("Index of last question addressed (for resume)"),
  updatedAt: z
    .string()
    .datetime()
    .optional()
    .describe("Last update timestamp"),
});

export type PBIContextResponse = z.infer<typeof PBIContextResponseSchema>;

/**
 * Complete structured context response for all PBIs
 * (Named differently to avoid conflict with legacy ContextResponse)
 */
export const StructuredContextResponseSchema = z.object({
  responses: z.array(PBIContextResponseSchema),
  timestamp: z.string().datetime().optional(),
});

export type StructuredContextResponse = z.infer<typeof StructuredContextResponseSchema>;

/**
 * Helper to format answers into a consolidated context string
 * Includes question text with each answer for proper context
 */
export function formatAnswersAsContext(response: PBIContextResponse): string {
  const parts: string[] = [];

  for (const answer of response.answers) {
    // Skip answers that are empty or skipped
    if (!answer.value?.trim() || answer.status === "skipped") {
      continue;
    }

    // Use resolved file content if available, otherwise use the value
    const answerValue = answer.resolvedValue?.trim() || answer.value.trim();

    // Format as Q&A pair for clear context
    const qaPair = `Q: ${answer.questionText}\nA: ${answerValue}`;
    parts.push(qaPair);
  }

  if (response.additionalContext?.trim()) {
    parts.push(`Additional Context:\n${response.additionalContext.trim()}`);
  }

  return parts.join("\n\n");
}
