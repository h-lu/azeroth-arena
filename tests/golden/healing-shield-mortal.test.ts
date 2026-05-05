import { describe, expect, test } from "vitest";
import { hero, newGame, run, setDeck, setHand } from "./utils";

describe("healing, shields, and mortal strike", () => {
  test("mortal strike applies healing reduction while shields stay intact", () => {
    let state = newGame();
    state.heroes["blue-priest"].zone = "center";
    state.heroes["red-warrior"].zone = "center";
    state.heroes["blue-priest"].shield = 0;
    state.heroes["blue-priest"].hp = 5;
    setHand(state, "red", ["026-warrior-mortal-strike"]);
    setHand(state, "blue", ["020-priest-power-word-shield", "019-priest-flash-heal"]);
    setDeck(state, "red", []);
    setDeck(state, "blue", []);

    state.currentPlayer = "red";
    state = run(state, { type: "activateHero", playerId: "red", heroId: "red-warrior" });
    state = run(state, { type: "playCard", playerId: "red", sourceHeroId: "red-warrior", cardId: "026-warrior-mortal-strike", targetIds: ["blue-priest"] });

    expect(hero(state, "blue-priest").hp).toBe(2);
    expect(hero(state, "blue-priest").healReduction).toBe(2);

    state.heroes["blue-priest"].activatedThisRound = false;
    state.currentPlayer = "blue";

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "020-priest-power-word-shield", targetIds: ["blue-priest"] });
    expect(hero(state, "blue-priest").shield).toBe(2);

    state.heroes["blue-priest"].activatedThisRound = false;
    state.currentPlayer = "blue";
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-priest" });
    state = run(state, { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "019-priest-flash-heal", targetIds: ["blue-priest"] });
    state = run(state, { type: "resolveReaction", playerId: "red", sourceHeroId: "red-warrior", pass: true });
    state = run(state, { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-priest", pass: true });

    expect(hero(state, "blue-priest").hp).toBe(4);
  });
});
