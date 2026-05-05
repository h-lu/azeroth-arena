import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getLegalCommands } from "../packages/rules/src";
import type { Side } from "../packages/data/src";
import type { Command } from "../packages/rules/src";
import type { RoomPlaytestSummary } from "../src/onlineProtocol";
import { chooseBotCommand, type AIDecisionTrace, type BotPolicyStyle } from "./aiBotPolicy";
import { buildPlayerView } from "./playerView";
import { RoomManager, type RoomRecord } from "./roomManager";

export interface AIBotPlaytestOptions {
  maxSteps?: number;
  styles?: Partial<Record<Side, BotPolicyStyle>>;
  outputDir?: string;
}

export interface AIBotPlaytestStep {
  step: number;
  versionBefore: number;
  side: Side;
  style: BotPolicyStyle;
  actionId: string | null;
  command: Command | null;
  trace: AIDecisionTrace;
  error?: string;
}

export interface AIBotPlaytestResult {
  summary: RoomPlaytestSummary;
  steps: AIBotPlaytestStep[];
  traces: AIDecisionTrace[];
  stoppedReason: "winner" | "maxSteps" | "noLegalCommand" | "commandRejected";
  json: string;
  markdown: string;
}

const DEFAULT_MAX_STEPS = 80;

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function reactionSide(room: RoomRecord) {
  const window = room.state.pendingReaction;
  if (!window) return null;
  return window.stage === "enemy" ? opposite(window.sourceSide) : window.sourceSide;
}

function firstLegalSide(room: RoomRecord) {
  const legal = getLegalCommands(room.state);
  return legal[0]?.playerId ?? null;
}

function sideToAct(room: RoomRecord): Side | null {
  return reactionSide(room) ?? (room.state.phase === "between-rounds" ? firstLegalSide(room) : room.state.currentPlayer);
}

function markdownFor(result: Omit<AIBotPlaytestResult, "json" | "markdown">) {
  const lines = [
    "# AI BotPolicy Playtest",
    "",
    `- Winner: \`${result.summary.winner ?? "none"}\``,
    `- Stop reason: \`${result.stoppedReason}\``,
    `- Final version: \`${result.summary.version}\``,
    `- Final round: \`${result.summary.round}\``,
    `- Commands: \`${result.summary.commandCount}\``,
    `- Response windows: \`${result.summary.responseWindowCount}\``,
    `- Interrupts: \`${result.summary.interruptCount}\``,
    `- Trinkets: \`${result.summary.trinketUseCount}\``,
    `- Decisions: \`${result.traces.length}\``,
    "",
    "## Decision Tail",
    "",
    ...result.steps.slice(-12).map((step) => {
      const commandType = step.command?.type ?? "none";
      const action = step.actionId ?? "null";
      return `- #${step.step} v${step.versionBefore} ${step.side}/${step.style}: ${commandType} (${action}) intent=${step.trace.intent} confidence=${step.trace.confidence}${step.error ? ` error=${step.error}` : ""}`;
    }),
  ];
  return lines.join("\n");
}

export function runAIBotPlaytest(options: AIBotPlaytestOptions = {}): AIBotPlaytestResult {
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const styles: Record<Side, BotPolicyStyle> = {
    blue: options.styles?.blue ?? "aggressive",
    red: options.styles?.red ?? "sustain",
  };
  const manager = new RoomManager();
  const blue = manager.createRoom("blue");
  const red = manager.joinRoom(blue.roomCode, "red");
  const seats = {
    blue: blue.seatToken,
    red: red.seatToken,
  } satisfies Record<Side, string>;

  const steps: AIBotPlaytestStep[] = [];
  let stoppedReason: AIBotPlaytestResult["stoppedReason"] = "maxSteps";

  for (let step = 1; step <= maxSteps; step += 1) {
    const room = manager.getRoom(blue.roomCode);
    if (!room || room.state.phase === "finished" || room.state.winner) {
      stoppedReason = "winner";
      break;
    }
    const side = sideToAct(room);
    if (!side) {
      stoppedReason = "noLegalCommand";
      break;
    }

    const view = buildPlayerView(room, side);
    const style = styles[side];
    const decision = chooseBotCommand(view, style);
    const entry: AIBotPlaytestStep = {
      step,
      versionBefore: room.version,
      side,
      style,
      actionId: decision.actionId,
      command: decision.command,
      trace: decision.trace,
    };
    steps.push(entry);

    if (!decision.command) {
      stoppedReason = "noLegalCommand";
      break;
    }

    try {
      manager.submitCommand(blue.roomCode, side, seats[side], decision.command, room.version);
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
      stoppedReason = "commandRejected";
      break;
    }
  }

  const room = manager.getRoom(blue.roomCode);
  if (!room) {
    throw new Error("AI playtest room disappeared");
  }
  if (room.state.winner) {
    stoppedReason = "winner";
  }

  const resultWithoutText = {
    summary: manager.summarize(blue.roomCode),
    steps,
    traces: steps.map((step) => step.trace),
    stoppedReason,
  };
  const json = JSON.stringify(resultWithoutText, null, 2);
  const markdown = markdownFor(resultWithoutText);

  if (options.outputDir) {
    const dir = resolve(options.outputDir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, "ai-bot-playtest.json"), `${json}\n`);
    writeFileSync(resolve(dir, "ai-bot-playtest.md"), `${markdown}\n`);
  }

  return {
    ...resultWithoutText,
    json,
    markdown,
  };
}
