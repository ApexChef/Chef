import { Args, Command, Flags } from "@oclif/core";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPipelineGraphWithHITL,
  type PipelineStateType,
} from "@chef/backlog";
import { LLMRouter } from "@chef/core";

export default class BacklogProcess extends Command {
  static override args = {
    input: Args.file({
      description: "Path to meeting notes file",
      required: true,
    }),
  };

  static override description = "Process meeting notes into PBI candidates";

  static override examples = [
    "<%= config.bin %> <%= command.id %> meeting-notes.txt",
    "<%= config.bin %> <%= command.id %> meeting-notes.txt --output json",
    "<%= config.bin %> <%= command.id %> meeting-notes.txt --provider anthropic",
  ];

  static override flags = {
    output: Flags.string({
      char: "o",
      description: "Output format",
      options: ["json", "markdown", "summary"],
      default: "summary",
    }),
    provider: Flags.string({
      char: "p",
      description: "LLM provider to use (auto-detects based on API keys if not specified)",
      options: ["anthropic", "ollama"],
    }),
    model: Flags.string({
      char: "m",
      description: "Model to use (provider-specific)",
    }),
    "dry-run": Flags.boolean({
      description: "Parse input without running LLM pipeline",
      default: false,
    }),
    checkpoint: Flags.string({
      char: "c",
      description: "Path to checkpoint SQLite file for HITL persistence",
      default: "./data/pipeline.sqlite",
    }),
  };

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(BacklogProcess);

    // Validate input file exists
    if (!existsSync(args.input)) {
      this.error(`Input file not found: ${args.input}`);
    }

    // Read meeting notes
    const meetingNotes = readFileSync(args.input, "utf-8");
    this.log(`Processing: ${args.input} (${meetingNotes.length} chars)`);

    // Configure LLM via environment variables (only if explicitly provided)
    if (flags.provider) {
      process.env.LLM_PROVIDER = flags.provider;
    }
    if (flags.model) {
      process.env.LLM_MODEL = flags.model;
    }

    // Get the actual provider/model that will be used (after auto-detection)
    const router = new LLMRouter();
    const routerConfig = router.getConfig();

    if (flags["dry-run"]) {
      this.log("Dry run mode - skipping LLM pipeline");
      this.log(`Provider: ${routerConfig.provider}`);
      this.log(`Model: ${routerConfig.model}`);
      return;
    }

    this.log(`Provider: ${routerConfig.provider}`);
    this.log(`Model: ${flags.model || "(default for provider)"}`);
    this.log("");

    // Ensure checkpoint directory exists
    const checkpointPath = resolve(flags.checkpoint);
    const checkpointDir = checkpointPath.substring(0, checkpointPath.lastIndexOf("/"));
    if (checkpointDir && !existsSync(checkpointDir)) {
      mkdirSync(checkpointDir, { recursive: true });
    }

    try {
      // Create the pipeline graph
      const graph = createPipelineGraphWithHITL({
        checkpointPath,
      });

      // Generate a unique thread ID for this session
      const threadId = `cli-${Date.now()}`;

      this.log("Starting pipeline...");
      this.log("─".repeat(50));

      // Invoke the graph
      const result = await graph.invoke(
        { meetingNotes },
        { configurable: { thread_id: threadId } }
      );

      this.log("─".repeat(50));
      this.log("");

      // Check for HITL interrupt
      if (result.pendingInterrupt) {
        this.log("Pipeline paused - human input required:");
        this.log(JSON.stringify(result.pendingInterrupt, null, 2));
        this.log(`\nThread ID: ${threadId}`);
        this.log("Use 'chef backlog resume' to continue (not yet implemented)");
        return;
      }

      // Output results based on format
      this.outputResults(result, flags.output);
    } catch (error) {
      if (error instanceof Error) {
        this.error(`Pipeline failed: ${error.message}`);
      }
      throw error;
    }
  }

  private outputResults(
    result: PipelineStateType,
    format: string
  ): void {
    switch (format) {
      case "json":
        this.log(JSON.stringify(result, null, 2));
        break;

      case "markdown":
        this.outputMarkdown(result);
        break;

      case "summary":
      default:
        this.outputSummary(result);
        break;
    }
  }

  private outputSummary(result: PipelineStateType): void {
    this.log("Pipeline Complete!");
    this.log("");

    // Event detection
    this.log(`Event Type: ${result.eventType} (${result.eventConfidence}% confidence)`);
    this.log(`Indicators: ${result.eventIndicators?.join(", ") || "none"}`);
    this.log("");

    // Candidates
    this.log(`Candidates Found: ${result.candidates?.length || 0}`);
    if (result.scoredCandidates?.length) {
      this.log(`Average Score: ${result.averageScore}/100`);
      this.log("");

      for (const scored of result.scoredCandidates) {
        const candidate = result.candidates?.find((c) => c.id === scored.candidateId);
        this.log(`  [${scored.candidateId}] ${candidate?.title || "Unknown"}`);
        this.log(`    Type: ${candidate?.type || "unknown"} | Score: ${scored.overallScore}/100`);
        if (scored.strengths?.length) {
          this.log(`    Strengths: ${scored.strengths.slice(0, 2).join("; ")}`);
        }
        if (scored.concerns?.length) {
          this.log(`    Concerns: ${scored.concerns.slice(0, 2).join("; ")}`);
        }
        this.log("");
      }
    }

    // Exported PBIs
    if (result.exportedPBIs?.length) {
      this.log(`Exported PBIs: ${result.exportedPBIs.length}`);
      for (const [id, path] of Object.entries(result.exportPaths || {})) {
        this.log(`  ${id}: ${path}`);
      }
    }

    // Timing
    if (result.metadata?.stepTimings) {
      this.log("");
      this.log("Step Timings:");
      for (const [step, ms] of Object.entries(result.metadata.stepTimings)) {
        this.log(`  ${step}: ${ms}ms`);
      }
    }
  }

  private outputMarkdown(result: PipelineStateType): void {
    this.log("# Pipeline Results\n");

    this.log("## Event Detection\n");
    this.log(`- **Type:** ${result.eventType}`);
    this.log(`- **Confidence:** ${result.eventConfidence}%`);
    this.log(`- **Indicators:** ${result.eventIndicators?.join(", ") || "none"}`);
    this.log("");

    this.log("## Candidates\n");
    if (result.scoredCandidates?.length) {
      for (const scored of result.scoredCandidates) {
        const candidate = result.candidates?.find((c) => c.id === scored.candidateId);
        this.log(`### ${candidate?.title || scored.candidateId}\n`);
        this.log(`- **ID:** ${scored.candidateId}`);
        this.log(`- **Type:** ${candidate?.type || "unknown"}`);
        this.log(`- **Score:** ${scored.overallScore}/100`);
        this.log(`- **Description:** ${candidate?.extractedDescription || "N/A"}`);
        if (scored.strengths?.length) {
          this.log(`- **Strengths:** ${scored.strengths.join("; ")}`);
        }
        if (scored.concerns?.length) {
          this.log(`- **Concerns:** ${scored.concerns.join("; ")}`);
        }
        this.log("");
      }
    } else {
      this.log("No candidates found.\n");
    }
  }
}
