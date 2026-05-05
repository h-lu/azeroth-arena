import { describe, expect, test } from "vitest";
import { canonicalizeCommand, chooseBotCommand, type BotPolicyStyle } from "../../server/aiBotPolicy";
import { runAIBotPlaytest } from "../../server/aiBotPlaytest";
import { RoomManager } from "../../server/roomManager";

function createBlueView() {
  const manager = new RoomManager();
  const blue = manager.createRoom("blue");
  manager.joinRoom(blue.roomCode, "red");
  return { manager, blue };
}

describe("non-LLM BotPolicy", () => {
  test("selects only commands from PlayerView.legalCommands", () => {
    const { blue } = createBlueView();
    const decision = chooseBotCommand(blue.playerView, "aggressive");
    const legal = new Set(blue.playerView.legalCommands.map((command) => canonicalizeCommand(command)));

    expect(decision.command).not.toBeNull();
    expect(legal.has(canonicalizeCommand(decision.command!))).toBe(true);
    expect(decision.trace.selectedActionId).toBe(decision.actionId);
    expect(decision.trace.candidateCount).toBe(blue.playerView.legalCommands.length);
    expect(decision.trace.candidateScores.length).toBe(blue.playerView.legalCommands.length);
  });

  test("all baseline styles produce executable traces", () => {
    const styles: BotPolicyStyle[] = ["aggressive", "control", "sustain"];

    for (const style of styles) {
      const { manager, blue } = createBlueView();
      const decision = chooseBotCommand(blue.playerView, style);

      expect(decision.command).not.toBeNull();
      expect(decision.trace.style).toBe(style);
      expect(decision.trace.decisionId).toMatch(/^ai_decision_/);
      expect(decision.trace.version).toBe(blue.playerView.version);
      expect(decision.trace.side).toBe("blue");
      expect(decision.trace.confidence).toBeGreaterThan(0);

      const result = manager.submitCommand(blue.roomCode, "blue", blue.seatToken, decision.command!, blue.playerView.version);
      expect(result.playerView.version).toBe(2);
    }
  });

  test("no legal commands fallback returns null and does not throw", () => {
    const { blue } = createBlueView();
    const decision = chooseBotCommand({ ...blue.playerView, legalCommands: [] }, "control");

    expect(decision.command).toBeNull();
    expect(decision.actionId).toBeNull();
    expect(decision.trace.fallbackUsed).toBe(true);
    expect(decision.trace.candidateCount).toBe(0);
    expect(decision.trace.selectedCommand).toBeNull();
  });

  test("AI vs AI playtest core generates replayable result", () => {
    const result = runAIBotPlaytest({
      maxSteps: 16,
      styles: {
        blue: "aggressive",
        red: "sustain",
      },
    });

    expect(result.summary.commandCount).toBeGreaterThan(0);
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.traces.length).toBe(result.steps.length);
    expect(result.stoppedReason).not.toBe("commandRejected");
    expect(JSON.parse(result.json).summary.roomCode).toBe(result.summary.roomCode);
    expect(result.markdown).toContain("AI BotPolicy Playtest");
  });
});
