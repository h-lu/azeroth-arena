import { resolve } from "node:path";
import { runAIBotPlaytest } from "../server/aiBotPlaytest.ts";

const outputDir = resolve(process.env.AI_DIRECTOR_RESULT_DIR ?? "playtest-results/ai-director");
const maxSteps = Number.parseInt(process.env.AI_DIRECTOR_MAX_STEPS ?? "80", 10);
const encounterTemplateId = process.env.AI_DIRECTOR_ENCOUNTER_TEMPLATE_ID;

const result = runAIBotPlaytest({
  maxSteps: Number.isFinite(maxSteps) ? maxSteps : 80,
  styles: {
    blue: "aggressive",
    red: "control",
  },
  director: true,
  encounterTemplateId,
  outputDir,
});

console.log(JSON.stringify({
  summary: result.summary,
  stoppedReason: result.stoppedReason,
  encounter: result.director?.encounter ?? null,
  intentHintCount: result.director?.intentHints.length ?? 0,
  dialogueCount: result.director?.dialogue.length ?? 0,
  directorTraceCount: result.director?.traces.length ?? 0,
  postGameSummary: result.director?.postGameSummary ?? null,
  jsonPath: resolve(outputDir, "ai-bot-playtest.json"),
  markdownPath: resolve(outputDir, "ai-bot-playtest.md"),
}, null, 2));
console.error(`AI Director v0 playtest written to ${resolve(outputDir, "ai-bot-playtest.md")}`);
