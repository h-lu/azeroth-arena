# TASK.md - Azeroth Arena Unity Playable Build

## 任务目标

把当前 Azeroth Arena Unity prototype 推进到 **真机可玩 build**：玩家能在手机/Unity build 中连接本地或局域网 TS server，创建 AI Encounter，并完整打一局。

本阶段目标不是商店级炉石，也不是重写规则；核心是把已有 server/rules/AI/Unity 脚本接成一个真实 playable loop。

## 当前基线

- TS rules/server/Web MVP 已完成，Week 12 demo package 已本地 commit。
- Unity 项目存在于 `repo/unity-client/`，Unity 版本 `2022.3.48f1`。
- 当前 Unity 是 source-ready / prototype-ready：有 `Match.unity`、mock visual bootstrap、WebSocket DTO/transport、`UnityRoomClient`、`ClientSnapshotStore`、HUD/targeting/visual queue/mobile polish 脚本。
- 当前 Unity 还不是完整 playable client：真实 Match scene 未集成 live client，缺 PlayerView→View 绑定，缺 build settings / player settings / editor build scripts，真机 server URL 不能默认用 `127.0.0.1`。

## 成功标准

P0 成功定义：**AI Encounter 真机完整一局**。

玩家能：
1. 打开 Unity build。
2. 配置或输入可访问的 WebSocket server URL。
3. 创建 AI Encounter。
4. 看到己方/敌方 3 英雄、三区域、HP/护盾/控制/饰品/当前回合、手牌、AI intent/objectives/短台词。
5. 通过 Unity UI/触控提交核心合法命令。
6. 由 TS server 权威结算，Unity 只做输入与表现。
7. 遇到非法操作/server reject 时回弹、toast、不卡死。
8. 打到 winner/finished，并看到结束提示与 summary/replay 入口。

## 非目标

- 不做账号、匹配、卡包、天梯、商店。
- 不做炉石级完整美术/VFX/SFX。
- 不做生产级后端部署。
- 不做 iOS TestFlight 作为第一目标；Android-first，iOS 后置到 macOS/Xcode/signing 阶段。
- 不 push、不建 PR，除非用户另行确认。

## 推荐验证设备路径

优先 Android-first：

1. Windows 安装 Unity Hub + Unity `2022.3.48f1` + Android Build Support。
2. Windows 或可被手机访问的机器运行 `npm run dev:server`。
3. 手机连接 `ws://<Windows局域网IP>:8788`。
4. Unity Android development APK 安装到真机。
5. 完成 AI Encounter 一局验收脚本。

## 关键风险

- 当前执行环境没有 Unity Editor，无法在 WSL 内证明 C# 编译/真机 build。
- WSL 不适合作为 Unity 真机构建主环境；可继续承担 TS/server/静态校验。
- 手机不能使用 `ws://127.0.0.1:8788` 连接开发机。
- iOS 需要 macOS + Xcode + Apple signing + ATS/wss 策略。
