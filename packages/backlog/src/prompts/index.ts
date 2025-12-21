/**
 * Pipeline prompt templates
 *
 * Phase-based naming convention for all prompts.
 */

// EventDetection phase
export {
  EVENT_DETECTION_SYSTEM_PROMPT,
  eventDetectionPrompt,
} from "./event-detection.prompt.js";

// CandidateExtraction phase
export {
  CANDIDATE_EXTRACTION_SYSTEM_PROMPT,
  candidateExtractionPrompt,
} from "./candidate-extraction.prompt.js";

// ConfidenceScoring phase
export {
  CONFIDENCE_SCORING_SYSTEM_PROMPT,
  confidenceScoringPrompt,
} from "./confidence-scoring.prompt.js";

// ConsolidateDescription phase
export {
  CONSOLIDATE_DESCRIPTION_SYSTEM_PROMPT,
  consolidateDescriptionPrompt,
} from "./consolidate-description.prompt.js";

// ContextEnrichment phase
export {
  CONTEXT_ENRICHMENT_SYSTEM_PROMPT,
  contextEnrichmentPrompt,
  formatRAGResults,
} from "./context-enrichment.prompt.js";

// DependencyMapping phase
export {
  DEPENDENCY_MAPPING_SYSTEM_PROMPT,
  dependencyMappingPrompt,
  formatCandidatesForDependencyAnalysis,
} from "./dependency-mapping.prompt.js";

// RiskAnalysis phase
export {
  RISK_ANALYSIS_SYSTEM_PROMPT,
  riskAnalysisPrompt,
} from "./risk-analysis.prompt.js";
