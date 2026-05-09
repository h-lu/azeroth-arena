import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Side } from "../packages/data/src";
import type {
  AIDirectorTrace,
  AIObservabilityMetrics,
  AIPlayerMemory,
  AIPostGameSummary,
  RoomPlaytestSummary,
} from "../src/onlineProtocol";
import { listEncounterTemplates, validateDirectorWhitelists } from "./aiDirector";
import { runAIBotPlaytest, type AIBotPlaytestResult } from "./aiBotPlaytest";
import type { BotIntent, BotPolicyStyle } from "./aiBotPolicy";

export interface Week12DemoPackageOptions {
  maxSteps?: number;
  outputDir?: string;
  reportPath?: string;
}

export interface Week12DemoRunConfig {
  runNumber: number;
  label: string;
  encounterTemplateId: string;
  styles: Record<Side, BotPolicyStyle>;
}

export interface Week12TraceAudit {
  decisionTraceCount: number;
  directorTraceCount: number;
  directorOutputTypes: Record<string, number>;
  fallbackCount: number;
  redFlagCount: number;
  redFlags: string[];
  metrics: AIObservabilityMetrics | null;
}

export interface Week12DemoRunResult {
  config: Week12DemoRunConfig;
  summary: RoomPlaytestSummary;
  stoppedReason: AIBotPlaytestResult["stoppedReason"];
  completed: boolean;
  decisionCount: number;
  replayEntryCount: number;
  intentHintCount: number;
  dialogueCount: number;
  directorTraceCount: number;
  postGameSummary: AIPostGameSummary | null;
  playerMemory: AIPlayerMemory | null;
  traceAudit: Week12TraceAudit;
  intentCounts: Partial<Record<BotIntent, number>>;
  commandTypeCounts: Record<string, number>;
  files?: {
    replayJson: string;
    traceAuditJson: string;
    reviewMarkdown: string;
    demoTranscriptMarkdown: string;
  };
}

export interface Week12DemoPackageResult {
  summary: {
    packageName: string;
    runCount: number;
    completedRunCount: number;
    runCountTarget: "3-5";
    webDebugClientPreserved: boolean;
    replayExportCount: number;
    aiTraceAuditCount: number;
    encounterTemplateCount: number;
    encounterTemplateIds: string[];
    finalMemory: AIPlayerMemory | null;
    totalCommands: number;
    totalEstimatedCostUsd: number;
    totalFallbackCount: number;
    unityDemoEvidence: {
      status: "source-ready";
      playableScene: string;
      validation: string;
      buildArtifact: string;
      note: string;
    };
    iosTestFlightDecision: {
      decision: "defer";
      nextPhaseGate: string[];
      reason: string;
    };
    outputDir?: string;
    reportPath?: string;
  };
  runs: Week12DemoRunResult[];
  json: string;
  markdown: string;
}

const DEFAULT_MAX_STEPS = 220;

const WEEK12_DEMO_RUNS: Week12DemoRunConfig[] = [
  {
    runNumber: 1,
    label: "Opening readability and target discipline",
    encounterTemplateId: "rival-target-discipline",
    styles: { blue: "aggressive", red: "aggressive" },
  },
  {
    runNumber: 2,
    label: "Memory rematch sustain pressure",
    encounterTemplateId: "mentor-memory-rematch",
    styles: { blue: "control", red: "sustain" },
  },
  {
    runNumber: 3,
    label: "Memory feint and reaction audit",
    encounterTemplateId: "trickster-memory-feint",
    styles: { blue: "sustain", red: "control" },
  },
  {
    runNumber: 4,
    label: "Line tax control finale",
    encounterTemplateId: "controller-line-tax",
    styles: { blue: "aggressive", red: "control" },
  },
];

function displayPath(path: string) {
  return relative(process.cwd(), path) || ".";
}

function increment<T extends string>(counts: Partial<Record<T, number>>, key: T) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function commandTypeCounts(result: AIBotPlaytestResult) {
  return result.steps.reduce<Record<string, number>>((counts, step) => {
    const type = step.command?.type ?? "none";
    counts[type] = (counts[type] ?? 0) + 1;
    return counts;
  }, {});
}

function intentCounts(result: AIBotPlaytestResult) {
  const counts: Partial<Record<BotIntent, number>> = {};
  for (const trace of result.traces) {
    increment(counts, trace.intent);
  }
  return counts;
}

function countByOutputType(traces: AIDirectorTrace[]) {
  return traces.reduce<Record<string, number>>((counts, trace) => {
    counts[trace.outputType] = (counts[trace.outputType] ?? 0) + 1;
    return counts;
  }, {});
}

function containsSensitiveTraceText(value: unknown): boolean {
  if (typeof value === "string") {
    return /\b(seatToken|connectionId|system prompt)\b/i.test(value);
  }
  if (Array.isArray(value)) {
    return value.some((item) => containsSensitiveTraceText(item));
  }
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).some(([key, entry]) => {
      return /\b(seatToken|connectionId|systemPrompt)\b/i.test(key) || containsSensitiveTraceText(entry);
    });
  }
  return false;
}

function traceAuditFor(result: AIBotPlaytestResult): Week12TraceAudit {
  const directorTraces = result.director?.traces ?? [];
  const redFlags: string[] = [];
  for (const trace of directorTraces) {
    if (containsSensitiveTraceText(trace.output) || containsSensitiveTraceText(trace.inputSummary)) {
      redFlags.push(`${trace.traceId} contains sensitive trace text`);
    }
  }
  return {
    decisionTraceCount: result.traces.length,
    directorTraceCount: directorTraces.length,
    directorOutputTypes: countByOutputType(directorTraces),
    fallbackCount:
      result.traces.filter((trace) => trace.fallbackUsed).length +
      directorTraces.filter((trace) => trace.fallbackUsed).length,
    redFlagCount: redFlags.length,
    redFlags,
    metrics: result.director?.aiMetrics ?? null,
  };
}

function markdownReviewFor(config: Week12DemoRunConfig, result: AIBotPlaytestResult, audit: Week12TraceAudit) {
  const postGame = result.director?.postGameSummary;
  const review = postGame?.structuredReview;
  const lines = [
    `# Week 12 Demo Run ${config.runNumber}: ${config.label}`,
    "",
    `- Encounter: \`${config.encounterTemplateId}\``,
    `- Styles: blue \`${config.styles.blue}\`, red \`${config.styles.red}\``,
    `- Winner: \`${result.summary.winner ?? "none"}\``,
    `- Stop reason: \`${result.stoppedReason}\``,
    `- Final round: \`${result.summary.round}\``,
    `- Commands: \`${result.summary.commandCount}\``,
    `- Replay entries: \`${result.replay.length}\``,
    `- Intent hints: \`${result.director?.intentHints.length ?? 0}\``,
    `- Trace audit: decisions=${audit.decisionTraceCount}, director=${audit.directorTraceCount}, redFlags=${audit.redFlagCount}`,
    "",
    "## Structured Review",
    "",
    ...(review?.sections.flatMap((section) => [
      `### ${section.title}`,
      "",
      ...section.bullets.map((bullet) => `- ${bullet}`),
      "",
    ]) ?? ["- missing structured review", ""]),
    "## Key Moments",
    "",
    ...(review?.keyMoments.map((moment) => `- Turn ${moment.turn}: ${moment.label} - ${moment.evidence}`) ?? ["- none"]),
    "",
    "## Next Run",
    "",
    postGame ? postGame.nextRunSuggestion : "missing",
  ];
  return lines.join("\n");
}

function markdownTranscriptFor(config: Week12DemoRunConfig, result: AIBotPlaytestResult) {
  const encounter = result.director?.encounter;
  const lines = [
    `# Week 12 Demo Transcript ${config.runNumber}`,
    "",
    `- Label: ${config.label}`,
    `- Encounter: \`${encounter?.templateId ?? config.encounterTemplateId}\``,
    `- Opening intent: ${encounter?.openingIntent ?? "missing"}`,
    "",
    "## Public Intent Beats",
    "",
    ...(result.director?.intentHints.map((hint) => `- Round ${hint.turn}: ${hint.threatType}/${hint.confidenceBand} - ${hint.text}`) ?? ["- none"]),
    "",
    "## Dialogue Beats",
    "",
    ...(result.director?.dialogue.map((dialogue) => `- Round ${dialogue.turn} ${dialogue.personaId}: ${dialogue.line}`) ?? ["- none"]),
    "",
    "## Replay Tail",
    "",
    ...result.replay
      .filter((entry) => entry.kind === "command")
      .slice(-12)
      .map((entry) => `- v${entry.version} r${entry.round} ${entry.side}: ${entry.command?.type ?? "unknown"}${entry.interrupted ? " interrupted" : ""}${entry.trinketUsed ? " trinket" : ""}`),
  ];
  return lines.join("\n");
}

function markdownReportFor(result: Omit<Week12DemoPackageResult, "json" | "markdown">) {
  const lines = [
    "# Week 12 Demo Package Report",
    "",
    "## Scope",
    "",
    `- Demo runs: \`${result.summary.runCount}\` (${result.summary.runCountTarget} target)`,
    `- Completed runs: \`${result.summary.completedRunCount}\``,
    `- Replay exports: \`${result.summary.replayExportCount}\``,
    `- AI trace audits: \`${result.summary.aiTraceAuditCount}\``,
    `- Web debug client preserved: \`${result.summary.webDebugClientPreserved}\``,
    `- Encounter templates available: \`${result.summary.encounterTemplateCount}\``,
    `- Total commands: \`${result.summary.totalCommands}\``,
    `- Estimated AI cost: \`$${result.summary.totalEstimatedCostUsd.toFixed(3)}\``,
    `- Total fallbacks: \`${result.summary.totalFallbackCount}\``,
    "",
    "## Demo Runs",
    "",
    ...result.runs.flatMap((run) => [
      `### Run ${run.config.runNumber}: ${run.config.label}`,
      "",
      `- Encounter: \`${run.config.encounterTemplateId}\``,
      `- Winner: \`${run.summary.winner ?? "none"}\`; stopped: \`${run.stoppedReason}\`; completed: \`${run.completed}\`; final round: \`${run.summary.round}\``,
      `- Commands: \`${run.summary.commandCount}\`; replay entries: \`${run.replayEntryCount}\`; intent hints: \`${run.intentHintCount}\`; Director traces: \`${run.directorTraceCount}\``,
      `- Trace audit: decisions=${run.traceAudit.decisionTraceCount}, director=${run.traceAudit.directorTraceCount}, redFlags=${run.traceAudit.redFlagCount}`,
      `- Intent mix: ${Object.entries(run.intentCounts).map(([intent, count]) => `${intent}=${count}`).join(", ") || "none"}`,
      `- Command mix: ${Object.entries(run.commandTypeCounts).map(([type, count]) => `${type}=${count}`).join(", ") || "none"}`,
      `- Review: ${run.postGameSummary?.decisiveMoment ?? "missing"}`,
      ...(run.files
        ? [
            `- Replay JSON: \`${run.files.replayJson}\``,
            `- Trace audit JSON: \`${run.files.traceAuditJson}\``,
            `- Review MD: \`${run.files.reviewMarkdown}\``,
            `- Demo transcript MD: \`${run.files.demoTranscriptMarkdown}\``,
          ]
        : []),
      "",
    ]),
    "## Unity Demo Evidence",
    "",
    `- Status: \`${result.summary.unityDemoEvidence.status}\``,
    `- Playable scene: \`${result.summary.unityDemoEvidence.playableScene}\``,
    `- Validation: \`${result.summary.unityDemoEvidence.validation}\``,
    `- Build artifact: \`${result.summary.unityDemoEvidence.buildArtifact}\``,
    `- Note: ${result.summary.unityDemoEvidence.note}`,
    "",
    "## iOS / TestFlight Decision",
    "",
    `- Decision: \`${result.summary.iosTestFlightDecision.decision}\``,
    `- Reason: ${result.summary.iosTestFlightDecision.reason}`,
    ...result.summary.iosTestFlightDecision.nextPhaseGate.map((gate) => `- Gate: ${gate}`),
  ];
  return lines.join("\n");
}

export function runWeek12DemoPackage(options: Week12DemoPackageOptions = {}): Week12DemoPackageResult {
  validateDirectorWhitelists();
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const outputDir = options.outputDir ? resolve(options.outputDir) : undefined;
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  let memory: AIPlayerMemory | null = null;
  const runs = WEEK12_DEMO_RUNS.map((config): Week12DemoRunResult => {
    const result = runAIBotPlaytest({
      maxSteps,
      styles: config.styles,
      director: true,
      encounterTemplateId: config.encounterTemplateId,
      playerMemory: memory,
    });
    memory = result.director?.playerMemory ?? memory;
    const traceAudit = traceAuditFor(result);
    const files = outputDir
      ? {
          replayJson: resolve(outputDir, `demo-run-${config.runNumber}-replay.json`),
          traceAuditJson: resolve(outputDir, `demo-run-${config.runNumber}-ai-trace-audit.json`),
          reviewMarkdown: resolve(outputDir, `demo-run-${config.runNumber}-review.md`),
          demoTranscriptMarkdown: resolve(outputDir, `demo-run-${config.runNumber}-transcript.md`),
        }
      : undefined;
    if (files) {
      writeFileSync(files.replayJson, `${JSON.stringify({ summary: result.summary, replay: result.replay }, null, 2)}\n`);
      writeFileSync(files.traceAuditJson, `${JSON.stringify({ summary: result.summary, traceAudit, decisionTraces: result.traces, directorTraces: result.director?.traces ?? [] }, null, 2)}\n`);
      writeFileSync(files.reviewMarkdown, `${markdownReviewFor(config, result, traceAudit)}\n`);
      writeFileSync(files.demoTranscriptMarkdown, `${markdownTranscriptFor(config, result)}\n`);
    }
    return {
      config,
      summary: result.summary,
      stoppedReason: result.stoppedReason,
      completed: result.stoppedReason === "winner",
      decisionCount: result.traces.length,
      replayEntryCount: result.replay.length,
      intentHintCount: result.director?.intentHints.length ?? 0,
      dialogueCount: result.director?.dialogue.length ?? 0,
      directorTraceCount: result.director?.traces.length ?? 0,
      postGameSummary: result.director?.postGameSummary ?? null,
      playerMemory: result.director?.playerMemory ?? null,
      traceAudit,
      intentCounts: intentCounts(result),
      commandTypeCounts: commandTypeCounts(result),
      files: files
        ? {
            replayJson: displayPath(files.replayJson),
            traceAuditJson: displayPath(files.traceAuditJson),
            reviewMarkdown: displayPath(files.reviewMarkdown),
            demoTranscriptMarkdown: displayPath(files.demoTranscriptMarkdown),
          }
        : undefined,
    };
  });

  const encounterTemplateIds = listEncounterTemplates().map((template) => template.id);
  const summary = {
    packageName: "week-12-ai-native-demo-package",
    runCount: runs.length,
    completedRunCount: runs.filter((run) => run.completed).length,
    runCountTarget: "3-5" as const,
    webDebugClientPreserved: true,
    replayExportCount: runs.length,
    aiTraceAuditCount: runs.length,
    encounterTemplateCount: encounterTemplateIds.length,
    encounterTemplateIds,
    finalMemory: memory,
    totalCommands: runs.reduce((sum, run) => sum + run.summary.commandCount, 0),
    totalEstimatedCostUsd: runs.reduce((sum, run) => sum + (run.traceAudit.metrics?.cost.estimatedUsd ?? 0), 0),
    totalFallbackCount: runs.reduce((sum, run) => sum + run.traceAudit.fallbackCount, 0),
    unityDemoEvidence: {
      status: "source-ready" as const,
      playableScene: "unity-client/Assets/AzerothArena/Scenes/Match.unity",
      validation: "npm run validate:unity-websocket",
      buildArtifact: "not generated by this Node package step",
      note: "The package validates the Unity playable scene, WebSocket client, VisualCommandQueue, and mobile polish source. Producing a binary build still requires a Unity editor environment.",
    },
    iosTestFlightDecision: {
      decision: "defer" as const,
      nextPhaseGate: [
        "Produce and smoke a Unity player build from the Week 12 source-ready scene.",
        "Run device checks for iPhone landscape safe area, touch target sizing, long-press preview, target snapping, reaction prompt, audio, and haptics.",
        "Add crash/log collection and build signing before inviting external TestFlight testers.",
      ],
      reason: "Week 12 proves a local AI-native demo package and source-ready Unity client, but TestFlight should wait until a signed Unity build is verified on-device.",
    },
    outputDir,
    reportPath: options.reportPath ? resolve(options.reportPath) : undefined,
  };
  const resultWithoutText = { summary, runs };
  const markdown = markdownReportFor(resultWithoutText);
  const json = JSON.stringify(resultWithoutText, null, 2);

  if (outputDir) {
    writeFileSync(resolve(outputDir, "week-12-demo-package.json"), `${json}\n`);
    writeFileSync(resolve(outputDir, "week-12-demo-package-report.md"), `${markdown}\n`);
  }
  if (options.reportPath) {
    const reportPath = resolve(options.reportPath);
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${markdown}\n`);
  }

  return {
    ...resultWithoutText,
    json,
    markdown,
  };
}
