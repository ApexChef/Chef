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
import { LLMRouter, getContextLogger, runStep } from "@chef/core";

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
  return runStep('riskAnalysis', async () => {
    const logger = getContextLogger();
    const startTime = Date.now();
    const router = new LLMRouter();

    // Get approved PBIs that haven't been analyzed yet
    const approvedIds = state.approvedForEnrichment;
    const analyzedIds = state.riskAnalyses.map((r) => r.candidateId);
    const toAnalyze = approvedIds.filter((id) => !analyzedIds.includes(id));

    if (toAnalyze.length === 0) {
      logger.info('No new PBIs to analyze');
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

    logger.info({
      pbiCount: toAnalyze.length,
      pbiIds: toAnalyze
    }, 'Starting risk analysis for approved PBIs');

  const model = router.getModel({ temperature: 0.2 }) as BaseChatModel;
  const structuredModel = model.withStructuredOutput(PBIRiskAnalysisSchema);
  const chain = riskAnalysisPrompt.pipe(structuredModel);

  const newAnalyses: PBIRiskAnalysis[] = [];

  for (const candidateId of toAnalyze) {
    const candidate = state.candidates.find((c) => c.id === candidateId);
    const scored = state.scoredCandidates.find((s) => s.candidateId === candidateId);

    if (!candidate) {
      logger.warn({ candidateId }, 'Candidate not found, skipping risk analysis');
      continue;
    }

    logger.debug({ candidateId, title: candidate.title }, 'Analyzing risks for candidate');

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

      // Ensure candidateId is always set correctly (don't rely on LLM echo)
      newAnalyses.push({
        ...result,
        candidateId,
      } as PBIRiskAnalysis);

      logger.info({
        candidateId,
        riskLevel: result.overallRiskLevel,
        risksCount: result.risks.length
      }, 'Risk analysis completed for candidate');
    } catch (error) {
      logger.error({
        candidateId,
        err: error
      }, 'Risk analysis failed for candidate');
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

    logger.info({
      analyzedCount: newAnalyses.length,
      duration: elapsed
    }, 'Risk analysis completed');

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
  });
}
