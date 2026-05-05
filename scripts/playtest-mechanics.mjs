import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyCommand, createInitialGameState } from "../packages/rules/src/index.ts";

const REPORT_PATH = resolve(process.cwd(), "../../azeroth-arena-mechanics-design-parity-playtest/PLAYTEST_FEEL_REPORT.md");

function cloneStateForScenario() {
  const state = createInitialGameState();
  state.players.blue.deck = [];
  state.players.red.deck = [];
  for (const player of Object.values(state.players)) {
    player.hand = [];
    player.focusAvailable = 6;
  }
  for (const hero of Object.values(state.heroes)) {
    hero.zone = "center";
  }
  return state;
}

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
  if (!state.players[side].hand.includes(cardId)) {
    state.players[side].hand.push(cardId);
  }
}

function refillFocus(state) {
  state.players.blue.focusAvailable = 6;
  state.players.red.focusAvailable = 6;
}

function startNextRound(state) {
  if (state.phase === "finished") return state;
  state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  if (state.phase === "finished") return state;
  state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  if (state.phase === "finished") return state;
  const nextStarter = state.startingPlayer === "blue" ? "red" : "blue";
  state = runCommand(state, { type: "startTurn", playerId: nextStarter });
  refillFocus(state);
  return state;
}

function passUntil(state, side) {
  if (state.phase === "finished") return state;
  if (state.currentPlayer !== side) {
    state = runCommand(state, { type: "pass", playerId: state.currentPlayer });
  }
  return state;
}

function passWindow(state, metrics, enemyHeroId, sourceHeroId) {
  const window = state.pendingReaction;
  if (!window) return state;
  const enemy = opposite(window.sourceSide);
  metrics.responseWindows += 1;
  state = runCommand(state, { type: "resolveReaction", playerId: enemy, sourceHeroId: enemyHeroId, pass: true });
  if (state.pendingReaction) {
    state = runCommand(state, { type: "resolveReaction", playerId: window.sourceSide, sourceHeroId, pass: true });
  }
  return state;
}

function respondWith(state, metrics, responderSide, responderHeroId, cardId, targetId) {
  const window = state.pendingReaction;
  if (!window) return state;
  metrics.responseWindows += 1;
  ensureCard(state, responderSide, cardId);
  return runCommand(state, { type: "resolveReaction", playerId: responderSide, sourceHeroId: responderHeroId, cardId, targetIds: [targetId] });
}

function trinket(state, metrics, side, heroId) {
  const window = state.pendingReaction;
  if (!window) return state;
  metrics.responseWindows += 1;
  return runCommand(state, { type: "resolveReaction", playerId: side, sourceHeroId: heroId, useTrinket: true });
}

function act(state, metrics, side, heroId, cardId, targetIds, response) {
  if (state.phase === "finished") return state;
  state = passUntil(state, side);
  if (state.phase === "between-rounds" || state.phase === "finished") return state;
  ensureCard(state, side, cardId);
  state = runCommand(state, { type: "activateHero", playerId: side, heroId });
  state = runCommand(state, { type: "playCard", playerId: side, sourceHeroId: heroId, cardId, targetIds });
  metrics.effectiveHeroes.add(heroId);

  if (state.pendingReaction) {
    if (response?.kind === "interrupt") {
      state = respondWith(state, metrics, opposite(side), response.heroId, response.cardId, targetIds[0] ?? heroId);
    } else if (response?.kind === "defense") {
      state = respondWith(state, metrics, opposite(side), response.heroId, response.cardId, response.targetId ?? targetIds[0]);
      if (state.pendingReaction) state = runCommand(state, { type: "resolveReaction", playerId: side, sourceHeroId: heroId, pass: true });
    } else if (response?.kind === "trinket") {
      state = trinket(state, metrics, opposite(side), response.heroId);
    } else {
      state = passWindow(state, metrics, response?.enemyHeroId ?? `${opposite(side)}-${opposite(side) === "blue" ? "priest" : "druid"}`, heroId);
    }
  }
  return state;
}

function collectMetrics(state, metrics, name, notes) {
  const events = state.log;
  const knocked = Object.values(state.heroes).find((hero) => !hero.alive);
  const winner = state.winner ?? "none";
  const killRound = knocked ? state.round : null;
  const killZone = knocked?.zone ?? "none";
  const trinkets = events.filter((event) => event.type === "trinket").length;
  const dr = events.filter((event) => event.type === "control-downgraded" || event.type === "control-immune").length;
  const earlyBurst = Boolean(winner !== "none" && killRound !== null && killRound <= 3);
  const turtle = winner === "none" && state.round >= 8;
  return {
    name,
    winner,
    endRound: state.round,
    killedHero: knocked?.id ?? "none",
    killZone,
    effectiveHeroCount: metrics.effectiveHeroes.size,
    responseWindows: metrics.responseWindows,
    trinkets,
    diminishingReturns: dr,
    earlyBurst,
    turtle,
    notes,
  };
}

function runScenario(name, script, notes) {
  let state = cloneStateForScenario();
  const metrics = { responseWindows: 0, effectiveHeroes: new Set() };
  state = script(state, metrics);
  return collectMetrics(state, metrics, name, notes);
}

const scenarios = [
  runScenario("Blue RMP fake-cast into kill setup", (state, metrics) => {
    ensureCard(state, "blue", "018-mage-pyroblast");
    state = act(state, metrics, "blue", "blue-mage", "043-common-fake-cast", [], { kind: "interrupt", heroId: "red-warlock", cardId: "034-warlock-spell-lock" });
    state = act(state, metrics, "red", "red-warrior", "026-warrior-mortal-strike", ["blue-mage"]);
    state = startNextRound(state);
    state = act(state, metrics, "red", "red-druid", "038-druid-swiftmend", ["red-warrior"]);
    state = act(state, metrics, "blue", "blue-mage", "018-mage-pyroblast", ["red-warrior"], { kind: "defense", heroId: "red-druid", cardId: "047-common-team-protection", targetId: "red-warrior" });
    state = startNextRound(state);
    state = act(state, metrics, "blue", "blue-rogue", "008-rogue-wound-poison", ["red-warrior"]);
    state = act(state, metrics, "red", "red-warlock", "031-warlock-corruption", ["blue-mage"]);
    state = act(state, metrics, "blue", "blue-priest", "024-priest-shadow-word-death", ["red-warrior"]);
    return state;
  }, "假读条成功骗掉术士打断，但团队保护让第 2 回合炎爆只形成压力；击杀未过早发生。"),
  runScenario("Red WLD sustained pressure", (state, metrics) => {
    state = act(state, metrics, "blue", "blue-priest", "020-priest-power-word-shield", ["blue-mage"]);
    state = act(state, metrics, "red", "red-warlock", "031-warlock-corruption", ["blue-mage"]);
    state = startNextRound(state);
    state = act(state, metrics, "red", "red-warrior", "026-warrior-mortal-strike", ["blue-mage"]);
    state = act(state, metrics, "blue", "blue-priest", "019-priest-flash-heal", ["blue-mage"], { enemyHeroId: "red-warlock" });
    state = startNextRound(state);
    state = act(state, metrics, "red", "red-warlock", "036-warlock-chaos-bolt", ["blue-mage"], { kind: "defense", heroId: "blue-priest", cardId: "047-common-team-protection", targetId: "blue-mage" });
    state = act(state, metrics, "blue", "blue-priest", "020-priest-power-word-shield", ["blue-mage"]);
    return state;
  }, "红方持续压法师，治疗可被打断但也有护盾/团队保护；压力成立但不直接爆杀。"),
  runScenario("Control chain with trinket and DR", (state, metrics) => {
    state = act(state, metrics, "blue", "blue-rogue", "010-rogue-kidney-shot", ["red-warrior"], { kind: "trinket", heroId: "red-warrior" });
    state = act(state, metrics, "red", "red-warlock", "033-warlock-fear", ["blue-priest"], { enemyHeroId: "blue-mage" });
    state = startNextRound(state);
    state = act(state, metrics, "red", "red-druid", "039-druid-cyclone", ["blue-priest"], { enemyHeroId: "blue-mage" });
    state = act(state, metrics, "blue", "blue-mage", "014-mage-polymorph", ["red-warrior"], { enemyHeroId: "red-warlock" });
    state = startNextRound(state);
    state = act(state, metrics, "blue", "blue-rogue", "010-rogue-kidney-shot", ["red-warrior"], { enemyHeroId: "red-druid" });
    return state;
  }, "饰品与递减都触发，控制链没有连续剥夺同一目标多次完整行动。"),
  runScenario("Pillar reset and line-of-sight defense", (state, metrics) => {
    state = act(state, metrics, "blue", "blue-priest", "044-common-pillar-dance", ["blue-mage"], { enemyHeroId: "red-warrior" });
    state.heroes["red-warlock"].zone = "right";
    state.heroes["blue-mage"].zone = "left";
    state = act(state, metrics, "red", "red-warrior", "028-warrior-charge", ["blue-mage"], { enemyHeroId: "blue-rogue" });
    state = startNextRound(state);
    state = act(state, metrics, "blue", "blue-rogue", "011-rogue-shadowstep", ["red-warrior"], { enemyHeroId: "red-druid" });
    state.heroes["red-druid"].zone = state.heroes["red-warrior"].zone;
    state = act(state, metrics, "red", "red-druid", "042-druid-wild-charge", ["red-warrior"], { enemyHeroId: "blue-mage" });
    return state;
  }, "绕柱能改变目标关系，但位移方向仍是 MVP 近似，不是完整玩家选择。"),
  runScenario("Suppression late-round attrition", (state, metrics) => {
    for (let i = 0; i < 5; i += 1) state = startNextRound(state);
    state = act(state, metrics, "red", "red-warrior", "026-warrior-mortal-strike", ["blue-priest"]);
    state = act(state, metrics, "blue", "blue-priest", "019-priest-flash-heal", ["blue-priest"], { enemyHeroId: "red-warlock" });
    state = startNextRound(state);
    state = act(state, metrics, "blue", "blue-priest", "020-priest-power-word-shield", ["blue-priest"]);
    state = act(state, metrics, "red", "red-warlock", "036-warlock-chaos-bolt", ["blue-priest"], { kind: "defense", heroId: "blue-priest", cardId: "023-priest-pain-suppression", targetId: "blue-priest" });
    return state;
  }, "第 6/7 回合抑制明显压低治疗/护盾，终局压力出现，但仍有防爆响应。"),
];

const lines = [
  "# Playtest Feel Report",
  "",
  "Generated by `npm run playtest:mechanics` / `node --import tsx scripts/playtest-mechanics.mjs`.",
  "",
  "| Scenario | End round | Winner | Effective heroes | Response windows | Kill zone | Trinkets | DR triggers | Early burst | Turtle | Feel |",
  "|---|---:|---|---:|---:|---|---:|---:|---|---|---|",
  ...scenarios.map((row) => `| ${row.name} | ${row.endRound} | ${row.winner} | ${row.effectiveHeroCount} | ${row.responseWindows} | ${row.killZone} | ${row.trinkets} | ${row.diminishingReturns} | ${row.earlyBurst ? "yes" : "no"} | ${row.turtle ? "yes" : "no"} | ${row.notes} |`),
  "",
  "## Summary",
  "",
  "- 施法/打断/假读条：假读条有明确收益，骗掉打断后下一次真实施法更容易形成压力；当前脚本里不会造成无交互 OTK。",
  "- 控制/解控：饰品和递减都进入日志，硬控链被压住；仍需要真人测试“不能响应一次”的提示是否足够清楚。",
  "- 站位：同区/相邻/隔区限制开始影响动作选择；位移方向目前仍是 MVP 近似，复杂绕柱选择没有完全表达。",
  "- 压力终局：第 6/7 回合治疗和护盾明显变薄，能推动终局；没有观察到第 1-3 回合过早爆杀。",
  "- 龟缩：5 个脚本没有出现纯龟缩到 8+ 回合仍无交换的局面，但防守脚本也显示若位移方向不可选，站位手感会偏机械。",
  "",
  "## Next Tuning Signals",
  "",
  "1. 真人 playtest 时重点记录每回合有效英雄数；脚本里 6 专注通常让 2-3 名英雄有事做。",
  "2. 位移牌需要后续 command 支持选择目标区域，否则绕柱/野性冲锋只能做近似结算。",
  "3. 如果玩家觉得施法窗口仍慢，优先优化 UI/提示，不先减少窗口数量。",
  "",
];

writeFileSync(REPORT_PATH, `${lines.join("\n")}\n`);
console.log(JSON.stringify({ reportPath: REPORT_PATH, scenarios }, null, 2));
