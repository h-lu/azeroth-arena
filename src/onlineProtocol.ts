import type { Side } from "../packages/data/src";
import type { Command, GameEvent, GameState, PlayerState } from "../packages/rules/src";

export type RoomMode = "local" | "online";
export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "error";

export interface PublicPlayerState extends PlayerState {
  hand: string[];
  deck: string[];
  discard: string[];
  handCount: number;
  deckCount: number;
  discardCount: number;
}

export interface PlayerViewState extends Omit<GameState, "players"> {
  players: Record<Side, PublicPlayerState>;
}

export interface PlayerView {
  roomCode: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  side: Side;
  state: PlayerViewState;
  legalCommands: Command[];
}

export interface RoomSeatState {
  side: Side;
  seatToken: string;
  connected: boolean;
  connectionId: string | null;
  lastSeenAt: string;
}

export interface RoomSeatSnapshot {
  side: Side;
  connected: boolean;
  lastSeenAt: string;
}

export interface RoomSnapshot {
  roomCode: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  round: number;
  winner: Side | null;
  killRound: number | null;
  activeConnectionCount: number;
  seats: Record<Side, RoomSeatSnapshot | null>;
  replaySummary: RoomPlaytestSummary;
}

export interface RoomDiagnostics {
  roomCount: number;
  activeConnectionCount: number;
  timestamp: string;
  rooms: RoomSnapshot[];
}

export interface HealthCheckPayload {
  status: "ok";
  uptimeMs: number;
  roomCount: number;
  activeConnectionCount: number;
  timestamp: string;
}

export interface RoomReplayEntry {
  kind: "room" | "command";
  type: "createRoom" | "joinRoom" | "reconnect" | "submitCommand";
  roomCode: string;
  side: Side;
  timestamp: string;
  version: number;
  round: number;
  command?: Command;
  events?: GameEvent[];
  error?: string;
  openedReactionWindow?: boolean;
  interrupted?: boolean;
  trinketUsed?: boolean;
}

export interface RoomPlaytestSummary {
  roomCode: string;
  version: number;
  round: number;
  winner: Side | null;
  killRound: number | null;
  logCount: number;
  responseWindowCount: number;
  interruptCount: number;
  trinketUseCount: number;
  commandCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReplayExportBundle {
  summary: RoomPlaytestSummary;
  json: string;
  csv: string;
  markdown: string;
}

export interface RoomJoinedPayload {
  roomCode: string;
  side: Side;
  seatToken: string;
  playerView: PlayerView;
}

export interface RoomErrorPayload {
  roomCode?: string;
  side?: Side;
  code: string;
  message: string;
}

export interface RoomJoinedMessage {
  type: "roomJoined";
  payload: RoomJoinedPayload;
}

export interface PlayerViewMessage {
  type: "playerView";
  payload: PlayerView;
}

export interface RoomErrorMessage {
  type: "roomError";
  payload: RoomErrorPayload;
}

export interface ReplayExportMessage {
  type: "replayExport";
  payload: {
    roomCode: string;
    export: ReplayExportBundle;
  };
}

export interface OpponentDisconnectedMessage {
  type: "opponentDisconnected";
  payload: {
    roomCode: string;
    side: Side;
  };
}

export type ServerMessage =
  | RoomJoinedMessage
  | PlayerViewMessage
  | RoomErrorMessage
  | ReplayExportMessage
  | OpponentDisconnectedMessage;

export interface CreateRoomRequest {
  type: "createRoom";
  preferredSide?: Side;
}

export interface JoinRoomRequest {
  type: "joinRoom";
  roomCode: string;
  preferredSide?: Side;
}

export interface ReconnectRequest {
  type: "reconnect";
  roomCode: string;
  side: Side;
  seatToken: string;
}

export interface SubmitCommandRequest {
  type: "submitCommand";
  roomCode: string;
  side: Side;
  seatToken: string;
  command: Command;
  expectedVersion?: number;
}

export interface ExportReplayRequest {
  type: "exportReplay";
  roomCode: string;
  side: Side;
  seatToken: string;
}

export type ClientMessage =
  | CreateRoomRequest
  | JoinRoomRequest
  | ReconnectRequest
  | SubmitCommandRequest
  | ExportReplayRequest;
