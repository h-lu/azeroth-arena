import { getLegalCommands } from "../packages/rules/src";
import type { GameState, PlayerState } from "../packages/rules/src";
import type { Side } from "../packages/data/src";
import type { PlayerView, PlayerViewState, PublicPlayerState } from "../src/onlineProtocol";
import type { RoomRecord } from "./roomManager";

function cloneState<T>(value: T): T {
  return structuredClone(value);
}

function makePublicPlayerState(player: PlayerState, side: Side, viewerSide: Side): PublicPlayerState {
  const ownSide = side === viewerSide;
  return {
    side,
    hand: ownSide ? [...player.hand] : [],
    deck: ownSide ? [...player.deck] : [],
    discard: ownSide ? [...player.discard] : [],
    handCount: player.hand.length,
    deckCount: player.deck.length,
    discardCount: player.discard.length,
    focusTargetId: player.focusTargetId,
    focusTargetSelectedThisRound: player.focusTargetSelectedThisRound,
    focusBonusUsed: player.focusBonusUsed,
    focusAvailable: player.focusAvailable,
    cooldowns: [...player.cooldowns],
  };
}

function makePlayerViewState(state: GameState, viewerSide: Side): PlayerViewState {
  return {
    ...cloneState(state),
    players: {
      blue: makePublicPlayerState(state.players.blue, "blue", viewerSide),
      red: makePublicPlayerState(state.players.red, "red", viewerSide),
    },
  };
}

export function buildPlayerView(room: RoomRecord, viewerSide: Side): PlayerView {
  const legalCommands = getLegalCommands(room.state).filter((command) => command.playerId === viewerSide);
  return {
    roomCode: room.roomCode,
    version: room.version,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    side: viewerSide,
    state: makePlayerViewState(room.state, viewerSide),
    legalCommands,
  };
}
