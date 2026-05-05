import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SOURCE = resolve("../../azeroth-arena-card-images/cards.json");
const OUTPUT = resolve("packages/data/src/cards.ts");

const effectKeyById = {
  "001-hero-rogue": "hero",
  "002-hero-mage": "hero",
  "003-hero-priest": "hero",
  "004-hero-warrior": "hero",
  "005-hero-warlock": "hero",
  "006-hero-druid": "hero",
  "007-rogue-backstab": "damage",
  "008-rogue-wound-poison": "damage-heal-reduction",
  "009-rogue-kick": "interrupt",
  "010-rogue-kidney-shot": "hard-control",
  "011-rogue-shadowstep": "key-move",
  "012-rogue-shadow-dance": "burst-damage",
  "013-mage-frostbolt": "spell-damage-soft-control",
  "014-mage-polymorph": "hard-control",
  "015-mage-counterspell": "interrupt",
  "016-mage-frost-nova": "soft-control",
  "017-mage-ice-barrier": "damage-reduction",
  "018-mage-pyroblast": "burst-damage",
  "019-priest-flash-heal": "heal",
  "020-priest-power-word-shield": "shield",
  "021-priest-dispel-magic": "dispel",
  "022-priest-psychic-scream": "hard-control",
  "023-priest-pain-suppression": "damage-reduction",
  "024-priest-shadow-word-death": "damage",
  "025-warrior-heroic-strike": "damage",
  "026-warrior-mortal-strike": "damage-heal-reduction",
  "027-warrior-pummel": "interrupt",
  "028-warrior-charge": "key-move",
  "029-warrior-intimidating-shout": "hard-control",
  "030-warrior-recklessness": "burst-damage",
  "031-warlock-corruption": "dot",
  "032-warlock-drain-life": "spell-damage-heal",
  "033-warlock-fear": "hard-control",
  "034-warlock-spell-lock": "interrupt",
  "035-warlock-curse-of-agony": "debuff",
  "036-warlock-chaos-bolt": "burst-damage",
  "037-druid-rejuvenation": "heal",
  "038-druid-swiftmend": "heal",
  "039-druid-cyclone": "hard-control",
  "040-druid-entangling-roots": "soft-control",
  "041-druid-barkskin": "damage-reduction",
  "042-druid-wild-charge": "key-move-shield",
  "043-common-fake-cast": "fake-cast",
  "044-common-pillar-dance": "key-move-shield",
  "045-common-focus-mark": "focus-mark",
  "046-common-arena-insignia": "cleanse-control",
  "047-common-team-protection": "damage-reduction",
  "048-common-tactical-retreat": "key-move",
  "049-common-pressure-footwork": "soft-control",
  "050-common-hold-the-line": "shield",
};

const textToBool = (value) => value !== "否";

const source = JSON.parse(await readFile(SOURCE, "utf8"));
const cards = source.map((card) => ({
  ...card,
  reaction: card.reaction_window,
  note: card.note ?? "",
  category: card.category ?? "",
  cardKind: card.card_kind ?? "",
  side: card.side ?? "any",
  role: card.role ?? "any",
  effectKey: effectKeyById[card.id] ?? "unimplemented",
  playtestEnabled: true,
}));

const header = `import type { CardDef } from "./types";\n\n`;
const body = `export const CARDS: CardDef[] = ${JSON.stringify(cards, null, 2)};\n`;

await writeFile(OUTPUT, header + body);
console.log(`wrote ${OUTPUT} (${cards.length} cards)`);
