import { describe, expect, test } from "vitest";
import { applyCommand, createInitialGameState, type Command } from "../../packages/rules/src";

function runScript() {
  let state = createInitialGameState();
  state.heroes["blue-mage"].zone = "center";
  state.heroes["blue-priest"].zone = "center";
  state.heroes["red-warrior"].zone = "center";
  state.heroes["red-warlock"].zone = "center";
  state.heroes["red-druid"].zone = "center";
  state.players.blue.hand = ["013-mage-frostbolt", "018-mage-pyroblast", "044-common-pillar-dance"];
  state.players.red.hand = ["034-warlock-spell-lock", "047-common-team-protection"];
  state.players.blue.deck = [];
  state.players.red.deck = [];
  state.players.blue.focusAvailable = 20;
  state.players.red.focusAvailable = 20;
  state.players.blue.focusTargetId = "red-druid";
  state.players.blue.focusBonusUsed = false;

  const commands: Command[] = [
    { type: "activateHero", playerId: "blue", heroId: "blue-mage" },
    { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "013-mage-frostbolt", targetIds: ["red-warrior"] },
    { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["red-warrior"] },
    { type: "pass", playerId: "red" },
    { type: "activateHero", playerId: "blue", heroId: "blue-priest" },
    { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "044-common-pillar-dance", targetIds: ["blue-mage"] },
    { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", pass: true },
    { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-priest", pass: true },
    { type: "pass", playerId: "red" },
    { type: "pass", playerId: "blue" },
    { type: "startTurn", playerId: "red" },
    { type: "selectFocusTarget", playerId: "blue", targetId: "red-druid" },
    { type: "pass", playerId: "red" },
    { type: "activateHero", playerId: "blue", heroId: "blue-mage" },
    { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "018-mage-pyroblast", targetIds: ["red-warrior"] },
    { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "047-common-team-protection", targetIds: ["red-warrior"] },
    { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-mage", pass: true },
  ];

  for (const command of commands) {
    const result = applyCommand(state, command);
    expect(result.errors).toEqual([]);
    state = result.state;
  }

  return state;
}

describe("replay determinism", () => {
  test("the same command sequence produces the same final state and log", () => {
    const first = runScript();
    const second = runScript();

    expect(first).toEqual(second);
    expect(first.log).toEqual(second.log);
    expect(first.heroes["red-warrior"].hp).toBe(11);
    expect(first.log[first.log.length - 1]?.type).toBe("damage");
  });
});
