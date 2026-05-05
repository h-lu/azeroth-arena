import { describe, expect, test } from "vitest";
import type { GameState } from "../../packages/rules/src";
import { fail, hero, newGame, run, setDeck, setHand } from "./utils";

function passWindow(state: GameState, enemyHeroId: string, sourceHeroId: string) {
  const window = state.pendingReaction;
  expect(window).not.toBeNull();
  const enemy = window!.sourceSide === "blue" ? "red" : "blue";
  state = run(state, { type: "resolveReaction", playerId: enemy, sourceHeroId: enemyHeroId, pass: true });
  return run(state, { type: "resolveReaction", playerId: window!.sourceSide, sourceHeroId, pass: true });
}

function startNextRound(state: GameState) {
  const nextStarter = state.startingPlayer === "blue" ? "red" : "blue";
  state = run(state, { type: "pass", playerId: state.currentPlayer });
  state = run(state, { type: "pass", playerId: state.currentPlayer });
  return run(state, { type: "startTurn", playerId: nextStarter });
}

describe("command complete parity", () => {
  test("key movement cards use command toZone choices instead of fixed fallback", () => {
    let state = newGame();
    state.heroes["blue-priest"].zone = "center";
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["044-common-pillar-dance"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-priest",
      cardId: "044-common-pillar-dance",
      targetIds: ["blue-mage"],
      toZone: "right",
    });
    state = passWindow(state, "red-warrior", "blue-priest");

    expect(hero(state, "blue-mage").zone).toBe("right");
    expect(state.log.some((event) => event.type === "move" && event.payload.toZone === "right")).toBe(true);
  });

  test("psychic scream records owner-choice movement when hard control lands", () => {
    let state = newGame();
    state.heroes["blue-priest"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["022-priest-psychic-scream"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-priest",
      cardId: "022-priest-psychic-scream",
      targetIds: ["red-warrior"],
      toZone: "right",
    });
    state = passWindow(state, "red-warrior", "blue-priest");

    expect(hero(state, "red-warrior").pendingHardControl).toBe(1);
    expect(hero(state, "red-warrior").zone).toBe("right");
  });

  test("ordinary damage can carry a single inline defense without opening a response chain", () => {
    let state = newGame();
    state.currentPlayer = "red";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["blue-mage"].zone = "center";
    state.heroes["blue-mage"].shield = 0;
    setHand(state, "red", ["025-warrior-heroic-strike"]);
    setHand(state, "blue", ["017-mage-ice-barrier"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warrior" });
    state = run(state, {
      type: "playCard",
      playerId: "red",
      sourceHeroId: "red-warrior",
      cardId: "025-warrior-heroic-strike",
      targetIds: ["blue-mage"],
      defenseSourceHeroId: "blue-mage",
      defenseCardId: "017-mage-ice-barrier",
      defenseTargetId: "blue-mage",
    });

    expect(state.phase).toBe("main");
    expect(state.pendingReaction).toBeNull();
    expect(hero(state, "blue-mage").hp).toBe(10);
    expect(state.players.blue.discard).toContain("017-mage-ice-barrier");
    expect(state.log.some((event) => event.type === "inline-defense")).toBe(true);

    state = newGame();
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-druid"].zone = "center";
    state.heroes["red-druid"].shield = 0;
    setHand(state, "blue", ["007-rogue-backstab"]);
    setHand(state, "red", ["041-druid-barkskin"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-rogue",
      cardId: "007-rogue-backstab",
      targetIds: ["red-druid"],
      defenseSourceHeroId: "red-druid",
      defenseCardId: "041-druid-barkskin",
      defenseTargetId: "red-druid",
    });

    expect(hero(state, "red-druid").hp).toBe(11);
    expect(state.players.red.discard).toContain("041-druid-barkskin");
  });

  test("already hard-controlled heroes can break control before skipped activation", () => {
    let state = newGame();
    state.currentPlayer = "red";
    state.heroes["red-warrior"].pendingHardControl = 1;
    state.heroes["red-warrior"].hardControlSourceId = "blue-rogue";

    state = run(state, { type: "useTrinket", playerId: "red", heroId: "red-warrior" });
    expect(hero(state, "red-warrior").pendingHardControl).toBe(0);
    expect(hero(state, "red-warrior").trinketAvailable).toBe(false);
    expect(hero(state, "red-warrior").decay).toBe(1);

    state.heroes["red-druid"].pendingHardControl = 1;
    state.heroes["red-druid"].hardControlSourceId = "blue-mage";
    setHand(state, "red", ["046-common-arena-insignia"]);

    state = run(state, { type: "useTrinket", playerId: "red", heroId: "red-druid", cardId: "046-common-arena-insignia" });
    expect(hero(state, "red-druid").pendingHardControl).toBe(0);
    expect(hero(state, "red-druid").decay).toBe(1);
    expect(state.players.red.discard).toContain("046-common-arena-insignia");
  });

  test("fake cast reveals a specific usable spell card in replayable events", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warlock"].zone = "center";
    setHand(state, "blue", ["043-common-fake-cast", "013-mage-frostbolt", "018-mage-pyroblast"]);
    setHand(state, "red", ["034-warlock-spell-lock"]);
    setDeck(state, "blue", ["007-rogue-backstab"]);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-mage",
      cardId: "043-common-fake-cast",
      targetIds: [],
      revealedCardId: "018-mage-pyroblast",
    });
    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["blue-mage"] });

    expect(state.players.blue.hand).toContain("018-mage-pyroblast");
    expect(state.log.some((event) => event.type === "fake-cast-success" && event.payload.revealedCardId === "018-mage-pyroblast")).toBe(true);

    let invalid = newGame();
    setHand(invalid, "blue", ["043-common-fake-cast", "007-rogue-backstab"]);
    invalid = run(invalid, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    fail(invalid, {
      type: "playCard",
      playerId: "blue",
      sourceHeroId: "blue-rogue",
      cardId: "043-common-fake-cast",
      targetIds: [],
      revealedCardId: "007-rogue-backstab",
    });
  });

  test("interrupt cooldown is public, blocks duplicate use, and expires after the next round", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["red-warlock"].zone = "center";
    setHand(state, "blue", ["013-mage-frostbolt", "019-priest-flash-heal"]);
    setHand(state, "red", ["034-warlock-spell-lock", "034-warlock-spell-lock"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);
    state.players.blue.focusAvailable = 20;
    state.players.red.focusAvailable = 20;

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "013-mage-frostbolt", targetIds: ["red-warlock"] });
    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["blue-mage"] });

    expect(state.players.red.cooldowns[0]).toMatchObject({ cardId: "034-warlock-spell-lock", usedUntilRound: 2 });

    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "019-priest-flash-heal", targetIds: ["blue-mage"] });
    fail(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warlock", cardId: "034-warlock-spell-lock", targetIds: ["blue-priest"] });
    state = passWindow(state, "red-warlock", "blue-priest");

    state = startNextRound(state);
    expect(state.round).toBe(2);
    expect(state.players.red.cooldowns).toHaveLength(1);
    state = startNextRound(state);
    expect(state.round).toBe(3);
    expect(state.players.red.cooldowns).toHaveLength(0);
  });

  test("start-round focus selection and explicit hand-limit discard are command driven", () => {
    let state = newGame();

    state = run(state, { type: "selectFocusTarget", playerId: "blue", targetId: "red-druid" });
    state = run(state, { type: "selectFocusTarget", playerId: "red", targetId: "blue-mage" });
    expect(state.players.blue.focusTargetId).toBe("red-druid");
    expect(state.players.red.focusTargetId).toBe("blue-mage");

    state.phase = "between-rounds";
    state.players.blue.hand = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
    state = run(state, { type: "discardCards", playerId: "blue", cardIds: ["h", "i"] });
    expect(state.players.blue.hand).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect(state.players.blue.discard.slice(-2)).toEqual(["h", "i"]);
    state = run(state, { type: "startTurn", playerId: "red" });
    expect(state.round).toBe(2);
  });
});
