/**
 * Dependency Schema
 *
 * Defines the structure for sibling PBI dependencies identified by
 * the DependencyMapping phase.
 */

import { z } from "zod";

/**
 * Types of dependencies between PBIs
 */
export const DependencyTypeEnum = z.enum([
  "blocks",     // Must complete target before source can start
  "relates-to", // Related but not blocking
  "extends",    // Source builds upon target's functionality
]);

export type DependencyType = z.infer<typeof DependencyTypeEnum>;

/**
 * Strength of a dependency relationship
 */
export const DependencyStrengthEnum = z.enum([
  "hard", // Absolute requirement
  "soft", // Nice to have, can work around
]);

export type DependencyStrength = z.infer<typeof DependencyStrengthEnum>;

/**
 * A single dependency relationship between two PBIs
 */
export const DependencySchema = z.object({
  source: z.string().describe("ID of the PBI that has the dependency (e.g., PBI-002)"),
  target: z.string().describe("ID of the PBI it depends on (e.g., PBI-001)"),
  type: DependencyTypeEnum.describe("Type of relationship"),
  reason: z.string().describe("Brief explanation of why this dependency exists"),
  strength: DependencyStrengthEnum.describe("How critical this dependency is"),
});

export type Dependency = z.infer<typeof DependencySchema>;

/**
 * Sequence assignment for a single candidate
 */
export const SequenceAssignmentSchema = z.object({
  candidateId: z.string().describe("ID of the PBI candidate"),
  sequence: z.number().describe("Suggested execution order (1 = first)"),
  canParallelize: z.boolean().describe("True if no blocking dependencies"),
});

export type SequenceAssignment = z.infer<typeof SequenceAssignmentSchema>;

/**
 * Result of the DependencyMapping phase
 */
export const DependencyMappingResultSchema = z.object({
  dependencies: z.array(DependencySchema).describe("All identified dependencies"),
  sequenceAssignments: z.array(SequenceAssignmentSchema).describe(
    "Sequence assignments for each candidate"
  ),
  analysisNotes: z.string().optional().describe(
    "Any observations about the dependency structure"
  ),
});

export type DependencyMappingResult = z.infer<typeof DependencyMappingResultSchema>;

/**
 * Result of cycle detection
 */
export interface CycleDetectionResult {
  hasCycles: boolean;
  cycles: string[][];      // Each cycle is a path of PBI IDs
  cleanedDependencies: Dependency[]; // Dependencies with cycles removed
}
