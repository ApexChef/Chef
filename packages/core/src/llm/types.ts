/**
 * Type definitions for LLM Router
 */

/**
 * Supported LLM providers
 */
export type LLMProvider = "anthropic" | "ollama";

/**
 * Configuration for LLM Router
 */
export interface LLMConfig {
  /** The LLM provider to use */
  provider: LLMProvider;

  /** Model identifier (e.g., "llama3.2", "claude-3-5-sonnet-20241022") */
  model: string;

  /** Temperature for response randomness (0-1) */
  temperature: number;

  /** Maximum tokens in response (optional) */
  maxTokens?: number;
}

/**
 * Default models for each provider
 */
export const DEFAULT_MODELS: Record<LLMProvider, string> = {
  ollama: "llama3.2:1b",
  anthropic: "claude-sonnet-4-20250514",
};

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: LLMConfig = {
  provider: "ollama",
  model: DEFAULT_MODELS.ollama,
  temperature: 0.7,
};
