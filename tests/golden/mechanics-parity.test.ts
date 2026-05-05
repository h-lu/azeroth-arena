import { describe, expect, test } from "vitest";
import { createInitialDeckList } from "../../packages/data/src";
import { fail, hero, newGame, run, setDeck, setHand } from "./utils";

function passOpenWindow(state: ReturnType<typeof newGame>, enemyHeroId: string, sourceHeroId: string) {
  const enemy = state.pendingReaction?.sourceSide === "blue" ? "red" : "blue";
  const source = state.pendingReaction!.sourceSide;
  state = run(state, { type: "resolveReaction", playerId: enemy, sourceHeroId: enemyHeroId, pass: true });
  return run(state, { type: "resolveReaction", playerId: source, sourceHeroId, pass: true });
}

function startNextRound(state: ReturnType<typeof newGame>) {
  const nextStarter = state.startingPlayer === "blue" ? "red" : "blue";
  state = run(state, { type: "pass", playerId: state.currentPlayer });
  state = run(state, { type: "pass", playerId: state.currentPlayer });
  return run(state, { type: "startTurn", playerId: nextStarter });
}

describe("mechanics parity contracts", () => {
  test("fake cast can bait an interrupt and draw one card", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warlock"].zone = "center";
    setHand(state, "blue", ["043-common-fake-cast", "018-mage-pyroblast"]);
    setHand(state, "red", ["034-warlock-spell-lock"]);
    setDeck(state, "blue", ["007-rogue-backstab"]);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "043-common-fake-cast", targetIds: [] });
    expect(state.pendingReaction?.kind).toBe("spell");

    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["blue-mage"] });

    expect(state.players.blue.hand).toContain("018-mage-pyroblast");
    expect(state.players.blue.hand).toContain("007-rogue-backstab");
    expect(state.players.blue.discard).toContain("043-common-fake-cast");
    expect(state.log.some((event) => event.type === "fake-cast-success")).toBe(true);
  });

  test("soft control uses shared diminishing returns", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["016-mage-frost-nova", "049-common-pressure-footwork", "049-common-pressure-footwork"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);
    state.players.blue.focusAvailable = 20;

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "016-mage-frost-nova", targetIds: ["red-warrior"] });
    expect(hero(state, "red-warrior").decay).toBe(1);
    expect(hero(state, "red-warrior").nextActivationNoMove).toBe(true);

    hero(state, "red-warrior").nextActivationNoMove = false;
    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "049-common-pressure-footwork", targetIds: ["red-warrior"] });
    expect(hero(state, "red-warrior").decay).toBe(2);
    expect(hero(state, "red-warrior").nextActivationNoMove).toBe(true);

    hero(state, "red-warrior").nextActivationNoMove = false;
    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "049-common-pressure-footwork", targetIds: ["red-warrior"] });

    expect(hero(state, "red-warrior").decay).toBe(2);
    expect(hero(state, "red-warrior").nextActivationNoMove).toBe(false);
    expect(state.log.some((event) => event.type === "control-immune")).toBe(true);
  });

  test("round 1 blocks burst cards while opening shields are present", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["018-mage-pyroblast"]);

    expect(hero(state, "red-warrior").shield).toBe(2);
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    fail(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "018-mage-pyroblast", targetIds: ["red-warrior"] });
  });

  test("suppression follows the round 6/7/8 line", () => {
    let state = newGame();
    for (let round = 2; round <= 8; round += 1) {
      state = startNextRound(state);
      expect(state.round).toBe(round);
      expect(state.suppression).toBe(Math.min(Math.max(round - 5, 0), 3));
    }
  });

  test("corruption deals its delayed damage at round end", () => {
    let state = newGame();
    state.currentPlayer = "red";
    state.heroes["red-warlock"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["blue-priest"].shield = 0;
    setHand(state, "red", ["031-warlock-corruption"]);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warlock" });
    state = run(state, { type: "playCard", playerId: "red", sourceHeroId: "red-warlock", cardId: "031-warlock-corruption", targetIds: ["blue-priest"] });
    expect(hero(state, "blue-priest").hp).toBe(10);

    state = run(state, { type: "pass", playerId: "blue" });
    state = run(state, { type: "pass", playerId: "red" });
    expect(state.phase).toBe("between-rounds");
    expect(hero(state, "blue-priest").hp).toBe(9);
  });

  test("line of sight blocks targeting across both pillars", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "left";
    state.heroes["red-warrior"].zone = "right";
    setHand(state, "blue", ["013-mage-frostbolt"]);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    fail(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "013-mage-frostbolt", targetIds: ["red-warrior"] });
  });

  test("heal reduction keeps only the highest value", () => {
    let state = newGame();
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-warlock"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["blue-priest"].shield = 0;
    setHand(state, "red", ["035-warlock-curse-of-agony", "026-warrior-mortal-strike"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);
    state.currentPlayer = "red";

    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warlock" });
    state = run(state, { type: "playCard", playerId: "red", sourceHeroId: "red-warlock", cardId: "035-warlock-curse-of-agony", targetIds: ["blue-priest"] });
    state = passOpenWindow(state, "blue-priest", "red-warlock");
    expect(hero(state, "blue-priest").healReduction).toBe(1);

    state.currentPlayer = "red";
    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warrior" });
    state = run(state, { type: "playCard", playerId: "red", sourceHeroId: "red-warrior", cardId: "026-warrior-mortal-strike", targetIds: ["blue-priest"] });
    expect(hero(state, "blue-priest").healReduction).toBe(2);
  });

  test("recommended common cards are the fixed 6-card package", () => {
    const recommended = ["043-common-fake-cast", "044-common-pillar-dance", "045-common-focus-mark", "047-common-team-protection", "048-common-tactical-retreat", "050-common-hold-the-line"];

    for (const side of ["blue", "red"] as const) {
      const deck = createInitialDeckList(side);
      for (const cardId of recommended) expect(deck).toContain(cardId);
      expect(deck).not.toContain("046-common-arena-insignia");
      expect(deck).not.toContain("049-common-pressure-footwork");
    }
  });
});
