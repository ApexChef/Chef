/**
 * Pipeline Graph
 *
 * LangGraph StateGraph implementation of the pipeline.
 * Uses shared state instead of explicit parameter passing.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

import { PipelineState } from "../state/index.js";
import {
  detectEventNode,
  extractCandidatesNode,
  scoreConfidenceNode,
} from "./nodes/index.js";

/**
 * Options for creating the pipeline graph
 */
export interface GraphOptions {
  /**
   * Path to SQLite file for persistence.
   * If not provided, uses in-memory storage (no persistence).
   */
  checkpointPath?: string;
}

/**
 * Create the pipeline graph
 *
 * @param options - Graph configuration options
 * @returns Compiled StateGraph ready for invocation
 *
 * @example
 * ```typescript
 * // Without persistence (testing)
 * const graph = createPipelineGraph();
 *
 * // With SQLite persistence
 * const graph = createPipelineGraph({
 *   checkpointPath: "./data/pipeline.sqlite"
 * });
 *
 * // Invoke with thread ID
 * const result = await graph.invoke(
 *   { meetingNotes: "..." },
 *   { configurable: { thread_id: "session-123" } }
 * );
 * ```
 */
export function createPipelineGraph(options: GraphOptions = {}) {
  // Create checkpointer based on options
  const checkpointer = options.checkpointPath
    ? SqliteSaver.fromConnString(options.checkpointPath)
    : new MemorySaver();

  // Build the graph
  const builder = new StateGraph(PipelineState)
    // Add nodes
    .addNode("detectEvent", detectEventNode)
    .addNode("extractCandidates", extractCandidatesNode)
    .addNode("scoreConfidence", scoreConfidenceNode)
    // Add edges (linear flow for now)
    .addEdge(START, "detectEvent")
    .addEdge("detectEvent", "extractCandidates")
    .addEdge("extractCandidates", "scoreConfidence")
    .addEdge("scoreConfidence", END);

  // Compile with checkpointer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return builder.compile({ checkpointer: checkpointer as any });
}

/**
 * Type of the compiled pipeline graph
 */
export type PipelineGraph = ReturnType<typeof createPipelineGraph>;
