import { describe, expect, test } from "vitest";
import { fail, newGame, run } from "./utils";

describe("activation flow", () => {
  test("each hero can activate once per round and resets on a new round", () => {
    let state = newGame();

    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    state = run(state, { type: "pass", playerId: "blue" });
    fail(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });

    expect(state.currentPlayer).toBe("red");
    state = run(state, { type: "pass", playerId: "red" });
    state = run(state, { type: "pass", playerId: "blue" });
    state = run(state, { type: "startTurn", playerId: "red" });

    expect(state.round).toBe(2);
    expect(state.startingPlayer).toBe("red");
    expect(state.currentPlayer).toBe("red");
    expect(state.heroes["blue-rogue"].activatedThisRound).toBe(false);

    state = run(state, { type: "pass", playerId: "red" });
    state = run(state, { type: "activateHero", playerId: "blue", heroId: "blue-rogue" });
    expect(state.activation?.heroId).toBe("blue-rogue");
  });
});
