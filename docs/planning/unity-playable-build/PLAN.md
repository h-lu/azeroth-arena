# PLAN.md - Unity Playable Build Plan

## 总体策略

目标先收窄为：**Android-first 的 AI Encounter 真机完整一局**。

不要先追求“像炉石一样完整商业化”；先保证真实 build 能连 server、渲染 PlayerView、提交 legal command、播放最低可读反馈、完成一局。

## Phase 0 - Build Hygiene / 可编译工程

目标：让 Unity 工程从 source-ready 变成 build-ready。

### 工作项

1. 补齐 Unity project settings：
   - `ProjectSettings.asset`
   - `EditorBuildSettings.asset`
   - `QualitySettings.asset`
   - `GraphicsSettings.asset`
   - Android PlayerSettings
   - 后续 iOS PlayerSettings
2. 明确 build scene：
   - `Assets/AzerothArena/Scenes/Match.unity`
3. 新增 Editor build/validation 脚本：
   - compile validation
   - Android development APK build
   - iOS export placeholder/后续实现
4. Server URL 配置化：
   - runtime input/debug panel，或 ScriptableObject/JSON config
   - 默认不要硬编码手机不可达的 `127.0.0.1`
5. 横屏与 safe area 基础设置。

### 验收

- Windows Unity Editor 打开 `unity-client/` 无 missing script。
- `Match.unity` 在 Build Settings。
- Unity batchmode compile 通过。
- Android dev build 能产出 APK。

## Phase 1 - Live Match Shell

目标：真机/Editor 能连 TS server，创建 AI Encounter，收到 PlayerView。

### 工作项

1. 整理真实 `Match.unity` composition，挂载：
   - `WebSocketTransport`
   - `UnityRoomClient`
   - `ClientSnapshotStore`
   - `InputPermissionGuard`
   - `TargetSelectionController`
   - `VisualCommandQueue`
   - `VisualCommandFactory`
   - `MatchHud`
   - `ReactionWindowMobilePrompt`
   - `SafeAreaFitter`
   - `MobileFeedbackController`
2. 最小 HUD：
   - server URL
   - connect/disconnect/reconnect
   - create AI encounter
   - room/version/side/status
   - error toast
3. 保留 debug overlay，但不能挡住主流程。

### 验收

- Editor/真机输入 server URL 后可连接。
- 点击 Create AI Encounter 后出现 room/session/playerView 状态。
- server reject/连接失败有明确提示。

## Phase 2 - Snapshot Renderers

目标：`PlayerView` 驱动画面，而不是 mock 数据。

### 新增/落地组件

- `SnapshotPresenter`
- `EntityViewRegistry`
- `HeroView`
- `HandPresenter`
- `BoardZonePresenter`
- `CardDataBinder`
- `MatchHudPresenter`

### 显示内容

- 己方 3 英雄与敌方 3 英雄。
- 三个 zone/lane 与英雄站位。
- HP、shield、alive/knockout、control、trinket、focus target。
- 己方手牌。
- 对手手牌数量，不泄露手牌明细。
- round、phase、current player、legal command count。
- AI encounter objectives / intent / short dialogue。

### 原则

- `PlayerView` 是渲染源。
- Unity 可缓存 view，但每批 event 后必须 snapshot reconcile。
- Unity 不扣血、不判死、不抽牌、不算胜负。

## Phase 3 - Playable Input

目标：所有核心 command 都有可操作入口。

### 必须覆盖

- `startTurn` / `endTurn` / `pass`
- `selectFocusTarget`
- `activateHero`
- `moveHero`
- `playCard`
- `resolveReaction`：pass / trinket / reaction card
- `useTrinket`
- `discardCards`：如出现，至少有兜底入口

### 设计要求

- 手牌拖拽到合法目标可提交 `playCard`。
- 点击英雄/zone 可完成激活、移动、选目标。
- Reaction window 使用移动端 prompt。
- 加 `Legal Commands Drawer` 作为 P0 兜底：任何 legal command 都能手动点出，避免玩家有合法动作却无法操作。
- local illegal：立即回弹/提示。
- server reject：回弹 + toast + haptic，不软锁。

## Phase 4 - VisualCommand 真动画 P0

目标：最低可读，不追求华丽。

### 优先事件

1. `card-played`
2. `damage`
3. `heal`
4. `shield`
5. `move`
6. `reaction-opened / reaction-play / reaction-resolved`
7. `knockout`
8. `round-start / round-end`
9. `draw / discard / hand reflow`

### 验收

- 出牌有移动/闪烁。
- 伤害/治疗/护盾有数字或状态变化。
- 击倒明确可见。
- 回合切换明确可见。
- 动画期间输入锁生效。
- 动画后 snapshot reconcile。

## Phase 5 - Device Polish / 真机稳定性

目标：10 分钟试玩不卡、不崩、不软锁。

### 工作项

- iPhone/Android 横屏 safe area 实测。
- 触控目标 >= 48pt。
- 手牌长按预览。
- 拖拽吸附和取消 targeting。
- 网络断开/重连/stale connection UX。
- 简单日志导出/错误码显示。
- haptics 分级，避免全局粗暴震动。
- FPS/GC allocation 快速检查。

## Phase 6 - iOS / TestFlight 后续阶段

放在 Android 真机闭环之后。

### 需要

- macOS
- Unity iOS Build Support
- Xcode
- Apple Developer account
- bundle id / signing / provisioning
- ATS / `wss://` 或 dev exception
- TestFlight pipeline

## 验收脚本

### A. 启动与建局

1. 启动 server：`npm run dev:server`。
2. 手机打开 build。
3. 输入 `ws://<PC_LAN_IP>:8788`。
4. 点击 `Create AI Encounter`。

通过：30 秒内进入可操作对局，显示双方英雄、手牌、AI intent/objectives。

### B. 基础操作

1. 选择 focus target。
2. 激活一个英雄。
3. 移动英雄。
4. 打一张可用手牌到合法目标。
5. End Turn / Pass。

通过：每步走 server submit，version 递增，Unity 不伪结算，不软锁。

### C. 非法操作

1. 拖不可用卡。
2. 拖到非法目标。
3. 动画期间连续点击。
4. reaction window 外乱点 reaction。

通过：回弹/toast/input lock 生效，不重复提交旧 command。

### D. AI 回合

通过：thinking ring、intent、目标倾向、短台词、行动动画可读；不泄露隐藏信息。

### E. Reaction Window

通过：pass/trinket/reaction card 都能走 legal command，resolve 后回到正常对局。

### F. 完整一局

通过：打到 winner/finished，显示胜负与 summary/replay 入口，无崩溃、无卡死。

## 推荐多 agent 执行切分

1. `unity-build-agent`：ProjectSettings、build scripts、server URL config、Android build gate。
2. `unity-scene-agent`：Match scene composition、HUD shell、connect/create/reconnect。
3. `unity-snapshot-agent`：SnapshotPresenter、HeroView、HandPresenter、BoardZonePresenter、registry。
4. `unity-input-agent`：Legal Commands Drawer、drag/target/reaction command submission。
5. `unity-visual-agent`：VisualCommand animation P0、damage/heal/move/knockout/reconcile。
6. `controller`：合并、跑 TS/static gates、整理 Windows/Unity 真机验证清单。

## 当前阻塞/人工输入

- 需要一台装有 Unity `2022.3.48f1` 的 Windows 机器做 Editor compile / Android APK build。
- 真机测试需要 Android 设备或 iPhone；第一阶段建议 Android。
- 如果只在当前 WSL 环境推进，只能做到源码/静态校验，不能证明真机可玩。
