import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { AIObservabilityMetrics, AIPlayerMemory } from "../src/onlineProtocol";
import { listEncounterTemplates, validateDirectorWhitelists } from "./aiDirector";
import { runAIBotPlaytest, type AIBotPlaytestResult } from "./aiBotPlaytest";
import type { BotPolicyStyle } from "./aiBotPolicy";
import type { Side } from "../packages/data/src";

export interface AIDirectorV1PlaytestOptions {
  maxSteps?: number;
  outputDir?: string;
  reportPath?: string;
}

interface DirectorV1RunConfig {
  runNumber: number;
  label: string;
  encounterTemplateId: string;
  styles: Record<Side, BotPolicyStyle>;
}

export interface AIDirectorV1RunResult {
  config: DirectorV1RunConfig;
  stoppedReason: AIBotPlaytestResult["stoppedReason"];
  winner: Side | null;
  finalRound: number;
  commandCount: number;
  structuredSectionCount: number;
  memory: AIPlayerMemory | null;
  metrics: AIObservabilityMetrics | null;
  files?: {
    json: string;
    markdown: string;
  };
}

export interface AIDirectorV1PlaytestResult {
  summary: {
    runCount: number;
    encounterTemplateCount: number;
    encounterTemplateIds: string[];
    finalMemory: AIPlayerMemory | null;
    totalEstimatedCostUsd: number;
    totalFallbackCount: number;
    outputDir?: string;
    reportPath?: string;
  };
  runs: AIDirectorV1RunResult[];
  json: string;
  markdown: string;
}

const DEFAULT_MAX_STEPS = 90;

const DIRECTOR_V1_RUNS: DirectorV1RunConfig[] = [
  {
    runNumber: 1,
    label: "Baseline target discipline",
    encounterTemplateId: "rival-target-discipline",
    styles: { blue: "aggressive", red: "aggressive" },
  },
  {
    runNumber: 2,
    label: "Memory rematch",
    encounterTemplateId: "mentor-memory-rematch",
    styles: { blue: "control", red: "sustain" },
  },
  {
    runNumber: 3,
    label: "Memory feint",
    encounterTemplateId: "trickster-memory-feint",
    styles: { blue: "sustain", red: "control" },
  },
];

function displayPath(path: string) {
  return relative(process.cwd(), path) || ".";
}

function markdownRunFor(config: DirectorV1RunConfig, result: AIBotPlaytestResult) {
  const review = result.director?.postGameSummary.structuredReview;
  const memory = result.director?.playerMemory;
  const metrics = result.director?.aiMetrics;
  const lines = [
    `# AI Director v1 Run ${config.runNumber}: ${config.label}`,
    "",
    `- Encounter: \`${config.encounterTemplateId}\``,
    `- Winner: \`${result.summary.winner ?? "none"}\``,
    `- Stop reason: \`${result.stoppedReason}\``,
    `- Final round: \`${result.summary.round}\``,
    `- Commands: \`${result.summary.commandCount}\``,
    `- Structured sections: \`${review?.sections.length ?? 0}\``,
    `- Memory matches: \`${memory?.matchCount ?? 0}\``,
    `- AI metrics: cost=$${(metrics?.cost.estimatedUsd ?? 0).toFixed(3)}, latency=${metrics?.latency.totalMs ?? 0}ms, fallbacks=${metrics?.fallback.totalFallbackCount ?? 0}`,
    "",
    "## Key Moments",
    "",
    ...(review?.keyMoments.map((moment) => `- Turn ${moment.turn}: ${moment.label} - ${moment.evidence}`) ?? ["- none"]),
    "",
    "## Memory",
    "",
    ...(memory?.notes.map((note) => `- ${note}`) ?? ["- none"]),
  ];
  return lines.join("\n");
}

function markdownReportFor(result: Omit<AIDirectorV1PlaytestResult, "json" | "markdown">) {
  const lines = [
    "# Week 10 AI Director v1 Playtest Report",
    "",
    "## Scope",
    "",
    `- Runs: \`${result.summary.runCount}\``,
    `- Encounter templates available: \`${result.summary.encounterTemplateCount}\` (${result.summary.encounterTemplateIds.map((id) => `\`${id}\``).join(", ")})`,
    `- Final memory matches: \`${result.summary.finalMemory?.matchCount ?? 0}\``,
    `- Estimated AI cost: \`$${result.summary.totalEstimatedCostUsd.toFixed(3)}\``,
    `- Total fallbacks: \`${result.summary.totalFallbackCount}\``,
    "",
    "## Runs",
    "",
    ...result.runs.flatMap((run) => [
      `### Run ${run.config.runNumber}: ${run.config.label}`,
      "",
      `- Encounter: \`${run.config.encounterTemplateId}\``,
      `- Winner: \`${run.winner ?? "none"}\`; stopped: \`${run.stoppedReason}\`; final round: \`${run.finalRound}\``,
      `- Commands: \`${run.commandCount}\`; structured sections: \`${run.structuredSectionCount}\`; memory matches: \`${run.memory?.matchCount ?? 0}\``,
      `- Metrics: cost=$${(run.metrics?.cost.estimatedUsd ?? 0).toFixed(3)}, latency=${run.metrics?.latency.totalMs ?? 0}ms, fallbacks=${run.metrics?.fallback.totalFallbackCount ?? 0}`,
      ...(run.files ? [`- JSON: \`${run.files.json}\``, `- Markdown: \`${run.files.markdown}\``] : []),
      "",
    ]),
  ];
  return lines.join("\n");
}

export function runAIDirectorV1Playtest(options: AIDirectorV1PlaytestOptions = {}): AIDirectorV1PlaytestResult {
  validateDirectorWhitelists();
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const outputDir = options.outputDir ? resolve(options.outputDir) : undefined;
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  let memory: AIPlayerMemory | null = null;
  const runs = DIRECTOR_V1_RUNS.map((config): AIDirectorV1RunResult => {
    const result = runAIBotPlaytest({
      maxSteps,
      styles: config.styles,
      director: true,
      encounterTemplateId: config.encounterTemplateId,
      playerMemory: memory,
    });
    memory = result.director?.playerMemory ?? memory;
    const files = outputDir
      ? {
          json: resolve(outputDir, `director-v1-run-${config.runNumber}.json`),
          markdown: resolve(outputDir, `director-v1-run-${config.runNumber}.md`),
        }
      : undefined;
    if (files) {
      writeFileSync(files.json, `${result.json}\n`);
      writeFileSync(files.markdown, `${markdownRunFor(config, result)}\n`);
    }
    return {
      config,
      stoppedReason: result.stoppedReason,
      winner: result.summary.winner,
      finalRound: result.summary.round,
      commandCount: result.summary.commandCount,
      structuredSectionCount: result.director?.postGameSummary.structuredReview?.sections.length ?? 0,
      memory: result.director?.playerMemory ?? null,
      metrics: result.director?.aiMetrics ?? null,
      files: files ? { json: displayPath(files.json), markdown: displayPath(files.markdown) } : undefined,
    };
  });

  const encounterTemplateIds = listEncounterTemplates().map((template) => template.id);
  const summary = {
    runCount: runs.length,
    encounterTemplateCount: encounterTemplateIds.length,
    encounterTemplateIds,
    finalMemory: memory,
    totalEstimatedCostUsd: runs.reduce((sum, run) => sum + (run.metrics?.cost.estimatedUsd ?? 0), 0),
    totalFallbackCount: runs.reduce((sum, run) => sum + (run.metrics?.fallback.totalFallbackCount ?? 0), 0),
    outputDir,
    reportPath: options.reportPath ? resolve(options.reportPath) : undefined,
  };
  const resultWithoutText = { summary, runs };
  const json = JSON.stringify(resultWithoutText, null, 2);
  const markdown = markdownReportFor(resultWithoutText);

  if (outputDir) {
    writeFileSync(resolve(outputDir, "director-v1-run.json"), `${json}\n`);
    writeFileSync(resolve(outputDir, "director-v1-report.md"), `${markdown}\n`);
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
