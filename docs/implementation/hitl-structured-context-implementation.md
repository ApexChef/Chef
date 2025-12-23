# HITL Structured Context Implementation

## Overview

This implementation enhances the Human-in-the-Loop (HITL) workflow to use structured, interactive context gathering instead of simple text input. It preserves full Q&A history across multiple iterations and provides a better user experience with skip, pause, resume, and file reference capabilities.

## Changes Made

### 1. Dynamic Context Questions Schema

**File:** `packages/backlog/src/schemas/context-question.schema.ts`

Added structured schemas for context gathering:

- `ContextQuestionSchema` - Defines questions with type (select/input/confirm), options, and metadata
- `ContextAnswerSchema` - Stores answers with `questionText` for self-contained Q&A pairs
- `PBIContextResponseSchema` - All answers for a PBI with session status tracking
- `AnswerStatusEnum` - Track answered/skipped/pending status
- `ContextSessionStatusEnum` - Track in_progress/paused/completed/submitted

**Key feature:** Each answer now includes the original `questionText`, so the formatted output shows proper Q&A pairs:
```
Q: What specific conditions should be met for this to be considered done?
A: All functional requirements implemented and verified
```

### 2. Context History Tracking

**File:** `packages/backlog/src/schemas/context-history.schema.ts`

New schema for tracking iterations of context gathering:

- `ContextIterationSchema` - One round of Q&A with:
  - Questions asked
  - Structured responses
  - Score before/after
  - Missing elements and recommendations at that point
  - Timestamp

- `PBIContextHistorySchema` - All iterations for a PBI
- `formatContextHistoryForLLM()` - Generates readable context with iteration markers
- `getContextHistorySummary()` - Statistics helper

### 3. Pipeline State Enhancement

**File:** `packages/backlog/src/pipeline/state/pipeline-state.ts`

Added `contextHistory` annotation to pipeline state:
- Tracks all Q&A iterations per PBI
- Reducer merges by candidateId and appends new iterations
- Preserves structured data instead of concatenated strings

### 4. Node Updates

**File:** `packages/backlog/src/pipeline/graph/nodes/request-context.node.ts`

- Creates `ContextIteration` records when receiving responses
- Updates `contextHistory` in pipeline state
- Generates `humanContext` string from full history using `formatContextHistoryForLLM()`

**File:** `packages/backlog/src/pipeline/graph/nodes/rescore-with-context.node.ts`

- Updates `scoreAfter` in the latest iteration after rescoring

### 5. Interactive CLI with Rich Features

**File:** `apps/cli/src/commands/backlog/resume.ts`

Complete rewrite of context gathering with:

- **Interactive prompts** using `@inquirer/prompts` (select, input, confirm, editor)
- **Question preview** - Shows task list of all questions with progress
- **Skip any question** - Even required ones can be skipped
- **Pause and resume** - Save progress mid-session, continue later
- **Edit previous answers** - When resuming, can modify earlier responses
- **File references** - `@file:path` syntax loads file content as answer
- **Editor support** - Open system editor for long text
- **Colored output** - Using chalk for better UX

### 6. Partial Context Persistence

**File:** `packages/backlog/src/hitl/session.ts`

Added methods for saving/loading partial progress:

- `savePartialContext()` - Saves to SQLite `partial_context` table
- `loadPartialContext()` - Restores saved answers
- `clearPartialContext()` - Cleans up after submission
- `hasPartialContext()` - Check if saved progress exists

### 7. Logging Context Fix

**File:** `apps/cli/src/commands/backlog/resume.ts`

Wrapped `resumeLoop` in `runPipeline()` to provide proper logging context for nodes that use `runStep()`.

## Data Flow

```
User answers questions
        │
        ▼
┌─────────────────────────────────────┐
│ PBIContextResponse                  │
│ - answers[] with questionText       │
│ - additionalContext                 │
│ - status (paused/completed)         │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ ContextIteration                    │
│ - iteration number                  │
│ - questions asked                   │
│ - response (structured)             │
│ - scoreBefore / scoreAfter          │
│ - missingElements                   │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ PBIContextHistory                   │
│ - candidateId                       │
│ - iterations[]                      │
│ - totalIterations                   │
└─────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────┐
│ Pipeline State                      │
│ - contextHistory[] (structured)     │
│ - candidates[].humanContext (text)  │
└─────────────────────────────────────┘
```

## Example Output

When the pipeline needs context for a PBI:

```
──────────────────────────────────────────────────
  We have 6 questions for you:

  ✓ Q1: What specific conditions should be me... All functional require...
  ⏭ Q2: Please provide: Clear definition of w... (skipped)
  ○ Q3: Please provide: Examples of how these...
  ○ Q4: Add explicit acceptance criteria sect...
  ○ Q5: Include a brief code example or inter...
  ○ Additional context

[3/6] examples

Please provide: Examples of how these types will be used
  Hint: Provide code examples, type definitions, or specifications...
? How would you like to answer?
  ✎ Type a short answer
  📝 Open editor (for longer text)
  📄 Load from file
  ⏭ Skip this question
  ⏸ Pause and save progress
```

## Benefits

1. **Better UX** - Interactive prompts with options instead of blank text input
2. **Full history** - All Q&A iterations preserved as structured data
3. **Resumable** - Can pause mid-session and continue later
4. **Traceable** - Score progression visible across iterations
5. **Flexible input** - Type, edit in editor, or load from file
6. **Self-documenting** - Each answer includes its question for context
