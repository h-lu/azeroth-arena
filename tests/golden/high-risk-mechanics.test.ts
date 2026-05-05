import { describe, expect, test } from "vitest";
import type { GameState } from "../../packages/rules/src";
import { hero, newGame, run, setDeck, setHand } from "./utils";

function passReactionWindow(state: GameState, responderHeroId: string) {
  const window = state.pendingReaction;
  expect(window).not.toBeNull();

  const responderSide = window!.sourceSide === "blue" ? "red" : "blue";
  state = run(state, { type: "resolveReaction", playerId: responderSide, sourceHeroId: responderHeroId, pass: true });
  state = run(state, { type: "resolveReaction", playerId: window!.sourceSide, sourceHeroId: window!.sourceHeroId, pass: true });
  return state;
}

describe("high-risk mechanics", () => {
  test("spell windows can be interrupted and stop the payload", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-warrior"].shield = 0;
    setHand(state, "blue", ["013-mage-frostbolt"]);
    setHand(state, "red", ["034-warlock-spell-lock"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "013-mage-frostbolt", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.kind).toBe("spell");

    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("main");
    expect(state.pendingReaction).toBeNull();
    expect(hero(state, "red-warrior").hp).toBe(13);
    expect(state.players.red.discard).toContain("034-warlock-spell-lock");
  });

  test("burst windows allow damage reduction before payload damage resolves", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-druid"].zone = "center";
    state.heroes["red-warrior"].shield = 0;
    state.players.blue.focusTargetId = "red-druid";
    state.players.blue.focusBonusUsed = false;
    state.round = 2;
    setHand(state, "blue", ["018-mage-pyroblast"]);
    setHand(state, "red", ["047-common-team-protection"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "018-mage-pyroblast", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.kind).toBe("spell");

    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "047-common-team-protection", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.stage).toBe("source");

    state = run(state, { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-mage", pass: true });

    expect(state.phase).toBe("main");
    expect(state.pendingReaction).toBeNull();
    expect(hero(state, "red-warrior").hp).toBe(11);
  });

  test("hard control can be broken by trinket without leaving the window open", () => {
    let state = newGame();
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["010-rogue-kidney-shot"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "010-rogue-kidney-shot", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.kind).toBe("control");

    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warrior", useTrinket: true });

    expect(state.phase).toBe("main");
    expect(state.pendingReaction).toBeNull();
    expect(hero(state, "red-warrior").trinketAvailable).toBe(false);
    expect(hero(state, "red-warrior").pendingHardControl).toBe(0);
    expect(hero(state, "red-warrior").decay).toBe(1);
  });

  test("movement windows resolve after both sides pass", () => {
    let state = newGame();
    state.heroes["blue-priest"].zone = "center";
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["044-common-pillar-dance"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "044-common-pillar-dance", targetIds: ["blue-rogue"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.kind).toBe("movement");

    state = passReactionWindow(state, "red-warrior");

    expect(state.phase).toBe("main");
    expect(state.pendingReaction).toBeNull();
    expect(hero(state, "blue-rogue").zone).toBe("left");
  });

  test("diminishing returns downgrade repeated hard control before immunity kicks in", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-warlock"].zone = "center";
    state.players.blue.focusTargetId = "red-druid";
    state.players.blue.focusBonusUsed = false;
    setHand(state, "blue", ["014-mage-polymorph", "022-priest-psychic-scream", "010-rogue-kidney-shot"]);
    setHand(state, "red", []);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);
    state.players.blue.focusAvailable = 20;

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "014-mage-polymorph", targetIds: ["red-warrior"] });
    state = passReactionWindow(state, "red-warlock");

    expect(hero(state, "red-warrior").decay).toBe(1);
    expect(hero(state, "red-warrior").pendingHardControl).toBe(1);

    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "022-priest-psychic-scream", targetIds: ["red-warrior"] });
    state = passReactionWindow(state, "red-warlock");

    expect(hero(state, "red-warrior").decay).toBe(2);
    expect(hero(state, "red-warrior").pendingHardControl).toBe(1);
    expect(hero(state, "red-warrior").nextActivationNoResponse).toBe(true);

    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "010-rogue-kidney-shot", targetIds: ["red-warrior"] });
    state = passReactionWindow(state, "red-warlock");

    expect(hero(state, "red-warrior").decay).toBe(2);
    expect(hero(state, "red-warrior").pendingHardControl).toBe(1);

    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warrior" });

    expect(hero(state, "red-warrior").pendingHardControl).toBe(0);
    expect(hero(state, "red-warrior").decay).toBe(1);
    expect(hero(state, "red-warrior").activatedThisRound).toBe(true);
    expect(state.activation).toBeNull();
  });
});
