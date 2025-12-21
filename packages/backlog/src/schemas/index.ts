/**
 * Pipeline schemas
 */

// Event Detection (Step 1)
export {
  EventTypeEnum,
  EventDetectionSchema,
  type EventType,
  type EventDetectionResult,
} from "./event.schema.js";

// Candidate Extraction (Step 2)
export {
  PBITypeEnum,
  PBICandidateSchema,
  CandidateExtractionSchema,
  type PBIType,
  type PBICandidate,
  type CandidateExtractionResult,
} from "./candidate.schema.js";

// Confidence Scoring (Step 3)
export {
  ScoreBreakdownSchema,
  ScoredCandidateSchema,
  ScoreDistributionSchema,
  ScoringSummarySchema,
  ConfidenceScoringResultSchema,
  type ScoreBreakdown,
  type ScoredCandidate,
  type ScoreDistribution,
  type ScoringSummary,
  type ConfidenceScoringResult,
  type ScoreLabel,
} from "./scoring.schema.js";

// Risk Analysis (Step 5)
export {
  RiskLevelEnum,
  RiskItemSchema,
  PBIRiskAnalysisSchema,
  RiskAnalysisResultSchema,
  type RiskLevel,
  type RiskItem,
  type PBIRiskAnalysis,
  type RiskAnalysisResult,
} from "./risk.schema.js";

// RAG Enrichment (Step 4)
export {
  SimilarWorkSchema,
  RelevantADRSchema,
  TechnicalDocSchema,
  LessonLearnedSchema,
  PBIEnrichmentSchema,
  RAGResultSchema,
  type SimilarWork,
  type RelevantADR,
  type TechnicalDoc,
  type LessonLearned,
  type PBIEnrichment,
  type RAGResult,
} from "./enrichment.schema.js";
