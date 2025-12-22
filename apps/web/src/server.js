/**
 * Chef Web Server
 *
 * Express server to view pipeline data from SQLite checkpoint database.
 * Includes HITL resume functionality.
 */

import express from "express";
import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { HITLSession, getScoreLabel } from "@chef/backlog";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3333;

// Database path - relative to project root
const DB_PATH = join(__dirname, "../../../data/pipeline.sqlite");

// Parse JSON bodies for POST requests
app.use(express.json());

/**
 * Get database connection
 */
function getDb() {
  try {
    return new Database(DB_PATH, { readonly: true });
  } catch (error) {
    console.error("Failed to open database:", error.message);
    return null;
  }
}

/**
 * Pipeline phases in order
 */
const PIPELINE_PHASES = [
  { id: 'eventDetection', name: 'Event Detection', short: 'Event' },
  { id: 'candidateExtraction', name: 'Candidate Extraction', short: 'Extract' },
  { id: 'dependencyMapping', name: 'Dependency Mapping', short: 'Deps' },
  { id: 'confidenceScoring', name: 'Confidence Scoring', short: 'Score' },
  { id: 'humanApproval', name: 'Human Approval', short: 'HITL' },
  { id: 'contextEnrichment', name: 'Context Enrichment', short: 'Enrich' },
  { id: 'consolidateDescription', name: 'Consolidate Description', short: 'Consolidate' },
  { id: 'riskAnalysis', name: 'Risk Analysis', short: 'Risk' },
  { id: 'exportPBI', name: 'Export PBI', short: 'Export' },
];

/**
 * Determine current pipeline phase based on state
 */
function determineCurrentPhase(state) {
  const phases = PIPELINE_PHASES.map(p => ({ ...p, status: 'pending' }));

  // EventDetection - completed if eventType exists
  if (state.eventType) {
    phases[0].status = 'completed';
  }

  // CandidateExtraction - completed if candidates exist
  if (state.candidates?.length > 0) {
    phases[1].status = 'completed';
  }

  // DependencyMapping - completed if dependencies analyzed
  if (state.dependencies !== undefined) {
    phases[2].status = 'completed';
  }

  // ConfidenceScoring - completed if scores exist
  if (state.scoredCandidates?.length > 0) {
    phases[3].status = 'completed';
  }

  // HumanApproval - check pbiStatuses and pendingInterrupt
  if (state.pendingInterrupt) {
    phases[4].status = 'active';
  } else if (state.approvedForEnrichment?.length > 0) {
    phases[4].status = 'completed';
  }

  // ContextEnrichment - completed if enrichments exist
  if (state.enrichments?.length > 0) {
    phases[5].status = 'completed';
  }

  // ConsolidateDescription - check if candidates have consolidatedDescription
  const hasConsolidated = state.candidates?.some(c => c.consolidatedDescription);
  if (hasConsolidated) {
    phases[6].status = 'completed';
  }

  // RiskAnalysis - completed if riskAnalyses exist
  if (state.riskAnalyses?.length > 0) {
    phases[7].status = 'completed';
  }

  // ExportPBI - completed if exportedPBIs exist
  if (state.exportedPBIs?.length > 0) {
    phases[8].status = 'completed';
  }

  // Find current active phase (first non-completed after last completed)
  let lastCompleted = -1;
  for (let i = 0; i < phases.length; i++) {
    if (phases[i].status === 'completed') lastCompleted = i;
  }
  if (lastCompleted < phases.length - 1 && phases[lastCompleted + 1].status !== 'active') {
    phases[lastCompleted + 1].status = 'active';
  }

  return phases;
}

/**
 * Parse checkpoint blob to JSON
 */
function parseCheckpoint(checkpoint) {
  try {
    if (typeof checkpoint === "string") {
      return JSON.parse(checkpoint);
    }
    if (Buffer.isBuffer(checkpoint)) {
      return JSON.parse(checkpoint.toString("utf-8"));
    }
    return checkpoint;
  } catch {
    return null;
  }
}

// Serve static files
app.use(express.static(join(__dirname, "../public")));

// API: List all pipeline runs (threads)
app.get("/api/threads", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    const threads = db.prepare(`
      SELECT
        thread_id,
        COUNT(*) as checkpoint_count,
        MAX(checkpoint_id) as latest_checkpoint
      FROM checkpoints
      GROUP BY thread_id
      ORDER BY latest_checkpoint DESC
    `).all();

    res.json(threads);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// API: Get thread details (latest state)
app.get("/api/threads/:threadId", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    const row = db.prepare(`
      SELECT checkpoint, metadata
      FROM checkpoints
      WHERE thread_id = ?
      ORDER BY checkpoint_id DESC
      LIMIT 1
    `).get(req.params.threadId);

    if (!row) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const checkpoint = parseCheckpoint(row.checkpoint);
    const metadata = parseCheckpoint(row.metadata);

    if (!checkpoint) {
      return res.status(500).json({ error: "Failed to parse checkpoint" });
    }

    const state = checkpoint.channel_values || {};

    // Determine current pipeline phase based on state
    const currentPhase = determineCurrentPhase(state);

    res.json({
      threadId: req.params.threadId,
      metadata,
      currentPhase,
      state: {
        meetingNotes: state.meetingNotes || '',
        eventType: state.eventType,
        eventConfidence: state.eventConfidence,
        eventIndicators: state.eventIndicators || [],
        candidates: state.candidates || [],
        dependencies: state.dependencies || [],
        scoredCandidates: state.scoredCandidates || [],
        pbiStatuses: state.pbiStatuses || [],
        approvedForEnrichment: state.approvedForEnrichment || [],
        enrichments: state.enrichments || [],
        riskAnalyses: state.riskAnalyses || [],
        exportedPBIs: state.exportedPBIs || [],
        pendingInterrupt: state.pendingInterrupt,
        averageScore: state.averageScore,
        metadata: state.metadata || {},
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// API: Get all checkpoints for a thread (history)
app.get("/api/threads/:threadId/history", (req, res) => {
  const db = getDb();
  if (!db) {
    return res.status(500).json({ error: "Database not available" });
  }

  try {
    const rows = db.prepare(`
      SELECT checkpoint_id, parent_checkpoint_id, metadata
      FROM checkpoints
      WHERE thread_id = ?
      ORDER BY checkpoint_id ASC
    `).all(req.params.threadId);

    const history = rows.map(row => {
      const metadata = parseCheckpoint(row.metadata);
      return {
        checkpointId: row.checkpoint_id,
        parentId: row.parent_checkpoint_id,
        step: metadata?.step,
        source: metadata?.source,
      };
    });

    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    db.close();
  }
});

// API: Get pending approvals for a thread
app.get("/api/threads/:threadId/pending", async (req, res) => {
  try {
    const session = new HITLSession({
      checkpointPath: DB_PATH,
      threadId: req.params.threadId,
    });

    const state = await session.loadState();

    if (!state) {
      return res.status(404).json({ error: "Thread not found" });
    }

    const status = session.getStatus();

    if (status === "awaiting_approval") {
      const approvals = session.getPendingApprovals();
      res.json({
        type: "approval",
        message: session.getInterruptMessage(),
        candidates: approvals,
      });
    } else if (status === "awaiting_context") {
      const contexts = session.getPendingContextRequests();
      res.json({
        type: "context",
        message: session.getInterruptMessage(),
        requests: contexts,
      });
    } else {
      res.json({
        type: "none",
        status,
        message: status === "completed" ? "Pipeline completed" : "No pending interrupts",
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Submit approval decisions
app.post("/api/threads/:threadId/approve", async (req, res) => {
  try {
    const { decisions } = req.body;

    if (!decisions || typeof decisions !== "object") {
      return res.status(400).json({ error: "Missing decisions object" });
    }

    const session = new HITLSession({
      checkpointPath: DB_PATH,
      threadId: req.params.threadId,
    });

    await session.loadState();

    if (!session.isAwaitingApproval()) {
      return res.status(400).json({ error: "No approval pending for this thread" });
    }

    const result = await session.submitApprovals(decisions);

    // Check new status
    const newStatus = session.getStatus();
    let pending = null;

    if (session.isAwaitingApproval()) {
      pending = { type: "approval", candidates: session.getPendingApprovals() };
    } else if (session.isAwaitingContext()) {
      pending = { type: "context", requests: session.getPendingContextRequests() };
    }

    res.json({
      success: true,
      status: newStatus,
      pending,
      summary: session.isComplete() ? session.getResultsSummary() : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API: Submit context
app.post("/api/threads/:threadId/context", async (req, res) => {
  try {
    const { contexts } = req.body;

    if (!contexts || typeof contexts !== "object") {
      return res.status(400).json({ error: "Missing contexts object" });
    }

    const session = new HITLSession({
      checkpointPath: DB_PATH,
      threadId: req.params.threadId,
    });

    await session.loadState();

    if (!session.isAwaitingContext()) {
      return res.status(400).json({ error: "No context request pending for this thread" });
    }

    const result = await session.submitContext(contexts);

    // Check new status
    const newStatus = session.getStatus();
    let pending = null;

    if (session.isAwaitingApproval()) {
      pending = { type: "approval", candidates: session.getPendingApprovals() };
    } else if (session.isAwaitingContext()) {
      pending = { type: "context", requests: session.getPendingContextRequests() };
    }

    res.json({
      success: true,
      status: newStatus,
      pending,
      summary: session.isComplete() ? session.getResultsSummary() : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Chef Web UI running at http://localhost:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
});
