import { Args, Command, Flags } from "@oclif/core";
import * as readline from "node:readline";
import {
  HITLSession,
  listThreads,
  getScoreLabel,
  type PendingApprovalInfo,
  type PendingContextInfo,
} from "@chef/backlog";

/**
 * Helper to prompt for user input
 */
function createPrompt(): {
  ask: (question: string) => Promise<string>;
  close: () => void;
} {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask: (question: string) =>
      new Promise((resolve) => {
        rl.question(question, (answer) => resolve(answer.trim()));
      }),
    close: () => rl.close(),
  };
}

export default class BacklogResume extends Command {
  static override args = {
    threadId: Args.string({
      description: "Thread ID to resume (use 'list' to see available threads)",
      required: true,
    }),
  };

  static override description =
    "Resume a paused pipeline and provide human decisions for pending PBIs";

  static override examples = [
    "<%= config.bin %> <%= command.id %> list",
    "<%= config.bin %> <%= command.id %> cli-1234567890",
    "<%= config.bin %> <%= command.id %> cli-1234567890 --auto-approve",
  ];

  static override flags = {
    checkpoint: Flags.string({
      char: "c",
      description: "Path to checkpoint SQLite file",
      default: "./data/pipeline.sqlite",
    }),
    "auto-approve": Flags.boolean({
      description: "Automatically approve all pending PBIs",
      default: false,
    }),
    "auto-reject": Flags.boolean({
      description: "Automatically reject all pending PBIs",
      default: false,
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(BacklogResume);

    // Handle 'list' command
    if (args.threadId === "list") {
      await this.listThreads(flags.checkpoint);
      return;
    }

    // Create session and load state
    const session = new HITLSession({
      checkpointPath: flags.checkpoint,
      threadId: args.threadId,
    });

    const state = await session.loadState();

    if (!state) {
      this.error(`Thread not found: ${args.threadId}\nUse 'chef backlog resume list' to see available threads.`);
    }

    this.log(`\nThread: ${session.getThreadId()}`);
    this.log(`Status: ${session.getStatus()}`);
    this.log("");

    // Handle based on current status
    if (session.isAwaitingApproval()) {
      await this.handleApproval(session, flags);
    } else if (session.isAwaitingContext()) {
      await this.handleContext(session, flags);
    } else if (session.isComplete()) {
      this.log("Pipeline already completed.");
      this.displayResults(session);
    } else {
      this.log("No pending interrupts. Pipeline may have completed or not started.");
    }
  }

  /**
   * List available threads
   */
  private async listThreads(checkpointPath: string): Promise<void> {
    const threads = await listThreads(checkpointPath);

    if (threads.length === 0) {
      this.log("No threads found in checkpoint database.");
      this.log(`Database: ${checkpointPath}`);
      return;
    }

    this.log("Available Threads:");
    this.log("─".repeat(60));

    for (const thread of threads) {
      this.log(`  ${thread.threadId}`);
      this.log(`    Checkpoints: ${thread.checkpointCount}`);
      this.log("");
    }

    this.log(`\nUse: chef backlog resume <thread-id> to resume a thread`);
  }

  /**
   * Handle approval interrupt
   */
  private async handleApproval(
    session: HITLSession,
    flags: { "auto-approve": boolean; "auto-reject": boolean }
  ): Promise<void> {
    const pendingApprovals = session.getPendingApprovals();

    this.log("═".repeat(60));
    this.log("  HUMAN APPROVAL REQUIRED");
    this.log("═".repeat(60));
    this.log(`\n${session.getInterruptMessage()}\n`);

    // Display pending PBIs
    for (const pbi of pendingApprovals) {
      this.displayApprovalInfo(pbi);
    }

    // Collect decisions
    const decisions: Record<string, "approve" | "reject"> = {};

    if (flags["auto-approve"]) {
      // Auto-approve all
      for (const pbi of pendingApprovals) {
        decisions[pbi.candidateId] = "approve";
        this.log(`Auto-approved: ${pbi.candidateId}`);
      }
    } else if (flags["auto-reject"]) {
      // Auto-reject all
      for (const pbi of pendingApprovals) {
        decisions[pbi.candidateId] = "reject";
        this.log(`Auto-rejected: ${pbi.candidateId}`);
      }
    } else {
      // Interactive mode
      const prompt = createPrompt();

      try {
        for (const pbi of pendingApprovals) {
          this.log("─".repeat(50));
          this.log(`PBI: ${pbi.candidateId}`);
          this.log(`Title: ${pbi.title}`);
          this.log(`Score: ${pbi.score}/100 (${pbi.scoreLabel})`);

          let decision: string;
          do {
            decision = await prompt.ask("\nApprove this PBI? (y/n): ");
          } while (decision !== "y" && decision !== "n");

          decisions[pbi.candidateId] = decision === "y" ? "approve" : "reject";
          this.log(`  → ${decisions[pbi.candidateId].toUpperCase()}`);
        }
      } finally {
        prompt.close();
      }
    }

    this.log("\nResuming pipeline...\n");

    // Submit decisions and continue
    await this.resumeLoop(session, async () => {
      return session.submitApprovals(decisions);
    });
  }

  /**
   * Handle context interrupt
   */
  private async handleContext(
    session: HITLSession,
    flags: { "auto-approve": boolean; "auto-reject": boolean }
  ): Promise<void> {
    const pendingContexts = session.getPendingContextRequests();

    this.log("═".repeat(60));
    this.log("  ADDITIONAL CONTEXT REQUIRED");
    this.log("═".repeat(60));
    this.log(`\n${session.getInterruptMessage()}\n`);

    const contexts: Record<string, string> = {};

    if (flags["auto-reject"]) {
      // Skip all (will be rejected)
      for (const request of pendingContexts) {
        contexts[request.candidateId] = "";
        this.log(`Skipped: ${request.candidateId}`);
      }
    } else {
      // Interactive mode
      const prompt = createPrompt();

      try {
        for (const request of pendingContexts) {
          this.displayContextInfo(request);

          this.log("\nProvide additional context (or 'skip' to reject):");
          const context = await prompt.ask("> ");

          if (context.toLowerCase() === "skip") {
            contexts[request.candidateId] = "";
            this.log("  → SKIPPED (will be rejected)");
          } else {
            contexts[request.candidateId] = context;
            this.log(`  → Context added (${context.length} chars)`);
          }
        }
      } finally {
        prompt.close();
      }
    }

    this.log("\nResuming pipeline...\n");

    // Submit context and continue
    await this.resumeLoop(session, async () => {
      return session.submitContext(contexts);
    });
  }

  /**
   * Resume loop - continues until complete or new interrupt
   */
  private async resumeLoop(
    session: HITLSession,
    initialAction: () => Promise<unknown>
  ): Promise<void> {
    try {
      await initialAction();

      // Check for new interrupts
      while (!session.isComplete()) {
        if (session.isAwaitingApproval()) {
          await this.handleApproval(session, { "auto-approve": false, "auto-reject": false });
        } else if (session.isAwaitingContext()) {
          await this.handleContext(session, { "auto-approve": false, "auto-reject": false });
        } else {
          break;
        }
      }

      if (session.isComplete()) {
        this.displayResults(session);
      }
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Pipeline failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Display approval info for a PBI
   */
  private displayApprovalInfo(pbi: PendingApprovalInfo): void {
    this.log("─".repeat(50));
    this.log(`PBI: ${pbi.candidateId}`);
    this.log(`Title: ${pbi.title}`);
    this.log(`Score: ${pbi.score}/100 (${pbi.scoreLabel})`);

    if (pbi.strengths.length > 0) {
      this.log("\nStrengths:");
      for (const s of pbi.strengths) {
        this.log(`  + ${s}`);
      }
    }

    if (pbi.concerns.length > 0) {
      this.log("\nConcerns:");
      for (const c of pbi.concerns) {
        this.log(`  - ${c}`);
      }
    }

    if (pbi.recommendations.length > 0) {
      this.log("\nRecommendations:");
      for (const r of pbi.recommendations) {
        this.log(`  * ${r}`);
      }
    }

    this.log("");
  }

  /**
   * Display context request info
   */
  private displayContextInfo(request: PendingContextInfo): void {
    this.log("─".repeat(50));
    this.log(`PBI: ${request.candidateId}`);
    this.log(`Title: ${request.title}`);
    this.log(`Score: ${request.score}/100 (needs improvement)`);

    if (request.currentDescription) {
      const desc =
        request.currentDescription.length > 200
          ? request.currentDescription.slice(0, 200) + "..."
          : request.currentDescription;
      this.log(`\nCurrent Description:\n  ${desc}`);
    }

    if (request.missingElements.length > 0) {
      this.log("\nMissing Elements:");
      for (const m of request.missingElements) {
        this.log(`  - ${m}`);
      }
    }

    if (request.specificQuestions.length > 0) {
      this.log("\nQuestions to address:");
      request.specificQuestions.forEach((q, i) => {
        this.log(`  ${i + 1}. ${q}`);
      });
    }
  }

  /**
   * Display final results
   */
  private displayResults(session: HITLSession): void {
    const summary = session.getResultsSummary();
    const state = session.getState();

    this.log("\n" + "═".repeat(60));
    this.log("  PIPELINE COMPLETE");
    this.log("═".repeat(60));

    this.log(`\nEvent Type:  ${summary.eventType}`);
    this.log(`Confidence:  ${(summary.eventConfidence * 100).toFixed(1)}%`);
    this.log(`Candidates:  ${summary.totalCandidates}`);
    this.log(`Avg Score:   ${summary.averageScore}/100`);

    this.log("\nPBI Status:");
    this.log(`  Approved:  ${summary.approved}`);
    this.log(`  Rejected:  ${summary.rejected}`);
    this.log(`  Exported:  ${summary.exported}`);

    if (state?.pbiStatuses?.length) {
      this.log("\nDetailed Status:");
      for (const status of state.pbiStatuses) {
        const candidate = state.candidates?.find((c) => c.id === status.candidateId);
        const label = getScoreLabel(status.score);
        this.log(
          `  [${status.candidateId}] ${candidate?.title || "Unknown"}`
        );
        this.log(
          `    Status: ${status.status} | Score: ${status.score}/100 (${label})`
        );
      }
    }

    if (state?.exportedPBIs?.length) {
      this.log("\nExported PBIs:");
      for (const pbiId of state.exportedPBIs) {
        const candidate = state.candidates?.find((c) => c.id === pbiId);
        this.log(`  - ${pbiId}: ${candidate?.title || "Unknown"}`);
      }
    }

    this.log("\n" + "═".repeat(60));
    this.log(`Thread ID: ${session.getThreadId()}`);
  }
}
