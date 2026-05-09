import type { CardDef, HeroDef, HeroRole, Side, ZoneId } from "../../data/src";

export type GamePhase = "main" | "reaction" | "between-rounds" | "finished";
export type ReactionWindowKind = "spell" | "burst" | "control" | "movement";
export type ActivationStage = "idle" | "active" | "finished";

export interface CardState {
  id: string;
  cardId: string;
  ownerSide: Side;
  zone: "deck" | "hand" | "discard" | "cooldown";
  exhausted: boolean;
}

export interface HeroState {
  id: string;
  name: string;
  side: Side;
  role: HeroRole;
  faction: string;
  maxHp: number;
  hp: number;
  shield: number;
  shieldExpiresAtRound: number;
  zone: ZoneId;
  decay: number;
  activatedThisRound: boolean;
  alive: boolean;
  trinketAvailable: boolean;
  pendingHardControl: number;
  hardControlSourceId: string | null;
  nextActivationNoMove: boolean;
  nextActivationNoKeyMove: boolean;
  nextActivationNoResponse: boolean;
  nextMeleeDamageBonusTargetId: string | null;
  nextMeleeDamageBonusAmount: number;
  healReduction: number;
  damageTakenThisRound: boolean;
}

export interface PlayerState {
  side: Side;
  deck: string[];
  hand: string[];
  discard: string[];
  focusTargetId: string | null;
  focusTargetSelectedThisRound: boolean;
  focusBonusUsed: boolean;
  focusAvailable: number;
  cooldowns: CooldownState[];
}

export interface CooldownState {
  cardId: string;
  sourceHeroId: string;
  usedRound: number;
  usedUntilRound: number;
  reason: "interrupt";
}

export interface ActivationState {
  heroId: string;
  moved: boolean;
  playedCard: boolean;
}

export interface ReactionWindow {
  id: string;
  kind: ReactionWindowKind;
  sourceSide: Side;
  sourceHeroId: string;
  sourceCardId: string;
  targetIds: string[];
  toZone?: ZoneId;
  revealedCardId?: string;
  stage: "enemy" | "source";
  interrupted: boolean;
  damageBonus: number;
  damageReduction: number;
  closed: boolean;
}

export interface EndOfRoundEffect {
  type: "damage";
  sourceSide: Side;
  sourceHeroId: string;
  sourceCardId: string;
  targetId: string;
  amount: number;
}

export interface GameEventPayloadByType {
  "activation-end": { playerId: Side };
  activate: { heroId: string };
  "card-drawn": { playerId: Side; amount: number; handCount: number; deckCount: number };
  "card-played": { heroId: string; cardId: string; targets: string[]; toZone?: ZoneId; revealedCardId?: string };
  cleanse: { heroId?: string; cardId?: string; targetId?: string; nonWindow?: boolean };
  "control-applied": { targetId: string; sourceId: string; control: "hard" | "soft"; short?: boolean };
  "control-downgraded": { targetId: string; sourceId: string };
  "control-immune": { targetId: string; sourceId: string; control?: "soft" };
  control: { cardId: string; targetIds: string[]; kind: "soft" };
  "cooldown-start": CooldownState;
  damage: { cardId: string; targetId: string; amount: number; reactionDamageReduction?: number };
  debuff: { cardId: string; targetId: string; effect: "damage-heal-reduction"; damage: number; amount: number };
  discard: { playerId: Side; cardIds: string[]; handSize: number };
  "discard-auto": { playerId: Side; cardIds: string[]; handSize: number };
  dispel: { cardId: string; targetId: string };
  "end-round-damage": { cardId: string; targetId: string; amount: number };
  "fake-cast": { cardId: string; revealedCardId?: string };
  "fake-cast-success": { cardId: string; revealedCardId?: string; by: string; drew: number };
  focus: { cardId: string; targetId: string };
  "focus-selected": { playerId: Side; targetId: string; round: number };
  "hard-control-consumed": { heroId: string };
  heal: { cardId: string; targetId: string; amount: number };
  "inline-defense": { cardId: string; heroId: string; targetId: string; sourceCardId: string; amount: number };
  interrupted: { cardId: string; by: string };
  knockout: { targetId: string; winner: Side };
  move: { heroId: string; toZone: ZoneId; cardId?: string };
  "reaction-defense": { cardId: string; amount: number };
  "reaction-opened": {
    windowId: string;
    kind: ReactionWindowKind;
    sourceSide: Side;
    sourceHeroId: string;
    sourceCardId: string;
    targetIds: string[];
    toZone?: ZoneId;
    revealedCardId?: string;
  };
  "reaction-pass": { playerId: Side; heroId: string; windowId: string };
  "reaction-play": { heroId: string; cardId: string; windowId: string };
  "reaction-resolved": { windowId: string; interrupted: boolean };
  "round-end": { round: number };
  "round-start": { round: number };
  shield: { cardId: string; targetId?: string; targetIds?: string[]; amount: number };
  "turn-pass": { from: Side; to: Side };
  trinket: { heroId: string; windowId?: string; nonWindow?: boolean };
  unimplemented: { cardId: string };
}

export type GameEventType = keyof GameEventPayloadByType;

export type GameEvent = {
  [Type in GameEventType]: {
    type: Type;
    payload: GameEventPayloadByType[Type];
  };
}[GameEventType];

export interface GameState {
  round: number;
  phase: GamePhase;
  currentPlayer: Side;
  startingPlayer: Side;
  suppression: number;
  winner: Side | null;
  endedThisRound: Record<Side, boolean>;
  endOfRoundEffects: EndOfRoundEffect[];
  heroes: Record<string, HeroState>;
  players: Record<Side, PlayerState>;
  cardById: Record<string, CardDef>;
  activation: ActivationState | null;
  pendingReaction: ReactionWindow | null;
  log: GameEvent[];
}

export type Command =
  | { type: "startTurn"; playerId: Side }
  | { type: "endTurn"; playerId: Side }
  | { type: "pass"; playerId: Side }
  | { type: "activateHero"; playerId: Side; heroId: string }
  | { type: "moveHero"; playerId: Side; heroId: string; toZone: ZoneId }
  | {
      type: "playCard";
      playerId: Side;
      sourceHeroId: string;
      cardId: string;
      targetIds: string[];
      toZone?: ZoneId;
      revealedCardId?: string;
      defenseSourceHeroId?: string;
      defenseCardId?: string;
      defenseTargetId?: string;
    }
  | { type: "resolveReaction"; playerId: Side; sourceHeroId: string; cardId?: string; targetIds?: string[]; useTrinket?: boolean; pass?: boolean }
  | { type: "selectFocusTarget"; playerId: Side; targetId: string }
  | { type: "useTrinket"; playerId: Side; heroId: string; cardId?: string }
  | { type: "discardCards"; playerId: Side; cardIds: string[] };

export interface ApplyResult {
  state: GameState;
  events: GameEvent[];
  errors: string[];
}

export interface HeroSeed extends HeroDef {
  hp: number;
}
