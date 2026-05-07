import http from "node:http";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebSocketServer, type WebSocket } from "ws";
import { createRoomManager, RoomManagerError } from "./roomManager";
import { buildPlayerView } from "./playerView";
import { createStructuredLogger, serializeError, type StructuredLogger } from "./logger";
import type {
  ClientMessage,
  HealthCheckPayload,
  OpponentDisconnectedMessage,
  ReplayExportMessage,
  RoomErrorMessage,
  RoomJoinedMessage,
  RoomDiagnostics,
  ServerMessage,
} from "../src/onlineProtocol";
import type { Side } from "../packages/data/src";
import type { Command } from "../packages/rules/src";
import type { RoomManager } from "./roomManager";

type SocketSession = {
  roomCode: string;
  side: Side;
  seatToken: string;
  connectionId: string;
};

export interface RoomServerOptions {
  roomManager?: RoomManager;
  logger?: StructuredLogger;
}

export interface RoomServerBundle {
  server: http.Server;
  webSocketServer: WebSocketServer;
  roomManager: RoomManager;
  logger: StructuredLogger;
}

const PORT = Number(process.env.PORT ?? 8788);
const roomManager = createRoomManager();
const logger = createStructuredLogger();
const socketSessions = new Map<WebSocket, SocketSession>();
const socketsByConnectionId = new Map<string, WebSocket>();
const startedAt = Date.now();

function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function sendRoomError(socket: WebSocket, payload: RoomErrorMessage["payload"]) {
  send(socket, { type: "roomError", payload });
}

function bindSession(socket: WebSocket, session: SocketSession) {
  const previous = socketSessions.get(socket);
  if (previous) {
    socketsByConnectionId.delete(previous.connectionId);
  }
  socketSessions.set(socket, session);
  socketsByConnectionId.set(session.connectionId, socket);
}

function getSession(socket: WebSocket) {
  return socketSessions.get(socket) ?? null;
}

function sendJoined(socket: WebSocket, payload: RoomJoinedMessage["payload"]) {
  send(socket, { type: "roomJoined", payload });
  send(socket, { type: "playerView", payload: payload.playerView });
}

function sendAIEncounterUpdate(socket: WebSocket, manager: RoomManager, roomCode: string) {
  const payload = manager.getAIEncounterDebugState(roomCode);
  if (!payload) return;
  send(socket, { type: "aiEncounterUpdated", payload });
}

function broadcastPlayerViews(roomCode: string, manager: RoomManager) {
  const room = manager.getRoom(roomCode);
  if (!room) return;
  for (const side of ["blue", "red"] as const) {
    const seat = room.seats[side];
    if (!seat?.connected) continue;
    const socket = socketsByConnectionId.get(seat.connectionId ?? "");
    if (!socket) continue;
    send(socket, { type: "playerView", payload: buildPlayerView(room, side) });
  }
}

function broadcastAIEncounterUpdate(roomCode: string, manager: RoomManager) {
  const room = manager.getRoom(roomCode);
  const payload = manager.getAIEncounterDebugState(roomCode);
  if (!room || !payload) return;
  const humanSide = payload.humanSide;
  const seat = room.seats[humanSide];
  if (!seat?.connected) return;
  const socket = socketsByConnectionId.get(seat.connectionId ?? "");
  if (!socket) return;
  send(socket, { type: "aiEncounterUpdated", payload });
}

function broadcastOpponentDisconnected(roomCode: string, disconnectedSide: Side, manager: RoomManager) {
  const room = manager.getRoom(roomCode);
  if (!room) return;
  const otherSide: Side = disconnectedSide === "blue" ? "red" : "blue";
  const seat = room.seats[otherSide];
  if (!seat?.connected) return;
  const socket = socketsByConnectionId.get(seat.connectionId ?? "");
  if (!socket) return;
  const message: OpponentDisconnectedMessage = {
    type: "opponentDisconnected",
    payload: { roomCode, side: disconnectedSide },
  };
  send(socket, message);
}

function assertActiveSession(socket: WebSocket, roomCode: string, side: Side, seatToken: string) {
  const session = getSession(socket);
  if (!session || session.roomCode !== roomCode || session.side !== side || session.seatToken !== seatToken) {
    throw new RoomManagerError("AUTH_REQUIRED", "room session is not established");
  }
  return session;
}

function toHealthPayload(diagnostics: RoomDiagnostics): HealthCheckPayload {
  return {
    status: "ok",
    uptimeMs: Date.now() - startedAt,
    roomCount: diagnostics.roomCount,
    activeConnectionCount: diagnostics.activeConnectionCount,
    timestamp: diagnostics.timestamp,
  };
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`${JSON.stringify(body, null, 2)}\n`);
}

function createHttpHandler(roomManagerInstance: RoomManager) {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    const method = req.method ?? "GET";
    const url = new URL(req.url ?? "/", "http://localhost");
    if (method !== "GET") {
      res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed\n");
      return;
    }
    if (url.pathname === "/healthz") {
      sendJson(res, 200, toHealthPayload(roomManagerInstance.getDiagnostics()));
      return;
    }
    if (url.pathname === "/debug/rooms") {
      sendJson(res, 200, roomManagerInstance.getDiagnostics());
      return;
    }
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    res.end("Azeroth Arena room server is running.\n");
  };
}

function makeErrorPayload(error: unknown) {
  if (error instanceof RoomManagerError) {
    return { code: error.code, message: error.message };
  }
  return { code: "SERVER_ERROR", message: error instanceof Error ? error.message : String(error) };
}

function handleError(socket: WebSocket, loggerInstance: StructuredLogger, error: unknown, context: Record<string, unknown>) {
  const payload = makeErrorPayload(error);
  loggerInstance.error("error", {
    ...context,
    ...payload,
    ...serializeError(error),
  });
  sendRoomError(socket, payload);
}

function badMessage(message: string): never {
  throw new RoomManagerError("BAD_MESSAGE", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isSide(value: unknown): value is Side {
  return value === "blue" || value === "red";
}

function optionalSide(value: unknown, fieldName: string): Side | undefined {
  if (value === undefined) return undefined;
  if (isSide(value)) return value;
  badMessage(`${fieldName} must be blue or red`);
}

function requiredString(value: unknown, fieldName: string) {
  if (typeof value === "string" && value.length > 0) return value;
  badMessage(`${fieldName} must be a non-empty string`);
}

function optionalString(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  return requiredString(value, fieldName);
}

function optionalNumber(value: unknown, fieldName: string) {
  if (value === undefined) return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  badMessage(`${fieldName} must be a finite number`);
}

function requiredCommand(value: unknown) {
  if (!isRecord(value) || typeof value.type !== "string" || !isSide(value.playerId)) {
    badMessage("command must include type and playerId");
  }
  return value as Command;
}

function parseClientMessage(raw: string): ClientMessage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    badMessage("invalid JSON message");
  }

  if (!isRecord(value) || typeof value.type !== "string") {
    badMessage("message type is required");
  }

  switch (value.type) {
    case "createRoom":
      return {
        type: "createRoom",
        preferredSide: optionalSide(value.preferredSide, "preferredSide"),
      };
    case "createAIEncounter":
      return {
        type: "createAIEncounter",
        preferredSide: optionalSide(value.preferredSide, "preferredSide"),
        encounterTemplateId: optionalString(value.encounterTemplateId, "encounterTemplateId"),
      };
    case "joinRoom":
      return {
        type: "joinRoom",
        roomCode: requiredString(value.roomCode, "roomCode"),
        preferredSide: optionalSide(value.preferredSide, "preferredSide"),
      };
    case "reconnect":
      return {
        type: "reconnect",
        roomCode: requiredString(value.roomCode, "roomCode"),
        side: isSide(value.side) ? value.side : badMessage("side must be blue or red"),
        seatToken: requiredString(value.seatToken, "seatToken"),
      };
    case "submitCommand":
      return {
        type: "submitCommand",
        roomCode: requiredString(value.roomCode, "roomCode"),
        side: isSide(value.side) ? value.side : badMessage("side must be blue or red"),
        seatToken: requiredString(value.seatToken, "seatToken"),
        command: requiredCommand(value.command),
        expectedVersion: optionalNumber(value.expectedVersion, "expectedVersion"),
      };
    case "exportReplay":
      return {
        type: "exportReplay",
        roomCode: requiredString(value.roomCode, "roomCode"),
        side: isSide(value.side) ? value.side : badMessage("side must be blue or red"),
        seatToken: requiredString(value.seatToken, "seatToken"),
      };
    default:
      badMessage(`unknown message type: ${value.type}`);
  }
}

function createMessageHandler(socket: WebSocket, manager: RoomManager, loggerInstance: StructuredLogger) {
  return (message: ClientMessage) => {
    switch (message.type) {
      case "createRoom": {
        const result = manager.createRoom(message.preferredSide);
        bindSession(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          connectionId: result.connectionId,
        });
        loggerInstance.info("room_create", {
          roomCode: result.roomCode,
          side: result.side,
          connectionId: result.connectionId,
          version: result.playerView.version,
        });
        sendJoined(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          playerView: result.playerView,
          roomKind: "pvp",
        });
        return;
      }
      case "createAIEncounter": {
        const result = manager.createAIEncounter(message.preferredSide ?? "blue", message.encounterTemplateId);
        bindSession(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          connectionId: result.connectionId,
        });
        manager.advanceAIEncounter(result.roomCode);
        const room = manager.getRoom(result.roomCode);
        const playerView = room ? buildPlayerView(room, result.side) : result.playerView;
        loggerInstance.info("ai_encounter_create", {
          roomCode: result.roomCode,
          side: result.side,
          connectionId: result.connectionId,
          version: playerView.version,
          encounterTemplateId: message.encounterTemplateId ?? null,
        });
        sendJoined(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          playerView,
          roomKind: "aiEncounter",
        });
        sendAIEncounterUpdate(socket, manager, result.roomCode);
        return;
      }
      case "joinRoom": {
        const result = manager.joinRoom(message.roomCode, message.preferredSide);
        bindSession(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          connectionId: result.connectionId,
        });
        loggerInstance.info("room_join", {
          roomCode: result.roomCode,
          side: result.side,
          connectionId: result.connectionId,
          version: result.playerView.version,
        });
        sendJoined(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          playerView: result.playerView,
          roomKind: "pvp",
        });
        return;
      }
      case "reconnect": {
        const result = manager.reconnect(message.roomCode, message.side, message.seatToken);
        bindSession(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          connectionId: result.connectionId,
        });
        loggerInstance.info("room_reconnect", {
          roomCode: result.roomCode,
          side: result.side,
          connectionId: result.connectionId,
          version: result.playerView.version,
        });
        sendJoined(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          playerView: result.playerView,
          roomKind: manager.getRoom(result.roomCode)?.aiEncounter ? "aiEncounter" : "pvp",
        });
        sendAIEncounterUpdate(socket, manager, result.roomCode);
        return;
      }
      case "submitCommand": {
        const session = assertActiveSession(socket, message.roomCode, message.side, message.seatToken);
        const result = manager.submitCommand(
          message.roomCode,
          message.side,
          message.seatToken,
          message.command,
          message.expectedVersion,
          session.connectionId,
        );
        bindSession(socket, {
          roomCode: result.roomCode,
          side: result.side,
          seatToken: result.seatToken,
          connectionId: result.connectionId,
        });
        loggerInstance.info("command_submit", {
          roomCode: result.roomCode,
          side: result.side,
          connectionId: result.connectionId,
          version: result.playerView.version,
          commandType: message.command.type,
          expectedVersion: message.expectedVersion ?? null,
        });
        manager.advanceAIEncounter(result.roomCode);
        broadcastPlayerViews(result.roomCode, manager);
        broadcastAIEncounterUpdate(result.roomCode, manager);
        return;
      }
      case "exportReplay": {
        assertActiveSession(socket, message.roomCode, message.side, message.seatToken);
        const exportData = manager.exportReplay(message.roomCode, message.side, message.seatToken);
        const response: ReplayExportMessage = {
          type: "replayExport",
          payload: {
            roomCode: message.roomCode,
            export: exportData,
          },
        };
        send(socket, response);
        return;
      }
      default:
        ((value: never) => value)(message);
    }
  };
}

function createSocketLifecycleHandlers(socket: WebSocket, manager: RoomManager, loggerInstance: StructuredLogger) {
  const handleMessage = createMessageHandler(socket, manager, loggerInstance);

  socket.on("message", (data) => {
    try {
      const parsed = parseClientMessage(data.toString());
      handleMessage(parsed);
    } catch (error) {
      handleError(socket, loggerInstance, error, { transport: "ws" });
    }
  });

  socket.on("close", () => {
    const session = socketSessions.get(socket);
    socketSessions.delete(socket);
    for (const [connectionId, currentSocket] of socketsByConnectionId.entries()) {
      if (currentSocket === socket) {
        socketsByConnectionId.delete(connectionId);
      }
    }
    if (!session || !session.roomCode) return;
    const disconnected = manager.disconnect(session.roomCode, session.side, session.connectionId);
    if (!disconnected) return;
    loggerInstance.info("disconnect", {
      roomCode: session.roomCode,
      side: session.side,
      connectionId: session.connectionId,
    });
    broadcastOpponentDisconnected(session.roomCode, session.side, manager);
  });

  socket.on("error", (error) => {
    handleError(socket, loggerInstance, error, { transport: "ws", socketEvent: "error" });
    socket.close();
  });
}

export function createRoomServer(options: RoomServerOptions = {}): RoomServerBundle {
  const manager = options.roomManager ?? roomManager;
  const structuredLogger = options.logger ?? logger;
  const server = http.createServer(createHttpHandler(manager));
  const webSocketServer = new WebSocketServer({ server });

  webSocketServer.on("connection", (socket) => {
    const anonymousSession: SocketSession = {
      roomCode: "",
      side: "blue",
      seatToken: "",
      connectionId: randomUUID(),
    };
    socketSessions.set(socket, anonymousSession);
    createSocketLifecycleHandlers(socket, manager, structuredLogger);
  });

  return {
    server,
    webSocketServer,
    roomManager: manager,
    logger: structuredLogger,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const bundle = createRoomServer();
  bundle.server.listen(PORT, "0.0.0.0", () => {
    // eslint-disable-next-line no-console
    console.log(`Azeroth Arena room server listening on ws://localhost:${PORT}`);
  });
}
