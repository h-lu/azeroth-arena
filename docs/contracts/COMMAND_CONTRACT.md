# COMMAND_CONTRACT

## 目的

冻结 `packages/rules/src` 里命令驱动的规则合同，确保本地热座、在线房间服务端和 replay 导出都依赖同一套状态机语义。

这里的“合同”不是实现细节，而是当前已经被测试覆盖并在产品里使用的行为边界：

- `createInitialGameState()` 的初始状态形状。
- `Command` 联合类型和每个分支需要的字段。
- `applyCommand()` 的成功 / 失败约定。
- `getLegalCommands()` 暴露给 UI 的可行动作集合。

## 稳定字段

### `GameState`

当前稳定的顶层字段如下：

- `round`
- `phase`
- `currentPlayer`
- `startingPlayer`
- `suppression`
- `winner`
- `heroes`
- `players`
- `cardById`
- `activation`
- `pendingReaction`
- `log`

其中：

- `phase` 当前取值为 `main`、`reaction`、`between-rounds`、`finished`。
- `currentPlayer` / `startingPlayer` 当前只会是 `blue` 或 `red`。
- `winner` 结束前为 `null`，击倒后为获胜方。
- `activation` 只在英雄激活窗口存在。
- `pendingReaction` 只在反应窗口存在。

### `HeroState`

当前稳定字段：

- `id`
- `name`
- `side`
- `role`
- `faction`
- `maxHp`
- `hp`
- `shield`
- `shieldExpiresAtRound`
- `zone`
- `decay`
- `activatedThisRound`
- `alive`
- `trinketAvailable`
- `pendingHardControl`
- `hardControlSourceId`
- `nextActivationNoMove`
- `nextActivationNoKeyMove`
- `nextActivationNoResponse`
- `healReduction`
- `damageTakenThisRound`

### `PlayerState`

当前稳定字段：

- `side`
- `deck`
- `hand`
- `discard`
- `focusTargetId`
- `focusTargetSelectedThisRound`
- `focusBonusUsed`
- `focusAvailable`
- `cooldowns`

### `Command`

命令联合类型固定为：

- `startTurn`：`{ type: "startTurn"; playerId: Side }`
- `endTurn`：`{ type: "endTurn"; playerId: Side }`
- `pass`：`{ type: "pass"; playerId: Side }`
- `activateHero`：`{ type: "activateHero"; playerId: Side; heroId: string }`
- `moveHero`：`{ type: "moveHero"; playerId: Side; heroId: string; toZone: ZoneId }`
- `playCard`：`{ type: "playCard"; playerId: Side; sourceHeroId: string; cardId: string; targetIds: string[]; toZone?: ZoneId; revealedCardId?: string; defenseSourceHeroId?: string; defenseCardId?: string; defenseTargetId?: string }`
- `resolveReaction`：`{ type: "resolveReaction"; playerId: Side; sourceHeroId: string; cardId?: string; targetIds?: string[]; useTrinket?: boolean; pass?: boolean }`
- `selectFocusTarget`：`{ type: "selectFocusTarget"; playerId: Side; targetId: string }`
- `useTrinket`：`{ type: "useTrinket"; playerId: Side; heroId: string; cardId?: string }`
- `discardCards`：`{ type: "discardCards"; playerId: Side; cardIds: string[] }`

### Additive command fields

- `playCard.toZone` is used by player-choice movement effects such as 绕柱、野性冲锋、战术撤退 and 心灵尖啸. Existing replays that omit it keep deterministic fallback movement.
- `playCard.revealedCardId` is used by 假读条. The card must be in hand, usable by the acting hero, and a non-fake-cast 施法牌. The reveal is logged.
- `playCard.defenseSourceHeroId` / `defenseCardId` / `defenseTargetId` provide a single no-chain defense before ordinary damage. This does not enter `reaction` phase.
- `selectFocusTarget` makes the start-round public focus choice replayable. If omitted, old flows keep the default first-enemy focus target.
- `useTrinket` covers already-hard-controlled heroes before they skip activation. With `cardId: "046-common-arena-insignia"` it uses the hand card instead of the built-in trinket.
- `discardCards` provides explicit hand-limit choice between rounds. If old flows skip it, `startTurn` auto-discards rightmost cards to keep replay compatibility and logs `discard-auto`.

### Public cooldown state

`PlayerState.cooldowns` is public and currently tracks interrupt cards:

```ts
{
  cardId: string;
  sourceHeroId: string;
  usedRound: number;
  usedUntilRound: number;
  reason: "interrupt";
}
```

While `round <= usedUntilRound`, the same side cannot use the same interrupt card id again, even if another copy is present in hand. MVP expiry happens at the start of the later round after `usedUntilRound`.

## 允许变化

- 卡牌数值平衡可以调整，只要不改变命令联合类型和 phase 流程。
- `log` 里事件的内部 payload 可以增加字段，但不能删掉当前已被测试依赖的字段。
- `getLegalCommands()` 的返回顺序可以调整，但返回的可选命令集合语义不能变；新增命令类型必须继续按 `playerId` 过滤后供在线座位使用。
- 未来可以补充更多 `GameEvent.type`，前提是现有事件类型仍然兼容。

## 禁止变化

- 不能改既有 `Command.type` 的名字，也不能把既有必填字段改成可选。新增可选字段必须保持旧 replay 可运行。
- 不能把 `playerId` / `heroId` / `cardId` / `targetIds` 的语义挪到别的字段里。
- 不能移除 `phase`、`activation`、`pendingReaction`、`players`、`heroes` 这些顶层状态。
- 不能取消当前约束：
  - 只有当前回合玩家可以行动。
  - 同一激活阶段只能移动一次、只能打出一张牌。
  - 反应窗口未结算前不能直接结束回合。
  - `startTurn` 只能在 `between-rounds` 且由下一回合先手方开始。
- 不能改变当前已落地的关键规则边界：
  - 施法 / 爆发 / 控制 / 关键位移会打开反应窗口。
  - 伤害、护盾、治疗、减疗、硬控递减、饰品清控的交互。
  - `winner` 的结算时机。

## 错误 / 边界

`applyCommand()` 的约定是：

- 永远返回 `{ state, events, errors }`。
- 命令非法时，`errors` 至少包含 1 条消息。
- 失败通过 `errors` 数组返回，不依赖抛出异常给调用方。

当前需要稳定覆盖的边界包括：

- `phase` 不匹配。
- 不是当前玩家回合。
- 英雄不属于该玩家。
- 英雄死亡。
- 英雄已激活过。
- 激活阶段里重复移动 / 重复打牌。
- 手牌里没有指定卡。
- 卡牌与英雄职业 / 阵营不兼容。
- 目标非法、缺目标、目标数不匹配。
- 反应窗口未先 `pass` / 反应 / 饰品就结束回合。
- `resolveReaction` 里：
  - 没有待处理窗口。
  - 反应英雄不属于当前响应方。
  - 响应英雄被硬控或饰品已用。
  - 反应窗口内使用饰品只能针对控制窗口。
  - 非窗口 `useTrinket` 只能在已硬控且尚未跳过激活时使用。
  - `discardCards` 只能在 `between-rounds` 且手牌超过 7 时使用。
  - 反应牌不在手牌、卡牌未知、费用不足。

## 验收测试建议

- 继续保留 `tests/golden/opening-state.test.ts` 作为初始状态快照。
- 用 `tests/golden/activation-flow.test.ts` 覆盖单英雄每回合一次激活与回合推进。
- 用 `tests/golden/movement-damage.test.ts` 覆盖移动后接近战打点。
- 用 `tests/golden/healing-shield-mortal.test.ts` 覆盖减疗、护盾和治疗的交互。
- 用 `tests/golden/control-reaction.test.ts` 覆盖控制窗口和饰品清控。
- 用 `tests/golden/focus-fire.test.ts` 覆盖集火目标和一次性集火加成。
- 再补一组负例测试，专门锁定非法 phase、非法目标、重复行动、反应窗口未关闭等拒绝分支。
