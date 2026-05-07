# AI_NATIVE_ROADMAP

## 目标

用 6 周证明 AI-native vertical slice，用 12 周形成可展示 MVP。

## 6 周路线

### Week 1 — Contract / Protocol / AI 边界

交付：

- `docs/ai/AI_PLAYER_SPEC.md`
- `docs/ai/AI_DIRECTOR_SPEC.md`
- 协议演进草案。
- AI 禁止触碰字段清单。
- replay/trace 格式草案。

验收：

- AI 与 rules/server 边界清晰。
- 不允许 AI 直接裁决规则。

### Week 2 — Bot baseline

交付：

- 非 LLM `BotPolicy`。
- 从 `PlayerView.legalCommands` 选择合法命令。
- aggressive / control / sustain 三种权重。
- AI decision trace。
- AI vs AI smoke script。

验收：

- AI 能完整走合法 command path。
- 非法输出有 fallback。

实现状态：

- `server/aiBotPolicy.ts`：非 LLM baseline、稳定 `actionId`、三种风格、decision trace、安全 fallback。
- `server/aiBotPlaytest.ts`：AI vs AI 固定步数 playtest core。
- `scripts/playtest-ai-bot.mjs` / `npm run playtest:ai-bot`：输出 JSON trace 与 Markdown 摘要。

### Week 3 — AI Director v0

交付：

- Encounter template 白名单。
- 3 个 AI persona。
- 每回合 intent hint。
- replay-based post-game summary。
- 模板短台词。

验收：

- 不接实时 LLM 也能感知 AI 意图。
- 所有 Director 输出可 replay。

实现状态：

- `server/aiDirector.ts`：白名单 `AI_PERSONAS`、`ENCOUNTER_TEMPLATES`、battlefield modifiers、objectives，以及确定性的 encounter / intent / dialogue / summary / trace 生成。
- `server/aiBotPlaytest.ts`：AI vs AI smoke 默认记录 Director v0 encounter、每 round intent hint、模板短台词、赛后复盘和 `AIDirectorTrace`。
- `RoomManager.registerDirectorTrace()`：把 Director 输出作为 `kind: "director"` 的 replay entry 落入 room replay/export。
- `scripts/playtest-ai-director.mjs` / `npm run playtest:ai-director`：输出 Director-focused JSON 与 Markdown 摘要。

### Week 4 — Web debug playable slice

交付：

- React debug client 可进入 AI encounter。
- 显示敌方意图、本局目标、战场词缀。
- 显示 AI trace / replay summary。

验收：

- 先验证 AI-native 是否能被理解，不等待 Unity。

实现状态：

- `createAIEncounter` WebSocket request：创建单人 AI encounter room，默认真人蓝方、AI 红方，也支持偏好座位。
- `RoomManager.advanceAIEncounter()`：服务端用 BotPolicy 自动推进 AI 侧，每步仍通过合法 `Command` 和权威 `applyCommand`。
- `aiEncounterUpdated` ServerMessage：下发公开 encounter debug state，不包含 AI seat token、connectionId 或隐藏手牌；BotPolicy trace 只公开脱敏摘要。
- React Web debug client：菜单里可选择白名单 encounter template 并点击 `AI 遭遇` 进入可玩局。
- Web debug UI：显示敌方 intent hints、本局 objectives、battlefield modifiers、脱敏 AI decision trace、Director trace、live replay summary 和结束后的 post-game summary。

### Week 5 — Unity visual prototype

交付：

- `Match.unity`。
- `CardView.prefab`。
- `HandLayoutController`。
- `CardDragController`。
- mock `VisualCommandQueue`。
- `AIOpponentView` + ThinkingRing + IntentBar。

验收：

- 第一眼像游戏。
- 手牌拖拽有重量。
- AI 行动前有可感知思考。

实现状态：

- `unity-client/Assets/AzerothArena/Scenes/Match.unity`：Week 5 可视原型场景，启动 `MatchVisualPrototypeBootstrap` 生成 mock 战斗桌面。
- `unity-client/Assets/AzerothArena/Prefabs/Cards/CardView.prefab`：基础卡牌 prefab，配套 `CardView` 展示接口。
- `HandLayoutController`：扇形手牌布局、hover lift 和平滑回位。
- `CardDragController`：拖拽抬升、速度倾斜、释放阈值和回弹 reflow。
- `VisualCommandQueue` + `MockVisualCommandQueueDriver`：本地 mock 动画队列和 AI thinking beat，不接服务器。
- `AIOpponentView` + `ThinkingRing` + `IntentBar`：AI 头像面板、思考环、意图强度条、短台词和 mood color hooks。
- `npm run validate:unity-prototype`：校验 Week 5 Unity 原型交付文件与关键类标记。

### Week 6 — Vertical slice playtest

交付：

- 3 个英雄。
- 3 种 AI 风格。
- 5 个 encounter templates。
- 1 个 3 场 run。
- replay + AI 复盘。
- playtest report。

验收：

- 试玩者能说出“AI 不是随机 bot”。
- 复盘能指出关键回合。

实现状态：

- `server/aiDirector.ts`：Director 白名单扩展到 5 个 encounter templates，覆盖 burst、mentor stability、reaction trap、sustain dampening、caster lock 五类遭遇。
- `server/aiVerticalSlicePlaytest.ts`：Week 6 三场 run 编排，固定覆盖每方 3 英雄、`aggressive` / `control` / `sustain` 三种 AI 风格、replay 计数、intent/command mix 和 AI 复盘摘要。
- `scripts/playtest-ai-vertical-slice.mjs` / `npm run playtest:ai-vertical-slice`：输出每场 replay JSON、AI review Markdown、汇总 JSON/Markdown，并更新 repo 内 playtest report。
- `docs/playtest/week-6-vertical-slice-report.md`：保存最近一次 Week 6 vertical slice playtest report，便于人工审阅 AI 是否表现为非随机 bot。

## 12 周路线

### Week 7-8 — Unity 接 WebSocket

交付：

- C# DTO codegen 或临时 DTO。
- 创建/加入/AI 房间。
- 接收 `PlayerView`。
- 发送 `submitCommand`。
- 服务端拒绝时 Unity 回弹/提示。

Week 7 实现状态：

- `unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs` / `ServerEventModels.cs`：临时 C# DTO 覆盖当前在线协议的 client/server message envelope、room joined、player view、room error、AI encounter debug 和 replay export。
- `GameProtocol.cs`：集中维护 `createRoom`、`createAIEncounter`、`joinRoom`、`reconnect`、`submitCommand`、`exportReplay` 与 server message 常量，使用 Newtonsoft JSON 序列化动态 `PlayerView.state` / `legalCommands`。
- `WebSocketTransport.cs`：Unity `ClientWebSocket` transport，支持 connect / send / receive loop / disconnect，并在 Unity `Update()` 中派发收到的文本消息。
- `UnityRoomClient.cs`：提供 create room、create AI encounter、join、reconnect、submit existing legal command、export replay 的薄客户端 API。
- `ClientSnapshotStore.cs`：保存当前 session、最新 `PlayerView`、AI encounter debug state、对手断线和 server error，用于 Week 8 接入真实 HUD / 输入回弹。
- `npm run validate:unity-websocket`：静态校验 Week 7 Unity WebSocket 文件、消息名与 Unity Newtonsoft 包依赖。

Week 8 留存范围：

- 正式目标选择 UX。
- server reject 后的具体卡牌回弹 / toast 视觉表现。
- DTO codegen 管线与 VisualCommandQueue 的正式事件映射。

### Week 9 — VisualCommandQueue 正式化

交付：

- 强类型 `GameEvent`。
- Event -> VisualCommand 映射。
- 抽牌、出牌、伤害、死亡、回合开始动画。
- Snapshot reconcile。
- 回放也走同一队列。

### Week 10 — AI Director v1

交付：

- 15 个 encounter templates。
- 多局 player memory。
- 结构化赛后复盘。
- AI 成本、延迟、fallback 指标。

### Week 11 — Mobile-first polish

交付：

- iPhone 横屏 safe area。
- 触控目标放大。
- 手牌长按预览。
- 目标吸附。
- 反应窗口移动端 UI。
- 音效 / 震动。

### Week 12 — Demo package

交付：

- Unity 可玩 build 或录屏 demo。
- Web debug client 保留。
- 1 个完整 3-5 战 run。
- replay 可导出。
- AI trace 可审计。
- 下一阶段 iOS / TestFlight 决策。

## MVP 必砍

- 卡包 / 商店 / 经济系统。
- 天梯 / 匹配 / 排行榜。
- 大规模 PVP。
- 任意自然语言造卡。
- 大而全构筑系统。
- 长篇剧情生成。
- 复杂账号系统。
- 第一阶段 iOS TestFlight。
- AI 完整推理链展示。

## 进入实现的推荐顺序

1. 实现非 LLM `BotPolicy`。
2. 新增 AI room mode。
3. AI decision trace 写入 replay。
4. Web debug client 显示 AI intent。
5. Unity visual sandbox 并行启动。
