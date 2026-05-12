import type { ZoneId } from "../../packages/data/src";
import type { Command } from "../../packages/rules/src";
import {
  findPlayCardCommandForTarget,
  findPlayCardCommandForZone,
  getPlayableCardCommands,
  type PlayCardCommand,
} from "./targetModel";

export type BattleDropTarget =
  | { kind: "hero"; heroId: string }
  | { kind: "zone"; zoneId: ZoneId };

export type PlayCardDropResult = {
  command: PlayCardCommand | null;
  feedback: string | null;
};

export function resolvePlayCardDrop(commands: Command[], cardId: string, target: BattleDropTarget): PlayCardDropResult {
  if (target.kind === "hero") {
    const command = findPlayCardCommandForTarget(commands, { cardId, targetId: target.heroId });
    return command
      ? { command, feedback: null }
      : { command: null, feedback: "That hero is not a legal target for the selected card." };
  }

  const zoneCommands = getPlayableCardCommands(commands, cardId).filter((command) => command.toZone === target.zoneId);
  const zoneOnlyCommand = zoneCommands.find((command) => command.targetIds.length === 0) ?? null;
  if (zoneOnlyCommand) return { command: zoneOnlyCommand, feedback: null };

  const zoneCommand = findPlayCardCommandForZone(commands, { cardId, toZone: target.zoneId });
  if (zoneCommand) {
    return {
      command: null,
      feedback: "That card also needs a hero target before choosing this lane.",
    };
  }

  return {
    command: null,
    feedback: "That lane is not a legal target for the selected card.",
  };
}
