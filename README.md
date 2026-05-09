# Azeroth Arena MVP

这是《艾泽拉斯竞技场》的完整 MVP：规则裁判、本地热座 Web 沙盒、双人实时私人房间，以及基础 playtest 导出。

## 目录

```text
packages/data/src/     英雄、卡牌、地图、初始 setup
packages/rules/src/    纯函数规则引擎：GameState / Command / applyCommand
src/                   Vite + React 客户端，本地热座 + 在线房间 UI
server/                WebSocket 私人房间服务端，服务端权威规则结算
tests/golden/          规则 golden tests
tests/server/          房间 / PlayerView / replay tests
```

## 设计文档

当前 MVP 已实现规则裁判、Web 沙盒和在线房间。下一阶段方向是 AI-native + Unity client，相关设计文档：

- `docs/vision/AI_NATIVE_GAME_DESIGN.md`：AI-native 产品定位与核心体验。
- `docs/architecture/AI_NATIVE_ARCHITECTURE.md`：TS rules/server、AI、Unity 的架构边界。
- `docs/ai/AI_PLAYER_SPEC.md`：AI 玩家合法动作选择、策略、记忆和安全边界。
- `docs/ai/AI_DIRECTOR_SPEC.md`：AI Director 的遭遇、意图、复盘和审计设计。
- `docs/unity/UNITY_CLIENT_ARCHITECTURE.md`：Unity 客户端场景、Prefab、交互和 VisualCommandQueue。
- `docs/roadmap/AI_NATIVE_ROADMAP.md`：6 周 / 12 周落地路线。

## 安装与验证

```bash
npm install
npm test
npm run typecheck
npm run build
npm run smoke:online
npm run playtest:command-parity
npm run playtest:ai-bot
npm run playtest:ai-director
npm run playtest:ai-director-v1
npm run playtest:ai-vertical-slice
npm run validate:unity-websocket
npm run generate:unity-protocol-manifest -- --check
```

当前验证基线：

- `npm test`：17 files / 62 tests passed。
- `npm run typecheck`：`tsc --noEmit` 通过。
- `npm run build`：Vite production build 通过。
- `npm run smoke:online`：启动真实房间服务并覆盖 `/healthz`、`/debug/rooms` 脱敏、WebSocket create/join/submit/disconnect/reconnect/stale connection。
- `npm run playtest:ai-bot`：运行非 LLM BotPolicy 的 AI vs AI 固定步数 smoke，并在 `playtest-results/ai-bot/` 输出 JSON trace、Director v1 trace 与 Markdown 摘要。
- `npm run playtest:ai-director`：运行 Director 重点 smoke，并在 `playtest-results/ai-director/` 输出 encounter、intent hints、模板短台词、结构化赛后复盘、player memory 与可 replay trace。
  - 最新 AI Director v0 playtest：`playtest-results/ai-director/ai-bot-playtest.md`，stop reason `maxSteps`，final round 4，80 commands，8 response windows，1 interrupt；Turn 3 recorded an interrupt。
- `npm run playtest:ai-director-v1`：运行 Week 10 三场 Director v1 run，并在 `playtest-results/ai-director-v1/` 输出多局 memory、结构化复盘、AI cost / latency / fallback metrics，同时更新 `docs/playtest/week-10-ai-director-v1-report.md`。
- `npm run playtest:ai-vertical-slice`：运行 Week 6 三场 AI-native vertical slice，并在 `playtest-results/ai-vertical-slice/` 输出每场 replay / AI 复盘，同时更新 `docs/playtest/week-6-vertical-slice-report.md`。
- `npm run validate:unity-websocket`：静态校验 Week 7-11 Unity WebSocket DTO、transport、room client、snapshot store、HUD / target selection / reject feedback / typed event mapping / replay queue、移动端触控手感组件与当前协议对齐。
- `npm run generate:unity-protocol-manifest -- --check`：校验 Unity 协议 manifest 与 TS protocol / rules command / GameEvent type 源保持一致。

## 本地热座

```bash
npm run dev
```

打开 Vite 输出的地址。默认模式是 Local Hotseat，一台浏览器里双方轮流操作。

本地热座支持：

- 三地域地图。
- 英雄 HP / 护盾 / 控制 / 递减 / 饰品状态。
- 当前玩家手牌。
- 合法命令按钮。
- 选择英雄、卡牌、目标后打牌。
- 反应窗口 pass / 反应牌 / 饰品。
- 事件日志、错误提示、Reset。

## 在线私人房间 MVP-1

开两个终端：

```bash
npm run dev:server
npm run dev:client
```

默认房间服务：`ws://localhost:8788`。

两浏览器测试流程：

1. 浏览器 A 切到 Online Room，点击 Create Room。
2. 复制 roomCode。
3. 浏览器 B 切到 Online Room，输入 roomCode，点击 Join Room。
4. 双方各自看到自己的 hand；对手 hand 被隐藏，只显示数量。
5. 当前行动方提交命令，服务端用 `applyCommand` 权威结算并广播 PlayerView。
6. 刷新或 socket 断开后，客户端会使用本地保存的 roomCode / side / seatToken 尝试恢复，也可以点击 Reconnect 手动恢复。

## Web AI Encounter Debug

Week 4 增加了 Web debug playable slice，不需要等 Unity：

1. 开两个终端：

```bash
npm run dev:server
npm run dev:client
```

2. 浏览器切到 Online Room，打开菜单，选择 AI Encounter 模板。
3. 点击 `AI 遭遇` 创建单人 AI 房间。
4. 玩家提交己方合法命令后，服务端会用 BotPolicy 自动推进 AI 侧，AI 仍走同一条 `submitCommand -> applyCommand` 权威结算路径。

Web debug client 会显示：

- 敌方 intent hint、置信区间和目标倾向。
- 本局 Director objectives。
- Battlefield modifiers。
- 脱敏 AI decision trace 与 Director trace。
- Live replay summary 与结束后的 replay-based post-game summary。

客户端在线状态：

- `已连接`：已收到当前座位的 PlayerView。
- `正在连接`：正在创建或加入房间。
- `正在恢复`：正在用保存的 roomCode / side / seatToken 重连。
- `已断开`：当前没有活动 WebSocket，但保存的座位信息仍可用于 Reconnect。
- `连接错误`：连接、认证或旧 socket 提交失败；`STALE_CONNECTION` 和 `VERSION_MISMATCH` 会显示可执行提示。

服务端消息支持：

- `createRoom`
- `createAIEncounter`
- `joinRoom`
- `reconnect`
- `submitCommand`
- `exportReplay`
- `aiEncounterUpdated`

服务端保证：

- seatToken 校验。
- command side 与座位一致。
- expectedVersion 防重复 / 过期提交。
- PlayerView 隐藏对手 hand/deck/discard 明细。
- 服务端内存保存完整 GameState 与 replay。

运维 / 诊断端点：

- `GET /healthz` 返回 JSON：`status`、`uptimeMs`、`roomCount`、`activeConnectionCount`、`timestamp`。
- `GET /debug/rooms` 返回安全脱敏后的房间快照，只包含 metadata、seat 连接状态和 replay 摘要，不包含 `seatToken`。

真实链路 smoke：

```bash
npm run smoke:online
```

可选环境变量：

- `SMOKE_PORT=18788`：脚本自启服务时使用的本地端口。
- `SMOKE_WS_URL=ws://127.0.0.1:8788`：连接已有服务，不自启。
- `SMOKE_RESULT_PATH=path/to/result.json`：保存脱敏后的 smoke 结果。

## Playtest 导出

在线房间里可以导出：

- JSON replay：完整 replay events + summary + final/current state。
- CSV summary：roomCode、version、round、winner、responseWindowCount、interruptCount、trinketUseCount 等。
- Markdown summary：便于复盘。

AI baseline playtest：

```bash
npm run playtest:ai-bot
npm run playtest:ai-director
npm run playtest:ai-director-v1
```

`playtest:ai-bot` 默认配置为蓝方 `aggressive`、红方 `sustain`，最多执行 80 个合法 command。可选环境变量：

- `AI_BOT_MAX_STEPS=120`：调整固定步数上限。
- `AI_BOT_RESULT_DIR=path/to/output`：调整 JSON/Markdown 输出目录。

BotPolicy 不接实时 LLM，只从 `PlayerView.legalCommands` 中选择动作；每个候选动作会生成稳定 `actionId`，每次选择会输出 AI decision trace。

AI Director playtest：

- `server/aiDirector.ts` 提供 3 个白名单 persona、15 个 encounter templates、battlefield modifiers 和 objectives。
- 每局开局输出 `AIEncounterSpec` 与模板短台词。
- 每个新 round 输出公开 `AIIntentHint`，只包含威胁类型、目标倾向和模糊置信度，不展示隐藏手牌或完整行动树。
- 对局结束后基于 replay counters / command entries 生成 `AIPostGameSummary`，包含结构化复盘、player memory 和 AI cost / latency / fallback metrics。
- Director 输出通过 `AIDirectorTrace` 写入 AI playtest JSON 和 room replay，便于审计与重放。

`playtest:ai-director` 可选环境变量：

- `AI_DIRECTOR_MAX_STEPS=120`：调整固定步数上限。
- `AI_DIRECTOR_RESULT_DIR=path/to/output`：调整 JSON/Markdown 输出目录。
- `AI_DIRECTOR_ENCOUNTER_TEMPLATE_ID=trickster-reaction-trap`：选择白名单 encounter template；未知模板会 fallback 到默认白名单模板并记录 trace。

Week 10 Director v1 multi-match playtest：

- 固定运行 3 场 run，跨局传递 `AIPlayerMemory`。
- 验证 15 个 encounter templates 可用，并覆盖 memory rematch / feint 模板。
- 汇总每局结构化复盘 section 数、memory match count、AI cost / latency / fallback metrics。
- 汇总报告写入 `docs/playtest/week-10-ai-director-v1-report.md`。

```bash
npm run playtest:ai-director-v1
```

可选环境变量：

- `AI_DIRECTOR_V1_MAX_STEPS=120`：调整每场固定步数上限。
- `AI_DIRECTOR_V1_RESULT_DIR=path/to/output`：调整 JSON/Markdown 输出目录。
- `AI_DIRECTOR_V1_REPORT_PATH=docs/playtest/custom-report.md`：调整 repo 内汇总报告路径。

Week 6 vertical slice playtest：

- 覆盖每方 3 英雄阵容、`aggressive` / `control` / `sustain` 三种 AI 风格、5 个 Director 白名单模板。
- 固定运行 3 场 encounter run，每场输出 replay JSON 和 AI 复盘 Markdown。
- 汇总报告写入 `docs/playtest/week-6-vertical-slice-report.md`，便于随 repo 审阅。

```bash
npm run playtest:ai-vertical-slice
```

可选环境变量：

- `AI_VERTICAL_SLICE_MAX_STEPS=120`：调整每场固定步数上限。
- `AI_VERTICAL_SLICE_RESULT_DIR=path/to/output`：调整 replay / 复盘产物目录。
- `AI_VERTICAL_SLICE_REPORT_PATH=docs/playtest/custom-report.md`：调整 repo 内汇总报告路径。

## Unity Visual Prototype

Week 5 增加了本地 Unity visual prototype，不接 WebSocket，不提前进入 Week 6 playtest scope。

```text
unity-client/Assets/AzerothArena/Scenes/Match.unity
```

原型包含：

- `CardView.prefab` 和 `CardView` 数据绑定接口。
- `HandLayoutController` 扇形手牌、hover 抬升和平滑回位。
- `CardDragController` 拖拽抬升、速度倾斜、释放阈值和回弹。
- mock `VisualCommandQueue` 与 `MockVisualCommandQueueDriver`。
- `AIOpponentView`、`ThinkingRing`、`IntentBar` 的 AI 思考和意图展示。

本地文件完整性校验：

```bash
npm run validate:unity-prototype
```

## Unity WebSocket Foundation

Week 7 增加了 Unity 连接房间服务的基础层，Week 8 把它接到 match-facing HUD / 输入状态，仍由 TypeScript server / rules 权威结算：

- `Scripts/Protocol/ClientMessageModels.cs` / `ServerEventModels.cs`：当前在线协议的临时 DTO，使用 Unity 官方 Newtonsoft JSON 包承载动态 `PlayerView.state` 和 `legalCommands`。
- `Scripts/Protocol/GameProtocol.cs`：消息名常量、序列化、server message envelope 解析和合法 command JSON 克隆。
- `Scripts/Protocol/WebSocketTransport.cs`：基于 `ClientWebSocket` 的 Unity transport，接收消息在 `Update()` 中派发回主线程。
- `Scripts/Protocol/UnityRoomClient.cs`：创建 PvP 房间、创建 AI encounter、加入、重连、提交已有合法 command、导出 replay 的薄客户端。
- `Scripts/State/ClientSnapshotStore.cs`：保存 `roomCode`、`side`、`seatToken`、`PlayerView`、AI encounter debug state 和最近 server error。
- `Scripts/Input/InputPermissionGuard.cs`：基于 session、`legalCommands` 和 `VisualCommandQueue.InputLocked` 判断是否允许提交输入。
- `Scripts/Input/TargetSelectionController.cs`：从现有合法命令中反查卡牌/目标选择，最终提交完整 command，不在 Unity 侧生成规则结果。
- `Scripts/UI/MatchHud.cs` / `ToastPromptView.cs`：显示连接/房间/回合/合法命令状态，并把 server reject 显示为 toast。
- `Scripts/Input/CardDragController.cs`：新增 reject/rebound 信号，让被拒绝拖拽明确回弹。
- `Scripts/Commands/VisualCommandFactory.cs`：把 live `PlayerView.state.log` 和 replay export command events 映射为正式 `VisualCommandQueue` 命令，再执行 snapshot reconcile。
- `Generated/OnlineProtocolManifest.json` + `scripts/generate-unity-protocol-manifest.mjs`：记录 TS 协议源、command type 和 GameEvent type 的生成清单，校验协议没有漂移。

## Unity VisualCommandQueue Formalization

Week 9 把视觉队列从 placeholder event beat 推进到 typed event mapping：

- `GameEvent` 在 `packages/rules/src/types.ts` 中是 discriminated union，当前事件 payload 由 `GameEventPayloadByType` 约束。
- `card-drawn` 事件只公开 `playerId`、`amount`、`handCount`、`deckCount`，不泄露隐藏抽牌 card id。
- `VisualCommandFactory` 将 live `PlayerView.state.log` 和 replay export command events 统一映射到同一个 `BuildGameEventCommand()`。
- 正式命名视觉命令覆盖抽牌、出牌、伤害、死亡、回合开始，并在 live / replay 批次末尾执行 snapshot reconcile。

静态校验：

```bash
npm run validate:unity-websocket
npm run generate:unity-protocol-manifest -- --check
```

## Unity Mobile-first Polish

Week 11 补齐移动端手感层，仍不改变 TS server / rules 的权威规则边界：

- `Scripts/UI/SafeAreaFitter.cs`：iPhone 横屏 safe area 和 16:9 逻辑画幅。
- `Scripts/UI/TouchTargetExpander.cs`：移动端最小触控命中区。
- `Scripts/UI/CardLongPressPreview.cs`：手牌长按大卡预览。
- `Scripts/Input/TargetSnapController.cs`：拖拽释放目标吸附，live 路径最终仍调用合法 `SelectTarget()` 提交；prototype 可用显式目标列表检查吸附手感。
- `Scripts/UI/ReactionWindowMobilePrompt.cs`：移动端反应窗口 pass / trinket prompt。
- `Scripts/Visual/MobileFeedbackController.cs`：拖拽、吸附、拒绝、提交的音效 hook 和移动端震动。

静态校验：

```bash
npm run validate:unity-websocket
```

## 已实现规则范围

- 6 个英雄：盗贼、法师、牧师、战士、术士、德鲁伊。
- 三区地图：`left / center / right`。
- 50 张正式卡牌数据。
- 回合、专注、英雄每回合一次激活。
- 移动、打牌、过、结束回合。
- 伤害、护盾、治疗、减疗。
- 集火目标与一次性集火奖励。
- 回合开始公开集火选择 command。
- 硬控、软控、递减。
- 施法 / 爆发 / 控制 / 关键位移反应窗口。
- 选择型位移 `toZone`、假读条 `revealedCardId`、非窗口饰品 / 竞技场徽记解控。
- 普通伤害前单次防御 command、公开打断 cooldown、手牌上限 7 与弃牌流程。
- 抑制值随回合推进。

## MVP assumptions

- 不是 50 张卡的自然语言效果都已做到最终精确版；核心测试卡已接入解释器，其余卡保留 MVP 级行为。
- 在线服务端使用内存房间；重启服务会丢失房间。
- 首版无账号、匹配、排行榜、观战、持久化；AI 目前仅包含非 LLM BotPolicy baseline 和离线 AI vs AI smoke。
- 响应窗口首版手动 pass，无倒计时裁决。

## 下一步

进入 playtest / MVP+：

1. 补齐更多卡牌精确效果和反应链细节。
2. 增加目标高亮、可达区域提示、非法动作解释。
3. 录制更多 playtest 脚本，扩展 golden tests。
4. 加入房间快照持久化和断线裁决。
