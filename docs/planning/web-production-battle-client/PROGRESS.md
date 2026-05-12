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
