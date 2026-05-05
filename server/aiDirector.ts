import { createHash } from "node:crypto";
import type { Side } from "../packages/data/src";
import type { GameState, HeroState } from "../packages/rules/src";
import type {
  AIDirectorDialogue,
  AIDirectorTrace,
  AIEncounterSpec,
  AIEnemyStyle,
  AIIntentHint,
  AIPersona,
  AIPostGameSummary,
  RoomPlaytestSummary,
  RoomReplayEntry,
} from "../src/onlineProtocol";

export interface BattlefieldModifierDef {
  id: string;
  name: string;
  publicText: string;
}

export interface ObjectiveDef {
  id: string;
  name: string;
  publicText: string;
}

export interface EncounterTemplate {
  id: string;
  name: string;
  personaId: string;
  enemyStyle: AIEnemyStyle;
  battlefieldModifierIds: string[];
  objectiveIds: string[];
  openingIntent: string;
  shortDialogue: {
    opening: string;
    advantage: string;
    behind: string;
    closing: string;
  };
  defaultThreatType: AIIntentHint["threatType"];
}

export interface DirectorEncounterResult {
  encounter: AIEncounterSpec;
  trace: AIDirectorTrace;
  openingDialogue: AIDirectorDialogue;
  dialogueTrace: AIDirectorTrace;
}

export interface DirectorIntentResult {
  hint: AIIntentHint;
  trace: AIDirectorTrace;
  dialogue: AIDirectorDialogue | null;
  dialogueTrace: AIDirectorTrace | null;
}

export interface DirectorSummaryResult {
  summary: AIPostGameSummary;
  trace: AIDirectorTrace;
}

export interface DirectorDialogueResult {
  dialogue: AIDirectorDialogue;
  trace: AIDirectorTrace;
}

export const AI_PERSONAS = [
  {
    id: "arena-rival",
    name: "Kargan the Closer",
    archetype: "rival",
    aggression: 0.86,
    riskTolerance: 0.78,
    bluffFrequency: 0.35,
    resourceGreed: 0.42,
    chatFrequency: 0.64,
    mercy: 0.08,
  },
  {
    id: "calm-mentor",
    name: "Seraphine the Steady",
    archetype: "mentor",
    aggression: 0.44,
    riskTolerance: 0.34,
    bluffFrequency: 0.14,
    resourceGreed: 0.48,
    chatFrequency: 0.72,
    mercy: 0.66,
  },
  {
    id: "control-trickster",
    name: "Valeera's Echo",
    archetype: "trickster",
    aggression: 0.57,
    riskTolerance: 0.52,
    bluffFrequency: 0.82,
    resourceGreed: 0.76,
    chatFrequency: 0.58,
    mercy: 0.18,
  },
] satisfies AIPersona[];

export const BATTLEFIELD_MODIFIERS = [
  {
    id: "nagrand-pillars",
    name: "Nagrand Pillars",
    publicText: "The AI values center-to-pillar movement and tries to break clean lines.",
  },
  {
    id: "dampening-clock",
    name: "Dampening Clock",
    publicText: "The AI expects later rounds to punish slow recovery plans.",
  },
  {
    id: "center-pressure",
    name: "Center Pressure",
    publicText: "The AI prefers contesting center when it has tempo.",
  },
] satisfies BattlefieldModifierDef[];

export const DIRECTOR_OBJECTIVES = [
  {
    id: "force-trinket-before-burst",
    name: "Force Trinket Before Burst",
    publicText: "Try to make the opponent spend a major escape before committing burst.",
  },
  {
    id: "protect-own-healer",
    name: "Protect Own Healer",
    publicText: "Stabilize the healer before trading damage.",
  },
  {
    id: "pressure-enemy-caster",
    name: "Pressure Enemy Caster",
    publicText: "Keep pressure on fragile casters and punish long setups.",
  },
  {
    id: "win-reaction-trades",
    name: "Win Reaction Trades",
    publicText: "Bait interrupts or defensive reactions before key cards.",
  },
] satisfies ObjectiveDef[];

export const ENCOUNTER_TEMPLATES = [
  {
    id: "rival-burst-check",
    name: "Rival Burst Check",
    personaId: "arena-rival",
    enemyStyle: "aggressive",
    battlefieldModifierIds: ["center-pressure", "dampening-clock"],
    objectiveIds: ["force-trinket-before-burst", "pressure-enemy-caster"],
    openingIntent: "The rival will mark a vulnerable caster and look for a fast burst window.",
    shortDialogue: {
      opening: "I only need one clean window.",
      advantage: "There it is. Now you have to answer.",
      behind: "You slowed me down, not enough to stop me.",
      closing: "Next time, guard the setup before the hit lands.",
    },
    defaultThreatType: "burst",
  },
  {
    id: "mentor-stability-check",
    name: "Mentor Stability Check",
    personaId: "calm-mentor",
    enemyStyle: "sustain",
    battlefieldModifierIds: ["nagrand-pillars", "dampening-clock"],
    objectiveIds: ["protect-own-healer", "win-reaction-trades"],
    openingIntent: "The mentor will test whether you can create pressure without wasting reactions.",
    shortDialogue: {
      opening: "Show me your first clean exchange.",
      advantage: "You are falling behind on resources.",
      behind: "Good. You found the pressure point.",
      closing: "Review the reaction turn; that was the lesson.",
    },
    defaultThreatType: "defense",
  },
  {
    id: "trickster-reaction-trap",
    name: "Trickster Reaction Trap",
    personaId: "control-trickster",
    enemyStyle: "control",
    battlefieldModifierIds: ["nagrand-pillars", "center-pressure"],
    objectiveIds: ["win-reaction-trades", "force-trinket-before-burst"],
    openingIntent: "The trickster will threaten control first and punish early passes or panic trinkets.",
    shortDialogue: {
      opening: "Spend the wrong answer and I will remember it.",
      advantage: "That reaction was the door.",
      behind: "You waited. Annoying, and correct.",
      closing: "The trap was never the first spell.",
    },
    defaultThreatType: "control",
  },
] satisfies EncounterTemplate[];

function now() {
  return new Date().toISOString();
}

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

function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(stableValue(value))).digest("hex").slice(0, 16);
}

function traceFor(params: Omit<AIDirectorTrace, "traceId" | "latencyMs"> & { startedAt: number }): AIDirectorTrace {
  const latencyMs = Math.max(0, Date.now() - params.startedAt);
  return {
    traceId: `ai_director_${digest({
      roomCode: params.roomCode,
      version: params.version,
      outputType: params.outputType,
      output: params.output,
      inputSummary: params.inputSummary,
    })}`,
    roomCode: params.roomCode,
    version: params.version,
    source: params.source,
    inputSummary: params.inputSummary,
    outputType: params.outputType,
    output: params.output,
    latencyMs,
    fallbackUsed: params.fallbackUsed,
  };
}

function byId<T extends { id: string }>(items: readonly T[], id: string) {
  return items.find((item) => item.id === id) ?? null;
}

function assertWhitelistedTemplate(template: EncounterTemplate) {
  if (!byId(AI_PERSONAS, template.personaId)) {
    throw new Error(`template ${template.id} references non-whitelisted persona ${template.personaId}`);
  }
  for (const modifierId of template.battlefieldModifierIds) {
    if (!byId(BATTLEFIELD_MODIFIERS, modifierId)) {
      throw new Error(`template ${template.id} references non-whitelisted modifier ${modifierId}`);
    }
  }
  for (const objectiveId of template.objectiveIds) {
    if (!byId(DIRECTOR_OBJECTIVES, objectiveId)) {
      throw new Error(`template ${template.id} references non-whitelisted objective ${objectiveId}`);
    }
  }
}

function templateFor(templateId: string | undefined) {
  const template = templateId ? byId(ENCOUNTER_TEMPLATES, templateId) : ENCOUNTER_TEMPLATES[0];
  return {
    template: template ?? ENCOUNTER_TEMPLATES[0],
    fallbackUsed: !template,
  };
}

function encounterId(template: EncounterTemplate, seed: string) {
  return `enc_${digest({ templateId: template.id, seed })}`;
}

export function listAIPersonas(): AIPersona[] {
  return AI_PERSONAS.map((persona) => ({ ...persona }));
}

export function listEncounterTemplates(): EncounterTemplate[] {
  return ENCOUNTER_TEMPLATES.map((template) => structuredClone(template));
}

export function validateDirectorWhitelists() {
  for (const template of ENCOUNTER_TEMPLATES) {
    assertWhitelistedTemplate(template);
  }
}

export function createDirectorEncounter(roomCode: string, templateId?: string, seed = `${roomCode}:week3-director-v0`): DirectorEncounterResult {
  const startedAt = Date.now();
  validateDirectorWhitelists();
  const { template, fallbackUsed } = templateFor(templateId);
  const encounter: AIEncounterSpec = {
    encounterId: encounterId(template, seed),
    templateId: template.id,
    seed,
    personaId: template.personaId,
    enemyStyle: template.enemyStyle,
    battlefieldModifierIds: [...template.battlefieldModifierIds],
    objectiveIds: [...template.objectiveIds],
    openingIntent: template.openingIntent,
  };
  const trace = traceFor({
    roomCode,
    source: "template",
    inputSummary: `templateId=${templateId ?? "default"} seed=${seed}`,
    outputType: "encounter",
    output: encounter,
    startedAt,
    fallbackUsed,
  });
  const openingDialogue: AIDirectorDialogue = {
    turn: 1,
    personaId: template.personaId,
    source: "template",
    line: template.shortDialogue.opening,
  };
  const dialogueTrace = traceFor({
    roomCode,
    source: "template",
    inputSummary: `encounterId=${encounter.encounterId} trigger=opening`,
    outputType: "dialogue",
    output: openingDialogue,
    startedAt,
    fallbackUsed: false,
  });
  return { encounter, trace, openingDialogue, dialogueTrace };
}

function opposingSide(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function aliveHeroes(state: GameState, side: Side) {
  return Object.values(state.heroes).filter((hero) => hero.side === side && hero.alive);
}

function lowestHpHero(heroes: HeroState[]) {
  return [...heroes].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0] ?? null;
}

function confidenceBand(value: number): AIIntentHint["confidenceBand"] {
  if (value >= 0.72) return "high";
  if (value >= 0.46) return "mid";
  return "low";
}

function threatFromPendingReaction(state: GameState): AIIntentHint["threatType"] | null {
  const cardId = state.pendingReaction?.sourceCardId;
  const card = cardId ? state.cardById[cardId] : null;
  if (!card) return null;
  if (card.effectKey === "interrupt") return "interrupt";
  if (card.effectKey.includes("control")) return "control";
  if (card.effectKey === "burst-damage") return "burst";
  if (card.effectKey.includes("move")) return "movement";
  if (card.effectKey.includes("heal")) return "heal";
  if (card.effectKey.includes("shield") || card.effectKey === "damage-reduction") return "defense";
  if (card.effectKey.includes("damage")) return "damage";
  return "resource";
}

function publicIntentText(threatType: AIIntentHint["threatType"], targetIds: string[], band: AIIntentHint["confidenceBand"]) {
  const targetText = targetIds.length > 0 ? targetIds.join(", ") : "the board";
  const pressure = band === "high" ? "strongly" : band === "mid" ? "steadily" : "lightly";
  switch (threatType) {
    case "burst":
      return `Enemy intent ${pressure} points toward a burst window on ${targetText}.`;
    case "control":
      return `Enemy intent ${pressure} leans into control around ${targetText}.`;
    case "interrupt":
      return `Enemy intent ${pressure} threatens an interrupt trade around ${targetText}.`;
    case "heal":
      return `Enemy intent ${pressure} favors recovery before trading again.`;
    case "defense":
      return `Enemy intent ${pressure} favors defensive stabilization.`;
    case "movement":
      return `Enemy intent ${pressure} values movement and line control near ${targetText}.`;
    case "resource":
      return `Enemy intent ${pressure} focuses on the next resource exchange.`;
    case "damage":
      return `Enemy intent ${pressure} points toward damage on ${targetText}.`;
  }
}

function templateByEncounter(encounter: AIEncounterSpec) {
  return byId(ENCOUNTER_TEMPLATES, encounter.templateId) ?? ENCOUNTER_TEMPLATES[0];
}

export function createIntentHint(roomCode: string, version: number, state: GameState, encounter: AIEncounterSpec, aiSide: Side = "red"): DirectorIntentResult {
  const startedAt = Date.now();
  const template = templateByEncounter(encounter);
  const enemySide = opposingSide(aiSide);
  const focusTargetId = state.players[aiSide]?.focusTargetId;
  const enemyLowTarget = lowestHpHero(aliveHeroes(state, enemySide));
  const allyLowTarget = lowestHpHero(aliveHeroes(state, aiSide));
  const pendingThreat = threatFromPendingReaction(state);
  const targetIds = focusTargetId ? [focusTargetId] : enemyLowTarget ? [enemyLowTarget.id] : [];
  const enemyLowRatio = enemyLowTarget ? 1 - enemyLowTarget.hp / enemyLowTarget.maxHp : 0;
  const allyLowRatio = allyLowTarget ? 1 - allyLowTarget.hp / allyLowTarget.maxHp : 0;
  const threatType =
    pendingThreat ??
    (enemyLowTarget && enemyLowTarget.hp <= 5 ? "burst" : allyLowRatio > enemyLowRatio + 0.2 ? "defense" : template.defaultThreatType);
  const band = confidenceBand(Math.max(enemyLowRatio, allyLowRatio, focusTargetId ? 0.62 : 0.32) + (pendingThreat ? 0.2 : 0));
  const hint: AIIntentHint = {
    turn: state.round,
    source: pendingThreat ? "heuristic" : "template",
    threatType,
    targetEntityIds: threatType === "defense" || threatType === "heal" ? (allyLowTarget ? [allyLowTarget.id] : []) : targetIds,
    confidenceBand: band,
    text: publicIntentText(threatType, threatType === "defense" || threatType === "heal" ? (allyLowTarget ? [allyLowTarget.id] : []) : targetIds, band),
  };
  const trace = traceFor({
    roomCode,
    version,
    source: hint.source,
    inputSummary: `round=${state.round} aiSide=${aiSide} focusTarget=${focusTargetId ?? "none"} pendingReaction=${state.pendingReaction?.kind ?? "none"}`,
    outputType: "intent",
    output: hint,
    startedAt,
    fallbackUsed: false,
  });
  const dialogueLine = band === "high" ? template.shortDialogue.advantage : state.round > 1 && allyLowRatio > enemyLowRatio ? template.shortDialogue.behind : null;
  const dialogue = dialogueLine
    ? {
        turn: state.round,
        personaId: encounter.personaId,
        source: "template" as const,
        line: dialogueLine,
      }
    : null;
  const dialogueTrace = dialogue
    ? traceFor({
        roomCode,
        version,
        source: "template",
        inputSummary: `encounterId=${encounter.encounterId} turn=${state.round} confidence=${band}`,
        outputType: "dialogue",
        output: dialogue,
        startedAt,
        fallbackUsed: false,
      })
    : null;
  return { hint, trace, dialogue, dialogueTrace };
}

function uniqueTurns(entries: RoomReplayEntry[], predicate: (entry: RoomReplayEntry) => boolean) {
  return [...new Set(entries.filter(predicate).map((entry) => entry.round))].sort((a, b) => a - b);
}

function commandEntries(replay: RoomReplayEntry[]) {
  return replay.filter((entry) => entry.kind === "command");
}

function sideCommandCount(entries: RoomReplayEntry[], side: Side, commandType: string) {
  return entries.filter((entry) => entry.side === side && entry.command?.type === commandType).length;
}

export function createPostGameSummary(
  roomCode: string,
  replay: RoomReplayEntry[],
  summary: RoomPlaytestSummary,
  encounter: AIEncounterSpec,
  playerSide: Side = "blue",
): DirectorSummaryResult {
  const startedAt = Date.now();
  const commands = commandEntries(replay);
  const reactionTurns = uniqueTurns(commands, (entry) => !!entry.openedReactionWindow);
  const interruptTurns = uniqueTurns(commands, (entry) => !!entry.interrupted);
  const trinketTurns = uniqueTurns(commands, (entry) => !!entry.trinketUsed);
  const focusSelections = sideCommandCount(commands, playerSide, "selectFocusTarget");
  const passes = sideCommandCount(commands, playerSide, "pass");
  const keyTurns = [...new Set([...interruptTurns, ...trinketTurns, ...reactionTurns.slice(0, 2), summary.killRound ?? summary.round])]
    .filter((turn) => Number.isFinite(turn))
    .sort((a, b) => a - b)
    .slice(0, 4);
  const playerStrengths = [
    focusSelections > 0 ? `Selected focus targets ${focusSelections} time(s), creating readable pressure plans.` : "Kept the match moving through legal priority windows.",
    summary.responseWindowCount > 0 ? `Reached ${summary.responseWindowCount} reaction window(s), giving clear chances to trade resources.` : "Avoided giving the AI many obvious reaction traps.",
  ];
  const playerMistakes = [
    trinketTurns.length > 0 ? `Spent trinket on turn ${trinketTurns[0]}, which became a key replay marker.` : "Did not force or spend many trinket moments, leaving fewer decisive resource swings.",
    passes > 3 ? `Passed priority ${passes} time(s); review whether one of those passes gave away tempo.` : "Few priority passes were recorded, so the main review point is card timing rather than inactivity.",
  ];
  const decisiveMoment =
    interruptTurns[0] !== undefined
      ? `Turn ${interruptTurns[0]} was decisive because an interrupt was recorded in the replay.`
      : trinketTurns[0] !== undefined
        ? `Turn ${trinketTurns[0]} was decisive because a trinket was spent in the replay.`
        : `Turn ${summary.killRound ?? summary.round} is the clearest checkpoint because the match ended or stopped there.`;
  const template = templateByEncounter(encounter);
  const postGameSummary: AIPostGameSummary = {
    matchId: roomCode,
    keyTurns,
    playerStrengths,
    playerMistakes,
    decisiveMoment,
    nextRunSuggestion: `Replay ${template.name} with attention on "${encounter.objectiveIds[0]}"; the Director saw ${commands.length} command(s), ${summary.responseWindowCount} reaction window(s), and ${summary.interruptCount} interrupt(s).`,
  };
  const trace = traceFor({
    roomCode,
    version: summary.version,
    source: "heuristic",
    inputSummary: `commands=${commands.length} winner=${summary.winner ?? "none"} reactions=${summary.responseWindowCount} interrupts=${summary.interruptCount} trinkets=${summary.trinketUseCount}`,
    outputType: "summary",
    output: postGameSummary,
    startedAt,
    fallbackUsed: false,
  });
  return { summary: postGameSummary, trace };
}

export function createClosingDialogue(roomCode: string, version: number, round: number, encounter: AIEncounterSpec): DirectorDialogueResult {
  const startedAt = Date.now();
  const template = templateByEncounter(encounter);
  const dialogue: AIDirectorDialogue = {
    turn: round,
    personaId: encounter.personaId,
    source: "template",
    line: template.shortDialogue.closing,
  };
  const trace = traceFor({
    roomCode,
    version,
    source: "template",
    inputSummary: `encounterId=${encounter.encounterId} trigger=closing`,
    outputType: "dialogue",
    output: dialogue,
    startedAt,
    fallbackUsed: false,
  });
  return { dialogue, trace };
}

export function createDirectorReplayEntry(roomCode: string, side: Side, version: number, round: number, trace: AIDirectorTrace): RoomReplayEntry {
  return {
    kind: "director",
    type: "aiDirector",
    roomCode,
    side,
    timestamp: now(),
    version,
    round,
    directorTrace: trace,
  };
}
