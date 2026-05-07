import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredFiles = [
  "unity-client/Assets/AzerothArena/Scenes/Match.unity",
  "unity-client/Assets/AzerothArena/Scenes/Match.unity.meta",
  "unity-client/Assets/AzerothArena/Prefabs/Cards/CardView.prefab",
  "unity-client/Assets/AzerothArena/Prefabs/Cards/CardView.prefab.meta",
  "unity-client/Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab",
  "unity-client/Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab.meta",
  "unity-client/Assets/AzerothArena/Prefabs/AI/ThinkingRing.prefab",
  "unity-client/Assets/AzerothArena/Prefabs/AI/ThinkingRing.prefab.meta",
  "unity-client/Assets/AzerothArena/Prefabs/AI/IntentBar.prefab",
  "unity-client/Assets/AzerothArena/Prefabs/AI/IntentBar.prefab.meta",
  "unity-client/Assets/AzerothArena/Scripts/Cards/CardView.cs",
  "unity-client/Assets/AzerothArena/Scripts/Cards/CardView.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Hand/HandLayoutController.cs",
  "unity-client/Assets/AzerothArena/Scripts/Hand/HandLayoutController.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Input/CardDragController.cs",
  "unity-client/Assets/AzerothArena/Scripts/Input/CardDragController.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Commands/IVisualCommand.cs",
  "unity-client/Assets/AzerothArena/Scripts/Commands/IVisualCommand.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandQueue.cs",
  "unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandQueue.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/Commands/MockVisualCommandQueueDriver.cs",
  "unity-client/Assets/AzerothArena/Scripts/Commands/MockVisualCommandQueueDriver.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/AI/AIOpponentView.cs",
  "unity-client/Assets/AzerothArena/Scripts/AI/AIOpponentView.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/AI/ThinkingRing.cs",
  "unity-client/Assets/AzerothArena/Scripts/AI/ThinkingRing.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/AI/IntentBar.cs",
  "unity-client/Assets/AzerothArena/Scripts/AI/IntentBar.cs.meta",
  "unity-client/Assets/AzerothArena/Scripts/MatchVisualPrototypeBootstrap.cs",
  "unity-client/Assets/AzerothArena/Scripts/MatchVisualPrototypeBootstrap.cs.meta"
];

const requiredMarkers = new Map([
  ["unity-client/Assets/AzerothArena/Scenes/Match.unity", ["MatchVisualPrototype", "MatchVisualPrototypeBootstrap"]],
  ["unity-client/Assets/AzerothArena/Prefabs/Cards/CardView.prefab", ["m_Name: CardView"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab", ["m_Name: AIOpponentView"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/ThinkingRing.prefab", ["m_Name: ThinkingRing"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/IntentBar.prefab", ["m_Name: IntentBar"]],
  ["unity-client/Assets/AzerothArena/Scripts/Hand/HandLayoutController.cs", ["public sealed class HandLayoutController", "Reflow"]],
  ["unity-client/Assets/AzerothArena/Scripts/Input/CardDragController.cs", ["public sealed class CardDragController", "IBeginDragHandler", "IEndDragHandler", "SetHoverAmount(0f)"]],
  ["unity-client/Assets/AzerothArena/Scripts/Commands/VisualCommandQueue.cs", ["public sealed class VisualCommandQueue", "Enqueue"]],
  ["unity-client/Assets/AzerothArena/Scripts/Commands/MockVisualCommandQueueDriver.cs", ["MockVisualCommandQueueDriver", "AIThinkingVisualCommand"]],
  ["unity-client/Assets/AzerothArena/Scripts/AI/AIOpponentView.cs", ["public sealed class AIOpponentView", "ShowThinking", "ShowIntent"]],
  ["unity-client/Assets/AzerothArena/Scripts/AI/ThinkingRing.cs", ["public sealed class ThinkingRing", "rotationDegreesPerSecond", "SetActive(false)"]],
  ["unity-client/Assets/AzerothArena/Scripts/AI/IntentBar.cs", ["public sealed class IntentBar", "confidence", "Image.Type.Filled"]]
]);

const requiredScriptReferences = new Map([
  ["unity-client/Assets/AzerothArena/Scenes/Match.unity", ["unity-client/Assets/AzerothArena/Scripts/MatchVisualPrototypeBootstrap.cs.meta"]],
  ["unity-client/Assets/AzerothArena/Prefabs/Cards/CardView.prefab", ["unity-client/Assets/AzerothArena/Scripts/Cards/CardView.cs.meta"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/AIOpponentView.prefab", ["unity-client/Assets/AzerothArena/Scripts/AI/AIOpponentView.cs.meta"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/ThinkingRing.prefab", ["unity-client/Assets/AzerothArena/Scripts/AI/ThinkingRing.cs.meta"]],
  ["unity-client/Assets/AzerothArena/Prefabs/AI/IntentBar.prefab", ["unity-client/Assets/AzerothArena/Scripts/AI/IntentBar.cs.meta"]]
]);

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
    continue;
  }

  for (const marker of markers) {
    if (!contents.includes(marker)) {
      failures.push(`${file} is missing marker: ${marker}`);
    }
  }
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

for (const [assetFile, scriptMetas] of requiredScriptReferences.entries()) {
  let assetContents = "";
  try {
    assetContents = readFileSync(join(root, assetFile), "utf8");
  } catch {
    continue;
  }

  for (const scriptMeta of scriptMetas) {
    let scriptGuid = "";
    try {
      scriptGuid = readUnityGuid(readFileSync(join(root, scriptMeta), "utf8")) ?? "";
    } catch {
      continue;
    }

    if (!assetContents.includes(`guid: ${scriptGuid}`)) {
      failures.push(`${assetFile} does not reference script guid ${scriptGuid} from ${scriptMeta}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Unity prototype validation failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Unity prototype validation passed: ${requiredFiles.length} files checked.`);

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
