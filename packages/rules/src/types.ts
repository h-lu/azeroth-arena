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

export interface GameEvent {
  type: string;
  payload: Record<string, unknown>;
}

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
