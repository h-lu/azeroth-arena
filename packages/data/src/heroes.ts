import type { HeroDef, HeroRole, Side } from "./types";

export const HERO_DEFS: HeroDef[] = [
  { id: "blue-rogue", name: "盗贼", side: "blue", role: "rogue", faction: "蓝方 RMP", maxHp: 10, defaultZone: "center" },
  { id: "blue-mage", name: "法师", side: "blue", role: "mage", faction: "蓝方 RMP", maxHp: 10, defaultZone: "center" },
  { id: "blue-priest", name: "牧师", side: "blue", role: "priest", faction: "蓝方 RMP", maxHp: 11, defaultZone: "center" },
  { id: "red-warrior", name: "战士", side: "red", role: "warrior", faction: "红方 WLD", maxHp: 13, defaultZone: "center" },
  { id: "red-warlock", name: "术士", side: "red", role: "warlock", faction: "红方 WLD", maxHp: 12, defaultZone: "center" },
  { id: "red-druid", name: "德鲁伊", side: "red", role: "druid", faction: "红方 WLD", maxHp: 11, defaultZone: "center" },
];

export const HERO_HP: Record<HeroRole, number> = {
  rogue: 10,
  mage: 10,
  priest: 11,
  warrior: 13,
  warlock: 12,
  druid: 11,
};

export function getHeroDef(side: Side, role: HeroRole) {
  return HERO_DEFS.find((hero) => hero.side === side && hero.role === role);
}
