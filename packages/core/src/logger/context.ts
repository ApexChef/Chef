/**
 * File: packages/core/src/logger/context.ts
 * Purpose: AsyncLocalStorage-based context propagation for thread IDs and step names
 * Relationships: Provides context to all logger calls within pipeline execution
 * Key Dependencies: async_hooks (Node.js native), factory.ts
 */

import { AsyncLocalStorage } from 'async_hooks';
import { Logger } from 'pino';
import { getLogger } from './factory.js';
import { PipelineContext } from './types.js';

/**
 * AsyncLocalStorage instance for pipeline context
 */
const pipelineContext = new AsyncLocalStorage<PipelineContext>();

/**
 * Get the current pipeline context from AsyncLocalStorage
 *
 * Returns undefined if called outside a pipeline context.
 *
 * @returns Current pipeline context or undefined
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   const ctx = getContext();
 *   console.log(ctx?.threadId);  // 'cli-1703251200000'
 * });
 * ```
 */
export function getContext(): PipelineContext | undefined {
  return pipelineContext.getStore();
}

/**
 * Get a logger with current pipeline context
 *
 * Returns a child logger with threadId and step bindings from
 * AsyncLocalStorage. If no context is available, returns the base logger.
 *
 * @returns Pino logger with context bindings
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Processing');  // Includes threadId
 *
 *   await runStep('detectEvent', async () => {
 *     const stepLogger = getContextLogger();
 *     stepLogger.info('Detecting');  // Includes threadId + step
 *   });
 * });
 * ```
 */
export function getContextLogger(): Logger {
  const context = getContext();
  if (context) {
    return getLogger().child(context);
  }
  return getLogger();
}

/**
 * Execute a function with custom context
 *
 * Low-level API for custom context scenarios. Prefer runPipeline()
 * and runStep() for standard usage.
 *
 * @template T - Return type of the function
 * @param context - Custom pipeline context
 * @param fn - Async function to execute with context
 * @returns Promise resolving to function result
 *
 * @example
 * ```typescript
 * await runWithContext({ threadId: 'custom-123', step: 'custom' }, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Custom context');
 * });
 * ```
 */
export async function runWithContext<T>(
  context: PipelineContext,
  fn: () => Promise<T>
): Promise<T> {
  return pipelineContext.run(context, fn);
}

/**
 * Execute a function with pipeline context (thread ID)
 *
 * Sets up AsyncLocalStorage with the thread ID. All async operations
 * within the function will have access to this context via getContextLogger().
 *
 * @template T - Return type of the function
 * @param threadId - Unique identifier for this pipeline run
 * @param fn - Async function to execute with context
 * @returns Promise resolving to function result
 *
 * @example
 * ```typescript
 * const threadId = `cli-${Date.now()}`;
 *
 * await runPipeline(threadId, async () => {
 *   const logger = getContextLogger();
 *   logger.info('Pipeline started');  // Includes threadId
 *
 *   await processSteps();
 *
 *   logger.info('Pipeline completed');
 * });
 * ```
 */
export async function runPipeline<T>(
  threadId: string,
  fn: () => Promise<T>
): Promise<T> {
  return runWithContext({ threadId }, fn);
}

/**
 * Execute a function with step context
 *
 * Must be called within a runPipeline() context. Updates the context
 * to include the step name. Nested runStep() calls update the step name.
 *
 * @template T - Return type of the function
 * @param stepName - Name of the pipeline step
 * @param fn - Async function to execute with step context
 * @returns Promise resolving to function result
 *
 * @throws {Error} If called outside pipeline context
 *
 * @example
 * ```typescript
 * await runPipeline(threadId, async () => {
 *   await runStep('detectEvent', async () => {
 *     const logger = getContextLogger();
 *     logger.info('Detecting event');  // threadId + step
 *   });
 *
 *   await runStep('extractCandidates', async () => {
 *     const logger = getContextLogger();
 *     logger.info('Extracting');  // threadId + new step
 *   });
 * });
 * ```
 */
export async function runStep<T>(
  stepName: string,
  fn: () => Promise<T>
): Promise<T> {
  const context = getContext();
  if (!context) {
    throw new Error('runStep called outside pipeline context. Must be called within runPipeline()');
  }

  const stepContext: PipelineContext = { ...context, step: stepName };
  return pipelineContext.run(stepContext, fn);
}
