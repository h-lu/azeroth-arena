import type { ZoneId } from "../../packages/data/src";
import type { Command } from "../../packages/rules/src";

type PlayCardQuery = {
  sourceHeroId: string;
  cardId: string;
  targetIds: string[];
  toZone?: ZoneId;
};

function sameTargets(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function findPassCommand(commands: Command[]) {
  return commands.find((command) => command.type === "pass") ?? null;
}

export function findEndTurnCommand(commands: Command[]) {
  return commands.find((command) => command.type === "endTurn") ?? null;
}

export function findActivateHeroCommand(commands: Command[], heroId: string) {
  return commands.find((command) => command.type === "activateHero" && command.heroId === heroId) ?? null;
}

export function findFocusTargetCommand(commands: Command[], targetId: string) {
  return commands.find((command) => command.type === "selectFocusTarget" && command.targetId === targetId) ?? null;
}

export function findPlayCardCommand(commands: Command[], query: PlayCardQuery) {
  return commands.find((command) => (
    command.type === "playCard"
    && command.sourceHeroId === query.sourceHeroId
    && command.cardId === query.cardId
    && sameTargets(command.targetIds, query.targetIds)
    && command.toZone === query.toZone
  )) ?? null;
}
