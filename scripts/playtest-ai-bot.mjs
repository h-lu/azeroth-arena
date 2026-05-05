import { resolve } from "node:path";
import { runAIBotPlaytest } from "../server/aiBotPlaytest.ts";

const outputDir = resolve(process.env.AI_BOT_RESULT_DIR ?? "playtest-results/ai-bot");
const maxSteps = Number.parseInt(process.env.AI_BOT_MAX_STEPS ?? "80", 10);

const result = runAIBotPlaytest({
  maxSteps: Number.isFinite(maxSteps) ? maxSteps : 80,
  styles: {
    blue: "aggressive",
    red: "sustain",
  },
  outputDir,
});

console.log(JSON.stringify({
  summary: result.summary,
  stoppedReason: result.stoppedReason,
  decisionCount: result.traces.length,
  jsonPath: resolve(outputDir, "ai-bot-playtest.json"),
  markdownPath: resolve(outputDir, "ai-bot-playtest.md"),
}, null, 2));
console.error(`AI BotPolicy markdown summary written to ${resolve(outputDir, "ai-bot-playtest.md")}`);
