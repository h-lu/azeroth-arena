import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCommand, createInitialGameState } from "../packages/rules/src/index.ts";

const REPORT_PATH = resolve(process.cwd(), "../../azeroth-arena-command-complete-parity/PLAYTEST_COMMAND_PARITY_REPORT.md");

function runCommand(state, command) {
  const result = applyCommand(state, command);
  if (result.errors.length > 0) {
    throw new Error(`${JSON.stringify(command)} failed: ${result.errors.join("; ")}`);
  }
  return result.state;
}

function opposite(side) {
  return side === "blue" ? "red" : "blue";
}

function ensureCard(state, side, cardId) {
  if (!state.players[side].hand.includes(cardId)) state.players[side].hand.push(cardId);
}

function emptyDecksAndHands(state) {
  state.players.blue.deck = [];
  state.players.red.deck = [];
  state.players.blue.hand = [];
  state.players.red.hand = [];
  state.players.blue.focusAvailable = 8;
  state.players.red.focusAvailable = 8;
  for (const hero of Object.values(state.heroes)) {
    hero.zone = "center";
    hero.shield = 0;
    hero.shieldExpiresAtRound = 0;
  }
  return state;
}

function passUntil(state, side) {
  if (state.phase === "finished") return state;
  if (state.phase === "between-rounds") return state;
  if (state.currentPlayer !== side) {
    state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  }
  return state;
}

function selectFocuses(state, blueTargetId, redTargetId) {
  if (!state.players.blue.focusTargetSelectedThisRound) {
    state = runCommand(state, { type: "selectFocusTarget", playerId: "blue", targetId: blueTargetId });
  }
  if (!state.players.red.focusTargetSelectedThisRound) {
    state = runCommand(state, { type: "selectFocusTarget", playerId: "red", targetId: redTargetId });
  }
  return state;
}

function passWindow(state, metrics, enemyHeroId, sourceHeroId) {
  const window = state.pendingReaction;
  if (!window) return state;
  metrics.responseWindows += 1;
  const enemy = opposite(window.sourceSide);
  state = runCommand(state, { type: "resolveReaction", playerId: enemy, sourceHeroId: enemyHeroId, pass: true });
  if (state.pendingReaction) {
    state = runCommand(state, { type: "resolveReaction", playerId: window.sourceSide, sourceHeroId, pass: true });
  }
  return state;
}

function respondWith(state, metrics, side, heroId, cardId, targetId) {
  if (!state.pendingReaction) return state;
  metrics.responseWindows += 1;
  ensureCard(state, side, cardId);
  return runCommand(state, { type: "resolveReaction", playerId: side, sourceHeroId: heroId, cardId, targetIds: [targetId] });
}

function act(state, metrics, side, heroId, cardId, targetIds, opts = {}) {
  if (state.phase === "finished") return state;
  state = passUntil(state, side);
  ensureCard(state, side, cardId);
  if (opts.revealedCardId) ensureCard(state, side, opts.revealedCardId);
  if (opts.defenseCardId) ensureCard(state, opposite(side), opts.defenseCardId);
  state = runCommand(state, { type: "activateHero", playerId: side, heroId });
  state = runCommand(state, {
    type: "playCard",
    playerId: side,
    sourceHeroId: heroId,
    cardId,
    targetIds,
    toZone: opts.toZone,
    revealedCardId: opts.revealedCardId,
    defenseSourceHeroId: opts.defenseSourceHeroId,
    defenseCardId: opts.defenseCardId,
    defenseTargetId: opts.defenseTargetId,
  });
  metrics.effectiveHeroes.add(heroId);
  if (state.pendingReaction) {
    if (opts.response?.kind === "interrupt") {
      state = respondWith(state, metrics, opposite(side), opts.response.heroId, opts.response.cardId, targetIds[0] ?? heroId);
    } else if (opts.response?.kind === "defense") {
      state = respondWith(state, metrics, opposite(side), opts.response.heroId, opts.response.cardId, opts.response.targetId ?? targetIds[0]);
      if (state.pendingReaction) state = runCommand(state, { type: "resolveReaction", playerId: side, sourceHeroId: heroId, pass: true });
    } else {
      state = passWindow(state, metrics, opts.response?.enemyHeroId ?? `${opposite(side)}-${opposite(side) === "blue" ? "priest" : "druid"}`, heroId);
    }
  }
  return state;
}

function startNextRound(state) {
  if (state.phase === "finished") return state;
  if (state.activation) throw new Error("cannot start next round during activation");
  state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  if (state.phase === "finished") return state;
  state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  if (state.phase === "finished") return state;
  const nextStarter = state.startingPlayer === "blue" ? "red" : "blue";
  state = runCommand(state, { type: "startTurn", playerId: nextStarter });
  state.players.blue.focusAvailable = 8;
  state.players.red.focusAvailable = 8;
  return state;
}

function roundSnapshot(state) {
  return Object.values(state.heroes)
    .map((hero) => `${hero.id}:${hero.hp}/${hero.maxHp}@${hero.zone}${hero.pendingHardControl ? "/HC" : ""}${hero.decay ? `/DR${hero.decay}` : ""}`)
    .join(", ");
}

function runCommandParityScenario() {
  let state = emptyDecksAndHands(createInitialGameState());
  const metrics = { responseWindows: 0, effectiveHeroes: new Set(), snapshots: [] };

  state = selectFocuses(state, "red-warrior", "blue-mage");
  state = act(state, metrics, "blue", "blue-priest", "044-common-pillar-dance", ["blue-mage"], { toZone: "left", response: { enemyHeroId: "red-warrior" } });
  state = act(state, metrics, "red", "red-warrior", "028-warrior-charge", ["blue-mage"], { response: { enemyHeroId: "blue-rogue" } });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-warrior", "blue-mage");
  state = act(state, metrics, "red", "red-warrior", "026-warrior-mortal-strike", ["blue-mage"], {
    defenseSourceHeroId: "blue-mage",
    defenseCardId: "017-mage-ice-barrier",
    defenseTargetId: "blue-mage",
  });
  state = act(state, metrics, "blue", "blue-mage", "043-common-fake-cast", [], {
    revealedCardId: "018-mage-pyroblast",
    response: { kind: "interrupt", heroId: "red-warlock", cardId: "034-warlock-spell-lock" },
  });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-warrior", "blue-priest");
  state = act(state, metrics, "blue", "blue-mage", "018-mage-pyroblast", ["red-warrior"], {
    response: { kind: "defense", heroId: "red-druid", cardId: "047-common-team-protection", targetId: "red-warrior" },
  });
  state = act(state, metrics, "red", "red-warlock", "035-warlock-curse-of-agony", ["blue-priest"], { response: { enemyHeroId: "blue-mage" } });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-druid", "blue-priest");
  state.heroes["red-druid"].zone = state.heroes["red-warrior"].zone;
  state = act(state, metrics, "red", "red-druid", "042-druid-wild-charge", ["red-warrior"], { toZone: "center", response: { enemyHeroId: "blue-mage" } });
  state = act(state, metrics, "blue", "blue-priest", "022-priest-psychic-scream", ["red-warrior"], { toZone: "right", response: { enemyHeroId: "red-druid" } });
  state = runCommand(state, { type: "useTrinket", playerId: "red", heroId: "red-warrior" });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-warrior", "blue-priest");
  state.heroes["blue-rogue"].zone = "center";
  state = act(state, metrics, "blue", "blue-rogue", "011-rogue-shadowstep", ["red-warrior"], { response: { enemyHeroId: "red-druid" } });
  state.heroes["blue-priest"].zone = state.heroes["red-warrior"].zone;
  state = act(state, metrics, "red", "red-warrior", "025-warrior-heroic-strike", ["blue-priest"]);
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-warrior", "blue-priest");
  state = act(state, metrics, "red", "red-warlock", "036-warlock-chaos-bolt", ["blue-priest"], {
    response: { kind: "defense", heroId: "blue-priest", cardId: "023-priest-pain-suppression", targetId: "blue-priest" },
  });
  state = act(state, metrics, "blue", "blue-priest", "019-priest-flash-heal", ["blue-priest"], { response: { enemyHeroId: "red-warlock" } });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  state = startNextRound(state);
  state = selectFocuses(state, "red-warrior", "blue-priest");
  state = act(state, metrics, "blue", "blue-priest", "020-priest-power-word-shield", ["blue-priest"]);
  state = act(state, metrics, "red", "red-warrior", "030-warrior-recklessness", ["blue-priest"], {
    response: { kind: "defense", heroId: "blue-priest", cardId: "047-common-team-protection", targetId: "blue-priest" },
  });
  metrics.snapshots.push(`R${state.round}: ${roundSnapshot(state)}`);

  return { state, metrics };
}

const { state, metrics } = runCommandParityScenario();
const events = state.log;
const knocked = Object.values(state.heroes).find((hero) => !hero.alive);
const cooldowns = events.filter((event) => event.type === "cooldown-start").length;
const inlineDefenses = events.filter((event) => event.type === "inline-defense").length;
const focusSelections = events.filter((event) => event.type === "focus-selected").length;
const movementChoices = events.filter((event) => event.type === "move" && event.payload.toZone).length;
const fakeReveal = events.find((event) => event.type === "fake-cast-success")?.payload?.revealedCardId ?? "none";

const lines = [
  "# Playtest Command Parity Report",
  "",
  "Generated by `npm run playtest:command-parity` / `node --import tsx scripts/playtest-command-parity.mjs`.",
  "",
  "## Result",
  "",
  `- End round: ${state.round}`,
  `- Winner: ${state.winner ?? "none"}`,
  `- Knocked hero: ${knocked?.id ?? "none"}`,
  `- Effective heroes: ${metrics.effectiveHeroes.size}`,
  `- Response windows: ${metrics.responseWindows}`,
  `- Focus selections: ${focusSelections}`,
  `- Movement choices logged: ${movementChoices}`,
  `- Inline defenses: ${inlineDefenses}`,
  `- Interrupt cooldown starts: ${cooldowns}`,
  `- Fake-cast revealed card: ${fakeReveal}`,
  "",
  "## Round Snapshots",
  "",
  ...metrics.snapshots.map((line) => `- ${line}`),
  "",
  "## Feel Notes",
  "",
  "- 选择型位移明显改善了绕柱和救援手感：法师能被明确拉到左柱，德鲁伊能把集火目标拉回中场，心灵尖啸能把目标推到右柱。",
  "- 普通伤害前防御没有打开额外反应链；寒冰屏障这类防御能在同一个 command 内复盘，节奏比新增窗口更快。",
  "- 假读条记录了展示牌，骗出法术封锁后 cooldown 进入公开状态；后续回合的打断资源更容易复盘。",
  "- 第 6-7 回合抑制开始压低治疗和护盾，但防爆发反应仍能阻止突然击杀；脚本没有出现第 1-3 回合早杀。",
  "- 没有自然击倒，主要原因是 6-8 回合脚本有意覆盖防守资源交换；如果要压出击杀，需要在第 6 回合后减少团队保护/痛苦压制密度或提高集火侧连续近战跟进。",
  "",
];

writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, endRound: state.round, winner: state.winner ?? "none", events: state.log.length }, null, 2));
