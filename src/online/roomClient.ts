import type { Side } from "../../packages/data/src";
import type { Command } from "../../packages/rules/src";
import type {
  AIEncounterDebugState,
  ConnectionStatus,
  PlayerView,
  ReplayExportBundle,
  ServerMessage,
} from "../onlineProtocol";

export interface WebSocketLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(value: string): void;
  close(): void;
}

export type RoomClientSession = {
  roomCode: string;
  side: Side;
  seatToken: string;
  version: number;
};

export type RoomClientEvent =
  | { type: "status"; status: ConnectionStatus }
  | { type: "playerView"; view: PlayerView }
  | { type: "aiEncounter"; debug: AIEncounterDebugState }
  | { type: "replayExport"; bundle: ReplayExportBundle }
  | { type: "error"; message: string };

export type RoomClientOptions = {
  serverUrl: string;
  createSocket?: (serverUrl: string) => WebSocketLike;
};

type CreateAIEncounterOptions = {
  preferredSide?: Side;
  encounterTemplateId?: string;
};

const OPEN = 1;

function defaultCreateSocket(serverUrl: string): WebSocketLike {
  return new WebSocket(serverUrl);
}

export function createRoomClient(options: RoomClientOptions) {
  let socket: WebSocketLike | null = null;
  let session: RoomClientSession | null = null;
  const listeners = new Set<(event: RoomClientEvent) => void>();
  const createSocket = options.createSocket ?? defaultCreateSocket;

  function emit(event: RoomClientEvent) {
    for (const listener of listeners) listener(event);
  }

  function handleMessage(rawMessage: string) {
    const message = JSON.parse(rawMessage) as ServerMessage;
    switch (message.type) {
      case "roomJoined":
        session = {
          roomCode: message.payload.roomCode,
          side: message.payload.side,
          seatToken: message.payload.seatToken,
          version: message.payload.playerView.version,
        };
        emit({ type: "playerView", view: message.payload.playerView });
        return;
      case "playerView":
        if (session) {
          session = { ...session, version: message.payload.version };
        }
        emit({ type: "playerView", view: message.payload });
        return;
      case "aiEncounterUpdated":
        emit({ type: "aiEncounter", debug: message.payload });
        return;
      case "replayExport":
        emit({ type: "replayExport", bundle: message.payload.export });
        return;
      case "roomError":
        emit({ type: "error", message: message.payload.message });
        return;
      case "opponentDisconnected":
        emit({ type: "error", message: `${message.payload.side} disconnected` });
        return;
    }
  }

  async function ensureSocket() {
    if (socket?.readyState === OPEN) return socket;
    emit({ type: "status", status: "connecting" });
    socket = createSocket(options.serverUrl);
    socket.onmessage = (event) => handleMessage(event.data);
    socket.onclose = () => emit({ type: "status", status: "disconnected" });
    await new Promise<void>((resolve, reject) => {
      if (!socket) {
        reject(new Error("socket was not created"));
        return;
      }
      socket.onopen = () => {
        emit({ type: "status", status: "connected" });
        resolve();
      };
      socket.onerror = (event) => {
        emit({ type: "status", status: "error" });
        reject(event);
      };
    });
    return socket;
  }

  async function send(message: unknown) {
    const activeSocket = await ensureSocket();
    activeSocket.send(JSON.stringify(message));
  }

  return {
    subscribe(listener: (event: RoomClientEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSession() {
      return session;
    },
    setSessionForTest(nextSession: RoomClientSession) {
      session = nextSession;
    },
    async createAIEncounter(createOptions: CreateAIEncounterOptions) {
      await send({
        type: "createAIEncounter",
        preferredSide: createOptions.preferredSide,
        encounterTemplateId: createOptions.encounterTemplateId,
      });
    },
    async reconnect(nextSession: Omit<RoomClientSession, "version">) {
      session = { ...nextSession, version: 0 };
      await send({ type: "reconnect", ...nextSession });
    },
    async submitCommand(command: Command) {
      if (!session) throw new Error("Cannot submit command before joining a room");
      await send({
        type: "submitCommand",
        roomCode: session.roomCode,
        side: session.side,
        seatToken: session.seatToken,
        command,
        expectedVersion: session.version,
      });
    },
    async exportReplay() {
      if (!session) throw new Error("Cannot export replay before joining a room");
      await send({
        type: "exportReplay",
        roomCode: session.roomCode,
        side: session.side,
        seatToken: session.seatToken,
      });
    },
    disconnect() {
      socket?.close();
      socket = null;
    },
  };
}
