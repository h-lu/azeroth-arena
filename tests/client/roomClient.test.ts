import { describe, expect, test } from "vitest";
import { createInitialGameState } from "../../packages/rules/src";
import type { ServerMessage } from "../../src/onlineProtocol";
import { createRoomClient, type WebSocketLike } from "../../src/online/roomClient";

class FakeSocket implements WebSocketLike {
  readyState = 1;
  sent: string[] = [];
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({} as CloseEvent);
  }

  emit(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent<string>);
  }
}

function makeClient() {
  let socket: FakeSocket | null = null;
  const client = createRoomClient({
    serverUrl: "ws://test",
    createSocket: () => {
      socket = new FakeSocket();
      queueMicrotask(() => socket?.onopen?.({} as Event));
      return socket;
    },
  });
  return {
    client,
    get socket() {
      if (!socket) throw new Error("socket was not created");
      return socket;
    },
  };
}

function makePlayerView() {
  const state = createInitialGameState();
  return {
    roomCode: "ROOM42",
    version: 3,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    side: "blue" as const,
    state: {
      ...state,
      players: {
        blue: {
          ...state.players.blue,
          handCount: state.players.blue.hand.length,
          deckCount: state.players.blue.deck.length,
          discardCount: state.players.blue.discard.length,
        },
        red: {
          ...state.players.red,
          hand: [],
          deck: [],
          discard: [],
          handCount: state.players.red.hand.length,
          deckCount: state.players.red.deck.length,
          discardCount: state.players.red.discard.length,
        },
      },
    },
    legalCommands: [],
  };
}

describe("production room client", () => {
  test("opens a socket and sends createAIEncounter", async () => {
    const harness = makeClient();
    await harness.client.createAIEncounter({ preferredSide: "blue", encounterTemplateId: "rival-burst-check" });

    expect(JSON.parse(harness.socket.sent[0])).toEqual({
      type: "createAIEncounter",
      preferredSide: "blue",
      encounterTemplateId: "rival-burst-check",
    });
  });

  test("stores joined seat and emits player view", async () => {
    const harness = makeClient();
    const events: string[] = [];
    harness.client.subscribe((event) => events.push(event.type));
    await harness.client.createAIEncounter({ preferredSide: "blue" });

    harness.socket.emit({
      type: "roomJoined",
      payload: {
        roomCode: "ROOM42",
        side: "blue",
        seatToken: "seat-token",
        roomKind: "aiEncounter",
        playerView: makePlayerView(),
      },
    });

    expect(events).toContain("playerView");
    expect(harness.client.getSession()).toEqual({
      roomCode: "ROOM42",
      side: "blue",
      seatToken: "seat-token",
      version: 3,
    });
  });

  test("submits commands with the latest joined version", async () => {
    const harness = makeClient();
    await harness.client.createAIEncounter({ preferredSide: "blue" });
    harness.client.setSessionForTest({ roomCode: "ROOM42", side: "blue", seatToken: "seat-token", version: 7 });

    await harness.client.submitCommand({ type: "pass", playerId: "blue" });

    expect(JSON.parse(harness.socket.sent[1])).toEqual({
      type: "submitCommand",
      roomCode: "ROOM42",
      side: "blue",
      seatToken: "seat-token",
      expectedVersion: 7,
      command: { type: "pass", playerId: "blue" },
    });
  });
});
