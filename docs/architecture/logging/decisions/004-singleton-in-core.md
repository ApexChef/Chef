# ADR-004: Logger Singleton in @chef/core

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Architecture Phase
**Related**: PBI-LOGGING-001

## Context

The Chef monorepo has multiple packages (@chef/core, @chef/backlog, @chef/cli, @chef/web). The logger must be accessible across all packages while ensuring:
- Single logger configuration
- Consistent log output format
- No circular dependencies
- Easy to test and mock

## Decision

Implement logger as a **singleton in @chef/core** with factory function pattern.

## Rationale

### Package Hierarchy

Chef's dependency graph:
```
@chef/core  (no @chef dependencies)
    ↑
    ├── @chef/backlog (depends on core)
    ↑
    ├── @chef/cli (depends on core + backlog)
    └── @chef/web (depends on core + backlog)
```

**@chef/core is the natural location** because:
1. No dependencies on other @chef packages
2. All packages already depend on core
3. Avoids circular dependencies

### Singleton Pattern

```typescript
// @chef/core/logger/factory.ts
import pino from 'pino';

let instance: pino.Logger | null = null;

export function getLogger(): pino.Logger {
  if (!instance) {
    instance = createLogger();
  }
  return instance;
}

export function createLogger(config?: LoggerConfig): pino.Logger {
  return pino(buildConfig(config));
}

// For testing
export function resetLogger(): void {
  instance = null;
}
```

**Benefits**:
- Single source of truth for configuration
- Lazy initialization
- Consistent logger instance across packages
- Easy to reset for testing

### Comparison with Alternatives

#### Alternative 1: Logger per Package

Each package creates its own logger:
```typescript
// @chef/backlog/logger.ts
export const logger = pino();
```

**Pros**: Package isolation

**Cons**:
- Inconsistent configuration
- Multiple logger instances
- Duplication of config code

**Decision**: Singleton ensures consistency.

#### Alternative 2: Dependency Injection

Pass logger as parameter everywhere:
```typescript
function processCandidate(candidate: Candidate, logger: pino.Logger) {
  // ...
}
```

**Pros**: Explicit, testable

**Cons**:
- Invasive API changes
- Clutters function signatures
- Difficult retrofit

**Decision**: Singleton with getLogger() is simpler.

#### Alternative 3: Global Export

```typescript
// @chef/core/logger.ts
export const logger = pino();
```

**Pros**: Simple

**Cons**:
- Initialized at module load (before config available)
- Cannot reset for testing
- Cannot reconfigure

**Decision**: Factory pattern provides more control.

## Implementation

### Public API

```typescript
// @chef/core/logger/index.ts
export { getLogger, createLogger, resetLogger } from './factory';
export { getContextLogger, runPipeline, runStep } from './context';
export type { Logger, LoggerConfig, PipelineContext } from './types';
```

### Usage Across Packages

```typescript
// In @chef/backlog
import { getLogger } from '@chef/core/logger';

const logger = getLogger();
logger.info('Backlog processing');

// In @chef/cli
import { getLogger, runPipeline } from '@chef/core/logger';

const logger = getLogger();
logger.info('CLI started');

await runPipeline(threadId, async () => {
  // Pipeline code
});

// In @chef/web
import { getLogger } from '@chef/core/logger';

const logger = getLogger();
logger.info({ port }, 'Server started');
```

### Testing

```typescript
import { getLogger, resetLogger } from '@chef/core/logger';
import { afterEach } from 'vitest';

afterEach(() => {
  resetLogger();  // Ensure fresh logger per test
});

it('logs correctly', () => {
  const logger = getLogger();
  logger.info('test');
  // Assert on log output
});
```

## Consequences

### Positive

1. **Single Configuration**: All packages use same logger config
2. **No Duplication**: Logger code in one place
3. **Type Safety**: Shared types across packages
4. **Testability**: Easy to reset and mock
5. **Consistency**: Same log format everywhere

### Negative

1. **Global State**: Singleton is global (mitigated by proper testing practices)
2. **Configuration Timing**: Must initialize before first use (mitigated by lazy init)

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Singleton anti-pattern | Acceptable for cross-cutting concerns like logging |
| Configuration conflicts | Single initialization point at app startup |
| Test isolation | `resetLogger()` function for test cleanup |

## Validation

### Acceptance Criteria

- [ ] Logger accessible from all @chef packages
- [ ] Single logger instance across packages
- [ ] Configuration applied consistently
- [ ] Easy to reset for testing
- [ ] No circular dependencies

## References

- [Singleton Pattern](https://refactoring.guru/design-patterns/singleton)
- [Chef Package Architecture](/Users/alwin/Projects/github.com/ApexChef/Chef/CLAUDE.md)

## Review and Approval

- Architecture Phase: Accepted
