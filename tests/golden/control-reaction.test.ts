import { describe, expect, test } from "vitest";
import { hero, newGame, run, setDeck, setHand } from "./utils";

describe("control and reaction windows", () => {
  test("polymorph opens a reaction window and arena insignia cancels it", () => {
    let state = newGame();
    state.heroes["blue-mage"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    setHand(state, "blue", ["014-mage-polymorph"]);
    setHand(state, "red", ["046-common-arena-insignia"]);
    setDeck(state, "blue", []);
    setDeck(state, "red", []);

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "014-mage-polymorph", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("reaction");
    expect(state.pendingReaction?.kind).toBe("spell");

    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warrior", cardId: "046-common-arena-insignia", targetIds: ["red-warrior"] });

    expect(state.phase).toBe("main");
    expect(hero(state, "red-warrior").pendingHardControl).toBe(0);
    expect(hero(state, "red-warrior").decay).toBe(1);
    expect(hero(state, "red-warrior").activatedThisRound).toBe(false);
    expect(state.pendingReaction).toBeNull();
  });
});
