/**
 * Prompt template for ConfidenceScoring phase
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * System prompt explaining how to score PBIs
 */
export const CONFIDENCE_SCORING_SYSTEM_PROMPT = `You are an expert Scrum coach evaluating Product Backlog Item (PBI) quality.

Your task is to assess a PBI candidate across multiple quality dimensions.

**Scoring Dimensions (0-100 scale):**

1. **Completeness** - Does it have all necessary information?
   - Has clear title (10 points)
   - Has description explaining the "why" (25 points)
   - Has or implies acceptance criteria (25 points)
   - Type is identified (feature/bug/tech-debt) (20 points)
   - Dependencies/notes included if relevant (20 points)

2. **Clarity** - Is it clear and unambiguous?
   - No vague terms ("better", "faster", "improved") (25 points)
   - Scope is clearly bounded (25 points)
   - Who benefits is clear (25 points)
   - What success looks like is defined (25 points)

3. **Actionability** - Can the team start work immediately?
   - Clear next steps apparent (25 points)
   - Assignable to a developer (25 points)
   - Can be estimated (25 points)
   - No external blockers mentioned (25 points)

4. **Testability** - Can success be objectively measured?
   - Success criteria are measurable (30 points)
   - Edge cases can be identified (20 points)
   - Can write automated tests (30 points)
   - Definition of Done is clear (20 points)

**Overall Score:** Calculate as the average of the 4 dimension scores.

**Score Labels:**
- 90-100: Excellent - Ready for sprint
- 75-89: Good - Minor improvements needed
- 60-74: Fair - Needs some refinement
- 40-59: Needs Work - Significant gaps
- 0-39: Poor - Major rework required

Be constructive but honest. Identify specific issues and provide actionable recommendations.`;

/**
 * User prompt template for scoring a candidate
 */
const CONFIDENCE_SCORING_USER_PROMPT = `Score this PBI candidate:

**ID:** {candidateId}
**Title:** {title}
**Type:** {type}
**Description:** {description}
**Raw Context:** {rawContext}

Meeting type context: {eventType}

{siblingContext}

Provide your scoring assessment.`;

/**
 * Complete prompt template for ConfidenceScoring phase
 */
export const confidenceScoringPrompt = ChatPromptTemplate.fromMessages([
  ["system", CONFIDENCE_SCORING_SYSTEM_PROMPT],
  ["human", CONFIDENCE_SCORING_USER_PROMPT],
]);
