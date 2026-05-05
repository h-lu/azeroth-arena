import type { ZoneId } from "./types";

export interface ZoneDef {
  id: ZoneId;
  label: string;
  adjacent: ZoneId[];
}

export const ZONES: ZoneDef[] = [
  { id: "left", label: "左柱", adjacent: ["center"] },
  { id: "center", label: "中场", adjacent: ["left", "right"] },
  { id: "right", label: "右柱", adjacent: ["center"] },
];

export function isAdjacentZone(from: ZoneId, to: ZoneId) {
  return ZONES.some((zone) => zone.id === from && zone.adjacent.includes(to));
}
