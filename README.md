# Chef

AI-powered productivity tools for agile teams.

## Background

Chef is the modular successor to [backlog-chef](https://github.com/ApexChef/backlog-chef). The original project was refactored to use the LangChain/LangGraph framework, with the architecture redesigned to separate core AI capabilities from specific tools.

The result is a layered system where `@chef/core` provides reusable foundations (LLM routing, RAG, pipeline primitives) and domain-specific tools like `@chef/backlog` are built on top as independent packages. This allows new AI-powered agile tools to be added without duplicating infrastructure.

## Packages

| Package | Description |
|---------|-------------|
| `@chef/core` | Core library - LLM routing, RAG, logging, configuration |
| `@chef/backlog` | Backlog Chef - Meeting-to-PBI pipeline |
| `@chef/cli` | Command-line interface |

## Quick Start

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run CLI
pnpm --filter @chef/cli chef backlog process meeting-notes.txt
```

## CLI Usage

```bash
# Process meeting notes into PBIs
chef backlog process meeting-notes.txt

# Specify output format
chef backlog process meeting-notes.txt --output json

# Use Anthropic instead of Ollama
chef backlog process meeting-notes.txt --provider anthropic
```

## Architecture

```
chef/
├── packages/
│   ├── core/           # @chef/core - Shared utilities
│   └── backlog/        # @chef/backlog - Backlog pipeline
└── apps/
    ├── cli/            # @chef/cli - Command-line interface
    ├── web/            # @chef/web - Web interface (future)
    └── api/            # @chef/api - REST API (future)
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run in development mode
pnpm dev
```

## License

MIT
