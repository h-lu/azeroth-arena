# REPLAY_SCHEMA

## 目的

冻结在线房间的 replay 导出格式，保证复盘、脚本化分析和人工排障可以长期消费同一份输出。

导出实现来自 `server/playtestExport.ts`，导出入口在 `server/roomManager.ts` 的 `exportReplay()`。

## 稳定字段

### `ReplayExportBundle`

当前稳定字段：

- `summary`
- `json`
- `csv`
- `markdown`

### `RoomPlaytestSummary`

当前稳定字段：

- `roomCode`
- `version`
- `round`
- `winner`
- `killRound`
- `logCount`
- `responseWindowCount`
- `interruptCount`
- `trinketUseCount`
- `commandCount`
- `createdAt`
- `updatedAt`

### `json`

`json` 是字符串，当前内容序列化自：

- `roomCode`
- `createdAt`
- `updatedAt`
- `summary`
- `replayEvents`
- `finalState`

### `replayEvents`

当前是 `RoomReplayEntry[]`，单条记录字段为：

- `kind`：`room` 或 `command`
- `type`：`createRoom` / `joinRoom` / `reconnect` / `submitCommand`
- `roomCode`
- `side`
- `timestamp`
- `version`
- `round`
- `command?`
- `events?`
- `error?`
- `openedReactionWindow?`
- `interrupted?`
- `trinketUsed?`

其中：

- `room` 类条目记录房间生命周期事件。
- `command` 类条目记录一次被接受的命令及其规则事件。

### `csv`

当前表头顺序固定为：

- `roomCode`
- `version`
- `round`
- `winner`
- `killRound`
- `logCount`
- `responseWindowCount`
- `interruptCount`
- `trinketUseCount`
- `commandCount`
- `createdAt`
- `updatedAt`

### `markdown`

当前是人类可读的摘要文本，开头标题固定为：

- `# Azeroth Arena Playtest Export`

并且会包含最近几条 replay tail。

## 允许变化

- `events` 里事件 payload 可以继续细化，只要 JSON 结构仍然能追溯到当前的回放记录。
- `markdown` 的排版可以优化，但标题、核心 summary 项和 replay tail 的用途不能变。
- `csv` 的值内容可以随着对局推进变化，但表头顺序应保持稳定。
- `finalState` 可以继续跟着规则引擎演进，只要它仍然是最终的 `GameState` 快照。

## 禁止变化

- 不能删掉 `summary`、`json`、`csv`、`markdown` 中的任何一个输出。
- 不能改变 `summary` 字段名。
- 不能把 `json` 改成非字符串，或者去掉 `finalState` / `replayEvents`。
- 不能随意改动 `csv` 表头顺序。
- 不能把 `replayEvents` 从结构化记录改成纯文本。
- 不能让导出跳过 `createRoom` 这一类房间事件；当前 replay 从建房开始才完整。

## 错误 / 边界

- 如果房间不存在，导出应失败，而不是返回空 bundle。
- 如果 seatToken 不匹配，导出应失败。
- `commandCount` 只统计 `kind === "command"` 的条目。
- `responseWindowCount` / `interruptCount` / `trinketUseCount` 都是从 replay 条目上派生的计数，不应改成别的来源。
- 当没有命令时，`markdown` 的 replay tail 仍然应能正常生成。

## 验收测试建议

- 解析 `bundle.json`，确认包含 `summary`、`replayEvents` 和 `finalState`。
- 校验 `summary.commandCount` 与命令类 replay 条目数量一致。
- 校验 `csv` 第一行表头顺序不变。
- 校验 `markdown` 仍以 `Azeroth Arena Playtest Export` 为标题。
- 校验 room / command 两类 replay 条目都能被序列化与读取。

