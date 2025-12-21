/**
 * RiskAnalysis Node
 *
 * Analyzes risks for approved PBIs using their consolidated descriptions.
 * Considers both LLM-extracted content and human-provided context.
 */

import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { PipelineStateType } from "../../state/index.js";
import { PBIRiskAnalysisSchema, type PBIRiskAnalysis } from "../../../schemas/index.js";
import { riskAnalysisPrompt } from "../../../prompts/index.js";
import { LLMRouter } from "@chef/core";

/**
 * Analyze risks for approved PBIs
 *
 * For each approved PBI:
 * - Uses consolidated description (includes human context)
 * - Identifies technical, dependency, scope risks
 * - Provides mitigation recommendations
 */
export async function riskAnalysisNode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();
  const router = new LLMRouter();

  console.log("[Graph] Running riskAnalysis node...");

  // Get approved PBIs that haven't been analyzed yet
  const approvedIds = state.approvedForEnrichment;
  const analyzedIds = state.riskAnalyses.map((r) => r.candidateId);
  const toAnalyze = approvedIds.filter((id) => !analyzedIds.includes(id));

  if (toAnalyze.length === 0) {
    console.log("[Graph] riskAnalysis: No new PBIs to analyze");
    return {
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          riskAnalysis: Date.now() - startTime,
        },
      },
    };
  }

  console.log(`[Graph] riskAnalysis: Analyzing ${toAnalyze.length} PBI(s)`);

  const model = router.getModel({ temperature: 0.2 }) as BaseChatModel;
  const structuredModel = model.withStructuredOutput(PBIRiskAnalysisSchema);
  const chain = riskAnalysisPrompt.pipe(structuredModel);

  const newAnalyses: PBIRiskAnalysis[] = [];

  for (const candidateId of toAnalyze) {
    const candidate = state.candidates.find((c) => c.id === candidateId);
    const scored = state.scoredCandidates.find((s) => s.candidateId === candidateId);

    if (!candidate) {
      console.warn(`[RiskAnalysis] Candidate ${candidateId} not found, skipping`);
      continue;
    }

    console.log(`[RiskAnalysis] Analyzing risks for ${candidateId}...`);

    try {
      const result = await chain.invoke({
        candidateId,
        title: candidate.title,
        type: candidate.type,
        consolidatedDescription:
          candidate.consolidatedDescription || candidate.extractedDescription,
        rawContext: candidate.rawContext,
        concerns: scored?.concerns?.join("\n- ") || "None identified",
        recommendations: scored?.recommendations?.join("\n- ") || "None",
      });

      newAnalyses.push(result as PBIRiskAnalysis);

      console.log(
        `[RiskAnalysis]   ${candidateId}: ${result.overallRiskLevel} risk, ${result.risks.length} risk(s) identified`
      );
    } catch (error) {
      console.error(`[RiskAnalysis]   ${candidateId}: Risk analysis failed`, error);
      // Create a minimal fallback analysis
      newAnalyses.push({
        candidateId,
        overallRiskLevel: "medium",
        risks: [
          {
            category: "unknown",
            description: "Risk analysis could not be completed automatically",
            level: "medium",
            mitigation: "Manual risk review recommended",
          },
        ],
        dependencies: [],
        unknowns: ["Automated risk analysis failed - manual review needed"],
        assumptions: [],
        recommendedActions: ["Conduct manual risk assessment before starting"],
      });
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] riskAnalysis complete: ${newAnalyses.length} analyzed (${elapsed}ms)`);

  return {
    riskAnalyses: newAnalyses,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        riskAnalysis: elapsed,
      },
    },
  };
}
