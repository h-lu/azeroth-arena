import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { getLegalCommands } from "../packages/rules/src";
import type { Side } from "../packages/data/src";
import type { Command } from "../packages/rules/src";
import type {
  AIDirectorDialogue,
  AIDirectorTrace,
  AIEncounterSpec,
  AIIntentHint,
  AIPostGameSummary,
  RoomPlaytestSummary,
  RoomReplayEntry,
} from "../src/onlineProtocol";
import { createClosingDialogue, createDirectorEncounter, createIntentHint, createPostGameSummary } from "./aiDirector";
import { chooseBotCommand, type AIDecisionTrace, type BotPolicyStyle } from "./aiBotPolicy";
import { buildPlayerView } from "./playerView";
import { RoomManager, type RoomRecord } from "./roomManager";

export interface AIBotPlaytestOptions {
  maxSteps?: number;
  styles?: Partial<Record<Side, BotPolicyStyle>>;
  outputDir?: string;
  director?: boolean;
  encounterTemplateId?: string;
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
  replay: RoomReplayEntry[];
  director: AIBotPlaytestDirectorOutput | null;
  stoppedReason: "winner" | "maxSteps" | "noLegalCommand" | "commandRejected";
  json: string;
  markdown: string;
}

export interface AIBotPlaytestDirectorOutput {
  encounter: AIEncounterSpec;
  intentHints: AIIntentHint[];
  postGameSummary: AIPostGameSummary;
  dialogue: AIDirectorDialogue[];
  traces: AIDirectorTrace[];
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
  const directorLines = result.director
    ? [
        "",
        "## AI Director v0",
        "",
        `- Encounter: \`${result.director.encounter.templateId}\``,
        `- Persona: \`${result.director.encounter.personaId}\``,
        `- Enemy style: \`${result.director.encounter.enemyStyle}\``,
        `- Intent hints: \`${result.director.intentHints.length}\``,
        `- Dialogue lines: \`${result.director.dialogue.length}\``,
        `- Director traces: \`${result.director.traces.length}\``,
        `- Decisive moment: ${result.director.postGameSummary.decisiveMoment}`,
        "",
        "## Intent Tail",
        "",
        ...result.director.intentHints.slice(-6).map((hint) => `- Turn ${hint.turn}: ${hint.threatType}/${hint.confidenceBand} - ${hint.text}`),
      ]
    : [];
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
    `- Replay entries: \`${result.replay.length}\``,
    "",
    "## Decision Tail",
    "",
    ...result.steps.slice(-12).map((step) => {
      const commandType = step.command?.type ?? "none";
      const action = step.actionId ?? "null";
      return `- #${step.step} v${step.versionBefore} ${step.side}/${step.style}: ${commandType} (${action}) intent=${step.trace.intent} confidence=${step.trace.confidence}${step.error ? ` error=${step.error}` : ""}`;
    }),
    ...directorLines,
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
  const directorEnabled = options.director ?? true;
  const directorTraces: AIDirectorTrace[] = [];
  const intentHints: AIIntentHint[] = [];
  const dialogue: AIDirectorDialogue[] = [];
  let encounter: AIEncounterSpec | null = null;
  const hintedRounds = new Set<number>();

  if (directorEnabled) {
    const encounterResult = createDirectorEncounter(blue.roomCode, options.encounterTemplateId);
    encounter = encounterResult.encounter;
    directorTraces.push(encounterResult.trace, encounterResult.dialogueTrace);
    dialogue.push(encounterResult.openingDialogue);
    manager.registerDirectorTrace(blue.roomCode, "red", encounterResult.trace);
    manager.registerDirectorTrace(blue.roomCode, "red", encounterResult.dialogueTrace);

    const room = manager.getRoom(blue.roomCode);
    if (room) {
      const intent = createIntentHint(blue.roomCode, room.version, room.state, encounter, "red");
      intentHints.push(intent.hint);
      directorTraces.push(intent.trace);
      manager.registerDirectorTrace(blue.roomCode, "red", intent.trace);
      hintedRounds.add(room.state.round);
      if (intent.dialogue && intent.dialogueTrace) {
        dialogue.push(intent.dialogue);
        directorTraces.push(intent.dialogueTrace);
        manager.registerDirectorTrace(blue.roomCode, "red", intent.dialogueTrace);
      }
    }
  }
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
      const updatedRoom = manager.getRoom(blue.roomCode);
      if (directorEnabled && encounter && updatedRoom && !hintedRounds.has(updatedRoom.state.round)) {
        const intent = createIntentHint(blue.roomCode, updatedRoom.version, updatedRoom.state, encounter, "red");
        intentHints.push(intent.hint);
        directorTraces.push(intent.trace);
        manager.registerDirectorTrace(blue.roomCode, "red", intent.trace);
        hintedRounds.add(updatedRoom.state.round);
        if (intent.dialogue && intent.dialogueTrace) {
          dialogue.push(intent.dialogue);
          directorTraces.push(intent.dialogueTrace);
          manager.registerDirectorTrace(blue.roomCode, "red", intent.dialogueTrace);
        }
      }
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

  const preliminarySummary = manager.summarize(blue.roomCode);
  let director: AIBotPlaytestDirectorOutput | null = null;
  if (directorEnabled && encounter) {
    const summaryResult = createPostGameSummary(blue.roomCode, room.replay, preliminarySummary, encounter, "blue");
    const closingDialogue = createClosingDialogue(blue.roomCode, preliminarySummary.version, preliminarySummary.round, encounter);
    directorTraces.push(summaryResult.trace);
    directorTraces.push(closingDialogue.trace);
    dialogue.push(closingDialogue.dialogue);
    manager.registerDirectorTrace(blue.roomCode, "red", summaryResult.trace);
    manager.registerDirectorTrace(blue.roomCode, "red", closingDialogue.trace);
    director = {
      encounter,
      intentHints,
      postGameSummary: summaryResult.summary,
      dialogue,
      traces: directorTraces,
    };
  }

  const resultWithoutText = {
    summary: manager.summarize(blue.roomCode),
    steps,
    traces: steps.map((step) => step.trace),
    replay: structuredClone(room.replay),
    director,
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
