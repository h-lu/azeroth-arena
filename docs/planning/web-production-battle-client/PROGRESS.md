# PROGRESS.md - Web Production Battle Client

## 2026-05-12 Route Change

- User decided the production client should be a high-quality browser game client.
- Unity-first implementation is superseded.
- Browser route can replace existing technical plans.
- The new target is Web production battle client: React + TypeScript shell, PixiJS/WebGL scene/FX layer, DOM/React HUD/cards/menus, TS VisualCommandQueue, Web Audio, Pointer Events.

## Current State

- Planning docs have been rewritten under `docs/planning/web-production-battle-client/`.
- Web architecture is documented in `docs/web/WEB_PRODUCTION_BATTLE_CLIENT_ARCHITECTURE.md`.
- The existing React client remains useful as a debug client and protocol reference.

## Next Recommended Step

Implement Phase 0 and Phase 1:

1. Split production battle modules out of the current debug `App.tsx`.
2. Add the production battle route/shell.
3. Render a first high-quality battle table from `PlayerView`.
4. Connect Create AI Encounter through the new client surface.

## 2026-05-12 Phase 0-1 Implementation

- Production battle code now lives outside the legacy debug client.
- The default browser route opens a production AI Encounter surface through `src/battle/BattleClient.tsx`.
- `PlayerView` drives a battle table with lanes, heroes, hand, HUD, AI intent, and Legal Commands fallback.
- The legacy debug client is preserved under `src/debug/DebugClient.tsx` and remains available from the mode switch.
- Verification run: `npm test`, `npm run typecheck`, `npm run build`, `npm run smoke:online`, `npm run playtest:ai-director-v1`.
- Local server smoke: `npm run dev:online`, `curl http://localhost:5173/`, and `curl http://localhost:8788/healthz`.
- Browser plugin QA was attempted but the in-app browser connection timed out twice before navigation; complete visual click-through remains the next manual QA item.

## 2026-05-12 Phase 2 Click Input Slice

- Added click-first card selection for the production battle surface.
- Clicking a playable hand card selects it; clicking a legal hero target submits the matching `playCard` command from `PlayerView.legalCommands`.
- Illegal card-target clicks now produce local feedback without submitting to the server.
- Added a compact reaction prompt for `resolveReaction` commands while keeping `LegalCommandsDrawer` as the complete fallback.
- Drag card input, zone target selection, and Pixi/WebGL FX remain future Phase 2/3 work.

## 2026-05-13 Phase 2 Zone Target Slice

- Added `toZone` command lookup for selected cards.
- Lane labels are now clickable zone targets during card selection.
- Zone-only movement cards can submit directly from card selection plus lane click.
- Cards that require both hero and zone targets now produce local guidance instead of submitting an incomplete command.
- Drag card input and Pixi/WebGL FX remain future Phase 2/3 work.

## 2026-05-13 Phase 2 Drag Input Slice

- Browser visual QA was retried, but the in-app browser connection still timed out before navigation.
- Added pure drag/drop command resolution for hero and lane drops.
- Hand cards are now draggable with `@dnd-kit/core`.
- Hero slots and lane targets are droppable and reuse the same authoritative `PlayerView.legalCommands` lookup as click input.
- Illegal drops now produce local feedback without submitting to the server.
- Pixi/WebGL FX and richer drag overlays remain future Phase 3 polish.
