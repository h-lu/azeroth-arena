# Web Production Battle Client Phase 0-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first production browser battle client route for AI Encounter, with code split out of the debug client and a game-like battle table rendered from authoritative `PlayerView`.

**Architecture:** Keep `packages/rules` and `server` authoritative; the production client derives a view model from `PlayerView` and submits only existing legal commands. React owns cards, HUD, menus, and accessible controls; a dedicated battle scene boundary is created now so PixiJS/WebGL FX can be added without reshaping the UI later. The current debug client stays available as a reference route.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, existing WebSocket protocol, DOM/CSS battle UI, future PixiJS/WebGL scene layer behind `src/battle-scene`.

---

## File Structure

- Create: `src/app/AppShell.tsx`
  - Owns top-level route selection between production battle and legacy debug client.
- Create: `src/debug/DebugClient.tsx`
  - Receives the current `src/App.tsx` implementation after moving it out of the production entry.
- Modify: `src/App.tsx`
  - Becomes a small compatibility wrapper that renders `AppShell`.
- Modify: `src/main.tsx`
  - Continues importing `App`; no behavior change expected.
- Create: `src/online/roomClient.ts`
  - Production WebSocket facade for create AI Encounter, reconnect, submit command, export replay, and event subscription.
- Create: `tests/client/roomClient.test.ts`
  - Covers outbound messages, message parsing, status events, and command submission versioning.
- Create: `src/battle/battleState.ts`
  - Pure `PlayerView` to `BattleViewModel` derivation for lanes, heroes, hand cards, HUD, AI panel, and legal command affordances.
- Create: `tests/client/battleState.test.ts`
  - Covers lane grouping, hidden opponent hand, hand card definitions, and AI intent summary.
- Create: `src/battle/targetModel.ts`
  - Pure helpers for mapping common UI intents to existing `PlayerView.legalCommands`.
- Create: `tests/client/targetModel.test.ts`
  - Covers pass, end turn, focus target, hero activation, and card target lookup.
- Create: `src/battle/BattleClient.tsx`
  - Production battle route controller: owns room client lifecycle, stored session handoff, and screen states.
- Create: `src/battle/BattleStage.tsx`
  - Composes board, HUD, hand, AI panel, and fallback controls from `BattleViewModel`.
- Create: `src/battle/battle.css`
  - Production battle route styling, scoped under `.battle-client`.
- Create: `src/battle-scene/BattleSceneLayer.tsx`
  - Scene boundary component for board atmosphere and future PixiJS mount.
- Create: `src/battle-ui/AiOpponentPanel.tsx`
- Create: `src/battle-ui/CardTile.tsx`
- Create: `src/battle-ui/HandFan.tsx`
- Create: `src/battle-ui/HeroSlot.tsx`
- Create: `src/battle-ui/LegalCommandsDrawer.tsx`
- Create: `src/battle-ui/MatchHud.tsx`
  - Focused presentational components for the production battle surface.
- Modify: `src/styles.css`
  - Import `battle.css` and keep existing debug styles intact.

## Task 1: Split App Shell From Debug Client

**Files:**
- Create: `src/app/AppShell.tsx`
- Create: `src/debug/DebugClient.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Move the current debug client**

Run:

```bash
mkdir -p src/app src/debug
git mv src/App.tsx src/debug/DebugClient.tsx
```

Expected: `src/debug/DebugClient.tsx` contains the existing debug/hotseat/online implementation.

- [ ] **Step 2: Update moved relative imports**

In `src/debug/DebugClient.tsx`, replace imports that pointed from `src/` to repo packages:

```ts
import { CARDS, HERO_DEFS, isAdjacentZone, type Side, type ZoneId } from "../../packages/data/src";
import {
  applyCommand,
  createInitialGameState,
  getLegalCommands,
  type Command,
  type GameState,
  type HeroState,
  type ReactionWindow,
} from "../../packages/rules/src";
import type {
  AIEncounterDebugState,
  PlayerView,
  ReplayExportBundle,
  RoomMode,
  ConnectionStatus,
  RoomJoinedPayload,
  RoomErrorPayload,
} from "../onlineProtocol";
import {
  clearOnlineSeat,
  describeConnectionStatus,
  describeRoomError,
  hasReconnectSession,
  persistOnlineSeat,
  persistPreferredSide,
  persistServerUrl,
  readStoredOnlineSession,
  sanitizeRoomCode,
  statusAfterRoomError,
  type PreferredSide,
} from "../onlineSession";
import { cardFaceSrc, heroPortraitSrc } from "../cardAssets";
```

Run:

```bash
npm run typecheck
```

Expected: FAIL only if a moved import path was missed; fix import paths until TypeScript can resolve the moved file.

- [ ] **Step 3: Create the app shell**

Create `src/app/AppShell.tsx`:

```tsx
import { useState } from "react";
import BattleClient from "../battle/BattleClient";
import DebugClient from "../debug/DebugClient";

type AppMode = "battle" | "debug";

export default function AppShell() {
  const [mode, setMode] = useState<AppMode>("battle");

  return (
    <div className="app-shell">
      <div className="app-mode-switch" aria-label="Client mode">
        <button type="button" className={mode === "battle" ? "active" : ""} onClick={() => setMode("battle")}>
          Battle
        </button>
        <button type="button" className={mode === "debug" ? "active" : ""} onClick={() => setMode("debug")}>
          Debug
        </button>
      </div>
      {mode === "battle" ? <BattleClient /> : <DebugClient />}
    </div>
  );
}
```

- [ ] **Step 4: Recreate the small compatibility entry**

Create `src/App.tsx`:

```tsx
import AppShell from "./app/AppShell";

export default function App() {
  return <AppShell />;
}
```

- [ ] **Step 5: Add shell CSS without changing debug layout**

Append to `src/styles.css`:

```css
@import "./battle/battle.css";

.app-shell {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.app-mode-switch {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 50;
  display: flex;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgba(255, 230, 180, 0.2);
  border-radius: 8px;
  background: rgba(12, 8, 5, 0.72);
  backdrop-filter: blur(12px);
}

.app-mode-switch button {
  min-width: 68px;
  min-height: 34px;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  background: transparent;
}

.app-mode-switch button.active {
  color: var(--ink);
  background: rgba(231, 179, 90, 0.24);
}
```

- [ ] **Step 6: Commit**

Run:

```bash
npm run typecheck
git add src/App.tsx src/app/AppShell.tsx src/debug/DebugClient.tsx src/styles.css
git commit -m "refactor: split production shell from debug client"
```

Expected: TypeScript passes and the commit contains only the shell split.

## Task 2: Add Production Room Client Facade

**Files:**
- Create: `src/online/roomClient.ts`
- Create: `tests/client/roomClient.test.ts`

- [ ] **Step 1: Write the failing room client tests**

Create `tests/client/roomClient.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { ServerMessage } from "../../src/onlineProtocol";
import { createRoomClient, type WebSocketLike } from "../../src/online/roomClient";

class FakeSocket implements WebSocketLike {
  static OPEN = 1;
  readyState = FakeSocket.OPEN;
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
  return { client, get socket() {
    if (!socket) throw new Error("socket was not created");
    return socket;
  } };
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
        playerView: {
          roomCode: "ROOM42",
          version: 3,
          createdAt: "2026-05-12T00:00:00.000Z",
          updatedAt: "2026-05-12T00:00:00.000Z",
          side: "blue",
          state: {
            round: 1,
            currentPlayer: "blue",
            startingPlayer: "blue",
            phase: "main",
            winner: null,
            endedThisRound: { blue: false, red: false },
            endOfRoundEffects: [],
            suppression: 0,
            pendingReaction: null,
            activation: null,
            heroes: {},
            cardById: {},
            players: {
              blue: { side: "blue", hand: [], deck: [], discard: [], handCount: 0, deckCount: 0, discardCount: 0, focusTargetId: null, focusTargetSelectedThisRound: false, focusBonusUsed: false, focusAvailable: 1, cooldowns: [] },
              red: { side: "red", hand: [], deck: [], discard: [], handCount: 0, deckCount: 0, discardCount: 0, focusTargetId: null, focusTargetSelectedThisRound: false, focusBonusUsed: false, focusAvailable: 1, cooldowns: [] },
            },
            log: [],
          },
          legalCommands: [],
        },
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
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- tests/client/roomClient.test.ts
```

Expected: FAIL with a module resolution error for `src/online/roomClient.ts`.

- [ ] **Step 3: Implement `roomClient`**

Create `src/online/roomClient.ts`:

```ts
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

  function parseMessage(raw: string) {
    const message = JSON.parse(raw) as ServerMessage;
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
        if (session) session = { ...session, version: message.payload.version };
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
    socket.onmessage = (event) => parseMessage(event.data);
    socket.onerror = () => emit({ type: "status", status: "error" });
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

  async function send(value: unknown) {
    const activeSocket = await ensureSocket();
    activeSocket.send(JSON.stringify(value));
  }

  return {
    subscribe(listener: (event: RoomClientEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
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
```

- [ ] **Step 4: Verify the facade**

Run:

```bash
npm test -- tests/client/roomClient.test.ts
npm run typecheck
git add src/online/roomClient.ts tests/client/roomClient.test.ts
git commit -m "feat: add production room client facade"
```

Expected: room client tests pass and TypeScript passes.

## Task 3: Build Pure Battle View Model

**Files:**
- Create: `src/battle/battleState.ts`
- Create: `tests/client/battleState.test.ts`

- [ ] **Step 1: Write the failing view model tests**

Create `tests/client/battleState.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createInitialGameState } from "../../packages/rules/src";
import type { AIEncounterDebugState, PlayerView } from "../../src/onlineProtocol";
import { buildBattleViewModel } from "../../src/battle/battleState";

function makeView(): PlayerView {
  const state = createInitialGameState();
  return {
    roomCode: "ROOM42",
    version: 1,
    createdAt: "2026-05-12T00:00:00.000Z",
    updatedAt: "2026-05-12T00:00:00.000Z",
    side: "blue",
    state: {
      ...state,
      players: {
        blue: { ...state.players.blue, handCount: state.players.blue.hand.length, deckCount: state.players.blue.deck.length, discardCount: state.players.blue.discard.length },
        red: { ...state.players.red, hand: [], deck: [], discard: [], handCount: state.players.red.hand.length, deckCount: state.players.red.deck.length, discardCount: state.players.red.discard.length },
      },
    },
    legalCommands: [{ type: "pass", playerId: "blue" }],
  };
}

describe("battle view model", () => {
  test("groups heroes by zone with viewer and opponent sides", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.viewerSide).toBe("blue");
    expect(model.zones.map((zone) => zone.id)).toEqual(["left", "center", "right"]);
    expect(model.zones.flatMap((zone) => zone.friendlyHeroes).every((hero) => hero.side === "blue")).toBe(true);
    expect(model.zones.flatMap((zone) => zone.enemyHeroes).every((hero) => hero.side === "red")).toBe(true);
  });

  test("enriches hand ids with card definitions", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.hand.length).toBeGreaterThan(0);
    expect(model.hand[0].id).toBeTruthy();
    expect(model.hand[0].name).toBeTruthy();
  });

  test("keeps hidden opponent hand as counts only", () => {
    const model = buildBattleViewModel(makeView(), null);

    expect(model.opponent.handCount).toBeGreaterThan(0);
    expect(model.opponent.visibleHandIds).toEqual([]);
  });

  test("summarizes public AI intent", () => {
    const ai = {
      intentHints: [{ turn: 1, source: "template", threatType: "burst", targetEntityIds: ["blue-priest"], confidenceBand: "high", text: "Pressure the healer." }],
      persona: { name: "Rival" },
      objectives: [{ id: "survive", name: "Survive", publicText: "Win before suppression spikes." }],
    } as AIEncounterDebugState;

    const model = buildBattleViewModel(makeView(), ai);

    expect(model.aiPanel.personaName).toBe("Rival");
    expect(model.aiPanel.intentText).toBe("Pressure the healer.");
    expect(model.aiPanel.objectives).toEqual(["Win before suppression spikes."]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- tests/client/battleState.test.ts
```

Expected: FAIL with a module resolution error for `src/battle/battleState.ts`.

- [ ] **Step 3: Implement the view model**

Create `src/battle/battleState.ts`:

```ts
import { CARDS, HERO_DEFS, type Side, type ZoneId } from "../../packages/data/src";
import type { Command, HeroState } from "../../packages/rules/src";
import type { AIEncounterDebugState, PlayerView } from "../onlineProtocol";

const ZONES: ZoneId[] = ["left", "center", "right"];
const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));
const HERO_BY_ID = Object.fromEntries(HERO_DEFS.map((hero) => [hero.id, hero]));

export type BattleHero = HeroState & {
  displayName: string;
  hpPercent: number;
  statusLabels: string[];
};

export type BattleHandCard = {
  id: string;
  name: string;
  role: string;
  type: string;
  cost: number;
  legalCommandCount: number;
};

export type BattleZoneView = {
  id: ZoneId;
  label: string;
  friendlyHeroes: BattleHero[];
  enemyHeroes: BattleHero[];
};

export type BattleViewModel = {
  roomCode: string;
  version: number;
  viewerSide: Side;
  opponentSide: Side;
  phase: PlayerView["state"]["phase"];
  round: number;
  currentPlayer: Side;
  winner: Side | null;
  zones: BattleZoneView[];
  hand: BattleHandCard[];
  opponent: {
    side: Side;
    handCount: number;
    deckCount: number;
    discardCount: number;
    visibleHandIds: string[];
  };
  legalCommands: Command[];
  aiPanel: {
    personaName: string;
    intentText: string;
    confidence: string;
    objectives: string[];
  };
};

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function zoneLabel(zone: ZoneId) {
  if (zone === "left") return "Left Pillar";
  if (zone === "center") return "Center";
  return "Right Pillar";
}

function heroStatusLabels(hero: HeroState) {
  return [
    hero.pendingHardControl > 0 ? "Hard CC" : null,
    hero.nextActivationNoMove ? "No move" : null,
    hero.nextActivationNoResponse ? "No response" : null,
    hero.shield > 0 ? `Shield ${hero.shield}` : null,
    hero.healReduction > 0 ? "Mortal" : null,
    !hero.trinketAvailable ? "Trinket used" : null,
    !hero.alive ? "Down" : null,
  ].filter((label): label is string => Boolean(label));
}

function toBattleHero(hero: HeroState): BattleHero {
  return {
    ...hero,
    displayName: HERO_BY_ID[hero.id]?.name ?? hero.id,
    hpPercent: Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100))),
    statusLabels: heroStatusLabels(hero),
  };
}

function toHandCard(cardId: string, legalCommands: Command[]): BattleHandCard {
  const card = CARD_BY_ID[cardId];
  return {
    id: cardId,
    name: card?.name ?? cardId,
    role: card?.role ?? "unknown",
    type: card?.type ?? "unknown",
    cost: card?.cost ?? 0,
    legalCommandCount: legalCommands.filter((command) => command.type === "playCard" && command.cardId === cardId).length,
  };
}

export function buildBattleViewModel(view: PlayerView, ai: AIEncounterDebugState | null): BattleViewModel {
  const viewerSide = view.side;
  const opponentSide = opposite(viewerSide);
  const heroes = Object.values(view.state.heroes).map(toBattleHero);
  const latestIntent = ai?.intentHints.at(-1);

  return {
    roomCode: view.roomCode,
    version: view.version,
    viewerSide,
    opponentSide,
    phase: view.state.phase,
    round: view.state.round,
    currentPlayer: view.state.currentPlayer,
    winner: view.state.winner,
    zones: ZONES.map((zone) => ({
      id: zone,
      label: zoneLabel(zone),
      friendlyHeroes: heroes.filter((hero) => hero.side === viewerSide && hero.zone === zone),
      enemyHeroes: heroes.filter((hero) => hero.side === opponentSide && hero.zone === zone),
    })),
    hand: view.state.players[viewerSide].hand.map((cardId) => toHandCard(cardId, view.legalCommands)),
    opponent: {
      side: opponentSide,
      handCount: view.state.players[opponentSide].handCount,
      deckCount: view.state.players[opponentSide].deckCount,
      discardCount: view.state.players[opponentSide].discardCount,
      visibleHandIds: view.state.players[opponentSide].hand,
    },
    legalCommands: view.legalCommands,
    aiPanel: {
      personaName: ai?.persona.name ?? "AI Opponent",
      intentText: latestIntent?.text ?? "Reading the board.",
      confidence: latestIntent?.confidenceBand ?? "mid",
      objectives: ai?.objectives.map((objective) => objective.publicText) ?? [],
    },
  };
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/client/battleState.test.ts
npm run typecheck
git add src/battle/battleState.ts tests/client/battleState.test.ts
git commit -m "feat: derive production battle view model"
```

Expected: battle state tests pass and TypeScript passes.

## Task 4: Add Target Model For Common Commands

**Files:**
- Create: `src/battle/targetModel.ts`
- Create: `tests/client/targetModel.test.ts`

- [ ] **Step 1: Write failing target model tests**

Create `tests/client/targetModel.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import type { Command } from "../../packages/rules/src";
import {
  findActivateHeroCommand,
  findEndTurnCommand,
  findFocusTargetCommand,
  findPassCommand,
  findPlayCardCommand,
} from "../../src/battle/targetModel";

const commands: Command[] = [
  { type: "pass", playerId: "blue" },
  { type: "endTurn", playerId: "blue" },
  { type: "activateHero", playerId: "blue", heroId: "blue-mage" },
  { type: "selectFocusTarget", playerId: "blue", targetId: "red-priest" },
  { type: "playCard", playerId: "blue", sourceHeroId: "blue-mage", cardId: "011-mage-fireball", targetIds: ["red-priest"] },
];

describe("target model", () => {
  test("finds simple turn commands", () => {
    expect(findPassCommand(commands)).toEqual({ type: "pass", playerId: "blue" });
    expect(findEndTurnCommand(commands)).toEqual({ type: "endTurn", playerId: "blue" });
  });

  test("finds hero and focus commands", () => {
    expect(findActivateHeroCommand(commands, "blue-mage")).toEqual({ type: "activateHero", playerId: "blue", heroId: "blue-mage" });
    expect(findFocusTargetCommand(commands, "red-priest")).toEqual({ type: "selectFocusTarget", playerId: "blue", targetId: "red-priest" });
  });

  test("finds a card command by source, card, and targets", () => {
    expect(findPlayCardCommand(commands, {
      sourceHeroId: "blue-mage",
      cardId: "011-mage-fireball",
      targetIds: ["red-priest"],
    })).toEqual(commands[4]);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
npm test -- tests/client/targetModel.test.ts
```

Expected: FAIL with a module resolution error for `src/battle/targetModel.ts`.

- [ ] **Step 3: Implement target helpers**

Create `src/battle/targetModel.ts`:

```ts
import type { Command } from "../../packages/rules/src";

type PlayCardQuery = {
  sourceHeroId: string;
  cardId: string;
  targetIds: string[];
  toZone?: string;
};

function sameTargets(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function findPassCommand(commands: Command[]) {
  return commands.find((command) => command.type === "pass") ?? null;
}

export function findEndTurnCommand(commands: Command[]) {
  return commands.find((command) => command.type === "endTurn") ?? null;
}

export function findActivateHeroCommand(commands: Command[], heroId: string) {
  return commands.find((command) => command.type === "activateHero" && command.heroId === heroId) ?? null;
}

export function findFocusTargetCommand(commands: Command[], targetId: string) {
  return commands.find((command) => command.type === "selectFocusTarget" && command.targetId === targetId) ?? null;
}

export function findPlayCardCommand(commands: Command[], query: PlayCardQuery) {
  return commands.find((command) => (
    command.type === "playCard"
    && command.sourceHeroId === query.sourceHeroId
    && command.cardId === query.cardId
    && sameTargets(command.targetIds, query.targetIds)
    && command.toZone === query.toZone
  )) ?? null;
}
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
npm test -- tests/client/targetModel.test.ts
npm run typecheck
git add src/battle/targetModel.ts tests/client/targetModel.test.ts
git commit -m "feat: add production battle target model"
```

Expected: target model tests pass and TypeScript passes.

## Task 5: Create Production Battle Screen Controller

**Files:**
- Create: `src/battle/BattleClient.tsx`
- Modify: `src/app/AppShell.tsx`

- [ ] **Step 1: Create the controller**

Create `src/battle/BattleClient.tsx`:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
import type { AIEncounterDebugState, ConnectionStatus, PlayerView } from "../onlineProtocol";
import { readStoredOnlineSession } from "../onlineSession";
import { createRoomClient } from "../online/roomClient";
import { buildBattleViewModel } from "./battleState";
import BattleStage from "./BattleStage";

const ENCOUNTER_TEMPLATE_ID = "rival-burst-check";

function defaultServerUrl() {
  return readStoredOnlineSession().serverUrl;
}

export default function BattleClient() {
  const [serverUrl] = useState(defaultServerUrl);
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [view, setView] = useState<PlayerView | null>(null);
  const [aiDebug, setAiDebug] = useState<AIEncounterDebugState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const client = useMemo(() => createRoomClient({ serverUrl }), [serverUrl]);
  const bootedRef = useRef(false);

  useEffect(() => {
    return client.subscribe((event) => {
      if (event.type === "status") setStatus(event.status);
      if (event.type === "playerView") {
        setView(event.view);
        setError(null);
      }
      if (event.type === "aiEncounter") setAiDebug(event.debug);
      if (event.type === "error") setError(event.message);
    });
  }, [client]);

  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    void client.createAIEncounter({ preferredSide: "blue", encounterTemplateId: ENCOUNTER_TEMPLATE_ID }).catch((nextError) => {
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : String(nextError));
    });
  }, [client]);

  const model = view ? buildBattleViewModel(view, aiDebug) : null;

  return (
    <main className="battle-client">
      {model ? (
        <BattleStage
          model={model}
          connectionStatus={status}
          error={error}
          onSubmitCommand={(command) => void client.submitCommand(command).catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))}
          onExportReplay={() => void client.exportReplay().catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))}
        />
      ) : (
        <section className="battle-loading" aria-live="polite">
          <strong>Azeroth Arena</strong>
          <span>{status === "error" ? "Connection failed" : "Opening AI Encounter"}</span>
          {error ? <p>{error}</p> : null}
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Run typecheck and capture missing components**

Run:

```bash
npm run typecheck
```

Expected: FAIL because `BattleStage` does not exist yet. This confirms `BattleClient` is wired to the intended next task.

- [ ] **Step 3: Do not commit this task alone**

Keep these changes unstaged until Task 6 creates the presentational components and TypeScript passes.

## Task 6: Render Battle Table Vertical Slice

**Files:**
- Create: `src/battle/BattleStage.tsx`
- Create: `src/battle-scene/BattleSceneLayer.tsx`
- Create: `src/battle-ui/AiOpponentPanel.tsx`
- Create: `src/battle-ui/CardTile.tsx`
- Create: `src/battle-ui/HandFan.tsx`
- Create: `src/battle-ui/HeroSlot.tsx`
- Create: `src/battle-ui/LegalCommandsDrawer.tsx`
- Create: `src/battle-ui/MatchHud.tsx`
- Create: `src/battle/battle.css`

- [ ] **Step 1: Create scene boundary**

Create `src/battle-scene/BattleSceneLayer.tsx`:

```tsx
import type { BattleViewModel } from "../battle/battleState";

type BattleSceneLayerProps = {
  model: BattleViewModel;
};

export default function BattleSceneLayer({ model }: BattleSceneLayerProps) {
  return (
    <div className="battle-scene-layer" aria-hidden="true">
      {model.zones.map((zone) => (
        <div key={zone.id} className={`battle-scene-lane lane-${zone.id}`} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create HUD component**

Create `src/battle-ui/MatchHud.tsx`:

```tsx
import type { ConnectionStatus } from "../onlineProtocol";
import type { BattleViewModel } from "../battle/battleState";

type MatchHudProps = {
  model: BattleViewModel;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onExportReplay: () => void;
};

export default function MatchHud({ model, connectionStatus, error, onExportReplay }: MatchHudProps) {
  return (
    <header className="battle-hud">
      <div>
        <span className="battle-kicker">Azeroth Arena</span>
        <strong>AI Encounter</strong>
      </div>
      <div className="battle-hud-pills">
        <span>Round {model.round}</span>
        <span>{model.phase}</span>
        <span>{model.currentPlayer === model.viewerSide ? "Your turn" : "Enemy turn"}</span>
        <span>{connectionStatus}</span>
      </div>
      <button type="button" onClick={onExportReplay}>Replay</button>
      {error ? <p role="alert">{error}</p> : null}
    </header>
  );
}
```

- [ ] **Step 3: Create hero slot**

Create `src/battle-ui/HeroSlot.tsx`:

```tsx
import type { BattleHero } from "../battle/battleState";

type HeroSlotProps = {
  hero: BattleHero;
  alignment: "friendly" | "enemy";
  onActivate?: (heroId: string) => void;
  onFocus?: (heroId: string) => void;
};

export default function HeroSlot({ hero, alignment, onActivate, onFocus }: HeroSlotProps) {
  return (
    <article className={`hero-slot ${alignment} ${hero.alive ? "" : "defeated"}`}>
      <button type="button" className="hero-main" onClick={() => onActivate?.(hero.id)}>
        <span>{hero.displayName}</span>
        <small>{hero.role}</small>
        <meter min={0} max={100} value={hero.hpPercent}>{hero.hpPercent}%</meter>
      </button>
      <div className="hero-badges">
        {hero.statusLabels.map((label) => <span key={label}>{label}</span>)}
      </div>
      {alignment === "enemy" ? (
        <button type="button" className="focus-button" onClick={() => onFocus?.(hero.id)}>Focus</button>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 4: Create card and hand components**

Create `src/battle-ui/CardTile.tsx`:

```tsx
import type { CSSProperties } from "react";
import type { BattleHandCard } from "../battle/battleState";

type CardTileProps = {
  card: BattleHandCard;
};

export default function CardTile({ card }: CardTileProps) {
  return (
    <article className={card.legalCommandCount > 0 ? "card-tile playable" : "card-tile"}>
      <span>{card.type}</span>
      <strong>{card.name}</strong>
      <small>{card.role}</small>
      <b>{card.cost}</b>
    </article>
  );
}
```

Create `src/battle-ui/HandFan.tsx`:

```tsx
import type { BattleHandCard } from "../battle/battleState";
import CardTile from "./CardTile";

type HandFanProps = {
  cards: BattleHandCard[];
};

export default function HandFan({ cards }: HandFanProps) {
  return (
    <section className="hand-fan" aria-label="Player hand">
      {cards.map((card, index) => (
        <div key={`${card.id}-${index}`} className="hand-card" style={{ "--card-index": index, "--hand-count": cards.length } as CSSProperties}>
          <CardTile card={card} />
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Create AI panel**

Create `src/battle-ui/AiOpponentPanel.tsx`:

```tsx
import type { BattleViewModel } from "../battle/battleState";

type AiOpponentPanelProps = {
  model: BattleViewModel;
};

export default function AiOpponentPanel({ model }: AiOpponentPanelProps) {
  return (
    <aside className="ai-panel">
      <span className="battle-kicker">{model.aiPanel.confidence} confidence</span>
      <strong>{model.aiPanel.personaName}</strong>
      <p>{model.aiPanel.intentText}</p>
      <div>
        {model.aiPanel.objectives.map((objective) => <span key={objective}>{objective}</span>)}
      </div>
      <small>{model.opponent.handCount} cards in hand</small>
    </aside>
  );
}
```

- [ ] **Step 6: Create fallback legal commands drawer**

Create `src/battle-ui/LegalCommandsDrawer.tsx`:

```tsx
import type { Command } from "../../packages/rules/src";

type LegalCommandsDrawerProps = {
  commands: Command[];
  onSubmitCommand: (command: Command) => void;
};

function commandLabel(command: Command) {
  if (command.type === "playCard") return `Play ${command.cardId}`;
  if (command.type === "activateHero") return `Activate ${command.heroId}`;
  if (command.type === "moveHero") return `Move ${command.heroId}`;
  if (command.type === "selectFocusTarget") return `Focus ${command.targetId}`;
  return command.type;
}

export default function LegalCommandsDrawer({ commands, onSubmitCommand }: LegalCommandsDrawerProps) {
  return (
    <details className="legal-drawer">
      <summary>Legal commands</summary>
      <div>
        {commands.map((command, index) => (
          <button key={`${command.type}-${index}`} type="button" onClick={() => onSubmitCommand(command)}>
            {commandLabel(command)}
          </button>
        ))}
      </div>
    </details>
  );
}
```

- [ ] **Step 7: Create battle stage composition**

Create `src/battle/BattleStage.tsx`:

```tsx
import type { Command } from "../../packages/rules/src";
import type { ConnectionStatus } from "../onlineProtocol";
import BattleSceneLayer from "../battle-scene/BattleSceneLayer";
import AiOpponentPanel from "../battle-ui/AiOpponentPanel";
import HandFan from "../battle-ui/HandFan";
import HeroSlot from "../battle-ui/HeroSlot";
import LegalCommandsDrawer from "../battle-ui/LegalCommandsDrawer";
import MatchHud from "../battle-ui/MatchHud";
import type { BattleViewModel } from "./battleState";
import { findActivateHeroCommand, findEndTurnCommand, findFocusTargetCommand, findPassCommand } from "./targetModel";

type BattleStageProps = {
  model: BattleViewModel;
  connectionStatus: ConnectionStatus;
  error: string | null;
  onSubmitCommand: (command: Command) => void;
  onExportReplay: () => void;
};

export default function BattleStage({ model, connectionStatus, error, onSubmitCommand, onExportReplay }: BattleStageProps) {
  function submitIfFound(command: Command | null) {
    if (command) onSubmitCommand(command);
  }

  return (
    <section className="battle-stage">
      <BattleSceneLayer model={model} />
      <MatchHud model={model} connectionStatus={connectionStatus} error={error} onExportReplay={onExportReplay} />
      <AiOpponentPanel model={model} />
      <div className="battle-zones">
        {model.zones.map((zone) => (
          <section key={zone.id} className="battle-zone">
            <span>{zone.label}</span>
            <div className="zone-row enemy-row">
              {zone.enemyHeroes.map((hero) => (
                <HeroSlot key={hero.id} hero={hero} alignment="enemy" onFocus={(heroId) => submitIfFound(findFocusTargetCommand(model.legalCommands, heroId))} />
              ))}
            </div>
            <div className="zone-row friendly-row">
              {zone.friendlyHeroes.map((hero) => (
                <HeroSlot key={hero.id} hero={hero} alignment="friendly" onActivate={(heroId) => submitIfFound(findActivateHeroCommand(model.legalCommands, heroId))} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="battle-actions">
        <button type="button" onClick={() => submitIfFound(findPassCommand(model.legalCommands))}>Pass</button>
        <button type="button" onClick={() => submitIfFound(findEndTurnCommand(model.legalCommands))}>End turn</button>
      </div>
      <HandFan cards={model.hand} />
      <LegalCommandsDrawer commands={model.legalCommands} onSubmitCommand={onSubmitCommand} />
    </section>
  );
}
```

- [ ] **Step 8: Add scoped production CSS**

Create `src/battle/battle.css`:

```css
.battle-client {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  color: #f7efe1;
  background:
    linear-gradient(90deg, rgba(37, 25, 18, 0.9), transparent 18% 82%, rgba(37, 25, 18, 0.9)),
    radial-gradient(circle at center, rgba(26, 96, 88, 0.78), #11100e 68%);
}

.battle-loading {
  height: 100%;
  display: grid;
  place-content: center;
  gap: 10px;
  text-align: center;
}

.battle-stage {
  position: relative;
  width: 100%;
  height: 100%;
  display: grid;
  grid-template-rows: 76px minmax(0, 1fr) 150px;
  padding: 18px 24px 18px;
}

.battle-scene-layer {
  position: absolute;
  inset: 88px 24px 142px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  pointer-events: none;
}

.battle-scene-lane {
  border: 1px solid rgba(245, 223, 178, 0.14);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(0, 0, 0, 0.18));
  box-shadow: inset 0 0 48px rgba(0, 0, 0, 0.26);
}

.battle-hud,
.battle-actions,
.legal-drawer,
.ai-panel {
  position: relative;
  z-index: 2;
}

.battle-hud {
  display: grid;
  grid-template-columns: minmax(180px, auto) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
}

.battle-kicker {
  display: block;
  color: #e8bd72;
  font-size: 11px;
  text-transform: uppercase;
}

.battle-hud strong {
  display: block;
  font-size: 24px;
}

.battle-hud-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.battle-hud-pills span,
.hero-badges span,
.ai-panel div span {
  padding: 5px 8px;
  border: 1px solid rgba(245, 223, 178, 0.18);
  border-radius: 999px;
  background: rgba(9, 7, 5, 0.42);
}

.battle-zones {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  align-self: stretch;
  min-height: 0;
}

.battle-zone {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) minmax(0, 1fr);
  gap: 10px;
  padding: 10px;
}

.battle-zone > span {
  justify-self: center;
  color: #e8bd72;
}

.zone-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-content: center;
  justify-content: center;
  min-width: 0;
}

.hero-slot {
  width: min(190px, 100%);
  display: grid;
  gap: 7px;
}

.hero-main,
.battle-actions button,
.legal-drawer button,
.battle-hud button,
.focus-button {
  border: 1px solid rgba(245, 223, 178, 0.24);
  border-radius: 8px;
  color: #f7efe1;
  background: rgba(18, 13, 9, 0.74);
}

.hero-main {
  min-height: 82px;
  padding: 10px;
  display: grid;
  gap: 5px;
  text-align: left;
}

.hero-main meter {
  width: 100%;
}

.hero-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ai-panel {
  position: absolute;
  top: 88px;
  right: 28px;
  width: min(280px, 28vw);
  padding: 12px;
  border: 1px solid rgba(245, 223, 178, 0.16);
  border-radius: 8px;
  background: rgba(11, 9, 7, 0.72);
}

.ai-panel div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.battle-actions {
  position: absolute;
  right: 28px;
  bottom: 176px;
  display: flex;
  gap: 8px;
}

.hand-fan {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: end;
  justify-content: center;
  gap: 8px;
  min-width: 0;
}

.hand-card {
  width: clamp(104px, 11vw, 148px);
  transform: translateY(0);
}

.card-tile {
  position: relative;
  min-height: 132px;
  padding: 10px;
  display: grid;
  grid-template-rows: auto 1fr auto;
  border: 1px solid rgba(245, 223, 178, 0.2);
  border-radius: 8px;
  background: linear-gradient(180deg, rgba(76, 42, 24, 0.94), rgba(20, 13, 9, 0.96));
}

.card-tile.playable {
  border-color: rgba(232, 189, 114, 0.72);
  box-shadow: 0 0 22px rgba(232, 189, 114, 0.18);
}

.card-tile b {
  position: absolute;
  top: 8px;
  right: 8px;
}

.legal-drawer {
  position: absolute;
  left: 28px;
  bottom: 176px;
  width: min(340px, 34vw);
}

.legal-drawer div {
  max-height: 220px;
  overflow: auto;
  display: grid;
  gap: 6px;
  padding-top: 8px;
}
```

- [ ] **Step 9: Verify and commit Tasks 5-6 together**

Run:

```bash
npm run typecheck
npm run build
git add src/battle src/battle-scene src/battle-ui src/app/AppShell.tsx
git commit -m "feat: add production battle screen vertical slice"
```

Expected: TypeScript and Vite build pass. The production route opens by default and the debug route remains available from the mode switch.

## Task 7: Browser Smoke And Visual QA

**Files:**
- Modify: `docs/planning/web-production-battle-client/PROGRESS.md`

- [ ] **Step 1: Start the local online environment**

Run:

```bash
npm run dev:online
```

Expected: one terminal process starts the room server and Vite client. Note the Vite URL printed by the command.

- [ ] **Step 2: Open the production route**

Open the Vite URL in the in-app browser or local browser.

Expected:
- The first screen is the production battle client, not the debug surface.
- It automatically opens an AI Encounter.
- The board shows three lanes, friendly heroes, enemy heroes, hand cards, HUD, AI panel, and fallback legal commands.
- The mode switch can open the legacy debug client.

- [ ] **Step 3: Exercise first interactions**

Manual actions:
- Click a friendly hero with an available `activateHero` command.
- Click `Focus` on an enemy hero when focus target selection is legal.
- Click `Pass` or `End turn` when visible and legal.
- Open `Legal commands` and submit one fallback command.

Expected:
- Commands submit to the server.
- `PlayerView.version` advances after a legal command.
- Server rejects show an alert without breaking the screen.
- The fallback drawer keeps the match playable when a direct UI control is missing.

- [ ] **Step 4: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run smoke:online
npm run playtest:ai-director-v1
```

Expected:
- All commands pass.
- `smoke:online` covers room server health, create/join/submit/reconnect, and stale connection behavior.
- `playtest:ai-director-v1` still passes after production UI changes.

- [ ] **Step 5: Update progress**

Append to `docs/planning/web-production-battle-client/PROGRESS.md`:

```md

## 2026-05-12 Phase 0-1 Implementation

- Production battle code now lives outside the legacy debug client.
- The default browser route opens a production AI Encounter surface.
- `PlayerView` drives a battle table with lanes, heroes, hand, HUD, AI intent, and Legal Commands fallback.
- Verification run: `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke:online`, `npm run playtest:ai-director-v1`.
```

- [ ] **Step 6: Commit QA note**

Run:

```bash
git add docs/planning/web-production-battle-client/PROGRESS.md
git commit -m "docs: record production battle phase 0-1 progress"
```

Expected: Progress file records the completed milestone and verification commands.

## Task 8: Handoff To Phase 2

**Files:**
- Modify: `docs/planning/web-production-battle-client/TASK.md`

- [ ] **Step 1: Add next task note**

Append to `docs/planning/web-production-battle-client/TASK.md`:

```md

## Next Task After Phase 0-1

Begin Phase 2 input flow:

1. Add card selection and card-to-target command lookup through `src/battle/targetModel.ts`.
2. Add pointer drag for cards using the existing `@dnd-kit/core` dependency.
3. Add illegal target rebound and toast feedback before server submission.
4. Keep `LegalCommandsDrawer` as the complete fallback for every command in `PlayerView.legalCommands`.
5. Add reaction prompt UI for `resolveReaction` commands before building PixiJS FX.
```

- [ ] **Step 2: Commit handoff**

Run:

```bash
git add docs/planning/web-production-battle-client/TASK.md
git commit -m "docs: add phase 2 production battle handoff"
```

Expected: Phase 2 starts from input flow and does not skip the fallback drawer.

## Self-Review

**Spec coverage:**
- Architecture split: Task 1.
- Production route and shell: Tasks 1, 5, 6.
- `PlayerView` rendering: Tasks 3, 6.
- Create AI Encounter: Tasks 2, 5.
- Legal command fallback: Tasks 4, 6.
- No client-side rule adjudication: Tasks 3 and 4 only derive from `PlayerView` and `legalCommands`.
- Debug route preserved: Task 1.
- Browser QA and validation: Task 7.

**Placeholder scan:** The plan contains concrete files, code, commands, and expected outcomes. It avoids banned placeholder tokens, generic error-handling instructions, and undefined future functions for Phase 0-1.

**Type consistency:** `BattleViewModel`, `BattleHero`, `BattleHandCard`, `RoomClientSession`, and `RoomClientEvent` are defined before use. `BattleClient`, `BattleStage`, and UI components share the same prop names. Command helper names match between `targetModel.ts` and `BattleStage.tsx`.

## Execution Options

Plan complete and saved to `docs/superpowers/plans/2026-05-12-web-production-battle-client-phase-0-1.md`.

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.
