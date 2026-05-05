import type { InitialSetup, Side } from "./types";
import { HERO_DEFS } from "./heroes";

const BLUE_DECK = [
  "007-rogue-backstab",
  "008-rogue-wound-poison",
  "009-rogue-kick",
  "010-rogue-kidney-shot",
  "011-rogue-shadowstep",
  "012-rogue-shadow-dance",
  "013-mage-frostbolt",
  "014-mage-polymorph",
  "015-mage-counterspell",
  "016-mage-frost-nova",
  "017-mage-ice-barrier",
  "018-mage-pyroblast",
  "019-priest-flash-heal",
  "020-priest-power-word-shield",
  "021-priest-dispel-magic",
  "022-priest-psychic-scream",
  "023-priest-pain-suppression",
  "024-priest-shadow-word-death",
  "043-common-fake-cast",
  "044-common-pillar-dance",
  "045-common-focus-mark",
  "047-common-team-protection",
  "048-common-tactical-retreat",
  "050-common-hold-the-line",
];

const RED_DECK = [
  "025-warrior-heroic-strike",
  "026-warrior-mortal-strike",
  "027-warrior-pummel",
  "028-warrior-charge",
  "029-warrior-intimidating-shout",
  "030-warrior-recklessness",
  "031-warlock-corruption",
  "032-warlock-drain-life",
  "033-warlock-fear",
  "034-warlock-spell-lock",
  "035-warlock-curse-of-agony",
  "036-warlock-chaos-bolt",
  "037-druid-rejuvenation",
  "038-druid-swiftmend",
  "039-druid-cyclone",
  "040-druid-entangling-roots",
  "041-druid-barkskin",
  "042-druid-wild-charge",
  "043-common-fake-cast",
  "044-common-pillar-dance",
  "045-common-focus-mark",
  "047-common-team-protection",
  "048-common-tactical-retreat",
  "050-common-hold-the-line",
];

export function createInitialDeckList(side: Side) {
  return side === "blue" ? [...BLUE_DECK] : [...RED_DECK];
}

export function createInitialSetup(): InitialSetup {
  return {
    heroes: [...HERO_DEFS],
    blueDeck: createInitialDeckList("blue"),
    redDeck: createInitialDeckList("red"),
    blueOpeningHand: 5,
    redOpeningHand: 6,
  };
}
