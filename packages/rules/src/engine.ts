import { CARDS, HERO_DEFS, createInitialSetup, isAdjacentZone } from "../../data/src";
import type { CardDef, HeroRole, Side, ZoneId } from "../../data/src";
import type { ActivationState, ApplyResult, Command, GameEvent, GameState, HeroSeed, HeroState, PlayerState, ReactionWindow, ReactionWindowKind } from "./types";

const CARD_BY_ID = Object.fromEntries(CARDS.map((card) => [card.id, card]));

const CONTROL_WINDOW_BY_CARD: Record<string, ReactionWindowKind> = {
  "010-rogue-kidney-shot": "control",
  "012-rogue-shadow-dance": "burst",
  "013-mage-frostbolt": "spell",
  "014-mage-polymorph": "spell",
  "018-mage-pyroblast": "spell",
  "019-priest-flash-heal": "spell",
  "022-priest-psychic-scream": "control",
  "029-warrior-intimidating-shout": "control",
  "030-warrior-recklessness": "burst",
  "032-warlock-drain-life": "spell",
  "033-warlock-fear": "spell",
  "035-warlock-curse-of-agony": "spell",
  "036-warlock-chaos-bolt": "spell",
  "039-druid-cyclone": "spell",
  "040-druid-entangling-roots": "spell",
  "043-common-fake-cast": "spell",
  "044-common-pillar-dance": "movement",
  "048-common-tactical-retreat": "movement",
  "011-rogue-shadowstep": "movement",
  "028-warrior-charge": "movement",
  "042-druid-wild-charge": "movement",
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function heroId(side: Side, role: HeroRole) {
  return `${side}-${role}`;
}

function makeHeroState(seed: HeroSeed): HeroState {
  return {
    id: seed.id,
    name: seed.name,
    side: seed.side,
    role: seed.role,
    faction: seed.faction,
    maxHp: seed.maxHp,
    hp: seed.hp,
    shield: 0,
    shieldExpiresAtRound: 0,
    zone: seed.defaultZone,
    decay: 0,
    activatedThisRound: false,
    alive: true,
    trinketAvailable: true,
    pendingHardControl: 0,
    hardControlSourceId: null,
    nextActivationNoMove: false,
    nextActivationNoKeyMove: false,
    nextActivationNoResponse: false,
    nextMeleeDamageBonusTargetId: null,
    nextMeleeDamageBonusAmount: 0,
    healReduction: 0,
    damageTakenThisRound: false,
  };
}

function makePlayerState(side: Side, deck: string[], openingHandSize: number): PlayerState {
  const hand = deck.slice(0, openingHandSize);
  return {
    side,
    deck: deck.slice(openingHandSize),
    hand,
    discard: [],
    focusTargetId: null,
    focusTargetSelectedThisRound: false,
    focusBonusUsed: false,
    focusAvailable: 6,
    cooldowns: [],
  };
}

function createHeroSeeds() {
  return HERO_DEFS.map((hero) => ({ ...hero, hp: hero.maxHp }));
}

function buildInitialState(): GameState {
  const setup = createInitialSetup();
  const heroes = Object.fromEntries(createHeroSeeds().map((seed) => [seed.id, makeHeroState(seed)]));
  const players = {
    blue: makePlayerState("blue", setup.blueDeck, setup.blueOpeningHand),
    red: makePlayerState("red", setup.redDeck, setup.redOpeningHand),
  } satisfies Record<Side, PlayerState>;

  const state: GameState = {
    round: 1,
    phase: "main",
    currentPlayer: "blue",
    startingPlayer: "blue",
    suppression: 0,
    winner: null,
    endedThisRound: { blue: false, red: false },
    endOfRoundEffects: [],
    heroes,
    players,
    cardById: { ...CARD_BY_ID },
    activation: null,
    pendingReaction: null,
    log: [],
  };

  beginRound(state, false);
  return state;
}

function getPlayer(state: GameState, side: Side) {
  return state.players[side];
}

function getHero(state: GameState, id: string) {
  const hero = state.heroes[id];
  if (!hero) {
    throw new Error(`unknown hero: ${id}`);
  }
  return hero;
}

function sameTeamHeroIds(state: GameState, side: Side) {
  return Object.values(state.heroes).filter((hero) => hero.side === side && hero.alive);
}

function enemyHeroIds(state: GameState, side: Side) {
  return Object.values(state.heroes).filter((hero) => hero.side !== side && hero.alive);
}

function zonesMatch(source: HeroState, target: HeroState) {
  return source.zone === target.zone;
}

function canTargetSameOrAdjacent(source: HeroState, target: HeroState) {
  return source.zone === target.zone || isAdjacentZone(source.zone, target.zone);
}

function spendFocus(state: GameState, side: Side, amount: number) {
  const player = getPlayer(state, side);
  if (player.focusAvailable < amount) {
    throw new Error(`not enough focus: need ${amount}, have ${player.focusAvailable}`);
  }
  player.focusAvailable -= amount;
}

function drawCards(state: GameState, side: Side, amount: number) {
  const player = getPlayer(state, side);
  for (let i = 0; i < amount; i += 1) {
    const next = player.deck.shift();
    if (!next) break;
    player.hand.push(next);
  }
}

function clearRoundFlags(state: GameState) {
  state.endedThisRound = { blue: false, red: false };
  state.endOfRoundEffects = [];
  for (const hero of Object.values(state.heroes)) {
    hero.activatedThisRound = false;
    hero.healReduction = 0;
    hero.damageTakenThisRound = false;
    hero.nextMeleeDamageBonusTargetId = null;
    hero.nextMeleeDamageBonusAmount = 0;
    if (hero.shieldExpiresAtRound < state.round) {
      hero.shield = 0;
      hero.shieldExpiresAtRound = 0;
    }
  }
  for (const player of Object.values(state.players)) {
    player.focusAvailable = 6;
    player.focusBonusUsed = false;
    player.focusTargetSelectedThisRound = false;
    player.cooldowns = player.cooldowns.filter((cooldown) => state.round <= cooldown.usedUntilRound);
    const enemy = enemyHeroIds(state, player.side)[0];
    player.focusTargetId = enemy?.id ?? null;
  }
}

function beginRound(state: GameState, drawOpening: boolean) {
  clearRoundFlags(state);
  state.suppression = Math.min(Math.max(state.round - 5, 0), 3);
  if (drawOpening) {
    drawCards(state, "blue", 2);
    drawCards(state, "red", 2);
  }
  if (state.round === 1) {
    for (const hero of Object.values(state.heroes)) {
      hero.shield = 2;
      hero.shieldExpiresAtRound = 1;
    }
  }
}

function openReactionWindow(
  state: GameState,
  kind: ReactionWindowKind,
  sourceSide: Side,
  sourceHeroId: string,
  sourceCardId: string,
  targetIds: string[],
  opts: { toZone?: ZoneId; revealedCardId?: string } = {},
) {
  const window: ReactionWindow = {
    id: `reaction-${state.round}-${state.log.length + 1}`,
    kind,
    sourceSide,
    sourceHeroId,
    sourceCardId,
    targetIds,
    toZone: opts.toZone,
    revealedCardId: opts.revealedCardId,
    stage: "enemy",
    interrupted: false,
    damageBonus: 0,
    damageReduction: 0,
    closed: false,
  };
  state.pendingReaction = window;
  state.phase = "reaction";
  return window;
}

function closeReactionWindow(state: GameState) {
  if (state.pendingReaction) {
    state.pendingReaction.closed = true;
  }
  state.pendingReaction = null;
  state.phase = "main";
}

function record(state: GameState, type: string, payload: Record<string, unknown>) {
  const event: GameEvent = { type, payload };
  state.log.push(event);
  return event;
}

function cardFromHand(state: GameState, side: Side, cardId: string) {
  const player = getPlayer(state, side);
  const idx = player.hand.indexOf(cardId);
  if (idx < 0) {
    throw new Error(`card ${cardId} is not in hand`);
  }
  return { player, idx };
}

function removeCardFromHand(state: GameState, side: Side, cardId: string) {
  const player = getPlayer(state, side);
  const index = player.hand.indexOf(cardId);
  if (index < 0) {
    throw new Error(`card ${cardId} not in hand`);
  }
  player.hand.splice(index, 1);
}

function discardCard(state: GameState, side: Side, cardId: string) {
  getPlayer(state, side).discard.push(cardId);
}

function isCardOnCooldown(state: GameState, side: Side, cardId: string) {
  return getPlayer(state, side).cooldowns.some((cooldown) => cooldown.cardId === cardId && state.round <= cooldown.usedUntilRound);
}

function assertCardNotOnCooldown(state: GameState, side: Side, cardId: string) {
  if (isCardOnCooldown(state, side, cardId)) {
    throw new Error(`card ${cardId} is on cooldown`);
  }
}

function addInterruptCooldown(state: GameState, side: Side, cardId: string, sourceHeroId: string) {
  const player = getPlayer(state, side);
  player.cooldowns = player.cooldowns.filter((cooldown) => cooldown.cardId !== cardId);
  const cooldown = {
    cardId,
    sourceHeroId,
    usedRound: state.round,
    usedUntilRound: state.round + 1,
    reason: "interrupt" as const,
  };
  player.cooldowns.push(cooldown);
  record(state, "cooldown-start", cooldown);
}

function isSpellWindow(card: CardDef) {
  return CONTROL_WINDOW_BY_CARD[card.id] === "spell";
}

function isBurstWindow(card: CardDef) {
  return CONTROL_WINDOW_BY_CARD[card.id] === "burst";
}

function isControlWindow(card: CardDef) {
  return CONTROL_WINDOW_BY_CARD[card.id] === "control";
}

function isMovementWindow(card: CardDef) {
  return CONTROL_WINDOW_BY_CARD[card.id] === "movement";
}

function cardKind(card: CardDef) {
  return card.effectKey;
}

function isBurstCard(card: CardDef) {
  return card.type.includes("爆发");
}

function isReactionOnlyCard(card: CardDef) {
  return card.type.includes("反应") && card.id !== "048-common-tactical-retreat";
}

function isMeleeDamageCard(card: CardDef) {
  return [
    "007-rogue-backstab",
    "008-rogue-wound-poison",
    "012-rogue-shadow-dance",
    "025-warrior-heroic-strike",
    "026-warrior-mortal-strike",
    "030-warrior-recklessness",
  ].includes(card.id);
}

function consumeMeleeBonus(sourceHero: HeroState, targetId: string, card: CardDef) {
  if (!isMeleeDamageCard(card) || sourceHero.nextMeleeDamageBonusTargetId !== targetId) {
    return 0;
  }
  const bonus = sourceHero.nextMeleeDamageBonusAmount;
  sourceHero.nextMeleeDamageBonusTargetId = null;
  sourceHero.nextMeleeDamageBonusAmount = 0;
  return bonus;
}

function applyDamage(state: GameState, sourceSide: Side, sourceCardId: string, sourceHeroId: string, targetId: string, amount: number, bonus = 0, reduction = 0) {
  const target = getHero(state, targetId);
  if (!target.alive) return 0;
  const player = getPlayer(state, sourceSide);
  const focusBonus = player.focusTargetId === target.id && !player.focusBonusUsed ? 1 : 0;
  const total = Math.max(0, amount + bonus + focusBonus - reduction);
  if (focusBonus > 0) {
    player.focusBonusUsed = true;
  }
  let remaining = total;
  if (target.shield > 0) {
    const absorbed = Math.min(target.shield, remaining);
    target.shield -= absorbed;
    remaining -= absorbed;
  }
  if (remaining > 0) {
    target.hp = Math.max(0, target.hp - remaining);
    target.damageTakenThisRound = true;
  }
  if (target.hp <= 0) {
    target.alive = false;
    state.winner = sourceSide;
    state.phase = "finished";
    record(state, "knockout", { targetId, winner: sourceSide });
  }
  return remaining;
}

function applyHealing(state: GameState, targetId: string, amount: number) {
  const target = getHero(state, targetId);
  if (!target.alive) return 0;
  const actual = Math.max(0, amount - state.suppression - target.healReduction);
  target.hp = Math.min(target.maxHp, target.hp + actual);
  return actual;
}

function applyShield(state: GameState, targetId: string, amount: number) {
  const target = getHero(state, targetId);
  if (!target.alive) return 0;
  const actual = Math.max(0, amount - state.suppression);
  target.shield += actual;
  target.shieldExpiresAtRound = state.round;
  return actual;
}

function setHealReduction(state: GameState, targetId: string, amount: number) {
  const target = getHero(state, targetId);
  target.healReduction = Math.max(target.healReduction, amount);
}

function setSoftControl(state: GameState, targetId: string, opts: { noMove?: boolean; noKeyMove?: boolean; noResponse?: boolean }) {
  const target = getHero(state, targetId);
  if (opts.noMove) target.nextActivationNoMove = true;
  if (opts.noKeyMove) target.nextActivationNoKeyMove = true;
  if (opts.noResponse) target.nextActivationNoResponse = true;
}

function applySoftControl(state: GameState, sourceId: string, targetId: string, opts: { noMove?: boolean; noKeyMove?: boolean; noResponse?: boolean }) {
  const target = getHero(state, targetId);
  if (target.decay >= 2) {
    record(state, "control-immune", { targetId, sourceId, control: "soft" });
    return { applied: false, short: false };
  }
  const short = target.decay === 1;
  target.decay = Math.min(2, target.decay + 1);
  setSoftControl(state, targetId, opts);
  record(state, "control-applied", { targetId, sourceId, control: "soft", short });
  return { applied: true, short };
}

function applyHardControl(state: GameState, sourceId: string, targetId: string, hard = true) {
  const target = getHero(state, targetId);
  if (target.decay >= 2) {
    record(state, "control-immune", { targetId, sourceId });
    return { applied: false, downgraded: false };
  }
  if (hard && target.decay === 1) {
    target.decay = 2;
    setSoftControl(state, targetId, { noResponse: true });
    record(state, "control-downgraded", { targetId, sourceId });
    return { applied: true, downgraded: true };
  }
  if (hard) {
    target.pendingHardControl = 1;
    target.hardControlSourceId = sourceId;
    target.decay += 1;
    record(state, "control-applied", { targetId, sourceId, control: "hard" });
    return { applied: true, downgraded: false };
  }
  const result = applySoftControl(state, sourceId, targetId, { noMove: true });
  return { applied: result.applied, downgraded: false };
}

function fallbackAdjacentZone(zone: ZoneId) {
  return zone === "center" ? "left" : "center";
}

function resolveAdjacentMoveTarget(target: HeroState, toZone?: ZoneId) {
  const destination = toZone ?? fallbackAdjacentZone(target.zone);
  if (!isAdjacentZone(target.zone, destination)) {
    throw new Error("destination must be adjacent");
  }
  return destination;
}

function moveHeroToZone(state: GameState, hero: HeroState, toZone: ZoneId, cardId: string) {
  if (!isAdjacentZone(hero.zone, toZone)) {
    throw new Error("destination must be adjacent");
  }
  hero.zone = toZone;
  record(state, "move", { heroId: hero.id, toZone, cardId });
}

function isOrdinaryDamageCard(card: CardDef) {
  return [
    "007-rogue-backstab",
    "008-rogue-wound-poison",
    "024-priest-shadow-word-death",
    "025-warrior-heroic-strike",
    "026-warrior-mortal-strike",
    "031-warlock-corruption",
  ].includes(card.id);
}

function consumeControlAfterActivation(state: GameState, heroId: string) {
  const hero = getHero(state, heroId);
  if (hero.pendingHardControl > 0) {
    hero.pendingHardControl = 0;
    hero.hardControlSourceId = null;
    record(state, "hard-control-consumed", { heroId });
  }
  hero.decay = Math.max(0, hero.decay - 1);
  hero.nextActivationNoMove = false;
  hero.nextActivationNoKeyMove = false;
  hero.nextActivationNoResponse = false;
}

function determineCardTargets(state: GameState, sourceHero: HeroState, card: CardDef, targetIds: string[]) {
  const targets = targetIds.map((id) => getHero(state, id));
  if (targetIds.length === 0 && card.effectKey !== "fake-cast") {
    throw new Error(`card ${card.id} requires targets`);
  }
  for (const target of targets) {
    if (!target.alive) throw new Error("target is dead");
  }
  const requireOne = () => {
    if (targetIds.length !== 1) throw new Error(`card ${card.id} requires one target`);
  };
  const requireOneOrTwo = () => {
    if (targetIds.length < 1 || targetIds.length > 2) throw new Error(`card ${card.id} requires 1-2 targets`);
  };
  const requireEnemy = (target: HeroState) => {
    if (target.side === sourceHero.side) throw new Error("illegal enemy target");
  };
  const requireFriendly = (target: HeroState) => {
    if (target.side !== sourceHero.side) throw new Error("illegal friendly target");
  };
  const requireSame = (target: HeroState) => {
    if (!zonesMatch(sourceHero, target)) throw new Error("target must be in the same zone");
  };
  const requireSameOrAdjacent = (target: HeroState) => {
    if (!canTargetSameOrAdjacent(sourceHero, target)) throw new Error("target must be same or adjacent zone");
  };
  switch (card.id) {
    case "017-mage-ice-barrier":
    case "046-common-arena-insignia":
      requireOne();
      if (targets[0].id !== sourceHero.id) throw new Error("card targets self");
      return targets;
    case "020-priest-power-word-shield":
    case "019-priest-flash-heal":
    case "037-druid-rejuvenation":
    case "038-druid-swiftmend":
    case "023-priest-pain-suppression":
    case "047-common-team-protection":
      requireOne();
      requireFriendly(targets[0]);
      requireSameOrAdjacent(targets[0]);
      return targets;
    case "041-druid-barkskin":
      requireOne();
      requireFriendly(targets[0]);
      if (targets[0].id !== sourceHero.id) requireSame(targets[0]);
      return targets;
    case "021-priest-dispel-magic":
      requireOne();
      requireSameOrAdjacent(targets[0]);
      return targets;
    case "044-common-pillar-dance":
      requireOne();
      requireFriendly(targets[0]);
      requireSame(targets[0]);
      return targets;
    case "050-common-hold-the-line":
      requireOneOrTwo();
      for (const target of targets) {
        requireFriendly(target);
        requireSame(target);
      }
      return targets;
    case "043-common-fake-cast":
      if (targetIds.length !== 0) throw new Error("fake cast takes no target");
      return targets;
    case "045-common-focus-mark":
      requireOne();
      requireEnemy(targets[0]);
      return targets;
    case "011-rogue-shadowstep":
    case "028-warrior-charge":
      requireOne();
      requireEnemy(targets[0]);
      if (!isAdjacentZone(sourceHero.zone, targets[0].zone)) throw new Error("target must be adjacent");
      return targets;
    case "042-druid-wild-charge":
      requireOne();
      requireFriendly(targets[0]);
      if (targets[0].id !== sourceHero.id) requireSame(targets[0]);
      return targets;
    case "048-common-tactical-retreat":
      requireOne();
      requireFriendly(targets[0]);
      if (getPlayer(state, opposite(sourceHero.side)).focusTargetId !== targets[0].id) {
        throw new Error("tactical retreat target must be the enemy focus target");
      }
      return targets;
    case "007-rogue-backstab":
    case "008-rogue-wound-poison":
    case "010-rogue-kidney-shot":
    case "012-rogue-shadow-dance":
    case "016-mage-frost-nova":
    case "022-priest-psychic-scream":
    case "025-warrior-heroic-strike":
    case "026-warrior-mortal-strike":
    case "029-warrior-intimidating-shout":
    case "030-warrior-recklessness":
    case "049-common-pressure-footwork":
      requireOneOrTwo();
      if (card.id !== "016-mage-frost-nova" && targetIds.length !== 1) throw new Error(`card ${card.id} requires one target`);
      for (const target of targets) {
        requireEnemy(target);
        requireSame(target);
      }
      return targets;
    case "013-mage-frostbolt":
    case "014-mage-polymorph":
    case "018-mage-pyroblast":
    case "024-priest-shadow-word-death":
    case "031-warlock-corruption":
    case "032-warlock-drain-life":
    case "033-warlock-fear":
    case "035-warlock-curse-of-agony":
    case "036-warlock-chaos-bolt":
    case "039-druid-cyclone":
    case "040-druid-entangling-roots":
      requireOne();
      requireEnemy(targets[0]);
      requireSameOrAdjacent(targets[0]);
      return targets;
    case "009-rogue-kick":
    case "015-mage-counterspell":
    case "027-warrior-pummel":
    case "034-warlock-spell-lock":
      requireOne();
      requireEnemy(targets[0]);
      return targets;
    default:
      return targets;
  }
}

function cardCost(card: CardDef) {
  return card.cost;
}

function canUseCardWithHero(card: CardDef, hero: HeroState) {
  return card.role === "any" || card.role === "common" || card.role === hero.role || card.user === "任意英雄" || card.side === "common";
}

function legalCardInHand(state: GameState, side: Side, cardId: string) {
  return getPlayer(state, side).hand.includes(cardId);
}

function hasUsableSpellInHand(state: GameState, side: Side, hero: HeroState) {
  return getPlayer(state, side).hand.some((cardId) => {
    const card = CARD_BY_ID[cardId];
    return Boolean(card && card.id !== "043-common-fake-cast" && card.type.includes("施法") && canUseCardWithHero(card, hero));
  });
}

function chooseFakeCastReveal(state: GameState, side: Side, hero: HeroState, revealedCardId?: string) {
  const hand = getPlayer(state, side).hand;
  const cardId =
    revealedCardId ??
    hand.find((candidate) => {
      const card = CARD_BY_ID[candidate];
      return Boolean(card && card.id !== "043-common-fake-cast" && card.type.includes("施法") && canUseCardWithHero(card, hero));
    });
  if (!cardId) throw new Error("fake cast requires a usable spell card in hand");
  const card = CARD_BY_ID[cardId];
  if (!hand.includes(cardId)) throw new Error(`revealed card ${cardId} is not in hand`);
  if (!card || card.id === "043-common-fake-cast" || !card.type.includes("施法") || !canUseCardWithHero(card, hero)) {
    throw new Error("fake cast revealed card must be a usable spell");
  }
  return cardId;
}

function applyCardEffect(state: GameState, card: CardDef, sourceHero: HeroState, targets: HeroState[], opts: { toZone?: ZoneId; revealedCardId?: string; damageReduction?: number } = {}) {
  const events: GameEvent[] = [];
  const sourceSide = sourceHero.side;
  const damageReduction = opts.damageReduction ?? 0;
  switch (card.id) {
    case "007-rogue-backstab": {
      const dealt = applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 2, consumeMeleeBonus(sourceHero, targets[0].id, card), damageReduction);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 2 }));
      break;
    }
    case "008-rogue-wound-poison": {
      const dealt = applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 1, consumeMeleeBonus(sourceHero, targets[0].id, card), damageReduction);
      setHealReduction(state, targets[0].id, 2);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 1 }));
      break;
    }
    case "010-rogue-kidney-shot":
    case "014-mage-polymorph":
    case "022-priest-psychic-scream":
    case "029-warrior-intimidating-shout":
    case "033-warlock-fear":
    case "039-druid-cyclone": {
      const result = applyHardControl(state, sourceHero.id, targets[0].id, true);
      if (card.id === "022-priest-psychic-scream" && result.applied && !result.downgraded) {
        const destination = resolveAdjacentMoveTarget(targets[0], opts.toZone);
        moveHeroToZone(state, targets[0], destination, card.id);
      }
      break;
    }
    case "011-rogue-shadowstep": {
      sourceHero.zone = targets[0].zone;
      sourceHero.nextMeleeDamageBonusTargetId = targets[0].id;
      sourceHero.nextMeleeDamageBonusAmount = 1;
      sourceHero.nextActivationNoMove = false;
      events.push(record(state, "move", { heroId: sourceHero.id, toZone: sourceHero.zone, cardId: card.id }));
      break;
    }
    case "012-rogue-shadow-dance":
    case "018-mage-pyroblast":
    case "030-warrior-recklessness":
    case "036-warlock-chaos-bolt": {
      const damage = card.id === "012-rogue-shadow-dance" || card.id === "030-warrior-recklessness" ? 3 : 5;
      const dealt = applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, damage, consumeMeleeBonus(sourceHero, targets[0].id, card));
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || damage }));
      break;
    }
    case "013-mage-frostbolt": {
      const dealt = applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 2);
      applySoftControl(state, sourceHero.id, targets[0].id, { noMove: true });
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 2 }));
      break;
    }
    case "016-mage-frost-nova":
    case "040-druid-entangling-roots":
    case "049-common-pressure-footwork": {
      for (const target of targets) {
        applySoftControl(state, sourceHero.id, target.id, { noMove: true, noKeyMove: card.id === "040-druid-entangling-roots" });
      }
      events.push(record(state, "control", { cardId: card.id, targetIds: targets.map((t) => t.id), kind: "soft" }));
      break;
    }
    case "017-mage-ice-barrier":
      applyShield(state, targets[0].id, 4);
      targets[0].nextActivationNoMove = true;
      events.push(record(state, "shield", { cardId: card.id, targetId: targets[0].id, amount: 4 }));
      break;
    case "019-priest-flash-heal": {
      const healed = applyHealing(state, targets[0].id, 4);
      events.push(record(state, "heal", { cardId: card.id, targetId: targets[0].id, amount: healed }));
      break;
    }
    case "020-priest-power-word-shield":
      applyShield(state, targets[0].id, 2);
      events.push(record(state, "shield", { cardId: card.id, targetId: targets[0].id, amount: 2 }));
      break;
    case "021-priest-dispel-magic":
      targets[0].pendingHardControl = 0;
      targets[0].hardControlSourceId = null;
      targets[0].nextActivationNoMove = false;
      targets[0].nextActivationNoKeyMove = false;
      targets[0].nextActivationNoResponse = false;
      targets[0].healReduction = 0;
      events.push(record(state, "dispel", { cardId: card.id, targetId: targets[0].id }));
      break;
    case "023-priest-pain-suppression":
    case "041-druid-barkskin":
    case "047-common-team-protection": {
      const reduction = card.id === "047-common-team-protection" ? 3 : 4;
      if (state.pendingReaction) {
        state.pendingReaction.damageReduction += reduction;
      }
      events.push(record(state, "reaction-defense", { cardId: card.id, amount: reduction }));
      break;
    }
    case "024-priest-shadow-word-death":
      {
        const damage = targets[0].hp <= 5 ? 3 : 2;
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, damage, 0, damageReduction);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: damage }));
      }
      break;
    case "025-warrior-heroic-strike":
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 2, consumeMeleeBonus(sourceHero, targets[0].id, card), damageReduction);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: 2 }));
      break;
    case "026-warrior-mortal-strike":
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 3, consumeMeleeBonus(sourceHero, targets[0].id, card), damageReduction);
      setHealReduction(state, targets[0].id, 2);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: 3 }));
      break;
    case "028-warrior-charge":
      sourceHero.zone = targets[0].zone;
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 1);
      events.push(record(state, "move", { cardId: card.id, heroId: sourceHero.id, toZone: sourceHero.zone }));
      break;
    case "031-warlock-corruption":
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 1, 0, damageReduction);
      state.endOfRoundEffects.push({ type: "damage", sourceSide, sourceHeroId: sourceHero.id, sourceCardId: card.id, targetId: targets[0].id, amount: 1 });
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: 1 }));
      break;
    case "032-warlock-drain-life": {
      const dealt = applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 2);
      const healed = applyHealing(state, sourceHero.id, 2);
      events.push(record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 2 }));
      events.push(record(state, "heal", { cardId: card.id, targetId: sourceHero.id, amount: healed }));
      break;
    }
    case "035-warlock-curse-of-agony":
      applyDamage(state, sourceSide, card.id, sourceHero.id, targets[0].id, 2);
      setHealReduction(state, targets[0].id, 1);
      events.push(record(state, "debuff", { cardId: card.id, targetId: targets[0].id, effect: "damage-heal-reduction", damage: 2, amount: 1 }));
      break;
    case "037-druid-rejuvenation": {
      const bonus = targets[0].zone === "left" || targets[0].zone === "right" ? 1 : 0;
      const healed = applyHealing(state, targets[0].id, 2 + bonus);
      events.push(record(state, "heal", { cardId: card.id, targetId: targets[0].id, amount: healed }));
      break;
    }
    case "038-druid-swiftmend": {
      const bonus = targets[0].damageTakenThisRound ? 1 : 0;
      const healed = applyHealing(state, targets[0].id, 3 + bonus);
      events.push(record(state, "heal", { cardId: card.id, targetId: targets[0].id, amount: healed }));
      break;
    }
    case "042-druid-wild-charge":
    case "044-common-pillar-dance":
    case "048-common-tactical-retreat": {
      const fromZone = targets[0].zone;
      const destination = resolveAdjacentMoveTarget(targets[0], opts.toZone);
      targets[0].zone = destination;
      if (card.id === "042-druid-wild-charge") {
        const enemyFocusTargetId = getPlayer(state, opposite(targets[0].side)).focusTargetId;
        if (enemyFocusTargetId === targets[0].id && fromZone !== destination) applyShield(state, targets[0].id, 1);
      } else if (card.id === "044-common-pillar-dance") {
        const hasEnemyAcrossPillar = enemyHeroIds(state, sourceHero.side).some((enemy) => !canTargetSameOrAdjacent(targets[0], enemy));
        if (hasEnemyAcrossPillar) applyShield(state, targets[0].id, 1);
      }
      events.push(record(state, "move", { cardId: card.id, heroId: targets[0].id, toZone: targets[0].zone }));
      break;
    }
    case "045-common-focus-mark": {
      const player = getPlayer(state, sourceSide);
      player.focusTargetId = targets[0].id;
      events.push(record(state, "focus", { cardId: card.id, targetId: targets[0].id }));
      break;
    }
    case "046-common-arena-insignia": {
      const target = targets[0];
      target.pendingHardControl = 0;
      target.hardControlSourceId = null;
      target.decay = Math.min(2, target.decay + 1);
      events.push(record(state, "cleanse", { cardId: card.id, targetId: target.id }));
      break;
    }
    case "050-common-hold-the-line":
      for (const target of targets.slice(0, 2)) {
        applyShield(state, target.id, 1);
      }
      events.push(record(state, "shield", { cardId: card.id, targetIds: targets.slice(0, 2).map((t) => t.id), amount: 1 }));
      break;
    case "043-common-fake-cast":
      events.push(record(state, "fake-cast", { cardId: card.id, revealedCardId: opts.revealedCardId }));
      break;
    default:
      events.push(record(state, "unimplemented", { cardId: card.id }));
      break;
  }
  return events;
}

function resolvePendingWindowEffect(state: GameState, window: ReactionWindow) {
  if (window.interrupted) {
    return;
  }
  const card = CARD_BY_ID[window.sourceCardId];
  const sourceHero = getHero(state, window.sourceHeroId);
  const targets = window.targetIds.map((id) => getHero(state, id));
  if (card.effectKey === "burst-damage") {
    const damage = card.id === "018-mage-pyroblast" || card.id === "036-warlock-chaos-bolt" ? 5 : 3;
    const dealt = applyDamage(state, sourceHero.side, card.id, sourceHero.id, targets[0].id, damage, window.damageBonus + consumeMeleeBonus(sourceHero, targets[0].id, card), window.damageReduction);
    record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || damage, reactionDamageReduction: window.damageReduction });
    return;
  }
  if (card.effectKey === "spell-damage-soft-control") {
    const dealt = applyDamage(state, sourceHero.side, card.id, sourceHero.id, targets[0].id, 2, window.damageBonus, window.damageReduction);
    applySoftControl(state, sourceHero.id, targets[0].id, { noMove: true });
    record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 2 });
    return;
  }
  if (card.effectKey === "spell-damage-heal") {
    const dealt = applyDamage(state, sourceHero.side, card.id, sourceHero.id, targets[0].id, 2, window.damageBonus, window.damageReduction);
    const healed = applyHealing(state, sourceHero.id, 2);
    record(state, "damage", { cardId: card.id, targetId: targets[0].id, amount: dealt || 2 });
    record(state, "heal", { cardId: card.id, targetId: sourceHero.id, amount: healed });
    return;
  }
  if (card.effectKey === "hard-control") {
    applyCardEffect(state, card, sourceHero, targets, { toZone: window.toZone, revealedCardId: window.revealedCardId, damageReduction: window.damageReduction });
    return;
  }
  if (card.effectKey === "key-move" || card.effectKey === "key-move-shield") {
    applyCardEffect(state, card, sourceHero, targets, { toZone: window.toZone, revealedCardId: window.revealedCardId, damageReduction: window.damageReduction });
    return;
  }
  if (card.effectKey === "spell-damage-heal") {
    applyCardEffect(state, card, sourceHero, targets);
    return;
  }
  if (card.effectKey === "fake-cast") {
    record(state, "fake-cast", { cardId: card.id, revealedCardId: window.revealedCardId });
    return;
  }
  applyCardEffect(state, card, sourceHero, targets, { toZone: window.toZone, revealedCardId: window.revealedCardId, damageReduction: window.damageReduction });
}

function resetPasses(state: GameState) {
  state.endedThisRound = { blue: false, red: false };
}

function nextStartingPlayer(state: GameState) {
  return opposite(state.startingPlayer);
}

function passPriorityToOpponent(state: GameState) {
  if (state.phase !== "finished") {
    state.currentPlayer = opposite(state.currentPlayer);
  }
}

function resolveEndOfRoundEffects(state: GameState) {
  const effects = [...state.endOfRoundEffects];
  state.endOfRoundEffects = [];
  for (const effect of effects) {
    if (effect.type === "damage" && getHero(state, effect.targetId).alive) {
      const dealt = applyDamage(state, effect.sourceSide, effect.sourceCardId, effect.sourceHeroId, effect.targetId, effect.amount);
      record(state, "end-round-damage", { cardId: effect.sourceCardId, targetId: effect.targetId, amount: dealt || effect.amount });
      if (state.phase === "finished") return;
    }
  }
}

function finishActivation(state: GameState, advanceTurn = true) {
  if (!state.activation) return;
  const hero = getHero(state, state.activation.heroId);
  consumeControlAfterActivation(state, hero.id);
  state.activation = null;
  resetPasses(state);
  if (advanceTurn) passPriorityToOpponent(state);
}

function startActivation(state: GameState, heroId: string) {
  state.activation = { heroId, moved: false, playedCard: false };
}

function legalReactionSourceHeroes(state: GameState, side: Side) {
  return Object.values(state.heroes).filter((hero) => hero.side === side && hero.alive);
}

function canRespondWithHero(state: GameState, hero: HeroState) {
  return hero.alive && hero.pendingHardControl === 0 && !hero.nextActivationNoResponse;
}

function windowWouldApplyHardControl(window: ReactionWindow) {
  return CARD_BY_ID[window.sourceCardId]?.effectKey === "hard-control";
}

function validateInterruptResponse(state: GameState, window: ReactionWindow, hero: HeroState, card: CardDef) {
  if (window.kind !== "spell") throw new Error("interrupt only works against spell windows");
  const sourceHero = getHero(state, window.sourceHeroId);
  if (card.id === "009-rogue-kick" || card.id === "027-warrior-pummel") {
    if (!zonesMatch(hero, sourceHero)) throw new Error("melee interrupt requires same zone");
    return;
  }
  if (!canTargetSameOrAdjacent(hero, sourceHero)) throw new Error("interrupt target must be same or adjacent zone");
}

function validateDamageReductionResponse(state: GameState, window: ReactionWindow, hero: HeroState, card: CardDef, targetIds: string[] | undefined) {
  const sourceCard = CARD_BY_ID[window.sourceCardId];
  if (!sourceCard) throw new Error("unknown source card");
  const targetId = targetIds?.[0] ?? window.targetIds[0];
  const target = getHero(state, targetId);
  if (!window.targetIds.includes(target.id)) throw new Error("defense target must be affected by the source card");
  if (target.side !== hero.side) throw new Error("defense target must be friendly");
  if (card.id === "017-mage-ice-barrier") {
    if (target.id !== hero.id || hero.role !== "mage") throw new Error("ice barrier only protects the mage");
    return;
  }
  if (card.id === "041-druid-barkskin") {
    if (hero.role !== "druid") throw new Error("barkskin must be used by druid");
    if (target.id !== hero.id && !zonesMatch(hero, target)) throw new Error("barkskin requires self or same-zone ally");
    return;
  }
  if (card.id === "023-priest-pain-suppression") {
    if (hero.role !== "priest") throw new Error("pain suppression must be used by priest");
    if (!isBurstCard(sourceCard)) throw new Error("pain suppression only reduces burst damage");
    if (!canTargetSameOrAdjacent(hero, target)) throw new Error("pain suppression target must be same or adjacent zone");
    return;
  }
  if (card.id === "047-common-team-protection") {
    if (!isBurstCard(sourceCard)) throw new Error("team protection only reduces burst damage");
    if (!canTargetSameOrAdjacent(hero, target)) throw new Error("team protection target must be same or adjacent zone");
  }
}

function damageReductionAmount(card: CardDef) {
  if (card.id === "047-common-team-protection") return 3;
  if (card.id === "041-druid-barkskin") return 3;
  return 4;
}

function validateInlineDamageDefense(state: GameState, sourceCard: CardDef, sourceHero: HeroState, targetIds: string[], cmd: Extract<Command, { type: "playCard" }>) {
  if (!cmd.defenseCardId && !cmd.defenseSourceHeroId && !cmd.defenseTargetId) return null;
  if (!isOrdinaryDamageCard(sourceCard)) throw new Error("inline defense is only available before ordinary damage");
  if (!cmd.defenseCardId || !cmd.defenseSourceHeroId) throw new Error("inline defense requires defense card and source hero");

  const defenderSide = opposite(sourceHero.side);
  const defenseHero = getHero(state, cmd.defenseSourceHeroId);
  if (defenseHero.side !== defenderSide) throw new Error("defense hero must belong to damaged side");
  if (!canRespondWithHero(state, defenseHero)) throw new Error("defense hero cannot respond");
  if (!legalCardInHand(state, defenderSide, cmd.defenseCardId)) throw new Error(`defense card ${cmd.defenseCardId} not in hand`);
  const defenseCard = CARD_BY_ID[cmd.defenseCardId];
  if (!defenseCard) throw new Error(`unknown card ${cmd.defenseCardId}`);
  if (!canUseCardWithHero(defenseCard, defenseHero)) throw new Error(`hero ${defenseHero.id} cannot use ${defenseCard.id}`);
  if (defenseCard.effectKey !== "damage-reduction") throw new Error("inline defense card must reduce damage");

  const targetId = cmd.defenseTargetId ?? targetIds[0];
  const pseudoWindow: ReactionWindow = {
    id: "inline-damage-defense",
    kind: "burst",
    sourceSide: sourceHero.side,
    sourceHeroId: sourceHero.id,
    sourceCardId: sourceCard.id,
    targetIds,
    stage: "enemy",
    interrupted: false,
    damageBonus: 0,
    damageReduction: 0,
    closed: false,
  };
  validateDamageReductionResponse(state, pseudoWindow, defenseHero, defenseCard, [targetId]);
  if (getPlayer(state, defenderSide).focusAvailable < cardCost(defenseCard)) {
    throw new Error(`not enough focus: need ${cardCost(defenseCard)}, have ${getPlayer(state, defenderSide).focusAvailable}`);
  }
  const reduction = damageReductionAmount(defenseCard);
  return { defenderSide, defenseHero, defenseCard, targetId, reduction };
}

function commitInlineDamageDefense(
  state: GameState,
  sourceCard: CardDef,
  defense: NonNullable<ReturnType<typeof validateInlineDamageDefense>>,
) {
  spendFocus(state, defense.defenderSide, cardCost(defense.defenseCard));
  removeCardFromHand(state, defense.defenderSide, defense.defenseCard.id);
  discardCard(state, defense.defenderSide, defense.defenseCard.id);
  if (defense.defenseCard.id === "017-mage-ice-barrier") defense.defenseHero.nextActivationNoMove = true;
  record(state, "inline-defense", {
    cardId: defense.defenseCard.id,
    heroId: defense.defenseHero.id,
    targetId: defense.targetId,
    sourceCardId: sourceCard.id,
    amount: defense.reduction,
  });
}

function resolveReactionCard(state: GameState, cmd: Extract<Command, { type: "resolveReaction" }>) {
  if (!state.pendingReaction) throw new Error("no pending reaction window");
  const window = state.pendingReaction;
  if (window.closed) throw new Error("reaction window already closed");
  if (cmd.playerId !== (window.stage === "enemy" ? opposite(window.sourceSide) : window.sourceSide)) {
    throw new Error(`it is not ${cmd.playerId}'s reaction slot`);
  }
  const hero = getHero(state, cmd.sourceHeroId);
  if (hero.side !== cmd.playerId) throw new Error("reaction hero must belong to player");

  if (cmd.pass || (!cmd.cardId && !cmd.useTrinket)) {
    record(state, "reaction-pass", { playerId: cmd.playerId, heroId: hero.id, windowId: window.id });
    if (window.stage === "enemy") {
      window.stage = "source";
      return;
    }
    const finished = state.pendingReaction;
    closeReactionWindow(state);
    if (finished) {
      resolvePendingWindowEffect(state, finished);
    }
    finishActivation(state);
    return;
  }

  if (!canRespondWithHero(state, hero)) throw new Error("hero cannot respond");

  if (cmd.useTrinket) {
    if (!hero.trinketAvailable) throw new Error("trinket already used");
    if (!windowWouldApplyHardControl(window)) throw new Error("trinket only works against hard control");
    if (!window.targetIds.includes(hero.id)) throw new Error("trinket user must be the hard-control target");
    hero.trinketAvailable = false;
    hero.pendingHardControl = 0;
    hero.hardControlSourceId = null;
    hero.decay = Math.min(2, hero.decay + 1);
    record(state, "trinket", { heroId: hero.id, windowId: window.id });
    window.interrupted = true;
    closeReactionWindow(state);
    finishActivation(state);
    return;
  }

  if (!cmd.cardId) {
    throw new Error("reaction card required");
  }
  if (!legalCardInHand(state, cmd.playerId, cmd.cardId)) {
    throw new Error(`reaction card ${cmd.cardId} not in hand`);
  }
  const card = CARD_BY_ID[cmd.cardId];
  if (!card) throw new Error(`unknown card ${cmd.cardId}`);
  if (!canUseCardWithHero(card, hero)) throw new Error(`hero ${hero.id} cannot use ${card.id}`);
  if (!isReactionOnlyCard(card)) throw new Error(`card ${card.id} is not a reaction card`);
  if (card.effectKey === "interrupt") {
    assertCardNotOnCooldown(state, cmd.playerId, card.id);
    validateInterruptResponse(state, window, hero, card);
  }
  if (card.effectKey === "damage-reduction") validateDamageReductionResponse(state, window, hero, card, cmd.targetIds);
  if (card.effectKey === "cleanse-control") {
    const targetId = cmd.targetIds?.[0] ?? hero.id;
    if (!windowWouldApplyHardControl(window)) throw new Error("arena insignia only works against hard control");
    if (!window.targetIds.includes(targetId) || targetId !== hero.id) throw new Error("arena insignia target must be self and targeted by hard control");
  }
  spendFocus(state, cmd.playerId, cardCost(card));
  removeCardFromHand(state, cmd.playerId, cmd.cardId);
  discardCard(state, cmd.playerId, cmd.cardId);
  record(state, "reaction-play", { heroId: hero.id, cardId: card.id, windowId: window.id });

  if (card.effectKey === "interrupt") {
    addInterruptCooldown(state, cmd.playerId, card.id, hero.id);
    window.interrupted = true;
    const finished = state.pendingReaction;
    closeReactionWindow(state);
    if (finished) {
      record(state, "interrupted", { cardId: finished.sourceCardId, by: card.id });
      if (finished.sourceCardId === "043-common-fake-cast") {
        drawCards(state, finished.sourceSide, 1);
        record(state, "fake-cast-success", { cardId: finished.sourceCardId, revealedCardId: finished.revealedCardId, by: card.id, drew: 1 });
      }
    }
    finishActivation(state);
    return;
  }
  if (card.effectKey === "damage-reduction") {
    window.damageReduction += damageReductionAmount(card);
    if (card.id === "017-mage-ice-barrier") {
      hero.nextActivationNoMove = true;
    }
    if (window.stage === "enemy") {
      window.stage = "source";
      return;
    }
    const finished = state.pendingReaction;
    closeReactionWindow(state);
    if (finished) {
      resolvePendingWindowEffect(state, finished);
    }
    finishActivation(state);
    return;
  }
  if (card.effectKey === "cleanse-control") {
    hero.pendingHardControl = 0;
    hero.hardControlSourceId = null;
    hero.decay = Math.min(2, hero.decay + 1);
    window.interrupted = true;
    const finished = state.pendingReaction;
    closeReactionWindow(state);
    if (finished) {
      resolvePendingWindowEffect(state, finished);
    }
    finishActivation(state);
    return;
  }
  const finished = state.pendingReaction;
  closeReactionWindow(state);
  if (finished) {
    resolvePendingWindowEffect(state, finished);
  }
  finishActivation(state);
}

function opposite(side: Side): Side {
  return side === "blue" ? "red" : "blue";
}

function executeReactionWindow(state: GameState, cmd: Extract<Command, { type: "resolveReaction" }>) {
  resolveReactionCard(state, cmd);
}

function maybeResolveControlWindowCard(state: GameState, card: CardDef, sourceHero: HeroState, targets: HeroState[]) {
  const windowKind = CONTROL_WINDOW_BY_CARD[card.id];
  if (!windowKind) {
    return { opened: false };
  }
  const window = openReactionWindow(state, windowKind, sourceHero.side, sourceHero.id, card.id, targets.map((target) => target.id));
  return { opened: true, window };
}

function validatePlayCardOptions(card: CardDef, targets: HeroState[], cmd: Extract<Command, { type: "playCard" }>) {
  if (["022-priest-psychic-scream", "042-druid-wild-charge", "044-common-pillar-dance", "048-common-tactical-retreat"].includes(card.id)) {
    resolveAdjacentMoveTarget(targets[0], cmd.toZone);
    return;
  }
  if (cmd.toZone) throw new Error(`card ${card.id} does not accept toZone`);
}

function finalizePendingCard(state: GameState, card: CardDef, sourceHero: HeroState, targets: HeroState[]) {
  if (state.pendingReaction) {
    const window = state.pendingReaction;
    if (window.interrupted) {
      return [];
    }
    if (card.effectKey === "burst-damage" || card.effectKey === "spell-damage-soft-control" || card.effectKey === "hard-control") {
      if (window.damageReduction > 0) {
        // handled by damage application below
      }
    }
    closeReactionWindow(state);
  }
  return applyCardEffect(state, card, sourceHero, targets);
}

function handlePlayCard(state: GameState, cmd: Extract<Command, { type: "playCard" }>) {
  if (state.phase === "finished") throw new Error("game finished");
  if (cmd.playerId !== state.currentPlayer) throw new Error("not your turn");
  const hero = getHero(state, cmd.sourceHeroId);
  if (hero.side !== cmd.playerId) throw new Error("source hero must belong to player");
  if (!hero.alive) throw new Error("source hero is dead");
  if (!state.activation || state.activation.heroId !== hero.id) throw new Error("hero not active");
  if (state.activation.playedCard) throw new Error("activation already played a card");
  if (!legalCardInHand(state, cmd.playerId, cmd.cardId)) throw new Error(`card ${cmd.cardId} not in hand`);
  const card = CARD_BY_ID[cmd.cardId];
  if (!card) throw new Error(`unknown card ${cmd.cardId}`);
  if (!canUseCardWithHero(card, hero)) throw new Error(`hero ${hero.id} cannot use ${card.id}`);
  if (isReactionOnlyCard(card)) throw new Error(`reaction card ${card.id} cannot be played as an active card`);
  if (state.round === 1 && isBurstCard(card)) throw new Error(`burst card ${card.id} cannot be played on round 1`);
  if (hero.nextActivationNoKeyMove && (isMovementWindow(card) || card.effectKey === "key-move" || card.effectKey === "key-move-shield")) {
    throw new Error("hero cannot play key movement this activation");
  }
  const targets = determineCardTargets(state, hero, card, cmd.targetIds);
  validatePlayCardOptions(card, targets, cmd);
  const revealedCardId = card.id === "043-common-fake-cast" ? chooseFakeCastReveal(state, cmd.playerId, hero, cmd.revealedCardId) : undefined;
  if (cmd.revealedCardId && card.id !== "043-common-fake-cast") throw new Error(`card ${card.id} does not accept revealedCardId`);
  const inlineDefense = validateInlineDamageDefense(state, card, hero, targets.map((target) => target.id), cmd);
  spendFocus(state, cmd.playerId, cardCost(card));
  removeCardFromHand(state, cmd.playerId, cmd.cardId);
  discardCard(state, cmd.playerId, cmd.cardId);
  state.activation.playedCard = true;
  if (inlineDefense) commitInlineDamageDefense(state, card, inlineDefense);
  const damageReduction = inlineDefense?.reduction ?? 0;
  record(state, "card-played", { heroId: hero.id, cardId: card.id, targets: targets.map((target) => target.id), toZone: cmd.toZone, revealedCardId });

  if (isSpellWindow(card) || isBurstWindow(card) || isControlWindow(card) || isMovementWindow(card)) {
    if (inlineDefense) throw new Error("inline defense cannot be attached to a reaction-window card");
    openReactionWindow(state, CONTROL_WINDOW_BY_CARD[card.id]!, hero.side, hero.id, card.id, targets.map((target) => target.id), { toZone: cmd.toZone, revealedCardId });
    return;
  }

  applyCardEffect(state, card, hero, targets, { toZone: cmd.toZone, revealedCardId, damageReduction });
  finishActivation(state);
}

function handleMoveHero(state: GameState, cmd: Extract<Command, { type: "moveHero" }>) {
  if (state.phase !== "main") throw new Error("cannot move outside main phase");
  if (cmd.playerId !== state.currentPlayer) throw new Error("not your turn");
  if (!state.activation || state.activation.heroId !== cmd.heroId) throw new Error("hero not active");
  const hero = getHero(state, cmd.heroId);
  if (hero.side !== cmd.playerId) throw new Error("hero side mismatch");
  if (state.activation.moved) throw new Error("already moved");
  if (!hero.alive) throw new Error("dead hero cannot move");
  if (!isAdjacentZone(hero.zone, cmd.toZone)) throw new Error("destination must be adjacent");
  if (hero.nextActivationNoMove) throw new Error("hero cannot move this activation");
  hero.zone = cmd.toZone;
  state.activation.moved = true;
  record(state, "move", { heroId: hero.id, toZone: cmd.toZone });
}

function handleActivateHero(state: GameState, cmd: Extract<Command, { type: "activateHero" }>) {
  if (state.phase !== "main") throw new Error("cannot activate in current phase");
  if (cmd.playerId !== state.currentPlayer) throw new Error("not your turn");
  if (state.activation) throw new Error("activation already open");
  const hero = getHero(state, cmd.heroId);
  if (hero.side !== cmd.playerId) throw new Error("hero side mismatch");
  if (!hero.alive) throw new Error("dead hero cannot activate");
  if (hero.activatedThisRound) throw new Error("hero already activated this round");
  hero.activatedThisRound = true;
  state.activation = { heroId: hero.id, moved: false, playedCard: false };
  record(state, "activate", { heroId: hero.id });
  if (hero.pendingHardControl > 0) {
    consumeControlAfterActivation(state, hero.id);
    state.activation = null;
    resetPasses(state);
    passPriorityToOpponent(state);
    return;
  }
}

function handleTurnEnd(state: GameState, cmd: Extract<Command, { type: "endTurn" | "pass" }>) {
  if (state.pendingReaction) {
    throw new Error("resolve or pass the reaction window first");
  }
  if (cmd.playerId !== state.currentPlayer) throw new Error("not your turn");
  if (state.activation) {
    finishActivation(state);
    record(state, "activation-end", { playerId: cmd.playerId });
    return;
  }
  state.endedThisRound[cmd.playerId] = true;
  const next = opposite(cmd.playerId);
  if (state.endedThisRound[next]) {
    resolveEndOfRoundEffects(state);
    if (state.phase === "finished") return;
    state.phase = "between-rounds";
    state.currentPlayer = nextStartingPlayer(state);
    record(state, "round-end", { round: state.round });
    return;
  }
  state.currentPlayer = next;
  record(state, "turn-pass", { from: cmd.playerId, to: next });
}

function handleStartTurn(state: GameState, cmd: Extract<Command, { type: "startTurn" }>) {
  const nextStart = nextStartingPlayer(state);
  if (cmd.playerId !== nextStart) throw new Error(`next round starts with ${nextStart}`);
  if (state.phase !== "between-rounds") throw new Error("startTurn only available between rounds");
  for (const player of Object.values(state.players)) {
    if (player.hand.length > 7) {
      const discarded = player.hand.splice(7);
      player.discard.push(...discarded);
      record(state, "discard-auto", { playerId: player.side, cardIds: discarded, handSize: player.hand.length });
    }
  }
  state.round += 1;
  state.startingPlayer = nextStart;
  beginRound(state, true);
  state.currentPlayer = state.startingPlayer;
  state.phase = "main";
  record(state, "round-start", { round: state.round });
}

function handleSelectFocusTarget(state: GameState, cmd: Extract<Command, { type: "selectFocusTarget" }>) {
  if (state.phase !== "main") throw new Error("focus target can only be selected during main phase");
  if (state.activation || state.pendingReaction) throw new Error("focus target cannot be selected during an activation or reaction");
  const player = getPlayer(state, cmd.playerId);
  if (player.focusTargetSelectedThisRound) throw new Error("focus target already selected this round");
  const target = getHero(state, cmd.targetId);
  if (!target.alive || target.side === cmd.playerId) throw new Error("focus target must be an alive enemy hero");
  player.focusTargetId = target.id;
  player.focusTargetSelectedThisRound = true;
  player.focusBonusUsed = false;
  record(state, "focus-selected", { playerId: cmd.playerId, targetId: target.id, round: state.round });
}

function clearHardControlWithDecay(state: GameState, hero: HeroState, eventType: "trinket" | "cleanse", payload: Record<string, unknown>) {
  hero.pendingHardControl = 0;
  hero.hardControlSourceId = null;
  hero.decay = Math.min(2, hero.decay + 1);
  record(state, eventType, { heroId: hero.id, ...payload });
}

function handleUseTrinket(state: GameState, cmd: Extract<Command, { type: "useTrinket" }>) {
  if (state.phase !== "main") throw new Error("trinket can only be used in main phase outside reaction windows");
  if (state.pendingReaction) throw new Error("use resolveReaction during reaction windows");
  if (state.activation) throw new Error("trinket must be used before activating a hero");
  if (cmd.playerId !== state.currentPlayer) throw new Error("not your turn");
  const hero = getHero(state, cmd.heroId);
  if (hero.side !== cmd.playerId) throw new Error("hero side mismatch");
  if (hero.pendingHardControl <= 0) throw new Error("hero is not under unresolved hard control");

  if (cmd.cardId) {
    if (cmd.cardId !== "046-common-arena-insignia") throw new Error("only arena insignia can be used as a control-break card");
    if (!legalCardInHand(state, cmd.playerId, cmd.cardId)) throw new Error(`card ${cmd.cardId} not in hand`);
    const card = CARD_BY_ID[cmd.cardId];
    if (!card || !canUseCardWithHero(card, hero)) throw new Error(`hero ${hero.id} cannot use ${cmd.cardId}`);
    spendFocus(state, cmd.playerId, cardCost(card));
    removeCardFromHand(state, cmd.playerId, cmd.cardId);
    discardCard(state, cmd.playerId, cmd.cardId);
    clearHardControlWithDecay(state, hero, "cleanse", { cardId: cmd.cardId, nonWindow: true });
    return;
  }

  if (!hero.trinketAvailable) throw new Error("trinket already used");
  hero.trinketAvailable = false;
  clearHardControlWithDecay(state, hero, "trinket", { nonWindow: true });
}

function handleDiscardCards(state: GameState, cmd: Extract<Command, { type: "discardCards" }>) {
  if (state.phase !== "between-rounds") throw new Error("discard is only available between rounds");
  const player = getPlayer(state, cmd.playerId);
  const required = Math.max(0, player.hand.length - 7);
  if (required === 0) throw new Error("hand is already at or below limit");
  if (cmd.cardIds.length !== required) throw new Error(`must discard exactly ${required} card(s)`);
  for (const cardId of cmd.cardIds) {
    if (!player.hand.includes(cardId)) throw new Error(`card ${cardId} not in hand`);
  }
  for (const cardId of cmd.cardIds) {
    removeCardFromHand(state, cmd.playerId, cardId);
    discardCard(state, cmd.playerId, cardId);
  }
  record(state, "discard", { playerId: cmd.playerId, cardIds: cmd.cardIds, handSize: player.hand.length });
}

export function createInitialGameState(): GameState {
  return buildInitialState();
}

export function getLegalCommands(state: GameState): Command[] {
  if (state.phase === "finished") return [];
  if (state.pendingReaction) {
    const window = state.pendingReaction;
    const responder = window.stage === "enemy" ? opposite(window.sourceSide) : window.sourceSide;
    const passHeroes = legalReactionSourceHeroes(state, responder);
    const heroes = passHeroes.filter((hero) => canRespondWithHero(state, hero));
    const cmds: Command[] = passHeroes.map((hero) => ({ type: "resolveReaction", playerId: responder, sourceHeroId: hero.id, pass: true }));
    for (const hero of heroes) {
      if (hero.trinketAvailable && windowWouldApplyHardControl(window) && window.targetIds.includes(hero.id)) {
        cmds.push({ type: "resolveReaction", playerId: responder, sourceHeroId: hero.id, useTrinket: true });
      }
      for (const cardId of getPlayer(state, responder).hand) {
        const card = CARD_BY_ID[cardId];
        if (!card || !canUseCardWithHero(card, hero)) continue;
        if (!isReactionOnlyCard(card)) continue;
        try {
          if (card.effectKey === "interrupt") {
            assertCardNotOnCooldown(state, responder, card.id);
            validateInterruptResponse(state, window, hero, card);
          }
          if (card.effectKey === "damage-reduction") validateDamageReductionResponse(state, window, hero, card, [window.targetIds[0] ?? hero.id]);
          if (card.effectKey === "cleanse-control" && (!windowWouldApplyHardControl(window) || !window.targetIds.includes(hero.id))) continue;
          cmds.push({ type: "resolveReaction", playerId: responder, sourceHeroId: hero.id, cardId, targetIds: [window.targetIds[0] ?? hero.id] });
        } catch {
          // skip illegal reaction choices
        }
      }
    }
    return cmds;
  }
  if (state.phase === "between-rounds") {
    const discards = Object.values(state.players)
      .filter((player) => player.hand.length > 7)
      .map((player) => ({ type: "discardCards" as const, playerId: player.side, cardIds: player.hand.slice(7) }));
    if (discards.length > 0) return discards;
    return [{ type: "startTurn", playerId: nextStartingPlayer(state) }];
  }
  const cmds: Command[] = [];
  if (!state.activation && !state.pendingReaction) {
    for (const player of Object.values(state.players)) {
      if (player.focusTargetSelectedThisRound) continue;
      for (const target of enemyHeroIds(state, player.side)) {
        cmds.push({ type: "selectFocusTarget", playerId: player.side, targetId: target.id });
      }
    }
  }
  cmds.push({ type: "pass", playerId: state.currentPlayer });
  cmds.push({ type: "endTurn", playerId: state.currentPlayer });
  if (!state.activation) {
    for (const hero of Object.values(state.heroes)) {
      if (hero.side !== state.currentPlayer || !hero.alive || hero.pendingHardControl <= 0) continue;
      if (hero.trinketAvailable) cmds.push({ type: "useTrinket", playerId: state.currentPlayer, heroId: hero.id });
      if (getPlayer(state, state.currentPlayer).hand.includes("046-common-arena-insignia")) {
        cmds.push({ type: "useTrinket", playerId: state.currentPlayer, heroId: hero.id, cardId: "046-common-arena-insignia" });
      }
    }
    for (const hero of Object.values(state.heroes)) {
      if (hero.side === state.currentPlayer && hero.alive && !hero.activatedThisRound) {
        cmds.push({ type: "activateHero", playerId: state.currentPlayer, heroId: hero.id });
      }
    }
    return cmds;
  }
  const hero = getHero(state, state.activation.heroId);
  if (!state.activation.moved && !hero.nextActivationNoMove) {
    for (const zone of ["left", "center", "right"] as ZoneId[]) {
      if (zone !== hero.zone && isAdjacentZone(hero.zone, zone)) {
        cmds.push({ type: "moveHero", playerId: state.currentPlayer, heroId: hero.id, toZone: zone });
      }
    }
  }
  const hand = getPlayer(state, state.currentPlayer).hand;
  for (const cardId of hand) {
    const card = CARD_BY_ID[cardId];
    if (!card || !canUseCardWithHero(card, hero)) continue;
    if (isReactionOnlyCard(card)) continue;
    if (state.round === 1 && isBurstCard(card)) continue;
    if (hero.nextActivationNoKeyMove && (isMovementWindow(card) || card.effectKey === "key-move" || card.effectKey === "key-move-shield")) continue;
    try {
      const targetIds = inferTargetIdsForCard(state, hero, card);
      const toZone = inferToZoneForCard(state, hero, card, targetIds);
      const revealedCardId = card.id === "043-common-fake-cast" ? chooseFakeCastReveal(state, state.currentPlayer, hero) : undefined;
      cmds.push({ type: "playCard", playerId: state.currentPlayer, sourceHeroId: hero.id, cardId, targetIds, toZone, revealedCardId });
    } catch {
      // skip impossible targets
    }
  }
  return cmds;
}

function inferToZoneForCard(state: GameState, hero: HeroState, card: CardDef, targetIds: string[]) {
  if (!["022-priest-psychic-scream", "042-druid-wild-charge", "044-common-pillar-dance", "048-common-tactical-retreat"].includes(card.id)) {
    return undefined;
  }
  const target = getHero(state, targetIds[0]);
  return fallbackAdjacentZone(target.zone);
}

function inferTargetIdsForCard(state: GameState, hero: HeroState, card: CardDef) {
  const enemy = enemyHeroIds(state, hero.side);
  const friendly = sameTeamHeroIds(state, hero.side);
  const firstEnemy = enemy[0];
  const firstFriend = friendly[0];
  switch (card.id) {
    case "020-priest-power-word-shield":
    case "017-mage-ice-barrier":
    case "023-priest-pain-suppression":
    case "041-druid-barkskin":
    case "046-common-arena-insignia":
      return [hero.id];
    case "019-priest-flash-heal":
    case "037-druid-rejuvenation":
    case "038-druid-swiftmend":
    case "044-common-pillar-dance":
    case "047-common-team-protection":
    case "050-common-hold-the-line":
      return [firstFriend?.id ?? hero.id];
    case "043-common-fake-cast":
      return [];
    case "045-common-focus-mark":
      return [firstEnemy?.id ?? hero.id];
    default:
      return [firstEnemy?.id ?? hero.id];
  }
}

export function applyCommand(state: GameState, command: Command): ApplyResult {
  const next = clone(state);
  const events: GameEvent[] = [];
  const errors: string[] = [];
  try {
    switch (command.type) {
      case "activateHero":
        handleActivateHero(next, command);
        break;
      case "moveHero":
        handleMoveHero(next, command);
        break;
      case "playCard":
        handlePlayCard(next, command);
        break;
      case "resolveReaction":
        executeReactionWindow(next, command);
        break;
      case "pass":
      case "endTurn":
        handleTurnEnd(next, command);
        break;
      case "startTurn":
        handleStartTurn(next, command);
        break;
      case "selectFocusTarget":
        handleSelectFocusTarget(next, command);
        break;
      case "useTrinket":
        handleUseTrinket(next, command);
        break;
      case "discardCards":
        handleDiscardCards(next, command);
        break;
      default:
        ((x: never) => x)(command);
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  events.push(...next.log.slice(state.log.length));
  return { state: next, events, errors };
}
