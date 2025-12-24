/**
 * DependencyMapping Node
 *
 * Analyzes sibling PBI candidates to identify dependencies between them.
 * Runs after CandidateExtraction and before ConfidenceScoring.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { LLMRouter } from "@chef/core";
import type { PipelineStateType } from "../../state/index.js";
import type { PBICandidate, Dependency, DependencyMappingResult } from "../../../schemas/index.js";
import { DependencyMappingResultSchema } from "../../../schemas/index.js";
import {
  dependencyMappingPrompt,
  formatCandidatesForDependencyAnalysis,
} from "../../../prompts/index.js";
import { detectCycles, canParallelize } from "../../utils/index.js";

/**
 * Analyze dependencies between sibling PBI candidates
 *
 * Reads: candidates, eventType
 * Writes: dependencies, candidates (with sequence and canParallelize), metadata.stepTimings
 */
export async function dependencyMappingNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running dependencyMapping node...");

  // Handle edge cases
  if (state.candidates.length === 0) {
    console.log("[DependencyMapping] No candidates to analyze");
    return {
      dependencies: [],
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          dependencyMapping: Date.now() - startTime,
        },
      },
    };
  }

  if (state.candidates.length === 1) {
    console.log("[DependencyMapping] Single candidate - no dependencies possible");
    // Mark single candidate as parallelizable with sequence 1
    const updatedCandidates = state.candidates.map((c) => ({
      ...c,
      sequence: 1,
      canParallelize: true,
    }));

    return {
      dependencies: [],
      candidates: updatedCandidates,
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          dependencyMapping: Date.now() - startTime,
        },
      },
    };
  }

  console.log(`[DependencyMapping] Analyzing ${state.candidates.length} candidates...`);

  // Format candidates for the prompt (using only summary/description)
  const candidatesList = formatCandidatesForDependencyAnalysis(
    state.candidates.map((c) => ({
      id: c.id,
      title: c.title,
      extractedDescription: c.extractedDescription,
    }))
  );

  // Call LLM to analyze dependencies
  const model = router.getModel({ temperature: 0 }) as BaseChatModel;
  const structuredModel = model.withStructuredOutput(DependencyMappingResultSchema);
  const chain = dependencyMappingPrompt.pipe(structuredModel);

  let result: DependencyMappingResult;

  try {
    result = (await chain.invoke({
      eventType: state.eventType,
      candidatesList,
    })) as DependencyMappingResult;

    console.log(
      `[DependencyMapping] LLM identified ${result.dependencies.length} dependencies`
    );

    if (result.analysisNotes) {
      console.log(`[DependencyMapping] Notes: ${result.analysisNotes}`);
    }
  } catch (error) {
    console.error("[DependencyMapping] LLM analysis failed:", error);
    // Return empty dependencies on failure
    return {
      dependencies: [],
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          dependencyMapping: Date.now() - startTime,
        },
      },
    };
  }

  // Detect and clean cycles
  const cycleResult = detectCycles(result.dependencies);

  if (cycleResult.hasCycles) {
    console.warn(
      `[DependencyMapping] WARNING: ${cycleResult.cycles.length} cycle(s) detected and cleaned`
    );
    for (const cycle of cycleResult.cycles) {
      console.warn(`[DependencyMapping]   Cycle: ${cycle.join(" -> ")}`);
    }
  }

  // Use cleaned dependencies
  const cleanedDependencies = cycleResult.cleanedDependencies;

  // Build sequence map from LLM result
  const sequenceMap = new Map<string, { sequence: number; canParallelize: boolean }>();
  for (const assignment of result.sequenceAssignments) {
    sequenceMap.set(assignment.candidateId, {
      sequence: assignment.sequence,
      canParallelize: assignment.canParallelize,
    });
  }

  // Update candidates with sequence and parallelization info
  // Also recompute canParallelize based on cleaned dependencies
  const updatedCandidates = state.candidates.map((c) => {
    const assignment = sequenceMap.get(c.id);
    const actualCanParallelize = canParallelize(c.id, cleanedDependencies);

    return {
      ...c,
      sequence: assignment?.sequence ?? 999, // Default to end if not assigned
      canParallelize: actualCanParallelize,
    };
  });

  // Sort by sequence for logging
  const sortedCandidates = [...updatedCandidates].sort(
    (a, b) => (a.sequence ?? 999) - (b.sequence ?? 999)
  );

  console.log("[DependencyMapping] Sequence order:");
  for (const c of sortedCandidates) {
    const parallel = c.canParallelize ? " (parallel)" : "";
    console.log(`[DependencyMapping]   ${c.sequence}. ${c.id}: ${c.title}${parallel}`);
  }

  const elapsed = Date.now() - startTime;
  console.log(
    `[Graph] dependencyMapping complete: ${cleanedDependencies.length} deps (${elapsed}ms)`
  );

  return {
    dependencies: cleanedDependencies,
    candidates: updatedCandidates,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        dependencyMapping: elapsed,
      },
    },
  };
}

/**
 * Get sibling context for a candidate based on dependencies
 *
 * Returns a formatted string describing what sibling PBIs handle
 * that are relevant to this candidate's scoring.
 *
 * @param candidateId - The candidate to get context for
 * @param allCandidates - All candidates in the pipeline
 * @param dependencies - All dependencies
 * @returns Formatted sibling context string
 */
export function getSiblingContext(
  candidateId: string,
  allCandidates: PBICandidate[],
  dependencies: Dependency[]
): string {
  // Find dependencies where this candidate is the source (depends on others)
  const deps = dependencies.filter((d) => d.source === candidateId);

  if (deps.length === 0) {
    return "";
  }

  const siblingLines = deps.map((dep) => {
    const sibling = allCandidates.find((c) => c.id === dep.target);
    if (!sibling) return null;

    return `**${dep.target}: ${sibling.title}**
   Relationship: ${dep.type} (${dep.strength})
   Reason: ${dep.reason}
   Summary: ${sibling.extractedDescription}`;
  });

  const validLines = siblingLines.filter(Boolean);

  if (validLines.length === 0) {
    return "";
  }

  return `
**SIBLING CONTEXT (from same source):**
The following related PBIs will handle certain aspects. Do NOT penalize this PBI for missing information that is covered by its dependencies:

${validLines.join("\n\n")}
`;
}
