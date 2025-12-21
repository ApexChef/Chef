---
type: pbi
id: PBI-007
title: "Steps 1-2: Event Detection & Candidate Extraction"
status: planned
priority: high
difficulty: medium
estimated_effort: 6-8 hours
epic: EPIC-001
phase: 2
dependencies: [PBI-006]
tags: [langchain, pipeline, extraction, llm-chain]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - Step 1 detects meeting type from plain text
  - Step 2 extracts PBI candidates from meeting notes
  - Output follows structured schema
  - Chain uses LLM Router for model selection
---

# PBI-007: Steps 1-2: Event Detection & Candidate Extraction

## Overview

Implement the first two pipeline steps using LangChain chains:
1. **Event Detection**: Classify meeting type (refinement, planning, standup, retro)
2. **Candidate Extraction**: Parse meeting notes into PBI candidates

## User Story

As a user, I want to feed plain text meeting notes into the pipeline and get structured PBI candidates back, so that I can refine them further.

## Requirements

### Functional Requirements

1. **Step 1 - Event Detection**
   - Input: Plain text meeting notes
   - Output: Meeting classification with confidence
   - Types: refinement, planning, standup, retrospective, other

2. **Step 2 - Candidate Extraction**
   - Input: Meeting notes + event type from Step 1
   - Output: Array of PBI candidates
   - Each candidate has: title, description, type (feature/bug/tech-debt)

### Non-Functional Requirements

1. Use LangChain's structured output (Zod schemas)
2. Chain composition for step orchestration
3. Prompt templates externalized for easy modification

## Technical Design

### Step 1: Event Detection Chain

```typescript
// src/pipeline/steps/step1-event-detection.ts
import { z } from "zod";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const EventSchema = z.object({
  eventType: z.enum(["refinement", "planning", "standup", "retrospective", "other"]),
  confidence: z.number().min(0).max(1),
  indicators: z.array(z.string()),
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", `You are a meeting classifier. Analyze the meeting notes and determine the type.

Meeting types:
- refinement: Discussing user stories, acceptance criteria, estimation
- planning: Sprint planning, capacity, commitments
- standup: Daily updates, blockers, progress
- retrospective: What went well, improvements, action items
- other: General discussion or unclear`],
  ["human", "{meetingNotes}"],
]);
```

### Step 2: Candidate Extraction Chain

```typescript
// src/pipeline/steps/step2-extract-candidates.ts
const PBICandidateSchema = z.object({
  title: z.string(),
  description: z.string(),
  type: z.enum(["feature", "bug", "tech-debt", "spike"]),
  rawContext: z.string(), // Original text that led to this candidate
});

const ExtractionSchema = z.object({
  candidates: z.array(PBICandidateSchema),
  extractionNotes: z.string().optional(),
});
```

### Sample Input

```markdown
# Refinement Meeting - Dec 11

## Attendees
- Product Owner: Sarah
- Dev Lead: Mike
- Developers: Alex, Jordan

## Discussion

Sarah: We need to add user authentication. Users are complaining they can't save their preferences.

Mike: We could use OAuth or build our own. OAuth would be faster but less control.

Alex: There's also that bug in the export feature - PDFs are cutting off the last page.

Jordan: We should probably add some caching too. The API is slow on repeat queries.

## Action Items
- Research OAuth providers
- Fix PDF export bug
- Spike on caching options
```

### Expected Output

```json
{
  "step1": {
    "eventType": "refinement",
    "confidence": 0.92,
    "indicators": ["discussing user stories", "acceptance criteria mentioned", "estimation discussion"]
  },
  "step2": {
    "candidates": [
      {
        "title": "Add User Authentication with OAuth",
        "description": "Implement user authentication so users can save preferences. Consider OAuth for faster implementation.",
        "type": "feature",
        "rawContext": "Sarah: We need to add user authentication..."
      },
      {
        "title": "Fix PDF Export Truncation Bug",
        "description": "PDFs are cutting off the last page during export.",
        "type": "bug",
        "rawContext": "Alex: There's also that bug in the export feature..."
      },
      {
        "title": "Implement API Response Caching",
        "description": "Add caching to improve API performance on repeat queries.",
        "type": "tech-debt",
        "rawContext": "Jordan: We should probably add some caching too..."
      }
    ]
  }
}
```

## Acceptance Criteria

- [ ] Step 1 chain correctly classifies meeting types
- [ ] Step 2 chain extracts PBI candidates with required fields
- [ ] Chains use structured output (Zod) for type safety
- [ ] Prompt templates are externalized/configurable
- [ ] Both chains integrate with LLM Router (PBI-006)
- [ ] Basic CLI command to run steps 1-2 on a text file

## Files to Create

```
src/pipeline/
  steps/
    step1-event-detection.ts
    step2-extract-candidates.ts
  schemas/
    event.schema.ts
    candidate.schema.ts
  prompts/
    step1-prompt.ts
    step2-prompt.ts
```

## Testing

```bash
# Create test input file
echo "# Refinement meeting notes..." > test-input.txt

# Run steps 1-2
npm run pipeline:steps-1-2 -- test-input.txt
```

## References

- [LangChain Structured Output](https://js.langchain.com/docs/how_to/structured_output)
- [Backlog Chef Step 1](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
- [Backlog Chef Step 2](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/steps/)
