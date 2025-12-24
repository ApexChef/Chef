/**
 * Pipeline State Definition
 *
 * Shared state flowing through the LangGraph pipeline.
 * Each node reads from and writes to this state.
 */

import { Annotation } from "@langchain/langgraph";
import type { PBICandidate, ScoredCandidate, PBIRiskAnalysis, PBIEnrichment, Dependency, PBIContextHistory } from "../../schemas/index.js";
import type { HITLStatus, ApprovalDecision } from "../../constants/index.js";

/**
 * Metadata for pipeline execution tracking
 */
export interface PipelineMetadata {
  provider: string;
  model: string;
  timestamp: string;
  inputLength: number;
  stepTimings: Record<string, number>;
}

/**
 * HITL status for a single PBI
 */
export interface PBIHITLStatus {
  candidateId: string;
  score: number;
  status: HITLStatus;
  rescoreCount: number;
  contextRequests?: string[]; // What additional info is needed
  humanContext?: string; // Human-provided context
  humanDecision?: ApprovalDecision;
}

/**
 * Pipeline State Annotation
 *
 * Defines all data that flows through the pipeline graph.
 * Nodes read what they need and return partial updates.
 *
 * Note: Fields without reducers are overwritten on update.
 * Fields with reducers merge updates according to the reducer logic.
 */
export const PipelineState = Annotation.Root({
  // === Input (set once at invocation) ===
  meetingNotes: Annotation<string>,

  // === EventDetection phase ===
  eventType: Annotation<string>,
  eventConfidence: Annotation<number>,
  eventIndicators: Annotation<string[]>({
    reducer: (_, newVal) => newVal ?? [],
    default: () => [],
  }),

  // === CandidateExtraction phase ===
  /**
   * PBI candidates - merged by ID to preserve human context additions
   */
  candidates: Annotation<PBICandidate[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      // Merge by ID to preserve human context additions
      const map = new Map((prev ?? []).map((c) => [c.id, c]));
      for (const u of update) {
        const existing = map.get(u.id);
        if (existing) {
          // Merge: keep existing humanContext if not in update
          map.set(u.id, {
            ...existing,
            ...u,
            humanContext: u.humanContext || existing.humanContext,
            consolidatedDescription: u.consolidatedDescription || existing.consolidatedDescription,
          });
        } else {
          map.set(u.id, u);
        }
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),
  extractionNotes: Annotation<string>,

  // === DependencyMapping phase ===
  /**
   * Dependencies between sibling PBIs
   * Set by the DependencyMapping node after candidate extraction
   */
  dependencies: Annotation<Dependency[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      // Replace all dependencies on update
      return update;
    },
    default: () => [],
  }),

  // === ConfidenceScoring phase ===
  scoredCandidates: Annotation<ScoredCandidate[]>({
    reducer: (_, newVal) => newVal ?? [],
    default: () => [],
  }),
  averageScore: Annotation<number>,

  // === Metadata ===
  metadata: Annotation<PipelineMetadata>({
    reducer: (prev, update) => ({
      provider: update.provider || prev?.provider || "",
      model: update.model || prev?.model || "",
      timestamp: update.timestamp || prev?.timestamp || "",
      inputLength: update.inputLength || prev?.inputLength || 0,
      stepTimings: {
        ...(prev?.stepTimings || {}),
        ...(update.stepTimings || {}),
      },
    }),
    default: () => ({
      provider: "",
      model: "",
      timestamp: "",
      inputLength: 0,
      stepTimings: {},
    }),
  }),

  // === HITL State ===
  /**
   * Per-PBI HITL status tracking
   * Merged by candidateId on update
   */
  pbiStatuses: Annotation<PBIHITLStatus[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      const map = new Map((prev ?? []).map((p) => [p.candidateId, p]));
      for (const u of update) {
        const existing = map.get(u.candidateId);
        map.set(u.candidateId, { ...existing, ...u });
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  /**
   * IDs of PBIs approved for enrichment (ContextEnrichment phase)
   * Accumulated as PBIs are approved
   */
  approvedForEnrichment: Annotation<string[]>({
    reducer: (prev, update) => [
      ...new Set([...(prev ?? []), ...(update ?? [])]),
    ],
    default: () => [],
  }),

  /**
   * Flag indicating HITL interrupt is pending
   * Used by CLI to detect when to wait for human input
   */
  pendingInterrupt: Annotation<{
    type: "approval" | "context";
    candidateIds: string[];
    message: string;
  } | null>({
    reducer: (_, update) => update ?? null,
    default: () => null,
  }),

  /**
   * Context history for each PBI - tracks all iterations of Q&A
   * Preserves structured data across multiple rounds of context gathering
   * Merged by candidateId, with iterations appended
   */
  contextHistory: Annotation<PBIContextHistory[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      const map = new Map((prev ?? []).map((h) => [h.candidateId, h]));
      for (const u of update) {
        const existing = map.get(u.candidateId);
        if (existing) {
          // Merge iterations - append new ones, update existing by iteration number
          const iterMap = new Map(existing.iterations.map((i) => [i.iteration, i]));
          for (const iter of u.iterations) {
            iterMap.set(iter.iteration, iter);
          }
          map.set(u.candidateId, {
            ...existing,
            ...u,
            iterations: Array.from(iterMap.values()).sort((a, b) => a.iteration - b.iteration),
            totalIterations: Math.max(existing.totalIterations, u.totalIterations),
          });
        } else {
          map.set(u.candidateId, u);
        }
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // === ContextEnrichment phase ===
  /**
   * RAG enrichment data for approved PBIs
   * Merged by candidateId
   */
  enrichments: Annotation<PBIEnrichment[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      const map = new Map((prev ?? []).map((e) => [e.candidateId, e]));
      for (const u of update) {
        map.set(u.candidateId, u);
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // === RiskAnalysis phase ===
  /**
   * Risk analysis results for approved PBIs
   * Merged by candidateId
   */
  riskAnalyses: Annotation<PBIRiskAnalysis[]>({
    reducer: (prev, update) => {
      if (!update) return prev ?? [];
      const map = new Map((prev ?? []).map((r) => [r.candidateId, r]));
      for (const u of update) {
        map.set(u.candidateId, u);
      }
      return Array.from(map.values());
    },
    default: () => [],
  }),

  // === Export phase ===
  /**
   * IDs of PBIs that have been exported as final markdown
   */
  exportedPBIs: Annotation<string[]>({
    reducer: (prev, update) => [
      ...new Set([...(prev ?? []), ...(update ?? [])]),
    ],
    default: () => [],
  }),

  /**
   * Export file paths for each PBI
   */
  exportPaths: Annotation<Record<string, string>>({
    reducer: (prev, update) => ({
      ...(prev ?? {}),
      ...(update ?? {}),
    }),
    default: () => ({}),
  }),

  // === Notification ===
  /**
   * Notification payload for webhook/batch mode
   * Set when pipeline completes or pauses for human input
   */
  notification: Annotation<{
    type: "completed" | "needs_review" | "error";
    message: string;
    exportedCount: number;
    pendingCount: number;
    threadId: string;
    timestamp: string;
  } | null>({
    reducer: (_, update) => update ?? null,
    default: () => null,
  }),
});

/**
 * Type helper for node functions
 */
export type PipelineStateType = typeof PipelineState.State;
