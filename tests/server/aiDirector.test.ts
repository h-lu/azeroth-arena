import { describe, expect, test } from "vitest";
import {
  AI_PERSONAS,
  BATTLEFIELD_MODIFIERS,
  DIRECTOR_OBJECTIVES,
  ENCOUNTER_TEMPLATES,
  createDirectorEncounter,
  createIntentHint,
  createPostGameSummary,
  summarizeAIMetrics,
  validateDirectorWhitelists,
} from "../../server/aiDirector";
import { runAIBotPlaytest } from "../../server/aiBotPlaytest";
import { runAIDirectorV1Playtest } from "../../server/aiDirectorV1Playtest";
import { RoomManager } from "../../server/roomManager";

describe("AI Director", () => {
  test("defines three personas and fifteen whitelisted encounter templates", () => {
    expect(AI_PERSONAS.map((persona) => persona.id)).toEqual(["arena-rival", "calm-mentor", "control-trickster"]);
    expect(BATTLEFIELD_MODIFIERS.length).toBeGreaterThanOrEqual(10);
    expect(DIRECTOR_OBJECTIVES.length).toBeGreaterThanOrEqual(11);
    expect(ENCOUNTER_TEMPLATES).toHaveLength(15);
    expect(ENCOUNTER_TEMPLATES.map((template) => template.id).slice(0, 5)).toEqual([
      "rival-burst-check",
      "mentor-stability-check",
      "trickster-reaction-trap",
      "sustain-dampening-race",
      "controller-caster-lock",
    ]);
    expect(ENCOUNTER_TEMPLATES.map((template) => template.id)).toEqual(expect.arrayContaining([
      "rival-target-discipline",
      "mentor-memory-rematch",
      "trickster-memory-feint",
      "controller-line-tax",
    ]));
    expect(() => validateDirectorWhitelists()).not.toThrow();
  });

  test("creates deterministic encounter specs and falls back to a whitelisted template", () => {
    const first = createDirectorEncounter("ROOM42", "trickster-reaction-trap", "fixed-seed");
    const second = createDirectorEncounter("ROOM42", "trickster-reaction-trap", "fixed-seed");
    const fallback = createDirectorEncounter("ROOM42", "missing-template", "fixed-seed");

    expect(first.encounter).toEqual(second.encounter);
    expect(first.encounter.personaId).toBe("control-trickster");
    expect(first.trace.outputType).toBe("encounter");
    expect(first.dialogueTrace.outputType).toBe("dialogue");
    expect(fallback.encounter.templateId).toBe(ENCOUNTER_TEMPLATES[0].id);
    expect(fallback.trace.fallbackUsed).toBe(true);
  });

  test("generates public per-turn intent without hidden hand details", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");
    const room = manager.getRoom(blue.roomCode)!;
    const encounter = createDirectorEncounter(blue.roomCode, "rival-burst-check").encounter;

    const intent = createIntentHint(blue.roomCode, room.version, room.state, encounter, "red");

    expect(intent.hint.turn).toBe(room.state.round);
    expect(intent.hint.text).toContain("Enemy intent");
    expect(intent.hint.text).not.toContain("hand");
    expect(intent.hint.text).not.toContain("deck");
    expect(intent.trace.output).toEqual(intent.hint);
  });

  test("builds replay-based post-game summary from command replay entries", () => {
    const result = runAIBotPlaytest({
      maxSteps: 18,
      encounterTemplateId: "mentor-stability-check",
    });

    expect(result.director).not.toBeNull();
    expect(result.director?.encounter.templateId).toBe("mentor-stability-check");
    expect(result.director?.intentHints.length).toBeGreaterThan(0);
    expect(result.director?.dialogue.length).toBeGreaterThan(0);
    expect(result.director?.postGameSummary.matchId).toBe(result.summary.roomCode);
    expect(result.director?.postGameSummary.keyTurns.length).toBeGreaterThan(0);
    expect(result.director?.postGameSummary.structuredReview?.sections.length).toBeGreaterThanOrEqual(3);
    expect(result.director?.playerMemory?.matchCount).toBe(1);
    expect(result.director?.aiMetrics.directorTraceCount).toBeGreaterThan(0);
    expect(result.director?.traces.every((trace) => trace.roomCode === result.summary.roomCode)).toBe(true);

    const parsed = JSON.parse(result.json);
    expect(parsed.director.postGameSummary.decisiveMoment).toBe(result.director?.postGameSummary.decisiveMoment);
    expect(parsed.replay.length).toBeGreaterThan(0);
    expect(result.markdown).toContain("AI Director v1");
  });

  test("post-game summary is derived from replay counters", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");
    manager.submitCommand(blue.roomCode, "blue", blue.seatToken, {
      type: "activateHero",
      playerId: "blue",
      heroId: "blue-rogue",
    });
    const room = manager.getRoom(blue.roomCode)!;
    const encounter = createDirectorEncounter(blue.roomCode, "rival-burst-check").encounter;
    const summary = manager.summarize(blue.roomCode);

    const postGame = createPostGameSummary(blue.roomCode, room.replay, summary, encounter, "blue");

    expect(postGame.summary.matchId).toBe(blue.roomCode);
    expect(postGame.summary.nextRunSuggestion).toContain("1 command(s)");
    expect(postGame.summary.structuredReview?.result.commandCount).toBe(1);
    expect(postGame.summary.playerMemory?.matchCount).toBe(1);
    expect(postGame.summary.aiMetrics?.decisionTraceCount).toBe(0);
    expect(postGame.trace.inputSummary).toContain("commands=1");
    expect(postGame.memoryTrace.outputType).toBe("memory");
    expect(postGame.metricsTrace.outputType).toBe("metrics");
  });

  test("tracks AI cost, latency, and fallback metrics with useful precision", () => {
    const metrics = summarizeAIMetrics([
      {
        traceId: "trace-template",
        roomCode: "ROOM42",
        source: "template",
        inputSummary: "template",
        outputType: "encounter",
        output: {},
        latencyMs: 4,
        fallbackUsed: false,
      },
      {
        traceId: "trace-llm",
        roomCode: "ROOM42",
        source: "llm",
        inputSummary: "llm",
        outputType: "summary",
        output: {},
        latencyMs: 9,
        fallbackUsed: true,
      },
    ], [{ fallbackUsed: true }, { fallbackUsed: false }]);

    expect(metrics.cost).toMatchObject({
      estimatedUsd: 0.002,
      llmCallCount: 1,
      templateCallCount: 1,
    });
    expect(metrics.latency.totalMs).toBe(13);
    expect(metrics.fallback.totalFallbackCount).toBe(2);
  });

  test("runs a Week 10 Director v1 multi-match memory playtest", () => {
    const result = runAIDirectorV1Playtest({ maxSteps: 36 });

    expect(result.summary.runCount).toBe(3);
    expect(result.summary.encounterTemplateCount).toBe(15);
    expect(result.summary.finalMemory?.matchCount).toBe(3);
    expect(result.summary.encounterTemplateIds).toContain("mentor-memory-rematch");
    expect(result.runs.every((run) => run.structuredSectionCount >= 3)).toBe(true);
    expect(result.runs.map((run) => run.memory?.matchCount)).toEqual([1, 2, 3]);
    expect(result.runs.every((run) => run.metrics && run.metrics.directorTraceCount > 0)).toBe(true);
    expect(result.markdown).toContain("Week 10 AI Director v1 Playtest Report");
  });
});
