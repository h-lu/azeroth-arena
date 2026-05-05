import type { RoomRecord } from "./roomManager";
import type { ReplayExportBundle, RoomPlaytestSummary, RoomReplayEntry } from "../src/onlineProtocol";

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

function buildJson(room: RoomRecord, summary: RoomPlaytestSummary) {
  return JSON.stringify(
    {
      roomCode: room.roomCode,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      summary,
      replayEvents: room.replay,
      finalState: room.state,
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

export function createReplayExport(room: RoomRecord): ReplayExportBundle {
  const summary = buildSummary(room);
  return {
    summary,
    json: buildJson(room, summary),
    csv: buildCsv(summary),
    markdown: buildMarkdown(room, summary),
  };
}
