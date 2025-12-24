import { Args, Command, Flags } from "@oclif/core";
import { select, input, confirm, editor } from "@inquirer/prompts";
import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  HITLSession,
  listThreads,
  getScoreLabel,
  type PendingApprovalInfo,
  type PendingContextInfo,
  type ContextQuestion,
  type ContextAnswer,
  type PBIContextResponse,
} from "@chef/backlog";
import { runPipeline } from "@chef/core";

const OTHER_VALUE = "__OTHER__";
const SKIP_VALUE = "__SKIP__";
const PAUSE_VALUE = "__PAUSE__";
const FILE_PREFIX = "@file:";

/**
 * Action choices for question prompts
 */
interface QuestionAction {
  type: "answer" | "skip" | "pause" | "file";
  value?: string;
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
    legacy: Flags.boolean({
      description: "Use legacy single-input mode instead of structured questions",
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

    this.log(`\n${chalk.bold("Thread:")} ${session.getThreadId()}`);
    this.log(`${chalk.bold("Status:")} ${this.formatStatus(session.getStatus())}`);
    this.log("");

    // Handle based on current status
    if (session.isAwaitingApproval()) {
      await this.handleApproval(session, flags);
    } else if (session.isAwaitingContext()) {
      if (flags.legacy) {
        await this.handleContextLegacy(session, flags);
      } else {
        await this.handleContext(session, flags);
      }
    } else if (session.isComplete()) {
      this.log("Pipeline already completed.");
      this.displayResults(session);
    } else {
      this.log("No pending interrupts. Pipeline may have completed or not started.");
    }
  }

  /**
   * Format status with color
   */
  private formatStatus(status: string): string {
    switch (status) {
      case "awaiting_approval":
        return chalk.yellow(status);
      case "awaiting_context":
        return chalk.cyan(status);
      case "completed":
        return chalk.green(status);
      case "error":
        return chalk.red(status);
      default:
        return status;
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

    this.log(chalk.bold("Available Threads:"));
    this.log("─".repeat(60));

    for (const thread of threads) {
      this.log(`  ${chalk.cyan(thread.threadId)}`);
      this.log(`    Checkpoints: ${thread.checkpointCount}`);
      this.log("");
    }

    this.log(`\nUse: ${chalk.cyan("chef backlog resume <thread-id>")} to resume a thread`);
  }

  /**
   * Handle approval interrupt
   */
  private async handleApproval(
    session: HITLSession,
    flags: { "auto-approve": boolean; "auto-reject": boolean }
  ): Promise<void> {
    const pendingApprovals = session.getPendingApprovals();

    this.log(chalk.bgYellow.black(" HUMAN APPROVAL REQUIRED "));
    this.log(`\n${session.getInterruptMessage()}\n`);

    // Display pending PBIs
    for (const pbi of pendingApprovals) {
      this.displayApprovalInfo(pbi);
    }

    // Collect decisions
    const decisions: Record<string, "approve" | "reject"> = {};

    if (flags["auto-approve"]) {
      for (const pbi of pendingApprovals) {
        decisions[pbi.candidateId] = "approve";
        this.log(`${chalk.green("✓")} Auto-approved: ${pbi.candidateId}`);
      }
    } else if (flags["auto-reject"]) {
      for (const pbi of pendingApprovals) {
        decisions[pbi.candidateId] = "reject";
        this.log(`${chalk.red("✗")} Auto-rejected: ${pbi.candidateId}`);
      }
    } else {
      for (const pbi of pendingApprovals) {
        this.log("─".repeat(50));
        this.log(`${chalk.bold("PBI:")} ${pbi.candidateId}`);
        this.log(`${chalk.bold("Title:")} ${pbi.title}`);
        this.log(`${chalk.bold("Score:")} ${this.formatScore(pbi.score)}`);

        const approved = await confirm({
          message: "Approve this PBI?",
          default: true,
        });

        decisions[pbi.candidateId] = approved ? "approve" : "reject";
        const icon = approved ? chalk.green("✓") : chalk.red("✗");
        this.log(`  ${icon} ${decisions[pbi.candidateId].toUpperCase()}`);
      }
    }

    this.log(`\n${chalk.dim("Resuming pipeline...")}\n`);

    await this.resumeLoop(session, async () => {
      return session.submitApprovals(decisions);
    }, flags);
  }

  /**
   * Handle context interrupt with structured questions
   */
  private async handleContext(
    session: HITLSession,
    flags: { "auto-approve": boolean; "auto-reject": boolean; legacy?: boolean }
  ): Promise<void> {
    const pendingContexts = session.getPendingContextRequests();

    this.log(chalk.bgCyan.black(" ADDITIONAL CONTEXT REQUIRED "));
    this.log(`\n${session.getInterruptMessage()}\n`);

    // Load any saved partial context
    const savedPartial = await session.loadPartialContext();
    const partialMap = new Map(savedPartial.map((p) => [p.candidateId, p]));

    if (savedPartial.length > 0) {
      this.log(chalk.yellow(`\n📋 Found saved progress for ${savedPartial.length} PBI(s)\n`));
    }

    const responses: PBIContextResponse[] = [];

    if (flags["auto-reject"]) {
      for (const request of pendingContexts) {
        responses.push({
          candidateId: request.candidateId,
          answers: [],
          additionalContext: "",
          status: "completed",
          lastQuestionIndex: 0,
        });
        this.log(`${chalk.red("✗")} Skipped: ${request.candidateId}`);
      }
    } else {
      for (const request of pendingContexts) {
        const existingPartial = partialMap.get(request.candidateId);
        const result = await this.gatherContextForPBI(request, existingPartial, session);

        if (result.paused) {
          // Save and exit
          await session.savePartialContext([...responses, result.response]);
          this.log(chalk.yellow(`\n⏸ Progress saved. Run the same command to continue.\n`));
          return;
        }

        responses.push(result.response);
      }
    }

    // Clear partial context since we're submitting
    await session.clearPartialContext();

    this.log(`\n${chalk.dim("Resuming pipeline...")}\n`);

    await this.resumeLoop(session, async () => {
      return session.submitStructuredContext(responses);
    }, flags);
  }

  /**
   * Gather context for a single PBI with full interactive features
   */
  private async gatherContextForPBI(
    request: PendingContextInfo,
    existingPartial: PBIContextResponse | undefined,
    session: HITLSession
  ): Promise<{ response: PBIContextResponse; paused: boolean }> {
    this.displayContextInfo(request);

    // Show existing answers if resuming
    if (existingPartial && existingPartial.answers.length > 0) {
      this.log(chalk.yellow("\n📝 Previously answered:"));
      for (const answer of existingPartial.answers) {
        const status = answer.status === "skipped" ? chalk.gray("(skipped)") : chalk.green("✓");
        const preview = this.truncateQuestion(answer.value || "(empty)", 40);
        this.log(`  ${status} ${answer.questionId}: ${preview}`);
      }

      const action = await select({
        message: "What would you like to do?",
        choices: [
          { name: "Continue from where I left off", value: "continue" },
          { name: "Edit previous answers", value: "edit" },
          { name: "Start fresh", value: "restart" },
          { name: "Skip this PBI", value: "skip" },
        ],
      });

      if (action === "skip") {
        return {
          response: {
            candidateId: request.candidateId,
            answers: [],
            additionalContext: "",
            status: "completed",
            lastQuestionIndex: 0,
          },
          paused: false,
        };
      }

      if (action === "edit") {
        return this.editAnswers(request, existingPartial, session);
      }

      if (action === "restart") {
        // Clear and start fresh
        existingPartial = undefined;
      }
    } else {
      // Ask if user wants to provide context or skip
      const wantsToProvide = await confirm({
        message: `Provide context for ${chalk.cyan(request.candidateId)}?`,
        default: true,
      });

      if (!wantsToProvide) {
        this.log(`  ${chalk.red("✗")} SKIPPED (will be rejected)`);
        return {
          response: {
            candidateId: request.candidateId,
            answers: [],
            additionalContext: "",
            status: "completed",
            lastQuestionIndex: 0,
          },
          paused: false,
        };
      }
    }

    // Show question preview
    const questions = request.structuredQuestions;
    const questionCount = questions.length + 1;
    const startIndex = existingPartial?.lastQuestionIndex ?? 0;

    this.log(`\n${"─".repeat(50)}`);
    this.log(chalk.bold(`  We have ${questionCount} questions for you:\n`));

    // Initialize answers from existing or empty
    const answers: ContextAnswer[] = existingPartial?.answers ?? [];
    const completed = answers.map((a) => a.status !== "pending");

    // Pad completed array if needed
    while (completed.length < questions.length + 1) {
      completed.push(false);
    }

    // Display initial progress
    this.displayQuestionProgress(questions, completed, answers);

    // Process each question starting from where we left off
    for (let i = startIndex; i < questions.length; i++) {
      const question = questions[i];

      this.log(`\n${chalk.dim(`[${i + 1}/${questionCount}]`)} ${chalk.cyan(question.category || "general")}`);

      const result = await this.askStructuredQuestion(question);

      if (result.action === "pause") {
        // Save progress and exit
        return {
          response: {
            candidateId: request.candidateId,
            answers,
            additionalContext: existingPartial?.additionalContext ?? "",
            status: "paused",
            lastQuestionIndex: i,
            updatedAt: new Date().toISOString(),
          },
          paused: true,
        };
      }

      // Add or update answer
      const existingIdx = answers.findIndex((a) => a.questionId === question.id);
      const answer: ContextAnswer = {
        questionId: question.id,
        questionText: question.question,
        value: result.value ?? "",
        isCustom: result.isCustom ?? false,
        isFileReference: result.isFileReference ?? false,
        resolvedValue: result.resolvedValue,
        status: result.action === "skip" ? "skipped" : "answered",
      };

      if (existingIdx >= 0) {
        answers[existingIdx] = answer;
      } else {
        answers.push(answer);
      }

      completed[i] = true;

      // Show updated progress
      this.log("");
      this.displayQuestionProgress(questions, completed, answers);
    }

    // Final question: additional context
    this.log(`\n${chalk.dim(`[${questionCount}/${questionCount}]`)} ${chalk.cyan("additional")}`);

    const additionalContext = await this.askForAdditionalContext();

    if (additionalContext.action === "pause") {
      return {
        response: {
          candidateId: request.candidateId,
          answers,
          additionalContext: "",
          status: "paused",
          lastQuestionIndex: questions.length,
          updatedAt: new Date().toISOString(),
        },
        paused: true,
      };
    }

    completed[questions.length] = true;

    // Show final progress
    this.log("");
    this.displayQuestionProgress(questions, completed, answers);

    const totalAnswered = answers.filter((a) => a.status === "answered" && a.value).length;
    this.log(`\n  ${chalk.green("✓")} ${totalAnswered} answers collected for ${request.candidateId}`);

    return {
      response: {
        candidateId: request.candidateId,
        answers,
        additionalContext: additionalContext.value ?? "",
        status: "completed",
        lastQuestionIndex: questions.length,
        updatedAt: new Date().toISOString(),
      },
      paused: false,
    };
  }

  /**
   * Edit existing answers
   */
  private async editAnswers(
    request: PendingContextInfo,
    existingPartial: PBIContextResponse,
    session: HITLSession
  ): Promise<{ response: PBIContextResponse; paused: boolean }> {
    const questions = request.structuredQuestions;
    const answers = [...existingPartial.answers];

    while (true) {
      // Build choices for edit menu
      const choices = questions.map((q, i) => {
        const answer = answers.find((a) => a.questionId === q.id);
        const status = answer?.status === "skipped"
          ? chalk.gray("(skipped)")
          : answer?.value
            ? chalk.green("✓")
            : chalk.yellow("○");
        const preview = answer?.value ? this.truncateQuestion(answer.value, 30) : "(not answered)";

        return {
          name: `${status} Q${i + 1}: ${this.truncateQuestion(q.question, 35)} ${chalk.dim(preview)}`,
          value: i,
        };
      });

      choices.push(
        { name: chalk.cyan("─ Done editing, continue ─"), value: -1 },
        { name: chalk.yellow("⏸ Pause and save"), value: -2 }
      );

      const selected = await select({
        message: "Select a question to edit:",
        choices,
      });

      if (selected === -1) {
        // Done editing
        break;
      }

      if (selected === -2) {
        // Pause
        return {
          response: {
            ...existingPartial,
            answers,
            status: "paused",
            updatedAt: new Date().toISOString(),
          },
          paused: true,
        };
      }

      // Edit the selected question
      const question = questions[selected];
      const result = await this.askStructuredQuestion(question);

      if (result.action === "pause") {
        return {
          response: {
            ...existingPartial,
            answers,
            status: "paused",
            updatedAt: new Date().toISOString(),
          },
          paused: true,
        };
      }

      const existingIdx = answers.findIndex((a) => a.questionId === question.id);
      const answer: ContextAnswer = {
        questionId: question.id,
        questionText: question.question,
        value: result.value ?? "",
        isCustom: result.isCustom ?? false,
        isFileReference: result.isFileReference ?? false,
        resolvedValue: result.resolvedValue,
        status: result.action === "skip" ? "skipped" : "answered",
      };

      if (existingIdx >= 0) {
        answers[existingIdx] = answer;
      } else {
        answers.push(answer);
      }
    }

    // Continue with remaining questions
    return this.gatherContextForPBI(
      request,
      { ...existingPartial, answers, lastQuestionIndex: questions.length },
      session
    );
  }

  /**
   * Ask a single structured question with skip/pause/file options
   */
  private async askStructuredQuestion(
    question: ContextQuestion
  ): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
    isCustom?: boolean;
    isFileReference?: boolean;
    resolvedValue?: string;
  }> {
    if (question.type === "select" && question.options?.length) {
      // Build choices with special options
      const choices = [
        ...question.options.map((opt) => ({
          name: opt.label,
          value: opt.value,
          description: opt.description,
        })),
        { name: chalk.blue("✎ Other (custom input)"), value: OTHER_VALUE },
        { name: chalk.blue("📄 Load from file"), value: FILE_PREFIX },
        { name: chalk.gray("⏭ Skip this question"), value: SKIP_VALUE },
        { name: chalk.yellow("⏸ Pause and save progress"), value: PAUSE_VALUE },
      ];

      const selected = await select({
        message: question.question,
        choices,
      });

      if (selected === SKIP_VALUE) {
        return { action: "skip" };
      }

      if (selected === PAUSE_VALUE) {
        return { action: "pause" };
      }

      if (selected === FILE_PREFIX) {
        return this.handleFileInput(question.required);
      }

      if (selected === OTHER_VALUE) {
        return this.handleCustomInput(question.required);
      }

      return { action: "answer", value: selected };
    } else if (question.type === "confirm") {
      // Confirm with skip/pause options
      const choice = await select({
        message: question.question,
        choices: [
          { name: chalk.green("Yes"), value: "yes" },
          { name: chalk.red("No"), value: "no" },
          { name: chalk.gray("⏭ Skip"), value: SKIP_VALUE },
          { name: chalk.yellow("⏸ Pause"), value: PAUSE_VALUE },
        ],
      });

      if (choice === SKIP_VALUE) return { action: "skip" };
      if (choice === PAUSE_VALUE) return { action: "pause" };

      return { action: "answer", value: choice === "yes" ? "Yes" : "No" };
    } else {
      // Input type with options
      return this.handleInputQuestion(question);
    }
  }

  /**
   * Handle input-type questions with action menu
   */
  private async handleInputQuestion(
    question: ContextQuestion
  ): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
    isCustom?: boolean;
    isFileReference?: boolean;
    resolvedValue?: string;
  }> {
    // Show the question and ask how to answer
    this.log(`\n${chalk.bold(question.question)}`);
    if (question.placeholder) {
      this.log(chalk.dim(`  Hint: ${question.placeholder}`));
    }

    const method = await select({
      message: "How would you like to answer?",
      choices: [
        { name: chalk.blue("✎ Type a short answer"), value: "input" },
        { name: chalk.blue("📝 Open editor (for longer text)"), value: "editor" },
        { name: chalk.blue("📄 Load from file"), value: "file" },
        { name: chalk.gray("⏭ Skip this question"), value: "skip" },
        { name: chalk.yellow("⏸ Pause and save progress"), value: "pause" },
      ],
    });

    if (method === "skip") return { action: "skip" };
    if (method === "pause") return { action: "pause" };
    if (method === "file") return this.handleFileInput(question.required);
    if (method === "editor") return this.handleEditorInput(question);

    // Short input
    const value = await input({
      message: "Your answer:",
      validate: (val) => (!question.required || val.trim() ? true : "Response is required"),
    });

    return { action: "answer", value, isCustom: true };
  }

  /**
   * Handle file input
   */
  private async handleFileInput(
    required?: boolean
  ): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
    isCustom?: boolean;
    isFileReference?: boolean;
    resolvedValue?: string;
  }> {
    const filePath = await input({
      message: `Enter file path (relative or absolute):`,
      validate: (val) => {
        if (!val.trim()) {
          return required ? "File path is required" : true;
        }
        const resolved = path.resolve(val);
        if (!fs.existsSync(resolved)) {
          return `File not found: ${resolved}`;
        }
        return true;
      },
    });

    if (!filePath.trim()) {
      return { action: "skip" };
    }

    const resolved = path.resolve(filePath);
    const content = fs.readFileSync(resolved, "utf-8");

    this.log(chalk.green(`  ✓ Loaded ${content.length} characters from ${filePath}`));

    return {
      action: "answer",
      value: `${FILE_PREFIX}${filePath}`,
      isFileReference: true,
      resolvedValue: content,
    };
  }

  /**
   * Handle custom text input
   */
  private async handleCustomInput(
    required?: boolean
  ): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
    isCustom?: boolean;
  }> {
    const value = await input({
      message: "Enter your custom response:",
      validate: (val) => (!required || val.trim() ? true : "Response is required"),
    });

    if (!value.trim()) {
      return { action: "skip" };
    }

    return { action: "answer", value, isCustom: true };
  }

  /**
   * Handle editor input for longer text
   */
  private async handleEditorInput(
    question: ContextQuestion
  ): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
    isCustom?: boolean;
  }> {
    const header = `# ${question.question}\n# (Lines starting with # will be removed)\n# Save and close to submit\n\n`;

    const value = await editor({
      message: "Opening editor...",
      default: header,
      postfix: ".md",
    });

    // Remove comment lines
    const cleaned = value
      .split("\n")
      .filter((line) => !line.startsWith("#"))
      .join("\n")
      .trim();

    if (!cleaned) {
      return { action: "skip" };
    }

    return { action: "answer", value: cleaned, isCustom: true };
  }

  /**
   * Ask for additional context
   */
  private async askForAdditionalContext(): Promise<{
    action: "answer" | "skip" | "pause";
    value?: string;
  }> {
    const method = await select({
      message: "Any additional context to add?",
      choices: [
        { name: chalk.gray("⏭ No, continue"), value: "skip" },
        { name: chalk.blue("✎ Type additional context"), value: "input" },
        { name: chalk.blue("📝 Open editor"), value: "editor" },
        { name: chalk.blue("📄 Load from file"), value: "file" },
        { name: chalk.yellow("⏸ Pause and save"), value: "pause" },
      ],
    });

    if (method === "skip") return { action: "skip" };
    if (method === "pause") return { action: "pause" };

    if (method === "file") {
      const result = await this.handleFileInput(false);
      return { action: result.action, value: result.resolvedValue || result.value };
    }

    if (method === "editor") {
      const result = await this.handleEditorInput({
        id: "additional",
        question: "Additional context",
        type: "input",
        required: false,
      });
      return result;
    }

    const value = await input({
      message: "Additional context:",
    });

    return { action: "answer", value };
  }

  /**
   * Display question progress as a task list
   */
  private displayQuestionProgress(
    questions: ContextQuestion[],
    completed: boolean[],
    answers: ContextAnswer[]
  ): void {
    for (let i = 0; i < questions.length; i++) {
      const answer = answers.find((a) => a.questionId === questions[i].id);
      let status: string;
      let preview = "";

      if (answer?.status === "skipped") {
        status = chalk.gray("⏭");
        preview = chalk.gray("(skipped)");
      } else if (completed[i]) {
        status = chalk.green("✓");
        if (answer?.value) {
          preview = chalk.dim(this.truncateQuestion(answer.value, 25));
        }
      } else {
        status = chalk.gray("○");
      }

      const questionPreview = this.truncateQuestion(questions[i].question, 40);
      this.log(`  ${status} Q${i + 1}: ${questionPreview} ${preview}`);
    }

    // Additional context
    const additionalStatus = completed[questions.length] ? chalk.green("✓") : chalk.gray("○");
    this.log(`  ${additionalStatus} Additional context`);
  }

  /**
   * Truncate a question for preview display
   */
  private truncateQuestion(question: string, maxLength: number): string {
    // Remove newlines for preview
    const singleLine = question.replace(/\n/g, " ").trim();
    if (singleLine.length <= maxLength) {
      return singleLine;
    }
    return singleLine.slice(0, maxLength - 3) + "...";
  }

  /**
   * Format score with color
   */
  private formatScore(score: number): string {
    const label = getScoreLabel(score);
    if (score >= 75) return chalk.green(`${score}/100 (${label})`);
    if (score >= 50) return chalk.yellow(`${score}/100 (${label})`);
    return chalk.red(`${score}/100 (${label})`);
  }

  /**
   * Handle context interrupt (legacy single-input mode)
   */
  private async handleContextLegacy(
    session: HITLSession,
    flags: { "auto-approve": boolean; "auto-reject": boolean }
  ): Promise<void> {
    const pendingContexts = session.getPendingContextRequests();

    this.log(chalk.bgCyan.black(" ADDITIONAL CONTEXT REQUIRED (Legacy Mode) "));
    this.log(`\n${session.getInterruptMessage()}\n`);

    const contexts: Record<string, string> = {};

    if (flags["auto-reject"]) {
      for (const request of pendingContexts) {
        contexts[request.candidateId] = "";
        this.log(`${chalk.red("✗")} Skipped: ${request.candidateId}`);
      }
    } else {
      for (const request of pendingContexts) {
        this.displayContextInfo(request);

        const context = await input({
          message: "Provide additional context (or leave empty to skip):",
        });

        if (!context.trim()) {
          contexts[request.candidateId] = "";
          this.log(`  ${chalk.red("✗")} SKIPPED (will be rejected)`);
        } else {
          contexts[request.candidateId] = context;
          this.log(`  ${chalk.green("✓")} Context added (${context.length} chars)`);
        }
      }
    }

    this.log(`\n${chalk.dim("Resuming pipeline...")}\n`);

    await this.resumeLoop(session, async () => {
      return session.submitContext(contexts);
    }, flags);
  }

  /**
   * Resume loop - continues until complete or new interrupt
   * Wraps execution in runPipeline() for proper logging context
   */
  private async resumeLoop(
    session: HITLSession,
    initialAction: () => Promise<unknown>,
    flags: { "auto-approve": boolean; "auto-reject": boolean; legacy?: boolean }
  ): Promise<void> {
    try {
      // Wrap in runPipeline for proper logging context
      await runPipeline(session.getThreadId(), async () => {
        await initialAction();

        while (!session.isComplete()) {
          if (session.isAwaitingApproval()) {
            await this.handleApproval(session, flags);
          } else if (session.isAwaitingContext()) {
            if (flags.legacy) {
              await this.handleContextLegacy(session, flags);
            } else {
              await this.handleContext(session, flags);
            }
          } else {
            break;
          }
        }
      });

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
    this.log(`${chalk.bold("PBI:")} ${pbi.candidateId}`);
    this.log(`${chalk.bold("Title:")} ${pbi.title}`);
    this.log(`${chalk.bold("Score:")} ${this.formatScore(pbi.score)}`);

    if (pbi.strengths.length > 0) {
      this.log(chalk.green("\nStrengths:"));
      for (const s of pbi.strengths) {
        this.log(`  ${chalk.green("+")} ${s}`);
      }
    }

    if (pbi.concerns.length > 0) {
      this.log(chalk.red("\nConcerns:"));
      for (const c of pbi.concerns) {
        this.log(`  ${chalk.red("-")} ${c}`);
      }
    }

    if (pbi.recommendations.length > 0) {
      this.log(chalk.yellow("\nRecommendations:"));
      for (const r of pbi.recommendations) {
        this.log(`  ${chalk.yellow("*")} ${r}`);
      }
    }

    this.log("");
  }

  /**
   * Display context request info
   */
  private displayContextInfo(request: PendingContextInfo): void {
    this.log("─".repeat(50));
    this.log(`${chalk.bold("PBI:")} ${request.candidateId}`);
    this.log(`${chalk.bold("Title:")} ${request.title}`);
    this.log(`${chalk.bold("Score:")} ${this.formatScore(request.score)}`);

    if (request.currentDescription) {
      const desc =
        request.currentDescription.length > 200
          ? request.currentDescription.slice(0, 200) + "..."
          : request.currentDescription;
      this.log(`\n${chalk.bold("Current Description:")}\n  ${chalk.dim(desc)}`);
    }

    if (request.missingElements.length > 0) {
      this.log(chalk.yellow("\nMissing Elements:"));
      for (const m of request.missingElements) {
        this.log(`  ${chalk.yellow("-")} ${m}`);
      }
    }
  }

  /**
   * Display final results
   */
  private displayResults(session: HITLSession): void {
    const summary = session.getResultsSummary();
    const state = session.getState();

    this.log("\n" + chalk.bgGreen.black(" PIPELINE COMPLETE "));

    this.log(`\n${chalk.bold("Event Type:")}  ${summary.eventType}`);
    this.log(`${chalk.bold("Confidence:")}  ${(summary.eventConfidence * 100).toFixed(1)}%`);
    this.log(`${chalk.bold("Candidates:")}  ${summary.totalCandidates}`);
    this.log(`${chalk.bold("Avg Score:")}   ${summary.averageScore}/100`);

    this.log(chalk.bold("\nPBI Status:"));
    this.log(`  ${chalk.green("Approved:")}  ${summary.approved}`);
    this.log(`  ${chalk.red("Rejected:")}  ${summary.rejected}`);
    this.log(`  ${chalk.blue("Exported:")}  ${summary.exported}`);

    if (state?.pbiStatuses?.length) {
      this.log(chalk.bold("\nDetailed Status:"));
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
      this.log(chalk.bold("\nExported PBIs:"));
      for (const pbiId of state.exportedPBIs) {
        const candidate = state.candidates?.find((c) => c.id === pbiId);
        this.log(`  ${chalk.green("-")} ${pbiId}: ${candidate?.title || "Unknown"}`);
      }
    }

    this.log("\n" + "═".repeat(60));
    this.log(`${chalk.bold("Thread ID:")} ${session.getThreadId()}`);
  }
}
