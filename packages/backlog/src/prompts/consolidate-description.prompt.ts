/**
 * Prompt template for ConsolidateDescription phase
 *
 * Creates a unified description from LLM-extracted text and human-provided context
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";

export const CONSOLIDATE_DESCRIPTION_SYSTEM_PROMPT = `You are a technical writer specializing in Product Backlog Items (PBIs). Your task is to create a clear, comprehensive description by combining:
1. The original LLM-extracted description from meeting notes
2. Additional context provided by a human reviewer

Create a consolidated description that:
- Integrates both sources naturally (don't just concatenate)
- Maintains clarity and professionalism
- Preserves all important details from both sources
- Resolves any contradictions by preferring human-provided context
- Uses user story format when appropriate
- Is actionable and clear for a development team

Output ONLY the consolidated description text. No headers, labels, or metadata.`;

export const consolidateDescriptionPrompt = ChatPromptTemplate.fromMessages([
  ["system", CONSOLIDATE_DESCRIPTION_SYSTEM_PROMPT],
  [
    "human",
    `PBI Title: {title}
PBI Type: {type}

Original Extracted Description:
{extractedDescription}

Human-Provided Context:
{humanContext}

Create a consolidated description that integrates both sources:`,
  ],
]);
