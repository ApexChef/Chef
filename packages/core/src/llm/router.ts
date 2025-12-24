/**
 * LLM Router - Factory for creating LangChain chat models
 *
 * Supports Anthropic Claude (cloud) and Ollama (local) providers
 * with environment-based configuration and per-call overrides.
 */

import { ChatAnthropic } from "@langchain/anthropic";
import { ChatOllama } from "@langchain/ollama";

import {
  type LLMConfig,
  type LLMProvider,
  DEFAULT_CONFIG,
  DEFAULT_MODELS,
} from "./types.js";
import { ConfigurationError, ProviderUnavailableError } from "./errors.js";

/**
 * LLM Router class - creates configured LangChain chat models
 *
 * @example
 * ```typescript
 * // Use defaults (Ollama, llama3.2)
 * const router = new LLMRouter();
 * const model = router.getModel();
 *
 * // Override provider
 * const router = new LLMRouter({ provider: "anthropic" });
 *
 * // Per-call override
 * const model = router.getModel({ temperature: 0 });
 * ```
 */
export class LLMRouter {
  private config: LLMConfig;

  /**
   * Create a new LLM Router
   *
   * @param config - Optional configuration overrides
   */
  constructor(config?: Partial<LLMConfig>) {
    this.config = this.loadConfig(config);
    this.validateConfig();
  }

  /**
   * Load configuration from environment variables and overrides
   */
  private loadConfig(overrides?: Partial<LLMConfig>): LLMConfig {
    // Get provider: explicit env var > override > auto-detect
    const provider = (process.env.LLM_PROVIDER as LLMProvider) ||
      overrides?.provider ||
      this.detectDefaultProvider();

    // Get model from env or default for provider
    const model = process.env.LLM_MODEL ||
      overrides?.model ||
      DEFAULT_MODELS[provider];

    return {
      provider,
      model,
      temperature: overrides?.temperature ?? DEFAULT_CONFIG.temperature,
      maxTokens: overrides?.maxTokens,
    };
  }

  /**
   * Auto-detect the best available provider based on API keys
   *
   * Priority:
   * 1. Anthropic (if ANTHROPIC_API_KEY is set)
   * 2. Ollama (local fallback)
   */
  private detectDefaultProvider(): LLMProvider {
    if (process.env.ANTHROPIC_API_KEY) {
      return "anthropic";
    }
    return "ollama";
  }

  /**
   * Validate configuration - check for required API keys
   */
  private validateConfig(): void {
    if (this.config.provider === "anthropic") {
      if (!process.env.ANTHROPIC_API_KEY) {
        throw new ConfigurationError(
          "ANTHROPIC_API_KEY environment variable is required for Anthropic provider. " +
          "Add it to your .env file or set it in your environment.",
          "ANTHROPIC_API_KEY"
        );
      }
    }
  }

  /**
   * Get the current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Create a chat model with optional per-call overrides
   *
   * @param overrides - Optional configuration overrides for this call
   * @returns A configured ChatAnthropic or ChatOllama instance
   *
   * @example
   * ```typescript
   * // Use default config
   * const model = router.getModel();
   *
   * // Override temperature
   * const model = router.getModel({ temperature: 0 });
   *
   * // Override model
   * const model = router.getModel({ model: "claude-3-opus-20240229" });
   * ```
   */
  getModel(overrides?: Partial<LLMConfig>): ChatAnthropic | ChatOllama {
    const config = {
      ...this.config,
      ...overrides,
    };

    // Re-validate if provider changed
    if (overrides?.provider && overrides.provider !== this.config.provider) {
      if (overrides.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
        throw new ConfigurationError(
          "ANTHROPIC_API_KEY is required for Anthropic provider",
          "ANTHROPIC_API_KEY"
        );
      }
    }

    if (config.provider === "anthropic") {
      return this.createAnthropicModel(config);
    }

    return this.createOllamaModel(config);
  }

  /**
   * Create an Anthropic Claude model
   */
  private createAnthropicModel(config: LLMConfig): ChatAnthropic {
    return new ChatAnthropic({
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }

  /**
   * Create an Ollama model
   */
  private createOllamaModel(config: LLMConfig): ChatOllama {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

    return new ChatOllama({
      model: config.model,
      temperature: config.temperature,
      baseUrl,
    });
  }

  /**
   * Check if the configured provider is available
   *
   * @returns true if the provider is reachable
   */
  async isAvailable(): Promise<boolean> {
    try {
      if (this.config.provider === "ollama") {
        return await this.checkOllamaAvailability();
      }

      if (this.config.provider === "anthropic") {
        return await this.checkAnthropicAvailability();
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if Ollama is running
   */
  private async checkOllamaAvailability(): Promise<boolean> {
    const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if Anthropic API is accessible
   */
  private async checkAnthropicAvailability(): Promise<boolean> {
    // If we have an API key, assume it's available
    // (actual validation happens on first request)
    return !!process.env.ANTHROPIC_API_KEY;
  }

  /**
   * Get information about the current provider
   */
  getProviderInfo(): { provider: LLMProvider; model: string; isLocal: boolean } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      isLocal: this.config.provider === "ollama",
    };
  }
}
