import { describe, expect, test } from "vitest";
import type { Command } from "../../packages/rules/src";
import { resolvePlayCardDrop } from "../../src/battle/dragModel";

const commands: Command[] = [
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "011-mage-fireball", targetIds: ["red-priest"] },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "048-common-tactical-retreat", targetIds: [], toZone: "left" },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-druid", cardId: "042-druid-wild-charge", targetIds: ["red-priest"], toZone: "right" },
];

describe("drag model", () => {
  test("resolves a card dropped on a legal hero target", () => {
    expect(resolvePlayCardDrop(commands, "011-mage-fireball", { kind: "hero", heroId: "red-priest" })).toEqual({
      command: commands[0],
      feedback: null,
    });
  });

  test("resolves a zone-only card dropped on a legal lane", () => {
    expect(resolvePlayCardDrop(commands, "048-common-tactical-retreat", { kind: "zone", zoneId: "left" })).toEqual({
      command: commands[1],
      feedback: null,
    });
  });

  test("guides the player when a lane drop still needs a hero target", () => {
    expect(resolvePlayCardDrop(commands, "042-druid-wild-charge", { kind: "zone", zoneId: "right" })).toEqual({
      command: null,
      feedback: "That card also needs a hero target before choosing this lane.",
    });
  });

  test("rejects an illegal drop without a command", () => {
    expect(resolvePlayCardDrop(commands, "011-mage-fireball", { kind: "zone", zoneId: "left" })).toEqual({
      command: null,
      feedback: "That lane is not a legal target for the selected card.",
    });
  });
});
