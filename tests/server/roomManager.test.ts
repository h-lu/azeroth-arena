import { describe, expect, test } from "vitest";
import { RoomManager, RoomManagerError } from "../../server/roomManager";

function expectRoomError(fn: () => unknown, code: string) {
  try {
    fn();
    throw new Error("expected RoomManagerError");
  } catch (error) {
    expect(error).toBeInstanceOf(RoomManagerError);
    expect((error as RoomManagerError).code).toBe(code);
  }
}

describe("RoomManager online MVP", () => {
  test("create and join assign opposite seats with seat tokens", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    const red = manager.joinRoom(blue.roomCode, "red");

    expect(blue.side).toBe("blue");
    expect(red.side).toBe("red");
    expect(blue.seatToken).not.toBe(red.seatToken);
    expect(manager.getRoom(blue.roomCode)?.seats.blue?.connected).toBe(true);
    expect(manager.getRoom(blue.roomCode)?.seats.red?.connected).toBe(true);
  });

  test("submitCommand advances authoritative state and version", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");

    const result = manager.submitCommand(blue.roomCode, "blue", blue.seatToken, {
      type: "activateHero",
      playerId: "blue",
      heroId: "blue-rogue",
    }, blue.playerView.version);

    expect(result.playerView.version).toBe(2);
    expect(result.playerView.state.heroes["blue-rogue"].activatedThisRound).toBe(true);
    expect(manager.getRoom(blue.roomCode)?.version).toBe(2);
  });

  test("wrong seat token is rejected", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");

    expectRoomError(() => {
      manager.submitCommand(blue.roomCode, "blue", "bad-token", {
        type: "activateHero",
        playerId: "blue",
        heroId: "blue-rogue",
      });
    }, "INVALID_SEAT_TOKEN");
  });

  test("player view masks opponent hand and deck while preserving counts", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    const red = manager.joinRoom(blue.roomCode, "red");

    expect(blue.playerView.state.players.blue.hand.length).toBeGreaterThan(0);
    expect(blue.playerView.state.players.red.hand).toEqual([]);
    expect(blue.playerView.state.players.red.handCount).toBeGreaterThan(0);

    expect(red.playerView.state.players.red.hand.length).toBeGreaterThan(0);
    expect(red.playerView.state.players.blue.hand).toEqual([]);
    expect(red.playerView.state.players.blue.handCount).toBeGreaterThan(0);
  });

  test("replay export returns json csv markdown summaries", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");
    manager.submitCommand(blue.roomCode, "blue", blue.seatToken, {
      type: "activateHero",
      playerId: "blue",
      heroId: "blue-rogue",
    });

    const bundle = manager.exportReplay(blue.roomCode, "blue", blue.seatToken);
    expect(bundle.summary.commandCount).toBe(1);
    expect(bundle.csv).toContain("roomCode,version,round");
    expect(bundle.markdown).toContain("Azeroth Arena Playtest Export");
    expect(JSON.parse(bundle.json).summary.roomCode).toBe(blue.roomCode);
  });

  test("room snapshot excludes seat tokens and summarizes active connections", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");

    const snapshot = manager.getRoomSnapshot(blue.roomCode);

    expect(snapshot).not.toBeNull();
    expect(snapshot?.roomCode).toBe(blue.roomCode);
    expect(snapshot?.activeConnectionCount).toBe(2);
    expect(snapshot?.seats.blue).not.toHaveProperty("seatToken");
    expect(snapshot?.seats.red).not.toHaveProperty("seatToken");
    expect(snapshot?.replaySummary.commandCount).toBe(0);
  });

  test("disconnect preserves the seat and reconnect returns the latest player view", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    const red = manager.joinRoom(blue.roomCode, "red");

    const firstCommand = manager.submitCommand(blue.roomCode, "blue", blue.seatToken, {
      type: "endTurn",
      playerId: "blue",
    }, blue.playerView.version, blue.connectionId);

    expect(firstCommand.playerView.version).toBe(2);

    expect(manager.disconnect(blue.roomCode, "blue", blue.connectionId)).toBe(true);
    expect(manager.getRoom(blue.roomCode)?.seats.blue?.connected).toBe(false);

    const redCommand = manager.submitCommand(blue.roomCode, "red", red.seatToken, {
      type: "endTurn",
      playerId: "red",
    }, firstCommand.playerView.version, red.connectionId);

    expect(redCommand.playerView.version).toBe(3);

    const blueReconnect = manager.reconnect(blue.roomCode, "blue", blue.seatToken);

    expect(blueReconnect.playerView.version).toBe(3);
    expect(manager.getRoom(blue.roomCode)?.seats.blue?.connected).toBe(true);
  });

  test("stale connection is rejected after reconnect replaces the seat connectionId", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");

    manager.disconnect(blue.roomCode, "blue", blue.connectionId);
    manager.reconnect(blue.roomCode, "blue", blue.seatToken);

    expectRoomError(() => {
      manager.submitCommand(blue.roomCode, "blue", blue.seatToken, {
        type: "endTurn",
        playerId: "blue",
      }, undefined, blue.connectionId);
    }, "STALE_CONNECTION");
  });

  test("AI encounter creates a single-human room with public debug state", () => {
    const manager = new RoomManager();
    const human = manager.createAIEncounter("red", "trickster-reaction-trap");
    const room = manager.getRoom(human.roomCode);

    expect(human.side).toBe("red");
    expect(room?.aiEncounter?.aiSide).toBe("blue");
    expect(room?.seats.red?.connected).toBe(true);
    expect(room?.seats.blue?.connected).toBe(false);
    expect(manager.getDiagnostics().activeConnectionCount).toBe(1);

    const debug = manager.getAIEncounterDebugState(human.roomCode);
    expect(debug?.humanSide).toBe("red");
    expect(debug?.aiSide).toBe("blue");
    expect(debug?.encounter.templateId).toBe("trickster-reaction-trap");
    expect(debug?.objectives.length).toBeGreaterThan(0);
    expect(debug?.battlefieldModifiers.length).toBeGreaterThan(0);
    expect(debug?.intentHints.length).toBeGreaterThan(0);
    expect(JSON.stringify(debug)).not.toContain(room?.aiEncounter?.aiSeatToken ?? "missing-token");
    expect(JSON.stringify(debug?.decisionTraces ?? [])).not.toContain("cardId");
  });

  test("AI encounter auto-advances AI commands through authoritative room state", () => {
    const manager = new RoomManager();
    const human = manager.createAIEncounter("red", "rival-burst-check");

    const advance = manager.advanceAIEncounter(human.roomCode, 8);
    const room = manager.getRoom(human.roomCode);
    const debug = manager.getAIEncounterDebugState(human.roomCode);

    expect(advance.stepCount).toBeGreaterThan(0);
    expect(room?.version).toBeGreaterThan(1);
    expect(debug?.decisionTraces.length).toBeGreaterThan(0);
    expect(debug?.decisionTraces[0]?.selectedCommandType).toBeTruthy();
    expect(debug?.replaySummary.commandCount).toBeGreaterThan(0);
    expect(debug?.autoAdvance.lastStoppedReason).toMatch(/humanTurn|maxSteps|winner|noLegalCommand/);
  });
});
