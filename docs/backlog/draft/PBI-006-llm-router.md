---
type: pbi
id: PBI-006
title: "LLM Router with Anthropic/Ollama Support"
status: planned
priority: high
difficulty: medium
estimated_effort: 4-6 hours
epic: EPIC-001
phase: 1
dependencies: []
tags: [langchain, llm, anthropic, ollama, foundation]
created: 2024-12-11
updated: 2024-12-11
acceptance_criteria:
  - LLM Router supports Anthropic Claude
  - LLM Router supports Ollama (local models)
  - Provider switchable via environment variable
  - Fallback mechanism if primary provider fails
  - Temperature and model configurable per call
---

# PBI-006: LLM Router with Anthropic/Ollama Support

## Overview

Create a unified LLM Router that abstracts away the LLM provider, allowing seamless switching between Anthropic Claude (cloud) and Ollama (local) models. This is the foundation for all pipeline steps.

## User Story

As a developer, I want to switch between LLM providers without changing my pipeline code, so that I can use local models for development and cloud models for production.

## Requirements

### Functional Requirements

1. Create `LLMRouter` class using LangChain's model abstraction
2. Support Anthropic Claude (claude-3-5-sonnet, claude-3-opus)
3. Support Ollama (llama3.2, mistral, codellama)
4. Configuration via environment variables
5. Per-call overrides for model/temperature

### Non-Functional Requirements

1. Error handling with meaningful messages
2. Retry logic for transient failures
3. Token usage tracking (optional)

## Technical Design

```typescript
// src/llm/router.ts
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";

interface LLMConfig {
  provider: "anthropic" | "ollama";
  model: string;
  temperature?: number;
  maxTokens?: number;
}

class LLMRouter {
  private defaultConfig: LLMConfig;

  constructor(config?: Partial<LLMConfig>) {
    this.defaultConfig = {
      provider: process.env.LLM_PROVIDER || "ollama",
      model: process.env.LLM_MODEL || "llama3.2",
      temperature: 0.7,
      ...config
    };
  }

  getModel(overrides?: Partial<LLMConfig>) {
    const config = { ...this.defaultConfig, ...overrides };

    if (config.provider === "anthropic") {
      return new ChatAnthropic({
        model: config.model,
        temperature: config.temperature,
      });
    }

    return new ChatOllama({
      model: config.model,
      temperature: config.temperature,
    });
  }
}
```

## Environment Variables

```bash
# .env
LLM_PROVIDER=ollama          # or "anthropic"
LLM_MODEL=llama3.2           # or "claude-3-5-sonnet-20241022"
ANTHROPIC_API_KEY=sk-...     # required for anthropic
OLLAMA_BASE_URL=http://localhost:11434
```

## Acceptance Criteria

- [ ] LLMRouter class implemented with provider abstraction
- [ ] Anthropic integration tested with simple prompt
- [ ] Ollama integration tested with simple prompt
- [ ] Environment variable configuration working
- [ ] Per-call override working (e.g., change model for specific step)
- [ ] Error handling for missing API keys

## Testing

```typescript
// Manual test
const router = new LLMRouter();
const model = router.getModel();
const response = await model.invoke("Say hello");
console.log(response.content);

// With override
const anthropicModel = router.getModel({ provider: "anthropic" });
```

## Out of Scope

- Token cost tracking
- Rate limiting
- Model fine-tuning

## References

- [LangChain ChatAnthropic](https://js.langchain.com/docs/integrations/chat/anthropic)
- [LangChain ChatOllama](https://js.langchain.com/docs/integrations/chat/ollama)
- [Backlog Chef AI Router](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/src/ai/)
