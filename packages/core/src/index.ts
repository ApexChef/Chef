/**
 * @chef/core - Core library for Chef applications
 *
 * Provides LLM routing, RAG framework, logging, and configuration
 * for all Chef domain packages and interfaces.
 */

// LLM Router
export { LLMRouter } from "./llm/router.js";
export { LLMRouterError, ConfigurationError, ProviderUnavailableError } from "./llm/errors.js";
export type { LLMConfig, LLMProvider } from "./llm/types.js";
export { DEFAULT_CONFIG, DEFAULT_MODELS } from "./llm/types.js";

// RAG Framework
export { RAGRetriever, getRAGRetriever, type RAGRetrieverConfig, type RAGResult } from "./rag/index.js";

// Logging
export { createLogger } from "./logging/index.js";
export type { Logger, LogLevel, LogEntry } from "./logging/index.js";

// Configuration
export { loadConfig, loadBaseConfig, BaseConfigSchema } from "./config/index.js";
export type { BaseConfig } from "./config/index.js";
