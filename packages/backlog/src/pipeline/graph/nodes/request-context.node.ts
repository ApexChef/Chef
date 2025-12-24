/**
 * Request Context Node
 *
 * Interrupts execution to get additional context for PBIs
 * with low confidence scores (<50) or rejected by human.
 */

import { interrupt, Command } from "@langchain/langgraph";
import type { PipelineStateType, PBIHITLStatus } from "../../state/index.js";
import type {
  PBICandidate,
  ContextQuestion,
  PBIContextResponse,
  PBIContextHistory,
  ContextIteration,
} from "../../../schemas/index.js";
import { formatAnswersAsContext, formatContextHistoryForLLM } from "../../../schemas/index.js";

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
    /** @deprecated Use structuredQuestions instead */
    specificQuestions: string[];
    /** Structured questions with options for interactive prompts */
    structuredQuestions: ContextQuestion[];
  }>;
}

/**
 * Expected response format from human (legacy string format)
 */
export interface ContextResponseLegacy {
  contexts: Record<string, string>; // candidateId -> additional context
}

/**
 * Expected response format from human (structured format)
 */
export interface ContextResponseStructured {
  responses: PBIContextResponse[];
}

/**
 * Union type for backward compatibility
 */
export type ContextResponse = ContextResponseLegacy | ContextResponseStructured;

/**
 * Type guard for structured response
 */
function isStructuredResponse(
  response: ContextResponse
): response is ContextResponseStructured {
  return "responses" in response && Array.isArray(response.responses);
}

/**
 * Generate structured questions with options based on missing elements
 */
export function generateContextQuestions(
  candidateId: string,
  missingElements: string[],
  recommendations: string[]
): ContextQuestion[] {
  const questions: ContextQuestion[] = [];
  let questionIndex = 0;

  // Process missing elements and generate appropriate questions
  for (const missing of missingElements.slice(0, 3)) {
    const lowerMissing = missing.toLowerCase();
    questionIndex++;

    if (lowerMissing.includes("acceptance criteria")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: "What specific conditions should be met for this to be considered done?",
        type: "select",
        category: "acceptance_criteria",
        required: true,
        options: [
          {
            label: "Functional requirements met",
            value: "All functional requirements implemented and verified",
            description: "Core functionality works as specified",
          },
          {
            label: "Tests passing",
            value: "Unit tests and integration tests pass with >80% coverage",
            description: "Automated test coverage requirement",
          },
          {
            label: "Code reviewed",
            value: "Code reviewed and approved by at least one team member",
            description: "Peer review requirement",
          },
          {
            label: "Documentation updated",
            value: "Technical documentation and API docs updated",
            description: "Documentation is current",
          },
        ],
      });
    } else if (lowerMissing.includes("description") || lowerMissing.includes("details")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: "Can you provide more details about what this PBI should accomplish?",
        type: "input",
        category: "description",
        required: true,
        placeholder: "Describe the expected behavior, user flow, or technical implementation...",
      });
    } else if (lowerMissing.includes("scope")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: "What is in scope and out of scope for this PBI?",
        type: "select",
        category: "scope",
        required: true,
        options: [
          {
            label: "Single component only",
            value: "Scope limited to a single component or module",
            description: "Changes isolated to one area",
          },
          {
            label: "Multiple components",
            value: "Changes span multiple components but within one package",
            description: "Cross-component but contained",
          },
          {
            label: "Cross-package changes",
            value: "Changes required across multiple packages",
            description: "Broader architectural impact",
          },
        ],
      });
    } else if (lowerMissing.includes("example") || lowerMissing.includes("type definition")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: `Please provide: ${missing}`,
        type: "input",
        category: "examples",
        required: true,
        placeholder: "Provide code examples, type definitions, or specifications...",
      });
    } else if (lowerMissing.includes("dependencies") || lowerMissing.includes("relationship")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: "What are the dependencies or relationships to other components?",
        type: "select",
        category: "dependencies",
        required: true,
        options: [
          {
            label: "No dependencies",
            value: "Standalone implementation with no external dependencies",
            description: "Can be implemented independently",
          },
          {
            label: "Depends on existing code",
            value: "Depends on existing components that are already implemented",
            description: "Uses existing infrastructure",
          },
          {
            label: "Blocked by other PBIs",
            value: "Blocked by other PBIs that must be completed first",
            description: "Has prerequisite work items",
          },
          {
            label: "Enables other work",
            value: "This PBI enables other work items and should be prioritized",
            description: "Foundation for future work",
          },
        ],
      });
    } else if (lowerMissing.includes("success") || lowerMissing.includes("metric") || lowerMissing.includes("validation")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: "How will success be measured for this PBI?",
        type: "select",
        category: "success_metrics",
        required: true,
        options: [
          {
            label: "Automated tests",
            value: "Success measured by passing automated tests",
            description: "Test-driven validation",
          },
          {
            label: "Manual verification",
            value: "Success verified through manual testing and review",
            description: "Human verification required",
          },
          {
            label: "Performance metrics",
            value: "Success measured by specific performance benchmarks",
            description: "Quantitative performance goals",
          },
          {
            label: "User acceptance",
            value: "Success validated through user acceptance testing",
            description: "End-user validation",
          },
        ],
      });
    } else {
      // Generic fallback for unrecognized missing elements
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: `Please provide: ${missing}`,
        type: "input",
        category: "general",
        required: true,
        placeholder: `Enter details for: ${missing}`,
      });
    }
  }

  // Add questions from recommendations (max 2 more)
  for (const rec of recommendations.slice(0, 2)) {
    const recLower = rec.toLowerCase();
    // Skip if we already have a similar question
    if (questions.some((q) => q.question.toLowerCase().includes(recLower.slice(0, 30)))) {
      continue;
    }

    questionIndex++;
    const questionText = rec.endsWith("?") ? rec : `${rec}?`;

    // Try to infer the best question type from the recommendation
    if (recLower.includes("add") || recLower.includes("include") || recLower.includes("specify")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: questionText,
        type: "input",
        category: "recommendation",
        required: false,
        placeholder: "Provide the requested information...",
      });
    } else if (recLower.includes("consider") || recLower.includes("define") || recLower.includes("choose")) {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: questionText,
        type: "confirm",
        category: "recommendation",
        required: false,
      });
    } else {
      questions.push({
        id: `${candidateId}-q${questionIndex}`,
        question: questionText,
        type: "input",
        category: "recommendation",
        required: false,
        placeholder: "Your response...",
      });
    }
  }

  return questions.slice(0, 5); // Max 5 questions
}

/**
 * Generate legacy string questions for backward compatibility
 */
function generateLegacyQuestions(questions: ContextQuestion[]): string[] {
  return questions.map((q) => q.question);
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
    const structuredQuestions = generateContextQuestions(id, missingElements, recommendations);

    return {
      candidateId: id,
      title: candidate?.title ?? "Unknown",
      currentDescription: candidate?.extractedDescription ?? "",
      score: pbiStatus?.score ?? scored?.overallScore ?? 0,
      missingElements,
      recommendations,
      specificQuestions: generateLegacyQuestions(structuredQuestions),
      structuredQuestions,
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

  // Handle both legacy and structured response formats
  let contextMap: Record<string, string>;
  let structuredResponses: Map<string, PBIContextResponse> = new Map();

  if (isStructuredResponse(response)) {
    // Convert structured responses to context strings
    contextMap = {};
    for (const pbiResponse of response.responses) {
      contextMap[pbiResponse.candidateId] = formatAnswersAsContext(pbiResponse);
      structuredResponses.set(pbiResponse.candidateId, pbiResponse);
    }
  } else {
    // Legacy format - use directly
    contextMap = response.contexts;
  }

  // Build context history updates
  const contextHistoryUpdates: PBIContextHistory[] = pendingIds.map((id) => {
    const existingHistory = state.contextHistory?.find((h) => h.candidateId === id);
    const pbiStatus = state.pbiStatuses.find((s) => s.candidateId === id);
    const scored = state.scoredCandidates.find((c) => c.candidateId === id);
    const requestInfo = requests.find((r) => r.candidateId === id);
    const structuredResponse = structuredResponses.get(id);

    const currentIteration = (existingHistory?.totalIterations ?? 0) + 1;

    // Build the iteration record
    const iteration: ContextIteration = {
      iteration: currentIteration,
      timestamp: new Date().toISOString(),
      scoreBefore: pbiStatus?.score ?? scored?.overallScore ?? 0,
      questions: requestInfo?.structuredQuestions ?? [],
      response: structuredResponse ?? {
        candidateId: id,
        answers: [],
        additionalContext: contextMap[id] ?? "",
        status: "completed",
        lastQuestionIndex: 0,
      },
      missingElements: requestInfo?.missingElements ?? [],
      recommendations: requestInfo?.recommendations ?? [],
    };

    return {
      candidateId: id,
      iterations: [iteration],
      totalIterations: currentIteration,
      status: "in_progress" as const,
    };
  });

  // Update statuses with human-provided context
  const updatedStatuses: PBIHITLStatus[] = pendingIds.map((id) => {
    const existing = state.pbiStatuses.find((s) => s.candidateId === id);
    const humanContext = contextMap[id] ?? "";

    return {
      candidateId: id,
      score: existing?.score ?? 0,
      status: "pending" as const, // Ready to rescore
      rescoreCount: (existing?.rescoreCount ?? 0) + 1,
      humanContext,
      humanDecision: undefined, // Clear previous decision
    };
  });

  // Also update candidates with human context
  // Now use contextHistory to generate the full context string
  const updatedCandidates: PBICandidate[] = pendingIds.map((id) => {
    const candidate = state.candidates.find((c) => c.id === id);
    const existingHistory = state.contextHistory?.find((h) => h.candidateId === id);
    const newHistory = contextHistoryUpdates.find((h) => h.candidateId === id);

    // Merge histories for generating full context
    const mergedHistory: PBIContextHistory = {
      candidateId: id,
      iterations: [
        ...(existingHistory?.iterations ?? []),
        ...(newHistory?.iterations ?? []),
      ],
      totalIterations: newHistory?.totalIterations ?? 1,
      status: "in_progress",
    };

    // Generate full context from history
    const fullContext = formatContextHistoryForLLM(mergedHistory);

    return {
      ...candidate!,
      humanContext: fullContext,
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
      contextHistory: contextHistoryUpdates,
      pendingInterrupt: null, // Clear the interrupt
    },
  });
}
