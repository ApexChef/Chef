---
type: pbi
id: PBI-014
title: "Pipeline Orchestrator & State Management"
status: planned
priority: high
difficulty: high
estimated_effort: 8-12 hours
epic: EPIC-001
phase: 5
dependencies: [PBI-013]
tags: [langchain, pipeline, orchestration, state]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - Orchestrator runs all 8 steps in sequence
  - State persisted after each step
  - Pipeline resumable from any step
  - Configuration via YAML or environment
  - CLI command for end-to-end execution
---

# PBI-014: Pipeline Orchestrator & State Management

## Overview

Implement the pipeline orchestrator that ties all 8 steps together, manages state, and enables resumable execution.

## User Story

As a user, I want to run the complete pipeline with a single command and be able to resume if it fails midway.

## Requirements

### Functional Requirements

1. **Orchestration**
   - Run steps 1-8 in sequence
   - Pass outputs between steps
   - Handle step failures gracefully

2. **State Management**
   - Persist state after each step
   - Enable resume from last successful step
   - Track execution metadata

3. **Configuration**
   - Configurable workflow (enable/disable steps)
   - LLM selection per step
   - Output options

4. **CLI Interface**
   - `npm run pipeline -- input.txt`
   - `npm run pipeline -- --resume run-123`
   - `npm run pipeline -- --from-step 4`

## Technical Design

```typescript
// src/pipeline/orchestrator.ts
interface PipelineConfig {
  steps: {
    step1: { enabled: boolean; model?: string };
    step2: { enabled: boolean; model?: string };
    // ... steps 3-8
  };
  output: OutputConfig;
  llm: LLMConfig;
}

interface PipelineState {
  runId: string;
  inputFile: string;
  currentStep: number;
  completedSteps: number[];
  stepOutputs: Record<number, unknown>;
  startedAt: string;
  updatedAt: string;
  status: "running" | "completed" | "failed" | "paused";
  error?: string;
}

class PipelineOrchestrator {
  private config: PipelineConfig;
  private state: PipelineState;
  private llmRouter: LLMRouter;

  async run(inputFile: string): Promise<PipelineOutput> {
    this.initializeState(inputFile);

    for (const stepNum of [1, 2, 3, 4, 5, 6, 7, 8]) {
      if (!this.config.steps[`step${stepNum}`].enabled) continue;

      try {
        const stepInput = this.prepareStepInput(stepNum);
        const stepOutput = await this.executeStep(stepNum, stepInput);
        this.state.stepOutputs[stepNum] = stepOutput;
        this.state.completedSteps.push(stepNum);
        await this.persistState();
      } catch (error) {
        this.state.status = "failed";
        this.state.error = error.message;
        await this.persistState();
        throw error;
      }
    }

    return this.generateOutput();
  }

  async resume(runId: string, fromStep?: number): Promise<PipelineOutput> {
    await this.loadState(runId);
    const startStep = fromStep || this.state.currentStep;
    // Continue from startStep...
  }
}
```

### State Persistence

```
.pipeline/
  {run-id}/
    state.json          # Pipeline state
    input/
      original.txt      # Original input
    steps/
      step-1.json       # Step 1 output
      step-2.json       # Step 2 output
      ...
    output/
      pipeline-output.json
      summary.md
      candidates/
```

### CLI Commands

```bash
# Run full pipeline
npm run pipeline -- meeting-notes.txt

# Run with specific config
npm run pipeline -- meeting-notes.txt --config custom-config.yaml

# Resume failed run
npm run pipeline -- --resume run-abc123

# Resume from specific step
npm run pipeline -- --resume run-abc123 --from-step 4

# Dry run (validate config only)
npm run pipeline -- meeting-notes.txt --dry-run

# List previous runs
npm run pipeline:list
```

### Configuration File

```yaml
# pipeline-config.yaml
llm:
  provider: ollama
  model: llama3.2
  temperature: 0.7

steps:
  step1:
    enabled: true
  step2:
    enabled: true
  step3:
    enabled: true
    model: anthropic/claude-3-5-sonnet  # Override for this step
  step4:
    enabled: true
    ragTopK: 5
    ragThreshold: 0.3
  step5:
    enabled: true
  step6:
    enabled: true
  step7:
    enabled: true
  step8:
    enabled: true
    formats: [json, markdown, summary]

output:
  dir: ./output
  includeRaw: false
```

## Acceptance Criteria

- [ ] Orchestrator executes all enabled steps in sequence
- [ ] State persisted after each step completion
- [ ] Resume from any step works correctly
- [ ] CLI commands implemented (run, resume, list)
- [ ] Configuration via YAML file
- [ ] Graceful error handling with state preservation

## Implementation Notes

1. Consider using LangChain's LCEL (LangChain Expression Language) for chain composition
2. State persistence uses simple JSON files (not a database)
3. Run ID uses format: `run-{timestamp}-{random}`

## References

- [Backlog Chef Pipeline Orchestrator](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/orchestrator/)
- [Backlog Chef State Management](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/pipeline/state/)
- [LangChain LCEL](https://js.langchain.com/docs/how_to/sequence/)
