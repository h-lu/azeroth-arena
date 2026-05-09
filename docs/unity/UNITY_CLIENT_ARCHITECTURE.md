# UNITY_CLIENT_ARCHITECTURE

## 目的

定义未来 Unity client 的架构方向。Unity 是最终战斗客户端，负责游戏感和 AI 对手可感知体验；不负责规则裁决。

## 设计目标

- 第一眼像游戏，不像网页。
- 手牌拖拽有重量、回弹和目标反馈。
- AI 行动前有思考、意图和短台词。
- 所有规则结果来自 server event/snapshot。
- 支持 iPhone 横屏和触控。

## Scene

```text
unity-client/
  Assets/AzerothArena/Scenes/
    Boot.unity
    Match.unity
    CardGallery.unity
    VisualCommandSandbox.unity
```

- `Boot.unity`：初始化配置、资源、音频、日志、safe area。
- `Match.unity`：真实战斗。
- `CardGallery.unity`：卡牌/卡框/图标预览。
- `VisualCommandSandbox.unity`：mock events 动画沙盒。

## Prefab

```text
Prefabs/
  Board/
    GameBoard.prefab
    BoardAnchorSet.prefab
    ZoneLane.prefab
    PillarObstacle.prefab
    HeroSlot.prefab
    IntentBar.prefab
  Cards/
    CardView.prefab
    CardBack.prefab
    HandCardView.prefab
    HoverCardPreview.prefab
  Characters/
    HeroPortraitView.prefab
    AIOpponentPortrait.prefab
    EmotionBadge.prefab
    SpeechBubble.prefab
  FX/
    TargetingArrow.prefab
    ImpactBurst.prefab
    DamageNumber.prefab
    ShieldAbsorb.prefab
    DeathDissolve.prefab
    FocusMarker.prefab
  HUD/
    MatchHud.prefab
    EndTurnButton.prefab
    ReactionWindowPrompt.prefab
    DebugOverlay.prefab
```

## Scripts

```text
Scripts/
  Core/
    GameBootstrap.cs
    ServiceRegistry.cs
  Protocol/
    WebSocketTransport.cs
    GameProtocol.cs
    ClientMessageModels.cs
    ServerEventModels.cs
  State/
    ClientSnapshotStore.cs
    EntityViewRegistry.cs
  Commands/
    IVisualCommand.cs
    VisualCommandQueue.cs
    VisualCommandFactory.cs
  Board/
    BoardController.cs
    BoardAnchors.cs
    ZoneController.cs
  Cards/
    CardView.cs
    CardPresenter.cs
    CardDataBinder.cs
  Hand/
    HandController.cs
    HandLayoutController.cs
  Input/
    InputPermissionGuard.cs
    CardDragController.cs
    TargetingArrowController.cs
    DropZoneDetector.cs
  AI/
    AIOpponentView.cs
    AIEmotionController.cs
    AIThinkingPresenter.cs
    IntentHintPresenter.cs
  Visual/
    CameraRig.cs
    OutlineController.cs
    AudioCueBus.cs
    HapticsController.cs
  UI/
    MatchHud.cs
    SafeAreaFitter.cs
    DebugOverlay.cs
```

## 数据流

```text
Player input
  -> Unity intent
  -> WebSocket submitCommand
  -> TS authoritative server
  -> eventBatch + PlayerView snapshot
  -> VisualCommandFactory
  -> VisualCommandQueue
  -> animation
  -> ClientSnapshotStore reconcile
```

Unity 可以做输入前提示，但不能本地扣血、判死、抽牌或结算胜负。

## VisualCommandQueue

```csharp
public interface IVisualCommand
{
    string DebugName { get; }
    VisualCommandBlockingMode BlockingMode { get; }
    UniTask ExecuteAsync(VisualContext context, CancellationToken ct);
}
```

职责：

- 把 server events 转成动画命令。
- 控制动画期间输入锁。
- 合并/并行可合并的小事件。
- 动画结束后应用 snapshot。
- 事件缺失时用 snapshot 兜底重建 view。

串行：

- 抽牌、出牌、攻击、死亡、回合切换、反应窗口。

可并行：

- 多个小伤害数字、状态图标刷新、资源数字刷新、手牌 reflow。

## AI 对手表现

AI 面板：

```text
AIOpponentPortrait
  ├─ Portrait art
  ├─ Emotion layer
  ├─ Thinking ring
  ├─ Intent glyph slots
  ├─ Speech bubble anchor
  └─ Threat meter
```

状态：

| 状态 | 表现 |
| --- | --- |
| 冷静分析 | 思考环低速旋转 |
| 发现机会 | 边框短亮，目标区域微光 |
| 防守收缩 | 护盾纹样，颜色收暗 |
| 压迫推进 | 头像底座脉冲，IntentBar 强化 |
| 犹豫权衡 | 思考环分叉闪烁 |
| 失误受挫 | 边框裂纹，短台词 |

AI 思考节奏：

```text
0.2s：头像思考环亮起
0.5s：目标候选淡扫描线
1.0s：IntentBar 显示模糊倾向
出牌前 0.3s：目标锁定
行动：进入 VisualCommandQueue
```

禁止展示：

- 完整推理链。
- 对手具体手牌。
- AI 评分数值。
- “正在调用模型”。

## iPhone 横屏

- 逻辑安全画幅 16:9。
- 避开刘海、Dynamic Island、Home Indicator。
- 手牌永远在底部安全区内。
- End Turn 放右下，但避开 Home Indicator。
- 长按显示大卡预览。
- 触控目标至少 48x48 pt。
- 手牌 8+ 张时局部展开。
- 拖拽时卡牌向上偏移，避免被手指遮挡。

## MVP 顺序

1. `VisualCommandSandbox.unity` mock event stream。
2. `CardView.prefab`。
3. `HandLayoutController` 扇形手牌。
4. `CardDragController` 拖出/回弹/释放。
5. `AIOpponentView` 思考环、IntentBar、短台词。
6. 接 WebSocket / DTO。
7. iPhone 横屏触控优化。

## Week 5 Visual Prototype

当前原型位于 `unity-client/`，定位是视觉和交互验证，不负责规则裁决，也不接 Week 7-8 的 WebSocket。

已落地：

- `Assets/AzerothArena/Scenes/Match.unity`：通过 `MatchVisualPrototypeBootstrap` 生成 mock 战斗桌面、三区 lane、柱子、手牌和 AI 面板。
- `Assets/AzerothArena/Prefabs/Cards/CardView.prefab`：卡牌显示基础 prefab。
- `Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab`、`ThinkingRing.prefab`、`IntentBar.prefab`：AI 对手面板基础 prefab。
- `HandLayoutController`：手牌扇形排布、hover 抬升和平滑回位。
- `CardDragController`：拖拽抬升、速度倾斜、释放阈值和回弹。
- `VisualCommandQueue`：mock 视觉命令队列，支持输入锁和串行执行。
- `MockVisualCommandQueueDriver`：循环播放 AI thinking / intent 展示，保证无服务端时也能看到 AI 行动前思考。

验证入口：

```bash
npm run validate:unity-prototype
```

## Week 7 WebSocket Foundation

Week 7 starts the real server connection layer without moving rule authority into Unity.

Added scripts:

```text
Scripts/
  Protocol/
    ClientMessageModels.cs
    ServerEventModels.cs
    GameProtocol.cs
    WebSocketTransport.cs
    UnityRoomClient.cs
  State/
    ClientSnapshotStore.cs
```

Responsibilities:

- `ClientMessageModels.cs` and `ServerEventModels.cs` are temporary DTOs for the existing TypeScript online protocol.
- `GameProtocol.cs` owns message constants and JSON serialization / parsing.
- `WebSocketTransport.cs` owns `ClientWebSocket` lifecycle and text message delivery.
- `UnityRoomClient.cs` exposes create room, create AI encounter, join, reconnect, submit an already-legal command, and export replay.
- `ClientSnapshotStore.cs` stores session credentials, latest `PlayerView`, AI encounter debug payload, and last `roomError`.

Validation:

```bash
npm run validate:unity-websocket
```

Week 8 should wire this foundation into the real match HUD, target selection, rejection rebound/prompt UI, and the formal event-to-`VisualCommandQueue` path.

## Week 8 Match HUD / Input Wiring

Week 8 completes the remaining Unity WebSocket connection slice without taking Week 9's full animation scope.

Added scripts:

```text
Scripts/
  Input/
    InputPermissionGuard.cs
    TargetSelectionController.cs
  UI/
    MatchHud.cs
    ToastPromptView.cs
  Commands/
    VisualCommandFactory.cs
Generated/
  OnlineProtocolManifest.json
```

Responsibilities:

- `InputPermissionGuard` gates command submission on active session state, current `PlayerView`, legal commands, and queue input lock.
- `TargetSelectionController` implements the target-selection state machine by filtering already-legal command JSON from `ClientSnapshotStore.LegalCommands`; Unity still does not synthesize rule outcomes.
- `CardDragController.RequestRebound()` gives rejected drags a concrete rebound signal.
- `MatchHud` subscribes to `UnityRoomClient` and `TargetSelectionController` to display room/version/turn/legal-command state and rejection toast prompts.
- `VisualCommandFactory` maps `PlayerView.state.log` deltas into placeholder `VisualCommandQueue` entries and ends each batch with snapshot reconcile. Week 9 can replace these placeholders with full typed animation commands.
- `scripts/generate-unity-protocol-manifest.mjs` writes/checks `OnlineProtocolManifest.json`, documenting the current TS protocol source of truth and Unity temporary DTO mapping.

Validation:

```bash
npm run validate:unity-websocket
npm run generate:unity-protocol-manifest -- --check
```

## Week 9 VisualCommandQueue Formalization

Week 9 replaces the Week 8 placeholder event beat with typed visual commands while keeping TypeScript as the rules authority.

Added / updated contracts:

```text
packages/rules/src/types.ts
  GameEventPayloadByType
  GameEventType
  GameEvent

Scripts/
  Commands/
    VisualCommandFactory.cs
      BuildGameEventCommand
      BuildReplayVisualCommands
      DrawCardsVisualCommand
      PlayCardVisualCommand
      DamageVisualCommand
      EntityDefeatedVisualCommand
      RoundStartVisualCommand
      SnapshotReconcileVisualCommand
```

Responsibilities:

- `GameEvent` is now a discriminated union, so event payloads are typed at the rules/server boundary.
- Live `PlayerView.state.log` deltas and replay export command events both go through `VisualCommandFactory.BuildGameEventCommand()`.
- `card-drawn` drives draw animation without exposing hidden card ids; actual hand contents come from the viewer-specific snapshot during reconcile.
- `card-played`, `damage` / `end-round-damage`, `knockout`, and `round-start` map to named queue commands with blocking behavior.
- `SnapshotReconcileVisualCommand` remains the final command in both live and replay paths.

Validation:

```bash
npm run validate:unity-websocket
npm run generate:unity-protocol-manifest -- --check
```

## Week 11 Mobile-First Polish

Week 11 focuses on the Unity client feel layer for iPhone landscape without changing rule authority or advancing into Week 12 demo packaging.

Added / updated scripts:

```text
Scripts/
  UI/
    SafeAreaFitter.cs
    TouchTargetExpander.cs
    CardLongPressPreview.cs
    ReactionWindowMobilePrompt.cs
  Input/
    TargetSnapController.cs
    CardDragController.cs
    TargetSelectionController.cs
  Visual/
    MobileFeedbackController.cs
```

Responsibilities:

- `SafeAreaFitter` applies `Screen.safeArea` to the match canvas and constrains wide landscape screens back to the 16:9 logical play frame.
- `TouchTargetExpander` enforces a minimum 64x64 UI hit area for mobile buttons and cards.
- `CardLongPressPreview` shows a large card preview after a short hold, then hides it on drag, pointer exit, or release.
- `TargetSnapController` registers board/entity anchors, filters by `TargetSelectionController.CurrentState.SelectableTargetIds`, and lets drag release snap into `SelectTarget()` without creating rules client-side.
- `ReactionWindowMobilePrompt` exposes pass and trinket actions during `resolveReaction` windows using the same legal-command submission path as desktop HUD controls.
- `MobileFeedbackController` centralizes audio cue hooks and mobile haptics for drag start, target snap, rejected actions, and submit.
- `MatchVisualPrototypeBootstrap` mounts the safe-area, long-press preview, touch target, and feedback components in the local visual prototype so the mobile feel layer can be inspected before a full Unity build.

Validation:

```bash
npm run validate:unity-websocket
```
