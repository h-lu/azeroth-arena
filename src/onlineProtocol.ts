import type { Side } from "../packages/data/src";
import type { Command, GameEvent, GameState, PlayerState } from "../packages/rules/src";

export type RoomMode = "local" | "online";
export type OnlineRoomKind = "pvp" | "aiEncounter";
export type ConnectionStatus = "disconnected" | "connecting" | "reconnecting" | "connected" | "error";
export type AIEnemyStyle = "aggressive" | "control" | "sustain" | "trickster";
export type AIPersonaArchetype = "duelist" | "controller" | "mentor" | "trickster" | "rival";
export type AIDirectorSource = "template" | "heuristic" | "llm";
export type AIDirectorOutputType = "encounter" | "intent" | "summary" | "nextRun" | "dialogue" | "memory" | "metrics";
export type AIThreatType = "damage" | "heal" | "defense" | "control" | "interrupt" | "movement" | "burst" | "resource";
export type AIConfidenceBand = "low" | "mid" | "high";

export interface AIPersona {
  id: string;
  name: string;
  archetype: AIPersonaArchetype;
  aggression: number;
  riskTolerance: number;
  bluffFrequency: number;
  resourceGreed: number;
  chatFrequency: number;
  mercy: number;
}

export interface AIEncounterSpec {
  encounterId: string;
  templateId: string;
  seed: string;
  personaId: string;
  enemyStyle: AIEnemyStyle;
  battlefieldModifierIds: string[];
  objectiveIds: string[];
  openingIntent: string;
}

export interface AIIntentHint {
  turn: number;
  source: AIDirectorSource;
  threatType: AIThreatType;
  targetEntityIds: string[];
  confidenceBand: AIConfidenceBand;
  text: string;
}

export interface AIPlayerMemory {
  playerId: string;
  matchCount: number;
  earlyTrinketUseRate: number;
  focusTargetSwitchRate: number;
  reactionPassBias: number;
  preferredTargetRole?: string;
  pressureProfile: "burst" | "control" | "sustain" | "unknown";
  notes: string[];
  updatedAt: string;
}

export interface AIPostGameKeyMoment {
  turn: number;
  label: string;
  evidence: string;
}

export interface AIPostGameReviewSection {
  title: string;
  bullets: string[];
}

export interface AICostMetrics {
  estimatedUsd: number;
  llmCallCount: number;
  heuristicCallCount: number;
  templateCallCount: number;
}

export interface AILatencyMetrics {
  totalMs: number;
  averageMs: number;
  maxMs: number;
}

export interface AIFallbackMetrics {
  directorFallbackCount: number;
  botFallbackCount: number;
  totalFallbackCount: number;
}

export interface AIObservabilityMetrics {
  directorTraceCount: number;
  decisionTraceCount: number;
  cost: AICostMetrics;
  latency: AILatencyMetrics;
  fallback: AIFallbackMetrics;
}

export interface AIPostGameSummary {
  matchId: string;
  keyTurns: number[];
  playerStrengths: string[];
  playerMistakes: string[];
  decisiveMoment: string;
  nextRunSuggestion: string;
  structuredReview?: {
    result: {
      winner: Side | null;
      finalRound: number;
      commandCount: number;
      responseWindowCount: number;
      interruptCount: number;
      trinketUseCount: number;
    };
    keyMoments: AIPostGameKeyMoment[];
    sections: AIPostGameReviewSection[];
  };
  playerMemory?: AIPlayerMemory;
  aiMetrics?: AIObservabilityMetrics;
}

export interface AIDirectorDialogue {
  turn: number;
  personaId: string;
  source: "template";
  line: string;
}

export interface AIDirectorTrace {
  traceId: string;
  roomCode: string;
  version?: number;
  source: AIDirectorSource;
  inputSummary: string;
  outputType: AIDirectorOutputType;
  output: unknown;
  latencyMs: number;
  fallbackUsed: boolean;
}

export interface PublicAIDirectorTrace extends Omit<AIDirectorTrace, "inputSummary" | "output"> {
  inputSummary: string;
  outputPreview: unknown;
  redactedFieldCount: number;
}

export interface PublicAIDecisionCandidateScore {
  commandType: Command["type"];
  score: number;
  intent: string;
}

export interface PublicAIDecisionTrace {
  decisionId: string;
  side: Side;
  version: number;
  style: string;
  selectedCommandType: Command["type"] | null;
  intent: string;
  confidence: number;
  candidateCount: number;
  candidateScores: PublicAIDecisionCandidateScore[];
  fallbackUsed: boolean;
  reason: string;
}

export interface PublicAIDefinition {
  id: string;
  name: string;
  publicText: string;
}

export interface AIEncounterDebugState {
  roomCode: string;
  humanSide: Side;
  aiSide: Side;
  encounter: AIEncounterSpec;
  persona: AIPersona;
  battlefieldModifiers: PublicAIDefinition[];
  objectives: PublicAIDefinition[];
  intentHints: AIIntentHint[];
  dialogue: AIDirectorDialogue[];
  directorTraces: PublicAIDirectorTrace[];
  decisionTraces: PublicAIDecisionTrace[];
  replaySummary: RoomPlaytestSummary;
  postGameSummary: AIPostGameSummary | null;
  playerMemory: AIPlayerMemory | null;
  aiMetrics: AIObservabilityMetrics;
  autoAdvance: {
    lastStepCount: number;
    lastStoppedReason: "humanTurn" | "winner" | "noLegalCommand" | "maxSteps" | "notAIEncounter";
  };
}

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
  roomKind: OnlineRoomKind;
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
  kind: "room" | "command" | "director";
  type: "createRoom" | "joinRoom" | "reconnect" | "submitCommand" | "aiDirector";
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
  directorTrace?: AIDirectorTrace;
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
  roomKind: OnlineRoomKind;
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

export interface AIEncounterUpdatedMessage {
  type: "aiEncounterUpdated";
  payload: AIEncounterDebugState;
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
  | AIEncounterUpdatedMessage
  | OpponentDisconnectedMessage;

export interface CreateRoomRequest {
  type: "createRoom";
  preferredSide?: Side;
}

export interface CreateAIEncounterRequest {
  type: "createAIEncounter";
  preferredSide?: Side;
  encounterTemplateId?: string;
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
  | CreateAIEncounterRequest
  | JoinRoomRequest
  | ReconnectRequest
  | SubmitCommandRequest
  | ExportReplayRequest;
