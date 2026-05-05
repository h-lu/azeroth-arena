import { CARDS } from "../packages/data/src/cards";
import type { CardDef } from "../packages/data/src";

type FrozenCard = CardDef & {
  reaction_window?: string;
  card_kind?: string;
  source?: string;
};

const cards = CARDS as FrozenCard[];

type HeroRoleValue = "rogue" | "mage" | "priest" | "warrior" | "warlock" | "druid";
type SideValue = "blue" | "red" | "common";
type CardKindValue = "hero" | "class" | "common";
type CategoryValue = "英雄" | "职业" | "通用";
type EffectKeyValue =
  | "hero"
  | "damage"
  | "damage-heal-reduction"
  | "interrupt"
  | "hard-control"
  | "key-move"
  | "burst-damage"
  | "spell-damage-soft-control"
  | "heal"
  | "shield"
  | "dispel"
  | "soft-control"
  | "damage-reduction"
  | "spell-damage-heal"
  | "dot"
  | "debuff"
  | "key-move-shield"
  | "fake-cast"
  | "focus-mark"
  | "cleanse-control";

const HERO_ROLES = new Set<HeroRoleValue>(["rogue", "mage", "priest", "warrior", "warlock", "druid"]);
const SIDES = new Set<SideValue>(["blue", "red", "common"]);
const CARD_KINDS = new Set<CardKindValue>(["hero", "class", "common"]);
const CATEGORIES = new Set<CategoryValue>(["英雄", "职业", "通用"]);
const USERS_BY_SIDE = {
  blue: "蓝方",
  red: "红方",
  common: "任意英雄",
} as const;
const COMMON_USERS = new Set(["任意英雄", "将受硬控或已受硬控的英雄"]);
const FACTIONS_BY_SIDE = {
  blue: "蓝方 RMP",
  red: "红方 WLD",
  common: "通用",
} as const;
const CLASS_USERS_BY_SIDE = {
  blue: new Set(["盗贼", "法师", "牧师"]),
  red: new Set(["战士", "术士", "德鲁伊"]),
} as const;
const ROLE_NAMES: Record<string, string> = {
  rogue: "盗贼",
  mage: "法师",
  priest: "牧师",
  warrior: "战士",
  warlock: "术士",
  druid: "德鲁伊",
  common: "任意英雄",
};
const EFFECT_KEYS = new Set<EffectKeyValue>([
  "hero",
  "damage",
  "damage-heal-reduction",
  "interrupt",
  "hard-control",
  "key-move",
  "burst-damage",
  "spell-damage-soft-control",
  "heal",
  "shield",
  "dispel",
  "soft-control",
  "damage-reduction",
  "spell-damage-heal",
  "dot",
  "debuff",
  "key-move-shield",
  "fake-cast",
  "focus-mark",
  "cleanse-control",
]);

const TYPE_HINTS: Record<string, string[]> = {
  hero: ["英雄"],
  damage: ["伤害"],
  "damage-heal-reduction": ["减疗", "伤害"],
  interrupt: ["打断"],
  "hard-control": ["硬控"],
  "key-move": ["位移"],
  "burst-damage": ["爆发", "伤害"],
  "spell-damage-soft-control": ["施法", "软控"],
  heal: ["治疗"],
  shield: ["护盾"],
  dispel: ["驱散"],
  "soft-control": ["软控"],
  "damage-reduction": ["防御"],
  dot: ["持续伤害"],
  debuff: ["减疗"],
  "spell-damage-heal": ["施法", "治疗"],
  "key-move-shield": ["位移", "护盾"],
  "fake-cast": ["战术"],
  "focus-mark": ["压力"],
  "cleanse-control": ["解控"],
};

const ALLOWED_REACTIONS: Record<string, string[]> = {
  hero: ["否"],
  damage: ["否"],
  "damage-heal-reduction": ["否"],
  interrupt: ["否"],
  "hard-control": ["是：强控", "是：施法"],
  "key-move": ["否", "是：关键位移"],
  "burst-damage": ["是：爆发", "是：施法（同时视为爆发牌）"],
  "spell-damage-soft-control": ["是：施法"],
  heal: ["否", "是：施法"],
  shield: ["否"],
  dispel: ["否"],
  "soft-control": ["否", "是：施法"],
  "damage-reduction": ["否"],
  "spell-damage-heal": ["是：施法"],
  dot: ["否"],
  debuff: ["是：施法"],
  "key-move-shield": ["是：关键位移"],
  "fake-cast": ["是：施法"],
  "focus-mark": ["否"],
  "cleanse-control": ["否"],
};

function fail(errors: string[], message: string) {
  errors.push(message);
}

function requireString(errors: string[], card: FrozenCard, field: keyof FrozenCard) {
  const value = card[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(errors, `[${card.id}] ${String(field)} must be a non-empty string`);
  }
}

function checkTypeHints(errors: string[], card: FrozenCard) {
  const hints = TYPE_HINTS[card.effectKey];
  if (!hints) {
    fail(errors, `[${card.id}] unsupported effectKey ${card.effectKey}`);
    return;
  }
  if (!hints.some((hint) => card.type.includes(hint))) {
    fail(errors, `[${card.id}] type "${card.type}" does not match effectKey ${card.effectKey}`);
  }
}

function checkReaction(errors: string[], card: FrozenCard) {
  const allowed = ALLOWED_REACTIONS[card.effectKey];
  if (!allowed) return;
  if (!allowed.includes(card.reaction)) {
    fail(errors, `[${card.id}] reaction "${card.reaction}" is not allowed for effectKey ${card.effectKey}`);
  }
  if (card.reaction_window !== undefined && card.reaction_window !== card.reaction) {
    fail(errors, `[${card.id}] reaction_window "${card.reaction_window}" must match reaction "${card.reaction}"`);
  }
  if (card.reaction.includes("施法") && !card.type.includes("施法")) {
    fail(errors, `[${card.id}] reaction "${card.reaction}" implies a cast window, but type "${card.type}" does not include 施法`);
  }
  if (card.reaction.includes("爆发") && !card.type.includes("爆发")) {
    fail(errors, `[${card.id}] reaction "${card.reaction}" implies a burst window, but type "${card.type}" does not include 爆发`);
  }
  if (card.reaction.includes("强控") && !card.type.includes("硬控")) {
    fail(errors, `[${card.id}] reaction "${card.reaction}" implies a control window, but type "${card.type}" does not include 硬控`);
  }
  if (card.reaction.includes("关键位移") && !card.type.includes("位移")) {
    fail(errors, `[${card.id}] reaction "${card.reaction}" implies a movement window, but type "${card.type}" does not include 位移`);
  }
}

function checkCard(card: FrozenCard, errors: string[]) {
  requireString(errors, card, "id");
  requireString(errors, card, "name");
  requireString(errors, card, "type");
  requireString(errors, card, "faction");
  requireString(errors, card, "user");
  requireString(errors, card, "target");
  requireString(errors, card, "effect");
  requireString(errors, card, "reaction");
  requireString(errors, card, "note");
  requireString(errors, card, "category");
  requireString(errors, card, "cardKind");
  requireString(errors, card, "side");
  requireString(errors, card, "role");
  requireString(errors, card, "effectKey");
  requireString(errors, card, "source");

  if (typeof card.cost !== "number" || !Number.isInteger(card.cost) || card.cost < 0) {
    fail(errors, `[${card.id}] cost must be a non-negative integer`);
  }
  if (typeof card.playtestEnabled !== "boolean" || card.playtestEnabled !== true) {
    fail(errors, `[${card.id}] playtestEnabled must be true`);
  }
  if (!/^\d{3}-[a-z0-9-]+$/.test(card.id)) {
    fail(errors, `[${card.id}] id must match ###-slug format`);
  }
  if (typeof card.card_kind === "string" && card.card_kind !== card.cardKind) {
    fail(errors, `[${card.id}] card_kind "${card.card_kind}" must match cardKind "${card.cardKind}"`);
  }
  if (card.side && !SIDES.has(card.side)) {
    fail(errors, `[${card.id}] side "${card.side}" is not valid`);
  }
  if (!CARD_KINDS.has(card.cardKind as CardKindValue)) {
    fail(errors, `[${card.id}] cardKind "${card.cardKind}" is not valid`);
  }
  if (!CATEGORIES.has(card.category as CategoryValue)) {
    fail(errors, `[${card.id}] category "${card.category}" is not valid`);
  }
  if (!EFFECT_KEYS.has(card.effectKey as EffectKeyValue)) {
    fail(errors, `[${card.id}] effectKey "${card.effectKey}" is not recognized`);
  }

  const sideLabel = USERS_BY_SIDE[card.side as keyof typeof USERS_BY_SIDE];
  const factionLabel = FACTIONS_BY_SIDE[card.side as keyof typeof FACTIONS_BY_SIDE];
  if (sideLabel && card.cardKind === "hero" && card.user !== sideLabel) {
    fail(errors, `[${card.id}] hero user must be "${sideLabel}"`);
  }
  if (card.cardKind === "class") {
    const allowedUsers = CLASS_USERS_BY_SIDE[card.side as "blue" | "red"];
    if (!allowedUsers?.has(card.user)) {
      fail(errors, `[${card.id}] class user "${card.user}" must match side ${card.side}`);
    }
  }
  if (card.cardKind === "common" && !COMMON_USERS.has(card.user)) {
    fail(errors, `[${card.id}] common user "${card.user}" is not recognized`);
  }
  if (factionLabel && card.faction !== factionLabel) {
    fail(errors, `[${card.id}] faction must be "${factionLabel}" for side ${card.side}`);
  }

  if (card.cardKind === "hero") {
    if (card.category !== "英雄") fail(errors, `[${card.id}] hero cards must use category "英雄"`);
    if (card.side === "common") fail(errors, `[${card.id}] hero cards cannot use side "common"`);
    if (!HERO_ROLES.has(card.role as HeroRoleValue)) {
      fail(errors, `[${card.id}] hero role "${card.role}" is not valid`);
    }
    if (card.cost !== 0) fail(errors, `[${card.id}] hero cards must cost 0`);
    if (card.target !== "自己") fail(errors, `[${card.id}] hero cards must target 自己`);
    if (card.effectKey !== "hero") fail(errors, `[${card.id}] hero cards must use effectKey hero`);
    if (card.reaction !== "否") fail(errors, `[${card.id}] hero cards must have reaction "否"`);
  } else if (card.cardKind === "class") {
    if (card.category !== "职业") fail(errors, `[${card.id}] class cards must use category "职业"`);
    if (card.side === "common") fail(errors, `[${card.id}] class cards cannot use side "common"`);
    if (!HERO_ROLES.has(card.role as HeroRoleValue)) {
      fail(errors, `[${card.id}] class role "${card.role}" is not valid`);
    }
    if (card.user !== ROLE_NAMES[card.role]) {
      fail(errors, `[${card.id}] class user "${card.user}" must match role "${card.role}"`);
    }
  } else if (card.cardKind === "common") {
    if (card.category !== "通用") fail(errors, `[${card.id}] common cards must use category "通用"`);
    if (card.side !== "common") fail(errors, `[${card.id}] common cards must use side "common"`);
    if (card.role !== "common") fail(errors, `[${card.id}] common cards must use role "common"`);
  }

  if (card.reaction_window && card.reaction_window !== card.reaction) {
    fail(errors, `[${card.id}] reaction_window "${card.reaction_window}" must match reaction "${card.reaction}"`);
  }

  checkTypeHints(errors, card);
  checkReaction(errors, card);
}

function main() {
  const errors: string[] = [];
  if (cards.length !== 50) {
    fail(errors, `CARDS must contain exactly 50 entries, found ${cards.length}`);
  }

  const seenIds = new Set<string>();
  const seenNumbers = new Set<number>();

  for (const card of cards) {
    if (seenIds.has(card.id)) {
      fail(errors, `[${card.id}] duplicate card id`);
    }
    seenIds.add(card.id);

    const numericPrefix = Number.parseInt(card.id.slice(0, 3), 10);
    if (Number.isNaN(numericPrefix) || numericPrefix < 1 || numericPrefix > 50) {
      fail(errors, `[${card.id}] id prefix must be between 001 and 050`);
    } else if (seenNumbers.has(numericPrefix)) {
      fail(errors, `[${card.id}] duplicate numeric prefix ${numericPrefix.toString().padStart(3, "0")}`);
    } else {
      seenNumbers.add(numericPrefix);
    }

    checkCard(card, errors);
  }

  for (let i = 1; i <= 50; i += 1) {
    if (!seenNumbers.has(i)) {
      fail(errors, `missing card id prefix ${i.toString().padStart(3, "0")}`);
    }
  }

  if (errors.length > 0) {
    console.error(`Card schema validation failed with ${errors.length} issue(s):`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`Validated ${cards.length} cards successfully.`);
}

main();
