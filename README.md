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

## 安装与验证

```bash
npm install
npm test
npm run typecheck
npm run build
npm run smoke:online
npm run playtest:command-parity
```

当前验证基线：

- `npm test`：13 files / 40 tests passed。
- `npm run typecheck`：`tsc --noEmit` 通过。
- `npm run build`：Vite production build 通过。
- `npm run smoke:online`：启动真实房间服务并覆盖 `/healthz`、`/debug/rooms` 脱敏、WebSocket create/join/submit/disconnect/reconnect/stale connection。

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

客户端在线状态：

- `已连接`：已收到当前座位的 PlayerView。
- `正在连接`：正在创建或加入房间。
- `正在恢复`：正在用保存的 roomCode / side / seatToken 重连。
- `已断开`：当前没有活动 WebSocket，但保存的座位信息仍可用于 Reconnect。
- `连接错误`：连接、认证或旧 socket 提交失败；`STALE_CONNECTION` 和 `VERSION_MISMATCH` 会显示可执行提示。

服务端消息支持：

- `createRoom`
- `joinRoom`
- `reconnect`
- `submitCommand`
- `exportReplay`

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
- 首版无账号、匹配、排行榜、观战、AI、持久化。
- 响应窗口首版手动 pass，无倒计时裁决。

## 下一步

进入 playtest / MVP+：

1. 补齐更多卡牌精确效果和反应链细节。
2. 增加目标高亮、可达区域提示、非法动作解释。
3. 录制更多 playtest 脚本，扩展 golden tests。
4. 加入房间快照持久化和断线裁决。
