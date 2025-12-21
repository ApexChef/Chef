---
type: epic
id: EPIC-001
title: "LangChain Meeting-to-PBI Pipeline"
status: in-progress
priority: high
created: 2024-12-11
updated: 2024-12-21
child_pbis:
  - PBI-006
  - PBI-007
  - PBI-008
  - PBI-009
  - PBI-010
  - PBI-011
  - PBI-012
  - PBI-013
  - PBI-014
  - PBI-015
  - PBI-016
  - PBI-017
tags: [langchain, pipeline, poc, backlog-chef-replication]
---

# EPIC-001: LangChain Meeting-to-PBI Pipeline

## Vision

Replicate the Backlog Chef 8-step pipeline using LangChain to:
1. Validate LangChain as a framework for AI pipelines
2. Compare implementation complexity vs custom TypeScript
3. Learn LangChain patterns for chains, agents, and RAG

## Background

The Backlog Chef project (`/Users/alwin/Projects/github.com/ApexChef/backlog-chef`) implements an 8-step pipeline that transforms meeting transcripts into structured Product Backlog Items (PBIs). This Epic aims to replicate that functionality using LangChain.

## Source Pipeline (Backlog Chef)

| Step | Name | Purpose |
|------|------|---------|
| 1 | Event Detection | Classify meeting type (refinement, planning, retro) |
| 2 | Extract Candidates | Parse transcript into raw PBI candidates |
| 3 | Score Confidence | Quality scoring (completeness, clarity, testability) |
| 4 | Enrich Context | RAG with ChromaDB for similar past work |
| 5 | Check Risks | Dependency/conflict detection |
| 6 | Generate Questions | Actionable follow-ups with proposals |
| 7 | Readiness Checker | Definition of Ready validation |
| 8 | Final Output | Multi-format export |

## Scope

### In Scope
- Plain text meeting notes as input (simplified from Fireflies JSON)
- Anthropic Claude + Ollama (local) as LLM providers
- ChromaDB as vector store (already configured)
- Structured JSON output
- All 8 pipeline steps (incremental implementation)

### Out of Scope
- Web interface
- Fireflies integration
- Jira/DevOps export
- Production deployment

## Implementation Strategy

**Phase 1: Foundation**
- LLM Router for Anthropic/Ollama switching
- Basic pipeline structure

**Phase 2: Core Pipeline (Steps 1-3)**
- Event detection chain
- Candidate extraction chain
- Confidence scoring chain

**Phase 3: Context Enrichment (Step 4)**
- Leverage existing RAG infrastructure
- Integrate with pipeline

**Phase 4: Analysis (Steps 5-6)**
- Risk assessment chain
- Question generation chain

**Phase 5: Validation & Output (Steps 7-8)**
- Readiness checking chain
- Output formatting

## Cross-Cutting Concerns

### Sibling PBI Awareness (PBI-017)

When multiple PBIs are extracted from the same source (e.g., meeting notes describing an EPIC-level feature), the pipeline must recognize relationships between them:

- **DependencyMapping Phase**: New phase after CandidateExtraction that identifies dependencies between sibling PBIs
- **Dependency Graph**: Tracks source → target relationships with type (blocks/relates-to/extends) and strength (hard/soft)
- **Downstream Impact**: Phases 4-7 are sibling-aware:
  - **ContextEnrichment**: Injects sibling context, filters overlapping external results
  - **RiskAnalysis**: Marks risks mitigated by siblings, assesses residual risk
  - **QuestionsGeneration**: Marks questions answered by siblings
  - **ReadinessChecker**: Assesses batch readiness, considers dependency chains

This prevents penalizing PBIs for "missing information" that is actually covered by sibling PBIs.

### Phase Naming Convention

Pipeline phases use descriptive names (not step numbers) to allow flexible ordering:
- EventDetection, CandidateExtraction, DependencyMapping, ConfidenceScoring, ContextEnrichment, RiskAnalysis, QuestionsGeneration, ReadinessChecker, OutputFormatting

## Success Criteria

- [ ] All 8 steps implemented as LangChain chains/agents
- [ ] Can process plain text meeting notes end-to-end
- [ ] Output matches Backlog Chef PBI structure
- [ ] LLM provider switchable via configuration
- [ ] Pipeline is resumable (state persistence)

## Child PBIs

| PBI | Title | Phase | Status |
|-----|-------|-------|--------|
| PBI-006 | LLM Router with Anthropic/Ollama | 1 | done |
| PBI-007 | EventDetection & CandidateExtraction | 2 | done |
| PBI-008 | ConfidenceScoring Chain | 2 | done |
| PBI-009 | ContextEnrichment: RAG Context Enrichment | 3 | planned |
| PBI-010 | RiskAnalysis: Risk & Conflict Assessment | 4 | planned |
| PBI-011 | QuestionsGeneration: Questions & Proposals | 4 | planned |
| PBI-012 | ReadinessChecker: Definition of Ready Validation | 5 | planned |
| PBI-013 | OutputFormatting: Multi-format Output | 5 | planned |
| PBI-014 | Pipeline Orchestrator & State Management | 5 | planned |
| PBI-015 | Refactor Pipeline to LangGraph with Shared State | 2 | done |
| PBI-016 | Human-in-the-Loop with Threshold-Based Routing | 3 | planned |
| PBI-017 | DependencyMapping: Sibling PBI Cross-Reference | 2 | planned |

**Note**: PBI-017 (Sibling Awareness) is a dependency for PBI-009, PBI-010, PBI-011, and PBI-012.

## Architecture Diagram

```mermaid
flowchart TB
    subgraph Input["📥 Input"]
        TXT[Plain Text Meeting Notes]
    end

    subgraph Foundation["🔧 Foundation Layer"]
        direction LR
        LLMRouter["LLM Router<br/><small>PBI-006</small>"]

        subgraph Providers["LLM Providers"]
            Anthropic["@langchain/anthropic<br/><small>ChatAnthropic</small>"]
            Ollama["@langchain/ollama<br/><small>ChatOllama</small>"]
        end

        LLMRouter --> Anthropic
        LLMRouter --> Ollama
    end

    subgraph Pipeline["🔄 8-Step Pipeline"]
        direction TB

        subgraph Phase2["Phase 2: Core Pipeline"]
            S1["Step 1: Event Detection<br/><small>PBI-007</small>"]
            S2["Step 2: Extract Candidates<br/><small>PBI-007</small>"]
            S3["Step 3: Score Confidence<br/><small>PBI-008</small>"]
        end

        subgraph Phase3["Phase 3: Context & HITL"]
            HITL["Human Approval<br/><small>PBI-016</small>"]
            CTX["Request Context<br/><small>PBI-016</small>"]
            S4["Step 4: RAG Enrichment<br/><small>PBI-009</small>"]
        end

        subgraph Phase4["Phase 4: Analysis"]
            S5["Step 5: Risk Assessment<br/><small>PBI-010</small>"]
            S6["Step 6: Questions & Proposals<br/><small>PBI-011</small>"]
        end

        subgraph Phase5["Phase 5: Validation & Output"]
            S7["Step 7: Readiness Check<br/><small>PBI-012</small>"]
            S8["Step 8: Output Formatting<br/><small>PBI-013</small>"]
        end

        S1 --> S2 --> S3
        S3 -->|"≥75"| S4
        S3 -->|"50-74"| HITL
        S3 -->|"<50"| CTX
        HITL -->|approve| S4
        HITL -->|reject| CTX
        CTX -->|rescore| S3
        S4 --> S5 --> S6 --> S7 --> S8
    end

    subgraph RAG["🔍 RAG Infrastructure"]
        direction LR
        ChromaDB[(ChromaDB<br/><small>Vector Store</small>)]
        Embeddings["OllamaEmbeddings<br/><small>nomic-embed-text</small>"]
        Retriever["VectorStoreRetriever<br/><small>@langchain/core</small>"]

        Embeddings --> ChromaDB
        ChromaDB --> Retriever
    end

    subgraph LangChainCore["📦 LangChain Components Used"]
        direction TB

        subgraph Prompts["Prompts"]
            PT["ChatPromptTemplate"]
            MT["MessagesPlaceholder"]
        end

        subgraph Output["Structured Output"]
            Zod["Zod Schemas"]
            SO["withStructuredOutput()"]
        end

        subgraph Chains["Chain Composition"]
            LCEL["LCEL Pipes |"]
            RunnableSeq["RunnableSequence"]
            RunnableMap["RunnableParallel"]
        end

        subgraph Memory["State & Memory"]
            State["Custom State Manager"]
            JSON["JSON Persistence"]
        end
    end

    subgraph Output["📤 Output"]
        direction LR
        JSONOut["pipeline-output.json"]
        MDOut["candidate-*.md"]
        Summary["summary.md"]
    end

    TXT --> S1
    LLMRouter -.-> Pipeline
    S4 <--> Retriever
    S8 --> JSONOut
    S8 --> MDOut
    S8 --> Summary

    style Foundation fill:#e1f5fe
    style Pipeline fill:#f3e5f5
    style RAG fill:#e8f5e9
    style LangChainCore fill:#fff3e0
    style Input fill:#fce4ec
    style Output fill:#e0f2f1
```

## LangChain Components by Step

```mermaid
flowchart LR
    subgraph Step1["Step 1: Event Detection"]
        S1_PT["ChatPromptTemplate"]
        S1_SO["withStructuredOutput"]
        S1_Zod["EventSchema (Zod)"]
    end

    subgraph Step2["Step 2: Extract Candidates"]
        S2_PT["ChatPromptTemplate"]
        S2_SO["withStructuredOutput"]
        S2_Zod["CandidateSchema (Zod)"]
    end

    subgraph Step3["Step 3: Score Confidence"]
        S3_PT["ChatPromptTemplate"]
        S3_SO["withStructuredOutput"]
        S3_Zod["ScoreSchema (Zod)"]
    end

    subgraph Step4["Step 4: RAG Enrichment"]
        S4_Ret["VectorStoreRetriever"]
        S4_Chain["RetrievalQAChain"]
        S4_Chroma["Chroma"]
        S4_Embed["OllamaEmbeddings"]
    end

    subgraph Step5["Step 5: Risk Assessment"]
        S5_PT["ChatPromptTemplate"]
        S5_SO["withStructuredOutput"]
        S5_Zod["RiskSchema (Zod)"]
    end

    subgraph Step6["Step 6: Questions"]
        S6_PT["ChatPromptTemplate"]
        S6_SO["withStructuredOutput"]
        S6_Zod["QuestionSchema (Zod)"]
    end

    subgraph Step7["Step 7: Readiness"]
        S7_PT["ChatPromptTemplate"]
        S7_SO["withStructuredOutput"]
        S7_Zod["ReadinessSchema (Zod)"]
    end

    subgraph Step8["Step 8: Output"]
        S8_JSON["JSON.stringify"]
        S8_MD["Handlebars Templates"]
    end

    Step1 --> Step2 --> Step3 --> Step4 --> Step5 --> Step6 --> Step7 --> Step8

    style Step4 fill:#e8f5e9
```

## Package Dependencies

```mermaid
graph TD
    subgraph Core["@langchain/core"]
        Prompts["prompts/"]
        Runnables["runnables/"]
        Output["output_parsers/"]
    end

    subgraph Integrations["LangChain Integrations"]
        Anthropic["@langchain/anthropic"]
        OllamaLLM["@langchain/ollama"]
        ChromaInt["@langchain/community<br/>(Chroma)"]
    end

    subgraph External["External Dependencies"]
        Zod["zod"]
        ChromaDB["chromadb"]
        Handlebars["handlebars"]
    end

    subgraph Project["This Project"]
        LLMRouter["src/llm/router.ts"]
        Steps["src/pipeline/steps/"]
        Orchestrator["src/pipeline/orchestrator.ts"]
        Schemas["src/pipeline/schemas/"]
    end

    Core --> Project
    Integrations --> Project
    External --> Project
```

## Data Flow

```mermaid
sequenceDiagram
    participant User
    participant CLI
    participant Orchestrator
    participant LLMRouter
    participant Steps
    participant RAG
    participant Output

    User->>CLI: npm run pipeline input.txt
    CLI->>Orchestrator: run(inputFile)

    loop For each enabled step
        Orchestrator->>LLMRouter: getModel(stepConfig)
        LLMRouter-->>Orchestrator: ChatModel

        Orchestrator->>Steps: executeStep(stepNum, input)

        alt Step 4 (RAG)
            Steps->>RAG: query(candidateTitle)
            RAG-->>Steps: relevantDocs[]
        end

        Steps-->>Orchestrator: stepOutput
        Orchestrator->>Orchestrator: persistState()
    end

    Orchestrator->>Output: generateOutput()
    Output-->>CLI: files written
    CLI-->>User: Summary displayed
```

## References

- [Backlog Chef Source](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef)
- [Backlog Chef Pipeline Architecture](file:///Users/alwin/Projects/github.com/ApexChef/backlog-chef/docs/project/architecture/pipeline-orchestrator-architecture.md)
- [LangChain Docs](https://js.langchain.com/docs/)
