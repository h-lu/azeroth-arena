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
        });
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
        });
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
        broadcastPlayerViews(result.roomCode, manager);
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
      const parsed = JSON.parse(data.toString()) as ClientMessage;
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
