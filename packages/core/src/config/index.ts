/**
 * Configuration management for Chef applications
 */

import { z } from "zod";

/**
 * Base configuration schema that all Chef apps can extend
 */
export const BaseConfigSchema = z.object({
  /** LLM provider: anthropic or ollama */
  llmProvider: z.enum(["anthropic", "ollama"]).default("ollama"),

  /** Model to use (provider-specific) */
  llmModel: z.string().optional(),

  /** Temperature for LLM responses */
  llmTemperature: z.number().min(0).max(2).default(0.7),

  /** Log level */
  logLevel: z.enum(["debug", "info", "warn", "error"]).default("info"),

  /** ChromaDB host for RAG */
  chromaHost: z.string().default("http://localhost:8000"),

  /** Ollama base URL */
  ollamaBaseUrl: z.string().default("http://localhost:11434"),
});

export type BaseConfig = z.infer<typeof BaseConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig<T extends z.ZodType>(
  schema: T,
  prefix = "CHEF"
): z.infer<T> {
  const env = process.env;

  // Map environment variables to config object
  const configFromEnv: Record<string, unknown> = {};

  // Standard mappings
  if (env.LLM_PROVIDER) configFromEnv.llmProvider = env.LLM_PROVIDER;
  if (env.LLM_MODEL) configFromEnv.llmModel = env.LLM_MODEL;
  if (env.LLM_TEMPERATURE) configFromEnv.llmTemperature = parseFloat(env.LLM_TEMPERATURE);
  if (env.LOG_LEVEL) configFromEnv.logLevel = env.LOG_LEVEL;
  if (env.CHROMA_HOST) configFromEnv.chromaHost = env.CHROMA_HOST;
  if (env.OLLAMA_BASE_URL) configFromEnv.ollamaBaseUrl = env.OLLAMA_BASE_URL;

  // Parse and validate
  return schema.parse(configFromEnv);
}

/**
 * Load base configuration
 */
export function loadBaseConfig(): BaseConfig {
  return loadConfig(BaseConfigSchema);
}
