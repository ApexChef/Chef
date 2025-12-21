/**
 * Filter type definitions and constants for RAG queries
 */

/**
 * Query filters for metadata-based search
 */
export interface QueryFilters {
  type?: string[];        // doc_type: pact, guide, adr, pbi, architecture
  status?: string[];      // status value (type-dependent)
  phase?: string[];       // PACT phase: prepare, architect, code, test
  difficulty?: string[];  // Guide difficulty: beginner, intermediate, advanced
  priority?: string[];    // PBI priority: high, medium, low
  tags?: string[];        // Search in tags string
}

/**
 * Valid document types
 */
export const VALID_TYPES = [
  "pact",
  "guide",
  "adr",
  "pbi",
  "architecture",
  "reference",
  "project",
] as const;

export type DocType = (typeof VALID_TYPES)[number];

/**
 * Valid status values by document type
 */
export const STATUS_BY_TYPE: Record<string, readonly string[]> = {
  pact: ["draft", "active", "completed"],
  pbi: ["planned", "active", "completed"],
  adr: ["proposed", "accepted", "deprecated", "superseded"],
} as const;

/**
 * Valid PACT phases
 */
export const VALID_PHASES = ["prepare", "architect", "code", "test"] as const;

export type PactPhase = (typeof VALID_PHASES)[number];

/**
 * Valid guide difficulty levels
 */
export const VALID_DIFFICULTIES = [
  "beginner",
  "intermediate",
  "advanced",
] as const;

export type Difficulty = (typeof VALID_DIFFICULTIES)[number];

/**
 * Valid PBI priorities
 */
export const VALID_PRIORITIES = ["high", "medium", "low"] as const;

export type Priority = (typeof VALID_PRIORITIES)[number];
