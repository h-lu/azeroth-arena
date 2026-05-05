# AI_DIRECTOR_SPEC

## 目的

AI Director 是 Azeroth Arena 的差异化核心。它负责编排 AI-native 体验：遭遇、意图、人格、复盘和下一局变化。

AI Director 不是规则裁判，也不是每步动作选择器。实时出牌由 AI Player / BotPolicy 负责，规则结算由 rules engine 负责。

## 职责

AI Director 可以：

- 选择 AI persona。
- 选择敌方战术风格。
- 选择白名单 encounter template。
- 生成开局说明和敌方意图。
- 生成每回合公开 intent hint。
- 根据 replay 生成赛后复盘。
- 总结玩家倾向。
- 给下一局挑战建议。

AI Director 禁止：

- 直接修改 HP、伤害、抽牌、死亡。
- 临时改卡牌效果。
- 读取隐藏信息作为对局事实。
- 生成未经校验的新 command。
- 实时阻塞每个动作。
- 生成无法 replay 的随机剧情。

## Encounter Spec

```ts
interface AIEncounterSpec {
  encounterId: string;
  seed: string;
  personaId: string;
  enemyStyle: "aggressive" | "control" | "sustain" | "trickster";
  battlefieldModifierIds: string[];
  objectiveIds: string[];
  openingIntent: string;
}
```

要求：

- `seed` 必须记录进 replay。
- `personaId` 必须来自白名单。
- `battlefieldModifierIds` 必须来自白名单。
- `objectiveIds` 必须来自白名单。
- 不允许生成任意规则文本直接生效。

## Intent Hint

```ts
interface AIIntentHint {
  turn: number;
  source: "heuristic" | "director" | "template" | "llm";
  threatType:
    | "damage"
    | "heal"
    | "defense"
    | "control"
    | "interrupt"
    | "movement"
    | "burst"
    | "resource";
  targetEntityIds: string[];
  confidenceBand: "low" | "mid" | "high";
  text: string;
}
```

显示原则：

- 可以显示威胁类型和公开目标倾向。
- 可以显示模糊置信强度。
- 不显示对手具体手牌。
- 不显示完整行动树。
- 不展示 chain-of-thought。

示例：

```json
{
  "turn": 4,
  "source": "heuristic",
  "threatType": "burst",
  "targetEntityIds": ["hero-priest-blue"],
  "confidenceBand": "high",
  "text": "敌方正在围绕牧师组织爆发。"
}
```

## Post-game Summary

```ts
interface AIPostGameSummary {
  matchId: string;
  keyTurns: number[];
  playerStrengths: string[];
  playerMistakes: string[];
  decisiveMoment: string;
  nextRunSuggestion: string;
}
```

复盘应基于 replay/event log，而不是自由想象。

好的复盘：

- 指出具体回合。
- 说明公开事实。
- 给出下一局建议。
- 不泄露 AI 未公开隐藏信息。

坏的复盘：

- 长篇剧情。
- 空泛鼓励。
- 声称知道玩家看不到的信息。
- 伪造不存在的事件。

## 事件触发点

AI Director 推荐触发：

- 开局。
- 每回合开始。
- AI 发现高置信击杀线。
- 玩家过早交关键反应。
- AI 成功诱骗打断/徽记。
- 关键英雄濒死。
- 对局结束。
- run 进入下一场。

不推荐每个小动作都调用 LLM。

## MVP 策略

MVP 不接实时 LLM 或只异步接。

优先：

1. 白名单 encounter templates。
2. 三个 persona。
3. 模板 intent hint。
4. replay-based summary。
5. 所有 Director 输出落盘。

后续：

- LLM 改写短台词。
- LLM 生成赛后复盘。
- 长期玩家倾向摘要。
- 更多 encounter template。

## Week 3 v0 实现

当前 v0 位于 `server/aiDirector.ts`，不接实时 LLM：

- `AI_PERSONAS`：`arena-rival`、`calm-mentor`、`control-trickster` 三个白名单 persona。
- `ENCOUNTER_TEMPLATES`：`rival-burst-check`、`mentor-stability-check`、`trickster-reaction-trap` 三个白名单模板。
- `BATTLEFIELD_MODIFIERS` / `DIRECTOR_OBJECTIVES`：模板只能引用白名单 id，`validateDirectorWhitelists()` 会校验引用。
- `createDirectorEncounter()`：根据 roomCode、templateId、seed 生成确定性 `AIEncounterSpec`；未知模板会 fallback 到默认白名单模板并在 trace 标记 `fallbackUsed`。
- `createIntentHint()`：每个新 round 基于公开 `GameState` 指标生成 `AIIntentHint`，不展示隐藏手牌、牌库或完整行动树。
- `createPostGameSummary()`：只基于 replay entries 和 summary counters 生成赛后复盘。
- `AIDirectorTrace`：encounter、intent、dialogue、summary 都会输出 trace，并可写入 room replay。

验证入口：

```bash
npm test -- tests/server/aiDirector.test.ts
npm run playtest:ai-director
```

## 审计

每次 Director 输出都记录：

```ts
interface AIDirectorTrace {
  traceId: string;
  roomCode: string;
  version?: number;
  source: "template" | "heuristic" | "llm";
  inputSummary: string;
  outputType: "encounter" | "intent" | "summary" | "nextRun";
  output: unknown;
  latencyMs: number;
  fallbackUsed: boolean;
}
```

普通玩家客户端只接收必要的公开输出。完整 trace 只用于 debug/replay/admin。
