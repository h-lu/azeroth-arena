import type { HeroRole } from "../packages/data/src";

const ASSET_BASE = `${import.meta.env.BASE_URL}assets/azeroth-arena`;

const HERO_CARD_BY_ROLE: Record<HeroRole, string> = {
  rogue: "001-hero-rogue",
  mage: "002-hero-mage",
  priest: "003-hero-priest",
  warrior: "004-hero-warrior",
  warlock: "005-hero-warlock",
  druid: "006-hero-druid",
};

export function cardFaceSrc(cardId: string) {
  return `${ASSET_BASE}/cards/${cardId}.png`;
}

export function heroPortraitSrc(role: HeroRole) {
  return `${ASSET_BASE}/art/${HERO_CARD_BY_ROLE[role]}.png`;
}

