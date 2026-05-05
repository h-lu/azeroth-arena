# Card Schema Freeze Summary

## What changed

- Added `tools/validate-card-schema.ts` to validate the frozen 50-card contract from `packages/data/src/cards.ts`.
- Added `validate:cards` to `package.json`.
- Added `docs/card-effect-coverage-matrix.md` covering all 50 cards with `id/name/user/type/cost/effectKey/window/test coverage/risk/notes`.

## Validator checks

- Exactly 50 cards.
- Unique ids and numeric prefixes `001` through `050`.
- Required fields exist and are non-empty.
- `cost` is a non-negative integer.
- `reaction_window` matches `reaction`.
- `card_kind` matches `cardKind`.
- `effectKey`, `category`, `cardKind`, `side`, `role`, `user`, and `faction` stay internally consistent.
- Hero, class, and common card contracts are validated separately.

## Verification

- `npm run validate:cards` passed.
- `npm run typecheck` passed.
- `npm run test` passed.
- `npm run build` passed.

## Notes

- The validator is intentionally strict for freeze mode, but it still allows the current special common-card user text on `046-common-arena-insignia` and the non-window `key-move` behavior on `048-common-tactical-retreat`.
