# AI_PLAYER_SPEC

## 目的

定义 AI Player 的职责、输入输出、决策流程和安全边界。AI Player 是“像真人一样提交合法动作的对手”，不是规则裁判。

## 核心原则

**AI Player 永远不能直接修改 GameState。**

AI 只允许从服务端给出的 `legalCommands` 中选择一个动作，然后走与真人完全相同的 `submitCommand -> applyCommand` 路径。

## 输入

AI Player 每次决策只能获得：

```ts
interface AIPlayerInput {
  roomCode: string;
  side: Side;
  version: number;
  playerView: PlayerView;      // redacted view，只包含该 side 可见信息
  legalCommands: Command[];    // server/rules 枚举出的合法动作
  persona: AIPersona;
  matchMemory?: MatchMemory;
  difficulty: AIDifficulty;
}
```

禁止输入：

- 对手真实 hand/deck 明细。
- `seatToken`。
- `connectionId`。
- 完整服务端内部 `GameState`，除非是离线 admin/eval 模式。

## 输出

推荐 AI 先输出 `actionId`，不要直接自由生成 command：

```ts
interface AIActionChoice {
  decisionId: string;
  actionId: string;
  intent: "pressure" | "survive" | "bait" | "setup" | "recover" | "finish";
  confidence: number;
  publicReason?: string;
  dialogue?: string;
}
```

`actionId` 由服务端把 `legalCommands` canonicalize + hash 后生成。

## 决策架构

```text
PlayerView + legalCommands
  -> LegalActionEncoder
  -> TacticalEvaluator
  -> SearchPlanner
  -> optional LLMDirector
  -> ActionArbiter
  -> SafetyGate
  -> Command
```

### TacticalEvaluator

低延迟 heuristic，默认必备。

评分维度：

- 是否有击杀线。
- 是否需要保命。
- 集火目标价值。
- 资源价值：手牌、冷却、饰品、反应牌。
- 位置价值：三区地图和柱子。
- 控制价值：硬控、软控、递减。
- 反应窗口价值：打断、减伤、徽记是否值得交。

### SearchPlanner

可选，难度较高时启用。

- 从候选动作里取 top N。
- 用 `applyCommand` 做 1-3 ply 模拟。
- 对隐藏信息只能 belief sampling，不能读取真实隐藏状态。
- 响应窗口优先浅搜索，避免延迟。

### LLMDirector

不直接出牌。

适合做：

- persona 风格选择。
- 战术意图解释。
- 短台词。
- 赛后复盘。
- 长期记忆摘要。
- 调整 heuristic 权重。

不适合做：

- 直接生成 command。
- 每个动作实时阻塞。
- 读取隐藏信息。
- 裁决规则效果。

## 防 hallucination 链路

```text
legalCommands[]
  -> canonical command hash
  -> actionId
  -> AI returns actionId
  -> actionId exists?
  -> command hash still legal?
  -> expectedVersion still current?
  -> submitCommand
```

Fallback：

1. LLM 超时：用 heuristic top 1。
2. LLM 返回非法 actionId：丢弃，用 heuristic。
3. heuristic 异常：`pass` / `endTurn` / `resolveReaction pass`。
4. version mismatch：重新拉 PlayerView 后重新决策。

## Persona

```ts
interface AIPersona {
  id: string;
  name: string;
  archetype: "duelist" | "controller" | "mentor" | "trickster" | "rival";
  aggression: number;
  riskTolerance: number;
  bluffFrequency: number;
  resourceGreed: number;
  chatFrequency: number;
  mercy: number;
}
```

首批建议：

- `arena-rival`：激进，抓击杀线，短句挑衅。
- `calm-mentor`：稳健，偏教学，会指出失误。
- `control-trickster`：诱骗反应牌，保资源，控场。

## Difficulty

| 难度 | 行为 |
| --- | --- |
| easy | heuristic，偶尔漏算，不追最优 |
| normal | heuristic + 1 ply，合理保命和集火 |
| hard | 2 ply，懂反应窗口和资源交换 |
| arena | 2-3 ply + 玩家习惯记忆，不作弊 |
| mentor | 不追求最狠，偏教学和解释 |

高难度禁止读取隐藏信息。只能更会推测，不能作弊。

## Memory

分层：

```text
MatchMemory   # 当前对局：反应使用、集火偏好、资源交换
PlayerMemory  # 多局：玩家倾向统计
PersonaMemory # 宿敌关系和长期叙事
```

示例：

```ts
interface PlayerTendencyMemory {
  playerId: string;
  earlyTrinketUseRate: number;
  focusTargetSwitchRate: number;
  reactionPassBias: number;
  preferredTargetRole?: string;
  notes: string[];
}
```

Memory 必须可清除、可关闭，不保存敏感 token，不把未知隐藏信息写成事实。

## MVP 实现顺序

1. 非 LLM `BotPolicy`。
2. `legalCommands -> actionId` 编码。
3. aggressive / control / sustain 三种权重。
4. AI decision trace。
5. AI vs AI smoke。
6. 模板短台词。
7. 再引入 LLM 做复盘和异步台词。

## Week 2 baseline 实现

当前 baseline 位于 `server/aiBotPolicy.ts`，只读取 `PlayerView` 与 `legalCommands`：

- `encodeLegalActions()` 对每个合法 `Command` 做 canonical JSON + SHA-256，生成稳定 `actionId`。
- `chooseBotCommand()` 支持 `aggressive` / `control` / `sustain` 三种启发式风格。
- 每次选择输出 `AIDecisionTrace`，包含 `decisionId`、`side`、`version`、`style`、`selectedActionId`、`selectedCommand`、`intent`、`confidence`、`candidateCount`、`candidateScores`、`fallbackUsed`、`reason`。
- 无合法动作时返回 `null`；评分异常或非法选择时退回 `resolveReaction pass` / `pass` / `endTurn` / `startTurn` / `discardCards` 等安全合法动作。

AI vs AI smoke 位于 `server/aiBotPlaytest.ts` 与 `scripts/playtest-ai-bot.mjs`：

```bash
npm run playtest:ai-bot
```

脚本默认跑固定步数并输出 JSON trace 与 Markdown 摘要，不接实时 LLM，不读取隐藏手牌。
