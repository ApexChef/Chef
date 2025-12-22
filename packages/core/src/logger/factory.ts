/**
 * File: packages/core/src/logger/factory.ts
 * Purpose: Logger factory with singleton pattern and environment-based configuration
 * Relationships: Core logger creation, used by all components
 * Key Dependencies: pino, pino-pretty (dev), pino-roll (rotation)
 */

import pino, { Logger, LoggerOptions } from 'pino';
import path from 'path';
import { LoggerConfig, LogLevel } from './types.js';

/**
 * Singleton logger instance
 */
let instance: Logger | null = null;

/**
 * Build transport configuration based on environment and config
 */
function buildTransportConfig(config: Required<Omit<LoggerConfig, 'name'>> & { name?: string }): LoggerOptions['transport'] {
  const targets: any[] = [];

  // File transport with rotation
  if (config.toFile && config.rotation.enabled) {
    targets.push({
      target: 'pino-roll',
      level: 'info',
      options: {
        file: path.resolve(config.filePath),
        frequency: config.rotation.frequency || 'daily',
        size: config.rotation.maxSize || '50m',
        mkdir: true,
        symlink: true,
        limit: { count: config.rotation.retention || 14 }
      }
    });
  }

  // Console transport (pretty or JSON)
  if (config.pretty) {
    targets.push({
      target: 'pino-pretty',
      level: config.level,
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
        singleLine: false
      }
    });
  } else {
    // Standard JSON output to stdout
    targets.push({
      target: 'pino/file',
      level: config.level,
      options: {
        destination: 1 // stdout
      }
    });
  }

  // Return multi-transport configuration if we have targets
  if (targets.length > 1) {
    return { targets };
  } else if (targets.length === 1) {
    return targets[0];
  }

  return undefined;
}

/**
 * Resolve configuration from environment and provided config
 */
function resolveConfig(config?: LoggerConfig): Required<Omit<LoggerConfig, 'name'>> & { name?: string } {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const isTest = process.env.NODE_ENV === 'test';

  return {
    level: (config?.level || process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')) as LogLevel,
    toFile: config?.toFile ?? (process.env.LOG_TO_FILE === 'true'),
    filePath: config?.filePath || process.env.LOG_FILE_PATH || './logs/chef.log',
    pretty: config?.pretty ?? (isDevelopment && !process.env.CI),
    rotation: {
      enabled: config?.rotation?.enabled ?? true,
      frequency: config?.rotation?.frequency || 'daily',
      maxSize: config?.rotation?.maxSize || '50m',
      retention: config?.rotation?.retention || 14
    },
    name: config?.name,
    enabled: config?.enabled ?? !isTest
  };
}

/**
 * Create a new logger with custom configuration
 *
 * Does not affect the singleton instance. Use for testing or
 * specialized logging scenarios.
 *
 * @param config - Optional configuration overrides
 * @returns Pino logger instance
 *
 * @example
 * ```typescript
 * // Custom logger for testing
 * const testLogger = createLogger({ level: 'silent', enabled: false });
 *
 * // Debug logger
 * const debugLogger = createLogger({ level: 'debug', pretty: true });
 * ```
 */
export function createLogger(config?: LoggerConfig): Logger {
  const resolvedConfig = resolveConfig(config);

  // Test mode: silent logging
  if (!resolvedConfig.enabled) {
    return pino({ level: 'silent', enabled: false });
  }

  // Build transport configuration
  const transport = buildTransportConfig(resolvedConfig);

  const options: LoggerOptions = {
    level: resolvedConfig.level,
    timestamp: pino.stdTimeFunctions.isoTime
  };

  // Add logger name if specified
  if (resolvedConfig.name !== undefined) {
    options.name = resolvedConfig.name;
  }

  // Only add formatters when NOT using transports (they're incompatible)
  if (!transport) {
    options.formatters = {
      level: (label) => ({ level: label.toUpperCase() }),
      bindings: (bindings) => ({
        pid: bindings.pid,
        hostname: bindings.hostname
      })
    };
  }

  if (transport) {
    options.transport = transport;
  }

  return pino(options);
}

/**
 * Get the singleton logger instance
 *
 * Lazily creates logger on first call using environment configuration.
 * Subsequent calls return the same instance.
 *
 * @param config - Optional configuration (only used on first call)
 * @returns Pino logger instance
 *
 * @example
 * ```typescript
 * import { getLogger } from '@chef/core/logger';
 *
 * const logger = getLogger();
 * logger.info('Application started');
 * logger.error({ err }, 'Operation failed');
 * ```
 */
export function getLogger(config?: LoggerConfig): Logger {
  if (!instance) {
    instance = createLogger(config);
  }
  return instance;
}

/**
 * Reset the singleton logger instance
 *
 * Primarily for testing. Clears the singleton so the next call to
 * getLogger() will create a fresh instance.
 *
 * @example
 * ```typescript
 * import { afterEach } from 'vitest';
 * import { resetLogger } from '@chef/core/logger';
 *
 * afterEach(() => {
 *   resetLogger();  // Fresh logger per test
 * });
 * ```
 */
export function resetLogger(): void {
  instance = null;
}
