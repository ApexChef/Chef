What is the status of the PBIs that are planned to do or active? /**
 * Prompt template for Step 1: Event Detection
 */

import { ChatPromptTemplate } from "@langchain/core/prompts";

export const STEP1_SYSTEM_PROMPT = `You are a meeting classifier. Analyze meeting notes and determine the type of meeting.

Meeting types:
- refinement: Backlog grooming, discussing user stories, acceptance criteria, estimation, breaking down work items
- planning: Sprint planning, capacity discussion, commitments, sprint goals, selecting work for upcoming sprint
- standup: Daily standup/scrum, progress updates, blockers, what was done yesterday, what will be done today
- retrospective: Sprint retro, what went well, what needs improvement, action items, team feedback
- other: General discussion, unclear meeting type, or doesn't fit the above categories

Your task:
1. Analyze the meeting notes content
2. Determine which meeting type best fits
3. Rate your confidence (0 = uncertain, 1 = very confident)
4. List the key indicators that led to your classification

Respond with valid JSON only. No explanation text.`;

export const step1Prompt = ChatPromptTemplate.fromMessages([
  ["system", STEP1_SYSTEM_PROMPT],
  [
    "human",
    `Analyze these meeting notes and classify the meeting type:

{meetingNotes}`,
  ],
]);
