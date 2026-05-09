import { describe, expect, test } from "vitest";
import { applyCommand, createInitialGameState } from "../../packages/rules/src";
import { RoomManager } from "../../server/roomManager";

describe("visual replay events", () => {
  test("round start draws are exported as queue-compatible public GameEvents", () => {
    const manager = new RoomManager();
    const blue = manager.createRoom("blue");
    manager.joinRoom(blue.roomCode, "red");
    const room = manager.getRoom(blue.roomCode);

    expect(room).not.toBeNull();
    room!.state.phase = "between-rounds";
    room!.state.players.blue.hand = [];
    room!.state.players.red.hand = [];
    room!.state.players.blue.deck = ["013-mage-frostbolt", "014-mage-polymorph"];
    room!.state.players.red.deck = ["025-warrior-heroic-strike", "026-warrior-mortal-strike"];

    manager.submitCommand(blue.roomCode, "red", room!.seats.red!.seatToken, {
      type: "startTurn",
      playerId: "red",
    });

    const bundle = manager.exportReplay(blue.roomCode, "blue", blue.seatToken);
    const parsed = JSON.parse(bundle.json) as {
      replayEvents: Array<{
        kind: string;
        command?: { type: string };
        events?: Array<{ type: string; payload: Record<string, unknown> }>;
      }>;
    };
    const startTurnEntry = parsed.replayEvents.find((entry) => entry.kind === "command" && entry.command?.type === "startTurn");

    expect(startTurnEntry?.events?.map((event) => event.type)).toEqual(["round-start", "card-drawn", "card-drawn"]);
    expect(startTurnEntry?.events?.[1]).toMatchObject({
      type: "card-drawn",
      payload: { playerId: "blue", amount: 2, handCount: 2, deckCount: 0 },
    });
    expect(startTurnEntry?.events?.[2]).toMatchObject({
      type: "card-drawn",
      payload: { playerId: "red", amount: 2, handCount: 2, deckCount: 0 },
    });
    expect(startTurnEntry?.events?.[1]?.payload).not.toHaveProperty("cardId");
    expect(startTurnEntry?.events?.[2]?.payload).not.toHaveProperty("cardId");
  });

  test("fatal damage events are ordered before knockout for visual playback", () => {
    let state = createInitialGameState();
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-warrior"].hp = 1;
    state.heroes["red-warrior"].shield = 0;
    state.players.blue.hand = ["007-rogue-backstab"];
    state.players.blue.focusAvailable = 20;

    const activate = applyCommand(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    expect(activate.errors).toEqual([]);

    const played = applyCommand(activate.state, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-rogue",
      cardId: "007-rogue-backstab",
      targetIds: ["red-warrior"],
    });

    expect(played.errors).toEqual([]);
    expect(played.events.map((event) => event.type)).toEqual(["card-played", "damage", "knockout"]);
  });
});
