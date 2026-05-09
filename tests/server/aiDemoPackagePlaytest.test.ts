import { describe, expect, test } from "vitest";
import { runWeek12DemoPackage } from "../../server/aiDemoPackagePlaytest";

describe("Week 12 demo package", () => {
  test("builds a four-run AI-native demo package with replay and trace audit coverage", () => {
    const result = runWeek12DemoPackage({ maxSteps: 220 });

    expect(result.summary.packageName).toBe("week-12-ai-native-demo-package");
    expect(result.summary.runCount).toBeGreaterThanOrEqual(3);
    expect(result.summary.runCount).toBeLessThanOrEqual(5);
    expect(result.summary.completedRunCount).toBe(result.summary.runCount);
    expect(result.summary.replayExportCount).toBe(result.summary.runCount);
    expect(result.summary.aiTraceAuditCount).toBe(result.summary.runCount);
    expect(result.summary.webDebugClientPreserved).toBe(true);
    expect(result.summary.encounterTemplateCount).toBe(15);
    expect(result.summary.finalMemory?.matchCount).toBe(result.summary.runCount);
    expect(result.summary.unityDemoEvidence.playableScene).toContain("Match.unity");
    expect(result.summary.iosTestFlightDecision.decision).toBe("defer");
    expect(result.runs.every((run) => run.completed)).toBe(true);
    expect(result.runs.every((run) => run.replayEntryCount > 0)).toBe(true);
    expect(result.runs.every((run) => run.traceAudit.decisionTraceCount > 0)).toBe(true);
    expect(result.runs.every((run) => run.traceAudit.directorTraceCount > 0)).toBe(true);
    expect(result.runs.every((run) => run.traceAudit.redFlagCount === 0)).toBe(true);
    expect(result.markdown).toContain("Week 12 Demo Package Report");
    expect(result.json).toContain("iosTestFlightDecision");
  }, 20_000);
});
