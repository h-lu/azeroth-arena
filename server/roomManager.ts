import { randomBytes, randomUUID } from "node:crypto";
import { applyCommand, createInitialGameState } from "../packages/rules/src";
import type { Command, GameState } from "../packages/rules/src";
import type { Side } from "../packages/data/src";
import { createReplayExport } from "./playtestExport";
import { buildPlayerView } from "./playerView";
import type {
  AIDirectorTrace,
  PlayerView,
  RoomDiagnostics,
  RoomPlaytestSummary,
  RoomReplayEntry,
  RoomSeatSnapshot,
  RoomSeatState,
  RoomSnapshot,
} from "../src/onlineProtocol";

export interface RoomRecord {
  roomCode: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  state: GameState;
  seats: Record<Side, RoomSeatState | null>;
  replay: RoomReplayEntry[];
  killRound: number | null;
}

export interface RoomJoinResult {
  roomCode: string;
  side: Side;
  seatToken: string;
  connectionId: string;
  playerView: PlayerView;
}

export class RoomManagerError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "RoomManagerError";
    this.code = code;
  }
}

function now() {
  return new Date().toISOString();
}

function cloneState(state: GameState) {
  return structuredClone(state);
}

function roomCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

function seatToken() {
  return randomUUID().replace(/-/g, "");
}

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function createSeat(side: Side): RoomSeatState {
  return {
    side,
    seatToken: seatToken(),
    connected: true,
    connectionId: randomUUID(),
    lastSeenAt: now(),
  };
}

function chooseSide(preferredSide: Side | undefined, seats: Record<Side, RoomSeatState | null>) {
  if (preferredSide && !seats[preferredSide]) {
    return preferredSide;
  }
  if (!seats.blue) return "blue" as const;
  if (!seats.red) return "red" as const;
  throw new RoomManagerError("ROOM_FULL", "room is already full");
}

function snapshotSeat(seat: RoomSeatState | null): RoomSeatSnapshot | null {
  if (!seat) {
    return null;
  }
  return {
    side: seat.side,
    connected: seat.connected,
    lastSeenAt: seat.lastSeenAt,
  };
}

export class RoomManager {
  private rooms = new Map<string, RoomRecord>();

  getRoom(roomCodeValue: string) {
    return this.rooms.get(roomCodeValue) ?? null;
  }

  private getRoomOrThrow(roomCodeValue: string) {
    const room = this.rooms.get(roomCodeValue);
    if (!room) {
      throw new RoomManagerError("ROOM_NOT_FOUND", `room ${roomCodeValue} not found`);
    }
    return room;
  }

  private getSeatOrThrow(room: RoomRecord, side: Side) {
    const seat = room.seats[side];
    if (!seat) {
      throw new RoomManagerError("SEAT_EMPTY", `seat ${side} is not assigned`);
    }
    return seat;
  }

  private verifySeat(room: RoomRecord, side: Side, seatTokenValue: string, connectionId?: string) {
    const seat = this.getSeatOrThrow(room, side);
    if (seat.seatToken !== seatTokenValue) {
      throw new RoomManagerError("INVALID_SEAT_TOKEN", "seat token does not match");
    }
    if (connectionId && seat.connectionId !== connectionId) {
      throw new RoomManagerError("STALE_CONNECTION", "connection is stale");
    }
    return seat;
  }

  private registerReplay(room: RoomRecord, entry: RoomReplayEntry) {
    room.replay.push(entry);
    room.updatedAt = entry.timestamp;
  }

  private countActiveConnections(room: RoomRecord) {
    return Object.values(room.seats).reduce((count, seat) => count + (seat?.connected ? 1 : 0), 0);
  }

  private buildSnapshot(room: RoomRecord): RoomSnapshot {
    const replaySummary = createReplayExport(room).summary;
    return {
      roomCode: room.roomCode,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      version: room.version,
      round: room.state.round,
      winner: room.state.winner,
      killRound: room.killRound,
      activeConnectionCount: this.countActiveConnections(room),
      seats: {
        blue: snapshotSeat(room.seats.blue),
        red: snapshotSeat(room.seats.red),
      },
      replaySummary,
    };
  }

  createRoom(preferredSide?: Side): RoomJoinResult {
    const state = createInitialGameState();
    const room: RoomRecord = {
      roomCode: roomCode(),
      createdAt: now(),
      updatedAt: now(),
      version: 1,
      state,
      seats: { blue: null, red: null },
      replay: [],
      killRound: null,
    };
    const side = chooseSide(preferredSide, room.seats);
    room.seats[side] = createSeat(side);
    this.registerReplay(room, {
      kind: "room",
      type: "createRoom",
      roomCode: room.roomCode,
      side,
      timestamp: now(),
      version: room.version,
      round: room.state.round,
    });
    this.rooms.set(room.roomCode, room);
    return {
      roomCode: room.roomCode,
      side,
      seatToken: room.seats[side]!.seatToken,
      connectionId: room.seats[side]!.connectionId!,
      playerView: buildPlayerView(room, side),
    };
  }

  joinRoom(roomCodeValue: string, preferredSide?: Side): RoomJoinResult {
    const room = this.getRoomOrThrow(roomCodeValue);
    const side = chooseSide(preferredSide, room.seats);
    room.seats[side] = createSeat(side);
    this.registerReplay(room, {
      kind: "room",
      type: "joinRoom",
      roomCode: room.roomCode,
      side,
      timestamp: now(),
      version: room.version,
      round: room.state.round,
    });
    return {
      roomCode: room.roomCode,
      side,
      seatToken: room.seats[side]!.seatToken,
      connectionId: room.seats[side]!.connectionId!,
      playerView: buildPlayerView(room, side),
    };
  }

  reconnect(roomCodeValue: string, side: Side, seatTokenValue: string): RoomJoinResult {
    const room = this.getRoomOrThrow(roomCodeValue);
    const seat = this.getSeatOrThrow(room, side);
    if (seat.seatToken !== seatTokenValue) {
      throw new RoomManagerError("INVALID_SEAT_TOKEN", "seat token does not match");
    }
    seat.connected = true;
    seat.connectionId = randomUUID();
    seat.lastSeenAt = now();
    this.registerReplay(room, {
      kind: "room",
      type: "reconnect",
      roomCode: room.roomCode,
      side,
      timestamp: now(),
      version: room.version,
      round: room.state.round,
    });
    return {
      roomCode: room.roomCode,
      side,
      seatToken: seat.seatToken,
      connectionId: seat.connectionId!,
      playerView: buildPlayerView(room, side),
    };
  }

  disconnect(roomCodeValue: string, side: Side, connectionId: string) {
    const room = this.getRoomOrThrow(roomCodeValue);
    const seat = this.getSeatOrThrow(room, side);
    if (seat.connectionId !== connectionId) {
      return false;
    }
    seat.connected = false;
    seat.lastSeenAt = now();
    room.updatedAt = seat.lastSeenAt;
    return true;
  }

  submitCommand(roomCodeValue: string, side: Side, seatTokenValue: string, command: Command, expectedVersion?: number, connectionId?: string): RoomJoinResult {
    const room = this.getRoomOrThrow(roomCodeValue);
    const seat = this.verifySeat(room, side, seatTokenValue, connectionId);
    if (command.playerId !== side) {
      throw new RoomManagerError("SIDE_MISMATCH", "command side does not match seat side");
    }
    if (expectedVersion !== undefined && expectedVersion !== room.version) {
      throw new RoomManagerError("VERSION_MISMATCH", `expected version ${expectedVersion}, got ${room.version}`);
    }

    const previousPendingReaction = !!room.state.pendingReaction;
    const result = applyCommand(cloneState(room.state), command);
    if (result.errors.length > 0) {
      throw new RoomManagerError("COMMAND_REJECTED", result.errors[0] ?? "command rejected");
    }

    room.state = result.state;
    room.version += 1;
    room.updatedAt = now();
    seat.connected = true;
    seat.lastSeenAt = room.updatedAt;
    if (room.state.winner && room.killRound === null) {
      room.killRound = room.state.round;
    }

    const entry: RoomReplayEntry = {
      kind: "command",
      type: "submitCommand",
      roomCode: room.roomCode,
      side,
      timestamp: room.updatedAt,
      version: room.version,
      round: room.state.round,
      command,
      events: result.events,
      openedReactionWindow: !previousPendingReaction && !!room.state.pendingReaction,
      interrupted: result.events.some((event) => event.type === "interrupted"),
      trinketUsed: result.events.some((event) => event.type === "trinket"),
    };
    this.registerReplay(room, entry);
    return {
      roomCode: room.roomCode,
      side,
      seatToken: seat.seatToken,
      connectionId: seat.connectionId!,
      playerView: buildPlayerView(room, side),
    };
  }

  exportReplay(roomCodeValue: string, side: Side, seatTokenValue: string): ReturnType<typeof createReplayExport> {
    const room = this.getRoomOrThrow(roomCodeValue);
    this.verifySeat(room, side, seatTokenValue);
    return createReplayExport(room);
  }

  registerDirectorTrace(roomCodeValue: string, side: Side, trace: AIDirectorTrace) {
    const room = this.getRoomOrThrow(roomCodeValue);
    const entry: RoomReplayEntry = {
      kind: "director",
      type: "aiDirector",
      roomCode: room.roomCode,
      side,
      timestamp: now(),
      version: trace.version ?? room.version,
      round: room.state.round,
      directorTrace: trace,
    };
    this.registerReplay(room, entry);
    return entry;
  }

  summarize(roomCodeValue: string): RoomPlaytestSummary {
    const room = this.getRoomOrThrow(roomCodeValue);
    return createReplayExport(room).summary;
  }

  getRoomSnapshot(roomCodeValue: string) {
    const room = this.rooms.get(roomCodeValue);
    return room ? this.buildSnapshot(room) : null;
  }

  getDiagnostics(): RoomDiagnostics {
    const rooms = [...this.rooms.values()]
      .map((room) => this.buildSnapshot(room))
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode));
    return {
      roomCount: rooms.length,
      activeConnectionCount: rooms.reduce((count, room) => count + room.activeConnectionCount, 0),
      timestamp: now(),
      rooms,
    };
  }
}

export function createRoomManager() {
  return new RoomManager();
}
