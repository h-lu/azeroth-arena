import { randomBytes, randomUUID } from "node:crypto";
import { applyCommand, createInitialGameState, getLegalCommands } from "../packages/rules/src";
import type { Command, GameState } from "../packages/rules/src";
import type { Side } from "../packages/data/src";
import {
  AI_PERSONAS,
  BATTLEFIELD_MODIFIERS,
  DIRECTOR_OBJECTIVES,
  createClosingDialogue,
  createDirectorEncounter,
  createIntentHint,
  createPostGameSummary,
} from "./aiDirector";
import { chooseBotCommand, type AIDecisionTrace, type BotPolicyStyle } from "./aiBotPolicy";
import { createReplayExport } from "./playtestExport";
import { buildPlayerView } from "./playerView";
import type {
  AIEncounterDebugState,
  AIEncounterSpec,
  AIDirectorTrace,
  AIDirectorDialogue,
  AIIntentHint,
  AIPersona,
  AIPostGameSummary,
  PublicAIDirectorTrace,
  PublicAIDecisionTrace,
  PlayerView,
  RoomDiagnostics,
  RoomPlaytestSummary,
  RoomReplayEntry,
  RoomSeatSnapshot,
  RoomSeatState,
  RoomSnapshot,
} from "../src/onlineProtocol";

interface AIEncounterRoomState {
  humanSide: Side;
  aiSide: Side;
  aiSeatToken: string;
  encounter: AIEncounterSpec;
  persona: AIPersona;
  intentHints: AIIntentHint[];
  dialogue: AIDirectorDialogue[];
  directorTraces: AIDirectorTrace[];
  decisionTraces: AIDecisionTrace[];
  hintedRounds: Set<number>;
  postGameSummary: AIPostGameSummary | null;
  summaryRegistered: boolean;
  lastStepCount: number;
  lastStoppedReason: AIEncounterDebugState["autoAdvance"]["lastStoppedReason"];
}

export interface RoomRecord {
  roomCode: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  state: GameState;
  seats: Record<Side, RoomSeatState | null>;
  replay: RoomReplayEntry[];
  killRound: number | null;
  aiEncounter: AIEncounterRoomState | null;
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

function createDisconnectedSeat(side: Side): RoomSeatState {
  return {
    side,
    seatToken: seatToken(),
    connected: false,
    connectionId: null,
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

function sideToAct(state: GameState): Side | null {
  if (state.pendingReaction) {
    return state.pendingReaction.stage === "enemy" ? opposite(state.pendingReaction.sourceSide) : state.pendingReaction.sourceSide;
  }
  if (state.phase === "between-rounds") {
    return getLegalCommands(state)[0]?.playerId ?? null;
  }
  if (state.phase === "finished") return null;
  return state.currentPlayer;
}

function botStyleFor(enemyStyle: AIEncounterSpec["enemyStyle"]): BotPolicyStyle {
  return enemyStyle === "trickster" ? "control" : enemyStyle;
}

function byId<T extends { id: string }>(items: readonly T[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

function redactDecisionTrace(trace: AIDecisionTrace): PublicAIDecisionTrace {
  return {
    decisionId: trace.decisionId,
    side: trace.side,
    version: trace.version,
    style: trace.style,
    selectedCommandType: trace.selectedCommand?.type ?? null,
    intent: trace.intent,
    confidence: trace.confidence,
    candidateCount: trace.candidateCount,
    candidateScores: trace.candidateScores.slice(0, 8).map((candidate) => ({
      commandType: candidate.command.type,
      score: candidate.score,
      intent: candidate.intent,
    })),
    fallbackUsed: trace.fallbackUsed,
    reason: trace.fallbackUsed ? trace.reason : trace.intent,
  };
}

const DIRECTOR_TRACE_SENSITIVE_KEYS = new Set([
  "cardid",
  "cardids",
  "command",
  "commands",
  "deck",
  "discard",
  "hand",
  "hidden",
  "legalcommands",
  "messages",
  "prompt",
  "seatToken",
  "selectedcommand",
  "system",
  "token",
].map((key) => key.toLowerCase()));

function redactDirectorText(value: string, path: string, redactedFields: string[]) {
  if (/\b(cardId|command|deck|hand|seatToken|token|hidden|system prompt)\b/i.test(value)) {
    redactedFields.push(path);
    return "[redacted]";
  }
  return value;
}

function redactDirectorValue(value: unknown, path: string, redactedFields: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactDirectorValue(item, `${path}[${index}]`, redactedFields));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (DIRECTOR_TRACE_SENSITIVE_KEYS.has(key.toLowerCase())) {
        redactedFields.push(childPath);
        result[`redactedField${redactedFields.length}`] = "[redacted]";
        continue;
      }
      result[key] = redactDirectorValue(entryValue, childPath, redactedFields);
    }
    return result;
  }
  if (typeof value === "string") {
    return redactDirectorText(value, path, redactedFields);
  }
  return value;
}

function redactDirectorTrace(trace: AIDirectorTrace): PublicAIDirectorTrace {
  const redactedFields: string[] = [];
  const outputPreview = redactDirectorValue(trace.output, "output", redactedFields);
  const inputSummary = redactDirectorText(trace.inputSummary, "inputSummary", redactedFields);
  return {
    traceId: trace.traceId,
    roomCode: trace.roomCode,
    version: trace.version,
    source: trace.source,
    inputSummary,
    outputType: trace.outputType,
    outputPreview,
    latencyMs: trace.latencyMs,
    fallbackUsed: trace.fallbackUsed,
    redactedFieldCount: redactedFields.length,
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
      roomKind: room.aiEncounter ? "aiEncounter" : "pvp",
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
      aiEncounter: null,
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

  createAIEncounter(preferredSide: Side = "blue", encounterTemplateId?: string): RoomJoinResult {
    const state = createInitialGameState();
    const humanSide = preferredSide;
    const aiSide = opposite(humanSide);
    const room: RoomRecord = {
      roomCode: roomCode(),
      createdAt: now(),
      updatedAt: now(),
      version: 1,
      state,
      seats: { blue: null, red: null },
      replay: [],
      killRound: null,
      aiEncounter: null,
    };
    room.seats[humanSide] = createSeat(humanSide);
    const aiSeat = createDisconnectedSeat(aiSide);
    room.seats[aiSide] = aiSeat;
    this.rooms.set(room.roomCode, room);
    this.registerReplay(room, {
      kind: "room",
      type: "createRoom",
      roomCode: room.roomCode,
      side: humanSide,
      timestamp: now(),
      version: room.version,
      round: room.state.round,
    });

    const encounterResult = createDirectorEncounter(room.roomCode, encounterTemplateId);
    const persona = byId(AI_PERSONAS, encounterResult.encounter.personaId) ?? AI_PERSONAS[0];
    room.aiEncounter = {
      humanSide,
      aiSide,
      aiSeatToken: aiSeat.seatToken,
      encounter: encounterResult.encounter,
      persona,
      intentHints: [],
      dialogue: [encounterResult.openingDialogue],
      directorTraces: [encounterResult.trace, encounterResult.dialogueTrace],
      decisionTraces: [],
      hintedRounds: new Set<number>(),
      postGameSummary: null,
      summaryRegistered: false,
      lastStepCount: 0,
      lastStoppedReason: "humanTurn",
    };
    this.registerDirectorTrace(room.roomCode, aiSide, encounterResult.trace);
    this.registerDirectorTrace(room.roomCode, aiSide, encounterResult.dialogueTrace);
    this.refreshAIEncounterDirector(room);

    return {
      roomCode: room.roomCode,
      side: humanSide,
      seatToken: room.seats[humanSide]!.seatToken,
      connectionId: room.seats[humanSide]!.connectionId!,
      playerView: buildPlayerView(room, humanSide),
    };
  }

  joinRoom(roomCodeValue: string, preferredSide?: Side): RoomJoinResult {
    const room = this.getRoomOrThrow(roomCodeValue);
    if (room.aiEncounter) {
      throw new RoomManagerError("ROOM_FULL", "AI encounter rooms do not accept a second human seat");
    }
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
    if (!room.aiEncounter || side !== room.aiEncounter.aiSide) {
      seat.connected = true;
    }
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
    this.refreshAIEncounterDirector(room);
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
    return createReplayExport(room, side);
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

  private refreshAIEncounterDirector(room: RoomRecord) {
    const ai = room.aiEncounter;
    if (!ai) return;
    if (!ai.hintedRounds.has(room.state.round) && !room.state.winner) {
      const intent = createIntentHint(room.roomCode, room.version, room.state, ai.encounter, ai.aiSide);
      ai.intentHints.push(intent.hint);
      ai.directorTraces.push(intent.trace);
      this.registerDirectorTrace(room.roomCode, ai.aiSide, intent.trace);
      ai.hintedRounds.add(room.state.round);
      if (intent.dialogue && intent.dialogueTrace) {
        ai.dialogue.push(intent.dialogue);
        ai.directorTraces.push(intent.dialogueTrace);
        this.registerDirectorTrace(room.roomCode, ai.aiSide, intent.dialogueTrace);
      }
    }
    if (room.state.winner && !ai.summaryRegistered) {
      const summary = createReplayExport(room).summary;
      const summaryResult = createPostGameSummary(room.roomCode, room.replay, summary, ai.encounter, ai.humanSide);
      const closingDialogue = createClosingDialogue(room.roomCode, summary.version, summary.round, ai.encounter);
      ai.postGameSummary = summaryResult.summary;
      ai.dialogue.push(closingDialogue.dialogue);
      ai.directorTraces.push(summaryResult.trace, closingDialogue.trace);
      this.registerDirectorTrace(room.roomCode, ai.aiSide, summaryResult.trace);
      this.registerDirectorTrace(room.roomCode, ai.aiSide, closingDialogue.trace);
      ai.summaryRegistered = true;
    }
  }

  advanceAIEncounter(roomCodeValue: string, maxSteps = 12) {
    const room = this.getRoomOrThrow(roomCodeValue);
    const ai = room.aiEncounter;
    if (!ai) {
      return { stepCount: 0, stoppedReason: "notAIEncounter" as const };
    }

    let stepCount = 0;
    let stoppedReason: AIEncounterDebugState["autoAdvance"]["lastStoppedReason"] = "humanTurn";
    this.refreshAIEncounterDirector(room);
    for (; stepCount < maxSteps; stepCount += 1) {
      if (room.state.winner || room.state.phase === "finished") {
        stoppedReason = "winner";
        break;
      }
      const actingSide = sideToAct(room.state);
      if (actingSide !== ai.aiSide) {
        stoppedReason = "humanTurn";
        break;
      }

      const view = buildPlayerView(room, ai.aiSide);
      const decision = chooseBotCommand(view, botStyleFor(ai.encounter.enemyStyle));
      ai.decisionTraces.push(decision.trace);
      if (ai.decisionTraces.length > 40) {
        ai.decisionTraces.splice(0, ai.decisionTraces.length - 40);
      }
      if (!decision.command) {
        stoppedReason = "noLegalCommand";
        break;
      }
      this.submitCommand(room.roomCode, ai.aiSide, ai.aiSeatToken, decision.command, room.version);
    }
    if (stepCount >= maxSteps && stoppedReason === "humanTurn" && sideToAct(room.state) === ai.aiSide) {
      stoppedReason = "maxSteps";
    }
    this.refreshAIEncounterDirector(room);
    ai.lastStepCount = stepCount;
    ai.lastStoppedReason = stoppedReason;
    return { stepCount, stoppedReason };
  }

  getAIEncounterDebugState(roomCodeValue: string): AIEncounterDebugState | null {
    const room = this.rooms.get(roomCodeValue);
    const ai = room?.aiEncounter;
    if (!room || !ai) return null;
    this.refreshAIEncounterDirector(room);
    const replaySummary = createReplayExport(room).summary;
    return {
      roomCode: room.roomCode,
      humanSide: ai.humanSide,
      aiSide: ai.aiSide,
      encounter: structuredClone(ai.encounter),
      persona: structuredClone(ai.persona),
      battlefieldModifiers: ai.encounter.battlefieldModifierIds
        .map((modifierId) => byId(BATTLEFIELD_MODIFIERS, modifierId))
        .filter((modifier): modifier is NonNullable<typeof modifier> => !!modifier)
        .map((modifier) => ({ ...modifier })),
      objectives: ai.encounter.objectiveIds
        .map((objectiveId) => byId(DIRECTOR_OBJECTIVES, objectiveId))
        .filter((objective): objective is NonNullable<typeof objective> => !!objective)
        .map((objective) => ({ ...objective })),
      intentHints: structuredClone(ai.intentHints).slice(-8),
      dialogue: structuredClone(ai.dialogue).slice(-8),
      directorTraces: ai.directorTraces.slice(-12).map(redactDirectorTrace),
      decisionTraces: ai.decisionTraces.slice(-12).map(redactDecisionTrace),
      replaySummary,
      postGameSummary: ai.postGameSummary ? structuredClone(ai.postGameSummary) : null,
      autoAdvance: {
        lastStepCount: ai.lastStepCount,
        lastStoppedReason: ai.lastStoppedReason,
      },
    };
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
