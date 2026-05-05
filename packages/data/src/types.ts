export type Side = "blue" | "red";
export type ZoneId = "left" | "center" | "right";

export type HeroRole =
  | "rogue"
  | "mage"
  | "priest"
  | "warrior"
  | "warlock"
  | "druid";

export interface HeroDef {
  id: string;
  name: string;
  side: Side;
  role: HeroRole;
  faction: string;
  maxHp: number;
  defaultZone: ZoneId;
}

export interface CardDef {
  id: string;
  name: string;
  cost: number;
  type: string;
  faction: string;
  user: string;
  target: string;
  effect: string;
  reaction: string;
  note: string;
  category: string;
  cardKind: string;
  side: Side | "any" | "common";
  role: HeroRole | "any" | "common";
  reaction_window?: string;
  card_kind?: string;
  source?: string;
  effectKey: string;
  playtestEnabled: boolean;
}

export interface InitialSetup {
  heroes: HeroDef[];
  blueDeck: string[];
  redDeck: string[];
  blueOpeningHand: number;
  redOpeningHand: number;
}
