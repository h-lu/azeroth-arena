import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { HERO_DEFS, type Side } from "../packages/data/src";
import type { AIPostGameSummary, RoomPlaytestSummary } from "../src/onlineProtocol";
import { listEncounterTemplates, validateDirectorWhitelists } from "./aiDirector";
import { runAIBotPlaytest, type AIBotPlaytestResult } from "./aiBotPlaytest";
import type { BotIntent, BotPolicyStyle } from "./aiBotPolicy";

export interface Week6VerticalSliceOptions {
  maxSteps?: number;
  outputDir?: string;
  reportPath?: string;
}

export interface Week6MatchConfig {
  matchNumber: number;
  label: string;
  encounterTemplateId: string;
  styles: Record<Side, BotPolicyStyle>;
}

export interface Week6MatchResult {
  config: Week6MatchConfig;
  summary: RoomPlaytestSummary;
  stoppedReason: AIBotPlaytestResult["stoppedReason"];
  decisionCount: number;
  replayEntryCount: number;
  intentHintCount: number;
  dialogueCount: number;
  directorTraceCount: number;
  postGameSummary: AIPostGameSummary | null;
  intentCounts: Partial<Record<BotIntent, number>>;
  commandTypeCounts: Record<string, number>;
  fallbackCount: number;
  files?: {
    replayJson: string;
    reviewMarkdown: string;
  };
}

export interface Week6VerticalSliceResult {
  summary: {
    matchCount: number;
    heroRoster: Record<Side, string[]>;
    heroCountPerSide: Record<Side, number>;
    aiStyles: BotPolicyStyle[];
    encounterTemplateCount: number;
    encounterTemplateIds: string[];
    reportPath?: string;
    outputDir?: string;
  };
  matches: Week6MatchResult[];
  json: string;
  markdown: string;
}

const DEFAULT_MAX_STEPS = 100;

const WEEK6_MATCHES: Week6MatchConfig[] = [
  {
    matchNumber: 1,
    label: "Burst readability check",
    encounterTemplateId: "rival-burst-check",
    styles: { blue: "sustain", red: "aggressive" },
  },
  {
    matchNumber: 2,
    label: "Caster lock control check",
    encounterTemplateId: "controller-caster-lock",
    styles: { blue: "aggressive", red: "control" },
  },
  {
    matchNumber: 3,
    label: "Dampening recovery check",
    encounterTemplateId: "sustain-dampening-race",
    styles: { blue: "control", red: "sustain" },
  },
];

function heroRoster(side: Side) {
  return HERO_DEFS.filter((hero) => hero.side === side).map((hero) => `${hero.id}:${hero.role}`);
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

function markdownReviewFor(config: Week6MatchConfig, result: AIBotPlaytestResult) {
  const postGame = result.director?.postGameSummary;
  const lines = [
    `# Week 6 Match ${config.matchNumber}: ${config.label}`,
    "",
    `- Encounter: \`${config.encounterTemplateId}\``,
    `- Styles: blue \`${config.styles.blue}\`, red \`${config.styles.red}\``,
    `- Winner: \`${result.summary.winner ?? "none"}\``,
    `- Stop reason: \`${result.stoppedReason}\``,
    `- Final round: \`${result.summary.round}\``,
    `- Commands: \`${result.summary.commandCount}\``,
    `- Replay entries: \`${result.replay.length}\``,
    `- Intent hints: \`${result.director?.intentHints.length ?? 0}\``,
    "",
    "## AI Post-Game Review",
    "",
    postGame ? `- Decisive moment: ${postGame.decisiveMoment}` : "- Decisive moment: missing",
    ...(postGame?.keyTurns.length ? [`- Key turns: ${postGame.keyTurns.join(", ")}`] : ["- Key turns: none"]),
    ...(postGame?.playerStrengths.map((line) => `- Strength: ${line}`) ?? []),
    ...(postGame?.playerMistakes.map((line) => `- Review point: ${line}`) ?? []),
    postGame ? `- Next run suggestion: ${postGame.nextRunSuggestion}` : "- Next run suggestion: missing",
    "",
    "## Decision Tail",
    "",
    ...result.steps.slice(-10).map((step) => `- #${step.step} v${step.versionBefore} ${step.side}/${step.style}: ${step.command?.type ?? "none"} intent=${step.trace.intent} confidence=${step.trace.confidence}`),
  ];
  return lines.join("\n");
}

function markdownReportFor(result: Omit<Week6VerticalSliceResult, "json" | "markdown">) {
  const lines = [
    "# Week 6 Vertical Slice Playtest Report",
    "",
    "## Scope",
    "",
    `- Matches in run: \`${result.summary.matchCount}\``,
    `- Blue heroes: ${result.summary.heroRoster.blue.join(", ")}`,
    `- Red heroes: ${result.summary.heroRoster.red.join(", ")}`,
    `- AI styles covered: ${result.summary.aiStyles.map((style) => `\`${style}\``).join(", ")}`,
    `- Encounter templates available: \`${result.summary.encounterTemplateCount}\` (${result.summary.encounterTemplateIds.map((id) => `\`${id}\``).join(", ")})`,
    "",
    "## Match Results",
    "",
    ...result.matches.flatMap((match) => [
      `### Match ${match.config.matchNumber}: ${match.config.label}`,
      "",
      `- Encounter: \`${match.config.encounterTemplateId}\``,
      `- Styles: blue \`${match.config.styles.blue}\`, red \`${match.config.styles.red}\``,
      `- Winner: \`${match.summary.winner ?? "none"}\`; stopped: \`${match.stoppedReason}\`; final round: \`${match.summary.round}\``,
      `- Commands: \`${match.summary.commandCount}\`; decisions: \`${match.decisionCount}\`; replay entries: \`${match.replayEntryCount}\``,
      `- Intent hints: \`${match.intentHintCount}\`; Director traces: \`${match.directorTraceCount}\`; fallbacks: \`${match.fallbackCount}\``,
      `- Intent mix: ${Object.entries(match.intentCounts).map(([intent, count]) => `${intent}=${count}`).join(", ") || "none"}`,
      `- Command mix: ${Object.entries(match.commandTypeCounts).map(([type, count]) => `${type}=${count}`).join(", ") || "none"}`,
      `- AI review: ${match.postGameSummary?.decisiveMoment ?? "missing"}`,
      ...(match.files ? [`- Replay JSON: \`${match.files.replayJson}\``, `- Review MD: \`${match.files.reviewMarkdown}\``] : []),
      "",
    ]),
    "## Readability Notes",
    "",
    "- The run covers distinct aggressive, control, and sustain enemy styles through the same legal-command BotPolicy path.",
    "- Each match records replay entries plus a replay-derived AI post-game review with concrete key turns or fallback checkpoints.",
    "- Five Director templates are whitelisted for the vertical slice; the 3-match run samples one template per AI style while leaving the extra templates available for Web debug selection.",
  ];
  return lines.join("\n");
}

function displayPath(path: string) {
  return relative(process.cwd(), path) || ".";
}

export function runWeek6VerticalSlicePlaytest(options: Week6VerticalSliceOptions = {}): Week6VerticalSliceResult {
  validateDirectorWhitelists();
  const maxSteps = options.maxSteps ?? DEFAULT_MAX_STEPS;
  const outputDir = options.outputDir ? resolve(options.outputDir) : undefined;
  if (outputDir) {
    mkdirSync(outputDir, { recursive: true });
  }

  const matches = WEEK6_MATCHES.map((config): Week6MatchResult => {
    const result = runAIBotPlaytest({
      maxSteps,
      styles: config.styles,
      director: true,
      encounterTemplateId: config.encounterTemplateId,
    });
    const files = outputDir
      ? {
          replayJson: resolve(outputDir, `match-${config.matchNumber}-replay.json`),
          reviewMarkdown: resolve(outputDir, `match-${config.matchNumber}-ai-review.md`),
        }
      : undefined;
    if (files) {
      writeFileSync(files.replayJson, `${JSON.stringify({ summary: result.summary, replay: result.replay }, null, 2)}\n`);
      writeFileSync(files.reviewMarkdown, `${markdownReviewFor(config, result)}\n`);
    }
    return {
      config,
      summary: result.summary,
      stoppedReason: result.stoppedReason,
      decisionCount: result.traces.length,
      replayEntryCount: result.replay.length,
      intentHintCount: result.director?.intentHints.length ?? 0,
      dialogueCount: result.director?.dialogue.length ?? 0,
      directorTraceCount: result.director?.traces.length ?? 0,
      postGameSummary: result.director?.postGameSummary ?? null,
      intentCounts: intentCounts(result),
      commandTypeCounts: commandTypeCounts(result),
      fallbackCount: result.traces.filter((trace) => trace.fallbackUsed).length,
      files: files
        ? {
            replayJson: displayPath(files.replayJson),
            reviewMarkdown: displayPath(files.reviewMarkdown),
          }
        : undefined,
    };
  });

  const encounterTemplateIds = listEncounterTemplates().map((template) => template.id);
  const summary = {
    matchCount: matches.length,
    heroRoster: {
      blue: heroRoster("blue"),
      red: heroRoster("red"),
    },
    heroCountPerSide: {
      blue: heroRoster("blue").length,
      red: heroRoster("red").length,
    },
    aiStyles: ["aggressive", "control", "sustain"] as BotPolicyStyle[],
    encounterTemplateCount: encounterTemplateIds.length,
    encounterTemplateIds,
    reportPath: options.reportPath ? resolve(options.reportPath) : undefined,
    outputDir,
  };
  const resultWithoutText = { summary, matches };
  const markdown = markdownReportFor(resultWithoutText);
  const json = JSON.stringify(resultWithoutText, null, 2);

  if (outputDir) {
    writeFileSync(resolve(outputDir, "week-6-vertical-slice-run.json"), `${json}\n`);
    writeFileSync(resolve(outputDir, "week-6-vertical-slice-report.md"), `${markdown}\n`);
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
