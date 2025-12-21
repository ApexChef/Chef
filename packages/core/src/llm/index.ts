/**
 * LLM Router Module
 *
 * Provides a unified interface for LangChain chat models
 * supporting both Anthropic Claude (cloud) and Ollama (local).
 *
 * @example
 * ```typescript
 * import { LLMRouter } from "./llm";
 *
 * // Create router with defaults (Ollama)
 * const router = new LLMRouter();
 *
 * // Get a model
 * const model = router.getModel();
 *
 * // Use with LangChain
 * const response = await model.invoke("Hello!");
 * ```
 */

// Main class
export { LLMRouter } from "./router.js";

// Types
export type { LLMConfig, LLMProvider } from "./types.js";
export { DEFAULT_CONFIG, DEFAULT_MODELS } from "./types.js";

// Errors
export {
  LLMRouterError,
  ConfigurationError,
  ProviderUnavailableError,
} from "./errors.js";
