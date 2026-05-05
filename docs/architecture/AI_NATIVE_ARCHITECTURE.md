# AI_NATIVE_ARCHITECTURE

## 目的

定义 Azeroth Arena 的 AI-native 总体技术架构。目标是保留当前 TS rules/server 的权威性，同时新增 AI Player、AI Director 和 Unity client。

## 总体结构

```text
azeroth-arena/
  packages/
    data/          # 英雄、卡牌、地图、AI persona 基础数据
    rules/         # TS 纯函数权威规则引擎
    protocol/      # 未来：TS schema -> JSON Schema -> Unity C# DTO
    ai-player/     # 未来：BotPolicy / AIPlayerRuntime / AIDirector

  server/          # WebSocket room server，服务端权威结算
  src/             # 当前 React/Vite debug client
  unity-client/    # 未来：真正战斗客户端
```

## 运行时数据流

真人玩家：

```text
Unity input
  -> ClientMessage.submitCommand
  -> server validates seatToken / side / expectedVersion
  -> rules.applyCommand
  -> GameEvents + PlayerView
  -> Unity VisualCommandQueue
  -> animation + snapshot reconcile
```

AI 玩家：

```text
RoomOrchestrator detects AI side is active
  -> build redacted PlayerView
  -> getLegalCommands
  -> AIPlayerRuntime chooses actionId
  -> SafetyGate maps actionId to Command
  -> server submitCommand path
  -> rules.applyCommand
  -> broadcast events/snapshots
```

## 权责边界

### TypeScript rules engine

负责：

- 完整 `GameState`。
- `getLegalCommands(state)`。
- `applyCommand(state, command)`。
- 所有规则效果、伤害、死亡、反应窗口、胜负判定。

不负责：

- Unity 动画。
- AI 人格和台词。
- LLM prompt。
- 房间连接状态。

### Server

负责：

- 房间、座位、连接、重连。
- `seatToken` / `side` / `expectedVersion` 校验。
- PlayerView redaction。
- replay/export。
- AI actor 调度。
- AI trace 落盘。
- server-side timers / fallback。

### AI Player

负责：

- 从合法动作中选择动作。
- 产生 intent、confidence、public reason。
- 记录决策 trace。

不负责：

- 修改 GameState。
- 读取对手隐藏手牌/牌库。
- 直接生成未校验 command。

### AI Director

负责：

- encounter 参数。
- 敌方意图提示。
- persona 状态。
- 赛后复盘。
- 下一局建议。

不负责：

- 规则结算。
- 实时阻塞每个动作。
- 自由生成不受控卡牌效果。

### Unity Client

负责：

- 牌桌、手牌、英雄、FX、HUD。
- 拖拽、目标选择、触控。
- `VisualCommandQueue`。
- AI 对手头像、情绪、思考、短台词、IntentBar。

不负责：

- 规则裁决。
- AI 决策。
- 对手隐藏信息。

## 协议演进建议

当前 `docs/contracts/ONLINE_PROTOCOL.md` 描述了 MVP 已实现协议。AI-native 阶段建议增加：

```text
SnapshotMessage      # join/reconnect/desync recovery
EventBatchMessage    # 正常推进和 Unity 动画驱动
CommandAckMessage
CommandRejectedMessage
AIIntentMessage
```

推荐 event batch：

```json
{
  "type": "eventBatch",
  "protocolVersion": 1,
  "roomCode": "ABC123",
  "side": "blue",
  "fromVersion": 12,
  "toVersion": 13,
  "commandId": "cmd_123",
  "actorType": "human",
  "events": [],
  "playerView": {}
}
```

## 强类型事件

当前 MVP 的 `GameEvent` 是 loose payload。Unity 动画、AI replay 和 schema codegen 需要升级为 discriminated union：

```ts
type GameEvent =
  | { type: "turn.started"; payload: TurnStartedPayload }
  | { type: "card.drawn"; payload: CardDrawnPayload }
  | { type: "card.played"; payload: CardPlayedPayload }
  | { type: "hero.moved"; payload: HeroMovedPayload }
  | { type: "damage.applied"; payload: DamageAppliedPayload }
  | { type: "heal.applied"; payload: HealAppliedPayload }
  | { type: "shield.gained"; payload: ShieldGainedPayload }
  | { type: "reaction.opened"; payload: ReactionOpenedPayload }
  | { type: "reaction.resolved"; payload: ReactionResolvedPayload }
  | { type: "entity.defeated"; payload: EntityDefeatedPayload }
  | { type: "game.finished"; payload: GameFinishedPayload };
```

## 回放与可观测性

AI-native 必须记录：

```json
{
  "version": 13,
  "commandId": "cmd_123",
  "actor": "blue",
  "actorType": "human|ai",
  "command": {},
  "events": [],
  "stateHashBefore": "...",
  "stateHashAfter": "...",
  "aiDecisionId": "ai_decision_...",
  "timestamp": "..."
}
```

AI trace 默认不发给普通客户端，只进入 debug/replay/admin。

## 安全边界

- Client 永远只提交 command intent，不提交 result。
- Server 永远重新校验 side、token、version、legal command。
- AI 只能拿 redacted PlayerView。
- AI prompt 不包含 seatToken、connectionId、对手隐藏手牌。
- Debug endpoint 默认脱敏。
- LLM 输出必须经过 schema 和 legal action 校验。
