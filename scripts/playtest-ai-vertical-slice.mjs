import { resolve } from "node:path";
import { runWeek6VerticalSlicePlaytest } from "../server/aiVerticalSlicePlaytest.ts";

const outputDir = resolve(process.env.AI_VERTICAL_SLICE_RESULT_DIR ?? "playtest-results/ai-vertical-slice");
const reportPath = resolve(process.env.AI_VERTICAL_SLICE_REPORT_PATH ?? "docs/playtest/week-6-vertical-slice-report.md");
const maxSteps = Number.parseInt(process.env.AI_VERTICAL_SLICE_MAX_STEPS ?? "100", 10);

const result = runWeek6VerticalSlicePlaytest({
  maxSteps: Number.isFinite(maxSteps) ? maxSteps : 100,
  outputDir,
  reportPath,
});

console.log(JSON.stringify({
  summary: result.summary,
  matches: result.matches.map((match) => ({
    matchNumber: match.config.matchNumber,
    encounter: match.config.encounterTemplateId,
    styles: match.config.styles,
    stoppedReason: match.stoppedReason,
    winner: match.summary.winner,
    commands: match.summary.commandCount,
    replayEntries: match.replayEntryCount,
    decisiveMoment: match.postGameSummary?.decisiveMoment ?? null,
    files: match.files ?? null,
  })),
  jsonPath: resolve(outputDir, "week-6-vertical-slice-run.json"),
  markdownPath: resolve(outputDir, "week-6-vertical-slice-report.md"),
  committedReportPath: reportPath,
}, null, 2));
console.error(`Week 6 vertical slice report written to ${reportPath}`);
