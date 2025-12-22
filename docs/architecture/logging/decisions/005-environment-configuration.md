# ADR-005: Environment-Based Configuration

**Status**: Accepted
**Date**: 2025-12-22
**Deciders**: Architecture Phase
**Related**: PBI-LOGGING-001

## Context

Logger behavior must be configurable across different environments (development, production, testing) and deployment targets (CLI, web). Configuration needs include:
- Log level (DEBUG, INFO, WARN, ERROR)
- Output targets (console, file)
- Format (pretty vs JSON)
- Rotation settings
- Transport-specific settings

## Decision

Use **environment variables** as the primary configuration mechanism with **sensible defaults** and **runtime overrides**.

## Rationale

### Environment Variables as Configuration

```bash
# .env
LOG_LEVEL=info
LOG_TO_FILE=true
LOG_FILE_PATH=./logs/chef.log
NODE_ENV=production
```

**Benefits**:
- **12-Factor App**: Standard configuration pattern
- **Container-Friendly**: Easy to set in Docker, Kubernetes
- **No Code Changes**: Different configs without redeployment
- **Security**: Secrets not in code
- **Override Hierarchy**: ENV > Config File > Defaults

### Configuration Schema

```typescript
interface LoggerConfig {
  // Core settings
  level?: 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

  // Output control
  toFile?: boolean;
  filePath?: string;

  // Format
  pretty?: boolean;  // Auto-detect from NODE_ENV if not specified

  // Rotation
  rotation?: {
    enabled?: boolean;
    frequency?: 'daily' | 'hourly' | '1w' | '1M';
    maxSize?: string;  // '50m', '100m'
    retention?: number;  // Days to keep
  };
}
```

### Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `NODE_ENV` | string | development | Environment mode |
| `LOG_LEVEL` | string | info (prod), debug (dev) | Minimum log level |
| `LOG_TO_FILE` | boolean | false | Enable file logging |
| `LOG_FILE_PATH` | string | ./logs/chef.log | Log file location |
| `LOG_ROTATION` | boolean | true | Enable rotation |
| `LOG_ROTATION_FREQ` | string | daily | Rotation frequency |
| `LOG_ROTATION_SIZE` | string | 50m | Max file size |
| `LOG_RETENTION_DAYS` | number | 14 | Days to keep logs |

### Configuration Priority

1. **Runtime Override**: Passed to `createLogger(config)`
2. **Environment Variables**: From `.env` or system
3. **Defaults**: Sensible defaults per environment

```typescript
export function createLogger(config?: LoggerConfig): pino.Logger {
  const isDev = process.env.NODE_ENV === 'development';

  const finalConfig: LoggerConfig = {
    // Defaults
    level: isDev ? 'debug' : 'info',
    pretty: isDev,
    toFile: false,

    // Environment variables
    ...loadFromEnv(),

    // Runtime overrides
    ...config
  };

  return pino(buildPinoConfig(finalConfig));
}
```

### Per-Environment Defaults

#### Development

```typescript
// Automatic when NODE_ENV=development
{
  level: 'debug',
  pretty: true,
  toFile: false,
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
}
```

#### Production

```typescript
// Automatic when NODE_ENV=production
{
  level: 'info',
  pretty: false,
  toFile: true,
  filePath: '/var/log/chef/chef.log',
  rotation: {
    enabled: true,
    frequency: 'daily',
    maxSize: '50m',
    retention: 14
  }
}
```

#### Testing

```typescript
// Automatic when NODE_ENV=test
{
  level: 'silent',  // No logs in tests by default
  enabled: false
}
```

### Comparison with Alternatives

#### Alternative 1: Config File (JSON/YAML)

```yaml
# logger.yaml
level: info
outputs:
  - type: console
  - type: file
    path: ./logs/chef.log
```

**Pros**: Structured, version-controlled

**Cons**:
- Less flexible than env vars
- Harder to override in containers
- File management complexity

**Decision**: Env vars more flexible.

#### Alternative 2: Code Configuration

```typescript
const logger = createLogger({
  level: 'info',
  outputs: [console, file]
});
```

**Pros**: Type-safe, explicit

**Cons**:
- Requires code changes for config
- Not container-friendly
- Harder to manage per-environment

**Decision**: Env vars separate config from code.

#### Alternative 3: Hybrid (Config File + Env Vars)

**Pros**: Best of both worlds

**Cons**:
- More complexity
- Multiple sources of truth

**Decision**: Env vars sufficient for Chef's needs.

## Implementation

### Configuration Loader

```typescript
// @chef/core/logger/config.ts
import { z } from 'zod';

const logLevelSchema = z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']);

const loggerConfigSchema = z.object({
  level: logLevelSchema.default('info'),
  toFile: z.boolean().default(false),
  filePath: z.string().default('./logs/chef.log'),
  pretty: z.boolean().optional(),
  rotation: z.object({
    enabled: z.boolean().default(true),
    frequency: z.enum(['daily', 'hourly', '1w', '1M']).default('daily'),
    maxSize: z.string().default('50m'),
    retention: z.number().default(14)
  }).optional()
});

export type LoggerConfig = z.infer<typeof loggerConfigSchema>;

export function loadConfigFromEnv(): LoggerConfig {
  return loggerConfigSchema.parse({
    level: process.env.LOG_LEVEL,
    toFile: process.env.LOG_TO_FILE === 'true',
    filePath: process.env.LOG_FILE_PATH,
    rotation: {
      enabled: process.env.LOG_ROTATION !== 'false',
      frequency: process.env.LOG_ROTATION_FREQ,
      maxSize: process.env.LOG_ROTATION_SIZE,
      retention: process.env.LOG_RETENTION_DAYS ? parseInt(process.env.LOG_RETENTION_DAYS) : undefined
    }
  });
}
```

### Usage

```typescript
// Automatic (uses env vars + defaults)
const logger = getLogger();

// Override for testing
const testLogger = createLogger({ level: 'silent' });

// Override specific settings
const debugLogger = createLogger({ level: 'debug', pretty: true });
```

## Consequences

### Positive

1. **Flexibility**: Easy to configure per environment
2. **Container-Friendly**: Standard ENV var pattern
3. **No Code Changes**: Config without redeployment
4. **Validation**: Zod schema ensures valid config
5. **Sensible Defaults**: Works out-of-box

### Negative

1. **Discovery**: Env vars not self-documenting (mitigated by docs)
2. **Type Safety**: Env vars are strings (mitigated by Zod)

### Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Invalid env var values | Zod validation with clear error messages |
| Missing env vars | Sensible defaults |
| Env var naming conflicts | Use LOG_ prefix |

## Validation

### Acceptance Criteria

- [ ] Logger configurable via environment variables
- [ ] Sensible defaults per NODE_ENV
- [ ] Config validation with clear errors
- [ ] Runtime override capability
- [ ] All env vars documented

### .env.example

```bash
# Logging Configuration

# Environment
NODE_ENV=development  # development | production | test

# Log Level
LOG_LEVEL=info  # trace | debug | info | warn | error | fatal

# File Logging
LOG_TO_FILE=false
LOG_FILE_PATH=./logs/chef.log

# Log Rotation
LOG_ROTATION=true
LOG_ROTATION_FREQ=daily  # daily | hourly | 1w | 1M
LOG_ROTATION_SIZE=50m
LOG_RETENTION_DAYS=14
```

## References

- [12-Factor App: Config](https://12factor.net/config)
- [Zod Validation](https://zod.dev/)
- [PBI-LOGGING-001](/Users/alwin/Projects/github.com/ApexChef/Chef/docs/backlog/active/PBI-LOGGING-001.md)

## Review and Approval

- Architecture Phase: Accepted
