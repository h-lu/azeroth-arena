# Docs Contracts Summary

已在仓库内补齐 4 份合同文档：

- `docs/contracts/COMMAND_CONTRACT.md`
- `docs/contracts/PLAYER_VIEW_CONTRACT.md`
- `docs/contracts/REPLAY_SCHEMA.md`
- `docs/contracts/ONLINE_PROTOCOL.md`

内容基于当前实现锚定到：

- `packages/rules/src/types.ts`
- `packages/rules/src/engine.ts`
- `server/playerView.ts`
- `server/playtestExport.ts`
- `server/roomManager.ts`
- `server/index.ts`
- `src/onlineProtocol.ts`
- `tests/golden/*`
- `tests/server/roomManager.test.ts`

本次只做文档冻结，没有修改规则代码、数据代码或服务端实现。

说明：受当前沙箱写权限限制，无法直接写入仓库外的
`/root/.openclaw/workspace-codex/deliverables/azeroth-arena-contract-freeze/agents/docs-contracts-summary.md`，
因此在仓库内保留了这份同内容摘要副本。

未运行 `npm test` / `npm run typecheck` / `npm run build`，因为这次任务范围仅限合同文档。
