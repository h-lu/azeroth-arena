# AI_NATIVE_GAME_DESIGN

## 目的

这份文档定义 Azeroth Arena 下一阶段的产品方向：从“炉石式卡牌 MVP”升级为 **AI-native tactical card battler**。

当前仓库已有的 TypeScript rules engine、WebSocket room server、PlayerView redaction、replay/export 仍是核心资产。AI 和 Unity 客户端都应围绕这些资产演进，而不是推翻重写。

## 一句话定位

**Azeroth Arena 是一个 AI Director 驱动的确定性战术卡牌对战游戏：玩家在炉石式牌桌上，对抗有策略、人设、记忆和复盘能力的 AI 对手；规则可信、过程可回放、体验由 AI 动态编排。**

## 不是什么

Azeroth Arena 不应定位为：

- 炉石 clone。
- 网页卡牌 UI。
- 普通随机 bot 对战。
- LLM 直接裁决规则的叙事玩具。
- 第一阶段的 PVP 天梯产品。
- 任意自然语言造卡沙盒。

## 是什么

Azeroth Arena 应定位为：

- 确定性规则卡牌对战。
- 单人 AI encounter 优先。
- AI 对手可读、可感知、可复盘。
- 3-5 场短 run 循环。
- Unity 高质量战斗客户端。
- React/Web 作为 debug、replay、开发工具。
- TS rules/server 作为权威裁判。

## 核心体验

玩家应该感受到：

1. **像游戏**：实体牌桌、扇形手牌、拖拽、目标线、攻击/伤害/死亡动画、音效和震动。
2. **AI 有意图**：AI 行动前有思考、倾向、目标提示，而不是瞬间自动结算。
3. **AI 有个性**：不同 AI 有不同风险偏好、策略风格和短台词。
4. **AI 会复盘**：赛后能指出关键回合、玩家失误或亮点。
5. **规则可信**：AI 不直接改规则结果，所有行动都经过 rules engine 校验。

## 设计原则

### P0：规则可信高于 AI 自由度

AI 不能直接修改：

- HP / shield / damage。
- 抽牌、死亡、控制状态。
- 随机结果。
- 隐藏信息。
- 未经校验的 card effect。

AI 只能选择服务端枚举出的合法 `Command`。

### P0：AI 是 Player / Director，不是裁判

```text
Rules Engine = 裁判
AI Player    = 对手
AI Director  = 导演 / 意图 / 复盘 / 遭遇编排
Unity Client = 舞台 / 交互 / 表现
React Client = 调试台
```

### P0：Replay-first

AI-native 游戏必须优先可回放：

- bot 决策可记录。
- AI prompt/output 可记录。
- encounter 参数可记录。
- event stream 可重放。
- 最终 state hash 可验证。

## 核心玩法循环

```text
选择英雄 / 战术包
  ↓
AI Director 生成 encounter：敌方风格、目标、战场词缀、开局意图
  ↓
玩家对战 AI Player
  ↓
Rules Engine 确定性结算
  ↓
Unity 播放事件动画，表现 AI 思考和行动
  ↓
对局结束
  ↓
AI Director 根据 replay 生成复盘和下一局变化
```

## Run 循环

首版建议 3 场一 run：

```text
第 1 场：基础遭遇，建立敌方风格
第 2 场：AI 根据玩家倾向轻微调整
第 3 场：宿敌升级 / boss encounter
```

## MVP 必须证明的事

- 第一眼不像网页，像游戏。
- AI 不是随机 bot。
- 玩家能感知 AI 正在思考和改变策略。
- 赛后复盘能说出本局关键点。
- AI 没有破坏规则可信度。

## MVP 必须砍掉的事

- 卡包、商店、经济系统。
- 天梯、匹配、排行榜。
- 大规模 PVP。
- 任意自然语言造卡。
- 大而全构筑系统。
- 长篇剧情生成。
- 复杂账号系统。
- 第一阶段 iOS TestFlight。
