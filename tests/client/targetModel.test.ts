import { describe, expect, test } from "vitest";
import type { Command } from "../../packages/rules/src";
import {
  findActivateHeroCommand,
  findEndTurnCommand,
  findFocusTargetCommand,
  findPassCommand,
  findPlayCardCommand,
  findPlayCardCommandForTarget,
  findPlayCardCommandForZone,
  getPlayableCardCommands,
  getReactionCommands,
} from "../../src/battle/targetModel";

const commands: Command[] = [
  { type: "pass", playerId: "blue" },
  { type: "endTurn", playerId: "blue" },
  { type: "activateHero", playerId: "blue", heroId: "blue-mage" },
  { type: "selectFocusTarget", playerId: "blue", targetId: "red-priest" },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "011-mage-fireball", targetIds: ["red-priest"] },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-priest", cardId: "019-priest-flash-heal", targetIds: ["blue-mage"] },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "048-common-tactical-retreat", targetIds: [], toZone: "left" },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-druid", cardId: "042-druid-wild-charge", targetIds: ["red-priest"], toZone: "right" },
  { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-mage", pass: true },
  { type: "resolveReaction", playerId: "blue", sourceHeroId: "blue-rogue", cardId: "010-rogue-kick", targetIds: ["red-mage"] },
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

  test("lists playable commands for a selected card", () => {
    expect(getPlayableCardCommands(commands, "011-mage-fireball")).toEqual([commands[4]]);
    expect(getPlayableCardCommands(commands, "missing-card")).toEqual([]);
  });

  test("finds a selected card command by clicked hero target", () => {
    expect(findPlayCardCommandForTarget(commands, {
      cardId: "019-priest-flash-heal",
      targetId: "blue-mage",
    })).toEqual(commands[5]);
    expect(findPlayCardCommandForTarget(commands, {
      cardId: "019-priest-flash-heal",
      targetId: "red-priest",
    })).toBeNull();
  });

  test("extracts reaction commands for the prompt", () => {
    expect(getReactionCommands(commands)).toEqual([commands[8], commands[9]]);
  });

  test("finds a selected card command by clicked zone target", () => {
    expect(findPlayCardCommandForZone(commands, {
      cardId: "048-common-tactical-retreat",
      toZone: "left",
    })).toEqual(commands[6]);
    expect(findPlayCardCommandForZone(commands, {
      cardId: "048-common-tactical-retreat",
      toZone: "right",
    })).toBeNull();
  });

  test("can disambiguate zone commands that also carry a hero target", () => {
    expect(findPlayCardCommandForZone(commands, {
      cardId: "042-druid-wild-charge",
      targetId: "red-priest",
      toZone: "right",
    })).toEqual(commands[7]);
    expect(findPlayCardCommandForZone(commands, {
      cardId: "042-druid-wild-charge",
      targetId: "blue-mage",
      toZone: "right",
    })).toBeNull();
  });
});
