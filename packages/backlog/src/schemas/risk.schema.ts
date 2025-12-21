/**
 * Schema for Step 5: Risk Analysis
 */

import { z } from "zod";

/**
 * Risk level enumeration
 */
export const RiskLevelEnum = z.enum(["low", "medium", "high", "critical"]);

export type RiskLevel = z.infer<typeof RiskLevelEnum>;

/**
 * Individual risk item
 */
export const RiskItemSchema = z.object({
  category: z
    .string()
    .describe("Risk category (technical, dependency, scope, resource, etc.)"),
  description: z.string().describe("Description of the risk"),
  level: RiskLevelEnum.describe("Severity level of the risk"),
  mitigation: z
    .string()
    .optional()
    .describe("Suggested mitigation strategy"),
});

export type RiskItem = z.infer<typeof RiskItemSchema>;

/**
 * Risk analysis result for a single PBI
 */
export const PBIRiskAnalysisSchema = z.object({
  candidateId: z.string().describe("ID of the PBI being analyzed"),
  overallRiskLevel: RiskLevelEnum.describe("Overall risk assessment"),
  risks: z.array(RiskItemSchema).describe("List of identified risks"),
  dependencies: z
    .array(z.string())
    .describe("External dependencies identified"),
  unknowns: z
    .array(z.string())
    .describe("Unknown factors that could affect delivery"),
  assumptions: z
    .array(z.string())
    .describe("Assumptions made in the analysis"),
  recommendedActions: z
    .array(z.string())
    .describe("Recommended actions before starting work"),
});

export type PBIRiskAnalysis = z.infer<typeof PBIRiskAnalysisSchema>;

/**
 * Complete risk analysis output for all approved PBIs
 */
export const RiskAnalysisResultSchema = z.object({
  analyzedPBIs: z.array(PBIRiskAnalysisSchema),
  highRiskCount: z.number().describe("Number of high/critical risk PBIs"),
  totalAnalyzed: z.number().describe("Total PBIs analyzed"),
});

export type RiskAnalysisResult = z.infer<typeof RiskAnalysisResultSchema>;
