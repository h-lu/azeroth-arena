import { describe, expect, test } from "vitest";
import { runWeek6VerticalSlicePlaytest } from "../../server/aiVerticalSlicePlaytest";

describe("Week 6 vertical slice playtest", () => {
  test("runs a three-match AI-native vertical slice with replay reviews", () => {
    const result = runWeek6VerticalSlicePlaytest({ maxSteps: 100 });

    expect(result.summary.matchCount).toBe(3);
    expect(result.summary.heroCountPerSide).toEqual({ blue: 3, red: 3 });
    expect(result.summary.aiStyles).toEqual(["aggressive", "control", "sustain"]);
    expect(result.summary.encounterTemplateCount).toBeGreaterThanOrEqual(5);
    expect(result.matches.map((match) => match.config.styles.red)).toEqual(["aggressive", "control", "sustain"]);
    expect(result.matches.some((match) => match.stoppedReason === "commandRejected")).toBe(false);
    expect(result.matches.every((match) => match.replayEntryCount > 0)).toBe(true);
    expect(result.matches.every((match) => match.postGameSummary?.keyTurns.length)).toBe(true);
    expect(result.markdown).toContain("Week 6 Vertical Slice Playtest Report");
    expect(result.json).toContain("encounterTemplateCount");
  }, 15_000);
});
