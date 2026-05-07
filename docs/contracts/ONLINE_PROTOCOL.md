# ONLINE_PROTOCOL

## 目的

冻结 `ws://` 私人房间的消息协议，覆盖 Web 客户端 `src/onlineProtocol.ts`、Unity 临时 DTO `unity-client/Assets/AzerothArena/Scripts/Protocol/`、服务端 `server/index.ts` / `server/roomManager.ts` 以及 `PlayerView` / replay 导出之间的边界。

这份合同只描述当前 MVP 已经实现的协议，不扩展匹配、观战、账号或持久化。

## 稳定字段

### ClientMessage

当前稳定的客户端消息类型：

- `createRoom`
  - `preferredSide?`
- `createAIEncounter`
  - `preferredSide?`
  - `encounterTemplateId?`
- `joinRoom`
  - `roomCode`
  - `preferredSide?`
- `reconnect`
  - `roomCode`
  - `side`
  - `seatToken`
- `submitCommand`
  - `roomCode`
  - `side`
  - `seatToken`
  - `command`
  - `expectedVersion?`
- `exportReplay`
  - `roomCode`
  - `side`
  - `seatToken`

### ServerMessage

当前稳定的服务端消息类型：

- `roomJoined`
  - `payload.roomCode`
  - `payload.side`
  - `payload.seatToken`
  - `payload.playerView`
  - `payload.roomKind`
- `playerView`
  - `payload` 是完整 `PlayerView`
- `roomError`
  - `payload.code`
  - `payload.message`
  - `payload.roomCode?`
  - `payload.side?`
- `replayExport`
  - `payload.roomCode`
  - `payload.export`
- `aiEncounterUpdated`
  - `payload.roomCode`
  - `payload.humanSide`
  - `payload.aiSide`
  - `payload.encounter`
  - `payload.persona`
  - `payload.battlefieldModifiers`
  - `payload.objectives`
  - `payload.intentHints`
  - `payload.dialogue`
  - `payload.directorTraces`
  - `payload.decisionTraces` 是脱敏 BotPolicy trace 摘要，只包含 command type、intent、confidence、candidate count 和分数摘要
  - `payload.replaySummary`
  - `payload.postGameSummary`
- `opponentDisconnected`
  - `payload.roomCode`
  - `payload.side`

## 允许变化

- `roomError.payload.message` 可以变化，供人类阅读。
- `playerView` 的内部 `state` 可以随规则引擎演进，只要仍满足 PlayerView 合同。
- 未来可以增加新的 server/client 消息类型，但不能破坏现有类型分支。
- `expectedVersion` 仍然是可选字段；未传时按当前实现不做版本乐观锁检查。

## 禁止变化

- 不能改现有消息 `type` 字符串。
- 不能把当前必需字段改成可选。
- 不能让 `submitCommand` 绕过 `seatToken`、`side`、`expectedVersion` 与会话绑定检查。
- 不能让客户端看到别人的 `seatToken`、`connectionId` 或服务端内部会话状态。
- 不能把 `playerView` 和 `replayExport` 混成同一个消息形状。
- 不能让 `roomJoined` 只返回 roomCode 而不带初始 PlayerView；当前客户端依赖首次下发即可渲染。

## 错误 / 边界

当前服务端错误码已经形成事实合同：

- `BAD_MESSAGE`
- `AUTH_REQUIRED`
- `ROOM_FULL`
- `ROOM_NOT_FOUND`
- `SEAT_EMPTY`
- `INVALID_SEAT_TOKEN`
- `STALE_CONNECTION`
- `SIDE_MISMATCH`
- `VERSION_MISMATCH`
- `COMMAND_REJECTED`
- `SERVER_ERROR`

边界行为：

- 无效 JSON 进入 `BAD_MESSAGE`。
- 会话未绑定或 room / side / token 不匹配进入 `AUTH_REQUIRED`。
- 房间满员进入 `ROOM_FULL`。
- 错误信息通过 `roomError` 回传，不应靠异常栈给前端做业务判断。
- `submitCommand` 成功后会广播最新 `playerView` 给当前仍连接的双方。
- AI encounter 中，真人 `submitCommand` 成功后服务端可以自动推进 AI 侧，并在推进后广播最新 `playerView` 与 `aiEncounterUpdated`。
- AI encounter debug payload 只能包含公开 Director 输出、BotPolicy decision trace、公开 replay summary 和脱敏定义；不能包含 AI seat token、connectionId、对手隐藏 hand/deck 明细。
- 对手断线时会收到 `opponentDisconnected`，但只在另一侧仍在线时发送。
- 客户端恢复状态使用 `connected / connecting / reconnecting / disconnected / error` 表达，不改变 wire protocol。
- 客户端可以把当前座位的 `roomCode / side / seatToken` 保存在本地浏览器存储中用于刷新或断线恢复；这些值不能出现在日志、诊断端点或 smoke 结果里。
- `STALE_CONNECTION` 表示旧 WebSocket 已被新的恢复连接替换；客户端应停止使用旧 socket，并提示用户 Reconnect。
- `VERSION_MISMATCH` 表示客户端提交基于过期 PlayerView；客户端应等待最新 `playerView` 或提示手动恢复。

## 运维端点

这两个端点不属于 `ws://` 消息协议，但用于最小诊断：

- `GET /healthz`
  - 返回 JSON：`status`、`uptimeMs`、`roomCount`、`activeConnectionCount`、`timestamp`
- `GET /debug/rooms`
  - 返回安全脱敏后的房间诊断快照
  - 不能出现 `seatToken`
  - 只能暴露 room metadata、seat 连接状态、版本与 replay 摘要

## 验收测试建议

- 先测 `createRoom` / `joinRoom`：双方应获得不同 `seatToken`，且都收到 `roomJoined + playerView`。
- 再测 `reconnect`：用旧 `seatToken` 应能恢复房间，且 seat 重新变为 connected。
- 测 `submitCommand`：版本号推进、双方 `playerView` 刷新、错误版本被拒绝。
- 测 `exportReplay`：拿到 `replayExport`，并且 bundle 与 roomManager 导出的结构一致。
- 测 `createAIEncounter`：应收到 `roomJoined + playerView + aiEncounterUpdated`，AI 自动推进后版本号增加，debug payload 有 intent/objectives/modifiers/traces 且不泄露 seatToken。
- 测断线：关闭一个 socket 后，另一侧应收到 `opponentDisconnected`。
- 测坏包：发送非法 JSON 或字段不全的消息应得到 `BAD_MESSAGE`。
- 跑真实链路：`npm run smoke:online` 覆盖 `/healthz`、`/debug/rooms` 脱敏、create/join/submit/disconnect/reconnect/stale connection。
- 跑 Unity 静态合同校验：`npm run validate:unity-websocket` 覆盖 Unity DTO / transport / room client 文件存在性、消息名对齐和 Newtonsoft JSON 依赖。
