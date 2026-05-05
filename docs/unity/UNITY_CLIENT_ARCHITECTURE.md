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
