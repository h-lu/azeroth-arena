import { resolve } from "node:path";
import { runAIDirectorV1Playtest } from "../server/aiDirectorV1Playtest.ts";

const outputDir = resolve(process.env.AI_DIRECTOR_V1_RESULT_DIR ?? "playtest-results/ai-director-v1");
const reportPath = process.env.AI_DIRECTOR_V1_REPORT_PATH ?? "docs/playtest/week-10-ai-director-v1-report.md";
const maxSteps = Number.parseInt(process.env.AI_DIRECTOR_V1_MAX_STEPS ?? "90", 10);

const result = runAIDirectorV1Playtest({
  maxSteps: Number.isFinite(maxSteps) ? maxSteps : 90,
  outputDir,
  reportPath,
});

console.log(JSON.stringify({
  summary: result.summary,
  runs: result.runs.map((run) => ({
    runNumber: run.config.runNumber,
    encounterTemplateId: run.config.encounterTemplateId,
    stoppedReason: run.stoppedReason,
    winner: run.winner,
    commandCount: run.commandCount,
    memoryMatches: run.memory?.matchCount ?? 0,
    fallbackCount: run.metrics?.fallback.totalFallbackCount ?? 0,
  })),
  jsonPath: resolve(outputDir, "director-v1-run.json"),
  markdownPath: resolve(outputDir, "director-v1-report.md"),
  reportPath: resolve(reportPath),
}, null, 2));
console.error(`AI Director v1 playtest written to ${resolve(reportPath)}`);
