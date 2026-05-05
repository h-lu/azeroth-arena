import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, describe, expect, test } from "vitest";
import { createRoomServer } from "../../server/index";
import { createStructuredLogger, type StructuredLogRecord } from "../../server/logger";

type AnyMessage = {
  type: string;
  payload?: Record<string, unknown>;
};

class MockSocket extends EventEmitter {
  readonly OPEN = 1;
  readyState = 1;
  sent: string[] = [];

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.emit("close");
  }
}

function createRequest(method: string, url: string) {
  return { method, url } as IncomingMessage;
}

function createResponse() {
  let statusCode = 0;
  let headers: Record<string, string> = {};
  let body = "";
  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  const response = {
    writeHead(code: number, responseHeaders: Record<string, string>) {
      statusCode = code;
      headers = responseHeaders;
      return response;
    },
    end(chunk?: string) {
      if (typeof chunk === "string") {
        body += chunk;
      }
      resolveDone();
      return response;
    },
  } as unknown as ServerResponse;

  return {
    response,
    done,
    get statusCode() {
      return statusCode;
    },
    get headers() {
      return headers;
    },
    get body() {
      return body;
    },
  };
}

function takeMessages(socket: MockSocket, fromIndex = 0) {
  return socket.sent.slice(fromIndex).map((message) => JSON.parse(message) as AnyMessage);
}

function findMessage(messages: AnyMessage[], type: string) {
  return messages.find((message) => message.type === type) ?? null;
}

describe("Room server diagnostics and observability", () => {
  let serverBundle: ReturnType<typeof createRoomServer> | null = null;
  const records: StructuredLogRecord[] = [];
  const logger = createStructuredLogger((record) => {
    records.push(record);
  });

  afterEach(() => {
    serverBundle?.webSocketServer.close();
    serverBundle = null;
    records.splice(0, records.length);
  });

  test("health and debug endpoints stay JSON and do not leak seat tokens", async () => {
    serverBundle = createRoomServer({ logger });

    const health = createResponse();
    serverBundle.server.emit("request", createRequest("GET", "/healthz"), health.response);
    await health.done;

    expect(health.statusCode).toBe(200);
    expect(health.headers["content-type"]).toContain("application/json");

    const healthJson = JSON.parse(health.body) as {
      status: string;
      uptimeMs: number;
      roomCount: number;
      activeConnectionCount: number;
      timestamp: string;
    };
    expect(healthJson.status).toBe("ok");
    expect(healthJson.roomCount).toBe(0);
    expect(healthJson.activeConnectionCount).toBe(0);

    const debug = createResponse();
    serverBundle.server.emit("request", createRequest("GET", "/debug/rooms"), debug.response);
    await debug.done;

    expect(debug.statusCode).toBe(200);
    expect(debug.headers["content-type"]).toContain("application/json");

    const debugJson = JSON.parse(debug.body) as {
      roomCount: number;
      rooms: Array<{ seats: { blue: Record<string, unknown> | null; red: Record<string, unknown> | null } }>;
    };
    expect(debugJson.roomCount).toBe(0);
    expect(debugJson.rooms).toEqual([]);
  });

  test("ws lifecycle logs structured events and reconnect rejects stale connections", () => {
    serverBundle = createRoomServer({ logger });

    const socketA = new MockSocket();
    const socketB = new MockSocket();
    const socketC = new MockSocket();

    serverBundle.webSocketServer.emit("connection", socketA as unknown as never);
    serverBundle.webSocketServer.emit("connection", socketB as unknown as never);

    const startA = socketA.sent.length;
    socketA.emit("message", Buffer.from(JSON.stringify({ type: "createRoom", preferredSide: "blue" })));
    const createMessages = takeMessages(socketA, startA);
    const created = findMessage(createMessages, "roomJoined");
    const createdView = findMessage(createMessages, "playerView");

    expect(created?.payload?.roomCode).toBeDefined();
    expect(createdView?.payload?.version).toBe(1);

    const roomCode = String(created?.payload?.roomCode);
    const blueSeatToken = String(created?.payload?.seatToken);

    const startB = socketB.sent.length;
    socketB.emit("message", Buffer.from(JSON.stringify({ type: "joinRoom", roomCode, preferredSide: "red" })));
    const joinMessages = takeMessages(socketB, startB);
    const joined = findMessage(joinMessages, "roomJoined");
    const joinedView = findMessage(joinMessages, "playerView");

    expect(joined?.payload?.roomCode).toBe(roomCode);
    expect(joinedView?.payload?.version).toBe(1);

    const blueCommandStart = socketA.sent.length;
    const redCommandStart = socketB.sent.length;
    socketA.emit("message", Buffer.from(JSON.stringify({
      type: "submitCommand",
      roomCode,
      side: "blue",
      seatToken: blueSeatToken,
      expectedVersion: 1,
      command: {
        type: "endTurn",
        playerId: "blue",
      },
    })));
    const blueCommandMessages = takeMessages(socketA, blueCommandStart);
    const redCommandMessages = takeMessages(socketB, redCommandStart);

    expect(findMessage(blueCommandMessages, "playerView")?.payload?.version).toBe(2);
    expect(findMessage(redCommandMessages, "playerView")?.payload?.version).toBe(2);

    const roomSnapshot = serverBundle.roomManager.getRoomSnapshot(roomCode);
    expect(roomSnapshot).not.toBeNull();
    expect(roomSnapshot?.seats.blue).not.toHaveProperty("seatToken");
    expect(roomSnapshot?.activeConnectionCount).toBe(2);

    const disconnectStart = socketA.sent.length;
    socketB.close();
    const disconnectMessages = takeMessages(socketA, disconnectStart);
    expect(findMessage(disconnectMessages, "opponentDisconnected")?.payload?.roomCode).toBe(roomCode);

    serverBundle.webSocketServer.emit("connection", socketC as unknown as never);
    const reconnectStart = socketC.sent.length;
    socketC.emit("message", Buffer.from(JSON.stringify({
      type: "reconnect",
      roomCode,
      side: "blue",
      seatToken: blueSeatToken,
    })));
    const reconnectMessages = takeMessages(socketC, reconnectStart);
    expect(findMessage(reconnectMessages, "roomJoined")?.payload?.roomCode).toBe(roomCode);
    expect(findMessage(reconnectMessages, "playerView")?.payload?.version).toBe(2);

    const staleStart = socketA.sent.length;
    socketA.emit("message", Buffer.from(JSON.stringify({
      type: "submitCommand",
      roomCode,
      side: "blue",
      seatToken: blueSeatToken,
      command: {
        type: "endTurn",
        playerId: "blue",
      },
    })));
    const staleMessages = takeMessages(socketA, staleStart);

    expect(findMessage(staleMessages, "roomError")?.payload?.code).toBe("STALE_CONNECTION");
    expect(records.map((record) => record.event)).toEqual(expect.arrayContaining([
      "room_create",
      "room_join",
      "command_submit",
      "disconnect",
      "room_reconnect",
      "error",
    ]));
    expect(records.some((record) => Object.prototype.hasOwnProperty.call(record, "seatToken"))).toBe(false);

    const debug = createResponse();
    serverBundle.server.emit("request", createRequest("GET", "/debug/rooms"), debug.response);
    expect(debug.statusCode).toBe(200);
    const debugJson = JSON.parse(debug.body) as {
      rooms: Array<{ seats: { blue: Record<string, unknown> | null; red: Record<string, unknown> | null } }>;
    };
    expect(JSON.stringify(debugJson)).not.toContain(blueSeatToken);

    socketA.close();
    socketC.close();
  });

  test("ws can create a playable AI encounter and publish debug payload", () => {
    serverBundle = createRoomServer({ logger });

    const socket = new MockSocket();
    serverBundle.webSocketServer.emit("connection", socket as unknown as never);

    const start = socket.sent.length;
    socket.emit("message", Buffer.from(JSON.stringify({
      type: "createAIEncounter",
      preferredSide: "red",
      encounterTemplateId: "mentor-stability-check",
    })));
    const messages = takeMessages(socket, start);
    const joined = findMessage(messages, "roomJoined");
    const view = findMessage(messages, "playerView");
    const aiDebug = findMessage(messages, "aiEncounterUpdated");
    const aiDebugPayload = aiDebug?.payload as
      | {
          encounter?: { templateId?: string };
          objectives?: unknown[];
          battlefieldModifiers?: unknown[];
          decisionTraces?: unknown[];
        }
      | undefined;

    expect(joined?.payload?.roomKind).toBe("aiEncounter");
    expect(joined?.payload?.side).toBe("red");
    expect(view?.payload?.version).toBeGreaterThan(1);
    expect(aiDebugPayload?.encounter).toMatchObject({ templateId: "mentor-stability-check" });
    expect(aiDebugPayload?.objectives).toEqual(expect.arrayContaining([expect.objectContaining({ id: "protect-own-healer" })]));
    expect(aiDebugPayload?.battlefieldModifiers).toEqual(expect.arrayContaining([expect.objectContaining({ id: "nagrand-pillars" })]));
    expect(aiDebugPayload?.decisionTraces?.length ?? 0).toBeGreaterThan(0);
    expect(JSON.stringify(aiDebug)).not.toContain(String(joined?.payload?.seatToken));
    expect(JSON.stringify(aiDebugPayload?.decisionTraces ?? [])).not.toContain("cardId");
    expect(records.map((record) => record.event)).toContain("ai_encounter_create");

    socket.close();
  });
});
