# PLAYER_VIEW_CONTRACT

## 目的

冻结在线私人房间里发给单个玩家的视图合同，确保：

- 只暴露该玩家该看到的信息。
- `legalCommands` 和当前视图状态一致。
- 本地热座和在线房间之间可以共用同一套展示逻辑。

实现来源是 `server/playerView.ts`，数据结构定义在 `src/onlineProtocol.ts`。

## 稳定字段

### `PlayerView`

当前稳定字段：

- `roomCode`
- `version`
- `createdAt`
- `updatedAt`
- `side`
- `state`
- `legalCommands`

### `PlayerViewState`

它是一个 `GameState` 的克隆，但 `players` 被替换为 `PublicPlayerState`。

当前稳定的是：

- 其余顶层字段与 `GameState` 保持一致。
- `players.blue` / `players.red` 的可见性按 viewer side 分流。

### `PublicPlayerState`

当前稳定字段：

- `side`
- `hand`
- `deck`
- `discard`
- `handCount`
- `deckCount`
- `discardCount`
- `focusTargetId`
- `focusTargetSelectedThisRound`
- `focusBonusUsed`
- `focusAvailable`
- `cooldowns`

当前实现中：

- 自己阵营：`hand`、`deck`、`discard` 保留完整数组。
- 对手阵营：`hand`、`deck`、`discard` 都被清空成 `[]`，但计数仍保留。

## 允许变化

- `state` 里的英雄、牌库、日志、反应窗口等内部字段可以继续演进，只要 `players` 的脱敏规则不变。
- `legalCommands` 的枚举顺序可以变化，但必须只包含当前 viewer side 的合法命令。
- `PlayerView` 可以新增只读展示字段，但不能破坏现有字段含义。

## 禁止变化

- 不能把对手的 `hand`、`deck`、`discard` 明细暴露给对方。
- 不能把 `handCount` / `deckCount` / `discardCount` 去掉，计数是当前 UX 和验收的一部分。
- 不能让 `legalCommands` 包含另一个阵营的命令。
- 不能把 `PlayerView.state` 变成共享引用；当前实现是克隆后再组装，调用方不应能通过修改返回对象反写房间状态。
- 不能删掉 `createdAt` / `updatedAt` / `version`，这些字段用于重连、回放和同步。

## 错误 / 边界

- 当房间已经结束时，视图仍然要能返回，只是 `legalCommands` 为空。
- 当对手掉线时，PlayerView 仍然只反映当前房间状态，不应因为连接状态而改变脱敏规则。
- 当牌库耗尽时，`deck` 可以为空数组，`deckCount` 必须同步为 0。
- 当手牌为空时，`hand` 可以为空数组，`handCount` 必须同步为 0。

## 验收测试建议

- 为蓝方和红方各生成一份 PlayerView，确认各自只能看到自己的手牌 / 牌库 / 弃牌堆明细。
- 验证对手阵营的数组被清空，但 count 字段仍然准确。
- 验证 `legalCommands` 只含 viewer side 的命令。
- 验证 `PlayerView.state` 不与 `room.state` 共用可变引用。
- 验证 `version` 随服务端 `submitCommand` 推进而同步变化。
