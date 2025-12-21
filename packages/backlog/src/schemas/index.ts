/**
 * Pipeline schemas
 */

// EventDetection phase
export {
  EventTypeEnum,
  EventDetectionSchema,
  type EventType,
  type EventDetectionResult,
} from "./event.schema.js";

// CandidateExtraction phase
export {
  PBITypeEnum,
  PBICandidateSchema,
  CandidateExtractionSchema,
  type PBIType,
  type PBICandidate,
  type CandidateExtractionResult,
} from "./candidate.schema.js";

// DependencyMapping phase
export {
  DependencyTypeEnum,
  DependencyStrengthEnum,
  DependencySchema,
  SequenceAssignmentSchema,
  DependencyMappingResultSchema,
  type DependencyType,
  type DependencyStrength,
  type Dependency,
  type SequenceAssignment,
  type DependencyMappingResult,
  type CycleDetectionResult,
} from "./dependency.schema.js";

// ConfidenceScoring phase
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

// RiskAnalysis phase
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

// ContextEnrichment phase
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
