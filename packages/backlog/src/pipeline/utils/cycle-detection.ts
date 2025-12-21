/**
 * Cycle Detection Utility
 *
 * Detects cycles in the dependency graph and provides cleanup options.
 * Uses DFS-based cycle detection algorithm.
 */

import type { Dependency, CycleDetectionResult } from "../../schemas/index.js";

/**
 * Build adjacency list from dependencies
 */
function buildAdjacencyList(dependencies: Dependency[]): Map<string, string[]> {
  const graph = new Map<string, string[]>();

  for (const dep of dependencies) {
    if (!graph.has(dep.source)) {
      graph.set(dep.source, []);
    }
    graph.get(dep.source)!.push(dep.target);
  }

  return graph;
}

/**
 * Detect cycles in dependency graph using DFS
 *
 * @param dependencies - Array of dependencies to analyze
 * @returns Object containing:
 *   - hasCycles: boolean indicating if cycles were found
 *   - cycles: array of cycles, each cycle is an array of PBI IDs
 *   - cleanedDependencies: dependencies with cycle-causing edges removed or downgraded
 */
export function detectCycles(dependencies: Dependency[]): CycleDetectionResult {
  const graph = buildAdjacencyList(dependencies);
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const pathStack: string[] = [];

  /**
   * DFS to detect cycles
   */
  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    pathStack.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Cycle detected - extract the cycle path
        const cycleStartIndex = pathStack.indexOf(neighbor);
        if (cycleStartIndex !== -1) {
          const cycle = pathStack.slice(cycleStartIndex);
          cycle.push(neighbor); // Complete the cycle
          cycles.push(cycle);
        }
      }
    }

    pathStack.pop();
    recursionStack.delete(node);
  }

  // Run DFS from all nodes
  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  // If cycles found, clean up the dependencies
  const cleanedDependencies = cleanCycles(dependencies, cycles);

  return {
    hasCycles: cycles.length > 0,
    cycles,
    cleanedDependencies,
  };
}

/**
 * Clean up dependencies by removing or downgrading cycle-causing edges
 *
 * Strategy:
 * 1. For each cycle, identify the "back edge" (edge pointing to an earlier node)
 * 2. If the edge type is "blocks", downgrade to "relates-to"
 * 3. If already "relates-to" or "extends", remove the edge
 */
function cleanCycles(dependencies: Dependency[], cycles: string[][]): Dependency[] {
  if (cycles.length === 0) {
    return dependencies;
  }

  // Collect edges that need to be modified
  const edgesToDowngrade = new Set<string>(); // "source->target" format
  const edgesToRemove = new Set<string>();

  for (const cycle of cycles) {
    if (cycle.length < 2) continue;

    // The back edge is the last edge in the cycle (from last to first node)
    const lastNode = cycle[cycle.length - 2];
    const firstNode = cycle[cycle.length - 1];
    const backEdge = `${lastNode}->${firstNode}`;

    // Find the dependency for this edge
    const dep = dependencies.find((d) => d.source === lastNode && d.target === firstNode);

    if (dep) {
      if (dep.type === "blocks") {
        edgesToDowngrade.add(backEdge);
      } else {
        edgesToRemove.add(backEdge);
      }
    }
  }

  // Apply modifications
  return dependencies
    .filter((d) => !edgesToRemove.has(`${d.source}->${d.target}`))
    .map((d) => {
      const edgeKey = `${d.source}->${d.target}`;
      if (edgesToDowngrade.has(edgeKey)) {
        console.warn(
          `[CycleDetection] Downgrading blocking dependency ${d.source} -> ${d.target} to relates-to (cycle detected)`
        );
        return {
          ...d,
          type: "relates-to" as const,
          reason: `${d.reason} [MODIFIED: Originally blocking, downgraded due to cycle]`,
        };
      }
      return d;
    });
}

/**
 * Validate dependencies are acyclic
 *
 * @param dependencies - Array of dependencies to validate
 * @returns true if no cycles, false if cycles exist
 */
export function validateDependencies(dependencies: Dependency[]): boolean {
  const result = detectCycles(dependencies);
  return !result.hasCycles;
}

/**
 * Get topological order of PBIs based on dependencies
 *
 * @param candidateIds - Array of all candidate IDs
 * @param dependencies - Array of dependencies
 * @returns Ordered array of candidate IDs (or null if cycle exists)
 */
export function getTopologicalOrder(
  candidateIds: string[],
  dependencies: Dependency[]
): string[] | null {
  // Build in-degree map and adjacency list
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();

  // Initialize all candidates with 0 in-degree
  for (const id of candidateIds) {
    inDegree.set(id, 0);
    adjacency.set(id, []);
  }

  // Build graph - dependency source depends on target
  // So target should come before source
  for (const dep of dependencies) {
    if (dep.type === "blocks") {
      // source depends on target, so source comes after target
      const currentInDegree = inDegree.get(dep.source) || 0;
      inDegree.set(dep.source, currentInDegree + 1);

      const neighbors = adjacency.get(dep.target) || [];
      neighbors.push(dep.source);
      adjacency.set(dep.target, neighbors);
    }
  }

  // Kahn's algorithm for topological sort
  const queue: string[] = [];
  const result: string[] = [];

  // Add all nodes with 0 in-degree to queue
  for (const [id, degree] of inDegree) {
    if (degree === 0) {
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    const neighbors = adjacency.get(node) || [];
    for (const neighbor of neighbors) {
      const newDegree = (inDegree.get(neighbor) || 1) - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If result doesn't contain all nodes, there's a cycle
  if (result.length !== candidateIds.length) {
    return null;
  }

  return result;
}

/**
 * Determine which candidates can be parallelized
 *
 * A candidate can be parallelized if it has no blocking dependencies
 * (no "blocks" type dependencies where this candidate is the source)
 *
 * @param candidateId - ID of the candidate to check
 * @param dependencies - Array of all dependencies
 * @returns true if candidate can be worked on in parallel
 */
export function canParallelize(candidateId: string, dependencies: Dependency[]): boolean {
  // Check if this candidate has any blocking dependencies
  const blockingDeps = dependencies.filter(
    (d) => d.source === candidateId && d.type === "blocks"
  );

  return blockingDeps.length === 0;
}
