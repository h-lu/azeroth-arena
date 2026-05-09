import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const outputPath = join(root, "unity-client/Assets/AzerothArena/Generated/OnlineProtocolManifest.json");

const clientMessages = [
  "createRoom",
  "createAIEncounter",
  "joinRoom",
  "reconnect",
  "submitCommand",
  "exportReplay"
];

const serverMessages = [
  "roomJoined",
  "playerView",
  "roomError",
  "replayExport",
  "aiEncounterUpdated",
  "opponentDisconnected"
];

const commandTypes = [
  "startTurn",
  "endTurn",
  "pass",
  "activateHero",
  "moveHero",
  "playCard",
  "resolveReaction",
  "selectFocusTarget",
  "useTrinket",
  "discardCards"
];

const gameEventTypes = [
  "activation-end",
  "activate",
  "card-drawn",
  "card-played",
  "cleanse",
  "control-applied",
  "control-downgraded",
  "control-immune",
  "control",
  "cooldown-start",
  "damage",
  "debuff",
  "discard",
  "discard-auto",
  "dispel",
  "end-round-damage",
  "fake-cast",
  "fake-cast-success",
  "focus",
  "focus-selected",
  "hard-control-consumed",
  "heal",
  "inline-defense",
  "interrupted",
  "knockout",
  "move",
  "reaction-defense",
  "reaction-opened",
  "reaction-pass",
  "reaction-play",
  "reaction-resolved",
  "round-end",
  "round-start",
  "shield",
  "turn-pass",
  "trinket",
  "unimplemented"
];

const requiredSources = [
  "src/onlineProtocol.ts",
  "packages/rules/src/types.ts",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ServerEventModels.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/GameProtocol.cs"
];

const failures = [];

for (const source of requiredSources) {
  const contents = readFileSync(join(root, source), "utf8");
  const expectedTokens = source.endsWith("onlineProtocol.ts")
    ? [...clientMessages, ...serverMessages]
    : source.endsWith("types.ts")
      ? [...commandTypes, ...gameEventTypes]
      : source.endsWith("GameProtocol.cs")
        ? [...clientMessages, ...serverMessages]
        : [];

  for (const token of expectedTokens) {
    if (!contents.includes(`"${token}"`) && !contents.includes(token)) {
      failures.push(`${source} is missing token "${token}"`);
    }
  }
}

const manifest = {
  schemaVersion: 1,
  sourceOfTruth: [
    "src/onlineProtocol.ts",
    "packages/rules/src/types.ts"
  ],
  generatedFor: "unity-client",
  clientMessages,
  serverMessages,
  commandTypes,
  gameEventTypes,
  temporaryDtoFiles: [
    "unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs",
    "unity-client/Assets/AzerothArena/Scripts/Protocol/ServerEventModels.cs"
  ],
  week8Contract: {
    submitPath: "Unity TargetSelectionController selects an existing legal command and UnityRoomClient submits it with expectedVersion.",
    rejectFeedback: "roomError drives TargetSelectionController.ReboundRequested and MatchHud toast state.",
    eventMapping: "VisualCommandFactory maps PlayerView.state.log deltas into VisualCommandQueue commands before snapshot reconcile."
  },
  week9Contract: {
    typedEvents: "packages/rules/src/types.ts declares GameEvent as a discriminated union keyed by GameEventPayloadByType.",
    formalVisualCommands: "VisualCommandFactory maps card-drawn, card-played, damage, knockout, and round-start into named VisualCommandQueue commands.",
    replayPath: "VisualCommandFactory.BuildReplayVisualCommands maps replay export command events through the same GameEvent-to-VisualCommand path before snapshot reconcile.",
    hiddenInfoBoundary: "card-drawn events expose public counts only; card identity is recovered from the viewer snapshot during reconcile."
  }
};

const serialized = JSON.stringify(manifest, null, 2) + "\n";
const checkOnly = process.argv.includes("--check");

if (failures.length > 0) {
  console.error("Unity protocol manifest generation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

if (checkOnly) {
  const current = readFileSync(outputPath, "utf8");
  if (current !== serialized) {
    console.error("Unity protocol manifest is stale. Run npm run generate:unity-protocol-manifest.");
    process.exit(1);
  }

  console.log("Unity protocol manifest is current.");
} else {
  writeFileSync(outputPath, serialized);
  console.log("Wrote " + outputPath);
}
