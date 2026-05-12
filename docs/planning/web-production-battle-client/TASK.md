# TASK.md - Azeroth Arena Web Production Battle Client

## Goal

Replace the Unity-first client plan with a high-quality browser production battle client.

The player should be able to open the browser client, create an AI Encounter, play a complete match, and feel that the experience is a polished tactical card battler rather than a debug web UI.

## Baseline

- TS rules/server/AI/replay already exist and remain authoritative.
- Current React/Vite client proves local hotseat, online room, AI encounter debug, legal command submission, and replay export.
- Current `src/App.tsx` is debug-oriented and too dense to become the production battle surface as-is.
- Existing card/hero art assets can seed the first production pass.
- Unity work is no longer the next product path.

## P0 Success Definition

**AI Encounter complete match in the browser with production battle presentation.**

The browser client can:

1. Connect to local or deployed WebSocket server.
2. Create an AI Encounter.
3. Render a game-like battle table with zones, heroes, hand, HUD, and AI opponent intent.
4. Submit core legal commands through direct UI, drag/target interactions, and a Legal Commands Drawer fallback.
5. Play readable animations for card play, damage, heal, shield, movement, reaction windows, knockout, draw/discard, and AI action anticipation.
6. Reconcile every animation batch to authoritative `PlayerView`.
7. Handle illegal local actions and server rejects with rebound/toast feedback.
8. Finish a full match and show winner plus replay/post-game summary entry points.

## Non-goals

- No Unity client implementation.
- No native iOS/Android/TestFlight first milestone.
- No account, matchmaking, ladder, shop, economy, or collection system.
- No heavy 3D production path.
- No AI rule adjudication on the client.
- No full AI hidden trace in the normal player HUD.

## Recommended Validation Path

1. Run `npm run dev:server`.
2. Run the browser client with Vite.
3. Open the production battle route.
4. Create AI Encounter.
5. Complete the match using normal UI and Legal Commands Drawer fallback.
6. Export replay and verify the same event stream can drive the visual queue.

## Key Risks

- Debug UI density leaking into the production battle screen.
- Mixing rules/simulation into renderer code.
- Growing `src/App.tsx` further instead of creating bounded battle modules.
- Canvas-only UI making card text, prompts, settings, and accessibility worse.
- Animations drifting from authoritative snapshots.
- Mobile layout covering the hand or playfield.

## Next Task After Phase 0-1

Begin Phase 2 input flow:

1. Complete browser visual QA for the new production battle route once the in-app browser connection is available.
2. Add card selection and card-to-target command lookup through `src/battle/targetModel.ts`.
3. Add pointer drag for cards using the existing `@dnd-kit/core` dependency.
4. Add illegal target rebound and toast feedback before server submission.
5. Keep `LegalCommandsDrawer` as the complete fallback for every command in `PlayerView.legalCommands`.
6. Add reaction prompt UI for `resolveReaction` commands before building PixiJS FX.
