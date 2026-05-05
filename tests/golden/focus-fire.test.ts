import { describe, expect, test } from "vitest";
import { hero, newGame, run, setDeck, setHand } from "./utils";

describe("focus fire", () => {
  test("focus mark turns the next hit on that target into bonus damage", () => {
    let state = newGame();
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["blue-priest"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["red-warrior"].shield = 0;
    state.players.blue.focusTargetId = "red-warrior";
    state.players.blue.focusBonusUsed = false;
    setHand(state, "blue", ["045-common-focus-mark", "024-priest-shadow-word-death"]);
    setDeck(state, "blue", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "045-common-focus-mark", targetIds: ["red-warrior"] });

    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "024-priest-shadow-word-death", targetIds: ["red-warrior"] });

    expect(hero(state, "red-warrior").hp).toBe(10);
    expect(state.players.blue.focusBonusUsed).toBe(true);
    expect(state.players.blue.focusTargetId).toBe("red-warrior");
  });
});
