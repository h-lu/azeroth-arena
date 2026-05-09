import { resolve } from "node:path";
import { runWeek12DemoPackage } from "../server/aiDemoPackagePlaytest.ts";

const outputDir = resolve(process.env.WEEK12_DEMO_RESULT_DIR ?? "playtest-results/week-12-demo-package");
const reportPath = process.env.WEEK12_DEMO_REPORT_PATH ?? "docs/playtest/week-12-demo-package-report.md";
const maxSteps = Number.parseInt(process.env.WEEK12_DEMO_MAX_STEPS ?? "220", 10);

const result = runWeek12DemoPackage({
  maxSteps: Number.isFinite(maxSteps) ? maxSteps : 220,
  outputDir,
  reportPath,
});

console.log(JSON.stringify({
  summary: result.summary,
  runs: result.runs.map((run) => ({
    runNumber: run.config.runNumber,
    encounterTemplateId: run.config.encounterTemplateId,
    stoppedReason: run.stoppedReason,
    completed: run.completed,
    winner: run.summary.winner,
    commandCount: run.summary.commandCount,
    replayEntryCount: run.replayEntryCount,
    redFlags: run.traceAudit.redFlagCount,
  })),
  jsonPath: resolve(outputDir, "week-12-demo-package.json"),
  markdownPath: resolve(outputDir, "week-12-demo-package-report.md"),
  reportPath: resolve(reportPath),
}, null, 2));
console.error(`Week 12 demo package written to ${resolve(reportPath)}`);
