import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ServerEventModels.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/ServerEventModels.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/GameProtocol.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/GameProtocol.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/WebSocketTransport.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/WebSocketTransport.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/UnityRoomClient.cs",
  "unity-client/Assets/AzerothArena/Scripts/Protocol/UnityRoomClient.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/State/ClientSnapshotStore.cs",
  "unity-client/Assets/AzerothArena/Scripts/State/ClientSnapshotStore.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Input/InputPermissionGuard.cs",
  "unity-client/Assets/AzerothArena/Scripts/Input/InputPermissionGuard.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Input/TargetSelectionController.cs",
  "unity-client/Assets/AzerothArena/Scripts/Input/TargetSelectionController.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandFactory.cs",
  "unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandFactory.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/MatchHud.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/MatchHud.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/ToastPromptView.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/ToastPromptView.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/SafeAreaFitter.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/SafeAreaFitter.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/TouchTargetExpander.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/TouchTargetExpander.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/CardLongPressPreview.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/CardLongPressPreview.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Input/TargetSnapController.cs",
  "unity-client/Assets/AzerothArena/Scripts/Input/TargetSnapController.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/UI/ReactionWindowMobilePrompt.cs",
  "unity-client/Assets/AzerothArena/Scripts/UI/ReactionWindowMobilePrompt.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Visual/MobileFeedbackController.cs",
  "unity-client/Assets/AzerothArena/Scripts/Visual/MobileFeedbackController.cs.meta",
  "unity-client/Assets/AzerothArena/Generated/OnlineProtocolManifest.json",
  "unity-client/Assets/AzerothArena/Generated/OnlineProtocolManifest.json.meta",
  "scripts/generate-unity-protocol-manifest.mjs"
];

const requiredMarkers = new Map([
  ["unity-client/Packages/manifest.json", ["com.unity.nuget.newtonsoft-json"]],
  ["unity-client/Assets/AzerothArena/Scripts/Protocol/GameProtocol.cs", [
    "DefaultWebSocketUrl",
    "CreateRoom = \"createRoom\"",
    "CreateAIEncounter = \"createAIEncounter\"",
    "JoinRoom = \"joinRoom\"",
    "Reconnect = \"reconnect\"",
    "SubmitCommand = \"submitCommand\"",
    "ExportReplay = \"exportReplay\"",
    "RoomJoined = \"roomJoined\"",
    "PlayerView = \"playerView\"",
    "RoomError = \"roomError\"",
    "AIEncounterUpdated = \"aiEncounterUpdated\"",
    "CloneCommand"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Protocol/ClientMessageModels.cs", [
    "CreateRoomRequestDto",
    "CreateAIEncounterRequestDto",
    "JoinRoomRequestDto",
    "ReconnectRequestDto",
    "SubmitCommandRequestDto",
    "ExportReplayRequestDto",
    "JsonProperty(\"seatToken\")",
    "JsonProperty(\"expectedVersion\""
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Protocol/ServerEventModels.cs", [
    "RoomJoinedPayloadDto",
    "PlayerViewDto",
    "RoomErrorPayloadDto",
    "AIEncounterDebugStateDto",
    "JsonProperty(\"legalCommands\")",
    "JsonProperty(\"state\")",
    "JObject State",
    "JArray LegalCommands"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Protocol/WebSocketTransport.cs", [
    "ClientWebSocket",
    "ConnectAsync",
    "SendAsync",
    "ReceiveLoopAsync",
    "ConcurrentQueue<string>",
    "MessageReceived?.Invoke"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Protocol/UnityRoomClient.cs", [
    "CreateRoomAsync",
    "CreateAIEncounterAsync",
    "JoinRoomAsync",
    "ReconnectAsync",
    "SubmitCommandAsync",
    "SubmitLegalCommandByIndexAsync",
    "ApplyRoomError",
    "PlayerViewUpdated?.Invoke"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/State/ClientSnapshotStore.cs", [
    "ApplyRoomJoined",
    "ApplyPlayerView",
    "ApplyAIEncounter",
    "ApplyRoomError",
    "HasSession",
    "LegalCommands"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Input/CardDragController.cs", [
    "SetInputAllowed",
    "RequestRebound",
    "ReboundRequested",
    "BeginCardTargeting",
    "TargetSnapController",
    "TargetSelectionController",
    "MobileFeedbackController",
    "SnappedTargetReleased"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Input/InputPermissionGuard.cs", [
    "public sealed class InputPermissionGuard",
    "CanSubmit",
    "InputLocked",
    "IsStillLegal"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Input/TargetSelectionController.cs", [
    "public sealed class TargetSelectionController",
    "BeginCardTargeting",
    "BeginReactionPass",
    "BeginReactionTrinket",
    "SelectTarget",
    "SelectZone",
    "SubmitResolvedCommandAsync",
    "GameProtocol.CloneCommand",
    "ReboundRequested"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandFactory.cs", [
    "public sealed class VisualCommandFactory",
    "BuildPlayerViewDelta",
    "BuildReplayVisualCommands",
    "BuildGameEventCommand",
    "DrawCardsVisualCommand",
    "PlayCardVisualCommand",
    "DamageVisualCommand",
    "EntityDefeatedVisualCommand",
    "RoundStartVisualCommand",
    "SnapshotReconcileVisualCommand",
    "card-drawn",
    "card-played",
    "damage",
    "knockout",
    "round-start"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/MatchHud.cs", [
    "public sealed class MatchHud",
    "CreateAIEncounter",
    "BeginFirstPlayableCard",
    "SelectZone",
    "HandleRoomError",
    "EnqueuePlayerViewDelta",
    "ReactionWindowMobilePrompt",
    "MobileFeedbackController"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/ToastPromptView.cs", [
    "public sealed class ToastPromptView",
    "Show",
    "HideAfterDelay"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/SafeAreaFitter.cs", [
    "public sealed class SafeAreaFitter",
    "Screen.safeArea",
    "landscapeReferenceResolution",
    "ApplySafeArea"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/TouchTargetExpander.cs", [
    "public sealed class TouchTargetExpander",
    "minimumTouchSize",
    "LayoutElement",
    "EnsureTouchTarget"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/CardLongPressPreview.cs", [
    "public sealed class CardLongPressPreview",
    "IPointerDownHandler",
    "holdSeconds",
    "ShowPreview",
    "HidePreview",
    "ClampToParent"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Input/TargetSnapController.cs", [
    "public sealed class TargetSnapController",
    "snapRadiusPixels",
    "SetPrototypeSelectableTargets",
    "RegisterTargetAnchor",
    "GetComponentInParent<TargetSelectionController>",
    "TrySelectSnappedTarget",
    "SnapTargetChanged"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/UI/ReactionWindowMobilePrompt.cs", [
    "public sealed class ReactionWindowMobilePrompt",
    "resolveReaction",
    "BeginReactionPass",
    "BeginReactionTrinket",
    "TouchTargetExpander"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/Visual/MobileFeedbackController.cs", [
    "public sealed class MobileFeedbackController",
    "AudioSource",
    "Handheld.Vibrate",
    "PlayReject",
    "PlaySubmit"
  ]],
  ["unity-client/Assets/AzerothArena/Scripts/MatchVisualPrototypeBootstrap.cs", [
    "SafeAreaFitter",
    "TouchTargetExpander",
    "CardLongPressPreview",
    "MobileFeedbackController",
    "TargetSnapController",
    "SetPrototypeSelectableTargets",
    "RegisterTargetAnchor"
  ]],
  ["unity-client/Assets/AzerothArena/Generated/OnlineProtocolManifest.json", [
    "\"schemaVersion\": 1",
    "\"clientMessages\"",
    "\"serverMessages\"",
    "\"commandTypes\"",
    "\"gameEventTypes\"",
    "\"week8Contract\"",
    "\"week9Contract\""
  ]],
  ["scripts/generate-unity-protocol-manifest.mjs", [
    "OnlineProtocolManifest.json",
    "--check",
    "sourceOfTruth",
    "week8Contract",
    "week9Contract"
  ]]
]);

const protocolMessages = [
  "createRoom",
  "createAIEncounter",
  "joinRoom",
  "reconnect",
  "submitCommand",
  "exportReplay",
  "roomJoined",
  "playerView",
  "roomError",
  "replayExport",
  "aiEncounterUpdated",
  "opponentDisconnected"
];

const failures = [];

for (const file of requiredFiles) {
  const absolute = join(root, file);
  try {
    const stat = statSync(absolute);
    if (!stat.isFile() || stat.size === 0) {
      failures.push(`${file} is empty or not a file`);
    }
  } catch {
    failures.push(`${file} is missing`);
  }
}

for (const [file, markers] of requiredMarkers.entries()) {
  let contents = "";
  try {
    contents = readFileSync(join(root, file), "utf8");
  } catch {
    failures.push(`${file} could not be read`);
    continue;
  }

  for (const marker of markers) {
    if (!contents.includes(marker)) {
      failures.push(`${file} is missing marker: ${marker}`);
    }
  }
}

const tsProtocol = readFileSync(join(root, "src/onlineProtocol.ts"), "utf8");
const unityProtocol = readFileSync(join(root, "unity-client/Assets/AzerothArena/Scripts/Protocol/GameProtocol.cs"), "utf8");

for (const message of protocolMessages) {
  if (!tsProtocol.includes(`"${message}"`)) {
    failures.push(`src/onlineProtocol.ts is missing expected protocol message: ${message}`);
  }
  if (!unityProtocol.includes(`"${message}"`)) {
    failures.push(`GameProtocol.cs is missing expected protocol message: ${message}`);
  }
}

const manifestCheck = spawnSync(process.execPath, ["scripts/generate-unity-protocol-manifest.mjs", "--check"], {
  cwd: root,
  encoding: "utf8"
});
if (manifestCheck.status !== 0) {
  const details = [manifestCheck.stdout, manifestCheck.stderr].filter(Boolean).join("\n").trim();
  failures.push("Unity protocol manifest check failed" + (details ? `: ${details}` : ""));
}

const metaFiles = collectFiles(join(root, "unity-client/Assets/AzerothArena"), ".meta");
const guidOwners = new Map();

for (const metaFile of metaFiles) {
  const contents = readFileSync(metaFile, "utf8");
  const guid = readUnityGuid(contents);
  if (guid == null) {
    failures.push(`${relativePath(metaFile)} is missing a Unity guid`);
    continue;
  }

  const existingOwner = guidOwners.get(guid);
  if (existingOwner != null) {
    failures.push(`${relativePath(metaFile)} duplicates Unity guid ${guid} from ${existingOwner}`);
    continue;
  }

  guidOwners.set(guid, relativePath(metaFile));
}

if (failures.length > 0) {
  console.error("Unity WebSocket validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Unity WebSocket validation passed: ${requiredFiles.length} files checked.`);

function collectFiles(directory, extension) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(absolute, extension));
      continue;
    }

    if (entry.isFile() && absolute.endsWith(extension)) {
      files.push(absolute);
    }
  }

  return files;
}

function readUnityGuid(contents) {
  return contents.match(/^guid:\s*([a-f0-9]{32})$/m)?.[1] ?? null;
}

function relativePath(absolute) {
  return absolute.startsWith(root + "/") ? absolute.slice(root.length + 1) : absolute;
}
