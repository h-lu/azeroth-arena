import { setTimeout as delay } from "node:timers/promises";
import { WebSocket } from "ws";

const DEFAULT_PORT = Number(process.env.SMOKE_PORT ?? 18788);
const externalWsUrl = process.env.SMOKE_WS_URL ?? "";
const wsUrl = externalWsUrl || `ws://127.0.0.1:${DEFAULT_PORT}`;
const httpUrl = wsUrl.replace(/^ws:/, "http:").replace(/^wss:/, "https:");
const outputPath = process.env.SMOKE_RESULT_PATH ?? "";

const checks = [];
let serverBundle = null;

function record(name, details = {}) {
  checks.push({ name, ...details });
}

function redact(value) {
  return String(value).replace(/[a-f0-9]{32}/gi, "[redacted-token]");
}

function fail(message, details = {}) {
  const error = new Error(message);
  error.details = details;
  throw error;
}

async function waitForHealthz() {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${httpUrl}/healthz`);
      if (response.ok) {
        const body = await response.json();
        if (body.status === "ok") {
          record("healthz", {
            roomCount: body.roomCount,
            activeConnectionCount: body.activeConnectionCount,
          });
          return body;
        }
      }
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  fail("healthz did not become ready", {
    lastError: lastError instanceof Error ? lastError.message : String(lastError),
  });
}

async function startServer() {
  if (externalWsUrl) return null;
  const { tsImport } = await import("tsx/esm/api");
  const { createRoomServer } = await tsImport("../server/index.ts", import.meta.url);
  const bundle = createRoomServer();
  await new Promise((resolve, reject) => {
    function handleError(error) {
      bundle.server.off("error", handleError);
      bundle.webSocketServer.off("error", handleError);
      reject(error);
    }
    bundle.server.once("error", handleError);
    bundle.webSocketServer.once("error", handleError);
    bundle.server.listen(DEFAULT_PORT, "127.0.0.1", () => {
      bundle.server.off("error", handleError);
      bundle.webSocketServer.off("error", handleError);
      resolve();
    });
  });
  return bundle;
}

function connectSocket(label) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`${label} websocket open timeout`));
    }, 5_000);
    socket.once("open", () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function sendJson(socket, message) {
  socket.send(JSON.stringify(message));
}

function waitForMessage(socket, type, predicate = () => true, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${type}`));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      socket.off("message", handleMessage);
      socket.off("close", handleClose);
      socket.off("error", handleError);
    }

    function handleClose() {
      cleanup();
      reject(new Error(`socket closed while waiting for ${type}`));
    }

    function handleError(error) {
      cleanup();
      reject(error);
    }

    function handleMessage(data) {
      let parsed;
      try {
        parsed = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (parsed.type === type && predicate(parsed)) {
        cleanup();
        resolve(parsed);
      }
    }

    socket.on("message", handleMessage);
    socket.once("close", handleClose);
    socket.once("error", handleError);
  });
}

async function fetchDebugRooms() {
  const response = await fetch(`${httpUrl}/debug/rooms`);
  if (!response.ok) {
    fail("debug rooms endpoint failed", { status: response.status });
  }
  return response.json();
}

function closeSocket(socket) {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.once("close", () => resolve());
    socket.close();
  });
}

async function writeResult(result) {
  const body = `${JSON.stringify(result, null, 2)}\n`;
  if (!outputPath) {
    process.stdout.write(body);
    return;
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(outputPath, body, "utf8");
  process.stdout.write(body);
}

async function run() {
  serverBundle = await startServer();
  await waitForHealthz();

  const blue = await connectSocket("blue");
  const red = await connectSocket("red");

  sendJson(blue, { type: "createRoom", preferredSide: "blue" });
  const created = await waitForMessage(blue, "roomJoined");
  const roomCode = created.payload.roomCode;
  const blueSeatToken = created.payload.seatToken;
  const initialVersion = created.payload.playerView.version;
  record("ws_create_room", { roomCode, version: initialVersion });

  sendJson(red, { type: "joinRoom", roomCode, preferredSide: "red" });
  const joined = await waitForMessage(red, "roomJoined");
  const redSeatToken = joined.payload.seatToken;
  record("ws_join_room", { roomCode: joined.payload.roomCode, version: joined.payload.playerView.version });

  const blueViewAfterSubmit = waitForMessage(blue, "playerView", (message) => message.payload.version === initialVersion + 1);
  const redViewAfterSubmit = waitForMessage(red, "playerView", (message) => message.payload.version === initialVersion + 1);
  sendJson(blue, {
    type: "submitCommand",
    roomCode,
    side: "blue",
    seatToken: blueSeatToken,
    expectedVersion: initialVersion,
    command: {
      type: "endTurn",
      playerId: "blue",
    },
  });
  const blueView = await blueViewAfterSubmit;
  await redViewAfterSubmit;
  record("ws_submit_command", { version: blueView.payload.version });

  const opponentDisconnected = waitForMessage(blue, "opponentDisconnected", (message) => message.payload.side === "red");
  await closeSocket(red);
  await opponentDisconnected;
  record("ws_disconnect_notice", { disconnectedSide: "red" });

  const blueRecovered = await connectSocket("blue-recovered");
  sendJson(blueRecovered, {
    type: "reconnect",
    roomCode,
    side: "blue",
    seatToken: blueSeatToken,
  });
  const recovered = await waitForMessage(blueRecovered, "roomJoined");
  record("ws_reconnect", { version: recovered.payload.playerView.version });

  const staleConnection = waitForMessage(blue, "roomError", (message) => message.payload.code === "STALE_CONNECTION");
  sendJson(blue, {
    type: "submitCommand",
    roomCode,
    side: "blue",
    seatToken: blueSeatToken,
    command: {
      type: "endTurn",
      playerId: "blue",
    },
  });
  const stale = await staleConnection;
  record("ws_stale_connection", { code: stale.payload.code });

  const debug = await fetchDebugRooms();
  const debugText = JSON.stringify(debug);
  if (debugText.includes(blueSeatToken) || debugText.includes(redSeatToken) || debugText.includes("seatToken")) {
    fail("debug rooms leaked a seat token");
  }
  record("debug_rooms_redacted", {
    roomCount: debug.roomCount,
    activeConnectionCount: debug.activeConnectionCount,
  });

  await closeSocket(blue);
  await closeSocket(blueRecovered);

  return {
    ok: true,
    wsUrl,
    roomCode,
    checks,
  };
}

try {
  const result = await run();
  await writeResult(result);
} catch (error) {
  const result = {
    ok: false,
    wsUrl,
    error: redact(error instanceof Error ? error.message : String(error)),
    details: error instanceof Error && "details" in error ? error.details : undefined,
    checks,
  };
  await writeResult(result);
  process.exitCode = 1;
} finally {
  if (serverBundle) {
    await new Promise((resolve) => serverBundle.webSocketServer.close(() => resolve()));
    await new Promise((resolve) => serverBundle.server.close(() => resolve()));
  }
}
