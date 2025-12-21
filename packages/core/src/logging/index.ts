/**
 * Structured logging for Chef applications
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

/**
 * Create a structured logger with optional namespace
 */
export function createLogger(namespace?: string): Logger {
  const logLevel = (process.env.LOG_LEVEL || "info") as LogLevel;
  const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  const shouldLog = (level: LogLevel): boolean => {
    return levels[level] >= levels[logLevel];
  };

  const formatMessage = (level: LogLevel, message: string, context?: Record<string, unknown>): string => {
    const timestamp = new Date().toISOString();
    const prefix = namespace ? `[${namespace}]` : "";
    const contextStr = context ? ` ${JSON.stringify(context)}` : "";
    return `${timestamp} ${level.toUpperCase()} ${prefix} ${message}${contextStr}`;
  };

  return {
    debug(message: string, context?: Record<string, unknown>) {
      if (shouldLog("debug")) {
        console.debug(formatMessage("debug", message, context));
      }
    },
    info(message: string, context?: Record<string, unknown>) {
      if (shouldLog("info")) {
        console.info(formatMessage("info", message, context));
      }
    },
    warn(message: string, context?: Record<string, unknown>) {
      if (shouldLog("warn")) {
        console.warn(formatMessage("warn", message, context));
      }
    },
    error(message: string, context?: Record<string, unknown>) {
      if (shouldLog("error")) {
        console.error(formatMessage("error", message, context));
      }
    },
  };
}
