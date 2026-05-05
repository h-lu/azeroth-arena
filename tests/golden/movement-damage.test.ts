import { describe, expect, test } from "vitest";
import { hero, newGame, run, setDeck, setHand } from "./utils";

describe("movement and damage", () => {
  test("moveHero can reposition before a melee hit", () => {
    let state = newGame();
    state.heroes["blue-rogue"].zone = "center";
    state.heroes["red-warrior"].zone = "left";
    state.heroes["red-warrior"].shield = 0;
    setHand(state, "blue", ["007-rogue-backstab"]);
    setDeck(state, "blue", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "moveHero", playerId: "blue", heroId: "blue-rogue", toZone: "left" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "007-rogue-backstab", targetIds: ["red-warrior"] });

    expect(hero(state, "blue-rogue").zone).toBe("left");
    expect(hero(state, "red-warrior").hp).toBe(10);
  });
});
