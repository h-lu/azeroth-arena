import { describe, expect, test } from "vitest";
import { newGame } from "./utils";

describe("opening state", () => {
  test("loads round 1 with fixed teams, shields, hands, and focus targets", () => {
    const state = newGame();

    expect(state.round).toBe(1);
    expect(state.phase).toBe("main");
    expect(state.currentPlayer).toBe("blue");
    expect(state.players.blue.hand).toHaveLength(5);
    expect(state.players.red.hand).toHaveLength(6);
    expect(state.players.blue.focusTargetId).toBe("red-warrior");
    expect(state.players.red.focusTargetId).toBe("blue-rogue");

    for (const hero of Object.values(state.heroes)) {
      expect(hero.zone).toBe("center");
      expect(hero.shield).toBe(2);
      expect(hero.decay).toBe(0);
      expect(hero.alive).toBe(true);
    }
  });
});
