/**
 * Custom error classes for LLM Router
 */

import type { LLMProvider } from "./types.js";

/**
 * Base error class for LLM Router errors
 */
export class LLMRouterError extends Error {
  constructor(
    message: string,
    public readonly provider?: LLMProvider
  ) {
    super(message);
    this.name = "LLMRouterError";
  }
}

/**
 * Error thrown when required configuration is missing
 */
export class ConfigurationError extends LLMRouterError {
  constructor(
    message: string,
    public readonly missingKey: string
  ) {
    super(message);
    this.name = "ConfigurationError";
  }
}

/**
 * Error thrown when a provider is not available
 */
export class ProviderUnavailableError extends LLMRouterError {
  constructor(
    provider: LLMProvider,
    public readonly reason: string
  ) {
    super(`Provider '${provider}' is unavailable: ${reason}`, provider);
    this.name = "ProviderUnavailableError";
  }
}
