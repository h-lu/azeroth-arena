import { createHash } from "node:crypto";
import type { CardDef, Side } from "../packages/data/src";
import type { Command, HeroState } from "../packages/rules/src";
import type { PlayerView } from "../src/onlineProtocol";

export type BotPolicyStyle = "aggressive" | "control" | "sustain";
export type BotIntent = "pressure" | "survive" | "bait" | "setup" | "recover" | "finish" | "no-op";

export interface LegalAction {
  actionId: string;
  command: Command;
}

export interface CandidateScore {
  actionId: string;
  command: Command;
  score: number;
  intent: BotIntent;
  reason: string;
}

export interface AIDecisionTrace {
  decisionId: string;
  side: Side;
  version: number;
  style: BotPolicyStyle;
  selectedActionId: string | null;
  selectedCommand: Command | null;
  intent: BotIntent;
  confidence: number;
  candidateCount: number;
  candidateScores: CandidateScore[];
  fallbackUsed: boolean;
  reason: string;
}

export interface BotPolicyDecision {
  actionId: string | null;
  command: Command | null;
  trace: AIDecisionTrace;
}

const BOT_POLICY_VERSION = "bot-policy-v0.2.0";

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, stableValue(entryValue)]));
  }
  return value;
}

export function canonicalizeCommand(command: Command) {
  return JSON.stringify(stableValue(command));
}

export function actionIdForCommand(command: Command) {
  const digest = createHash("sha256").update(canonicalizeCommand(command)).digest("hex").slice(0, 16);
  return `act_${digest}`;
}

export function encodeLegalActions(legalCommands: Command[]): LegalAction[] {
  return legalCommands.map((command) => ({
    actionId: actionIdForCommand(command),
    command,
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundScore(value: number) {
  return Math.round(value * 100) / 100;
}

function card(view: PlayerView, cardId: string | undefined): CardDef | null {
  if (!cardId) return null;
  return view.state.cardById[cardId] ?? null;
}

function hero(view: PlayerView, heroId: string | undefined): HeroState | null {
  if (!heroId) return null;
  return view.state.heroes[heroId] ?? null;
}

function aliveHeroes(view: PlayerView, side: Side) {
  return Object.values(view.state.heroes).filter((candidate) => candidate.side === side && candidate.alive);
}

function hpPressure(target: HeroState | null) {
  if (!target) return 0;
  const missingRatio = (target.maxHp - target.hp) / Math.max(1, target.maxHp);
  const lowHpBonus = target.hp <= 4 ? 16 : target.hp <= 7 ? 8 : 0;
  return missingRatio * 18 + lowHpBonus;
}

function allyDanger(target: HeroState | null) {
  if (!target) return 0;
  const missingRatio = (target.maxHp - target.hp) / Math.max(1, target.maxHp);
  const lowHpBonus = target.hp <= 4 ? 22 : target.hp <= 7 ? 10 : 0;
  const controlBonus = target.pendingHardControl > 0 ? 14 : 0;
  return missingRatio * 22 + lowHpBonus + controlBonus;
}

function hasLowAlly(view: PlayerView, side: Side) {
  return aliveHeroes(view, side).some((candidate) => candidate.hp <= Math.ceil(candidate.maxHp * 0.55) || candidate.pendingHardControl > 0);
}

function effectIntent(cardDef: CardDef | null, command: Command): BotIntent {
  if (command.type === "resolveReaction") {
    if (command.pass) return "bait";
    if (command.useTrinket) return "survive";
  }
  if (!cardDef) {
    if (command.type === "selectFocusTarget") return "setup";
    if (command.type === "useTrinket") return "survive";
    if (command.type === "moveHero" || command.type === "activateHero" || command.type === "startTurn") return "setup";
    return "no-op";
  }
  if (cardDef.effectKey.includes("heal")) return "recover";
  if (cardDef.effectKey.includes("shield") || cardDef.effectKey === "damage-reduction" || cardDef.effectKey === "cleanse-control") return "survive";
  if (cardDef.effectKey.includes("control") || cardDef.effectKey === "interrupt") return "setup";
  if (cardDef.effectKey.includes("damage") || cardDef.effectKey === "burst-damage") return "pressure";
  if (cardDef.effectKey.includes("move") || cardDef.effectKey === "fake-cast") return "bait";
  return "setup";
}

function cardScore(view: PlayerView, style: BotPolicyStyle, command: Extract<Command, { type: "playCard" | "resolveReaction" | "useTrinket" }>) {
  const cardDef = card(view, command.cardId);
  const target = hero(view, command.type === "playCard" ? command.targetIds[0] : command.type === "resolveReaction" ? command.targetIds?.[0] : command.heroId);
  const focusTargetId = view.state.players[view.side].focusTargetId;
  const focusBonus = target?.id === focusTargetId ? 5 : 0;
  const danger = allyDanger(target);
  const pressure = hpPressure(target) + focusBonus;
  const costPenalty = cardDef ? cardDef.cost * 0.8 : 0;

  if (command.type === "useTrinket") {
    return {
      score: 40 + danger + (style === "sustain" ? 20 : style === "control" ? 10 : 0),
      intent: "survive" as const,
      reason: command.cardId ? "break hard control with arena insignia" : "break hard control with trinket",
    };
  }

  if (command.type === "resolveReaction") {
    if (command.pass) {
      const sourceCard = card(view, view.state.pendingReaction?.sourceCardId);
      const shouldSaveResources = style === "aggressive" && sourceCard?.effectKey !== "burst-damage" && sourceCard?.effectKey !== "hard-control";
      return {
        score: shouldSaveResources ? 22 : 10,
        intent: "bait" as const,
        reason: "safe reaction pass",
      };
    }
    if (command.useTrinket) {
      return {
        score: 64 + (style === "sustain" ? 18 : 0),
        intent: "survive" as const,
        reason: "reaction trinket prevents hard control",
      };
    }
    if (!cardDef) {
      return { score: 16, intent: "setup" as const, reason: "reaction card" };
    }
    if (cardDef.effectKey === "interrupt") {
      return {
        score: 58 + (style === "control" ? 24 : style === "aggressive" ? 8 : 0),
        intent: "setup" as const,
        reason: `interrupt ${view.state.pendingReaction?.sourceCardId ?? "pending card"}`,
      };
    }
    if (cardDef.effectKey === "damage-reduction") {
      return {
        score: 50 + danger + (style === "sustain" ? 24 : style === "control" ? 8 : 0) - costPenalty,
        intent: "survive" as const,
        reason: "reduce incoming damage",
      };
    }
    if (cardDef.effectKey === "cleanse-control") {
      return {
        score: 54 + (style === "sustain" ? 16 : style === "control" ? 10 : 0) - costPenalty,
        intent: "survive" as const,
        reason: "cleanse incoming hard control",
      };
    }
  }

  if (!cardDef) {
    return { score: 18, intent: "setup" as const, reason: "card action" };
  }

  const effect = cardDef.effectKey;
  if (effect === "burst-damage") {
    return {
      score: 54 + pressure + (style === "aggressive" ? 24 : style === "control" ? 8 : -4) - costPenalty,
      intent: target && target.hp <= 5 ? "finish" as const : "pressure" as const,
      reason: `burst pressure with ${cardDef.id}`,
    };
  }
  if (effect.includes("damage")) {
    const healReductionBonus = effect.includes("heal-reduction") ? 8 : 0;
    return {
      score: 38 + pressure + healReductionBonus + (style === "aggressive" ? 18 : style === "control" ? 4 : -2) - costPenalty,
      intent: target && target.hp <= 4 ? "finish" as const : "pressure" as const,
      reason: `damage pressure with ${cardDef.id}`,
    };
  }
  if (effect.includes("control") || effect === "interrupt") {
    const decayPenalty = target ? target.decay * 12 : 0;
    return {
      score: 42 + (style === "control" ? 24 : style === "aggressive" ? 8 : 0) + pressure * 0.4 - decayPenalty - costPenalty,
      intent: "setup" as const,
      reason: `control tempo with ${cardDef.id}`,
    };
  }
  if (effect.includes("heal") || effect.includes("shield") || effect === "damage-reduction" || effect === "cleanse-control") {
    return {
      score: 34 + danger + (style === "sustain" ? 28 : style === "control" ? 6 : -8) - costPenalty,
      intent: effect.includes("heal") ? "recover" as const : "survive" as const,
      reason: `stabilize with ${cardDef.id}`,
    };
  }
  if (effect.includes("move") || effect === "fake-cast") {
    return {
      score: 28 + (style === "control" ? 10 : style === "aggressive" ? 8 : 4) - costPenalty,
      intent: effect === "fake-cast" ? "bait" as const : "setup" as const,
      reason: `positioning or bait with ${cardDef.id}`,
    };
  }
  return {
    score: 24 - costPenalty,
    intent: effectIntent(cardDef, command),
    reason: `play ${cardDef.id}`,
  };
}

function scoreCommand(view: PlayerView, style: BotPolicyStyle, command: Command): Omit<CandidateScore, "actionId" | "command"> {
  switch (command.type) {
    case "playCard":
    case "resolveReaction":
    case "useTrinket":
      return cardScore(view, style, command);
    case "selectFocusTarget": {
      const target = hero(view, command.targetId);
      const roleBonus = target?.role === "priest" || target?.role === "druid" ? 7 : target?.role === "mage" || target?.role === "warlock" ? 5 : 0;
      return {
        score: 32 + hpPressure(target) + roleBonus + (style === "aggressive" ? 8 : style === "control" ? 4 : 0),
        intent: "setup",
        reason: `set focus target ${command.targetId}`,
      };
    }
    case "activateHero": {
      const source = hero(view, command.heroId);
      const role = source?.role;
      const styleBonus =
        style === "aggressive" && (role === "rogue" || role === "warrior" || role === "mage" || role === "warlock")
          ? 10
          : style === "control" && (role === "mage" || role === "rogue" || role === "warlock" || role === "druid")
            ? 9
            : style === "sustain" && (role === "priest" || role === "druid")
              ? 12
              : 0;
      const dangerBonus = source && style === "sustain" ? allyDanger(source) * 0.35 : 0;
      return {
        score: 30 + styleBonus + dangerBonus,
        intent: "setup",
        reason: `activate ${command.heroId}`,
      };
    }
    case "moveHero":
      return {
        score: 20 + (style === "control" ? 5 : 0) + (style === "sustain" && hasLowAlly(view, view.side) ? 4 : 0),
        intent: "setup",
        reason: `move ${command.heroId} to ${command.toZone}`,
      };
    case "startTurn":
      return { score: 70, intent: "setup", reason: "advance to next round" };
    case "discardCards":
      return { score: 68, intent: "setup", reason: "discard to hand limit" };
    case "pass":
    case "endTurn":
      return {
        score: view.state.activation ? 18 : 12,
        intent: "no-op",
        reason: command.type === "pass" ? "pass priority" : "end turn",
      };
  }
}

function safeFallback(actions: LegalAction[]) {
  return (
    actions.find((action) => action.command.type === "resolveReaction" && action.command.pass) ??
    actions.find((action) => action.command.type === "pass") ??
    actions.find((action) => action.command.type === "endTurn") ??
    actions.find((action) => action.command.type === "startTurn") ??
    actions.find((action) => action.command.type === "discardCards") ??
    actions[0] ??
    null
  );
}

function makeDecisionId(view: PlayerView, style: BotPolicyStyle, selectedActionId: string | null) {
  const seed = `${BOT_POLICY_VERSION}:${view.roomCode}:${view.side}:${view.version}:${style}:${selectedActionId ?? "none"}`;
  return `ai_decision_${createHash("sha256").update(seed).digest("hex").slice(0, 16)}`;
}

function confidenceFor(scores: CandidateScore[], fallbackUsed: boolean) {
  if (fallbackUsed || scores.length === 0) return 0.25;
  const [first, second] = scores;
  const gap = first.score - (second?.score ?? 0);
  return roundScore(clamp(0.45 + first.score / 140 + gap / 80, 0.35, 0.95));
}

function buildTrace(
  view: PlayerView,
  style: BotPolicyStyle,
  candidateScores: CandidateScore[],
  selected: CandidateScore | null,
  fallbackUsed: boolean,
  reason: string,
): AIDecisionTrace {
  const selectedActionId = selected?.actionId ?? null;
  return {
    decisionId: makeDecisionId(view, style, selectedActionId),
    side: view.side,
    version: view.version,
    style,
    selectedActionId,
    selectedCommand: selected?.command ?? null,
    intent: selected?.intent ?? "no-op",
    confidence: confidenceFor(candidateScores, fallbackUsed),
    candidateCount: candidateScores.length,
    candidateScores,
    fallbackUsed,
    reason,
  };
}

export function chooseBotCommand(view: PlayerView, style: BotPolicyStyle): BotPolicyDecision {
  const actions = encodeLegalActions(view.legalCommands);
  if (actions.length === 0) {
    const trace = buildTrace(view, style, [], null, true, "no legal commands available");
    return { actionId: null, command: null, trace };
  }

  try {
    const candidateScores = actions
      .map((action) => {
        const score = scoreCommand(view, style, action.command);
        return {
          ...action,
          score: roundScore(score.score),
          intent: score.intent,
          reason: score.reason,
        };
      })
      .sort((a, b) => b.score - a.score || a.actionId.localeCompare(b.actionId));

    const selected = candidateScores[0] ?? null;
    const legalActionIds = new Set(actions.map((action) => action.actionId));
    if (!selected || !legalActionIds.has(selected.actionId)) {
      const fallback = safeFallback(actions);
      const fallbackScore = fallback
        ? {
            ...fallback,
            score: 0,
            intent: fallback.command.type === "resolveReaction" ? ("bait" as const) : ("no-op" as const),
            reason: "fallback legal safety action",
          }
        : null;
      const trace = buildTrace(view, style, candidateScores, fallbackScore, true, "selected action was not legal");
      return { actionId: fallbackScore?.actionId ?? null, command: fallbackScore?.command ?? null, trace };
    }

    const trace = buildTrace(view, style, candidateScores, selected, false, selected.reason);
    return { actionId: selected.actionId, command: selected.command, trace };
  } catch (error) {
    const fallback = safeFallback(actions);
    const selected = fallback
      ? {
          ...fallback,
          score: 0,
          intent: fallback.command.type === "resolveReaction" ? ("bait" as const) : ("no-op" as const),
          reason: "fallback after bot policy exception",
        }
      : null;
    const trace = buildTrace(view, style, [], selected, true, error instanceof Error ? error.message : String(error));
    return { actionId: selected?.actionId ?? null, command: selected?.command ?? null, trace };
  }
}
