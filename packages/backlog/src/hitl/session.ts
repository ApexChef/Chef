/**
 * HITLSession - Human-in-the-Loop Session Manager
 *
 * Manages HITL pipeline sessions, handling interrupts, approvals,
 * and context requests. This is the core logic that can be used
 * by any interface (CLI, Web, API).
 */

import { Command } from "@langchain/langgraph";
import {
  createPipelineGraphWithHITL,
  type HITLPipelineGraph,
  type PipelineStateType,
  type ApprovalInterruptPayload,
  type ContextInterruptPayload,
} from "../pipeline/index.js";
import {
  getScoreLabel,
  type ApprovalResponse,
  type ContextResponse,
} from "../constants/thresholds.js";

/**
 * Pending approval information for display
 */
export interface PendingApprovalInfo {
  candidateId: string;
  title: string;
  score: number;
  scoreLabel: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
}

/**
 * Pending context request information for display
 */
export interface PendingContextInfo {
  candidateId: string;
  title: string;
  score: number;
  currentDescription: string;
  missingElements: string[];
  specificQuestions: string[];
}

/**
 * Session status
 */
export type SessionStatus =
  | "idle"
  | "running"
  | "awaiting_approval"
  | "awaiting_context"
  | "completed"
  | "error";

/**
 * HITL Session options
 */
export interface HITLSessionOptions {
  checkpointPath: string;
  threadId?: string;
}

/**
 * HITLSession manages the lifecycle of a HITL pipeline run
 */
export class HITLSession {
  private graph: HITLPipelineGraph;
  private threadId: string;
  private checkpointPath: string;
  private state: PipelineStateType | null = null;
  private status: SessionStatus = "idle";

  constructor(options: HITLSessionOptions) {
    this.checkpointPath = options.checkpointPath;
    this.threadId = options.threadId || `hitl-${Date.now()}`;
    this.graph = createPipelineGraphWithHITL({
      checkpointPath: options.checkpointPath,
    });
  }

  /**
   * Get current thread ID
   */
  getThreadId(): string {
    return this.threadId;
  }

  /**
   * Get current status
   */
  getStatus(): SessionStatus {
    return this.status;
  }

  /**
   * Get current state
   */
  getState(): PipelineStateType | null {
    return this.state;
  }

  /**
   * Load existing state from checkpoint
   *
   * Uses direct SQLite query to avoid LangGraph internal issues
   */
  async loadState(): Promise<PipelineStateType | null> {
    try {
      // Use direct SQLite query to get the latest checkpoint
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(this.checkpointPath, { readonly: true });

      const row = db.prepare(`
        SELECT checkpoint
        FROM checkpoints
        WHERE thread_id = ?
        ORDER BY checkpoint_id DESC
        LIMIT 1
      `).get(this.threadId) as { checkpoint: Buffer | string } | undefined;

      db.close();

      if (!row) {
        return null;
      }

      // Parse checkpoint
      let checkpoint: { channel_values?: PipelineStateType };
      try {
        const data = Buffer.isBuffer(row.checkpoint)
          ? row.checkpoint.toString("utf-8")
          : row.checkpoint;
        checkpoint = JSON.parse(data);
      } catch {
        return null;
      }

      const values = checkpoint?.channel_values;
      if (!values || typeof values !== "object") {
        return null;
      }

      this.state = values as PipelineStateType;

      // Determine status based on state
      if (this.state.pendingInterrupt) {
        this.status =
          this.state.pendingInterrupt.type === "approval"
            ? "awaiting_approval"
            : "awaiting_context";
      } else if (this.state.exportedPBIs && this.state.exportedPBIs.length > 0) {
        this.status = "completed";
      }

      return this.state;
    } catch (error) {
      // Log error for debugging
      if (error instanceof Error) {
        console.error("[HITLSession] Failed to load state:", error.message);
      }
      return null;
    }
  }

  /**
   * Start a new pipeline run
   */
  async start(meetingNotes: string): Promise<PipelineStateType> {
    this.status = "running";

    try {
      this.state = (await this.graph.invoke(
        { meetingNotes },
        { configurable: { thread_id: this.threadId } }
      )) as PipelineStateType;

      this.updateStatusFromState();
      return this.state;
    } catch (error) {
      this.status = "error";
      throw error;
    }
  }

  /**
   * Check if approval is pending
   */
  isAwaitingApproval(): boolean {
    return this.status === "awaiting_approval";
  }

  /**
   * Check if context is pending
   */
  isAwaitingContext(): boolean {
    return this.status === "awaiting_context";
  }

  /**
   * Get pending approval info for display
   */
  getPendingApprovals(): PendingApprovalInfo[] {
    if (!this.state?.pendingInterrupt || this.state.pendingInterrupt.type !== "approval") {
      return [];
    }

    const candidateIds = this.state.pendingInterrupt.candidateIds;

    return candidateIds.map((id) => {
      const scored = this.state!.scoredCandidates?.find((c) => c.candidateId === id);
      const candidate = this.state!.candidates?.find((c) => c.id === id);
      const pbiStatus = this.state!.pbiStatuses?.find((s) => s.candidateId === id);

      const score = pbiStatus?.score ?? scored?.overallScore ?? 0;

      return {
        candidateId: id,
        title: candidate?.title ?? "Unknown",
        score,
        scoreLabel: getScoreLabel(score),
        strengths: scored?.strengths ?? [],
        concerns: scored?.concerns ?? [],
        recommendations: scored?.recommendations ?? [],
      };
    });
  }

  /**
   * Get pending context request info for display
   */
  getPendingContextRequests(): PendingContextInfo[] {
    if (!this.state?.pendingInterrupt || this.state.pendingInterrupt.type !== "context") {
      return [];
    }

    const candidateIds = this.state.pendingInterrupt.candidateIds;

    return candidateIds.map((id) => {
      const scored = this.state!.scoredCandidates?.find((c) => c.candidateId === id);
      const candidate = this.state!.candidates?.find((c) => c.id === id);
      const pbiStatus = this.state!.pbiStatuses?.find((s) => s.candidateId === id);

      const missingElements = scored?.missingElements ?? [];
      const recommendations = scored?.recommendations ?? [];

      return {
        candidateId: id,
        title: candidate?.title ?? "Unknown",
        score: pbiStatus?.score ?? scored?.overallScore ?? 0,
        currentDescription: candidate?.extractedDescription ?? "",
        missingElements,
        specificQuestions: this.generateContextQuestions(missingElements, recommendations),
      };
    });
  }

  /**
   * Get the interrupt message
   */
  getInterruptMessage(): string {
    return this.state?.pendingInterrupt?.message ?? "";
  }

  /**
   * Submit approval decisions and resume pipeline
   */
  async submitApprovals(
    decisions: Record<string, "approve" | "reject">
  ): Promise<PipelineStateType> {
    if (!this.isAwaitingApproval()) {
      throw new Error("No approval pending");
    }

    // Fix checkpoint compatibility before resuming
    await this.fixCheckpointCompatibility();

    const response: ApprovalResponse = { decisions };

    this.status = "running";
    this.state = (await this.graph.invoke(new Command({ resume: response }), {
      configurable: { thread_id: this.threadId },
    })) as PipelineStateType;

    this.updateStatusFromState();
    return this.state;
  }

  /**
   * Submit context responses and resume pipeline
   */
  async submitContext(contexts: Record<string, string>): Promise<PipelineStateType> {
    if (!this.isAwaitingContext()) {
      throw new Error("No context request pending");
    }

    // Fix checkpoint compatibility before resuming
    await this.fixCheckpointCompatibility();

    const response: ContextResponse = { contexts };

    this.status = "running";
    this.state = (await this.graph.invoke(new Command({ resume: response }), {
      configurable: { thread_id: this.threadId },
    })) as PipelineStateType;

    this.updateStatusFromState();
    return this.state;
  }

  /**
   * Check if pipeline is complete
   */
  isComplete(): boolean {
    return this.status === "completed";
  }

  /**
   * Get summary of results
   */
  getResultsSummary(): {
    eventType: string;
    eventConfidence: number;
    totalCandidates: number;
    averageScore: number;
    approved: number;
    rejected: number;
    exported: number;
  } {
    if (!this.state) {
      throw new Error("No state available");
    }

    const pbiStatuses = this.state.pbiStatuses ?? [];
    const approved = pbiStatuses.filter(
      (s) => s.status === "approved" || s.status === "auto_approved"
    ).length;
    const rejected = pbiStatuses.filter((s) => s.status === "rejected_final").length;

    return {
      eventType: this.state.eventType ?? "unknown",
      eventConfidence: this.state.eventConfidence ?? 0,
      totalCandidates: this.state.candidates?.length ?? 0,
      averageScore: this.state.averageScore ?? 0,
      approved,
      rejected,
      exported: this.state.exportedPBIs?.length ?? 0,
    };
  }

  /**
   * Fix checkpoint compatibility for older checkpoints
   *
   * Older checkpoints may be missing fields that newer LangGraph versions expect.
   * This method updates the checkpoint in-place to add missing fields.
   */
  private async fixCheckpointCompatibility(): Promise<void> {
    try {
      const Database = (await import("better-sqlite3")).default;
      const db = new Database(this.checkpointPath);

      // Get the latest checkpoint
      const row = db.prepare(`
        SELECT checkpoint_id, checkpoint
        FROM checkpoints
        WHERE thread_id = ?
        ORDER BY checkpoint_id DESC
        LIMIT 1
      `).get(this.threadId) as { checkpoint_id: string; checkpoint: Buffer | string } | undefined;

      if (!row) {
        db.close();
        return;
      }

      // Parse checkpoint
      const data = Buffer.isBuffer(row.checkpoint)
        ? row.checkpoint.toString("utf-8")
        : row.checkpoint;
      const checkpoint = JSON.parse(data);

      // Add missing fields that newer LangGraph expects
      let modified = false;

      if (!checkpoint.pending_sends) {
        checkpoint.pending_sends = [];
        modified = true;
      }

      if (!checkpoint.versions_seen) {
        checkpoint.versions_seen = {};
        modified = true;
      }

      // Update if modified
      if (modified) {
        const updatedData = JSON.stringify(checkpoint);
        db.prepare(`
          UPDATE checkpoints
          SET checkpoint = ?
          WHERE checkpoint_id = ? AND thread_id = ?
        `).run(updatedData, row.checkpoint_id, this.threadId);
      }

      db.close();
    } catch (error) {
      // Log but don't throw - the resume might still work
      console.warn("[HITLSession] Failed to fix checkpoint compatibility:", error instanceof Error ? error.message : error);
    }
  }

  /**
   * Update status based on current state
   */
  private updateStatusFromState(): void {
    if (!this.state) {
      this.status = "idle";
      return;
    }

    if (this.state.pendingInterrupt) {
      this.status =
        this.state.pendingInterrupt.type === "approval"
          ? "awaiting_approval"
          : "awaiting_context";
    } else if (this.state.exportedPBIs?.length) {
      this.status = "completed";
    } else {
      // Pipeline may have ended without exports (all rejected)
      const allProcessed = this.state.pbiStatuses?.every(
        (s) =>
          s.status === "approved" ||
          s.status === "auto_approved" ||
          s.status === "rejected_final"
      );
      if (allProcessed) {
        this.status = "completed";
      }
    }
  }

  /**
   * Generate specific questions for missing context
   */
  private generateContextQuestions(
    missingElements: string[],
    recommendations: string[]
  ): string[] {
    const questions: string[] = [];

    // Convert missing elements to questions
    for (const missing of missingElements.slice(0, 3)) {
      const lowerMissing = missing.toLowerCase();
      if (lowerMissing.includes("acceptance criteria")) {
        questions.push("What specific conditions should be met for this to be considered done?");
      } else if (lowerMissing.includes("description")) {
        questions.push("Can you provide more details about what this PBI should accomplish?");
      } else if (lowerMissing.includes("scope")) {
        questions.push("What is in scope and out of scope for this PBI?");
      } else {
        questions.push(`Please provide: ${missing}`);
      }
    }

    // Add questions from recommendations
    for (const rec of recommendations.slice(0, 2)) {
      if (!questions.some((q) => q.toLowerCase().includes(rec.toLowerCase().slice(0, 20)))) {
        questions.push(rec.endsWith("?") ? rec : `${rec}?`);
      }
    }

    return questions.slice(0, 5);
  }
}

/**
 * List available threads from checkpoint database
 */
export async function listThreads(checkpointPath: string): Promise<
  Array<{
    threadId: string;
    checkpointCount: number;
    latestCheckpoint: string;
  }>
> {
  // Use better-sqlite3 directly to query threads
  const Database = (await import("better-sqlite3")).default;

  try {
    const db = new Database(checkpointPath, { readonly: true });

    const threads = db
      .prepare(
        `
      SELECT
        thread_id,
        COUNT(*) as checkpoint_count,
        MAX(checkpoint_id) as latest_checkpoint
      FROM checkpoints
      GROUP BY thread_id
      ORDER BY latest_checkpoint DESC
    `
      )
      .all() as Array<{
      thread_id: string;
      checkpoint_count: number;
      latest_checkpoint: string;
    }>;

    db.close();

    return threads.map((t) => ({
      threadId: t.thread_id,
      checkpointCount: t.checkpoint_count,
      latestCheckpoint: t.latest_checkpoint,
    }));
  } catch {
    return [];
  }
}
