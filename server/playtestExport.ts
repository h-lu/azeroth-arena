import type { RoomRecord } from "./roomManager";
import { buildPlayerView } from "./playerView";
import type { Side } from "../packages/data/src";
import type { AIDirectorTrace, PublicAIDirectorTrace, ReplayExportBundle, RoomPlaytestSummary, RoomReplayEntry } from "../src/onlineProtocol";

type PublicReplayEntry = Omit<RoomReplayEntry, "directorTrace"> & {
  directorTrace?: PublicAIDirectorTrace;
};

function countEntries(entries: RoomReplayEntry[], predicate: (entry: RoomReplayEntry) => boolean) {
  return entries.reduce((count, entry) => count + (predicate(entry) ? 1 : 0), 0);
}

function csvEscape(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function buildSummary(room: RoomRecord): RoomPlaytestSummary {
  const replay = room.replay.filter((entry) => entry.kind === "command");
  return {
    roomCode: room.roomCode,
    version: room.version,
    round: room.state.round,
    winner: room.state.winner,
    killRound: room.killRound,
    logCount: room.state.log.length,
    responseWindowCount: countEntries(replay, (entry) => !!entry.openedReactionWindow),
    interruptCount: countEntries(replay, (entry) => !!entry.interrupted),
    trinketUseCount: countEntries(replay, (entry) => !!entry.trinketUsed),
    commandCount: replay.length,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

const DIRECTOR_TRACE_SENSITIVE_KEYS = new Set([
  "cardid",
  "cardids",
  "command",
  "commands",
  "deck",
  "discard",
  "hand",
  "hidden",
  "legalcommands",
  "messages",
  "prompt",
  "seatToken",
  "selectedcommand",
  "system",
  "token",
].map((key) => key.toLowerCase()));

function redactDirectorText(value: string, path: string, redactedFields: string[]) {
  if (/\b(cardId|command|deck|hand|seatToken|token|hidden|system prompt)\b/i.test(value)) {
    redactedFields.push(path);
    return "[redacted]";
  }
  return value;
}

function redactDirectorValue(value: unknown, path: string, redactedFields: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactDirectorValue(item, `${path}[${index}]`, redactedFields));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (DIRECTOR_TRACE_SENSITIVE_KEYS.has(key.toLowerCase())) {
        redactedFields.push(childPath);
        result[`redactedField${redactedFields.length}`] = "[redacted]";
        continue;
      }
      result[key] = redactDirectorValue(entryValue, childPath, redactedFields);
    }
    return result;
  }
  if (typeof value === "string") {
    return redactDirectorText(value, path, redactedFields);
  }
  return value;
}

function redactDirectorTrace(trace: AIDirectorTrace): PublicAIDirectorTrace {
  const redactedFields: string[] = [];
  const outputPreview = redactDirectorValue(trace.output, "output", redactedFields);
  const inputSummary = redactDirectorText(trace.inputSummary, "inputSummary", redactedFields);
  return {
    traceId: trace.traceId,
    roomCode: trace.roomCode,
    version: trace.version,
    source: trace.source,
    inputSummary,
    outputType: trace.outputType,
    outputPreview,
    latencyMs: trace.latencyMs,
    fallbackUsed: trace.fallbackUsed,
    redactedFieldCount: redactedFields.length,
  };
}

function buildPublicReplayEvents(room: RoomRecord): PublicReplayEntry[] {
  return room.replay.map((entry) => {
    if (!entry.directorTrace) {
      return structuredClone(entry) as PublicReplayEntry;
    }
    return {
      ...structuredClone(entry),
      directorTrace: redactDirectorTrace(entry.directorTrace),
    };
  });
}

function buildJson(room: RoomRecord, viewerSide: Side, summary: RoomPlaytestSummary) {
  return JSON.stringify(
    {
      roomCode: room.roomCode,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      summary,
      replayEvents: buildPublicReplayEvents(room),
      finalState: buildPlayerView(room, viewerSide).state,
    },
    null,
    2,
  );
}

function buildCsv(summary: RoomPlaytestSummary) {
  const headers = [
    "roomCode",
    "version",
    "round",
    "winner",
    "killRound",
    "logCount",
    "responseWindowCount",
    "interruptCount",
    "trinketUseCount",
    "commandCount",
    "createdAt",
    "updatedAt",
  ];
  const row = [
    summary.roomCode,
    summary.version,
    summary.round,
    summary.winner ?? "",
    summary.killRound ?? "",
    summary.logCount,
    summary.responseWindowCount,
    summary.interruptCount,
    summary.trinketUseCount,
    summary.commandCount,
    summary.createdAt,
    summary.updatedAt,
  ];
  return `${headers.map(csvEscape).join(",")}\n${row.map(csvEscape).join(",")}`;
}

function buildMarkdown(room: RoomRecord, summary: RoomPlaytestSummary) {
  const replay = room.replay.filter((entry) => entry.kind === "command");
  const directorReplay = room.replay.filter((entry) => entry.kind === "director");
  const lines = [
    `# Azeroth Arena Playtest Export`,
    ``,
    `- Room: \`${summary.roomCode}\``,
    `- Version: \`${summary.version}\``,
    `- Round: \`${summary.round}\``,
    `- Winner: \`${summary.winner ?? "none"}\``,
    `- Kill round: \`${summary.killRound ?? "n/a"}\``,
    `- Log count: \`${summary.logCount}\``,
    `- Response windows: \`${summary.responseWindowCount}\``,
    `- Interrupts: \`${summary.interruptCount}\``,
    `- Trinket uses: \`${summary.trinketUseCount}\``,
    `- Commands: \`${summary.commandCount}\``,
    ``,
    `## Replay Tail`,
    ``,
    ...replay.slice(-8).map((entry) => `- v${entry.version} r${entry.round} ${entry.side} ${entry.type}: ${entry.command?.type ?? "room"}${entry.interrupted ? " (interrupted)" : ""}${entry.trinketUsed ? " (trinket)" : ""}`),
    ``,
    `## Director Trace Tail`,
    ``,
    ...(directorReplay.length > 0
      ? directorReplay
          .slice(-8)
          .map((entry) => `- v${entry.version} r${entry.round} ${entry.directorTrace?.outputType ?? "director"} source=${entry.directorTrace?.source ?? "unknown"} trace=${entry.directorTrace?.traceId ?? "unknown"}`)
      : [`- none`]),
  ];
  return lines.join("\n");
}

export function createReplayExport(room: RoomRecord, viewerSide: Side = "blue"): ReplayExportBundle {
  const summary = buildSummary(room);
  return {
    summary,
    json: buildJson(room, viewerSide, summary),
    csv: buildCsv(summary),
    markdown: buildMarkdown(room, summary),
  };
}
