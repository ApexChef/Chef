/**
 * Prompt template for DependencyMapping phase
 *
 * Analyzes sibling PBI candidates to identify dependencies between them.
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";

export const DEPENDENCY_MAPPING_SYSTEM_PROMPT = `You are an expert at analyzing relationships between Product Backlog Items (PBIs).

Your task is to analyze a set of PBI candidates extracted from the same source (meeting notes) and identify dependencies between them.

**Dependency Types:**
- \`blocks\`: Source PBI cannot start until target PBI is complete (hard prerequisite)
- \`relates-to\`: PBIs are related but can be worked on independently (soft relationship)
- \`extends\`: Source PBI builds upon the functionality delivered by target PBI

**Dependency Strength:**
- \`hard\`: Absolute requirement - source truly cannot proceed without target
- \`soft\`: Preferred order but can work around if needed

**CRITICAL RULES:**
1. **Dependencies must form a Directed Acyclic Graph (DAG)**
   - No circular dependencies allowed
   - If PBI-002 depends on PBI-001, then PBI-001 CANNOT depend on PBI-002
   - Before adding A→B, verify B does not already depend on A (directly or transitively)

2. **Use "blocks" sparingly**
   - Only when there is a true technical/functional prerequisite
   - Example: "User profile" blocks "User settings" (need profile before settings)
   - Counter-example: "Login" and "Signup" are related but don't block each other

3. **Prefer "relates-to" for soft relationships**
   - When PBIs share context but can be built independently
   - When two PBIs are mutually related, use "relates-to" (not "blocks")

4. **Assign sequence numbers logically**
   - Lower sequence = should be done first
   - Independent PBIs can share the same sequence number
   - Only consider "blocks" dependencies for sequence ordering

5. **Mark parallelizable PBIs**
   - canParallelize: true for PBIs with no blocking dependencies
   - A PBI can be parallelized if nothing blocks it

Analyze ONLY the summary and description of each PBI. Focus on functional dependencies, not implementation details.`;

/**
 * Formats candidates for the prompt
 * Uses only ID, title, and description (summary) as per user requirement
 */
export function formatCandidatesForDependencyAnalysis(
  candidates: Array<{
    id: string;
    title: string;
    extractedDescription: string;
  }>
): string {
  return candidates
    .map(
      (c) => `**${c.id}: ${c.title}**
Summary: ${c.extractedDescription}`
    )
    .join("\n\n---\n\n");
}

export const dependencyMappingPrompt = ChatPromptTemplate.fromMessages([
  ["system", DEPENDENCY_MAPPING_SYSTEM_PROMPT],
  [
    "human",
    `Analyze the following PBI candidates from the same meeting notes and identify their dependencies.

**Event Type:** {eventType}

**PBI Candidates:**

{candidatesList}

---

Analyze the relationships between these PBIs and provide:
1. All dependencies (source depends on target)
2. Sequence assignments for each PBI
3. Which PBIs can be parallelized

Remember: NO circular dependencies. When in doubt, prefer "relates-to" over "blocks".`,
  ],
]);
