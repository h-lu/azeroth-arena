import { describe, expect, test } from "vitest";
import { createInitialGameState } from "../../packages/rules/src";
import type { AIEncounterDebugState, PlayerView } from "../../src/onlineProtocol";
import { buildBattleViewModel } from "../../src/battle/battleState";

function makeView(): PlayerView {
  const state = createInitialGameState();
  return {
    roomCode: "ROOM42",
    version: 1,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    side: "blue",
    state: {
      ...state,
      players: {
        blue: {
          ...state.players.blue,
          handCount: state.players.blue.hand.length,
          deckCount: state.players.blue.deck.length,
          discardCount: state.players.blue.discard.length,
        },
        red: {
          ...state.players.red,
          hand: [],
          deck: [],
          discard: [],
          handCount: state.players.red.hand.length,
          deckCount: state.players.red.deck.length,
          discardCount: state.players.red.discard.length,
        },
      },
    },
    legalCommands: [{ type: "pass", playerId: "blue" }],
  };
}

describe("battle view model", () => {
  test("groups heroes by zone with viewer and opponent sides", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.viewerSide).toBe("blue");
    expect(model.zones.map((zone) => zone.id)).toEqual(["left", "center", "right"]);
    expect(model.zones.flatMap((zone) => zone.friendlyHeroes).every((hero) => hero.side === "blue")).toBe(true);
    expect(model.zones.flatMap((zone) => zone.enemyHeroes).every((hero) => hero.side === "red")).toBe(true);
  });

  test("enriches hand ids with card definitions", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.hand.length).toBeGreaterThan(0);
    expect(model.hand[0].id).toBeTruthy();
    expect(model.hand[0].name).toBeTruthy();
  });

  test("keeps hidden opponent hand as counts only", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.opponent.handCount).toBeGreaterThan(0);
    expect(model.opponent.visibleHandIds).toEqual([]);
  });

  test("summarizes public AI intent", () => {
    const ai = {
      intentHints: [{
        turn: 1,
        source: "template",
        threatType: "burst",
        targetEntityIds: ["blue-priest"],
        confidenceBand: "high",
        text: "Pressure the healer.",
      }],
      persona: { name: "Rival" },
      objectives: [{ id: "survive", name: "Survive", publicText: "Win before suppression spikes." }],
    } as AIEncounterDebugState;

    const model = buildBattleViewModel(makeView(), ai);

    expect(model.aiPanel.personaName).toBe("Rival");
    expect(model.aiPanel.intentText).toBe("Pressure the healer.");
    expect(model.aiPanel.objectives).toEqual(["Win before suppression spikes."]);
  });
});
