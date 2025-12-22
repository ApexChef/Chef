# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.


## Reference

This is the final version of Backlog-Chef. This is based on two previous projects which are the following:
- [langchain-playground](/Users/alwin/Projects/github.com/ApexChef/langchain-playground)
- [backlog-chef](/Users/alwin/Projects/github.com/ApexChef/backlog-chef)

## Build & Development Commands

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode (watch)
pnpm dev

# Run CLI in development (uses ts-node)
pnpm --filter @chef/cli chef backlog process <file>

# Build specific package
pnpm --filter @chef/core build

# Lint all packages
pnpm lint

# Clean all builds
pnpm clean
```

## Architecture

Chef is a pnpm monorepo for AI-powered agile productivity tools built on LangChain/LangGraph.

### Package Hierarchy

```
@chef/core     → shared LLM routing, RAG, logging (no dependencies on other @chef packages)
@chef/backlog  → depends on @chef/core
@chef/cli      → depends on @chef/core and @chef/backlog
```

### LLM Provider Routing (`packages/core/src/llm/`)

The `LLMRouter` class creates LangChain chat models with environment-based configuration:
- **Ollama** (default): Local LLMs, no API key needed. Set `OLLAMA_BASE_URL` if not localhost.
- **Anthropic**: Cloud LLMs, requires `ANTHROPIC_API_KEY`.

Override via `LLM_PROVIDER` and `LLM_MODEL` env vars or constructor options.

### Backlog Pipeline (`packages/backlog/src/pipeline/`)

A LangGraph StateGraph pipeline that transforms meeting notes into Product Backlog Items (PBIs):

**Flow**: `detectEvent → extractCandidates → scoreConfidence → [HITL routing] → enrichContext → riskAnalysis → exportPBI`

**Key concepts**:
- **PipelineState** (`state/pipeline-state.ts`): Annotation-based shared state with merge reducers for arrays/objects
- **Nodes** (`graph/nodes/`): Each step is a pure function `(state) → Partial<state>`
- **HITL thresholds** (`constants/thresholds.ts`): Score ≥75 auto-approves, 50-74 needs human approval, <50 needs context

### CLI (`apps/cli/`)

Built with oclif framework. Commands are explicitly registered in `oclif.commands` config.

## TypeScript Configuration

- ES2022 target, NodeNext modules
- Strict mode enabled
- All packages extend `tsconfig.base.json`
- Build output to `dist/`, source in `src/`
