import { CARDS, HERO_DEFS, type Side, type ZoneId } from "../../packages/data/src";
import type { Command, HeroState } from "../../packages/rules/src";
import type { AIEncounterDebugState, PlayerView } from "../onlineProtocol";

const ZONES: ZoneId[] = ["left", "center", "right"];
const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));
const HERO_BY_ID = Object.fromEntries(HERO_DEFS.map((hero) => [hero.id, hero]));

export type BattleHero = HeroState & {
  displayName: string;
  hpPercent: number;
  statusLabels: string[];
};

export type BattleHandCard = {
  id: string;
  name: string;
  role: string;
  type: string;
  cost: number;
  legalCommandCount: number;
};

export type BattleZoneView = {
  id: ZoneId;
  label: string;
  friendlyHeroes: BattleHero[];
  enemyHeroes: BattleHero[];
};

export type BattleViewModel = {
  roomCode: string;
  version: number;
  viewerSide: Side;
  opponentSide: Side;
  phase: PlayerView["state"]["phase"];
  round: number;
  currentPlayer: Side;
  winner: Side | null;
  zones: BattleZoneView[];
  hand: BattleHandCard[];
  opponent: {
    side: Side;
    handCount: number;
    deckCount: number;
    discardCount: number;
    visibleHandIds: string[];
  };
  legalCommands: Command[];
  aiPanel: {
    personaName: string;
    intentText: string;
    confidence: string;
    objectives: string[];
  };
};

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function zoneLabel(zone: ZoneId) {
  if (zone === "left") return "Left Pillar";
  if (zone === "center") return "Center";
  return "Right Pillar";
}

function heroStatusLabels(hero: HeroState) {
  return [
    hero.pendingHardControl > 0 ? "Hard CC" : null,
    hero.nextActivationNoMove ? "No move" : null,
    hero.nextActivationNoKeyMove ? "No key move" : null,
    hero.nextActivationNoResponse ? "No response" : null,
    hero.shield > 0 ? `Shield ${hero.shield}` : null,
    hero.healReduction > 0 ? "Mortal" : null,
    !hero.trinketAvailable ? "Trinket used" : null,
    !hero.alive ? "Down" : null,
  ].filter((label): label is string => Boolean(label));
}

function toBattleHero(hero: HeroState): BattleHero {
  return {
    ...hero,
    displayName: HERO_BY_ID[hero.id]?.name ?? hero.name ?? hero.id,
    hpPercent: Math.max(0, Math.min(100, Math.round((hero.hp / hero.maxHp) * 100))),
    statusLabels: heroStatusLabels(hero),
  };
}

function toHandCard(cardId: string, legalCommands: Command[]): BattleHandCard {
  const card = CARD_BY_ID[cardId];
  return {
    id: cardId,
    name: card?.name ?? cardId,
    role: card?.role ?? "unknown",
    type: card?.type ?? "unknown",
    cost: card?.cost ?? 0,
    legalCommandCount: legalCommands.filter((command) => command.type === "playCard" && command.cardId === cardId).length,
  };
}

export function buildBattleViewModel(view: PlayerView, ai: AIEncounterDebugState | null): BattleViewModel {
  const viewerSide = view.side;
  const opponentSide = opposite(viewerSide);
  const heroes = Object.values(view.state.heroes).map(toBattleHero);
  const latestIntent = ai?.intentHints.at(-1);

  return {
    roomCode: view.roomCode,
    version: view.version,
    viewerSide,
    opponentSide,
    phase: view.state.phase,
    round: view.state.round,
    currentPlayer: view.state.currentPlayer,
    winner: view.state.winner,
    zones: ZONES.map((zone) => ({
      id: zone,
      label: zoneLabel(zone),
      friendlyHeroes: heroes.filter((hero) => hero.side === viewerSide && hero.zone === zone),
      enemyHeroes: heroes.filter((hero) => hero.side === opponentSide && hero.zone === zone),
    })),
    hand: view.state.players[viewerSide].hand.map((cardId) => toHandCard(cardId, view.legalCommands)),
    opponent: {
      side: opponentSide,
      handCount: view.state.players[opponentSide].handCount,
      deckCount: view.state.players[opponentSide].deckCount,
      discardCount: view.state.players[opponentSide].discardCount,
      visibleHandIds: view.state.players[opponentSide].hand,
    },
    legalCommands: view.legalCommands,
    aiPanel: {
      personaName: ai?.persona.name ?? "AI Opponent",
      intentText: latestIntent?.text ?? "Reading the board.",
      confidence: latestIntent?.confidenceBand ?? "mid",
      objectives: ai?.objectives.map((objective) => objective.publicText) ?? [],
    },
  };
}
