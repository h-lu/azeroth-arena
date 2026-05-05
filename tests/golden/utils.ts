import { expect } from "vitest";
import { applyCommand, createInitialGameState, type Command, type GameState } from "../../packages/rules/src";
import type { Side } from "../../packages/data/src";

export function newGame() {
  return createInitialGameState();
}

export function run(state: GameState, command: Command) {
  const result = applyCommand(state, command);
  expect(result.errors).toEqual([]);
  return result.state;
}

export function fail(state: GameState, command: Command) {
  const result = applyCommand(state, command);
  expect(result.errors.length).toBeGreaterThan(0);
  return result.state;
}

export function setHand(state: GameState, side: Side, cards: string[]) {
  state.players[side].hand = [...cards];
}

export function setDeck(state: GameState, side: Side, cards: string[]) {
  state.players[side].deck = [...cards];
}

export function hero(state: GameState, id: string) {
  return state.heroes[id];
}
