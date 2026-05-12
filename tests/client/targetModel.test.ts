import { describe, expect, test } from "vitest";
import type { Command } from "../../packages/rules/src";
import {
  findActivateHeroCommand,
  findEndTurnCommand,
  findFocusTargetCommand,
  findPassCommand,
  findPlayCardCommand,
} from "../../src/battle/targetModel";

const commands: Command[] = [
  { type: "pass", playerId: "blue" },
  { type: "endTurn", playerId: "blue" },
  { type: "activateHero", playerId: "blue", heroId: "blue-mage" },
  { type: "selectFocusTarget", playerId: "blue", targetId: "red-priest" },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "011-mage-fireball", targetIds: ["red-priest"] },
];

describe("target model", () => {
  test("finds simple turn commands", () => {
    expect(findPassCommand(commands)).toEqual({ type: "pass", playerId: "blue" });
    expect(findEndTurnCommand(commands)).toEqual({ type: "endTurn", playerId: "blue" });
  });

  test("finds hero and focus commands", () => {
    expect(findActivateHeroCommand(commands, "blue-mage")).toEqual({ type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    expect(findFocusTargetCommand(commands, "red-priest")).toEqual({ type: "selectFocusTarget", playerId: "blue", targetId: "red-priest" });
  });

  test("finds a card command by source, card, and targets", () => {
    expect(findPlayCardCommand(commands, {
      sourceHeroId: "blue-mage",
      cardId: "011-mage-fireball",
      targetIds: ["red-priest"],
    })).toEqual(commands[4]);
  });
});
