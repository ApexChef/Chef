/**
 * Export PBI Node (Step 6)
 *
 * Exports approved and risk-analyzed PBIs as markdown files.
 */

import * as fs from "fs";
import * as path from "path";
import type { PipelineStateType } from "../../state/index.js";
import type { PBIRiskAnalysis, ScoredCandidate, PBIEnrichment } from "../../schemas/index.js";
import { getScoreLabel } from "../../constants/index.js";

const OUTPUT_DIR = "./docs/output";

/**
 * Generate markdown content for a PBI
 */
function generatePBIMarkdown(
  candidate: NonNullable<PipelineStateType["candidates"]>[0],
  scored: ScoredCandidate | undefined,
  riskAnalysis: PBIRiskAnalysis | undefined,
  pbiStatus: NonNullable<PipelineStateType["pbiStatuses"]>[0] | undefined,
  enrichment: PBIEnrichment | undefined
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${candidate.id}: ${candidate.title}`);
  lines.push("");
  lines.push(`**Type:** ${candidate.type}`);
  lines.push(`**Final Score:** ${scored?.overallScore ?? "N/A"}/100 (${getScoreLabel(scored?.overallScore ?? 0)})`);
  lines.push(`**Risk Level:** ${riskAnalysis?.overallRiskLevel ?? "Not analyzed"}`);
  lines.push(`**Status:** ${pbiStatus?.status ?? "Unknown"}`);
  lines.push("");

  // Consolidated Description
  lines.push("## Description");
  lines.push("");
  lines.push(candidate.consolidatedDescription || candidate.extractedDescription);
  lines.push("");

  // Risk Analysis
  if (riskAnalysis) {
    lines.push("## Risk Analysis");
    lines.push("");

    if (riskAnalysis.risks.length > 0) {
      lines.push("### Identified Risks");
      lines.push("");
      for (const risk of riskAnalysis.risks) {
        lines.push(`- **[${risk.level.toUpperCase()}] ${risk.category}**: ${risk.description}`);
        if (risk.mitigation) {
          lines.push(`  - *Mitigation:* ${risk.mitigation}`);
        }
      }
      lines.push("");
    }

    if (riskAnalysis.dependencies.length > 0) {
      lines.push("### Dependencies");
      lines.push("");
      for (const dep of riskAnalysis.dependencies) {
        lines.push(`- ${dep}`);
      }
      lines.push("");
    }

    if (riskAnalysis.unknowns.length > 0) {
      lines.push("### Unknowns");
      lines.push("");
      for (const unknown of riskAnalysis.unknowns) {
        lines.push(`- ${unknown}`);
      }
      lines.push("");
    }

    if (riskAnalysis.assumptions.length > 0) {
      lines.push("### Assumptions");
      lines.push("");
      for (const assumption of riskAnalysis.assumptions) {
        lines.push(`- ${assumption}`);
      }
      lines.push("");
    }

    if (riskAnalysis.recommendedActions.length > 0) {
      lines.push("### Recommended Actions Before Starting");
      lines.push("");
      for (const action of riskAnalysis.recommendedActions) {
        lines.push(`- [ ] ${action}`);
      }
      lines.push("");
    }
  }

  // RAG Enrichment Context
  if (enrichment && enrichment.totalRetrieved > 0) {
    lines.push("## Related Context");
    lines.push("");

    // Context Summary
    if (enrichment.contextSummary && enrichment.contextSummary !== "No relevant context found in the knowledge base.") {
      lines.push("### Context Summary");
      lines.push("");
      lines.push(enrichment.contextSummary);
      lines.push("");
    }

    // Similar Past Work
    if (enrichment.similarWork.length > 0) {
      lines.push("### Similar Past Work");
      lines.push("");
      for (const work of enrichment.similarWork) {
        const relevance = Math.round(work.relevance * 100);
        lines.push(`- **${work.title}** (${relevance}% relevance)`);
        lines.push(`  - Source: ${work.source}`);
        if (work.snippet) {
          lines.push(`  - ${work.snippet.slice(0, 150)}...`);
        }
      }
      lines.push("");
    }

    // Relevant ADRs
    if (enrichment.relevantADRs.length > 0) {
      lines.push("### Relevant Architectural Decisions");
      lines.push("");
      for (const adr of enrichment.relevantADRs) {
        const relevance = Math.round(adr.relevance * 100);
        lines.push(`- **${adr.id}: ${adr.title}** (${relevance}% relevance)`);
        if (adr.status) {
          lines.push(`  - Status: ${adr.status}`);
        }
        lines.push(`  - ${adr.decision.slice(0, 200)}...`);
      }
      lines.push("");
    }

    // Technical Documentation
    if (enrichment.technicalDocs.length > 0) {
      lines.push("### Related Documentation");
      lines.push("");
      for (const doc of enrichment.technicalDocs) {
        const relevance = Math.round(doc.relevance * 100);
        lines.push(`- **${doc.title}** (${relevance}% relevance)`);
        lines.push(`  - Source: ${doc.source}`);
        if (doc.snippet) {
          lines.push(`  - ${doc.snippet.slice(0, 150)}...`);
        }
      }
      lines.push("");
    }

    // Lessons Learned
    if (enrichment.lessonsLearned.length > 0) {
      lines.push("### Lessons Learned");
      lines.push("");
      for (const lesson of enrichment.lessonsLearned) {
        const icon = lesson.category === "success" ? "✅" : lesson.category === "failure" ? "⚠️" : "💡";
        lines.push(`- ${icon} **${lesson.category.toUpperCase()}**: ${lesson.summary}`);
        lines.push(`  - Source: ${lesson.source}`);
      }
      lines.push("");
    }
  }

  // Scoring Details
  if (scored) {
    lines.push("## Quality Assessment");
    lines.push("");
    lines.push("### Scores");
    lines.push("");
    lines.push(`| Dimension | Score |`);
    lines.push(`|-----------|-------|`);
    lines.push(`| Completeness | ${scored.scores.completeness}/100 |`);
    lines.push(`| Clarity | ${scored.scores.clarity}/100 |`);
    lines.push(`| Actionability | ${scored.scores.actionability}/100 |`);
    lines.push(`| Testability | ${scored.scores.testability}/100 |`);
    lines.push(`| **Overall** | **${scored.overallScore}/100** |`);
    lines.push("");

    if (scored.strengths.length > 0) {
      lines.push("### Strengths");
      lines.push("");
      for (const strength of scored.strengths) {
        lines.push(`- ${strength}`);
      }
      lines.push("");
    }

    if (scored.concerns.length > 0) {
      lines.push("### Concerns");
      lines.push("");
      for (const concern of scored.concerns) {
        lines.push(`- ${concern}`);
      }
      lines.push("");
    }
  }

  // HITL Journey
  lines.push("## HITL Journey");
  lines.push("");
  if (pbiStatus) {
    lines.push(`- **Initial Score:** ${pbiStatus.score}/100`);
    lines.push(`- **Rescore Count:** ${pbiStatus.rescoreCount}`);
    lines.push(`- **Human Decision:** ${pbiStatus.humanDecision ?? "Auto-approved"}`);
    lines.push(`- **Final Status:** ${pbiStatus.status}`);
  }
  lines.push("");

  // Source Information
  lines.push("## Source Information");
  lines.push("");
  lines.push("### Original Extraction");
  lines.push("");
  lines.push("```");
  lines.push(candidate.extractedDescription);
  lines.push("```");
  lines.push("");

  if (candidate.humanContext) {
    lines.push("### Human-Provided Context");
    lines.push("");
    lines.push("```");
    lines.push(candidate.humanContext);
    lines.push("```");
    lines.push("");
  }

  lines.push("### Raw Meeting Context");
  lines.push("");
  lines.push("```");
  lines.push(candidate.rawContext);
  lines.push("```");
  lines.push("");

  // Footer
  lines.push("---");
  lines.push(`*Generated by HITL Pipeline on ${new Date().toISOString()}*`);

  return lines.join("\n");
}

/**
 * Export approved PBIs as markdown files
 *
 * Exports each PBI that has been:
 * - Approved (approved or auto_approved)
 * - Risk analyzed
 * - Not yet exported
 */
export async function exportPBINode(
  state: PipelineStateType
): Promise<Partial<PipelineStateType>> {
  const startTime = Date.now();

  console.log("[Graph] Running exportPBI node...");

  // Get PBIs ready for export (approved + risk analyzed + not exported)
  const approvedIds = state.approvedForEnrichment;
  const analyzedIds = state.riskAnalyses.map((r) => r.candidateId);
  const exportedIds = state.exportedPBIs;

  const readyToExport = approvedIds.filter(
    (id) => analyzedIds.includes(id) && !exportedIds.includes(id)
  );

  if (readyToExport.length === 0) {
    console.log("[Graph] exportPBI: No PBIs ready for export");
    return {
      metadata: {
        ...state.metadata,
        stepTimings: {
          ...state.metadata.stepTimings,
          exportPBI: Date.now() - startTime,
        },
      },
    };
  }

  console.log(`[Graph] exportPBI: Exporting ${readyToExport.length} PBI(s)`);

  // Ensure output directory exists
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const newExportedIds: string[] = [];
  const newExportPaths: Record<string, string> = {};

  for (const candidateId of readyToExport) {
    const candidate = state.candidates.find((c) => c.id === candidateId);
    const scored = state.scoredCandidates.find((s) => s.candidateId === candidateId);
    const riskAnalysis = state.riskAnalyses.find((r) => r.candidateId === candidateId);
    const pbiStatus = state.pbiStatuses.find((s) => s.candidateId === candidateId);
    const enrichment = state.enrichments?.find((e) => e.candidateId === candidateId);

    if (!candidate) {
      console.warn(`[Step 6] Candidate ${candidateId} not found, skipping`);
      continue;
    }

    const markdown = generatePBIMarkdown(candidate, scored, riskAnalysis, pbiStatus, enrichment);
    const filename = `${candidateId}.md`;
    const filepath = path.join(OUTPUT_DIR, filename);

    try {
      fs.writeFileSync(filepath, markdown, "utf-8");
      newExportedIds.push(candidateId);
      newExportPaths[candidateId] = filepath;
      console.log(`[Step 6]   ${candidateId}: Exported to ${filepath}`);
    } catch (error) {
      console.error(`[Step 6]   ${candidateId}: Export failed`, error);
    }
  }

  const elapsed = Date.now() - startTime;
  console.log(`[Graph] exportPBI complete: ${newExportedIds.length} exported (${elapsed}ms)`);

  return {
    exportedPBIs: newExportedIds,
    exportPaths: newExportPaths,
    metadata: {
      ...state.metadata,
      stepTimings: {
        ...state.metadata.stepTimings,
        exportPBI: elapsed,
      },
    },
  };
}
