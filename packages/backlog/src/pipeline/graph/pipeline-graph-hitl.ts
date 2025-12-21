/**
 * Pipeline Graph with Human-in-the-Loop
 *
 * LangGraph StateGraph with conditional routing based on
 * confidence scores and human interrupt handling.
 */

import { StateGraph, START, END } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { MemorySaver } from "@langchain/langgraph-checkpoint";

import { PipelineState } from "../state/index.js";
import {
  detectEventNode,
  extractCandidatesNode,
  scoreConfidenceNode,
  routeByScoreNode,
  routeDecision,
  humanApprovalNode,
  requestContextNode,
  rescoreWithContextNode,
  enrichContextNode,
  consolidateDescriptionNode,
  riskAnalysisNode,
  exportPBINode,
} from "./nodes/index.js";

/**
 * Options for creating the HITL pipeline graph
 */
export interface HITLGraphOptions {
  /**
   * Path to SQLite file for persistence.
   * Required for HITL to work (state must survive interrupts).
   */
  checkpointPath?: string;
}

/**
 * Create the pipeline graph with HITL support
 *
 * Flow:
 * ```
 * START → detectEvent → extractCandidates → scoreConfidence → routeByScore
 *                                                                    │
 *                    ┌───────────────────────────────────────────────┤
 *                    │                                               │
 *                    ▼                                               ▼
 *               (enrich) ←──── humanApproval ←──── (interrupt) ←── (approve)
 *                    │              │
 *                    │              ▼
 *                    │        requestContext
 *                    │              │
 *                    │              ▼
 *                    │      rescoreWithContext
 *                    │              │
 *                    │              └───► routeByScore (loop)
 *                    ▼
 *          consolidateDescription
 *                    │
 *                    ▼
 *             riskAnalysis
 *                    │
 *                    ▼
 *               exportPBI
 *                    │
 *                    ▼
 *                   END
 * ```
 *
 * @param options - Graph configuration options
 * @returns Compiled StateGraph ready for invocation
 *
 * @example
 * ```typescript
 * const graph = createPipelineGraphWithHITL({
 *   checkpointPath: "./data/pipeline.sqlite"
 * });
 *
 * // First invocation - may hit interrupt
 * const result = await graph.invoke(
 *   { meetingNotes: "..." },
 *   { configurable: { thread_id: "session-123" } }
 * );
 *
 * // Check for interrupt
 * if (result.pendingInterrupt) {
 *   console.log("Human input needed:", result.pendingInterrupt);
 *   // Later: resume with Command
 * }
 * ```
 */
export function createPipelineGraphWithHITL(options: HITLGraphOptions = {}) {
  // Checkpointer is required for HITL (state must persist across interrupts)
  const checkpointer = options.checkpointPath
    ? SqliteSaver.fromConnString(options.checkpointPath)
    : new MemorySaver();

  // Build the graph with conditional routing
  const builder = new StateGraph(PipelineState)
    // Core pipeline nodes (Steps 1-3)
    .addNode("detectEvent", detectEventNode)
    .addNode("extractCandidates", extractCandidatesNode)
    .addNode("scoreConfidence", scoreConfidenceNode)

    // HITL routing nodes
    .addNode("routeByScore", routeByScoreNode)
    // humanApproval uses Command to route to routeByScore
    .addNode("humanApproval", humanApprovalNode, {
      ends: ["routeByScore"],
    })
    // requestContext uses Command to route to rescoreWithContext
    .addNode("requestContext", requestContextNode, {
      ends: ["rescoreWithContext"],
    })
    .addNode("rescoreWithContext", rescoreWithContextNode)

    // Step 4: Enrichment (placeholder)
    .addNode("enrichContext", enrichContextNode)

    // Step 4.5: Consolidate Description
    .addNode("consolidateDescription", consolidateDescriptionNode)

    // Step 5: Risk Analysis
    .addNode("riskAnalysis", riskAnalysisNode)

    // Step 6: Export PBIs
    .addNode("exportPBI", exportPBINode)

    // Linear edges for core pipeline
    .addEdge(START, "detectEvent")
    .addEdge("detectEvent", "extractCandidates")
    .addEdge("extractCandidates", "scoreConfidence")
    .addEdge("scoreConfidence", "routeByScore")

    // Conditional routing from routeByScore
    .addConditionalEdges("routeByScore", routeDecision, {
      enrich: "enrichContext",
      approval: "humanApproval",
      context: "requestContext",
      done: END,
    })

    // Human approval can go to enrich or request context
    // (handled via Command in the node itself)

    // Rescore loops back to route
    .addEdge("rescoreWithContext", "routeByScore")

    // Post-enrichment pipeline: consolidate → risk → export → END
    .addEdge("enrichContext", "consolidateDescription")
    .addEdge("consolidateDescription", "riskAnalysis")
    .addEdge("riskAnalysis", "exportPBI")
    .addEdge("exportPBI", END);

  // Compile with checkpointer
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return builder.compile({ checkpointer: checkpointer as any });
}

/**
 * Type of the compiled HITL pipeline graph
 */
export type HITLPipelineGraph = ReturnType<typeof createPipelineGraphWithHITL>;
