/**
 * File: packages/core/src/logger/types.ts
 * Purpose: Type definitions for the Chef logging system
 * Relationships: Used by logger.ts, context.ts, and all components using logger
 * Key Dependencies: pino
 */

import type { Logger as PinoLogger, LoggerOptions, Bindings } from 'pino';

/**
 * Supported log levels (ordered by severity)
 */
export type LogLevel =
  | 'trace'   // Most verbose, diagnostic info
  | 'debug'   // Debugging information
  | 'info'    // General operational messages
  | 'warn'    // Warning conditions
  | 'error'   // Error conditions
  | 'fatal';  // Critical failures

/**
 * Numeric log levels (Pino internal)
 */
export const LogLevels = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60
} as const;

/**
 * File rotation settings
 */
export interface RotationConfig {
  /**
   * Enable log rotation
   * @default true (when toFile=true)
   */
  enabled?: boolean;

  /**
   * Rotation frequency
   * - 'daily': Rotate once per day
   * - 'hourly': Rotate once per hour
   * - '1w': Rotate once per week
   * - '1M': Rotate once per month
   * @default 'daily'
   */
  frequency?: 'daily' | 'hourly' | '1w' | '1M';

  /**
   * Maximum file size before rotation
   * Examples: '50m', '100m', '1g'
   * @default '50m'
   */
  maxSize?: string;

  /**
   * Number of days to retain logs
   * @default 14
   */
  retention?: number;
}

/**
 * Configuration for logger creation
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output
   * @default 'info' (production), 'debug' (development)
   */
  level?: LogLevel;

  /**
   * Enable file logging
   * @default false
   */
  toFile?: boolean;

  /**
   * Path to log file
   * @default './logs/chef.log'
   */
  filePath?: string;

  /**
   * Enable pretty-printing for development
   * Auto-detected from NODE_ENV if not specified
   * @default true (development), false (production)
   */
  pretty?: boolean;

  /**
   * Log rotation configuration
   */
  rotation?: RotationConfig;

  /**
   * Custom logger name
   */
  name?: string;

  /**
   * Enable logger (for testing)
   * @default true
   */
  enabled?: boolean;
}

/**
 * Context for pipeline execution correlation
 */
export interface PipelineContext {
  /**
   * Unique identifier for the pipeline run
   * Format: 'cli-{timestamp}' or 'web-{uuid}'
   */
  threadId: string;

  /**
   * Current pipeline step name (optional)
   * Examples: 'detectEvent', 'extractCandidates', 'riskAnalysis'
   */
  step?: string;
}

/**
 * Re-export Pino types
 */
export type Logger = PinoLogger;
export type { LoggerOptions, Bindings };
