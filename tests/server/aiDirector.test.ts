import { describe, expect, test } from "vitest";
import {
  AI_PERSONAS,
  BATTLEFIELD_MODIFIERS,
  DIRECTOR_OBJECTIVES,
  ENCOUNTER_TEMPLATES,
  createDirectorEncounter,
  createIntentHint,
  createPostGameSummary,
  validateDirectorWhitelists,
} from "../../server/aiDirector";
import { runAIBotPlaytest } from "../../server/aiBotPlaytest";
import { RoomManager } from "../../server/roomManager";

describe("AI Director v0", () => {
  test("defines three personas and whitelisted encounter templates", () => {
    expect(AI_PERSONAS.map((persona) => persona.id)).toEqual(["arena-rival", "calm-mentor", "control-trickster"]);
    expect(BATTLEFIELD_MODIFIERS.length).toBeGreaterThanOrEqual(3);
    expect(DIRECTOR_OBJECTIVES.length).toBeGreaterThanOrEqual(3);
    expect(ENCOUNTER_TEMPLATES.length).toBeGreaterThanOrEqual(3);
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
    expect(result.director?.traces.every((trace) => trace.roomCode === result.summary.roomCode)).toBe(true);

    const parsed = JSON.parse(result.json);
    expect(parsed.director.postGameSummary.decisiveMoment).toBe(result.director?.postGameSummary.decisiveMoment);
    expect(result.markdown).toContain("AI Director v0");
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
    expect(postGame.trace.inputSummary).toContain("commands=1");
  });
});
