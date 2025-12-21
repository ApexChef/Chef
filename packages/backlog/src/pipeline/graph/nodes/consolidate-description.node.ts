/**
 * Consolidate Description Node (Step 4.5)
 *
 * Creates consolidated descriptions for PBIs that have human context.
 * The consolidated description combines LLM-extracted text with human input.
 */

import type { StringOutputParser } from "@langchain/core/output_parsers";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { PipelineStateType } from "../../state/index.js";
import type { PBICandidate } from "../../schemas/index.js";
import { consolidatePrompt } from "../../prompts/index.js";
import { LLMRouter } from "../../../llm/index.js";

/**
 * Consolidate descriptions for approved PBIs
 *
 * For each approved PBI with humanContext:
 * - Uses LLM to create a consolidated description
 * - Updates the candidate with consolidatedDescription
 *
 * PBIs without humanContext keep their extractedDescription as-is.
 */
export async function consolidateDescriptionNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running consolidateDescription node...");

  // Get approved PBIs (approved or auto_approved)
  const approvedIds = state.approvedForEnrichment;
  const candidatesNeedingConsolidation = state.candidates.filter(
    (c) => approvedIds.includes(c.id) && c.humanContext && !c.consolidatedDescription
  );

  if (candidatesNeedingConsolidation.length === 0) {
    console.log("[Graph] consolidateDescription: No candidates need consolidation");
    // For PBIs without human context, use extractedDescription as consolidated
    const updatedCandidates = state.candidates.map((c) => {
      if (approvedIds.includes(c.id) && !c.consolidatedDescription) {
        return { ...c, consolidatedDescription: c.extractedDescription };
      }
      return c;
    });

    return {
      candidates: updatedCandidates,
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          consolidateDescription: Date.now() - startTime,
        },
      },
    };
  }

  console.log(
    `[Graph] consolidateDescription: Consolidating ${candidatesNeedingConsolidation.length} PBI(s)`
  );

  const model = router.getModel({ temperature: 0.3 }) as BaseChatModel;
  const chain = consolidatePrompt.pipe(model);

  const updatedCandidates: PBICandidate[] = [];

  for (const candidate of candidatesNeedingConsolidation) {
    console.log(`[Step 4.5] Consolidating ${candidate.id}...`);

    try {
      const result = await chain.invoke({
        title: candidate.title,
        type: candidate.type,
        extractedDescription: candidate.extractedDescription,
        humanContext: candidate.humanContext || "",
      });

      // Extract text from result (may be AIMessage or string)
      const consolidatedText =
        typeof result === "string"
          ? result
          : (result as { content: string }).content || String(result);

      updatedCandidates.push({
        ...candidate,
        consolidatedDescription: consolidatedText.trim(),
      });

      console.log(`[Step 4.5]   ${candidate.id}: Consolidated (${consolidatedText.length} chars)`);
    } catch (error) {
      console.error(`[Step 4.5]   ${candidate.id}: Failed to consolidate`, error);
      // Fallback: concatenate descriptions
      updatedCandidates.push({
        ...candidate,
        consolidatedDescription: `${candidate.extractedDescription}\n\nAdditional Context:\n${candidate.humanContext}`,
      });
    }
  }

  // Also update candidates without human context (use extracted as consolidated)
  for (const candidate of state.candidates) {
    if (!updatedCandidates.find((c) => c.id === candidate.id)) {
      if (approvedIds.includes(candidate.id) && !candidate.consolidatedDescription) {
        updatedCandidates.push({
          ...candidate,
          consolidatedDescription: candidate.extractedDescription,
        });
      }
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] consolidateDescription complete (${elapsed}ms)`);

  return {
    candidates: updatedCandidates,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        consolidateDescription: elapsed,
      },
    },
  };
}
